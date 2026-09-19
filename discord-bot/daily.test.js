// Run: node --test dist/daily.test.js (after npm run build). HTML fixtures only, no network.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseCalendarr, parseWikipedia, mergeItems, buildEmbeds } = require('./utils/daily/commemorative');

const li = (attr, day, name) => `<li ${attr} class="calendar-list-holiday-box-list-item"><div class="list-holiday-dayweek"><span class="list-holiday-dayweek-wrapper">${day} Sáb</span></div><div class="list-holiday-title"><a class="holiday-name" href="/x/">${name}</a></div></li>`;
const calendarr = `<div class="calendar-list-holiday-box-subtitle" id="para-ago"><span>Agosto</span></div><ul>${li('data-other', 19, 'Dia do Agosto')}</ul>
<div class="calendar-list-holiday-box-subtitle" id="para-set"><span>Setembro</span></div><ul>${li('data-holiday', 7, 'Independência')}${li('data-dayof', 19, 'Dia do Ortopedista')}${li('data-optional', 19, 'Ponto X')}${li('data-other', 19, 'Dia de Falar como um &amp; Pirata')}</ul>`;
const wikipedia = `<div class="mw-heading mw-heading2"><h2 id="Feriados_e_eventos_cíclicos">Feriados e eventos cíclicos</h2></div>
<div class="mw-heading mw-heading3"><h3 id="Brasil">Brasil</h3></div><ul><li>Dia do Ortopedista<sup>[1]</sup></li><li>Dia Nacional do Teatro</li></ul>
<div class="mw-heading mw-heading3"><h3 id="Cristianismo">Cristianismo</h3></div><ul><li>Januário de Benevento</li></ul>
<div class="mw-heading mw-heading2"><h2 id="Outros">Outros calendários</h2></div><ul><li>NÃO ENTRA</li></ul>`;

test('calendarr parser keeps only the requested month/day and tags kinds', () => {
  const items = parseCalendarr(calendarr, 9, 19);
  assert.deepEqual(items, [
    { name: 'Dia do Ortopedista', kind: 'data' },
    { name: 'Ponto X', kind: 'facultativo' },
    { name: 'Dia de Falar como um & Pirata', kind: 'data' },
  ]);
  assert.deepEqual(parseCalendarr(calendarr, 9, 7), [{ name: 'Independência', kind: 'feriado' }]);
});

test('wikipedia parser reads the holidays section only, footnotes stripped', () => {
  assert.deepEqual(parseWikipedia(wikipedia), [
    { name: 'Dia do Ortopedista', kind: 'data' },
    { name: 'Dia Nacional do Teatro', kind: 'data' },
    { name: 'Januário de Benevento', kind: 'santo' },
  ]);
});

test('merge dedupes by normalized name and embeds stay under Discord limits', () => {
  const merged = mergeItems(parseCalendarr(calendarr, 9, 19), parseWikipedia(wikipedia));
  assert.equal(merged.filter(i => i.name === 'Dia do Ortopedista').length, 1);
  assert.equal(merged.length, 5);
  const many = Array.from({ length: 300 }, (_, i) => ({ name: `Dia número ${i} com nome bem comprido para estourar`, kind: 'data' }));
  const embeds = buildEmbeds({ day: 19, month: 9, weekday: 'sábado' }, many);
  assert.ok(embeds.length > 1);
  for (const e of embeds) assert.ok(e.data.description.length <= 4096);
  assert.equal(buildEmbeds({ day: 1, month: 1, weekday: 'x' }, [])[0].data.description, 'Nenhuma data comemorativa encontrada hoje. Dia livre!');
});
