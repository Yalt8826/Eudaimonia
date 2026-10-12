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
