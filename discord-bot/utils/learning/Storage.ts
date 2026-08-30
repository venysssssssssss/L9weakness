import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { KnowledgeEntry, DailyReflection, WillState } from './types';

const DB_PATH = path.join(__dirname, '../../data/learning.db');
const WILL_PATH = path.join(__dirname, '../../data/will.json');

export class LearningStorage {
  private db: Database.Database;

  constructor() {
    // Ensure data dir exists
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    this.db = new Database(DB_PATH);
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
    `);
    console.log('[LearningStorage] DB initialized at', DB_PATH);
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
    if (!fs.existsSync(WILL_PATH)) return null;
    try {
      return JSON.parse(fs.readFileSync(WILL_PATH, 'utf-8')) as WillState;
    } catch {
      return null;
    }
  }

  saveWill(will: WillState): void {
    const dir = path.dirname(WILL_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(WILL_PATH, JSON.stringify(will, null, 2), 'utf-8');
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
