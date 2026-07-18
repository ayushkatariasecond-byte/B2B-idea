import { Server as HttpServer } from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';
import { env } from './env';

interface TokenPayload {
  sub: string;
}

const connections = new Map<string, Set<WebSocket>>();

/** Attaches a WebSocket server at /ws to the given HTTP server, authenticating each connection via ?token=<jwt>. */
export function setupRealtime(server: HttpServer) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    const token = new URL(req.url ?? '', 'http://localhost').searchParams.get('token');
    if (!token) {
      ws.close();
      return;
    }

    let businessId: string;
    try {
      businessId = (jwt.verify(token, env.jwtSecret) as TokenPayload).sub;
    } catch {
      ws.close();
      return;
    }

    if (!connections.has(businessId)) connections.set(businessId, new Set());
    connections.get(businessId)!.add(ws);

    ws.on('close', () => {
      connections.get(businessId)?.delete(ws);
    });
  });

  return wss;
}

/** Best-effort push to every open connection for a business — never throws, just a no-op if nobody's connected. */
export function sendToBusiness(businessId: string, event: Record<string, unknown>) {
  const sockets = connections.get(businessId);
  if (!sockets || sockets.size === 0) return;
  const payload = JSON.stringify(event);
  for (const ws of sockets) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  }
}
