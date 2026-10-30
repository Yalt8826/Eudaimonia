// One load per Skia asset for the whole app. Skia's useFont/useImage load
// per CALL: every PaperText line fetched and parsed its own copy of the
// mono TTF, and every TornSheet decoded its own 1024px fibre webp — ~10
// font loads and 15 image decodes on a cold Plaza, each landing as its own
// re-render, so the text and paper popped in piece by piece for seconds.
//
// Here each source loads once into a module cache (concurrent requesters
// share the in-flight promise), and the root layout's boot hold awaits
// preloadSkiaAssets() alongside the RN fonts — so every font and texture is
// decoded before the Plaza's first render (measured on the A059: preload
// 80-110ms; cold launch to settled ~1.74s -> ~1.37s). What remains is
// native: each <Canvas> is its own TextureView, and 13 of them reach their
// first GPU frame one after another, ~0.5s for the set.
import { useEffect, useMemo, useState } from "react";
import {
  Skia,
  loadData,
  type DataSourceParam,
  type SkData,
  type SkFont,
  type SkImage,
  type SkTypeface,
} from "@shopify/react-native-skia";

type Source = number; // a require()'d asset module id

const typefaces = new Map<Source, SkTypeface>();
const images = new Map<Source, SkImage>();
const inflight = new Map<Source, Promise<unknown>>();

// factories resolve Skia lazily: the jest mock carries no Typeface/Image
const makeTypeface = (d: SkData) => Skia.Typeface.MakeFreeTypeFaceFromData(d);
// MakeImageFromEncoded is LAZY: the decode happens at first draw, on the
// render thread, inside the Plaza's first frame. makeNonTextureImage forces
// it into a raster image here, during the boot hold, instead.
const makeImage = (d: SkData) => {
  const lazy = Skia.Image.MakeImageFromEncoded(d);
  if (!lazy) return null;
  try {
    return lazy.makeNonTextureImage() ?? lazy;
  } catch {
    return lazy;
  }
};

function load<T>(
  cache: Map<Source, T>,
  src: Source,
  factory: (d: SkData) => T | null,
): Promise<T | null> {
  const hit = cache.get(src);
  if (hit) return Promise.resolve(hit);
  let pending = inflight.get(src) as Promise<T | null> | undefined;
  if (!pending) {
    pending = Promise.resolve(loadData<T>(src as DataSourceParam, factory))
      .then((value) => {
        if (value) cache.set(src, value);
        return value ?? null;
      })
      // a failed asset draws nothing (as useFont's null did) — it must
      // never hold the boot screen or throw into a render
      .catch(() => null)
      .finally(() => inflight.delete(src));
    inflight.set(src, pending);
  }
  return pending;
}

export const PLEX_MONO_400 = require("@expo-google-fonts/ibm-plex-mono/400Regular/IBMPlexMono_400Regular.ttf");
export const PLEX_SANS_700 = require("@expo-google-fonts/ibm-plex-sans/700Bold/IBMPlexSans_700Bold.ttf");
export const PAPER_FIBERS = require("../../assets/tears/paper-fibers.prepared.webp");
export const FRINGES = {
  a: {
    top: require("../../assets/tears/fringe-a-top.png"),
    bottom: require("../../assets/tears/fringe-a-bottom.png"),
  },
  b: {
    top: require("../../assets/tears/fringe-b-top.png"),
    bottom: require("../../assets/tears/fringe-b-bottom.png"),
  },
  c: {
    top: require("../../assets/tears/fringe-c-top.png"),
    bottom: require("../../assets/tears/fringe-c-bottom.png"),
  },
} as const;

/** Everything the Plaza paints, loaded once. Never rejects. */
export function preloadSkiaAssets(): Promise<void> {
  const fringes = Object.values(FRINGES).flatMap((f) => [f.top, f.bottom]);
  return Promise.all([
    load(typefaces, PLEX_MONO_400, makeTypeface),
    load(typefaces, PLEX_SANS_700, makeTypeface),
    load(images, PAPER_FIBERS, makeImage),
    ...fringes.map((src) => load(images, src, makeImage)),
  ]).then(() => undefined);
}

function useCached<T>(
  cache: Map<Source, T>,
  src: Source,
  factory: (d: SkData) => T | null,
): T | null {
  // a warm cache (the normal case after the boot hold) answers on the
  // FIRST render — no effect round-trip, no second paint
  const [value, setValue] = useState<T | null>(() => cache.get(src) ?? null);
  useEffect(() => {
    if (value) return;
    let live = true;
    void load(cache, src, factory).then((v) => {
      if (live && v) setValue(v);
    });
    return () => {
      live = false;
    };
  }, [cache, src, factory, value]);
  return value ?? cache.get(src) ?? null;
}

/** useFont over the shared typeface cache. */
export function useSkiaFont(src: Source, size: number): SkFont | null {
  const typeface = useCached(typefaces, src, makeTypeface);
  return useMemo(() => (typeface ? Skia.Font(typeface, size) : null), [typeface, size]);
}

/** useImage over the shared image cache. */
export function useSkiaImage(src: Source): SkImage | null {
  return useCached(images, src, makeImage);
}
