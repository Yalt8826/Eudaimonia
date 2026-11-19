// The reading queue's read model (T3.1): one row per unique digest
// paper, the digest's paused banner from recorded job_paused evidence.
// Status and rating writes ride the outbox (registered kinds
// reading_status / rating_staged) so they queue offline like every other
// write; the list itself needs the server — unreachable renders
// honestly, never a fabricated queue.
import { apiUrl } from "./api";
import { appOutbox } from "./appOutbox";

export interface ReadingItem {
  arxiv_id: string;
  title: string;
  edition_date: string | null;
  status: "new" | "skimmed" | "digested" | "dismissed";
  rating: number | null;
  staged_ts: string | null;
  ts: string;
}

export interface ReadingBanner {
  paused: boolean;
  since?: string;
  actor?: string;
}

export interface ReadingQueue {
  banner: ReadingBanner;
  items: ReadingItem[];
}

export const READING_QUEUE_ENDPOINT = "/api/reading/queue";

/** The client-side validation mirror of the server's (the outbox must
    not queue an event the door will 422 — that poisons the drain). */
export function validArxivId(id: string): boolean {
  return /^[a-z0-9.\-/]{4,64}$/.test(id);
}

export async function fetchReadingQueue(
  fetchFn: typeof globalThis.fetch = globalThis.fetch,
): Promise<ReadingQueue | null> {
  try {
    const response = await fetchFn(apiUrl(READING_QUEUE_ENDPOINT));
    if (!(response.status >= 200 && response.status < 300)) return null;
    const b = (await response.json()) as Record<string, unknown>;
    const banner = b.banner as Record<string, unknown> | undefined;
    const items = b.items;
    if (!Array.isArray(items) || typeof banner !== "object" || banner === null) return null;
    const parsed: ReadingItem[] = [];
    for (const raw of items as Record<string, unknown>[]) {
      if (
        typeof raw.arxiv_id !== "string" ||
        typeof raw.title !== "string" ||
        typeof raw.status !== "string"
      ) {
        continue;
      }
      parsed.push({
        arxiv_id: raw.arxiv_id,
        title: raw.title,
        edition_date: typeof raw.edition_date === "string" ? raw.edition_date : null,
        status: raw.status as ReadingItem["status"],
        rating: typeof raw.rating === "number" ? raw.rating : null,
        staged_ts: typeof raw.staged_ts === "string" ? raw.staged_ts : null,
        ts: typeof raw.ts === "string" ? raw.ts : "",
      });
    }
    return {
      banner: {
        paused: banner.paused === true,
        since: typeof banner.since === "string" ? banner.since : undefined,
        actor: typeof banner.actor === "string" ? banner.actor : undefined,
      },
      items: parsed,
    };
  } catch {
    return null;
  }
}

/** Queue a status transition (the outbox; the drain lands the event and
    the server folds the row). */
export async function writeReadingStatus(arxiv_id: string, status: ReadingItem["status"]): Promise<void> {
  if (!validArxivId(arxiv_id)) return;
  const box = appOutbox();
  await box.outbox.enqueue("reading_status", { arxiv_id, status });
  await box.sync().catch(() => undefined);
}

/** Queue a 1-5 rating tap — stages only; nothing leaves SQLite in P3. */
export async function writeRating(arxiv_id: string, rating: number): Promise<void> {
  if (!validArxivId(arxiv_id)) return;
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return;
  const box = appOutbox();
  await box.outbox.enqueue("rating_staged", { arxiv_id, rating });
  await box.sync().catch(() => undefined);
}
