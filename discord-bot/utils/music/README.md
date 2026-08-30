# Music Module — YouTube + Spotify

E2E via `@discordjs/voice` + `play-dl` (search) + `yt-dlp-exec` (stream/info fallback) + `spotify-url-info` + Spotify Web API (opcional).

## Fluxo
- `Resolver.ts` unifica YouTube/Spotify → `Track[]`
  - YouTube video: `play.video_info` → fallback `yt-dlp dumpSingleJson`
  - YouTube playlist: `play.playlist_info` → fallback `yt-dlp flatPlaylist` (até 50)
  - Busca: `play.search` (YouTube)
  - Spotify track: `spotify-url-info` → fallback `oEmbed` → `play.search` → `source=spotify`
  - Spotify playlist/album: tenta Spotify API se `SPOTIFY_CLIENT_ID/SECRET` setados, senão `spotify-url-info` → senão erro orientando a configurar credenciais
  - `getStream`: `play.stream` → fallback `yt-dlp --get-url bestaudio` + `fetch` → `{stream, type:arbitrary}` (ffmpeg transcode)

- `Queue.ts` gerencia por guild: `VoiceConnection` + `AudioPlayer` + fila FIFO, auto-leave 5min, skip/stop/pause/resume/shuffle/volume

- `QueueManager.ts` singleton `Map<guildId, MusicQueue>`

## Comandos slash `/play` etc em `commands/music/*`
