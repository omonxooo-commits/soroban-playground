import { WebSocketServer } from 'ws';
import { invokeProgressBus } from './services/invokeService.js';

const clients = new Set();

export function setupWebsocketServer(httpServer) {
  const wss = new WebSocketServer({
    server: httpServer,
    path: '/ws',
  });

  wss.on('connection', (socket, request) => {
    const authHeader = request.headers.authorization || '';
    const tokenFromQuery = new URL(
      request.url,
      'http://localhost'
    ).searchParams.get('token');
    const token = authHeader.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length)
      : tokenFromQuery;

    if (process.env.WS_AUTH_TOKEN && token !== process.env.WS_AUTH_TOKEN) {
      socket.close(1008, 'Unauthorized');
      return;
    }

    clients.add(socket);
    socket.send(
      JSON.stringify({
        type: 'connected',
        timestamp: new Date().toISOString(),
      })
    );

    socket.on('close', () => {
      clients.delete(socket);
    });
  });

  invokeProgressBus.on('progress', (event) => {
    const message = JSON.stringify({ type: 'invoke-progress', ...event });
    for (const socket of clients) {
      if (socket.readyState === socket.OPEN) {
        socket.send(message);
      }
    }
  });

  return wss;
}
