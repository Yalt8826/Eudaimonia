// The Shell, ported from client/src/routes/routes.tsx: the bubble cluster
// (global chrome, 04) rides the Shell layout so it is structurally present
// on every screen EXCEPT /habits/wake, which sits outside this group and
// renders zero chrome (law 9).
//
// NO SCREEN TRANSITION. M4 shipped one — ScreenFade, a 160ms fade on the
// incoming screen — and then measured it on device, at 60fps, and found
// it invisible in both directions:
//
//   Plaza -> Settings   luma 122.6 -> 11.0 in ONE frame (the outgoing
//                       screen has no exit animation; it just vanishes)
//   Settings -> Plaza   luma  11.0 -> 108 in ONE frame, then 108 -> 122
//                       later (the fade finished before the incoming
//                       screen's first paint; it animated an empty view)
//
// Both halves are structural, not a tuning problem. `<Slot/>` unmounts the
// old screen immediately, so there is nothing to fade FROM, and the new
// screen's content — Skia sheets especially — paints well after the 160ms
// window closes. Making it visible would mean holding the outgoing screen
// until the incoming one paints, which buys a 160ms polish at the price of
// real latency on a dashboard.
//
// So it is gone rather than kept as decoration nobody can see with two
// tests asserting it exists. 01 §8 permits motion on interaction; it does
// not require screen transitions. The radial nav is where this client's
// motion lives, and that one is measured working.
//
// If M5's dev build changes the timing picture, reinstating this needs the
// missing half too: an exit animation on the outgoing screen.
import { Slot } from "expo-router";
import { BubbleCluster } from "../../navigation/BubbleCluster";

export default function ShellLayout() {
  return (
    <>
      <Slot />
      <BubbleCluster />
    </>
  );
}
