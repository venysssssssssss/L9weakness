import * as cheerio from 'cheerio';

export interface FetchedPage {
  url: string;
  title: string;
  text: string;
  length: number;
}

export class PageFetcher {
  private userAgent = 'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0 Mozilla/5.0 L9WeaknessBot/1.0 (+https://github.com/venysssssssssss/L9weakness)';

  async fetch(url: string, timeoutMs = 15000): Promise<FetchedPage | null> {
    console.log(`[Fetcher] Fetching ${url.slice(0, 80)}...`);
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const res = await fetch(url, {
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
        },
        signal: controller.signal,
        redirect: 'follow',
      });
      clearTimeout(timer);

      if (!res.ok) {
        console.warn(`[Fetcher] HTTP ${res.status} for ${url}`);
        return null;
      }

      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('text/html') && !contentType.includes('text/plain') && !contentType.includes('application/xhtml')) {
        console.warn(`[Fetcher] Skipping non-html ${contentType} for ${url}`);
        return null;
      }

      const html = await res.text();
      if (html.length < 500) {
        console.warn(`[Fetcher] Too short (${html.length}) for ${url}`);
        return null;
      }

      const $ = cheerio.load(html);

      // Remove unwanted elements
      $('script, style, nav, footer, header, iframe, noscript, form, button, svg, canvas, img, video').remove();
      // Remove comments
      $('*').contents().each(function () {
        if (this.type === 'comment') $(this).remove();
      });

      const title = $('title').text().trim().slice(0, 200) || new URL(url).hostname;

      // Try to get main content - look for article, main, or largest text block
      let text = '';
      const candidates = [
        'article',
        'main',
        '[role="main"]',
        '.post-content',
        '.article-content',
        '.entry-content',
        '.content',
        '#content',
      ];

      for (const sel of candidates) {
        const el = $(sel).first();
        if (el.length && el.text().trim().length > 500) {
          text = el.text();
          break;
        }
      }

      if (!text) {
        // Fallback to body
        text = $('body').text();
      }

      // Clean text
      text = text
        .replace(/\s+/g, ' ')
        .replace(/\n+/g, '\n')
        .trim()
        .slice(0, 8000); // limit to 8k chars to save tokens

      if (text.length < 300) {
        console.warn(`[Fetcher] Extracted too short (${text.length}) for ${url}`);
        return null;
      }

      // Truncate to 5000 chars for LLM
      if (text.length > 5000) text = text.slice(0, 5000);

      console.log(`[Fetcher] OK ${url.slice(0,40)}... title="${title.slice(0,40)}" len=${text.length}`);
      return { url, title, text, length: text.length };
    } catch (e: any) {
      if (e.name === 'AbortError') {
        console.warn(`[Fetcher] Timeout for ${url}`);
      } else {
        console.warn(`[Fetcher] Error for ${url}:`, e.message.slice(0, 100));
      }
      return null;
    }
  }
}
