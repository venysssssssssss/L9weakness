import { getConfig } from '../ai/config';
import { getLearningStorage } from './Storage';
import { UnifiedSearchProvider } from './SearchProvider';
import { PageFetcher } from './Fetcher';
import { Summarizer } from './Summarizer';
import { WillManager } from './Will';

export class LearningOrchestrator {
  private storage = getLearningStorage();
  private search = new UnifiedSearchProvider();
  private fetcher = new PageFetcher();
  private summarizer = new Summarizer();
  private willManager = new WillManager();

  private isRunning = false;
  private abortController: AbortController | null = null;

  async runForDuration(durationMinutes: number): Promise<{ pages: number; summaries: number; tokens: number; day: string }> {
    if (this.isRunning) {
      console.warn('[Learning] Already running, skipping');
      return { pages: 0, summaries: 0, tokens: 0, day: new Date().toISOString().slice(0, 10) };
    }

    const cfg = getConfig();
    if (!cfg.apiKey) {
      console.error('[Learning] NVIDIA_API_KEY missing, cannot learn');
      throw new Error('NVIDIA_API_KEY missing');
    }

    this.isRunning = true;
    this.abortController = new AbortController();
    const start = Date.now();
    const durationMs = durationMinutes * 60 * 1000;
    const day = new Date().toISOString().slice(0, 10);
    const endAt = start + durationMs;

    let pagesFetched = 0;
    let summariesSaved = 0;
    let totalTokens = 0;
    const daySummaries: string[] = [];
    const topicsCovered: string[] = [];

    console.log(`[Learning] 🚀 Iniciando jornada de ${durationMinutes}min para o dia ${day} | modelo ${cfg.textModel}`);

    const will = this.willManager.getCurrent();
    const recentKnowledge = this.storage.getRecentKnowledge(5);
    const recentSummaries = recentKnowledge.map(k => k.summary);

    try {
      while (Date.now() < endAt && !this.abortController.signal.aborted) {
        const remainingSec = Math.ceil((endAt - Date.now()) / 1000);
        if (remainingSec <= 0) break;

        // 1. Generate curiosity-driven query
        let query: string;
        try {
          query = await this.summarizer.generateCuriosityQuery(recentSummaries.concat(daySummaries), will);
        } catch (e: any) {
          console.warn('[Learning] Query generation failed, using fallback', e.message);
          query = will.curiosity[Math.floor(Math.random() * will.curiosity.length)] || 'tecnologia';
        }

        if (!query || topicsCovered.includes(query)) {
          // Avoid duplicate queries same day
          query = `curiosidade ${Math.floor(Math.random() * 10000)}`;
        }
        topicsCovered.push(query);
        console.log(`[Learning] 🔍 Curiosidade: "${query}" | restam ${Math.floor(remainingSec/60)}m${remainingSec%60}s`);

        // 2. Search
        let searchResults: any[] = [];
        try {
          searchResults = await this.search.searchForTopic(query);
        } catch (e: any) {
          console.warn('[Learning] Search failed:', e.message);
          await this.sleep(3000);
          continue;
        }

        if (searchResults.length === 0) {
          console.warn(`[Learning] Nenhum resultado para "${query}"`);
          await this.sleep(2000);
          continue;
        }

        // 3. Fetch and summarize each result (up to 3 per query to save time)
        for (const result of searchResults.slice(0, 3)) {
          if (Date.now() >= endAt || this.abortController.signal.aborted) break;

          const fetched = await this.fetcher.fetch(result.url);
          if (!fetched) {
            await this.sleep(1000);
            continue;
          }
          pagesFetched++;

          const { summary, tokens } = await this.summarizer.summarize(fetched.text, query, fetched.title);
          if (!summary) {
            console.log(`[Learning] Irrelevante, pulando ${result.url.slice(0,40)}`);
            await this.sleep(1000);
            continue;
          }

          // Save to DB
          this.storage.saveKnowledge({
            topic: query,
            query,
            source_url: result.url,
            title: fetched.title,
            summary,
            raw_text: fetched.text.slice(0, 2000),
            tokens_used: tokens,
            day,
          });
          summariesSaved++;
          totalTokens += tokens;
          daySummaries.push(summary);
          recentSummaries.unshift(summary);
          if (recentSummaries.length > 10) recentSummaries.pop();

          console.log(`[Learning] 💾 Salvo: "${summary.slice(0, 80)}..." (${tokens} tok)`);

          // Small delay to be nice to the internet and avoid rate limits
          await this.sleep(2000);

          // Check if we should stop early due to duration
          if (Date.now() >= endAt) break;
        }

        // Delay between queries - 3-5s
        await this.sleep(3000 + Math.random() * 2000);
      }

      console.log(`[Learning] ⏱️ Tempo esgotado ou abortado. Fetched=${pagesFetched} Saved=${summariesSaved} Tokens=${totalTokens}`);

      // 4. Daily reflection and will evolution (if we learned something)
      if (daySummaries.length > 0) {
        console.log('[Learning] 🧘 Gerando reflexão diária...');
        const reflection = await this.summarizer.generateDailyReflection(daySummaries, will);

        this.storage.saveReflection({
          day,
          topics_covered: topicsCovered,
          sources_count: pagesFetched,
          total_tokens: totalTokens,
          summary: reflection.reflection,
          will_evolution: reflection.willUpdate,
          next_curiosity: reflection.nextCuriosity,
        });

        this.willManager.evolve(reflection.reflection, reflection.nextCuriosity, reflection.willUpdate, this.storage.getTotalCount());

        console.log(`[Learning] 🌟 Reflexão: ${reflection.reflection.slice(0, 120)}...`);
        console.log(`[Learning] 🔮 Próximas curiosidades: ${reflection.nextCuriosity.join(', ')}`);
      } else {
        console.warn('[Learning] Nenhum resumo hoje, sem reflexão');
      }

      return { pages: pagesFetched, summaries: summariesSaved, tokens: totalTokens, day };
    } catch (e: any) {
      console.error('[Learning] Erro fatal no loop:', e.message);
      throw e;
    } finally {
      this.isRunning = false;
      this.abortController = null;
      console.log(`[Learning] ✅ Finalizado dia ${day} — ${summariesSaved} conhecimentos salvos`);
    }
  }

  // Run 1h (default) - can be called by scheduler or manual command
  async runOneHour(): Promise<void> {
    const minutes = parseInt(process.env.LEARNING_DURATION_MIN || '60', 10);
    await this.runForDuration(minutes);
  }

  // For manual test with short duration
  async runTest(minutes = 2): Promise<any> {
    return this.runForDuration(minutes);
  }

  stop(): void {
    if (this.abortController) {
      console.log('[Learning] 🛑 Abort solicitado');
      this.abortController.abort();
    }
  }

  isActive(): boolean {
    return this.isRunning;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Singleton
let orchestrator: LearningOrchestrator | null = null;
export function getOrchestrator(): LearningOrchestrator {
  if (!orchestrator) orchestrator = new LearningOrchestrator();
  return orchestrator;
}
