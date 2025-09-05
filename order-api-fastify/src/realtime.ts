import type { WebSocket } from "ws";

const clients = new Set<WebSocket>();

export function addClient(socket: WebSocket) {
  clients.add(socket);
  socket.on("close", () => clients.delete(socket));
}

export function broadcast(event: string, data: unknown) {
  const payload = JSON.stringify({ event, data });
  for (const client of clients) client.send(payload);
}
