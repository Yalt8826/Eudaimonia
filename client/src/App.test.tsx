import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import App from "./App";

afterEach(cleanup);

it("renders the plaza stub at /", () => {
  render(<App />);
  expect(screen.getByRole("heading", { name: "Plaza" })).toBeTruthy();
});

it("renders the global chrome (bubble cluster) on the plaza", () => {
  render(<App />);
  expect(document.querySelector("[data-nav]")).not.toBeNull();
});
