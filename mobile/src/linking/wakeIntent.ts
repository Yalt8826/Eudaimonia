// The deep-link scheme registration (M5, P6 T6.2's carried-over mapping).
//
// app.json declares the scheme `web+eudaimonia` (WHATWG `web+`-prefixed
// form, adopted at TWA day per the frozen decisions). The launcher surfaces
// — and P6 T6.2's protocolHandlers entry specifies — the SHORT link
// `web+eudaimonia://wake`, but the wake route is `/habits/wake` (04 route
// table; expo-router would read the short link's host as a `/wake` path
// that matches no screen). This module rewrites the short link onto the
// ONE wake route. 02 §6: both registration paths must resolve to the same
// precached wake route — a deep link never becomes a second wake surface;
// law 9 binds whichever URL the scheme lands on. The long form
// `web+eudaimonia://habits/wake` already extracts to the right path by
// expo-router's default host+path rule, so it passes through untouched.
export const WAKE_SCHEME = "web+eudaimonia";
export const WAKE_DEEP_LINK = `${WAKE_SCHEME}://wake`;
export const WAKE_ROUTE = "/habits/wake";

// Host "wake", optional trailing slash, optional query string. Nothing else
// about the scheme is rewritten: unknown hosts pass through so a typo'd or
// future link degrades to expo-router's default handling, never to wake.
const WAKE_SHORT_LINK = new RegExp(
  `^${WAKE_SCHEME.replace("+", "\\+")}://wake/?($|\\?.*)`,
);

/**
 * redirectSystemPath handler (src/app/+native-intent.tsx re-exports this).
 * expo-router calls it on cold start (initial: true) and on warm links
 * (initial: false) with the raw incoming URL/path; the returned path is
 * what gets routed.
 */
export function redirectSystemPath({
  path,
}: {
  path: string;
  initial: boolean;
}): string {
  const match = WAKE_SHORT_LINK.exec(path);
  if (!match) {
    return path;
  }
  return `${WAKE_ROUTE}${match[1]}`;
}
