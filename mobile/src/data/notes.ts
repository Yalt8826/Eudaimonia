// The notes read model's client half (T2.4): GET /api/notes/recent —
// each note with its honest write-back state: staged (waiting for the
// applier) or applied (with the vault line ref). Unreachable resolves
// null; the screen keeps its previous state and says nothing false.
import { apiUrl } from "./api";

export interface RecentNote {
  note_id: number;
  external_ref: string;
  ts: string;
  text: string;
  state: "staged" | "applied";
  vault_ref: string | null;
}

export const NOTES_RECENT_ENDPOINT = "/api/notes/recent";

export async function fetchRecentNotes(
  fetchFn: typeof globalThis.fetch = globalThis.fetch,
): Promise<RecentNote[] | null> {
  try {
    const response = await fetchFn(apiUrl(NOTES_RECENT_ENDPOINT));
    if (!(response.status >= 200 && response.status < 300)) return null;
    const body: unknown = await response.json();
    if (typeof body !== "object" || body === null) return null;
    const notes = (body as Record<string, unknown>).notes;
    if (!Array.isArray(notes)) return null;
    return notes.filter(
      (n): n is RecentNote =>
        typeof n === "object" &&
        n !== null &&
        typeof (n as RecentNote).note_id === "number" &&
        typeof (n as RecentNote).text === "string" &&
        ((n as RecentNote).state === "staged" ||
          (n as RecentNote).state === "applied"),
    );
  } catch {
    return null;
  }
}
