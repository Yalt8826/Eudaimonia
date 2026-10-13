// Replay triggers for the phone — the M3 port of the web wiring in
// client/src/sw/queue.ts replayOnReconnect + client/src/main.tsx.
//
// The web fired replay ONLY on the browser `online` event (which browsers
// also fire at page load). A native app has no `online` event, and the P2
// hardening spec names BOTH required paths: "flush on the sync event AND on
// next foreground — either path alone is a lost tap". The phone ports are:
//   - replayOnReconnect  ← the `online` event (expo-network state listener)
//   - replayOnForeground ← next foreground (AppState `active`)
//   - an immediate sync after each enqueue and at install — the port of the
//     browser firing `online` at page load, so an ONLINE tap round-trips
//     immediately instead of waiting for a connectivity change.
// The triggers adapt to the platform; the queue semantics they invoke are
// Outbox.replay, unchanged. Every trigger funnels through one serialized
// sync so concurrent triggers can never double-POST an event in-process.

import type { Outbox, ReplayResult, Transport } from "./queue";

export type SyncFn = () => Promise<ReplayResult>;

/**
 * The one sync funnel: replays are chained so overlapping triggers run
 * back-to-back, never concurrently. The transport resolves false rather
 * than throwing, but a rejected run must not wedge every future sync.
 */
export function createSyncScheduler(outbox: Outbox, transport: Transport): SyncFn {
  let chain: Promise<unknown> = Promise.resolve();
  return (): Promise<ReplayResult> => {
    const run = chain.then(() => outbox.replay(transport));
    chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };
}

/** The slice of react-native AppState the trigger needs (injected in tests). */
export interface AppStateLike {
  addEventListener(type: "change", listener: (state: string) => void): { remove(): void };
}

/** Flush on next foreground — the P2 "either path alone is a lost tap" leg. */
export function replayOnForeground(sync: SyncFn, appState: AppStateLike): () => void {
  const sub = appState.addEventListener("change", (state) => {
    if (state === "active") void sync();
  });
  return () => sub.remove();
}

export interface NetworkStateLike {
  isConnected?: boolean | null;
  isInternetReachable?: boolean | null;
}

/**
 * Flush when the device reports a reachable network — the port of the
 * browser `online` handler. isInternetReachable reads null on Android while
 * the network is being evaluated; isConnected true with reachability not
 * yet reported still triggers. An extra sync on a drained queue posts
 * nothing (and unreachable stays a normal state: replay resolves without
 * posting).
 */
export function replayOnReconnect(
  sync: SyncFn,
  subscribe: (listener: (state: NetworkStateLike) => void) => { remove(): void },
): () => void {
  const sub = subscribe((state) => {
    const reachable = state.isInternetReachable;
    if (reachable === true || (reachable == null && state.isConnected === true)) {
      void sync();
    }
  });
  return () => sub.remove();
}
