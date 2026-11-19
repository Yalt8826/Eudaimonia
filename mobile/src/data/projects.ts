// The projects read model (T3.6): the board's rows — status, parked-since
// evidence, payload-queried linked work. Status transitions ride the
// outbox (project_status is a registered kind; the door's posts carry
// actor=human by construction, which is what makes the parked gate hold).
// Progress is derived, never stored — there is no percentage anywhere.
import { apiUrl } from "./api";
import { appOutbox } from "./appOutbox";

export type ProjectStatus = "active" | "parked" | "done";

export interface ProjectRow {
  project_id: number;
  name: string;
  status: ProjectStatus;
  board_glob: string | null;
  parked_since: string | null;
  last_activity: string | null;
  linked_work: { open: number; resolved: number } | null;
  board_health: Record<string, unknown> | null;
}

export const PROJECTS_ENDPOINT = "/api/projects";

/** A project with no board renders NO health line — absence is data
    (law 7). This helper makes that omission explicit for the screen. */
export function hasBoardHealth(project: ProjectRow): boolean {
  return project.board_health !== null;
}

export async function fetchProjects(
  fetchFn: typeof globalThis.fetch = globalThis.fetch,
): Promise<ProjectRow[] | null> {
  try {
    const response = await fetchFn(apiUrl(PROJECTS_ENDPOINT));
    if (!(response.status >= 200 && response.status < 300)) return null;
    const b = (await response.json()) as { projects?: unknown };
    if (!Array.isArray(b.projects)) return null;
    const out: ProjectRow[] = [];
    for (const raw of b.projects as Record<string, unknown>[]) {
      if (
        typeof raw.project_id !== "number" ||
        typeof raw.name !== "string" ||
        (raw.status !== "active" && raw.status !== "parked" && raw.status !== "done")
      ) {
        continue;
      }
      out.push({
        project_id: raw.project_id,
        name: raw.name,
        status: raw.status,
        board_glob: typeof raw.board_glob === "string" ? raw.board_glob : null,
        parked_since: typeof raw.parked_since === "string" ? raw.parked_since : null,
        last_activity: typeof raw.last_activity === "string" ? raw.last_activity : null,
        linked_work:
          typeof raw.linked_work === "object" && raw.linked_work !== null
            ? (raw.linked_work as { open: number; resolved: number })
            : null,
        board_health:
          typeof raw.board_health === "object" && raw.board_health !== null
            ? (raw.board_health as Record<string, unknown>)
            : null,
      });
    }
    return out;
  } catch {
    return null;
  }
}

/** A status transition through the outbox. The door's posts carry
    actor=human by construction — which is what lets park/un-park through
    the fold's gate (law 5: parked is human-only, both directions). */
export async function writeProjectStatus(project_id: number, status: ProjectStatus): Promise<void> {
  if (!Number.isInteger(project_id) || project_id <= 0) return;
  const box = appOutbox();
  await box.outbox.enqueue("project_status", { project_id, status });
  await box.sync().catch(() => undefined);
}
