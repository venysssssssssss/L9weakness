import * as cheerio from 'cheerio';
import { SearchResult } from './types';

// DuckDuckGo HTML search - no API key needed, respects rate limits
export class DuckDuckGoSearchProvider {
  private baseUrl = 'https://html.duckduckgo.com/html/';
  private userAgent = 'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0';

  async search(query: string, limit = 5): Promise<SearchResult[]> {
    const url = `${this.baseUrl}?q=${encodeURIComponent(query)}`;
    console.log(`[Search] DuckDuckGo query: "${query}"`);

    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'text/html',
        },
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) {
        console.warn(`[Search] DuckDuckGo failed ${res.status} ${res.statusText} for "${query}"`);
        return this.fallbackSearch(query);
      }

      const html = await res.text();
      const $ = cheerio.load(html);
      const results: SearchResult[] = [];

      // Parse results - DDG html structure
      $('.result').each((_, el) => {
        if (results.length >= limit) return false;
        const titleEl = $(el).find('.result__a');
        const snippetEl = $(el).find('.result__snippet');
        const href = titleEl.attr('href');
        const title = titleEl.text().trim();
        const snippet = snippetEl.text().trim();

        if (href && title) {
          // DDG wraps URL as //duckduckgo.com/l/?uddg=ENCODED_URL
          let url = href;
          try {
            if (href.includes('uddg=')) {
              const match = href.match(/uddg=([^&]+)/);
              if (match) url = decodeURIComponent(match[1]);
            } else if (href.startsWith('/')) {
              url = `https://duckduckgo.com${href}`;
            }
          } catch {}
          // Filter out duckduckgo internal links and ads
          if (url.startsWith('http') && !url.includes('duckduckgo.com')) {
            results.push({ url, title: title.slice(0, 200), snippet: snippet.slice(0, 300) });
          }
        }
      });

      if (results.length === 0) {
        console.warn(`[Search] No results for "${query}", trying fallback`);
        return this.fallbackSearch(query);
      }

      console.log(`[Search] Found ${results.length} results for "${query}"`);
      return results;
    } catch (e: any) {
      console.error(`[Search] Error for "${query}":`, e.message);
      return this.fallbackSearch(query);
    }
  }

  // Fallback to HackerNews / Wikipedia style curated sources when DDG fails
  private async fallbackSearch(query: string): Promise<SearchResult[]> {
    // Try Wikipedia search as fallback - always works
    try {
      const wikiUrl = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=3&namespace=0&format=json`;
      const res = await fetch(wikiUrl, { signal: AbortSignal.timeout(10000) });
      if (res.ok) {
        const data: any = await res.json();
        // data = [query, titles[], descs[], urls[]]
        const titles: string[] = data[1] || [];
        const urls: string[] = data[3] || [];
        const descs: string[] = data[2] || [];
        const results: SearchResult[] = titles.map((t, i) => ({
          url: urls[i] || `https://en.wikipedia.org/wiki/${encodeURIComponent(t)}`,
          title: t,
          snippet: descs[i] || `Wikipedia article about ${t}`,
        }));
        if (results.length > 0) {
          console.log(`[Search] Fallback Wikipedia got ${results.length} for "${query}"`);
          return results.slice(0, 3);
        }
      }
    } catch (e: any) {
      console.warn(`[Search] Wikipedia fallback failed:`, e.message);
    }

    // Ultimate fallback: return a direct search URL that Fetcher will handle as error but we provide at least one
    return [
      { url: `https://en.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(query)}`, title: `Search: ${query}`, snippet: `Fallback search for ${query}` },
    ];
  }
}

// HackerNews provider for tech curiosity
export class HackerNewsProvider {
  async getTopStories(limit = 3): Promise<SearchResult[]> {
    try {
      const res = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json', { signal: AbortSignal.timeout(10000) });
      if (!res.ok) return [];
      const ids = (await res.json()) as number[];
      const topIds = ids.slice(0, limit);
      const results: SearchResult[] = [];
      for (const id of topIds) {
        try {
          const itemRes = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, { signal: AbortSignal.timeout(8000) });
          if (!itemRes.ok) continue;
          const item: any = await itemRes.json();
          if (item.url) {
            results.push({ url: item.url, title: item.title || `HN ${id}`, snippet: `HackerNews: ${item.title} (${item.score} points)` });
          }
        } catch {}
      }
      return results;
    } catch (e: any) {
      console.warn('[HackerNews] Failed:', e.message);
      return [];
    }
  }
}

// Unified search that mixes curiosity-driven queries
export class UnifiedSearchProvider {
  private ddg = new DuckDuckGoSearchProvider();
  private hn = new HackerNewsProvider();

  async searchForTopic(topic: string): Promise<SearchResult[]> {
    // 80% DuckDuckGo, 20% HackerNews if topic is tech
    const techKeywords = ['ai', 'tech', 'program', 'code', 'intel', 'robot', 'crypto', 'blockchain'];
    const isTech = techKeywords.some(k => topic.toLowerCase().includes(k));
    if (isTech && Math.random() < 0.3) {
      console.log(`[Search] Tech topic "${topic}" trying HackerNews`);
      const hnResults = await this.hn.getTopStories(3);
      if (hnResults.length > 0) return hnResults;
    }
    return this.ddg.search(topic, 5);
  }
}
