// The Shell, ported from client/src/routes/routes.tsx: the bubble cluster
// (global chrome, 04) rides the Shell layout so it is structurally present
// on every screen EXCEPT /habits/wake, which sits outside this group and
// renders zero chrome (law 9).
//
// M4: screens swap through ScreenFade (01 §8 — the shell's one transition,
// 160ms, reduce-motion-aware). The cluster is chrome and sits OUTSIDE the
// fade, so it never blinks on navigation.
import { Slot } from "expo-router";
import { BubbleCluster } from "../../navigation/BubbleCluster";
import { ScreenFade } from "../../navigation/ScreenFade";

export default function ShellLayout() {
  return (
    <>
      <ScreenFade>
        <Slot />
      </ScreenFade>
      <BubbleCluster />
    </>
  );
}
