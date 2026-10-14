import { describe, expect, it } from "@jest/globals";

import appJson from "../../app.json";
import { ROUTE_MAP } from "../navigation/routeMap";
import {
  WAKE_DEEP_LINK,
  WAKE_ROUTE,
  WAKE_SCHEME,
  redirectSystemPath,
} from "./wakeIntent";

// The scheme→route registration, asserted against the config and the route
// map so the three can never silently drift: app.json's scheme, the short
// link this module claims to rewrite, and the wake route must all agree
// (02 §6: the deep link and the screen are one surface, never two).

const redirect = (path: string): string =>
  redirectSystemPath({ path, initial: false });

describe("scheme registration", () => {
  it("app.json declares the scheme this module rewrites", () => {
    expect(appJson.expo.scheme).toBe(WAKE_SCHEME);
    expect(WAKE_DEEP_LINK).toBe(`${WAKE_SCHEME}://wake`);
  });

  it("the rewrite target is the mapped wake route, outside the shell chrome", () => {
    const wake = ROUTE_MAP.find((route) => route.path === WAKE_ROUTE);
    expect(wake).toBeDefined();
    expect(wake?.chrome).toBe(false);
  });
});

describe("redirectSystemPath", () => {
  it("lands the launcher short link on /habits/wake", () => {
    expect(redirect("web+eudaimonia://wake")).toBe("/habits/wake");
  });

  it("keeps the query string on the short link", () => {
    expect(redirect("web+eudaimonia://wake?src=kwgt")).toBe(
      "/habits/wake?src=kwgt",
    );
  });

  it("tolerates a trailing slash", () => {
    expect(redirect("web+eudaimonia://wake/")).toBe("/habits/wake");
  });

  it("passes the long form through — default extraction already yields /habits/wake", () => {
    expect(redirect("web+eudaimonia://habits/wake")).toBe(
      "web+eudaimonia://habits/wake",
    );
  });

  it("never rewrites a link that is not the wake short link", () => {
    expect(redirect("web+eudaimonia://plaza")).toBe("web+eudaimonia://plaza");
    expect(redirect("web+eudaimonia://wakeup")).toBe(
      "web+eudaimonia://wakeup",
    );
    expect(redirect("otherscheme://wake")).toBe("otherscheme://wake");
    expect(redirect("/habits/wake")).toBe("/habits/wake");
    expect(redirect("https://eudaimonia.yalt8826.com/habits/wake")).toBe(
      "https://eudaimonia.yalt8826.com/habits/wake",
    );
  });
});
