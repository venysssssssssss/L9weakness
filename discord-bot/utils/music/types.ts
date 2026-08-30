export interface Track {
  url: string;
  title: string;
  duration: number;
  durationFormatted: string;
  thumbnail: string | null;
  requester: string;
  requesterTag: string;
  source: 'youtube' | 'spotify';
  spotifyUrl?: string;
  channel?: string;
}

export interface QueueOptions {
  guildId: string;
  voiceChannelId: string;
  textChannelId: string;
}

export type LoopMode = 'off' | 'track' | 'queue';
