// The Shell, ported from client/src/routes/routes.tsx: the bubble cluster
// (global chrome, 04) rides the Shell layout so it is structurally present
// on every screen EXCEPT /habits/wake, which sits outside this group and
// renders zero chrome (law 9).
import { Slot } from "expo-router";
import { ChromePlaceholder } from "../../navigation/ChromePlaceholder";

export default function ShellLayout() {
  return (
    <>
      <Slot />
      <ChromePlaceholder />
    </>
  );
}
