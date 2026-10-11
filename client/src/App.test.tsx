import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import App from "./App";

afterEach(cleanup);

it("renders the plaza at /", () => {
  render(<App />);
  // The heading is a time-of-day greeting, not the app's name — match the
  // shape so the test does not depend on the hour it runs at.
  expect(
    screen.getByRole("heading", { name: /^(Good (morning|afternoon|evening)|Welcome back), / }),
  ).toBeTruthy();
});

it("renders the global chrome (bubble cluster) on the plaza", () => {
  render(<App />);
  expect(document.querySelector("[data-nav]")).not.toBeNull();
});
