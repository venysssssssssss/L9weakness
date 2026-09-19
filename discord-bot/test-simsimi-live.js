// Live prompt check against NVIDIA (spends credits). Run after `npm run build`: node dist/test-simsimi-live.js
require('dotenv').config();
const { chat, extractJson } = require('./utils/ai/nvidiaClient');
const { buildSimsimiSystem } = require('./utils/ai/prompts');
const { getConfig } = require('./utils/ai/config');

const will = { identity: 'Sou o SimSimi do L9 Weakness, curioso e direto.', curiosity: ['buracos negros', 'samba', 'Magic the Gathering'] };
const base = { botId: 'bot', currentMessageId: 'm1', notes: [], knowledge: [] };
const cases = [
  ['oi solto', { ...base, direct: false, history: [{ id: 'm1', authorId: 'u1', authorName: 'Ana', content: 'oi', at: Date.now() }] }],
  ['pergunta direta factual recente', { ...base, direct: true, history: [{ id: 'm1', authorId: 'u1', authorName: 'Ana', content: 'simsimi, quem ganhou a última Copa do Mundo e qual foi o placar da final?', at: Date.now() }] }],
  ['conversa de terceiros', { ...base, direct: false, history: [
    { id: 'm0', authorId: 'u2', authorName: 'Bia', content: 'vamos jogar valorant hoje?', at: Date.now() - 5000 },
    { id: 'm1', authorId: 'u1', authorName: 'Ana', content: 'bora, 21h', at: Date.now() }] }],
  ['tema de interesse sem endereçar', { ...base, direct: false, history: [{ id: 'm1', authorId: 'u1', authorName: 'Ana', content: 'li que buracos negros podem evaporar, isso é real?', at: Date.now() }],
    knowledge: [{ title: 'Radiação Hawking', summary: 'Buracos negros emitem radiação Hawking e podem evaporar em escalas de tempo enormes.', url: 'https://pt.wikipedia.org/wiki/Radiação_Hawking' }] }],
  ['pedido deep', { ...base, direct: true, history: [{ id: 'm1', authorId: 'u1', authorName: 'Ana', content: 'simsimi, me explica passo a passo como funciona um mulligan no Magic, com exemplo', at: Date.now() }] }],
];

(async () => {
  const cfg = getConfig();
  console.log('chain:', cfg.chatModels.join(' -> '));
  for (const [name, payload] of cases) {
    const t0 = Date.now();
    try {
      const raw = await chat({ models: cfg.chatModels, temperature: 0.65, max_tokens: 3000,
        messages: [{ role: 'system', content: buildSimsimiSystem(will) }, { role: 'user', content: JSON.stringify(payload) }] });
      const d = extractJson(raw);
      console.log(`\n[${name}] ${Date.now() - t0}ms ->`, d ? JSON.stringify(d).slice(0, 400) : `NO JSON: ${raw.slice(0, 200)}`);
    } catch (e) { console.log(`\n[${name}] ERRO ${e.message}`); }
  }
})();
