import { mkCanvas, setPieceBitmap } from './fkEngine';
import type { RigNode, RigPiece } from './types';

export type SkullViewMode = 'front' | 'side' | 'back';

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
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 10) continue;
        const r = d[i];
        const gr = d[i + 1];
        const b = d[i + 2];
        // Shift #6e05f1 purple tones to exact puppet purple #5d03b4 without touching black or white
        if (b > gr + 20 && b > r + 15) {
          d[i] = Math.min(255, Math.round((r * 93) / 110));
          d[i + 1] = Math.min(255, Math.round((gr * 3) / 5));
          d[i + 2] = Math.min(255, Math.round((b * 180) / 241));
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
  onWake: () => void,
): void {
  if (!headNode.pieces.length) return;
  const hp = headNode.pieces[0];
  activeRequestedMode = mode;

  if (!hp.restBox) {
    hp.restBox = { x: hp.x, y: hp.y, w: hp.w, h: hp.h };
  }
  if (!frontBitmapCache) {
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
      onWake();
    }
    return;
  }

  const spec = SKULL_SPECS[mode];
  hp.name = mode === 'side' ? 'Side' : 'Back';
  headNode.name = mode === 'side' ? 'Head (Side)' : 'Head (Back)';

  const cached = skullCache[mode];
  if (cached) {
    applyBox(hp, { x: spec.dx, y: spec.dy, w: spec.w, h: spec.h });
    setPieceBitmap(hp, cached, onWake);
    return;
  }

  loadNormalizedSkullAsset(mode)
    .then((canvas) => {
      if (activeRequestedMode !== mode) return;
      applyBox(hp, { x: spec.dx, y: spec.dy, w: spec.w, h: spec.h });
      setPieceBitmap(hp, canvas, onWake);
    })
    .catch(() => {
      onWake();
    });
}
