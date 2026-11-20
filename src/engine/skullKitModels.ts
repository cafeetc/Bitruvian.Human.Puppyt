import { mkCanvas } from './fkEngine';
import type { RigNode, RigPiece } from './types';

export type SkullViewMode = 'front' | 'side' | 'back';

let frontBitmapCache: CanvasImageSource | null = null;
let sideBitmapCache: CanvasImageSource | null = null;
let backBitmapCache: CanvasImageSource | null = null;

/**
 * Creates high-fidelity Side profile skull model matching Bitruvius cutout art
 * (#120e18 dark silhouette bone, #7410c7 / #5a10d8 cranial plates, #000000 outlines).
 */
export function createSideSkullCanvas(w = 601, h = 896): HTMLCanvasElement | OffscreenCanvas {
  const c = mkCanvas(w, h);
  const g = c.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  g.clearRect(0, 0, w, h);

  // Scaled coordinates relative to w=601, h=896
  const sx = w / 601;
  const sy = h / 896;
  g.save();
  g.scale(sx, sy);

  // 1. Lateral Cranium Vault & Occipital Base
  g.beginPath();
  g.moveTo(270, 72); // Frontal bone top
  g.bezierCurveTo(410, 70, 520, 180, 530, 350); // Superior parietal arch
  g.bezierCurveTo(535, 480, 510, 600, 430, 680); // Occipital curve & inion
  g.bezierCurveTo(390, 720, 360, 750, 340, 790); // Occipital base / mastoid
  g.lineTo(315, 830); // Condylar neck
  g.lineTo(295, 780); // Mandibular angle (gonion)
  g.bezierCurveTo(240, 790, 175, 795, 125, 765); // Inferior border of mandible
  g.lineTo(105, 735); // Mental protuberance (chin tip)
  g.lineTo(135, 680); // Mandibular incisor alveolar ridge
  g.lineTo(142, 640); // Maxillary incisor ridge
  g.lineTo(105, 590); // Anterior nasal spine
  g.bezierCurveTo(90, 540, 100, 480, 125, 420); // Nasal bridge & nasion
  g.bezierCurveTo(120, 310, 160, 170, 270, 72); // Glabella & frontal slope
  g.closePath();

  g.fillStyle = '#120e18';
  g.fill();
  g.lineWidth = 10;
  g.strokeStyle = '#000000';
  g.stroke();

  // 2. Cranial Inlay Plate (Frontal / Parietal bone shield)
  g.beginPath();
  g.moveTo(280, 120);
  g.bezierCurveTo(380, 120, 460, 210, 470, 340);
  g.bezierCurveTo(475, 420, 440, 510, 390, 560);
  g.bezierCurveTo(330, 500, 270, 460, 240, 410);
  g.bezierCurveTo(210, 300, 210, 200, 280, 120);
  g.closePath();
  g.fillStyle = '#5a10d8';
  g.fill();
  g.lineWidth = 6;
  g.strokeStyle = '#000000';
  g.stroke();

  // 3. Temporal Zygomatic Arch (Bridge from cheek to ear)
  g.beginPath();
  g.moveTo(210, 490);
  g.bezierCurveTo(270, 480, 340, 500, 390, 545);
  g.lineTo(380, 580);
  g.bezierCurveTo(320, 540, 260, 530, 200, 535);
  g.closePath();
  g.fillStyle = '#7410c7';
  g.fill();
  g.lineWidth = 5;
  g.strokeStyle = '#000000';
  g.stroke();

  // 4. Lateral Orbit (Eye Socket Profile)
  g.beginPath();
  g.moveTo(175, 410);
  g.bezierCurveTo(230, 400, 255, 445, 235, 495);
  g.bezierCurveTo(205, 525, 165, 510, 155, 465);
  g.closePath();
  g.fillStyle = '#09070d';
  g.fill();
  g.lineWidth = 6;
  g.strokeStyle = '#000000';
  g.stroke();

  // 5. External Auditory Meatus (Ear Canal)
  g.beginPath();
  g.arc(385, 590, 15, 0, Math.PI * 2);
  g.fillStyle = '#09070d';
  g.fill();
  g.lineWidth = 4;
  g.strokeStyle = '#000000';
  g.stroke();

  // 6. Nasal Aperture Cavity (Profile hollow)
  g.beginPath();
  g.moveTo(135, 510);
  g.lineTo(165, 535);
  g.lineTo(138, 575);
  g.closePath();
  g.fillStyle = '#09070d';
  g.fill();
  g.lineWidth = 4;
  g.strokeStyle = '#000000';
  g.stroke();

  // 7. Maxillary and Mandibular Teeth (Lateral row profile)
  g.fillStyle = '#f8fafc';
  g.lineWidth = 3;
  g.strokeStyle = '#1e1b29';
  for (let i = 0; i < 4; i++) {
    // Upper teeth
    g.beginPath();
    g.rect(148 + i * 22, 638, 18, 22);
    g.fill();
    g.stroke();
    // Lower teeth
    g.beginPath();
    g.rect(142 + i * 21, 664, 17, 21);
    g.fill();
    g.stroke();
  }

  // 8. Sutures & Bone Accent Contours
  g.lineWidth = 3.5;
  g.strokeStyle = 'rgba(168, 85, 247, 0.42)';
  g.beginPath();
  g.moveTo(330, 95);
  g.bezierCurveTo(345, 220, 385, 330, 390, 480);
  g.stroke();

  g.beginPath();
  g.moveTo(435, 290);
  g.bezierCurveTo(465, 410, 460, 520, 400, 630);
  g.stroke();

  g.restore();
  return c;
}

/**
 * Creates high-fidelity Back (posterior occipital) skull model matching Bitruvius cutout art
 * (#120e18 dark silhouette bone, #7410c7 / #5a10d8 cranial plates, #000000 outlines, zero facial openings).
 */
export function createBackSkullCanvas(w = 601, h = 896): HTMLCanvasElement | OffscreenCanvas {
  const c = mkCanvas(w, h);
  const g = c.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  g.clearRect(0, 0, w, h);

  const sx = w / 601;
  const sy = h / 896;
  g.save();
  g.scale(sx, sy);

  // 1. Symmetrical Posterior Cranial Dome
  g.beginPath();
  g.moveTo(300, 70); // Vertex / Bregma top center
  g.bezierCurveTo(450, 70, 530, 180, 535, 380); // Right parietal arch
  g.bezierCurveTo(538, 520, 490, 680, 415, 765); // Right occipital / mastoid
  g.bezierCurveTo(370, 810, 340, 825, 300, 830); // Cervical junction / foramen magnum base
  g.bezierCurveTo(260, 825, 230, 810, 185, 765); // Left occipital / mastoid
  g.bezierCurveTo(110, 680, 62, 520, 65, 380); // Left parietal arch
  g.bezierCurveTo(70, 180, 150, 70, 300, 70); // Return to top center
  g.closePath();

  g.fillStyle = '#120e18';
  g.fill();
  g.lineWidth = 10;
  g.strokeStyle = '#000000';
  g.stroke();

  // 2. Twin Parietal Plate Shields (Left & Right)
  g.beginPath();
  // Left parietal
  g.moveTo(280, 130);
  g.bezierCurveTo(180, 130, 120, 220, 115, 370);
  g.bezierCurveTo(110, 480, 150, 580, 240, 620);
  g.bezierCurveTo(275, 470, 280, 300, 280, 130);
  g.closePath();
  g.fillStyle = '#5a10d8';
  g.fill();
  g.lineWidth = 6;
  g.strokeStyle = '#000000';
  g.stroke();

  g.beginPath();
  // Right parietal
  g.moveTo(320, 130);
  g.bezierCurveTo(420, 130, 480, 220, 485, 370);
  g.bezierCurveTo(490, 480, 450, 580, 360, 620);
  g.bezierCurveTo(325, 470, 320, 300, 320, 130);
  g.closePath();
  g.fillStyle = '#5a10d8';
  g.fill();
  g.lineWidth = 6;
  g.strokeStyle = '#000000';
  g.stroke();

  // 3. Central Occipital Scale Plate (Inion region)
  g.beginPath();
  g.moveTo(300, 510);
  g.bezierCurveTo(360, 510, 410, 560, 415, 660);
  g.bezierCurveTo(370, 720, 340, 750, 300, 755);
  g.bezierCurveTo(260, 750, 230, 720, 185, 660);
  g.bezierCurveTo(190, 560, 240, 510, 300, 510);
  g.closePath();
  g.fillStyle = '#7410c7';
  g.fill();
  g.lineWidth = 6;
  g.strokeStyle = '#000000';
  g.stroke();

  // 4. Sagittal & Lambdoid Suture Accents (Purple neon bone lines)
  g.lineWidth = 4;
  g.strokeStyle = 'rgba(168, 85, 247, 0.48)';

  // Midline sagittal suture
  g.beginPath();
  g.moveTo(300, 95);
  g.lineTo(300, 500);
  g.stroke();

  // Lambdoid suture forks
  g.beginPath();
  g.moveTo(300, 500);
  g.bezierCurveTo(360, 530, 430, 590, 465, 690);
  g.stroke();

  g.beginPath();
  g.moveTo(300, 500);
  g.bezierCurveTo(240, 530, 170, 590, 135, 690);
  g.stroke();

  // 5. Inion bump (External Occipital Protuberance)
  g.beginPath();
  g.arc(300, 615, 14, 0, Math.PI * 2);
  g.fillStyle = '#09070d';
  g.fill();
  g.lineWidth = 3.5;
  g.strokeStyle = '#a855f7';
  g.stroke();

  // Superior and Inferior Nuchal Line Ridges
  g.lineWidth = 3;
  g.strokeStyle = 'rgba(168, 85, 247, 0.35)';
  g.beginPath();
  g.moveTo(200, 645);
  g.quadraticCurveTo(300, 630, 400, 645);
  g.stroke();

  g.beginPath();
  g.moveTo(230, 705);
  g.quadraticCurveTo(300, 690, 370, 705);
  g.stroke();

  // 6. Cervical Spine Attachment Socket
  g.beginPath();
  g.ellipse(300, 805, 42, 22, 0, 0, Math.PI * 2);
  g.fillStyle = '#09070d';
  g.fill();
  g.lineWidth = 4;
  g.strokeStyle = '#000000';
  g.stroke();

  g.restore();
  return c;
}

/**
 * Applies the requested skull view ('front' | 'side' | 'back') to the head node.
 */
export function applySkullView(
  headNode: RigNode,
  mode: SkullViewMode,
  onWake: () => void,
): void {
  if (!headNode.pieces.length) return;
  const hp = headNode.pieces[0];

  // Cache initial Front image if not already cached
  if (!frontBitmapCache) {
    frontBitmapCache = (hp.full0 || hp.bm0 || hp.bm) as CanvasImageSource;
  }

  if (mode === 'front') {
    hp.name = 'Front';
    if (frontBitmapCache) {
      hp.bm = frontBitmapCache;
      onWake();
    }
    return;
  }

  if (mode === 'side') {
    hp.name = 'Side';
    if (!sideBitmapCache) {
      const c = createSideSkullCanvas(hp.w, hp.h);
      if (typeof createImageBitmap === 'function') {
        createImageBitmap(c).then((b) => {
          sideBitmapCache = b;
          hp.bm = b;
          onWake();
        });
        return;
      }
      sideBitmapCache = c;
    }
    hp.bm = sideBitmapCache;
    onWake();
    return;
  }

  if (mode === 'back') {
    hp.name = 'Back';
    if (!backBitmapCache) {
      const c = createBackSkullCanvas(hp.w, hp.h);
      if (typeof createImageBitmap === 'function') {
        createImageBitmap(c).then((b) => {
          backBitmapCache = b;
          hp.bm = b;
          onWake();
        });
        return;
      }
      backBitmapCache = c;
    }
    hp.bm = backBitmapCache;
    onWake();
    return;
  }
}
