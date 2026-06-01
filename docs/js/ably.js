import { ABLY_API_KEY } from "./config.js";

let _client = null;

export async function getClient() {
  if (_client) return _client;
  if (!window.Ably) throw new Error("Ably SDK not loaded");
  _client = new window.Ably.Realtime({
    key: ABLY_API_KEY,
    clientId: "qp-" + Math.random().toString(36).slice(2, 10),
  });
  await _client.connection.once("connected");
  return _client;
}

export async function getChannel(name) {
  const client = await getClient();
  return client.channels.get(name);
}

export const CH_LOBBY_INDEX = "lobbies:index";
export const CH_LOBBY = (roomId) => `lobby:${roomId}`;
