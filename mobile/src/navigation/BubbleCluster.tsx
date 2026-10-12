import { View, StyleSheet, Pressable } from "react-native";
import Svg, { Circle, Path, Rect as SvgRect } from "react-native-svg";
import { Link, useGlobalSearchParams, usePathname } from "expo-router";

import { colors, geometry } from "../theme/tokens";
import { captureMode } from "../plaza/captureMode";

// The bubble cluster (01 §3), ported from client/src/components/BubbleCluster.tsx
// at M2 as STATIC bubbles — six glass circles anchored to the BOTTOM-RIGHT
// corner by the ＋ capture FAB (geometry.navClusterInset; BubbleCluster.test
// once lost a whole round to this token silently flipping left). M2 renders
// them still: the press-and-hold radial fan, and the More bubble's route
// sheet with it, is M4's gesture (PHASE-M §M4) — More renders as a bubble
// without an action until then.
//
// Laid out on two axes rather than scattered: a column rising from capture
// (settings, then more) and a row running LEFT from it (plaza, week,
// inbox), both aligned to capture's centre lines. Every bubble is placed
// from the right edge, so the whole cluster mirrors with one token.
//
// Legibility over paper: each bubble carries --bubble-veil UNDER the glass
// fill (nested views, the CSS `linear-gradient(glass,glass), veil` stack in
// order). The veil is not optional — white-on-glass alone measures 1.22 on
// butter because the 6% fill lets the paper do all the work; 0.62 is the
// lowest alpha that clears 4.5 on all five sheets (tokens.ts). The web's
// backdrop blur is knowingly NOT ported here: the veil carries legibility,
// and the blur budget ruling rides with M4 (the web itself exceeded the
// budget for these same bubbles — bubble-cluster.css).

function currentIsoWeekUrl(now: Date): string {
  const date = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const dayNumber = date.getUTCDay() || 7; // ISO: Mon=1 .. Sun=7
  date.setUTCDate(date.getUTCDate() + 4 - dayNumber); // the nearest Thursday
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `/week/${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

const WEEK_URL = currentIsoWeekUrl(new Date());

const stroke = {
  fill: "none",
  stroke: colors["--text"],
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const ICON_SIZE = 20;

const ICONS = {
  plaza: (
    <Svg viewBox="0 0 24 24" width={ICON_SIZE} height={ICON_SIZE}>
      <Path {...stroke} d="M4 11 12 4l8 7" />
      <Path {...stroke} d="M6 9.5V20h12V9.5" />
    </Svg>
  ),
  inbox: (
    <Svg viewBox="0 0 24 24" width={ICON_SIZE} height={ICON_SIZE}>
      <SvgRect {...stroke} x="5" y="4" width="14" height="17" rx="2" />
      <Path {...stroke} d="M9 4.5v4h6v-4M9 12h6M9 16h4" />
    </Svg>
  ),
  week: (
    <Svg viewBox="0 0 24 24" width={ICON_SIZE} height={ICON_SIZE}>
      <SvgRect {...stroke} x="4" y="5" width="16" height="15" rx="2" />
      <Path {...stroke} d="M4 9.5h16M8.5 3v4M15.5 3v4" />
    </Svg>
  ),
  more: (
    <Svg viewBox="0 0 24 24" width={ICON_SIZE} height={ICON_SIZE}>
      <Path {...stroke} d="M12 5v14M5 12h14" opacity={0} />
      <Circle cx="6" cy="12" r="1.4" fill={colors["--text"]} />
      <Circle cx="12" cy="12" r="1.4" fill={colors["--text"]} />
      <Circle cx="18" cy="12" r="1.4" fill={colors["--text"]} />
    </Svg>
  ),
  settings: (
    <Svg viewBox="0 0 24 24" width={ICON_SIZE} height={ICON_SIZE}>
      <Circle {...stroke} cx="12" cy="12" r="3.2" />
      <Path
        {...stroke}
        d="M12 3.5v2.2M12 18.3v2.2M4.9 7.8l1.9 1.1M17.2 15.1l1.9 1.1M4.9 16.2l1.9-1.1M17.2 8.9l1.9-1.1"
      />
    </Svg>
  ),
  plus: (
    <Svg viewBox="0 0 24 24" width={26} height={26}>
      <Path
        d="M12 5v14M5 12h14"
        fill="none"
        stroke={colors["--accent-1"]}
        strokeWidth={2.2}
        strokeLinecap="round"
      />
    </Svg>
  ),
} as const;

// Capture's size, and the gap between neighbours. The rest derives.
const FAB = geometry.navBubbleSizes.fab; // 4.4rem
const DOT = geometry.navBubbleSizes.dot; // 3rem
const GAP = geometry.navBubbleSizes.gap; // 0.4rem
/** Centre a DOT-sized bubble on capture's centre line. */
const ALIGN = FAB / 2 - DOT / 2;

export function BubbleCluster() {
  const pathname = usePathname();
  // global, not local: the cluster sits in the shell LAYOUT, whose own
  // params never carry the current screen's query string
  const params = useGlobalSearchParams<{ snap?: string }>();

  // The capture harness (renders/MEASUREMENTS) hides the floating cluster:
  // the web reference full-page renders carry no fixed chrome, and a
  // translated column would otherwise stamp the cluster into every band.
  // The flag is the deterministic signal (see captureMode.ts — the query
  // alone races the shell layout on a cold-start deep link).
  if (params.snap !== undefined || captureMode.active) return null;

  const isActive = (to: string): boolean =>
    to === "/" ? pathname === "/" : pathname.startsWith(to);

  const bubbles: {
    key: string;
    label: string;
    to?: string;
    icon: React.ReactNode;
    accentIcon?: boolean;
    pos: { right: number; bottom: number };
    size: number;
  }[] = [
    // the column, rising from capture
    { key: "more", label: "More", icon: ICONS.more, size: DOT,
      pos: { right: ALIGN, bottom: FAB + GAP + DOT + GAP } },
    { key: "settings", label: "Settings", to: "/settings", icon: ICONS.settings, size: DOT,
      pos: { right: ALIGN, bottom: FAB + GAP } },
    // the row, running left from capture
    { key: "plaza", label: "Plaza", to: "/", icon: ICONS.plaza, size: DOT,
      pos: { right: FAB + GAP, bottom: ALIGN } },
    { key: "week", label: "Week", to: WEEK_URL, icon: ICONS.week, size: DOT,
      pos: { right: FAB + GAP + DOT + GAP, bottom: ALIGN } },
    { key: "inbox", label: "Inbox", to: "/inbox", icon: ICONS.inbox, size: DOT,
      pos: { right: FAB + GAP + 2 * (DOT + GAP), bottom: ALIGN } },
    // the anchor, in the corner itself
    { key: "capture", label: "＋ capture", to: "/capture", icon: ICONS.plus,
      accentIcon: true, size: FAB, pos: { right: 0, bottom: 0 } },
  ];

  return (
    <View
      testID="data-nav"
      aria-label="Primary"
      pointerEvents="box-none"
      style={[
        styles.cluster,
        {
          right: geometry.navClusterInset.right,
          bottom: geometry.navClusterInset.bottom,
        },
      ]}
    >
      {bubbles.map((bubble) => {
        const active = bubble.to !== undefined && bubble.key !== "capture" && isActive(bubble.to);
        // The fill over a veil, not the fill alone — see --bubble-veil.
        // The active ring is a sibling circle just outside the border box
        // (the web's boxShadow 0 0 0 2px spreads OUTSIDE the box; a thicker
        // border would eat into the bubble, and the bubble itself must stay
        // overflow-hidden so its fill never escapes the circle).
        const circle = (
          <View style={{ width: bubble.size, height: bubble.size }}>
            <View
              style={[
                styles.bubble,
                { width: bubble.size, height: bubble.size, backgroundColor: colors["--bubble-veil"] },
              ]}
            >
              <View style={[StyleSheet.absoluteFill, styles.bubbleFill]} />
              <View style={styles.iconBox}>{bubble.icon}</View>
            </View>
            {active ? (
              <View
                aria-hidden
                pointerEvents="none"
                style={[styles.activeRing, {
                  width: bubble.size + 4,
                  height: bubble.size + 4,
                  left: -2,
                  top: -2,
                  position: "absolute",
                }]}
              />
            ) : null}
          </View>
        );
        if (bubble.to === undefined) {
          // M4 gives More its fan gesture; until then it is the cluster's
          // one bubble without an action (the route sheet stays on the web
          // side for now).
          return (
            <View
              key={bubble.key}
              aria-label={bubble.label}
              style={{ position: "absolute", right: bubble.pos.right, bottom: bubble.pos.bottom }}
            >
              {circle}
            </View>
          );
        }
        return (
          <View
            key={bubble.key}
            style={{ position: "absolute", right: bubble.pos.right, bottom: bubble.pos.bottom }}
          >
            <Link href={bubble.to} aria-label={bubble.label} asChild>
              <Pressable accessibilityRole="button" hitSlop={2}>
                {circle}
              </Pressable>
            </Link>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  cluster: {
    // width 14.6rem, height 11.2rem — the bubbles' boxes derive from
    // FAB/DOT/GAP; the cluster rides over every sheet
    position: "absolute",
    width: 233.6,
    height: 179.2,
    zIndex: 40,
    pointerEvents: "box-none",
  },
  bubble: {
    // borderRadius 9999px, glass border, seat shadow (0 3px 8px --scrim)
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: colors["--glass-border"],
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    elevation: 4,
    shadowColor: colors["--scrim"],
    shadowOpacity: 1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  bubbleFill: {
    // --glass-fill rides OVER the veil painted by the parent's background
    borderRadius: 9999,
    backgroundColor: colors["--glass-fill"],
  },
  iconBox: {
    alignItems: "center",
    justifyContent: "center",
  },
  activeRing: {
    // the active-route ring — teal, and never a state hue (01 §3)
    borderRadius: 9999,
    borderWidth: 2,
    borderColor: colors["--accent-1"],
  },
});
