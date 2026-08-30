function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

class InMemoryRateLimiter {
  constructor() {
    this.cooldowns = new Map();
    this.daily = new Map();
    this.lru = new Map();
    this.lruMax = 50;
    this.lruTtlMs = 60 * 60 * 1000;
  }

  checkCooldown(key, windowSec) {
    const now = Date.now();
    const entry = this.cooldowns.get(key);
    if (entry) {
      const elapsed = (now - entry.timestamp) / 1000;
      if (elapsed < windowSec) return Math.ceil(windowSec - elapsed);
    }
    this.cooldowns.set(key, { timestamp: now });
    return 0;
  }

  peekCooldown(key, windowSec) {
    const entry = this.cooldowns.get(key);
    if (!entry) return 0;
    const elapsed = (Date.now() - entry.timestamp) / 1000;
    if (elapsed < windowSec) return Math.ceil(windowSec - elapsed);
    return 0;
  }

  checkDaily(key, limit) {
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

  peekDaily(key) {
    const entry = this.daily.get(key);
    if (!entry || entry.day !== todayStr()) return 0;
    return entry.count;
  }

  getCache(key) {
    const v = this.lru.get(key);
    if (!v) return undefined;
    if (Date.now() - v.ts > this.lruTtlMs) {
      this.lru.delete(key);
      return undefined;
    }
    this.lru.delete(key);
    this.lru.set(key, v);
    return v.value;
  }

  setCache(key, value) {
    if (this.lru.has(key)) this.lru.delete(key);
    else if (this.lru.size >= this.lruMax) {
      const first = this.lru.keys().next().value;
      if (first) this.lru.delete(first);
    }
    this.lru.set(key, { value, ts: Date.now() });
  }

  clear() {
    this.cooldowns.clear();
    this.daily.clear();
    this.lru.clear();
  }
}

const visionLimiter = new InMemoryRateLimiter();
const imageLimiter = new InMemoryRateLimiter();

module.exports = { InMemoryRateLimiter, visionLimiter, imageLimiter };
