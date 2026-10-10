import { Outlet, Route, Routes } from "react-router-dom";
import { BubbleCluster } from "../components/BubbleCluster";
import { TornSheet } from "../components/TornSheet";
import { PlazaScreen } from "./PlazaScreen";
import { SettingsScreen } from "./SettingsScreen";
import { WakeScreen } from "./WakeScreen";

// The full route map of 04-screens-pwa.md, every route a P0 stub that
// renders its route name — a route missing now is a 404 the two-tap law
// trips over in P1. The bubble cluster (global chrome, 04) rides the Shell
// layout route so it is structurally present on every screen EXCEPT
// /habits/wake, which sits outside the Shell and renders zero chrome.
// Stubs render on a cream TornSheet — the design spike's surface proof;
// T1.6 replaces them with the real per-tint strips.

function Stub({ name }: { name: string }) {
  return (
    <main data-stub={name} style={{ padding: "1.25rem 1rem", display: "grid", gap: "1rem" }}>
      <TornSheet tint="cream" seed={name}>
        <h1>{name}</h1>
      </TornSheet>
    </main>
  );
}

function Shell() {
  return (
    <>
      <Outlet />
      <BubbleCluster />
    </>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      {/* hard-mode: bare, precached, never inside the Shell (law 9) */}
      <Route path="/habits/wake" element={<WakeScreen />} />
      <Route element={<Shell />}>
        <Route path="/" element={<PlazaScreen />} />
        <Route path="/inbox" element={<Stub name="Inbox" />} />
        <Route path="/week/:iso" element={<Stub name="Week" />} />
        <Route path="/questions" element={<Stub name="Questions" />} />
        <Route path="/timeline" element={<Stub name="Timeline" />} />
        <Route path="/reading" element={<Stub name="Reading" />} />
        <Route path="/meals" element={<Stub name="Meals" />} />
        <Route path="/agents" element={<Stub name="Agents" />} />
        <Route path="/server" element={<Stub name="Server" />} />
        <Route path="/capture" element={<Stub name="Capture" />} />
        <Route path="/notes" element={<Stub name="Notes" />} />
        <Route path="/mail" element={<Stub name="Mail" />} />
        <Route path="/projects" element={<Stub name="Projects" />} />
        <Route path="/projects/:id" element={<Stub name="Project" />} />
        <Route path="/goals" element={<Stub name="Goals" />} />
        <Route path="/routine" element={<Stub name="Routine" />} />
        <Route path="/chat" element={<Stub name="Chat" />} />
        <Route path="/chat/:profile" element={<Stub name="Chat profile" />} />
        <Route path="/settings" element={<SettingsScreen />} />
      </Route>
    </Routes>
  );
}
