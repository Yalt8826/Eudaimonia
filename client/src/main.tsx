import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./theme.css";
import App from "./App";
import { appOutbox, fetchTransport, HABIT_TAP_ENDPOINT, replayOnReconnect } from "./sw/queue";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if (import.meta.env.PROD) {
  // SW: cache-first shell + precached wake route (law 9). Dev skips it so
  // HMR never fights a stale worker.
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js", { type: "module" }).catch(() => {
      // a failed registration must never block the shell
    });
  }
  // the offline queue replays on reconnect, in order, same keys (law 9)
  replayOnReconnect(appOutbox(), fetchTransport(HABIT_TAP_ENDPOINT));
}
