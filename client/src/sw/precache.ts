// The precache manifest (02 §2 law 9): the app shell and the wake route are
// installed together with the worker, so /habits/wake renders with the
// network gone. The service worker (sw.ts) installs exactly this list.

export const PRECACHE_URLS: readonly string[] = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/habits/wake",
  "/icons/icon.svg",
];
