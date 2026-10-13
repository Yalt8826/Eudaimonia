import { Text } from "react-native";
import { cleanup, render, screen } from "@testing-library/react-native";
import { afterEach, describe, expect, it, jest } from "@jest/globals";

import { MOTION } from "../theme/motion";
import { ScreenFade } from "./ScreenFade";

// The shell's screen transition (01 §8): one fade, at the ONE §8 duration,
// and reduce-motion drops the travel without dropping the swap. The
// recording mock proves the duration actually asked of withTiming — the
// value that reaches the animator — not just the constant in a file.
//
// It recorded FadeIn.duration until 2026-10-14. That test passed while
// the fade did nothing on device: Reanimated's layout animations are not
// honoured here, and a screen recording showed the swap as a one-frame
// hard cut. A mock proves a value reaches an API; it cannot prove the API
// does anything. The device recording is the other half, and it lives in
// M4-MEASUREMENTS.md. The global
// stub (jest.reanimated-mock.js) has useReducedMotion return false; this
// file overrides it so BOTH branches are real. (jest.mock calls are
// hoisted above the imports by babel, so this ordering is equivalent.)

const mockCalls: number[] = [];
let mockReduce = false;

jest.mock("expo-router", () => {
  const actual = jest.requireActual("expo-router") as Record<string, unknown>;
  return { ...actual, usePathname: () => "/" };
});

jest.mock("react-native-reanimated", () => {
  // the stub is a plain-JS config file, deliberately outside the TS world
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const stub = require("./../../jest.reanimated-mock.js");
  return {
    ...stub,
    useReducedMotion: () => mockReduce,
    withTiming: (toValue: number, config?: { duration?: number }) => {
      if (config?.duration !== undefined) mockCalls.push(config.duration);
      return toValue;
    },
  };
});

afterEach(() => {
  cleanup();
  mockReduce = false;
});

describe("ScreenFade (01 §8 shell transition)", () => {
  it("fades the incoming screen at the §8 state-change duration", async () => {
    const before = mockCalls.length;
    // RNTL v14's render is a promise — await the mount before asserting
    await render(
      <ScreenFade>
        <Text>probe</Text>
      </ScreenFade>,
    );
    expect(mockCalls.slice(before)).toEqual([MOTION.stateChangeMs]);
    console.log(`screenfade: withTiming duration=${mockCalls[mockCalls.length - 1]}ms`);
  });

  it("reduce-motion drops the travel but still swaps the screen", async () => {
    mockReduce = true;
    const before = mockCalls.length;
    await render(
      <ScreenFade>
        <Text>probe</Text>
      </ScreenFade>,
    );
    // no animation was even built — the swap happens on the same frame
    expect(mockCalls.length).toBe(before);
    expect(screen.getByText("probe")).toBeOnTheScreen();
  });
});
