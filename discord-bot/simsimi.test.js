// Run: node simsimi.test.js (no Discord or NVIDIA calls).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function load(file, dependencies, extra = {}) {
  const module = { exports: {} };
  const scope = { module, exports: module.exports, require: name => dependencies[name],
    console: { log() {}, warn() {}, error() {} }, ...extra };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, file), 'utf8'), scope);
  return module.exports;
}
const answer = (text = 'Oi!', overrides = {}) => JSON.stringify({
  action: 'reply', reason: 'addressed', tone: 'neutral', depth: 'short', text, ...overrides,
});
function harness(respond = async () => answer(), { storage = null } = {}) {
  let now = Date.now(), sequence = 0;
  const state = load('simsimiState.js', {});
  if (storage) state.init(storage);
  const calls = [], sent = [], typing = [], searches = [];
  state.add('channel');
  const handler = load('events/messageCreate.js', {
    'discord.js': { Events: { MessageCreate: 'messageCreate' } },
    '../simsimiState.js': state,
    '../utils/ai/nvidiaClient': { chat: async options => { calls.push(options); return respond(options); },
      extractJson: require('./utils/ai/nvidiaClient').extractJson },
    '../utils/ai/prompts': require('./utils/ai/prompts'),
    '../utils/ai/config': { getConfig: () => ({ apiKey: 'test', textModel: 'test', chatModels: ['test'] }) },
    '../utils/learning/SearchProvider': { UnifiedSearchProvider: class {
      async searchForTopic(q) { searches.push(q); return [{ url: 'https://ex.invalid/1', title: 'Fonte', snippet: 'trecho' }]; } } },
    '../utils/learning/Fetcher': { PageFetcher: class {
      async fetch(url) { return { url, title: 'Fonte', text: 'conteúdo da página '.repeat(300) }; } } },
  }, { Date: { now: () => now } });
  const message = (content, options = {}) => ({
    id: String(++sequence), content, createdTimestamp: now,
    author: { id: 'user', username: 'Pessoa', bot: false },
    client: { user: { id: 'bot' } },
    channel: { id: 'channel', sendTyping: async () => typing.push(true) },
    mentions: { users: new Map(), repliedUser: null },
    reply: async payload => { sent.push(payload); return { id: `sent-${sequence}` }; },
    ...options,
  });
  return { state, calls, sent, typing, searches, message, run: m => handler.execute(m), advance: ms => now += ms };
}

test('noise never reaches NVIDIA or sends typing', async () => {
  const h = harness();
  for (const text of ['kkkkkk', 'https://tenor.com/view/gif', '😂😂', '/help', '!ping', '<@someone>']) {
    await h.run(h.message(text)); h.advance(60000);
  }
  assert.equal(h.calls.length, 0);
  assert.equal(h.typing.length, 0);
});

test('silence and malformed decisions never become public replies', async () => {
  for (const output of [JSON.stringify({action: 'silence', reason: 'no_value'}), 'internal analysis',
    answer('oi', { tone: 'hostile' }), answer('', {}), answer('oi', {reason: 'invented'})]) {
    const h = harness(async () => output);
    await h.run(h.message('simsimi, tudo bem?'));
    assert.equal(h.sent.length, 0, output);
    assert.equal(h.typing.length, 0);
  }
});

test('reply contains only final text and disables mentions', async () => {
  const h = harness(async () => answer('Olá @everyone <@123>'));
  await h.run(h.message('simsimi, oi'));
  assert.equal(h.sent[0].content, 'Olá @everyone <@123>');
  assert.equal(JSON.stringify(h.sent[0].allowedMentions), JSON.stringify({parse: [], repliedUser: false}));
});

test('conversation retains authors and full questions; expires after inactivity', async () => {
  const h = harness();
  await h.run(h.message('simsimi, explica ' + 'x'.repeat(600)));
  h.advance(5000);
  await h.run(h.message('e por quê?'));
  const input = JSON.parse(h.calls[1].messages[1].content);
  assert.ok(input.history.some(m => m.content.includes('x'.repeat(600))));
  assert.ok(input.history.some(m => m.authorId === 'bot' && m.content === 'Oi!'));
  assert.equal(input.direct, true);
  h.advance(3 * 3600000);
  await h.run(h.message('simsimi, novo assunto'));
  assert.equal(JSON.parse(h.calls[2].messages[1].content).history.length, 1);
});

test('conversation between other users is not treated as a direct follow-up', async () => {
  const h = harness();
  await h.run(h.message('simsimi, oi'));
  h.advance(5000);
  await h.run(h.message('<@other> explica melhor?', {
    mentions: { users: new Map([['other', {}]]), repliedUser: {id: 'other'} },
    reference: { messageId: 'other-message' },
  }));
  assert.equal(h.calls.length, 1);
});

test('one generation per channel; newest direct question replaces obsolete reply', async () => {
  let finish;
  const h = harness(() => h.calls.length === 1 ? new Promise(resolve => { finish = resolve; }) : Promise.resolve(answer('nova')));
  const first = h.run(h.message('simsimi, pergunta antiga'));
  await Promise.resolve();
  h.advance(5000);
  await h.run(h.message('simsimi, correção: pergunta nova'));
  assert.equal(h.calls.length, 1);
  finish(answer('antiga'));
  await first;
  assert.equal(h.calls.length, 2);
  assert.equal(h.sent.length, 1);
  assert.equal(h.sent[0].content, 'nova');
});

test('stop request invalidates in-flight reply and pauses participation', async () => {
  let finish;
  const h = harness(() => new Promise(resolve => { finish = resolve; }));
  const first = h.run(h.message('simsimi, oi'));
  await Promise.resolve();
  await h.run(h.message('bot, cala a boca'));
  finish(answer());
  await first;
  h.advance(60000);
  await h.run(h.message('simsimi, oi'));
  assert.equal(h.sent.length, 0);
  assert.equal(h.calls.length, 1);
});

test('off/on prevents replies and history from the old session', async () => {
  let finish;
  const h = harness(() => new Promise(resolve => { finish = resolve; }));
  const first = h.run(h.message('simsimi, oi'));
  await Promise.resolve();
  h.state.remove('channel'); h.state.add('channel');
  finish(answer());
  await first;
  assert.equal(h.sent.length, 0);
});

test('bare stop during first generation cancels its reply', async () => {
  let finish;
  const h = harness(() => new Promise(resolve => { finish = resolve; }));
  const first = h.run(h.message('simsimi, oi'));
  await h.run(h.message('fica quieto'));
  finish(answer()); await first;
  assert.equal(h.sent.length, 0);
});

test('direct yes/no acknowledgments remain usable as conversation context', async () => {
  const h = harness();
  await h.run(h.message('simsimi, explica?'));
  for (const text of ['sim', 'não']) {
    h.advance(5000); await h.run(h.message(text));
    assert.equal(JSON.parse(h.calls.at(-1).messages[1].content).history.at(-1).content, text);
  }
});

test('model-recognized stop pauses subsequent participation too', async () => {
  const h = harness(async () => JSON.stringify({action: 'silence', reason: 'stop'}));
  await h.run(h.message('simsimi, prefiro seguir esta conversa sem sua participação'));
  h.advance(60000);
  await h.run(h.message('simsimi, assunto novo'));
  assert.equal(h.calls.length, 1);
});

test('queued question survives history pressure and new session waits for old worker', async () => {
  let finish;
  const h = harness(() => h.calls.length === 1 ? new Promise(resolve => { finish = resolve; }) : Promise.resolve(answer()));
  const first = h.run(h.message('simsimi, antiga'));
  h.state.remove('channel'); h.state.add('channel');
  const current = h.message('simsimi, pergunta importante');
  await h.run(current);
  for (let i = 0; i < 13; i++) {
    await h.run(h.message('conversa de terceiros sem relação com o bot atual', {
      author: {id: 'other', username: 'Outra', bot: false},
      mentions: { users: new Map([['third', {}]]), repliedUser: {id: 'third'} },
      // Avoid explicit bot addressing in this background conversation.
      content: 'conversa de terceiros sobre o campeonato',
    }));
  }
  assert.equal(h.calls.length, 1);
  finish(answer('antiga')); await first;
  const request = JSON.parse(h.calls[1].messages[1].content);
  assert.ok(request.history.some(m => m.id === current.id && m.content === current.content));
  assert.ok(!request.history.some(m => m.content === 'simsimi, antiga'));
  assert.ok(request.history.length <= 12);
  assert.equal(h.sent.length, 1);
});

test('stale generation is discarded; errors release channel for later requests', async () => {
  const h = harness(async () => { h.advance(91000); return answer(); });
  await h.run(h.message('simsimi, oi'));
  assert.equal(h.sent.length, 0);
  let fail = true;
  const recovering = harness(async () => { if (fail) throw new Error('timeout'); return answer(); });
  await recovering.run(recovering.message('simsimi, oi'));
  fail = false; recovering.advance(5000);
  await recovering.run(recovering.message('simsimi, voltou?'));
  assert.equal(recovering.sent.length, 1);
});

test('NVIDIA chat and vision reject reasoning-only and truncated completions', async () => {
  for (const method of ['chat', 'vision']) {
    for (const result of [
      {message: {content: null, reasoning_content: 'PRIVATE'}, finish_reason: 'stop'},
      {message: {content: null, reasoning: 'PRIVATE'}, finish_reason: 'stop'},
      {message: {content: 'cut off'}, finish_reason: 'length'},
    ]) {
      const client = load('utils/ai/nvidiaClient.js', {
        './config': { getConfig: () => ({baseUrl: 'https://example.invalid', textModel: 'm'}), assertApiKey: () => 'test' },
      }, { AbortController, setTimeout, clearTimeout,
        fetch: async () => ({ok: true, text: async () => JSON.stringify({choices: [result]})}),
      });
      await assert.rejects(() => method === 'chat' ? client.chat({messages: []}) : client.vision('test', '', 'image/png'));
    }
  }
});

test('lone greeting without addressing reaches the model once a minute', async () => {
  const h = harness();
  await h.run(h.message('oi'));
  assert.equal(h.calls.length, 1);
  assert.equal(JSON.parse(h.calls[0].messages[1].content).direct, false);
  h.advance(30000);
  await h.run(h.message('alguém aí?', { author: { id: 'other', username: 'Outra', bot: false } }));
  assert.equal(h.calls.length, 1);
});

test('search decision runs one web round and feeds results into a second call', async () => {
  const h = harness(async () => h.calls.length === 1
    ? JSON.stringify({ action: 'search', reason: 'addressed', query: 'cotação dólar hoje' })
    : answer('Segundo o que achei, R$ 5,20.', { depth: 'medium' }));
  await h.run(h.message('simsimi, quanto tá o dólar hoje?'));
  assert.deepEqual(h.searches, ['cotação dólar hoje']);
  const second = JSON.parse(h.calls[1].messages[1].content);
  assert.equal(second.searched, 'cotação dólar hoje');
  assert.equal(second.search_results[0].url, 'https://ex.invalid/1');
  assert.ok(second.search_results[0].text.length <= 3000);
  assert.equal(h.sent[0].content, 'Segundo o que achei, R$ 5,20.');
});

test('a second search in the same turn is rejected and nothing is sent', async () => {
  const h = harness(async () => JSON.stringify({ action: 'search', reason: 'addressed', query: 'x y' }));
  await h.run(h.message('simsimi, pesquisa isso'));
  assert.equal(h.searches.length, 1);
  assert.equal(h.calls.length, 2);
  assert.equal(h.sent.length, 0);
});

test('fenced and reasoning-wrapped JSON decisions are still accepted', async () => {
  const h = harness(async () => '<think>pensando</think>\n```json\n' + answer('Certo!') + '\n```');
  await h.run(h.message('simsimi, oi'));
  assert.equal(h.sent[0].content, 'Certo!');
});

test('storage: knowledge and notes go in, notes and messages persist, channel survives restart', async () => {
  const { LearningStorage } = require('./utils/learning/Storage');
  const storage = new LearningStorage(':memory:');
  storage.saveKnowledge({ topic: 'samba', query: 'samba', source_url: 'u', title: 'Samba', summary: 'O samba nasceu no Rio.', day: '2026-09-19' });
  const h = harness(async () => answer('Li que o samba nasceu no Rio.', { note: 'Pessoa gosta de samba' }), { storage });
  await h.run(h.message('simsimi, me fala do samba'));
  const input = JSON.parse(h.calls[0].messages[1].content);
  assert.equal(input.knowledge[0].url, 'u');
  assert.deepEqual(input.notes, []);
  assert.deepEqual(storage.getNotes('channel'), ['Pessoa gosta de samba']);
  assert.equal(storage.recentMessages('channel').length, 2);
  // "restart": fresh state hydrated from storage keeps the channel active with its history.
  const again = harness(async () => answer(), { storage });
  assert.ok(again.state.has('channel'));
  assert.equal(again.state.get('channel').history.length, 2);
  await again.run(again.message('simsimi, continua'));
  assert.deepEqual(JSON.parse(again.calls[0].messages[1].content).notes, ['Pessoa gosta de samba']);
  again.state.remove('channel');
  assert.deepEqual(storage.activeChannels(), []);
});
