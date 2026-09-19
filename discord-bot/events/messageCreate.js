const { Events } = require('discord.js');
const simsimiState = require('../simsimiState.js');
const { chat, extractJson } = require('../utils/ai/nvidiaClient');
const { buildSimsimiSystem } = require('../utils/ai/prompts');
const { getConfig } = require('../utils/ai/config');
const { UnifiedSearchProvider } = require('../utils/learning/SearchProvider');
const { PageFetcher } = require('../utils/learning/Fetcher');

// Separate from sessions so off/on cannot start a second concurrent generation.
const workers = new Set();
const HISTORY_TTL = 2 * 3600000;
const PAUSE_MS = 10 * 60000;
const reasons = ['addressed', 'useful', 'banter', 'interest', 'sensitive', 'not_addressed', 'no_value', 'stop'];
const search = new UnifiedSearchProvider();
const fetcher = new PageFetcher();
const log = (channelId, reason) => console.log(`[SimSimi] canal=${channelId} decisão=${reason}`);

function remember(session, entry) {
    session.history = session.history.filter(item => Date.now() - item.at < HISTORY_TTL);
    session.history.push(entry);
    session.history = session.history.slice(-12);
}

function pause(session) {
    session.pausedUntil = Date.now() + PAUSE_MS;
    session.pending = null;
    session.history = [];
    session.revision++;
}

function decision(raw) {
    const value = extractJson(raw);
    if (!value || !reasons.includes(value.reason)) return null;
    if (value.action === 'silence') return value;
    if (value.action === 'search') {
        return typeof value.query === 'string' && value.query.trim().length >= 2 && value.query.length <= 200 ? value : null;
    }
    if (value.action !== 'reply' || !['neutral', 'warm', 'playful'].includes(value.tone)
        || !['short', 'medium', 'deep'].includes(value.depth)
        || typeof value.text !== 'string' || !value.text.trim() || value.text.length > 1900) return null;
    if (typeof value.note !== 'string' || !value.note.trim() || value.note.length > 300) delete value.note;
    return value;
}

// ponytail: top 3 results, first 2 pages fetched; internal timeouts (15s search, 8s/page) bound the turn.
async function webSearch(query) {
    const results = (await search.searchForTopic(query)).slice(0, 3);
    const pages = await Promise.all(results.slice(0, 2).map(r => fetcher.fetch(r.url, 8000).catch(() => null)));
    return results.map((r, i) => ({
        title: r.title, url: r.url, snippet: r.snippet, text: pages[i] ? pages[i].text.slice(0, 3000) : undefined,
    }));
}

async function drain(channelId) {
    workers.add(channelId);
    try {
        // ponytail: only the latest direct question is queued; use a bounded queue if multi-user loss matters.
        while (true) {
            const session = simsimiState.get(channelId);
            const turn = session?.pending;
            if (!turn) break;
            session.pending = null;
            // Direct turns may include a web search round, so they get a longer staleness window.
            const valid = () => simsimiState.get(channelId) === session
                && Date.now() >= session.pausedUntil && !session.pending
                && Date.now() - turn.at < (turn.direct ? 90000 : 45000)
                && (turn.direct || session.revision === turn.revision);
            if (!valid()) continue;
            try {
                const cfg = getConfig();
                if (!cfg.apiKey) { log(channelId, 'missing_api_key'); continue; }
                session.current = turn;
                session.lastAttempt = Date.now();
                const history = session.history.filter(item => Date.now() - item.at < HISTORY_TTL);
                if (!history.some(item => item.id === turn.entry.id)) {
                    if (history.length === 12) history.shift();
                    history.unshift(turn.entry);
                }
                const storage = simsimiState.storage();
                const system = buildSimsimiSystem(storage ? storage.initWillIfNeeded() : {});
                const payload = {
                    botId: turn.message.client.user.id,
                    direct: turn.direct,
                    currentMessageId: turn.message.id,
                    history,
                    knowledge: storage ? storage.searchKnowledge(turn.message.content, 3) : [],
                    notes: storage ? storage.getNotes(channelId) : [],
                };
                const ask = extra => chat({
                    models: cfg.chatModels,
                    messages: [
                        { role: 'system', content: system },
                        { role: 'user', content: JSON.stringify({ ...payload, ...extra }) },
                    ],
                    temperature: 0.65,
                    max_tokens: 3000,
                });
                let result = decision(await ask({}));
                if (result?.action === 'search') {
                    if (!valid()) { log(channelId, 'obsolete'); continue; }
                    log(channelId, `search:${result.reason}`);
                    const query = result.query.trim();
                    if (storage) storage.pushCuriosity(query);
                    const search_results = await webSearch(query);
                    if (!valid()) { log(channelId, 'obsolete'); continue; }
                    result = decision(await ask({ searched: query, search_results }));
                    if (result?.action === 'search') result = null;
                }
                if (!valid()) { log(channelId, 'obsolete'); continue; }
                if (!result) { log(channelId, 'invalid_decision'); continue; }
                log(channelId, `${result.action}:${result.reason}`);
                if (result.action === 'silence') {
                    if (result.reason === 'stop') pause(session);
                    continue;
                }
                try { await turn.message.channel.sendTyping(); } catch { /* Optional indicator. */ }
                if (!valid()) continue;
                const text = result.text.trim();
                const sent = await turn.message.reply({
                    content: text,
                    allowedMentions: { parse: [], repliedUser: false },
                });
                if (simsimiState.get(channelId) !== session) continue;
                session.lastReply = Date.now();
                session.lastUser = turn.message.author.id;
                const entry = { id: sent.id, authorId: turn.message.client.user.id,
                    authorName: 'SimSimi', content: text, at: Date.now(), replyTo: turn.message.id };
                remember(session, entry);
                if (storage) {
                    storage.saveMessage({ ...entry, channelId });
                    if (result.note) storage.saveNote(channelId, turn.message.author.id, result.note.trim());
                }
            } catch (error) {
                // Do not copy provider errors or user messages into logs.
                log(channelId, error.status === 429 ? 'rate_limit' : 'generation_or_send_failed');
            } finally {
                session.current = null;
            }
        }
    } finally {
        workers.delete(channelId);
    }
}

module.exports = {
    name: Events.MessageCreate,
    async execute(message) {
        if (message.author.bot || !message.content?.trim()) return;
        const channelId = message.channel.id;
        const session = simsimiState.get(channelId);
        if (!session) return;
        const now = Date.now();
        const botId = message.client.user.id;
        const content = message.content.trim();
        const explicit = message.mentions.users.has(botId)
            || message.mentions.repliedUser?.id === botId || /\b(?:simsimi|bot)\b/i.test(content);
        const toOthers = (message.reference && message.mentions.repliedUser?.id !== botId)
            || [...message.mentions.users.keys()].some(id => id !== botId);
        const direct = explicit || (!toOthers && (
            (session.lastUser === message.author.id && now - session.lastReply < 90000)
            || session.current?.message.author.id === message.author.id
            || session.pending?.message.author.id === message.author.id));
        const normalized = content.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
        // ponytail: conservative Portuguese stop phrases; expand with observed missed requests.
        if (direct && /\b(cala (?:a |essa )?boca|fica quiet[oa]|fique quiet[oa]|para de (?:responder|falar)|pare de (?:responder|falar)|nao (?:me )?respond[ae]|me deixa em paz)\b/.test(normalized)) {
            pause(session);
            log(channelId, 'stop_10min');
            return;
        }
        if (now < session.pausedUntil) return log(channelId, 'paused');
        const meaningful = content.replace(/https?:\/\/\S+|<[^>]+>/g, '').trim();
        if (/^[!/]/.test(content) || !/[\p{L}\p{N}]/u.test(meaningful)
            || /^(?:k+|(?:ha)+|(?:he)+|rs+|lol)[\s!.?]*$/i.test(normalized)
            || (!direct && /^(?:ok|blz|sim|nao)[\s!.?]*$/i.test(normalized))) return log(channelId, 'noise');
        session.revision++;
        const entry = { id: message.id, authorId: message.author.id,
            authorName: message.author.username.slice(0, 80), content: content.slice(0, 2000),
            at: now, replyTo: message.reference?.messageId || null };
        remember(session, entry);
        const storage = simsimiState.storage();
        if (storage) storage.saveMessage({ ...entry, channelId });
        // Undirected messages (even a lone "oi") reach the model at most once a minute; it decides whether to join.
        if (!direct && (toOthers || now - session.lastAttempt < 60000)) return log(channelId, 'not_candidate');
        if (!workers.has(channelId) && now - session.lastAttempt < 4000) return log(channelId, 'cooldown');
        if (!direct && workers.has(channelId)) return log(channelId, 'busy');
        session.pending = { message, direct, at: now, revision: session.revision,
            entry: session.history[session.history.length - 1] };
        if (!workers.has(channelId)) await drain(channelId);
    },
};
