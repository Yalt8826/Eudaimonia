// The question lifecycle's client half (T2.5): GET /api/questions/open —
// the queue the /questions screen renders — and the ask dispatch
// (POST /api/questions/{id}/ask), which picks the question up server-side
// and settles it answered/open from the invocation outcome. The ask is a
// DIRECT dispatch, deliberately not outbox-queued: the lifecycle's single
// writer lives server-side, and an offline ask would either fire stale or
// sit picked_up forever. Unreachable resolves null; the screen says so —
// an unreachable server must never read as an empty queue.
import { apiUrl } from "./api";

export interface OpenQuestion {
  id: number;
  text: string;
  status: "open" | "picked_up";
  ts: string;
}

export interface OpenQuestions {
  questions: OpenQuestion[];
  count: number;
}

export const QUESTIONS_OPEN_ENDPOINT = "/api/questions/open";

export async function fetchOpenQuestions(
  fetchFn: typeof globalThis.fetch = globalThis.fetch,
): Promise<OpenQuestions | null> {
  try {
    const response = await fetchFn(apiUrl(QUESTIONS_OPEN_ENDPOINT));
    if (!(response.status >= 200 && response.status < 300)) return null;
    const body: unknown = await response.json();
    if (typeof body !== "object" || body === null) return null;
    const b = body as Record<string, unknown>;
    if (!Array.isArray(b.questions) || typeof b.count !== "number") return null;
    return {
      questions: b.questions.filter(
        (q): q is OpenQuestion =>
          typeof q === "object" &&
          q !== null &&
          typeof (q as OpenQuestion).id === "number" &&
          typeof (q as OpenQuestion).text === "string" &&
          ((q as OpenQuestion).status === "open" ||
            (q as OpenQuestion).status === "picked_up"),
      ),
      count: b.count,
    };
  } catch {
    return null;
  }
}

export type AskResult =
  | { status: "picked_up"; profile: string }
  | { status: "open"; reason: string }
  | null;

/** The ask dispatch. Resolves the picked-up receipt (the outcome arrives
 * server-side via the invocation) or null on any failure. */
export async function askQuestion(
  questionId: number,
  fetchFn: typeof globalThis.fetch = globalThis.fetch,
): Promise<AskResult> {
  try {
    const response = await fetchFn(apiUrl(`/api/questions/${questionId}/ask`), {
      method: "POST",
      headers: { "content-type": "application/json" },
    });
    if (!(response.status >= 200 && response.status < 300)) return null;
    const body: unknown = await response.json();
    if (typeof body !== "object" || body === null) return null;
    const b = body as Record<string, unknown>;
    if (b.status === "picked_up" && typeof b.profile === "string") {
      return { status: "picked_up", profile: b.profile };
    }
    if (b.status === "open" && typeof b.reason === "string") {
      return { status: "open", reason: b.reason };
    }
    return null;
  } catch {
    return null;
  }
}
