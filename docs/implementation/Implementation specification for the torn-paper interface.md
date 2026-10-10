
The goal is to reproduce the visual language of the generated Eudaimonia mockup in your actual React app—not merely approximate it with pastel cards and rough CSS borders.

The interface has three distinct visual systems:

- Torn paper: the background and major content sections, with tactile fibers, irregular edges, and dark torn fringes.
    
- Glass controls: small floating navigation bubbles, the settings button, and selected interactive controls.
    
- Normal application content: task rows, habit tracking, timestamps, agent states, icons, and readable text rendered over the paper.
    

The distinction matters. If you apply glassmorphism to every section, you lose the paper aesthetic. If you make the sections ordinary colored rectangles with a jagged outline, you lose the realistic torn effect.

Your existing React + TypeScript + Vite + Tailwind frontend can implement this without a new UI framework.

## 1. Define the exact visual architecture

LAYER 1 · BACKGROUND

## Matte black paper

Full-screen charcoal-black surface, fine paper grain, slight tonal variation.

LAYER 2 · SECTION SURFACE

## Today's Plan

Mint paper texture, organic torn silhouette, no conventional card border.

LAYER 2 · NEXT PAPER SHEET

## Waiting On

Sky-blue paper, different irregular edges, dark torn fringe between sheets.

LAYER 2 · NEXT PAPER SHEET

## Habits

Blush paper with the same material texture and a different tear pattern.

LAYER 3 · FLOATING CONTROLS

## ✧

## ▤

## ▥

## ⌂

## ＋

Five independent glass bubbles, anchored to the bottom-right. No traditional navigation bar.

The colored rectangles above illustrate the order of the layers, not the final paper shapes. In the actual interface, each colored surface has a torn silhouette.

### The most important rendering decision

For the closest match, use authored raster paper textures plus transparent SVG masks and a separate dark fringe layer.

Do not rely on:

- `border-radius` to simulate torn edges.
    
- A single CSS `clip-path: polygon(...)` for every section.
    
- A generic drop shadow as the entire torn effect.
    
- Randomly generated CSS noise as a replacement for actual paper fibers.
    
- A blur filter across the paper itself.
    

Those techniques can produce a rough-paper approximation, but they will not reproduce the layered, fibrous edges in your reference.

## 2. Create the paper assets before writing the UI

This is the part that determines whether the final result looks convincing.

Use a dedicated asset directory rather than embedding large texture strings in CSS.

Recommended structure:

```
frontend/
└── src/
    ├── assets/
    │   └── paper/
    │       ├── black-paper.webp
    │       ├── paper-fibers.webp
    │       ├── mint-paper.webp
    │       ├── sky-paper.webp
    │       ├── blush-paper.webp
    │       ├── butter-paper.webp
    │       ├── lavender-paper.webp
    │       ├── torn-top.svg
    │       ├── torn-bottom.svg
    │       ├── torn-section-a.svg
    │       ├── torn-section-b.svg
    │       ├── torn-section-c.svg
    │       └── torn-fringe.svg
    ├── components/
    │   ├── paper/
    │   │   ├── TornPaperSection.tsx
    │   │   ├── PaperBackground.tsx
    │   │   └── torn-paper.css
    │   └── navigation/
    │       └── BubbleNavigation.tsx
    └── pages/
        └── Plaza.tsx
```

You can adjust this structure to match your existing project. The essential principle is to keep the reusable paper renderer, the asset files, and the app content separate.

### 2.1 Generate the actual paper texture

You need two different kinds of texture.

![Black Handmade Paper Texture Background with Fibers Macro Close-Up](https://images.openai.com/static-rsc-4/eLQA3Don5-SAqf7sd9EKVryzHP5rVnofh5Y65SySDH1aWywdypRbaw-asHvpz7lfBthIV-ApFHHiW0r6jlPdv52DjE8pQhU3YLDbEiAoJOpXFvYm3KIpybd5lwPE5oi4Jh1c-LRWf0bCsAc_BywkgGmWHLGpiDKZyRlUeIMdsNL-Ae8Hbb4fE_C6JLuIolbm?purpose=inline)

Black paper

Nearly black, fine grain, low contrast. It should not resemble leather or rough concrete.

![Light Mint Rough Cotton Rag Handmade Paper | Xylem](https://images.openai.com/static-rsc-4/iI5EtRF9ES5Loex_RXC-4__aQC1Yi5EHogkFI0PKnqBclgKU06qF_peVEeUER1U7M3MuA27f0VBJYj1zIMpfmPcAJAJpVcomClvt4ZD3pWTu4u-AEEny7VDKCwnOEkaeRtOZJMg50-GaMpf-FbkIPCB__Ti3bww-MqV10gqi1pY?purpose=inline)

Colored paper

Fine fibers, slight color variation, matte surface, no strong gradients.

For production assets, use high-resolution, seamless or tileable textures. A useful starting point is a 1024 × 1024 image for each texture, with a smaller optimized version available for mobile devices.

Keep the colored texture neutral enough that tinting it does not destroy its fibers. If you use already colored textures, keep the CSS tint subtle.

Example color palette:

|Section|Base color|Text color|
|---|---|---|
|Today's Plan|`#A9DCC7`|`#142B25`|
|Waiting On|`#A9CBEF`|`#192B3B`|
|Habits|`#F0A99B`|`#38211E`|
|Yesterday|`#F2D28D`|`#332713`|
|Agents|`#C3AEF3`|`#281C40`|

These are starting values based on the generated design, not sampled pixel-perfect color measurements. Tune them against the reference image.

### 2.2 Create the torn silhouette

Each paper section needs an irregular alpha mask.

The mask determines which pixels exist:

- White or opaque areas: paper remains visible.
    
- Black or transparent areas: paper disappears.
    
- The outer contour: the actual torn edge.
    

The easiest way to author this is in Inkscape, Figma with an SVG workflow, or a vector editor that supports SVG paths.

Create a mask with:

- A mostly horizontal but uneven top edge.
    
- Irregular peaks and dips.
    
- Small variations in tear depth.
    
- Uneven left and right edges.
    
- A separate, irregular bottom edge.
    
- Slight asymmetry between the top and bottom.
    

Avoid a smooth sine wave. Natural tearing produces clusters of short fibers and larger, irregular breaks. The edge should look handmade, not like a decorative zigzag.

Use at least three different masks and rotate or mirror them selectively. Do not use one repeated silhouette for every section.

### 2.3 Understand the difference between the mask and the fringe

The mask and the fringe serve different purposes.

Mask — defines the shape

It removes pixels outside the torn paper boundary. It should not be visible as a separate graphic.

Fringe — defines the material

It adds the dark fibrous edge, tiny strands, and contact shadow. This is the part that makes the tear look physical.

A mask alone will give you a clean cutout. A shadow alone will give you a smooth edge. Both are needed.

For the most realistic result, author the fringe as a separate transparent overlay containing irregular black fibers and a subtle highlight on selected paper fibers. Place it along the exposed edge, not around the entire section like a card outline.

## 3. Build the reusable `TornPaperSection` component

Every major section should use the same rendering system but receive its own color, texture, silhouette, and content.

The component should not contain task-specific logic. It should only render the paper surface and provide a place for React children.

### `TornPaperSection.tsx`

```

import type { CSSProperties, ReactNode } from "react";
import "./torn-paper.css";

type PaperVariant =
  | "mint"
  | "sky"
  | "blush"
  | "butter"
  | "lavender";

type TornPaperSectionProps = {
  title: string;
  variant: PaperVariant;
  children: ReactNode;
  className?: string;
  id?: string;
};

export function TornPaperSection({
  title,
  variant,
  children,
  className = "",
  id,
}: TornPaperSectionProps) {
  return (
    <section
      id={id}
      className={`torn-section torn-section--${variant} ${className}`}
    >
      <div
        className="torn-section__paper"
        aria-hidden="true"
      />

      <div
        className="torn-section__fringe"
        aria-hidden="true"
      />

      <div className="torn-section__content">
        <h2 className="torn-section__heading">
          {title}
        </h2>

        {children}
      </div>
    </section>
  );
}
```

### `torn-paper.css`

This CSS assumes the SVG masks and textures described above exist in `src/assets/paper/`. Adjust the asset paths to match your project.

```

.torn-section {
  --paper-color: #a9dcc7;
  --paper-text: #142b25;
  --paper-texture: url("/textures/paper-fibers.webp");
  --paper-mask: url("/textures/torn-section-a.svg");

  position: relative;
  isolation: isolate;
  width: 100%;
  min-width: 0;
  margin-block: 8px;
  color: var(--paper-text);
}

/* The physical paper surface */
.torn-section__paper {
  position: absolute;
  z-index: -2;
  inset: 0;

  background-color: var(--paper-color);
  background-image:
    var(--paper-texture);
  background-size: 512px 512px;
  background-repeat: repeat;

  -webkit-mask-image: var(--paper-mask);
  mask-image: var(--paper-mask);
  -webkit-mask-mode: alpha;
  mask-mode: alpha;
  -webkit-mask-size: 100% 100%;
  mask-size: 100% 100%;
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
}

/* The rough dark boundary and contact shadow */
.torn-section__fringe {
  position: absolute;
  z-index: -1;
  inset: 0;
  pointer-events: none;

  background-image:
    url("/textures/torn-fringe.svg");
  background-size: 100% 100%;
  background-repeat: no-repeat;

  filter:
    drop-shadow(0 3px 2px rgb(0 0 0 / 55%));
}

/* Keep all app content above the paper */
.torn-section__content {
  position: relative;
  z-index: 1;
  padding: 30px 24px;
}

.torn-section__heading {
  margin: 0 0 18px;
  font-size: 0.82rem;
  font-weight: 600;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

/* Section palette */
.torn-section--mint {
  --paper-color: #a9dcc7;
  --paper-text: #142b25;
  --paper-mask: url("/textures/torn-section-a.svg");
}

.torn-section--sky {
  --paper-color: #a9cbeF;
  --paper-text: #192b3b;
  --paper-mask: url("/textures/torn-section-b.svg");
}

.torn-section--blush {
  --paper-color: #f0a99b;
  --paper-text: #38211e;
  --paper-mask: url("/textures/torn-section-c.svg");
}

.torn-section--butter {
  --paper-color: #f2d28d;
  --paper-text: #332713;
  --paper-mask: url("/textures/torn-section-a.svg");
}

.torn-section--lavender {
  --paper-color: #c3aef3;
  --paper-text: #281c40;
  --paper-mask: url("/textures/torn-section-b.svg");
}
```

Important implementation detail: the CSS above defines the rendering structure, but it is not sufficient by itself to produce a realistic torn edge. Your `torn-fringe.svg` must actually contain edge-aligned fringe artwork with transparent space elsewhere. A generic full rectangle or a simple border will not work.

For an even closer result, export each section as a composed transparent paper asset with its own silhouette, texture, and fringe. Keep the text as HTML so it remains accessible and responsive.

## 4. Make the torn edge look physical

The CSS component above gives you the architecture. The next step is producing the actual material.

### 4.1 Use an SVG mask with a real irregular path

A mask file should be transparent outside the paper silhouette and opaque inside it. Here is a simplified example of the structure of `torn-section-a.svg`:

```

<svg
  xmlns="http://www.w3.org/2000/svg"
  viewBox="0 0 1000 360"
  preserveAspectRatio="none"
>
  <defs>
    <filter id="edge-roughness">
      <feTurbulence
        type="fractalNoise"
        baseFrequency="0.035 0.12"
        numOctaves="2"
        seed="17"
        result="noise"
      />
      <feDisplacementMap
        in="SourceGraphic"
        in2="noise"
        scale="5"
        xChannelSelector="R"
        yChannelSelector="G"
      />
    </filter>
  </defs>

  <path
    d="
      M 0,42
      L 35,48 62,38 94,45
      L 128,35 154,43 190,31
      L 224,42 258,34 292,48
      L 328,37 365,45 402,29
      L 440,40 474,32 510,47
      L 550,36 590,44 625,31
      L 662,43 700,35 738,47
      L 775,32 810,43 850,34
      L 888,46 925,36 960,45 1000,38
      L 1000,300
      L 968,307 940,297 908,315
      L 875,302 840,322 802,307
      L 765,317 730,302 690,321
      L 650,307 615,323 575,306
      L 540,317 500,301 462,320
      L 420,305 382,316 340,301
      L 300,320 262,306 225,316
      L 188,301 148,319 110,303
      L 75,315 38,301 0,310 Z
    "
    fill="white"
    filter="url(#edge-roughness)"
  />
</svg>
```

This is a starting silhouette, not a finished fiber-accurate mask. The small coordinate changes create an uneven contour, and the displacement filter adds some roughness.

For production, refine the contour manually. The top and bottom edges should not have the same rhythm, and the displacement should be subtle enough that the section's shape remains stable.

Do not depend on this filter alone for the fibers. Use a separately authored fringe texture for fine strands and dark edge detail.

### 4.2 Construct the fringe

The torn edge should contain four visual features:

1. A narrow, dark shadow immediately below the lifted black edge.
    
2. A broken, nearly black fringe with irregular strands.
    
3. Occasional lighter fibers where the paper interior catches light.
    
4. A slightly rough transition between the colored paper and the surrounding black surface.
    

The effect should be strongest at the boundary and almost invisible in the middle of the paper.

One practical production workflow is:

- Draw the silhouette in a vector editor.
    
- Duplicate the silhouette and offset it slightly to create a dark under-edge.
    
- Add short irregular fibers along the edge.
    
- Export the fringe as a transparent SVG or PNG.
    
- Overlay it on the paper mask and compare it at actual phone-screen size.
    

For a truly realistic result, use raster fringe artwork for the smallest fibers; SVG paths are useful for the larger tears and contours.

### 4.3 Avoid the common shadow mistake

A large, soft shadow around the entire section makes the paper look like a floating card.

The reference instead looks like black material is sitting above and around the exposed sheet. The dark edge is narrow, irregular, and close to the tear.

Use a subtle shadow for depth, but make the edge artwork itself responsible for most of the visual realism.

## 5. Make the black background continuous

The background must remain a single continuous surface behind every section.

```
.plaza-page {
  position: relative;
  min-height: 100dvh;
  overflow: hidden;
  isolation: isolate;

  background-color: #0b0e0f;
  background-image:
    url("/textures/black-paper.webp");

  background-repeat: repeat;
  background-size: 512px 512px;
  color: #f0eee9;
}

.plaza-content {
  position: relative;
  z-index: 1;
  padding: 24px 0 150px;
}
```

The exact background scale depends on the source texture. It should be fine enough that the grain reads as material rather than a repeating pattern.

### How the sections should overlap

In the reference, the black surface visually interrupts the colored sheets. To reproduce that, use this layering order at every section boundary:

1. The next colored paper begins beneath the preceding torn edge.
    
2. The preceding black fringe overlaps that paper slightly.
    
3. The dark fibers cast a small shadow onto the exposed sheet.
    
4. The paper content stays safely inside the visible area.
    

Do not simply stack five rectangular cards with a large vertical gap. The sheets should appear to emerge from the same continuous black material.

For more precise control, give each section a dedicated top-edge fringe and bottom-edge fringe rather than applying one fringe image to all four sides. This prevents the edges from looking like picture frames.

## 6. Assemble the Plaza screen

Use the reusable component for each major section. The actual content remains ordinary React elements.

```

import { TornPaperSection } from
  "../components/paper/TornPaperSection";

export default function Plaza() {
  return (
    <main className="plaza-page">
      <div className="plaza-content">
        <header className="plaza-header">
          <p className="mono-caption">
            Today · Wed Oct 8
          </p>
          <h1>Eudaimonia</h1>
          <p>A calmer, more intentional you</p>
        </header>

        <TornPaperSection
          title="Today's Plan"
          variant="mint"
        >
          {/* Render scheduled tasks here */}
        </TornPaperSection>

        <TornPaperSection
          title="Waiting On"
          variant="sky"
        >
          {/* Render pending items here */}
        </TornPaperSection>

        <TornPaperSection
          title="Habits"
          variant="blush"
        >
          {/* Render habit controls here */}
        </TornPaperSection>

        <TornPaperSection
          title="Yesterday"
          variant="butter"
        >
          {/* Render previous-day activity here */}
        </TornPaperSection>

        <TornPaperSection
          title="Agents"
          variant="lavender"
        >
          {/* Render agent status here */}
        </TornPaperSection>
      </div>
    </main>
  );
}
```

The comments are placeholders for your existing task, habit, and agent components. Do not replace your real application logic with static mockup data.

### Content styling

Use warm, dark ink on the colored sheets. The paper is the primary reading surface, so normal text should not use white or translucent glass backgrounds.

```
.torn-section__content {
  padding: 30px 24px;
  font-family: "IBM Plex Sans", sans-serif;
}

.torn-section__heading {
  font-size: 0.8rem;
  font-weight: 600;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.torn-section__content .mono-caption {
  color: rgb(20 30 30 / 65%);
  font-family: "IBM Plex Mono", monospace;
  font-size: 0.72rem;
}

.torn-section__content button {
  color: inherit;
}
```

Use IBM Plex Sans for primary text and IBM Plex Mono for timestamps, counts, and muted status captions. Keep separators thin and understated. The torn silhouette should provide the visual structure, not a collection of conventional card borders.

## 7. Implement the five floating navigation bubbles

The bottom navigation is an independent glass layer. It should not sit inside a colored paper sheet and should not stretch across the entire screen.

The arrangement is a compact cluster around a larger teal add bubble:

Illustrative arrangement · bottom-right anchor

The five bubbles represent your five navigation destinations. The plus bubble is a separate action; if it is not one of those five destinations, you will need six bubbles in total. In the mockup above, the plus occupies the fifth position.

### `BubbleNavigation.tsx`

```

import {
  House,
  ListTodo,
  ChartNoAxesColumn,
  Sparkles,
  BookOpen,
  Plus,
} from "lucide-react";

const destinations = [
  { label: "Plaza", icon: House, href: "/" },
  { label: "Tasks", icon: ListTodo, href: "/tasks" },
  {
    label: "Habits",
    icon: ChartNoAxesColumn,
    href: "/habits",
  },
  {
    label: "Agents",
    icon: Sparkles,
    href: "/agents",
  },
  {
    label: "Library",
    icon: BookOpen,
    href: "/library",
  },
];

export function BubbleNavigation() {
  return (
    <nav
      className="bubble-navigation"
      aria-label="Main navigation"
    >
      {destinations.map((item, index) => {
        const Icon = item.icon;

        return (
          <a
            key={item.label}
            href={item.href}
            className={`nav-bubble nav-bubble--${index}`}
            aria-label={item.label}
            title={item.label}
          >
            <Icon size={22} strokeWidth={1.7} />
          </a>
        );
      })}

      <button
        className="nav-bubble nav-bubble--add"
        type="button"
        aria-label="Create new item"
      >
        <Plus size={28} strokeWidth={1.7} />
      </button>
    </nav>
  );
}
```

This example uses standard links. Replace their `href` values with your existing router navigation if the app uses React Router or another routing solution. Connect the plus button to your existing create-item action.

### Position the bubbles

The arrangement should be anchored to the bottom-right safe area. Position each bubble independently so the layout remains a cluster rather than a navigation bar.

```

.bubble-navigation {
  position: fixed;
  z-index: 100;
  right: max(20px, env(safe-area-inset-right));
  bottom: max(28px, env(safe-area-inset-bottom));

  width: 190px;
  height: 180px;
  pointer-events: none;
}

.nav-bubble {
  position: absolute;
  display: grid;
  place-items: center;

  width: 52px;
  height: 52px;
  padding: 0;

  color: #c6d1d8;
  background: rgb(24 32 36 / 76%);
  border: 1px solid rgb(255 255 255 / 13%);
  border-radius: 50%;

  backdrop-filter: blur(14px) saturate(130%);
  -webkit-backdrop-filter: blur(14px) saturate(130%);

  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 9%),
    0 5px 16px rgb(0 0 0 / 32%);

  pointer-events: auto;
  text-decoration: none;
}

.nav-bubble--0 {
  right: 0;
  bottom: 100px;
}

.nav-bubble--1 {
  right: 48px;
  bottom: 62px;
}

.nav-bubble--2 {
  right: 96px;
  bottom: 20px;
}

.nav-bubble--3 {
  right: 48px;
  bottom: 0;
}

.nav-bubble--4 {
  right: 0;
  bottom: 0;
}

.nav-bubble--add {
  width: 64px;
  height: 64px;
  right: -2px;
  bottom: -2px;

  color: #072522;
  background: rgb(45 212 191 / 92%);
  border-color: #2dd4bf;
  box-shadow:
    0 0 22px rgb(45 212 191 / 13%),
    inset 0 1px 0 rgb(255 255 255 / 30%);
}
```

The sample positions illustrate the cluster technique; refine them to fit the desired diagonal arrangement. This CSS also places the plus over the fifth navigation destination. For five destinations plus a separate create action, remove the overlap and allocate a sixth bubble.

Use a subtle hover or press scale, not a large bounce animation. On touch devices, provide a visible pressed state and ensure the bubbles have accessible names.

One more constraint: `backdrop-filter` is the only part of this cluster that should consume the blur budget. Keep blur surfaces small, avoid multiple nested blurred containers, and leave the paper layers unblurred.

## 8. Performance and mobile behavior

Paper textures can be inexpensive to render if you treat them as static assets. The most expensive mistakes are unnecessarily large textures, excessive filter layers, and multiple large blurred surfaces.

Use these constraints:

|Area|Requirement|
|---|---|
|Paper texture|WebP, compressed, approximately 512–1024 px source|
|Edge masks|SVG paths or transparent PNG|
|Paper blur|None|
|Fringe|Static asset, subtle shadow|
|Glass bubbles|Small, isolated blur surfaces|
|Scrolling|Native scrolling; no continuously animated texture|
|Resizing|Mask stretches to section dimensions; content determines height|
|Accessibility|Text remains selectable and controls remain real buttons or links|

For a Tauri mobile or desktop target, verify that your CSS masks and filters render correctly in the actual WebView. Browser support does not guarantee identical rendering across all target environments.

### Handle sections of variable height

Your sections will contain different numbers of tasks. Their height should come from their content, not a fixed height.

A mask designed for a short section can look distorted when stretched over a tall section. There are two ways to address this:

- Simple implementation: stretch a mask vertically and author it to tolerate the expected height range.
    
- Higher-fidelity implementation: use separate top, middle, and bottom assets. The middle texture repeats or stretches while the torn top and bottom remain at natural proportions.
    

For Eudaimonia, use the second approach if sections can grow substantially. It preserves the irregular silhouette and prevents the torn fibers from becoming unnaturally elongated.

## 9. Test the implementation against the reference

Use this checklist while refining the screen.

### Visual QA checklist

0 / 10

Black background

Continuous matte-black paper grain with no visible rectangular card boundaries.

Paper material

Colored sheets have subtle fibers and non-uniform pigment rather than flat CSS fills.

Torn silhouettes

Each section has distinct irregular edges; no repeated smooth wave pattern.

Black fringe

Dark fibers and a narrow contact shadow make the black layer appear to overlap the paper.

Reading contrast

All body text remains warm, dark ink on the colored paper.

Correct section colors

Mint for Today's Plan, blue for Waiting On, blush for Habits, butter for Yesterday, lavender for Agents.

Glass bubbles

Small circular translucent controls float at the bottom-right without a full-width navbar.

Interaction

Navigation, plus action, task rows, and habit controls remain functional.

Responsive layout

Content height, masks, and navigation remain correct on narrow screens and when text wraps.

Performance

No large blurred paper layers, repeated expensive filters, or animated texture rendering.

## 10. The order I would implement this in

Do not build the entire dashboard and then attempt to fix the paper effect across every section. Build it incrementally:

1. Create the black texture and one mint paper section. Get the surface, mask, and fringe right before adding more colors.
    
2. Refine the torn edge at actual display size. Inspect the top and bottom contours, fibers, shadows, and texture scale.
    
3. Turn the section into a reusable component. Verify that variable content height works.
    
4. Add the remaining paper variants. Use distinct masks and keep the color palette consistent.
    
5. Build the floating glass navigation cluster. Position it independently of the paper content and connect it to real navigation.
    
6. Integrate the existing app data and interactions. Preserve your task, habit, and agent logic.
    
7. Profile and test the finished screen. Check scrolling, resizing, text wrapping, and blur performance.
    

The central design rule is that the colored paper should look like material physically exposed beneath a torn black sheet. The mask establishes the shape, the texture establishes the material, and the fringe establishes the depth. All three need to work together.

For the closest possible match to the generated image, prioritize creating a good set of edge assets. CSS can place, tint, and layer them, but the exact fibrous appearance comes primarily from the quality of the texture and torn-edge artwork.