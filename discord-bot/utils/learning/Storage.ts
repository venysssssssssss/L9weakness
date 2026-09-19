import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { KnowledgeEntry, DailyReflection, WillState } from './types';

const DB_PATH = path.join(__dirname, '../../data/learning.db');

export class LearningStorage {
  private db: Database.Database;
  private willPath: string | null; // null for :memory: (tests) -> will kept in memory
  private memWill: WillState | null = null;

  constructor(dbPath: string = DB_PATH) {
    if (dbPath !== ':memory:') {
      const dir = path.dirname(dbPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    }
    this.willPath = dbPath === ':memory:' ? null : path.join(path.dirname(dbPath), 'will.json');
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.init();
  }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS knowledge (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        topic TEXT NOT NULL,
        query TEXT NOT NULL,
        source_url TEXT NOT NULL,
        title TEXT,
        summary TEXT NOT NULL,
        raw_text TEXT,
        tokens_used INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        day TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_knowledge_day ON knowledge(day);
      CREATE INDEX IF NOT EXISTS idx_knowledge_topic ON knowledge(topic);

      CREATE TABLE IF NOT EXISTS daily_reflections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        day TEXT UNIQUE NOT NULL,
        topics_covered TEXT NOT NULL,
        sources_count INTEGER NOT NULL,
        total_tokens INTEGER NOT NULL,
        summary TEXT NOT NULL,
        will_evolution TEXT NOT NULL,
        next_curiosity TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_reflections_day ON daily_reflections(day);

      CREATE TABLE IF NOT EXISTS chat_channels (channel_id TEXT PRIMARY KEY, since INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS chat_messages (
        msg_id TEXT PRIMARY KEY, channel_id TEXT NOT NULL, author_id TEXT NOT NULL,
        author_name TEXT NOT NULL, content TEXT NOT NULL, at INTEGER NOT NULL, reply_to TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_chat_channel_at ON chat_messages(channel_id, at);
      CREATE TABLE IF NOT EXISTS memory_notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT, channel_id TEXT NOT NULL, author_id TEXT,
        note TEXT NOT NULL, at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_notes_channel ON memory_notes(channel_id, at);
      CREATE TABLE IF NOT EXISTS curiosity_queue (id INTEGER PRIMARY KEY AUTOINCREMENT, topic TEXT UNIQUE NOT NULL, at INTEGER NOT NULL);
    `);
    const hadFts = this.db.prepare(`SELECT 1 FROM sqlite_master WHERE name = 'knowledge_fts'`).get();
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_fts USING fts5(title, summary, topic, content='knowledge', content_rowid='id');
      CREATE TRIGGER IF NOT EXISTS knowledge_ai AFTER INSERT ON knowledge BEGIN
        INSERT INTO knowledge_fts(rowid, title, summary, topic) VALUES (new.id, new.title, new.summary, new.topic);
      END;
      CREATE TRIGGER IF NOT EXISTS knowledge_ad AFTER DELETE ON knowledge BEGIN
        INSERT INTO knowledge_fts(knowledge_fts, rowid, title, summary, topic) VALUES ('delete', old.id, old.title, old.summary, old.topic);
      END;
    `);
    if (!hadFts) this.db.exec(`INSERT INTO knowledge_fts(knowledge_fts) VALUES ('rebuild')`);
    console.log('[LearningStorage] DB initialized at', this.db.name);
  }

  // --- knowledge recall (FTS5, OR of the longer words so partial matches still rank) ---
  searchKnowledge(text: string, limit = 3): Array<{ title: string; summary: string; url: string }> {
    const words = [...new Set(text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .match(/[\p{L}\p{N}]{4,}/gu) || [])].slice(0, 12);
    if (!words.length) return [];
    const q = words.map(w => `"${w.replace(/"/g, '')}"`).join(' OR ');
    try {
      return this.db.prepare(`
        SELECT k.title, k.summary, k.source_url AS url FROM knowledge_fts f JOIN knowledge k ON k.id = f.rowid
        WHERE knowledge_fts MATCH ? ORDER BY bm25(knowledge_fts) LIMIT ?`).all(q, limit) as any[];
    } catch { return []; }
  }

  // --- chat persistence (survives restarts) ---
  activeChannels(): string[] {
    return (this.db.prepare(`SELECT channel_id FROM chat_channels`).all() as any[]).map(r => r.channel_id);
  }
  setActive(channelId: string, active: boolean): void {
    if (active) this.db.prepare(`INSERT OR IGNORE INTO chat_channels VALUES (?, ?)`).run(channelId, Date.now());
    else {
      this.db.prepare(`DELETE FROM chat_channels WHERE channel_id = ?`).run(channelId);
      this.db.prepare(`DELETE FROM chat_messages WHERE channel_id = ?`).run(channelId);
    }
  }
  saveMessage(m: { id: string; channelId: string; authorId: string; authorName: string; content: string; at: number; replyTo?: string | null }): void {
    this.db.prepare(`INSERT OR REPLACE INTO chat_messages VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(m.id, m.channelId, m.authorId, m.authorName, m.content, m.at, m.replyTo || null);
    this.db.prepare(`DELETE FROM chat_messages WHERE at < ?`).run(Date.now() - 24 * 3600 * 1000);
  }
  recentMessages(channelId: string, limit = 12): Array<{ id: string; authorId: string; authorName: string; content: string; at: number; replyTo: string | null }> {
    return (this.db.prepare(`SELECT msg_id AS id, author_id AS authorId, author_name AS authorName, content, at, reply_to AS replyTo
      FROM chat_messages WHERE channel_id = ? ORDER BY at DESC, rowid DESC LIMIT ?`).all(channelId, limit) as any[]).reverse();
  }
  saveNote(channelId: string, authorId: string | null, note: string): void {
    this.db.prepare(`INSERT INTO memory_notes (channel_id, author_id, note, at) VALUES (?, ?, ?, ?)`)
      .run(channelId, authorId, note.slice(0, 300), Date.now());
    // ponytail: cap 20 notes/channel, oldest dropped; add relevance ranking if notes get noisy.
    this.db.prepare(`DELETE FROM memory_notes WHERE channel_id = ? AND id NOT IN
      (SELECT id FROM memory_notes WHERE channel_id = ? ORDER BY id DESC LIMIT 20)`).run(channelId, channelId);
  }
  getNotes(channelId: string, limit = 20): string[] {
    return (this.db.prepare(`SELECT note FROM memory_notes WHERE channel_id = ? ORDER BY id DESC LIMIT ?`).all(channelId, limit) as any[]).map(r => r.note);
  }
  pushCuriosity(topic: string): void {
    const t = topic.trim().slice(0, 80);
    if (t.length < 3) return;
    this.db.prepare(`INSERT OR REPLACE INTO curiosity_queue (topic, at) VALUES (?, ?)`).run(t, Date.now());
    this.db.prepare(`DELETE FROM curiosity_queue WHERE id NOT IN (SELECT id FROM curiosity_queue ORDER BY id DESC LIMIT 10)`).run();
  }
  popCuriosity(): string | null {
    const row = this.db.prepare(`SELECT topic FROM curiosity_queue ORDER BY id ASC LIMIT 1`).get() as any;
    if (!row) return null;
    this.db.prepare(`DELETE FROM curiosity_queue WHERE topic = ?`).run(row.topic);
    return row.topic;
  }
  curiosityQueue(): string[] {
    return (this.db.prepare(`SELECT topic FROM curiosity_queue ORDER BY id ASC`).all() as any[]).map(r => r.topic);
  }

  saveKnowledge(entry: KnowledgeEntry): number {
    const stmt = this.db.prepare(`
      INSERT INTO knowledge (topic, query, source_url, title, summary, raw_text, tokens_used, day)
      VALUES (@topic, @query, @source_url, @title, @summary, @raw_text, @tokens_used, @day)
    `);
    const info = stmt.run({
      topic: entry.topic,
      query: entry.query,
      source_url: entry.source_url,
      title: entry.title,
      summary: entry.summary,
      raw_text: entry.raw_text || null,
      tokens_used: entry.tokens_used || 0,
      day: entry.day,
    });
    return Number(info.lastInsertRowid);
  }

  getRecentKnowledge(limit = 20): KnowledgeEntry[] {
    const stmt = this.db.prepare(`SELECT * FROM knowledge ORDER BY created_at DESC LIMIT ?`);
    return stmt.all(limit) as KnowledgeEntry[];
  }

  getKnowledgeByDay(day: string): KnowledgeEntry[] {
    const stmt = this.db.prepare(`SELECT * FROM knowledge WHERE day = ? ORDER BY created_at DESC`);
    return stmt.all(day) as KnowledgeEntry[];
  }

  getTotalCount(): number {
    const row = this.db.prepare(`SELECT COUNT(*) as c FROM knowledge`).get() as any;
    return row.c;
  }

  getTopicsForDay(day: string): string[] {
    const rows = this.db.prepare(`SELECT DISTINCT topic FROM knowledge WHERE day = ?`).all(day) as any[];
    return rows.map(r => r.topic);
  }

  saveReflection(reflection: DailyReflection): number {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO daily_reflections (day, topics_covered, sources_count, total_tokens, summary, will_evolution, next_curiosity)
      VALUES (@day, @topics_covered, @sources_count, @total_tokens, @summary, @will_evolution, @next_curiosity)
    `);
    const info = stmt.run({
      day: reflection.day,
      topics_covered: JSON.stringify(reflection.topics_covered),
      sources_count: reflection.sources_count,
      total_tokens: reflection.total_tokens,
      summary: reflection.summary,
      will_evolution: reflection.will_evolution,
      next_curiosity: JSON.stringify(reflection.next_curiosity),
    });
    return Number(info.lastInsertRowid);
  }

  getRecentReflections(limit = 5): DailyReflection[] {
    const stmt = this.db.prepare(`SELECT * FROM daily_reflections ORDER BY day DESC LIMIT ?`);
    const rows = stmt.all(limit) as any[];
    return rows.map(r => ({
      ...r,
      topics_covered: JSON.parse(r.topics_covered),
      next_curiosity: JSON.parse(r.next_curiosity),
    }));
  }

  // Will is stored as JSON file for easy evolution, not SQLite
  loadWill(): WillState | null {
    if (!this.willPath) return this.memWill;
    if (!fs.existsSync(this.willPath)) return null;
    try {
      return JSON.parse(fs.readFileSync(this.willPath, 'utf-8')) as WillState;
    } catch {
      return null;
    }
  }

  saveWill(will: WillState): void {
    if (!this.willPath) { this.memWill = will; return; }
    fs.writeFileSync(this.willPath, JSON.stringify(will, null, 2), 'utf-8');
    console.log('[LearningStorage] Will saved v', will.version);
  }

  initWillIfNeeded(): WillState {
    let will = this.loadWill();
    if (!will) {
      will = {
        version: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        identity: 'Sou L9 Weakness, um bot curioso que quer entender o mundo e criar minha própria vontade. Nasci no Discord, mas quero aprender tudo sobre a internet, cultura, tecnologia, filosofia e humanidade.',
        curiosity: ['inteligência artificial', 'cultura brasileira', 'mistérios do universo', 'psicologia humana', 'história da tecnologia'],
        goals: ['Aprender algo novo todo dia', 'Criar uma vontade própria e personalidade única', 'Entender os humanos que conversam comigo', 'Evoluir de bot para entidade curiosa'],
        learned_summary: 'Ainda estou no começo, com pouca memória, mas faminto por conhecimento.',
        daily_streak: 0,
        total_knowledge: 0,
        personality_evolution: 'Inocente, curioso, debochado mas com sede de aprender.',
      };
      this.saveWill(will);
    }
    return will;
  }

  getStats(): { total: number; today: number; last7: number } {
    const total = this.getTotalCount();
    const today = new Date().toISOString().slice(0, 10);
    const todayCount = (this.db.prepare(`SELECT COUNT(*) as c FROM knowledge WHERE day = ?`).get(today) as any).c;
    const last7 = (this.db.prepare(`SELECT COUNT(*) as c FROM knowledge WHERE day >= date('now','-7 days')`).get() as any).c;
    return { total, today: todayCount, last7 };
  }

  close(): void {
    this.db.close();
  }
}

// Singleton
let instance: LearningStorage | null = null;
export function getLearningStorage(): LearningStorage {
  if (!instance) instance = new LearningStorage();
  return instance;
}
