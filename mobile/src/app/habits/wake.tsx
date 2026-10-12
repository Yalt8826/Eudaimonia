// M1 stub of the wake screen. HARD-MODE (law 9): this file sits OUTSIDE the
// (shell) group, so it renders zero chrome — the routes test asserts the
// cluster is structurally absent here. The precache + offline contract is
// M3; the real wake UI ports with it.
import { Stub } from "../../screens/Stub";

export default function WakeScreen() {
  return <Stub name="I'M AWAKE" />;
}
