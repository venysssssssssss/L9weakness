import { MusicQueue } from './Queue';

class QueueManager {
  private queues = new Map<string, MusicQueue>();

  get(guildId: string): MusicQueue | undefined {
    return this.queues.get(guildId);
  }

  create(guildId: string, voiceChannelId: string, textChannelId: string): MusicQueue {
    const existing = this.queues.get(guildId);
    if (existing) {
      // update channels
      existing.voiceChannelId = voiceChannelId;
      existing.textChannelId = textChannelId;
      return existing;
    }
    const q = new MusicQueue({ guildId, voiceChannelId, textChannelId });
    this.queues.set(guildId, q);
    return q;
  }

  delete(guildId: string) {
    const q = this.queues.get(guildId);
    if (q) {
      q.destroy();
      this.queues.delete(guildId);
    }
  }

  has(guildId: string) {
    return this.queues.has(guildId);
  }
}

export const queueManager = new QueueManager();
