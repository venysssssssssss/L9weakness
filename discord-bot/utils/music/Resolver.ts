import play from 'play-dl';
// @ts-ignore
import spotifyInfo from 'spotify-url-info';
import { Track } from './types';
import { exec as ytdlpExec } from 'yt-dlp-exec';

const spotify = spotifyInfo as any;

// Init play-dl free client if needed
let playDlInitialized = false;
async function ensurePlayDl() {
  if (playDlInitialized) return;
  try {
    if ((play as any).getFreeClientID) {
      await (play as any).getFreeClientID();
    }
    playDlInitialized = true;
  } catch (e) {
    console.warn('[Music Resolver] play-dl init warning:', (e as Error).message);
  }
}

function formatDuration(sec: number): string {
  if (!sec || isNaN(sec)) return '00:00';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function isUrl(str: string): boolean {
  try {
    new URL(str);
    return str.startsWith('http://') || str.startsWith('https://');
  } catch {
    return false;
  }
}

function isSpotifyUrl(url: string): boolean {
  return url.includes('open.spotify.com');
}

function extractYouTubeID(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtu.be')) return u.pathname.slice(1).split('?')[0];
    if (u.hostname.includes('youtube.com')) {
      const v = u.searchParams.get('v');
      if (v) return v;
      // shorts, embed
      const parts = u.pathname.split('/').filter(Boolean);
      if (parts[0] === 'shorts' && parts[1]) return parts[1];
      if (parts[0] === 'embed' && parts[1]) return parts[1];
    }
  } catch {}
  return null;
}

async function getYouTubeInfoViaYtDlp(url: string): Promise<{ title: string; duration: number; thumbnail: string | null; channel?: string } | null> {
  try {
    const result: any = await ytdlpExec(url, {
      dumpSingleJson: true,
      noWarnings: true,
      skipDownload: true,
      noPlaylist: true,
    } as any);
    // ytdlp-exec returns {stdout, ...} but sometimes already parsed? Check if result is object with title directly or stdout string
    let data: any = result;
    if (result.stdout) {
      try { data = JSON.parse(result.stdout); } catch { data = result; }
    }
    if (!data || !data.title) return null;
    const thumb = data.thumbnail || data.thumbnails?.[0]?.url || (data.id ? `https://img.youtube.com/vi/${data.id}/hqdefault.jpg` : null);
    return {
      title: data.title,
      duration: data.duration || 0,
      thumbnail: thumb,
      channel: data.uploader || data.channel || data.channel_id,
    };
  } catch (e) {
    console.warn('[Resolver] yt-dlp info fail', url, (e as Error).message);
    return null;
  }
}

async function getYouTubePlaylistViaYtDlp(url: string): Promise<{ title: string; entries: any[] } | null> {
  try {
    const result: any = await ytdlpExec(url, {
      dumpSingleJson: true,
      flatPlaylist: true,
      noWarnings: true,
      skipDownload: true,
    } as any);
    let data: any = result;
    if (result.stdout) {
      try { data = JSON.parse(result.stdout); } catch {}
    }
    if (!data || !Array.isArray(data.entries)) return null;
    return { title: data.title || 'YouTube Playlist', entries: data.entries };
  } catch (e) {
    console.warn('[Resolver] yt-dlp playlist fail', (e as Error).message);
    return null;
  }
}

export async function resolveQuery(query: string, requester: string, requesterTag: string): Promise<{ tracks: Track[]; playlistTitle?: string }> {
  await ensurePlayDl();
  query = query.trim();

  // 1 - Spotify URL
  if (isUrl(query) && isSpotifyUrl(query)) {
    return resolveSpotifyUrl(query, requester, requesterTag);
  }

  // 2 - YouTube URL
  if (isUrl(query)) {
    const ytType = play.yt_validate(query) as string | false;
    // Treat as video if yt_validate says video OR contains youtube watch/shorts
    const looksLikeYouTube = query.includes('youtube.com') || query.includes('youtu.be');
    if (ytType === 'video' || (looksLikeYouTube && extractYouTubeID(query))) {
      const track = await resolveYouTubeVideo(query, requester, requesterTag);
      if (track) return { tracks: [track] };
      // fallback to search via ID
      const id = extractYouTubeID(query);
      if (id) {
        try {
          const s = await resolveSearch(id, requester, requesterTag);
          return s;
        } catch {}
      }
      throw new Error('Não foi possível carregar o vídeo do YouTube.');
    }
    if (ytType === 'playlist') {
      return resolveYouTubePlaylist(query, requester, requesterTag);
    }
    if (looksLikeYouTube) {
      // generic youtube URL try playlist fallback
      try {
        return await resolveYouTubePlaylist(query, requester, requesterTag);
      } catch {}
    }
  }

  // 3 - Search query
  return resolveSearch(query, requester, requesterTag);
}

async function resolveYouTubeVideo(url: string, requester: string, requesterTag: string): Promise<Track | null> {
  // First try play-dl video_info (may be broken but try)
  try {
    const info = await play.video_info(url);
    const vd = (info as any).video_details;
    if (vd && vd.title) {
      return {
        url: vd.url,
        title: vd.title,
        duration: vd.durationInSec || 0,
        durationFormatted: formatDuration(vd.durationInSec || 0),
        thumbnail: vd.thumbnails?.[0]?.url || null,
        requester,
        requesterTag,
        source: 'youtube',
        channel: vd.channel?.name,
      };
    }
  } catch (e) {
    console.warn('[Resolver] play.video_info failed', (e as Error).message);
  }

  // Fallback: yt-dlp
  const ytInfo = await getYouTubeInfoViaYtDlp(url);
  if (ytInfo) {
    const id = extractYouTubeID(url);
    const cleanUrl = id ? `https://www.youtube.com/watch?v=${id}` : url;
    return {
      url: cleanUrl,
      title: ytInfo.title,
      duration: ytInfo.duration,
      durationFormatted: formatDuration(ytInfo.duration),
      thumbnail: ytInfo.thumbnail,
      requester,
      requesterTag,
      source: 'youtube',
      channel: ytInfo.channel,
    };
  }

  // Last fallback: search via title extracted from URL? use ID as query
  const id = extractYouTubeID(url);
  if (id) {
    try {
      const search = await play.search(id, { limit: 1 } as any);
      if (search[0]) {
        const v: any = search[0];
        return {
          url: v.url,
          title: v.title,
          duration: v.durationInSec || 0,
          durationFormatted: formatDuration(v.durationInSec || 0),
          thumbnail: v.thumbnails?.[0]?.url || null,
          requester,
          requesterTag,
          source: 'youtube',
          channel: v.channel?.name,
        };
      }
    } catch {}
  }

  return null;
}

async function resolveYouTubePlaylist(url: string, requester: string, requesterTag: string): Promise<{ tracks: Track[]; playlistTitle?: string }> {
  // Try play-dl first
  try {
    const playlist: any = await play.playlist_info(url, { incomplete: true } as any);
    const videos = await (playlist as any).all_videos();
    if (videos && videos.length > 0) {
      const tracks: Track[] = [];
      const limit = Math.min(videos.length, 50);
      for (let i = 0; i < limit; i++) {
        const v = videos[i];
        tracks.push({
          url: v.url,
          title: v.title || 'Unknown',
          duration: v.durationInSec || 0,
          durationFormatted: formatDuration(v.durationInSec || 0),
          thumbnail: v.thumbnails?.[0]?.url || null,
          requester,
          requesterTag,
          source: 'youtube',
          channel: v.channel?.name,
        });
      }
      return { tracks, playlistTitle: playlist.title || 'YouTube Playlist' };
    }
  } catch (e) {
    console.warn('[Resolver] play.playlist_info fail', (e as Error).message);
  }

  // Fallback yt-dlp
  const pl = await getYouTubePlaylistViaYtDlp(url);
  if (pl && pl.entries.length > 0) {
    const tracks: Track[] = [];
    const limit = Math.min(pl.entries.length, 50);
    for (let i = 0; i < limit; i++) {
      const e = pl.entries[i];
      // entries from flatPlaylist have id, title, url, duration
      const id = e.id || e.ie_key;
      const videoUrl = e.url || (id ? `https://www.youtube.com/watch?v=${id}` : null);
      if (!videoUrl) continue;
      // Try to get duration via search fallback if not present
      let duration = e.duration || 0;
      let title = e.title || id || 'Unknown';
      let thumbnail = e.thumbnails?.[0]?.url || (id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : null);
      tracks.push({
        url: videoUrl,
        title,
        duration,
        durationFormatted: formatDuration(duration),
        thumbnail,
        requester,
        requesterTag,
        source: 'youtube',
        channel: e.channel || e.uploader,
      });
    }
    if (tracks.length > 0) return { tracks, playlistTitle: pl.title };
  }

  throw new Error('Não foi possível carregar a playlist do YouTube.');
}

async function resolveSearch(query: string, requester: string, requesterTag: string): Promise<{ tracks: Track[] }> {
  // Use play.search first (youtube)
  try {
    const results = await play.search(query, { limit: 1, source: { youtube: 'video' } } as any);
    if (results && results.length > 0) {
      const v = results[0] as any;
      return {
        tracks: [
          {
            url: v.url,
            title: v.title || query,
            duration: v.durationInSec || 0,
            durationFormatted: formatDuration(v.durationInSec || 0),
            thumbnail: v.thumbnails?.[0]?.url || null,
            requester,
            requesterTag,
            source: 'youtube',
            channel: v.channel?.name,
          },
        ],
      };
    }
  } catch (e) {
    console.warn('[Resolver] play.search fail', (e as Error).message);
  }

  // Fallback yt-search via yt-dlp? Use play.search again with generic
  throw new Error(`Nenhum resultado encontrado para: ${query}`);
}

// ---- Spotify ----
let spotifyTokenCache: { token: string; expiresAt: number } | null = null;

async function getSpotifyToken(): Promise<string | null> {
  const id = process.env.SPOTIFY_CLIENT_ID;
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!id || !secret) return null;
  if (spotifyTokenCache && Date.now() < spotifyTokenCache.expiresAt - 60000) return spotifyTokenCache.token;
  try {
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });
    if (!res.ok) throw new Error(`Spotify token ${res.status}`);
    const data: any = await res.json();
    spotifyTokenCache = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
    return data.access_token;
  } catch (e) {
    console.warn('[Spotify] token fetch fail', (e as Error).message);
    return null;
  }
}

function parseSpotifyUrl(url: string): { type: string; id: string } | null {
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts.length >= 2 && ['track', 'playlist', 'album', 'artist'].includes(parts[0])) {
      return { type: parts[0], id: parts[1].split('?')[0] };
    }
  } catch {}
  return null;
}

async function fetchSpotifyViaAPI(url: string): Promise<any | null> {
  const parsed = parseSpotifyUrl(url);
  if (!parsed) return null;
  const token = await getSpotifyToken();
  if (!token) return null;
  try {
    if (parsed.type === 'track') {
      const res = await fetch(`https://api.spotify.com/v1/tracks/${parsed.id}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`track ${res.status}`);
      return await res.json();
    }
    if (parsed.type === 'playlist') {
      const res = await fetch(`https://api.spotify.com/v1/playlists/${parsed.id}?fields=name,tracks.items(track(name,artists(name),external_urls))&limit=50`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`playlist ${res.status}`);
      const data: any = await res.json();
      // Normalize to trackList format
      const tracks = data.tracks?.items?.map((i: any) => i.track).filter(Boolean) || [];
      return { name: data.name, type: 'playlist', trackList: tracks };
    }
    if (parsed.type === 'album') {
      const res = await fetch(`https://api.spotify.com/v1/albums/${parsed.id}?market=US`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`album ${res.status}`);
      const data: any = await res.json();
      return { name: data.name, type: 'album', trackList: data.tracks?.items || [] };
    }
  } catch (e) {
    console.warn('[Spotify] API fetch fail', (e as Error).message);
  }
  return null;
}

async function resolveSpotifyUrl(url: string, requester: string, requesterTag: string): Promise<{ tracks: Track[]; playlistTitle?: string }> {
  // 0 - Try Spotify API with credentials (most reliable for playlists)
  const apiData = await fetchSpotifyViaAPI(url);
  if (apiData) {
    if (apiData.type === 'track' || (apiData.name && apiData.artists)) {
      // Single track via API returns Spotify track object directly
      const trackObj: any = apiData.type === 'track' ? apiData : null;
      if (trackObj) {
        const q = `${trackObj.name} ${trackObj.artists.map((a: any) => a.name).join(', ')}`.trim();
        const yt = await resolveSearch(q, requester, requesterTag);
        if (yt.tracks[0]) {
          yt.tracks[0].source = 'spotify';
          yt.tracks[0].spotifyUrl = url;
        }
        return yt;
      }
    }
    if (apiData.trackList && apiData.trackList.length > 0) {
      return await spotifyTracksToYouTube(apiData.trackList, apiData.name || 'Spotify Playlist', url, requester, requesterTag);
    }
  }

  // 1 - Try spotify-url-info (scrape, no auth)
  try {
    const data: any = await spotify.getData(url);
    if (data) {
      // Single track
      if (data.type === 'track' || (data.name && data.artists && !data.tracks && !data.trackList)) {
        const title = data.name;
        const artist = Array.isArray(data.artists) ? data.artists.map((a: any) => a.name || a).join(', ') : (data.artist || '');
        const q = `${title} ${artist}`.trim();
        const yt = await resolveSearch(q, requester, requesterTag);
        if (yt.tracks[0]) {
          yt.tracks[0].source = 'spotify';
          yt.tracks[0].spotifyUrl = url;
        }
        return yt;
      }

      let tracksRaw: any[] = [];
      let playlistTitle = data.name || 'Spotify Playlist';
      if (data.trackList) tracksRaw = data.trackList;
      else if (data.tracks && Array.isArray(data.tracks)) tracksRaw = data.tracks;
      else if (data.tracks?.items) tracksRaw = data.tracks.items.map((i: any) => i.track || i);
      else if (Array.isArray(data)) tracksRaw = data;

      if (tracksRaw.length > 0) {
        return await spotifyTracksToYouTube(tracksRaw, playlistTitle, url, requester, requesterTag);
      }
    }
  } catch (e) {
    console.warn('[Resolver] spotify-url-info fail, fallback to oEmbed', (e as Error).message);
  }

  // Fallback: oEmbed + search via title, or try to handle playlist via oEmbed not enough
  // For robustness, try to use Spotify oEmbed to get title, then search
  try {
    const oembedRes = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`);
    if (oembedRes.ok) {
      const oembed: any = await oembedRes.json();
      const title = oembed.title || '';
      // title for track is usually "Track Name" or "Track - Artist"? For playlist it's playlist name
      // We'll use title as search query if not playlist
      if (url.includes('/track/')) {
        // oEmbed html title contains track name only, we can try to fetch via yt search with title
        // Try to enrich with artist via maybe fetching spotify embed page? Simplified: just search title
        if (title) {
          const yt = await resolveSearch(title, requester, requesterTag);
          if (yt.tracks[0]) {
            yt.tracks[0].source = 'spotify';
            yt.tracks[0].spotifyUrl = url;
            // Try to improve via playlist? not needed
          }
          return yt;
        }
      } else if (url.includes('/playlist/') || url.includes('/album/')) {
        // For playlist/album, oEmbed only gives playlist title, not tracks. We need alternative: try to fetch via spotify web API without auth? Fallback error with guidance
        // We'll attempt to use yt-dlp itself which can handle spotify playlists if credentials provided? But without credentials yt-dlp also needs auth
        // So we fallback to telling user to provide Spotify credentials or use YouTube
        throw new Error('Playlist/Album do Spotify requer Spotify Client ID. Use `/play` com nome da música ou link do YouTube, ou configure SPOTIFY_CLIENT_ID/SECRET no .env.');
      }
    }
  } catch (e: any) {
    if (e.message.includes('Playlist/Album')) throw e;
    console.warn('[Resolver] oEmbed fallback fail', e.message);
  }

  throw new Error('Não foi possível ler o link do Spotify. Verifique se é público ou use busca por nome. Para playlists, adicione SPOTIFY_CLIENT_ID e SPOTIFY_CLIENT_SECRET no .env.');
}

async function spotifyTracksToYouTube(tracksRaw: any[], playlistTitle: string, originalUrl: string, requester: string, requesterTag: string): Promise<{ tracks: Track[]; playlistTitle?: string }> {
  const limit = Math.min(tracksRaw.length, 30);
  const tracks: Track[] = [];
  for (let i = 0; i < limit; i++) {
    const t = tracksRaw[i];
    const name = t.name || t.title;
    const artist = t.artists ? (Array.isArray(t.artists) ? t.artists.map((a: any) => a.name || a).join(', ') : t.artists) : (t.artist || '');
    if (!name) continue;
    const q = `${name} ${artist}`.trim();
    try {
      const yt = await resolveSearch(q, requester, requesterTag);
      if (yt.tracks[0]) {
        yt.tracks[0].source = 'spotify';
        yt.tracks[0].spotifyUrl = t.external_urls?.spotify || originalUrl;
        tracks.push(yt.tracks[0]);
      }
    } catch (e) {
      console.warn('[Resolver] spotify track search fail', q, (e as Error).message);
    }
    if (i % 5 === 4) await new Promise((r) => setTimeout(r, 800));
  }
  if (tracks.length === 0) throw new Error('Nenhuma faixa do Spotify pôde ser resolvida no YouTube.');
  return { tracks, playlistTitle };
}

export async function getStream(track: Track) {
  await ensurePlayDl();

  // First try play-dl stream (fastest)
  try {
    const stream = await play.stream(track.url);
    // play.stream returns { stream, type } where type is 'opus' etc
    if (stream && (stream as any).stream) return stream;
  } catch (e) {
    console.warn('[Resolver] play.stream fail, fallback to yt-dlp', track.url, (e as Error).message);
  }

  // Fallback yt-dlp: get audio URL and create stream via yt-dlp exec piping
  // We use yt-dlp to get direct audio stream URL, then fetch via node to create readable, but easier: use yt-dlp to output to stdout
  // For @discordjs/voice we need a readable stream. We'll spawn yt-dlp to pipe bestaudio.
  // To keep interface compatible with Queue (which expects {stream, type}), we return a custom object.
  // However Queue currently does: const resource = createAudioResource(stream.stream, {inputType: stream.type})
  // So we need to provide {stream: Readable, type: VoiceBasedInputType}
  try {
    // Use yt-dlp to get bestaudio URL, then create a readable via fetch
    // Use exec to get url
    const result: any = await ytdlpExec(track.url, {
      getUrl: true,
      format: 'bestaudio[ext=m4a]/bestaudio/best',
      noWarnings: true,
      noPlaylist: true,
    } as any);

    let url: string | null = null;
    if (typeof result === 'string') url = result.trim().split('\n')[0];
    else if (result.stdout) url = result.stdout.trim().split('\n')[0];
    else if (Array.isArray(result)) url = result[0];

    if (url && url.startsWith('http')) {
      // Create a stream from the URL via yt-dlp pipe? Instead fetch via https
      // Use ytdlp to stream directly: we'll use yt-dlp's --output - to pipe
      // For simplicity, we fetch URL via node stream
      const res = await fetch(url);
      if (!res.ok || !res.body) throw new Error(`Fetch audio URL failed ${res.status}`);
      // Node fetch body is Web ReadableStream, need to convert to Node Readable
      // Use res.body as Node stream via Readable.fromWeb
      const { Readable } = await import('stream');
      let nodeStream: any;
      if ((Readable as any).fromWeb) {
        nodeStream = (Readable as any).fromWeb(res.body as any);
      } else {
        // Fallback: use res.arrayBuffer then create readable (not ideal for large)
        const buf = Buffer.from(await res.arrayBuffer());
        nodeStream = Readable.from(buf);
      }
      return { stream: nodeStream, type: 'arbitrary' } as any;
    }
  } catch (e) {
    console.error('[Resolver] yt-dlp url fetch fail', (e as Error).message);
  }

  // Last fallback: try yt-dlp exec piping directly (spawn)
  try {
    // Use yt-dlp's exec to create a child process streaming bestaudio
    // This returns a subprocess object with stdout
    const { spawn } = await import('child_process');
    const ytdlpPath = (await import('yt-dlp-exec')).default;
    // Instead, we try to use yt-dlp binary directly via spawn
    const bin = (await import('path')).join(process.cwd(), 'node_modules/yt-dlp-exec/bin/yt-dlp');
    // Use yt-dlp to output bestaudio to stdout piped to ffmpeg? Actually we need opus stream
    // We can spawn yt-dlp with -o - -f bestaudio --no-playlist and get stdout, then let prism handle?
    // For now, throw to trigger error handling in Queue
    throw new Error('yt-dlp piping not implemented, use URL fetch');
  } catch {}

  throw new Error(`Falha ao obter áudio para ${track.title}. Tente outra música ou verifique se o vídeo não é privado/restrito.`);
}
