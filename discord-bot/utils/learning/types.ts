export interface KnowledgeEntry {
  id?: number;
  topic: string;
  query: string;
  source_url: string;
  title: string;
  summary: string;
  raw_text?: string;
  tokens_used?: number;
  created_at?: string;
  day: string; // YYYY-MM-DD
}

export interface DailyReflection {
  id?: number;
  day: string;
  topics_covered: string[]; // list of topics
  sources_count: number;
  total_tokens: number;
  summary: string; // LLM generated daily summary
  will_evolution: string; // updated will
  next_curiosity: string[]; // 3 queries for tomorrow
  created_at?: string;
}

export interface WillState {
  version: number;
  created_at: string;
  updated_at: string;
  identity: string; // who the bot thinks it is
  curiosity: string[]; // current curiosity topics
  goals: string[]; // long term goals
  learned_summary: string; // summary of all learned so far
  daily_streak: number;
  total_knowledge: number;
  personality_evolution: string;
}

export interface LearningConfig {
  enabled: boolean;
  startHour: number; // 0-23 UTC
  durationMinutes: number;
  maxPagesPerDay: number;
  maxTokensPerDay: number;
  model: string; // NVIDIA model for learning
  searchProvider: 'duckduckgo' | 'hackernews' | 'wikipedia';
}

export interface SearchResult {
  url: string;
  title: string;
  snippet: string;
}
