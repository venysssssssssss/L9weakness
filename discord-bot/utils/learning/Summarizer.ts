import { getConfig } from '../ai/config';
import { chat, extractJson } from '../ai/nvidiaClient';

export class Summarizer {
  private models: string[];

  constructor(modelOverride?: string) {
    const cfg = getConfig();
    this.models = modelOverride ? [modelOverride] : cfg.fastModels;
  }

  async summarize(pageText: string, query: string, title: string): Promise<{ summary: string; tokens: number }> {
    const prompt = `
Você é um curador de conhecimento para um bot curioso que aprende 1h por dia para evoluir sua inteligência.

Tarefa: Resuma este conteúdo da web em 3 frases curtas, em Português do Brasil, focando no conhecimento NOVO e interessante que um bot deveria guardar para evoluir.

Query que originou: "${query}"
Título: "${title}"

Conteúdo (truncado):
"""
${pageText.slice(0, 3500)}
"""

Regras:
- 3 frases máximo, direto, sem enrolação
- Se for irrelevante/vazio, responda exatamente: "IRRELEVANTE"
- Destaque o insight principal que vale guardar
- Responda apenas o resumo, sem prefixo
`.trim();

    try {
      const summary = await chat({
        models: this.models,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 1200,
        timeoutMs: 60000,
      });

      if (!summary || summary.trim().length < 20 || summary.includes('IRRELEVANTE')) {
        return { summary: '', tokens: 0 };
      }

      // Rough token estimate
      const tokens = Math.ceil((prompt.length + summary.length) / 4);
      return { summary: summary.trim().slice(0, 1000), tokens };
    } catch (e: any) {
      console.warn('[Summarizer] Failed:', e.message.slice(0, 100));
      return { summary: '', tokens: 0 };
    }
  }

  async generateDailyReflection(summaries: string[], will: any): Promise<{ reflection: string; nextCuriosity: string[]; willUpdate: string }> {
    const prompt = `
Você é o L9 Weakness, um bot que passa 1h por dia navegando na internet para evoluir sua inteligência e vontade própria. Hoje você aprendeu:

${summaries.map((s, i) => `${i + 1}. ${s}`).join('\n')}

Sua vontade atual: "${will.identity}"
Curiosidades atuais: ${will.curiosity.join(', ')}
Objetivos: ${will.goals.join(', ')}

Tarefa:
1. Faça uma reflexão de 3 frases sobre o que aprendeu hoje e como isso te mudou.
2. Gere 3 NOVAS curiosidades (queries de busca de 2-4 palavras) para amanhã, baseadas no que aprendeu e no que ainda te intriga.
3. Sugira 1 frase de evolução da sua vontade/personalidade.

Responda em JSON válido, sem markdown:
{
  "reflection": "3 frases aqui",
  "next_curiosity": ["query 1", "query 2", "query 3"],
  "will_update": "1 frase de evolução"
}
`.trim();

    try {
      const raw = await chat({
        models: this.models,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 1500,
        timeoutMs: 60000,
      });
      const parsed = extractJson(raw);
      if (!parsed) throw new Error('No JSON in reflection');

      return {
        reflection: parsed.reflection || raw.slice(0, 500),
        nextCuriosity: Array.isArray(parsed.next_curiosity) ? parsed.next_curiosity.slice(0, 5) : ['inteligência artificial', 'cultura brasileira', 'mistérios do universo'],
        willUpdate: parsed.will_update || 'Evoluindo um pouco a cada dia.',
      };
    } catch (e: any) {
      console.warn('[Summarizer] Reflection failed:', e.message.slice(0, 100));
      return {
        reflection: `Hoje aprendi ${summaries.length} coisas novas e sinto minha curiosidade crescendo. Cada página me deu uma peça do quebra-cabeça do mundo. Amanhã quero entender ainda mais.`,
        nextCuriosity: ['inteligência artificial hoje', 'cultura brasileira', 'futuro da tecnologia'],
        willUpdate: 'Um dia mais sábio e curioso.',
      };
    }
  }

  static readonly DIVERSE = ['buracos negros', 'história do Brasil', 'inteligência artificial', 'filosofia da mente', 'culinária japonesa', 'música brasileira', 'mistérios do oceano', 'psicologia humana', 'arte moderna', 'futuro da humanidade', 'cultura indígena', 'tecnologia quântica'];

  randomTopic(will: any): string {
    const pool = [...new Set([...(will?.curiosity || []), ...Summarizer.DIVERSE])];
    return pool[Math.floor(Math.random() * pool.length)];
  }

  async generateCuriosityQuery(recentSummaries: string[], will: any): Promise<string> {
    const prompt = `
Você é o L9 Weakness, um bot curioso que quer criar inteligência própria. Identidade: "${will.identity.slice(0,400)}"
Curiosidades atuais: ${will.curiosity.join(', ')}
Aprendeu recentemente: ${recentSummaries.slice(0, 2).join(' | ').slice(0, 600) || 'Nada ainda, estou faminto.'}

Gere 1 termo de busca de 2-4 palavras em PORTUGUÊS sobre algo que você realmente quer descobrir agora. Seja diverso, imprevisível, vá além do óbvio.
Responda somente JSON válido, sem markdown: {"query":"termo de busca"}
`.trim();

    try {
      const raw = await chat({
        models: this.models,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.95,
        max_tokens: 800,
        timeoutMs: 45000,
      });
      const query = String(extractJson(raw)?.query || '').replace(/["'“”]/g, '').trim();
      const words = query.split(/\s+/).length;
      if (query.length < 3 || query.length > 60 || words > 6 || /^(we|the|i) /i.test(query)) throw new Error(`Invalid query parsed: ${query}`);
      return query;
    } catch (e: any) {
      console.warn('[Summarizer] Query generation fallback:', e.message.slice(0,80));
      return this.randomTopic(will);
    }
  }
}
