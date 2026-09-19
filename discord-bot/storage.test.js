// Run: node --test dist/storage.test.js (after npm run build). In-memory SQLite, no network.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { LearningStorage } = require('./utils/learning/Storage');

test('knowledge is searchable via FTS5 and ranked', () => {
  const s = new LearningStorage(':memory:');
  s.saveKnowledge({ topic: 'buracos negros', query: 'buracos negros', source_url: 'u1', title: 'Buracos negros', summary: 'Um buraco negro é uma região do espaço-tempo. Tudo sobre isso aqui.', day: '2026-09-19' });
  s.saveKnowledge({ topic: 'samba', query: 'samba', source_url: 'u2', title: 'Samba', summary: 'O samba nasceu no Rio de Janeiro.', day: '2026-09-19' });
  const hits = s.searchKnowledge('me explica o que é um buraco negro?');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].url, 'u1');
  assert.deepEqual(s.searchKnowledge('oi'), []);
  assert.deepEqual(s.searchKnowledge('tudo bem, e aí, o que tem de interessante para falarmos sobre?'), []);
});

test('chat channels, messages, notes and curiosity persist with caps', () => {
  const s = new LearningStorage(':memory:');
  s.setActive('c1', true);
  assert.deepEqual(s.activeChannels(), ['c1']);
  for (let i = 0; i < 15; i++) s.saveMessage({ id: String(i), channelId: 'c1', authorId: 'a', authorName: 'A', content: `m${i}`, at: Date.now() - 1000 + i });
  const recent = s.recentMessages('c1', 12);
  assert.equal(recent.length, 12);
  assert.equal(recent[0].content, 'm3');
  assert.equal(recent[11].content, 'm14');
  for (let i = 0; i < 25; i++) s.saveNote('c1', 'a', `n${i}`);
  assert.equal(s.getNotes('c1').length, 20);
  for (let i = 0; i < 12; i++) s.pushCuriosity(`tema ${i}`);
  assert.equal(s.curiosityQueue().length, 10);
  assert.equal(s.popCuriosity(), "tema 2");
  s.setActive('c1', false);
  assert.deepEqual(s.activeChannels(), []);
  assert.equal(s.recentMessages('c1').length, 0);
});
