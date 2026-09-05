import http from 'http';
import fs from 'fs';
import path from 'path';
import { WebSocket, WebSocketServer } from 'ws';
import { applyAction, getRoom, pushLog, snapshot, sweepRooms } from './rooms';

const PUBLIC_DIR = path.join(__dirname, 'public');
const STATIC: Record<string, string> = { 'arena.js': 'text/javascript; charset=utf-8' };
// ponytail: http stdlib + ws; sem express. O comando /arena sobe isso preguiçosamente (singleton).

let started: { server: http.Server; wss: WebSocketServer; port: number } | null = null;
const sockets = new Map<string, Set<WebSocket>>();
const socketPlayer = new Map<WebSocket, { roomId: string; playerId: string }>();

export function broadcastState(roomId: string) {
    const room = getRoom(roomId);
    if (!room) return;
    for (const ws of sockets.get(roomId) ?? []) {
        if (ws.readyState !== WebSocket.OPEN) continue;
        const who = socketPlayer.get(ws);
        const snap = who ? snapshot(room, who.playerId) : null;
        if (snap) ws.send(JSON.stringify({ t: 'state', ...snap }));
    }
}

function roomSockets(roomId: string): Set<WebSocket> {
    let s = sockets.get(roomId);
    if (!s) {
        s = new Set();
        sockets.set(roomId, s);
    }
    return s;
}

function serveFile(res: http.ServerResponse, file: string, type: string) {
    fs.readFile(path.join(PUBLIC_DIR, file), (err, buf) => {
        if (err) {
            res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
            res.end('erro ao ler arquivo');
            return;
        }
        res.writeHead(200, { 'content-type': type, 'cache-control': 'public, max-age=60' });
        res.end(buf);
    });
}

const LOBBY_404 = `<!doctype html><meta charset="utf-8"><body style="background:#111;color:#eee;font-family:sans-serif;padding:40px"><h1>Sala expirada ou inexistente</h1><p>Peça um novo <b>/arena</b> no Discord. Salas duram 4h sem movimento.</p>`;

function handler(req: http.IncomingMessage, res: http.ServerResponse) {
    if (req.method !== 'GET') {
        res.writeHead(405, { 'content-type': 'text/plain' });
        res.end('method not allowed');
        return;
    }
    const url = new URL(req.url ?? '/', 'http://x');
    const parts = url.pathname.split('/').filter(Boolean); // ['arena', roomId, ...]
    if (parts[0] !== 'arena' || !parts[1]) {
        res.writeHead(404, { 'content-type': 'text/plain' });
        res.end('not found');
        return;
    }
    const room = getRoom(parts[1]);
    if (parts.length === 2) {
        if (!room) {
            res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
            res.end(LOBBY_404);
            return;
        }
        return serveFile(res, 'arena.html', 'text/html; charset=utf-8');
    }
    if (parts.length === 4 && parts[2] === 'assets' && STATIC[parts[3]]) {
        return serveFile(res, parts[3], STATIC[parts[3]]);
    }
    if (parts.length === 3 && parts[2] === 'state') {
        if (!room) {
            res.writeHead(404, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ error: 'sala expirada' }));
            return;
        }
        const playerId = room.keys.get(url.searchParams.get('key') ?? '');
        const snap = playerId ? snapshot(room, playerId) : null;
        if (!snap) {
            res.writeHead(401, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ error: 'link inválido' }));
            return;
        }
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ t: 'state', ...snap }));
        return;
    }
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
}

export function ensureArenaServer(): { port: number } {
    if (started) return { port: started.port };
    const port = Number(process.env.ARENA_PORT || 3000);
    const server = http.createServer(handler);
    const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 }); // ações são JSON minúsculos

    server.on('upgrade', (req, socket, head) => {
        const url = new URL(req.url ?? '/', 'http://x');
        const parts = url.pathname.split('/').filter(Boolean);
        const room = parts[0] === 'arena' && parts[1] ? getRoom(parts[1]) : undefined;
        const playerId = room?.keys.get(url.searchParams.get('key') ?? '');
        if (!room || !playerId) {
            socket.write('HTTP/1.1 4404 Sala ou link inválido\r\nConnection: close\r\n\r\n');
            socket.destroy();
            return;
        }
        wss.handleUpgrade(req, socket, head, (ws) => {
            wss.emit('connection', ws, room.id, playerId);
        });
    });

    wss.on('connection', (ws: WebSocket, roomId: string, playerId: string) => {
        roomSockets(roomId).add(ws);
        socketPlayer.set(ws, { roomId, playerId });
        broadcastState(roomId);
        ws.on('message', (raw) => {
            const room = getRoom(roomId);
            if (!room) {
                ws.send(JSON.stringify({ t: 'error', error: 'sala expirada' }));
                return;
            }
            let msg: any;
            try {
                msg = JSON.parse(String(raw));
            } catch {
                ws.send(JSON.stringify({ t: 'error', error: 'ação inválida' }));
                return;
            }
            const r = applyAction(room, playerId, msg);
            if (!r.ok) {
                ws.send(JSON.stringify({ t: 'error', error: r.error }));
                return;
            }
            if (r.dice) {
                const line = JSON.stringify({ t: 'dice', ...r.dice });
                for (const s of roomSockets(roomId)) {
                    if (s.readyState === WebSocket.OPEN) s.send(line);
                }
            }
            broadcastState(roomId);
        });
        const drop = () => {
            roomSockets(roomId).delete(ws);
            socketPlayer.delete(ws);
        };
        ws.on('close', drop);
        ws.on('error', drop);
    });

    setInterval(() => {
        for (const id of sweepRooms()) {
            for (const ws of sockets.get(id) ?? []) {
                try {
                    ws.send(JSON.stringify({ t: 'error', error: 'sala expirada por inatividade' }));
                    ws.close();
                } catch { /* sala já foi */ }
            }
            sockets.delete(id);
        }
    }, 15 * 60 * 1000).unref();

    server.listen(port, () => {
        const addr = server.address();
        if (started && typeof addr === 'object' && addr) started.port = addr.port;
    });
    const addr = server.address();
    started = { server, wss, port: typeof addr === 'object' && addr ? addr.port : port };
    console.log(`[Arena] mesa em http://localhost:${started.port}/arena/:sala`);
    return { port: started.port };
}

export function arenaPort(): number {
    return started?.port ?? Number(process.env.ARENA_PORT || 3000);
}

export function getArenaBaseUrl(): string {
    const env = (process.env.ARENA_BASE_URL ?? '').replace(/\/$/, '');
    if (env) return env;
    return `http://localhost:${started?.port ?? Number(process.env.ARENA_PORT || 3000)}`;
}

export function pushRoomLog(roomId: string, line: string) {
    const room = getRoom(roomId);
    if (!room) return;
    pushLog(room, line);
    broadcastState(roomId);
}
