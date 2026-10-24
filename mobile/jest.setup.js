/**
 * Jest setup — module mocks for the two native-drawing libraries the Plaza
 * rides. jest-expo has no renderer for either: @shopify/react-native-skia
 * draws through a native GPU context and react-native-svg through native
 * SVG views, so under jest they are replaced by inert stand-ins. The
 * structural suites (routes, model, greeting, theme) exercise the RN tree
 * around them — the pixel-level proofs are the measured harness in
 * mobile/renders/, which runs against real device screenshots, not mocks.
 *
 * The Skia mock is a Proxy: any component renders null, and the small
 * surface TornSheet touches at render time (Skia.PathBuilder) is a
 * chainable no-op. Deliberately shallow — a mock that draws would be
 * asserting against a second renderer.
 *
 * (Plain JS: setupFiles run before the TS/typecheck world, and keeping this
 * out of tsc lets the mocks use untyped Proxies freely.)
 */

/* eslint-disable */
// M4: react-native-gesture-handler's jestSetup replaces the native module
// and the host gesture detector with inert stand-ins (GestureDetector
// renders children; gesture callbacks fire only through fireGestureHandler).
//
// The Reanimated stub (jest.reanimated-mock.js — self-contained; see its
// header for why the official mock cannot be used) is registered HERE, for
// the bare specifier AND the /mock subpath. The subpath mock is the
// load-bearing one: expo-router's testing-library jest.mocks bare
// 'react-native-reanimated' when it loads (AFTER this file, so it wins the
// bare slot) with a factory that requires 'react-native-reanimated/mock' —
// which does not resolve under this preset's custom resolver, so its catch
// returned {} and RNGH's import-time Reanimated.default.
// createAnimatedComponent detonated every route-tree render. With the
// subpath mocked, that factory receives the real stub instead.
require("react-native-gesture-handler/jestSetup");
jest.mock("react-native-reanimated/mock", () =>
  require("./jest.reanimated-mock.js"),
);
jest.mock("react-native-reanimated", () =>
  require("./jest.reanimated-mock.js"),
);

jest.mock("@shopify/react-native-skia", () => {
  const chainable = {};
  for (const m of ["moveTo", "lineTo", "close"]) chainable[m] = () => chainable;
  const pathBuilder = { ...chainable, build: () => ({ __skPath: true }) };

  const proxyComponent = new Proxy(function () {}, {
    apply: () => null,
    construct: () => ({}),
  });

  const Skia = {
    PathBuilder: { Make: () => pathBuilder },
    Path: { Make: () => ({ __skPath: true }) },
  };

  const exports = new Proxy(
    {
      Skia,
      useImage: () => null,
      useFont: () => null,
      useFonts: () => [true],
      makeImageFromView: async () => null,
      Mix: () => 0,
      vec: (x, y) => ({ x, y }),
    },
    {
      get(target, prop) {
        if (prop in target) return target[prop];
        return proxyComponent; // Canvas, Fill, Group, Path, Rect, Text, …
      },
    },
  );
  return exports;
});

jest.mock("react-native-svg", () => {
  const Null = () => null;
  return new Proxy({ __esModule: true, default: Null }, { get: (t, p) => (p in t ? t[p] : Null) });
});

// Same rule for the three native data modules M3 added (jest cannot load
// their native code): inert stand-ins so route rendering never touches a
// real database. The data layer itself is NOT tested through these mocks —
// src/data tests bind the real SQL to node:sqlite and inject fake
// transports/clocks, so queue semantics are measured against a real
// SQLite engine, never against stand-ins.
jest.mock("expo-sqlite", () => ({
  openDatabaseSync: () => ({
    execSync: () => {},
    runSync: () => ({ changes: 0, lastInsertRowId: 0 }),
    getAllSync: () => [],
    getFirstSync: () => null,
  }),
}));
jest.mock("expo-crypto", () => ({
  randomUUID: () => "00000000-0000-4000-8000-000000000000",
}));
jest.mock("expo-network", () => ({
  addNetworkStateListener: () => ({ remove: () => {} }),
  getNetworkStateAsync: async () => ({ isConnected: null, isInternetReachable: null }),
}));

// Fonts: the root layout GATES the first mount on font readiness (the
// perf fix — one mount instead of three). Under jest, expo-font's
// useFonts never resolves (no native asset registry), which would leave
// every route test staring at the boot hold. Faces settle immediately in
// tests; the failure-degradation path is exercised by the type system
// (loaded || error) and by the device, not by mocks that draw.
jest.mock("expo-font", () => {
  const actual = jest.requireActual("expo-font");
  return { ...actual, useFonts: () => [true, null] };
});
