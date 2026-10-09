import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import App from "./App";

it("renders the shell", () => {
  render(<App />);
  expect(screen.getByRole("heading", { name: "Eudaimonia" })).toBeTruthy();
});
