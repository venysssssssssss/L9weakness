type Key = string;

interface CooldownEntry {
  timestamp: number;
}

interface DailyEntry {
  count: number;
  day: string; // YYYY-MM-DD
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export class InMemoryRateLimiter {
  private cooldowns = new Map<Key, CooldownEntry>();
  private daily = new Map<Key, DailyEntry>();

  /**
   * Check cooldown. Returns remaining seconds if blocked, 0 if allowed.
   * If allowed, it also sets the new timestamp.
   */
  checkCooldown(key: Key, windowSec: number): number {
    const now = Date.now();
    const entry = this.cooldowns.get(key);
    if (entry) {
      const elapsed = (now - entry.timestamp) / 1000;
      if (elapsed < windowSec) return Math.ceil(windowSec - elapsed);
    }
    this.cooldowns.set(key, { timestamp: now });
    return 0;
  }

  /**
   * Peek without consuming.
   */
  peekCooldown(key: Key, windowSec: number): number {
    const entry = this.cooldowns.get(key);
    if (!entry) return 0;
    const elapsed = (Date.now() - entry.timestamp) / 1000;
    if (elapsed < windowSec) return Math.ceil(windowSec - elapsed);
    return 0;
  }

  /**
   * Daily limit. Returns remaining if allowed to increment, or -1 if exceeded.
   * Does not increment if exceeded.
   */
  checkDaily(key: Key, limit: number): { allowed: boolean; current: number; limit: number } {
    const today = todayStr();
    let entry = this.daily.get(key);
    if (!entry || entry.day !== today) {
      entry = { count: 0, day: today };
      this.daily.set(key, entry);
    }
    if (entry.count >= limit) return { allowed: false, current: entry.count, limit };
    entry.count += 1;
    return { allowed: true, current: entry.count, limit };
  }

  peekDaily(key: Key): number {
    const entry = this.daily.get(key);
    if (!entry || entry.day !== todayStr()) return 0;
    return entry.count;
  }

  // Simple LRU cache for vision results
  private lru = new Map<string, { value: string; ts: number }>();
  private lruMax = 50;
  private lruTtlMs = 60 * 60 * 1000; // 1h

  getCache(key: string): string | undefined {
    const v = this.lru.get(key);
    if (!v) return undefined;
    if (Date.now() - v.ts > this.lruTtlMs) {
      this.lru.delete(key);
      return undefined;
    }
    // refresh LRU order
    this.lru.delete(key);
    this.lru.set(key, v);
    return v.value;
  }

  setCache(key: string, value: string): void {
    if (this.lru.has(key)) this.lru.delete(key);
    else if (this.lru.size >= this.lruMax) {
      const first = this.lru.keys().next().value;
      if (first) this.lru.delete(first);
    }
    this.lru.set(key, { value, ts: Date.now() });
  }

  clear(): void {
    this.cooldowns.clear();
    this.daily.clear();
    this.lru.clear();
  }
}

// Singletons for each use-case
export const visionLimiter = new InMemoryRateLimiter();
export const imageLimiter = new InMemoryRateLimiter();
