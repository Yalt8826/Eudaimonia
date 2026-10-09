import { PRECACHE_URLS } from "./precache";

// Service worker (02 §4 PWA contract; law 9): cache-first for same-origin
// GET with network fallback, and an index.html fallback for navigations the
// cache has never seen. The data plane (/api/*) is never touched — it is
// tailnet-only and never cacheable; the queued-POST replay lives in
// queue.ts and rides the normal fetch path, never this cache.

// Minimal typed surface of the worker scope: the DOM lib does not ship the
// service-worker event types, and mixing in the webworker lib would clash
// with the DOM globals the app itself uses. One typed boundary, used below.
interface WorkerLifeCycleEvent extends Event {
  waitUntil(promise: Promise<void>): void;
}

interface WorkerFetchEvent extends Event {
  readonly request: Request;
  respondWith(value: Promise<Response>): void;
}

interface ServiceWorkerScope {
  readonly location: Location;
  skipWaiting(): Promise<void>;
  clients: { claim(): Promise<void> };
  addEventListener(type: "install", listener: (event: WorkerLifeCycleEvent) => void): void;
  addEventListener(type: "activate", listener: (event: WorkerLifeCycleEvent) => void): void;
  addEventListener(type: "fetch", listener: (event: WorkerFetchEvent) => void): void;
}

const CACHE_NAME = "eudaimonia-shell-v1";

// `self` is typed as Window under the DOM lib; inside the worker bundle it
// is the service worker scope. One cast at the boundary, typed use below.
const worker = self as unknown as ServiceWorkerScope;

worker.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll([...PRECACHE_URLS]);
      await worker.skipWaiting();
    })(),
  );
});

worker.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)));
      await worker.clients.claim();
    })(),
  );
});

worker.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== worker.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  event.respondWith(
    (async () => {
      const cached = await caches.match(request, { ignoreSearch: true });
      if (cached !== undefined) return cached;
      try {
        const response = await fetch(request);
        if (response.ok) {
          const copy = response.clone();
          void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      } catch {
        // Offline and never cached: navigations fall back to the shell,
        // everything else fails honestly.
        if (request.mode === "navigate") {
          const shell = await caches.match("/index.html");
          if (shell !== undefined) return shell;
        }
        return Response.error();
      }
    })(),
  );
});
