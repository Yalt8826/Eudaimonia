// Capture-mode flag, set during PlazaScreen's render and read by the
// bubble cluster in the SAME commit. The query-param route (useGlobalSearchParams
// in the cluster) races on a cold-start deep link: the shell layout can
// mount before the link's query resolves, and the cluster then shows over
// a capture band. React renders the shell's children in order — Slot (the
// screen) before the cluster — so a flag written by the screen's render is
// always current when the cluster reads it. Not elegant; deterministic.

export const captureMode = { active: false };
