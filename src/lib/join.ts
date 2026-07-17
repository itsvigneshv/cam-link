import { normalizeRoomCode } from "./rooms";

/** Build a phone join URL. Prefer hash so QR scanners keep the room code. */
export function buildPhoneJoinUrl(origin: string, roomCode: string): string {
  const code = normalizeRoomCode(roomCode);
  const base = origin.replace(/\/$/, "");
  return `${base}/phone#${code}`;
}

/** Desktop control panel for the same room (photo / record on phone). */
export function buildDesktopControlUrl(origin: string, roomCode: string): string {
  const code = normalizeRoomCode(roomCode);
  const base = origin.replace(/\/$/, "");
  return `${base}/desktop#${code}`;
}

export function readRoomFromLocation(
  searchParams: URLSearchParams,
  hash: string,
): string {
  const fromQuery = normalizeRoomCode(searchParams.get("room") ?? "");
  if (fromQuery) return fromQuery;
  const fromHash = normalizeRoomCode(hash.replace(/^#/, ""));
  return fromHash;
}
