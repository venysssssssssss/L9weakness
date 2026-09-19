import * as cheerio from 'cheerio';
import cron from 'node-cron';
import { ChannelType, Client, EmbedBuilder } from 'discord.js';

export interface DayItem { name: string; kind: 'feriado' | 'facultativo' | 'data' | 'santo' }

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const ABBR = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const UA = 'Mozilla/5.0 (X11; Linux x86_64) Firefox/121.0 L9WeaknessBot/1.0';
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

// calendarr.com year list: <div class="calendar-list-holiday-box-subtitle" id="para-set"> then <li data-holiday|data-optional|data-other|data-dayof>
export function parseCalendarr(html: string, month: number, day: number): DayItem[] {
  const $ = cheerio.load(html);
  const items: DayItem[] = [];
  let current = '';
  $('.calendar-list-holiday-box-subtitle, li.calendar-list-holiday-box-list-item').each((_, el) => {
    if ($(el).hasClass('calendar-list-holiday-box-subtitle')) { current = ($(el).attr('id') || '').replace('para-', ''); return; }
    if (current !== ABBR[month - 1]) return;
    const d = parseInt(($(el).find('.list-holiday-dayweek-wrapper').text().match(/\d+/) || [''])[0], 10);
    const name = $(el).find('.holiday-name').first().text().replace(/\s+/g, ' ').trim();
    if (d !== day || !name) return;
    const kind = el.attribs['data-holiday'] !== undefined ? 'feriado' : el.attribs['data-optional'] !== undefined ? 'facultativo' : 'data';
    items.push({ name, kind });
  });
  return items;
}

// pt.wikipedia "D de mês" page: h2 "Feriados e eventos cíclicos" → h3 sections (Brasil, Cristianismo...) with <li>
export function parseWikipedia(html: string): DayItem[] {
  const $ = cheerio.load(html);
  const items: DayItem[] = [];
  const h2 = $('h2[id^="Feriados_e_eventos"]').first();
  if (!h2.length) return items;
  // Live pages wrap the section in <section aria-labelledby=...>; older/fixture markup is flat siblings until the next h2.
  const seq: any[] = [];
  const scope = h2.closest('section');
  if (scope.length) scope.find('h3, li').each((_, e) => { seq.push(e); });
  else {
    let node = h2.closest('.mw-heading').length ? h2.closest('.mw-heading') : h2;
    for (node = node.next(); node.length && !node.is('h2') && !node.find('h2').length; node = node.next())
      node.find('h3, li').addBack('h3, li').each((_, e) => { seq.push(e); });
  }
  let section = '';
  for (const el of seq) {
    if (el.tagName === 'h3') { section = $(el).text().replace(/\[.*?\]/g, '').trim(); continue; }
    if ($(el).find('li').length) continue; // keep leaf items only
    const name = $(el).text().replace(/\[\d+\]/g, '').replace(/\s+/g, ' ').trim();
    if (name) items.push({ name, kind: /crist|santo|religi/i.test(section) ? 'santo' : 'data' });
  }
  return items;
}

export function mergeItems(...lists: DayItem[][]): DayItem[] {
  const seen = new Set<string>();
  const out: DayItem[] = [];
  for (const it of lists.flat()) {
    const key = norm(it.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}

async function get(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'pt-BR' }, signal: AbortSignal.timeout(25000) });
  if (!res.ok) throw new Error(`${url} HTTP ${res.status}`);
  return res.text();
}

// ponytail: one cache entry keyed by YYYY-MM-DD; both sources fetched at most once per day.
let cache: { key: string; items: DayItem[] } | null = null;

export async function commemorativeFor(date: { year: number; month: number; day: number }): Promise<DayItem[]> {
  const key = `${date.year}-${date.month}-${date.day}`;
  if (cache?.key === key && cache.items.length) return cache.items;
  const [cal, wiki] = await Promise.allSettled([
    get(`https://www.calendarr.com/brasil/datas-comemorativas-${date.year}/`).then(h => parseCalendarr(h, date.month, date.day)),
    get(`https://pt.wikipedia.org/wiki/${date.day}_de_${encodeURIComponent(MONTHS[date.month - 1])}`).then(parseWikipedia),
  ]);
  for (const r of [cal, wiki]) if (r.status === 'rejected') console.warn('[Hoje] fonte falhou:', String(r.reason).slice(0, 120));
  const items = mergeItems(cal.status === 'fulfilled' ? cal.value : [], wiki.status === 'fulfilled' ? wiki.value : []);
  cache = { key, items };
  return items;
}

export function todayIn(tz: string): { year: number; month: number; day: number; weekday: string } {
  const [year, month, day] = new Date().toLocaleDateString('en-CA', { timeZone: tz }).split('-').map(Number);
  const weekday = new Date().toLocaleDateString('pt-BR', { weekday: 'long', timeZone: tz });
  return { year, month, day, weekday };
}

const ICON: Record<DayItem['kind'], string> = { feriado: '🎉', facultativo: '🟡', data: '📌', santo: '✝️' };

export function buildEmbeds(date: { day: number; month: number; weekday: string }, items: DayItem[]): EmbedBuilder[] {
  const title = `📅 Hoje é ${date.day} de ${MONTHS[date.month - 1]} (${date.weekday})`;
  const order: DayItem['kind'][] = ['feriado', 'facultativo', 'data', 'santo'];
  const lines = order.flatMap(k => items.filter(i => i.kind === k).map(i => `${ICON[k]} ${i.name}`));
  if (!lines.length) lines.push('Nenhuma data comemorativa encontrada hoje. Dia livre!');
  const chunks: string[] = [];
  for (const line of lines) {
    if (!chunks.length || (chunks[chunks.length - 1] + '\n' + line).length > 4000) chunks.push(line);
    else chunks[chunks.length - 1] += '\n' + line;
  }
  return chunks.map((desc, i) => new EmbedBuilder()
    .setTitle(i === 0 ? title : `${title} (cont.)`)
    .setDescription(desc)
    .setColor(0xF1C40F)
    .setFooter({ text: `${items.length} datas • fontes: calendarr.com + Wikipédia` }));
}

export async function todayEmbeds(): Promise<EmbedBuilder[]> {
  const tz = process.env.DAILY_DATES_TZ || 'America/Sao_Paulo';
  const date = todayIn(tz);
  return buildEmbeds(date, await commemorativeFor(date));
}

export function startDailyDatesScheduler(client: Client): void {
  const expr = process.env.DAILY_DATES_CRON || '0 22 * * *';
  const tz = process.env.DAILY_DATES_TZ || 'America/Sao_Paulo';
  const name = process.env.DAILY_DATES_CHANNEL || 'general';
  const id = process.env.DAILY_DATES_CHANNEL_ID;
  if (!cron.validate(expr)) { console.error(`[Hoje] cron inválido ${expr}`); return; }
  cron.schedule(expr, async () => {
    try {
      const channel: any = id ? await client.channels.fetch(id)
        : client.channels.cache.find(c => c.type === ChannelType.GuildText && (c as any).name === name);
      if (!channel?.isTextBased()) { console.warn(`[Hoje] canal "${id || name}" não encontrado`); return; }
      const embeds = await todayEmbeds();
      for (const embed of embeds) await channel.send({ embeds: [embed] });
      console.log(`[Hoje] enviado em #${channel.name} (${embeds.length} embed(s))`);
    } catch (e: any) {
      console.error('[Hoje] falha:', e.message);
    }
  }, { timezone: tz });
  console.log(`[Hoje] 📅 datas comemorativas em cron "${expr}" ${tz} → #${id || name}`);
}
