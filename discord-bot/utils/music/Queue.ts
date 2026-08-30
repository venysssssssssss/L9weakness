import {
  AudioPlayer,
  AudioPlayerStatus,
  VoiceConnection,
  VoiceConnectionStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  joinVoiceChannel,
} from '@discordjs/voice';
import { ChannelType, TextChannel } from 'discord.js';
import { Track } from './types';
import { getStream } from './Resolver';

export class MusicQueue {
  guildId: string;
  voiceChannelId: string;
  textChannelId: string;
  tracks: Track[] = [];
  history: Track[] = [];
  current: Track | null = null;
  player: AudioPlayer;
  connection: VoiceConnection | null = null;
  playing: boolean = false;
  paused: boolean = false;
  private lock: boolean = false;
  private leaveTimeout: NodeJS.Timeout | null = null;

  constructor(opts: { guildId: string; voiceChannelId: string; textChannelId: string }) {
    this.guildId = opts.guildId;
    this.voiceChannelId = opts.voiceChannelId;
    this.textChannelId = opts.textChannelId;
    this.player = createAudioPlayer();

    this.player.on(AudioPlayerStatus.Idle, () => {
      // finished current
      if (this.current) this.history.push(this.current);
      this.current = null;
      this.playing = false;
      this.processQueue();
    });

    this.player.on('error', (err) => {
      console.error(`[Queue ${this.guildId}] player error`, err.message);
      this.current = null;
      this.playing = false;
      this.processQueue();
    });
  }

  async connect(voiceChannel: any): Promise<VoiceConnection> {
    if (this.connection && this.connection.state.status !== VoiceConnectionStatus.Destroyed) {
      if (this.connection.joinConfig.channelId === voiceChannel.id) return this.connection;
      this.connection.destroy();
    }
    const conn = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: voiceChannel.guild.id,
      adapterCreator: voiceChannel.guild.voiceAdapterCreator as any,
      selfDeaf: true,
    });

    try {
      await entersState(conn, VoiceConnectionStatus.Ready, 15000);
    } catch (e) {
      conn.destroy();
      throw new Error('Não foi possível conectar ao canal de voz (timeout). Verifique permissões.');
    }

    conn.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        await Promise.race([
          entersState(conn, VoiceConnectionStatus.Signalling, 5000),
          entersState(conn, VoiceConnectionStatus.Connecting, 5000),
        ]);
      } catch {
        this.destroy();
      }
    });

    conn.subscribe(this.player);
    this.connection = conn;
    this.voiceChannelId = voiceChannel.id;
    this.resetLeaveTimeout();
    return conn;
  }

  addTracks(tracks: Track[]) {
    this.tracks.push(...tracks);
    this.resetLeaveTimeout();
  }

  async processQueue(): Promise<void> {
    if (this.lock) return;
    this.lock = true;
    try {
      if (this.player.state.status !== AudioPlayerStatus.Idle) {
        // still playing/paused
        this.lock = false;
        return;
      }
      if (this.tracks.length === 0) {
        this.playing = false;
        this.current = null;
        // schedule leave after 5 min idle
        this.scheduleLeave();
        return;
      }
      const next = this.tracks.shift()!;
      this.current = next;
      this.playing = true;
      this.paused = false;

      let stream: any;
      try {
        stream = await getStream(next);
      } catch (e) {
        console.error(`[Queue ${this.guildId}] stream error for ${next.title}`, (e as Error).message);
        // try next track
        this.current = null;
        this.playing = false;
        this.lock = false;
        // Avoid recursion lock
        setImmediate(() => this.processQueue());
        return;
      }

      const resource = createAudioResource(stream.stream, {
        inputType: stream.type,
        inlineVolume: true,
      } as any);
      // default volume 100%
      if ((resource as any).volume) (resource as any).volume.setVolume(1);

      this.player.play(resource);
      this.resetLeaveTimeout();
    } finally {
      this.lock = false;
    }
  }

  skip(): boolean {
    if (!this.current && this.tracks.length === 0) return false;
    // stopping player triggers Idle -> next
    this.player.stop(true);
    return true;
  }

  stop(clearQueue = true): void {
    if (clearQueue) this.tracks = [];
    this.history = [];
    this.current = null;
    this.player.stop(true);
    this.playing = false;
  }

  pause(): boolean {
    if (this.player.state.status === AudioPlayerStatus.Playing) {
      this.player.pause();
      this.paused = true;
      return true;
    }
    return false;
  }

  resume(): boolean {
    if (this.player.state.status === AudioPlayerStatus.Paused) {
      this.player.unpause();
      this.paused = false;
      return true;
    }
    return false;
  }

  shuffle(): void {
    for (let i = this.tracks.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.tracks[i], this.tracks[j]] = [this.tracks[j], this.tracks[i]];
    }
  }

  getQueue(): Track[] {
    return [...this.tracks];
  }

  nowPlaying(): Track | null {
    return this.current;
  }

  size(): number {
    return this.tracks.length;
  }

  private scheduleLeave() {
    if (this.leaveTimeout) clearTimeout(this.leaveTimeout);
    this.leaveTimeout = setTimeout(() => {
      if (this.tracks.length === 0 && !this.current) {
        this.destroy();
      }
    }, 5 * 60 * 1000); // 5 min
  }

  private resetLeaveTimeout() {
    if (this.leaveTimeout) {
      clearTimeout(this.leaveTimeout);
      this.leaveTimeout = null;
    }
  }

  destroy() {
    if (this.leaveTimeout) clearTimeout(this.leaveTimeout);
    try {
      this.player.stop(true);
    } catch {}
    if (this.connection) {
      try {
        this.connection.destroy();
      } catch {}
      this.connection = null;
    }
    this.tracks = [];
    this.current = null;
    this.playing = false;
    this.paused = false;
  }

  setVolume(vol: number) {
    // vol 0-100
    const v = Math.max(0, Math.min(200, vol)) / 100;
    const resource: any = (this.player as any).state?.resource;
    if (resource?.volume) resource.volume.setVolume(v);
  }
}
