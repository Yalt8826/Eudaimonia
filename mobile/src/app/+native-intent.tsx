// The scheme registration point (M5). expo-router reads exactly this
// special file (root of src/app) and calls its redirectSystemPath on every
// native deep link, cold or warm. Logic lives outside src/app so tests can
// import it without a test file ever entering the route tree (M3 defect 1:
// test code under src/app/ got bundled into the device build).
export { redirectSystemPath } from "../linking/wakeIntent";
