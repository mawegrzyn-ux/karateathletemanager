import { useEffect, useState } from "react";

// Extracts a dominant hue from an athlete's uploaded photo (client-side,
// via a downscaled <canvas> pixel sample) and derives a small set of
// theme colors from it - a dark shade for the hero scrim/text-on-photo,
// a light tint for section backgrounds, and a readable accent for body
// text - rather than pulling in a palette-extraction dependency.
export interface Palette {
  primaryDark: string;
  primaryLight: string;
  accentText: string;
  textOnPrimaryDark: string;
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (x: number) =>
    Math.round(x * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  switch (max) {
    case r:
      h = (g - b) / d + (g < b ? 6 : 0);
      break;
    case g:
      h = (b - r) / d + 2;
      break;
    default:
      h = (r - g) / d + 4;
  }
  return [h * 60, s * 100, l * 100];
}

function relativeLuminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const toLin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const r = toLin((n >> 16) & 255);
  const g = toLin((n >> 8) & 255);
  const b = toLin(n & 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

function pickReadableText(bg: string): string {
  return contrastRatio(bg, "#ffffff") >= contrastRatio(bg, "#111111") ? "#ffffff" : "#111111";
}

// Samples a downscaled copy of the image, bucketing pixels into 24 hue
// buckets (weighted by saturation, so vivid belt/gi/background colors
// outvote skin tones and white gi fabric) and averaging the winning
// bucket's H/S/L. Falls back to the overall average when every pixel is
// too neutral (grayscale photo, heavy white balance, etc).
async function extractDominantHsl(url: string): Promise<[number, number, number] | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const size = 48;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);

        const buckets = new Map<
          number,
          { weight: number; hSum: number; sSum: number; lSum: number; count: number }
        >();
        let fallbackHSum = 0;
        let fallbackSSum = 0;
        let fallbackLSum = 0;
        let fallbackCount = 0;

        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] < 200) continue;
          const [h, s, l] = rgbToHsl(data[i], data[i + 1], data[i + 2]);
          fallbackHSum += h;
          fallbackSSum += s;
          fallbackLSum += l;
          fallbackCount++;
          if (l < 8 || l > 92 || s < 15) continue;
          const bucket = Math.floor(h / 15) % 24;
          const entry = buckets.get(bucket) ?? { weight: 0, hSum: 0, sSum: 0, lSum: 0, count: 0 };
          entry.weight += s;
          entry.hSum += h;
          entry.sSum += s;
          entry.lSum += l;
          entry.count += 1;
          buckets.set(bucket, entry);
        }

        let best: { weight: number; hSum: number; sSum: number; lSum: number; count: number } | null = null;
        for (const entry of buckets.values()) {
          if (!best || entry.weight > best.weight) best = entry;
        }

        if (best && best.count > 0) {
          resolve([best.hSum / best.count, best.sSum / best.count, best.lSum / best.count]);
        } else if (fallbackCount > 0) {
          resolve([fallbackHSum / fallbackCount, fallbackSSum / fallbackCount, fallbackLSum / fallbackCount]);
        } else {
          resolve(null);
        }
      } catch {
        // Tainted canvas (photo host doesn't send CORS headers) or any
        // other extraction failure - fall back to the default look.
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function buildPalette([h, s]: [number, number, number]): Palette {
  const primaryDark = hslToHex(h, Math.max(s, 35), 24);
  const primaryLight = hslToHex(h, Math.min(Math.max(s, 20), 55), 95);
  const accentText = hslToHex(h, Math.max(s, 40), 32);
  return {
    primaryDark,
    primaryLight,
    accentText,
    textOnPrimaryDark: pickReadableText(primaryDark),
  };
}

const cache = new Map<string, Promise<Palette | null>>();

function getPalette(url: string): Promise<Palette | null> {
  let promise = cache.get(url);
  if (!promise) {
    promise = extractDominantHsl(url).then((hsl) => (hsl ? buildPalette(hsl) : null));
    cache.set(url, promise);
  }
  return promise;
}

export function usePhotoPalette(photoUrl: string | null | undefined): Palette | null {
  const [palette, setPalette] = useState<Palette | null>(null);

  useEffect(() => {
    if (!photoUrl) {
      setPalette(null);
      return;
    }
    let cancelled = false;
    getPalette(photoUrl).then((p) => {
      if (!cancelled) setPalette(p);
    });
    return () => {
      cancelled = true;
    };
  }, [photoUrl]);

  return palette;
}
