/**
 * Feature Notes (Plain English):
 * - Skull Model Views & 360° Head Swivel: Lets the puppet head turn cleanly through
 *   4 cardinal poses (Front, Side Right, Back, Side Left) using the real PNG skull kits
 *   and horizontal mirroring for the opposite side, matching Bitruvius's body purple and
 *   pure black ink while keeping white teeth sharp.
 */
import { mkCanvas, setPieceBitmap } from './fkEngine';
import type { RigNode, RigPiece } from './types';

export type SkullViewMode = 'front' | 'side' | 'back';
export type HeadTurnStep = 0 | 1 | 2 | 3;

export interface HeadTurnSpec {
  step: HeadTurnStep;
  view: SkullViewMode;
  flipX: boolean;
  label: string;
}

// 4-step 360° turntable order matching natural right-turn dragging across the front face:
// Front -> Side Right (skull-side faces viewer right) -> Back -> Side Left (mirrored left) -> Front
export const HEAD_TURN_SEQUENCE: readonly HeadTurnSpec[] = [
  { step: 0, view: 'front', flipX: false, label: 'Front' },
  { step: 1, view: 'side', flipX: false, label: 'Side Right' },
  { step: 2, view: 'back', flipX: false, label: 'Back' },
  { step: 3, view: 'side', flipX: true, label: 'Side Left' },
] as const;

export function getHeadTurnStep(view: SkullViewMode, headFlipX = false): HeadTurnStep {
  if (view === 'front') return 0;
  if (view === 'back') return 2;
  return headFlipX ? 3 : 1;
}

interface SkullAssetSpec {
  url: string;
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  w: number;
  h: number;
  dx: number;
  dy: number;
}

const SKULL_SPECS: Record<'side' | 'back', SkullAssetSpec> = {
  // Real Side Skull PNG (3000x3000, cropped to opaque cranium+jaw bbox [368..2608, 96..2980])
  side: {
    url: '/assets/skull-side.png',
    sx: 368,
    sy: 96,
    sw: 2240,
    sh: 2884,
    w: 668,
    h: 860,
    dx: 926,
    dy: 54,
  },
  // Real Back Skull PNG (3000x4219, cropped to opaque occipital bbox [504..2496, 76..3116])
  back: {
    url: '/assets/skull-back.png',
    sx: 504,
    sy: 76,
    sw: 1992,
    sh: 3040,
    w: 601,
    h: 896,
    dx: 958,
    dy: 18,
  },
};

type BitmapCanvas = (HTMLCanvasElement | OffscreenCanvas) & { width: number; height: number };

let frontBitmapCache: (CanvasImageSource & { width: number; height: number }) | null = null;
const skullCache: Partial<Record<'side' | 'back', BitmapCanvas>> = {};
const skullLoadPromises: Partial<Record<'side' | 'back', Promise<BitmapCanvas>>> = {};
let activeRequestedMode: SkullViewMode = 'front';

export function setFrontSkullCache(
  bm: (CanvasImageSource & { width: number; height: number }) | null,
): void {
  frontBitmapCache = bm;
}

/**
 * Crops the real PNG skull sprite to its tight silhouette bounds and harmonizes
 * the primary #6e05f1 purple fill to Bitruvius's exact body purple (#5d03b4)
 * while preserving pure #000000 outlines and #ffffff teeth.
 */
function loadNormalizedSkullAsset(mode: 'side' | 'back'): Promise<BitmapCanvas> {
  if (skullCache[mode]) return Promise.resolve(skullCache[mode]!);
  if (skullLoadPromises[mode]) return skullLoadPromises[mode]!;

  const spec = SKULL_SPECS[mode];
  const promise = new Promise<BitmapCanvas>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const c = mkCanvas(spec.w, spec.h) as BitmapCanvas;
      const g = c.getContext('2d', { willReadFrequently: true }) as
        | CanvasRenderingContext2D
        | OffscreenCanvasRenderingContext2D
        | null;
      if (!g) {
        reject(new Error('2D context unavailable'));
        return;
      }
      g.clearRect(0, 0, spec.w, spec.h);
      g.drawImage(img, spec.sx, spec.sy, spec.sw, spec.sh, 0, 0, spec.w, spec.h);

      const imgData = g.getImageData(0, 0, spec.w, spec.h);
      const d = imgData.data;

      // Measure the actual browser-decoded dominant purple fill (accounts for embedded ICC/P3 profiles)
      let sumR = 0;
      let sumG = 0;
      let sumB = 0;
      let count = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 220) continue;
        const r = d[i];
        const gr = d[i + 1];
        const b = d[i + 2];
        if (b > 120 && b > gr + 35 && b > r + 25) {
          sumR += r;
          sumG += gr;
          sumB += b;
          count++;
        }
      }
      const domR = count > 0 ? sumR / count : 110;
      const domG = count > 0 ? sumG / count : 5;
      const domB = count > 0 ? sumB / count : 241;

      const TARGET_R = 93;  // #5d
      const TARGET_G = 3;   // #03
      const TARGET_B = 180; // #b4

      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 10) continue;
        const r = d[i];
        const gr = d[i + 1];
        const b = d[i + 2];

        // Snap solid purple body fill & remap anti-aliased purple fringes to exact #5d03b4
        if (b > gr + 16 && b > r + 10) {
          if (Math.abs(r - domR) <= 14 && Math.abs(gr - domG) <= 14 && Math.abs(b - domB) <= 14) {
            d[i] = TARGET_R;
            d[i + 1] = TARGET_G;
            d[i + 2] = TARGET_B;
          } else if (gr > domG + 14) {
            // Blend toward white teeth/highlights
            const wMix = Math.max(0, Math.min(1, (gr - domG) / Math.max(1, 255 - domG)));
            d[i] = Math.round(TARGET_R + (255 - TARGET_R) * wMix);
            d[i + 1] = Math.round(TARGET_G + (255 - TARGET_G) * wMix);
            d[i + 2] = Math.round(TARGET_B + (255 - TARGET_B) * wMix);
          } else {
            // Blend toward black ink outlines
            const kMix = Math.max(0, Math.min(1.15, b / Math.max(1, domB)));
            d[i] = Math.min(255, Math.round(TARGET_R * kMix));
            d[i + 1] = Math.min(255, Math.round(TARGET_G * kMix));
            d[i + 2] = Math.min(255, Math.round(TARGET_B * kMix));
          }
        } else if (r < 32 && gr < 36 && b < 32) {
          // Neutralize faint green/chroma tint on dark outlines to match pure #000000 rig ink
          const lum = Math.round(0.299 * r + 0.587 * gr + 0.114 * b);
          d[i] = lum < 14 ? 0 : lum;
          d[i + 1] = lum < 14 ? 0 : lum;
          d[i + 2] = lum < 14 ? 0 : lum;
        }
      }
      g.putImageData(imgData, 0, 0);
      skullCache[mode] = c;
      resolve(c);
    };
    img.onerror = () => reject(new Error(`Failed to load skull asset: ${spec.url}`));
    img.src = spec.url;
  });

  skullLoadPromises[mode] = promise;
  return promise;
}

function applyBox(hp: RigPiece, box: { x: number; y: number; w: number; h: number }): void {
  hp.x = box.x;
  hp.y = box.y;
  hp.w = box.w;
  hp.h = box.h;
}

/**
 * Applies the requested skull view ('front' | 'side' | 'back') to the head node
 * using the real PNG skull models in /public/assets/skull-{side,back}.png.
 */
export function applySkullView(
  headNode: RigNode,
  mode: SkullViewMode,
  onWake?: () => void,
): void {
  if (!headNode.pieces.length) return;
  const hp = headNode.pieces[0];
  activeRequestedMode = mode;

  if (!hp.restBox) {
    hp.restBox = { x: hp.x, y: hp.y, w: hp.w, h: hp.h };
  }
  if (!frontBitmapCache && hp.name === 'Front') {
    frontBitmapCache = (hp.full0 || hp.bm0 || hp.bm) as
      | (CanvasImageSource & { width: number; height: number })
      | null;
  }

  if (mode === 'front') {
    hp.name = 'Front';
    headNode.name = 'Head (Front)';
    applyBox(hp, hp.restBox);
    if (frontBitmapCache) {
      setPieceBitmap(hp, frontBitmapCache, onWake);
    } else {
      onWake?.();
    }
    return;
  }

  const spec = SKULL_SPECS[mode];
  const headOffsetY = hp.restBox.y - 18;
  hp.name = mode === 'side' ? 'Side' : 'Back';
  headNode.name = mode === 'side' ? (headNode.flipX ? 'Head (Side L)' : 'Head (Side R)') : 'Head (Back)';

  const cached = skullCache[mode];
  if (cached) {
    applyBox(hp, { x: spec.dx, y: spec.dy + headOffsetY, w: spec.w, h: spec.h });
    setPieceBitmap(hp, cached, onWake);
    return;
  }

  loadNormalizedSkullAsset(mode)
    .then((canvas) => {
      if (activeRequestedMode !== mode) return;
      applyBox(hp, { x: spec.dx, y: spec.dy + headOffsetY, w: spec.w, h: spec.h });
      setPieceBitmap(hp, canvas, onWake);
    })
    .catch(() => {
      onWake?.();
    });
}

/**
 * Applies one of the 4 cardinal 360° head turntable steps cleanly, toggling horizontal flip
 * for Side Left while keeping Front and Back unflipped.
 */
export function applyHeadTurnStep(
  headNode: RigNode,
  step: HeadTurnStep,
  onWake?: () => void,
): HeadTurnSpec {
  const spec = HEAD_TURN_SEQUENCE[((step % 4) + 4) % 4];
  headNode.flipX = spec.flipX;
  applySkullView(headNode, spec.view, onWake);
  return spec;
}
