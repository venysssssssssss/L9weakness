import { getLearningStorage } from './Storage';
import { WillState } from './types';

export class WillManager {
  private storage = getLearningStorage();

  getCurrent(): WillState {
    return this.storage.initWillIfNeeded();
  }

  evolve(reflection: string, nextCuriosity: string[], willUpdate: string, learnedCount: number): WillState {
    const current = this.getCurrent();
    const today = new Date().toISOString().slice(0, 10);
    const alreadyToday = current.updated_at.slice(0, 10) === today && current.version > 1;
    // ponytail: identity = fixed base (first sentence block) + latest evolution; no unbounded concatenation.
    const base = current.identity.split(/(?<=\.)\s/).slice(0, 2).join(' ').slice(0, 300);
    const evolution = (current.personality_evolution.split(' | ').filter(Boolean).slice(-4))
      .concat(willUpdate.length > 20 ? [`Dia ${today}: ${willUpdate.slice(0, 160)}`] : []);

    const updated: WillState = {
      ...current,
      version: current.version + 1,
      updated_at: new Date().toISOString(),
      identity: willUpdate.length > 20 ? `${base} ${willUpdate.slice(0, 200)}`.slice(0, 500) : current.identity,
      curiosity: nextCuriosity.length ? nextCuriosity : current.curiosity,
      learned_summary: reflection.slice(0, 600),
      daily_streak: alreadyToday ? current.daily_streak : current.daily_streak + 1,
      total_knowledge: learnedCount,
      personality_evolution: evolution.join(' | ').slice(0, 1000),
    };

    this.storage.saveWill(updated);
    console.log(`[Will] Evolved to v${updated.version} streak=${updated.daily_streak} curiosity=${updated.curiosity.join(', ')}`);
    return updated;
  }

  getStatus(): WillState & { today: string } {
    const w = this.getCurrent();
    return { ...w, today: new Date().toISOString().slice(0, 10) };
  }

  // For display in Discord
  formatForDiscord(): string {
    const w = this.getCurrent();
    const stats = this.storage.getStats();
    return `**🧠 L9 Weakness — Vontade Própria v${w.version}**\n` +
      `> *${w.identity.slice(0, 300)}*\n\n` +
      `**Curiosidades atuais:** ${w.curiosity.join(', ')}\n` +
      `**Objetivos:** ${w.goals.join(' • ')}\n` +
      `**Evolução:** ${w.personality_evolution.slice(-400)}\n` +
      `**Streak:** ${w.daily_streak} dias • **Conhecimento:** ${stats.total} páginas • **Hoje:** ${stats.today} • **Últimos 7d:** ${stats.last7}\n` +
      `**Último aprendizado:** ${w.learned_summary.slice(0, 400)}`;
  }
}
