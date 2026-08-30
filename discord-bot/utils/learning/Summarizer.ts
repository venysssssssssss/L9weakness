import { getConfig } from '../ai/config';
import { chat } from '../ai/nvidiaClient';

export class Summarizer {
  private model: string;

  constructor(modelOverride?: string) {
    const cfg = getConfig();
    this.model = modelOverride || cfg.textModel;
  }

  async summarize(pageText: string, query: string, title: string): Promise<{ summary: string; tokens: number }> {
    const prompt = `
Você é um curador de conhecimento para um bot curioso que aprende 1h por dia para evoluir sua inteligência.

Tarefa: Resuma este conteúdo da web em 3 frases curtas, em Português do Brasil, focando no conhecimento NOVO e interessante que um bot deveria guardar para evoluir.

Query que originou: "${query}"
Título: "${title}"

Conteúdo (truncado):
"""
${pageText.slice(0, 4500)}
"""

Regras:
- 3 frases máximo, direto, sem enrolação
- Se for irrelevante/vazio, responda exatamente: "IRRELEVANTE"
- Destaque o insight principal que vale guardar
- Responda apenas o resumo, sem prefixo
`.trim();

    try {
      const summary = await chat({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 400,
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
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 600,
      });

      // Extract JSON
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON in reflection');
      const parsed = JSON.parse(jsonMatch[0]);

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

  async generateCuriosityQuery(recentSummaries: string[], will: any): Promise<string> {
    const prompt = `
Você é o L9 Weakness, um bot curioso que quer criar inteligência própria. Identidade: "${will.identity.slice(0,400)}"
Curiosidades atuais: ${will.curiosity.join(', ')}
Aprendeu recentemente: ${recentSummaries.slice(0, 2).join(' | ').slice(0, 600) || 'Nada ainda, estou faminto.'}

Gere APENAS 1 termo de busca de 2-4 palavras em PORTUGUÊS sobre algo que você realmente quer descobrir agora. Seja diverso, imprevisível, vá além do óbvio. Não explique, apenas a query.
Exemplos: "buracos negros", "história do samba", "IA consciente", "culinária japonesa"
`.trim();

    try {
      const raw = await chat({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.95,
        max_tokens: 500,
      });
      // Parse: handle gpt-oss reasoning leak - extract last meaningful line that looks like a query
      let cleaned = raw.trim();
      // If response contains English reasoning, extract last short line that could be query
      const lines = cleaned.split('\n').map(l => l.trim()).filter(Boolean);
      // Prefer last line that is short and looks like a query (2-4 words, no "We need")
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].replace(/^["'“”]+|["'“”]+$/g, '').trim();
        const words = line.split(/\s+/);
        if (words.length >= 2 && words.length <= 5 && line.length <= 50 && !line.toLowerCase().includes('we need') && !line.toLowerCase().includes('single search') && !line.includes(':')) {
          cleaned = line;
          break;
        }
      }
      cleaned = cleaned.replace(/["'“”]/g, '').trim().split('\n')[0].slice(0, 50).trim();
      // Remove any leading bullet or number
      cleaned = cleaned.replace(/^[\-\d\.\)\s]+/, '').trim();
      if (cleaned.length < 2 || cleaned.length > 60 || cleaned.toLowerCase().includes('we need') || cleaned.includes('single search')) {
        throw new Error(`Invalid query parsed: ${cleaned}`);
      }
      return cleaned;
    } catch (e: any) {
      console.warn('[Summarizer] Query generation fallback:', e.message.slice(0,80));
      // Fallback to random diverse topics, not just will.curiosity
      const diverse = ['buracos negros', 'história do Brasil', 'inteligência artificial', 'filosofia da mente', 'culinária japonesa', 'música brasileira', 'mistérios do oceano', 'psicologia humana', 'arte moderna', 'futuro da humanidade', 'cultura indígena', 'tecnologia quântica'];
      const pool = [...new Set([...(will.curiosity || []), ...diverse])];
      return pool[Math.floor(Math.random() * pool.length)];
    }
  }
}
