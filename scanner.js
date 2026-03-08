// ═══════════════════════════════════════════════════════════════
// CORRETOR — OpenCV.js pipeline
// ═══════════════════════════════════════════════════════════════

// ─── State ────────────────────────────────────────────────────
let scannerKey     = null;
let videoStream    = null;
let processTimer   = null;
let scannerState   = 'idle';   // 'scanning' | 'captured' | 'idle'
let offscreenCvs   = null;
let offscreenCtx2d = null;
let lastBubbleStates  = null;
let lastMarksDetected = false;

// ─── Sheet geometry constants (warped 794×1123 px) ────────────
const SHEET_W = 794, SHEET_H = 1123;
const ALTS    = ['A','B','C','D','E'];

// 4 columns: left edges at these x-positions (after 42px inner padding)
const COL_X = [42, 219.5, 397, 574.5];

// Bubble centers relative to bubble-area start (space-evenly across 151.5px, 5×18px bubbles)
const BUBBLE_X_OFF = [19.25, 47.5, 75.75, 104, 132.25];

const QNUM_W   = 26;     // q-num element width (22px) + gap (4px)
const ROW_Y0   = 271.5;  // center-y of first row's bubble (row top 261 + 1.5 pad + 9 radius)
const ROW_DY   = 21;     // row height (1.5 + 18 + 1.5 px)
const Q_PER_COL = 25;

function getBubbleCenter(qIdx, altIdx) {
  const col = Math.floor(qIdx / Q_PER_COL);
  const row = qIdx % Q_PER_COL;
  return [
    COL_X[col] + QNUM_W + BUBBLE_X_OFF[altIdx],
    ROW_Y0 + row * ROW_DY
  ];
}

// ─── OpenCV lazy loader ───────────────────────────────────────
function loadOpenCV() {
  return new Promise(resolve => {
    if (window.cv && cv.Mat) { resolve(); return; }
    if (document.getElementById('opencv-script')) {
      const wait = setInterval(() => { if (window.cv && cv.Mat) { clearInterval(wait); resolve(); } }, 100);
      return;
    }
    const s = document.createElement('script');
    s.id  = 'opencv-script';
    s.src = 'https://docs.opencv.org/4.8.0/opencv.js';
    s.onload = () => {
      const wait = setInterval(() => { if (window.cv && cv.Mat) { clearInterval(wait); resolve(); } }, 100);
    };
    document.head.appendChild(s);
  });
}

// ─── Open / Close ─────────────────────────────────────────────
async function openScanner(keyId) {
  const saved = load();
  scannerKey = saved.find(k => k.id === keyId);
  if (!scannerKey) return;

  scannerState      = 'scanning';
  lastBubbleStates  = null;
  lastMarksDetected = false;

  if (!offscreenCvs) {
    offscreenCvs   = document.createElement('canvas');
    offscreenCtx2d = offscreenCvs.getContext('2d');
  }

  const modal = document.getElementById('scanner-modal');
  modal.hidden = false;
  document.getElementById('scanner-title').textContent = 'Corretor — ' + scannerKey.name;
  document.getElementById('scanner-result').hidden = true;
  document.getElementById('btn-new-scan').hidden   = true;
  document.getElementById('btn-capture').hidden    = false;
  setStatus('● Iniciando câmera...');

  try {
    videoStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }
    });
    const video = document.getElementById('scanner-video');
    video.srcObject = videoStream;
    await video.play();
  } catch (e) {
    setStatus('⚠ Câmera não disponível: ' + e.message);
    return;
  }

  setStatus('● Carregando OpenCV...');
  await loadOpenCV();
  setStatus('● Posicione a folha na câmera');
  scheduleProcess();
}

function closeScanner() {
  scannerState = 'idle';
  if (processTimer) { clearTimeout(processTimer); processTimer = null; }
  if (videoStream)  { videoStream.getTracks().forEach(t => t.stop()); videoStream = null; }

  const video = document.getElementById('scanner-video');
  video.srcObject = null;

  const canvas = document.getElementById('scanner-canvas');
  canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);

  document.getElementById('scanner-modal').hidden = true;
  scannerKey        = null;
  lastBubbleStates  = null;
  lastMarksDetected = false;
}

function setStatus(msg) {
  document.getElementById('scanner-status').textContent = msg;
}

// ─── Processing loop (~8 fps) ─────────────────────────────────
function scheduleProcess() {
  if (scannerState !== 'scanning') return;
  processTimer = setTimeout(processFrame, 120);
}

// ─── Registration mark detection ──────────────────────────────
function detectMarks(contours, W, H) {
  const zone   = Math.min(W, H) * 0.30;
  const result = { tl: null, tr: null, bl: null, br: null };

  for (let i = 0; i < contours.size(); i++) {
    const rect   = cv.boundingRect(contours.get(i));
    if (rect.width < 6 || rect.width > 100 || rect.height < 6 || rect.height > 100) continue;
    const aspect = rect.width / rect.height;
    if (aspect < 0.5 || aspect > 2.0) continue;

    const cx = rect.x + rect.width  / 2;
    const cy = rect.y + rect.height / 2;
    const corner =
      cx < zone         && cy < zone         ? 'tl' :
      cx > W - zone     && cy < zone         ? 'tr' :
      cx < zone         && cy > H - zone     ? 'bl' :
      cx > W - zone     && cy > H - zone     ? 'br' : null;

    if (corner) {
      const area = rect.width * rect.height;
      if (!result[corner] || area > result[corner].area) {
        result[corner] = { cx, cy, x: rect.x, y: rect.y, w: rect.width, h: rect.height, area };
      }
    }
  }

  return (result.tl && result.tr && result.bl && result.br) ? result : null;
}

// ─── Adaptive fill threshold ──────────────────────────────────
function computeAdaptiveThreshold(grayData, nQ) {
  const limit = Math.min(nQ, Q_PER_COL * COL_X.length);
  const intensities = [];

  for (let q = 0; q < limit; q++) {
    for (let alt = 0; alt < 5; alt++) {
      const [cx, cy] = getBubbleCenter(q, alt);
      let sum = 0, count = 0;
      for (let dy = -7; dy <= 7; dy++) {
        for (let dx = -7; dx <= 7; dx++) {
          const px = Math.round(cx) + dx;
          const py = Math.round(cy) + dy;
          if (px >= 0 && px < SHEET_W && py >= 0 && py < SHEET_H) {
            sum += grayData[py * SHEET_W + px];
            count++;
          }
        }
      }
      if (count > 0) intensities.push(sum / count);
    }
  }

  if (intensities.length < 2) return 128;
  intensities.sort((a, b) => a - b);

  let maxGap = 0, gapMid = 128;
  for (let i = 1; i < intensities.length; i++) {
    const gap = intensities[i] - intensities[i - 1];
    if (gap > maxGap) { maxGap = gap; gapMid = (intensities[i] + intensities[i - 1]) / 2; }
  }

  return maxGap > 5 ? gapMid : 128;
}

// ─── Bubble pixel sampling ────────────────────────────────────
function sampleBubbles(grayData, nQ) {
  const limit     = Math.min(nQ, Q_PER_COL * COL_X.length);
  const threshold = computeAdaptiveThreshold(grayData, nQ);
  const states    = [];

  for (let q = 0; q < limit; q++) {
    const altFilled = [];
    for (let alt = 0; alt < 5; alt++) {
      const [cx, cy] = getBubbleCenter(q, alt);
      let dark = 0, total = 0;
      for (let dy = -7; dy <= 7; dy++) {
        for (let dx = -7; dx <= 7; dx++) {
          const px = Math.round(cx) + dx;
          const py = Math.round(cy) + dy;
          if (px >= 0 && px < SHEET_W && py >= 0 && py < SHEET_H) {
            if (grayData[py * SHEET_W + px] < threshold) dark++;
            total++;
          }
        }
      }
      altFilled.push(total > 0 && dark / total > 0.25);
    }
    const marked = altFilled.filter(Boolean).length;
    states.push({
      altFilled,
      marked,
      markedAlt: marked === 1 ? altFilled.indexOf(true) : -1
    });
  }
  return states;
}

// ─── Project sheet-space point → video-frame point ────────────
function projectPt(x, y, d) {
  const px = d[0]*x + d[1]*y + d[2];
  const py = d[3]*x + d[4]*y + d[5];
  const pw = d[6]*x + d[7]*y + d[8];
  return [px / pw, py / pw];
}

// ─── Draw bubble overlay on video canvas ─────────────────────
function drawOverlay(ctx, states, minvData, nQ, answers) {
  const limit = Math.min(nQ, states.length);
  for (let q = 0; q < limit; q++) {
    const s          = states[q];
    const correctAlt = answers[q + 1] ? ALTS.indexOf(answers[q + 1]) : -1;

    for (let alt = 0; alt < 5; alt++) {
      const [cx, cy] = getBubbleCenter(q, alt);
      const [vx, vy] = projectPt(cx, cy, minvData);

      let color;
      if (s.marked > 1 && s.altFilled[alt]) {
        color = 'rgba(240,192,96,0.9)';                               // amber — double mark
      } else if (s.marked === 1 && s.markedAlt === alt) {
        color = alt === correctAlt
          ? 'rgba(95,201,138,0.9)'                                    // green  — correct
          : 'rgba(224,112,112,0.9)';                                  // red    — wrong
      } else {
        color = 'rgba(123,189,232,0.18)';                             // grey   — empty
      }

      ctx.beginPath();
      ctx.arc(vx, vy, 8, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    }
  }
}

// ─── Main frame processor ─────────────────────────────────────
function processFrame() {
  if (scannerState !== 'scanning') return;

  const video         = document.getElementById('scanner-video');
  const overlayCanvas = document.getElementById('scanner-canvas');

  if (!video.videoWidth || !video.videoHeight) { scheduleProcess(); return; }

  const W = video.videoWidth, H = video.videoHeight;
  if (overlayCanvas.width  !== W) overlayCanvas.width  = W;
  if (overlayCanvas.height !== H) overlayCanvas.height = H;

  offscreenCvs.width  = W;
  offscreenCvs.height = H;
  offscreenCtx2d.drawImage(video, 0, 0);
  const imageData = offscreenCtx2d.getImageData(0, 0, W, H);

  const ctx = overlayCanvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);

  let src=null, gray=null, blurred=null, thresh=null,
      contours=null, hier=null, warped=null, M=null, Minv=null,
      srcPts=null, dstPts=null;

  try {
    src      = cv.matFromImageData(imageData);
    gray     = new cv.Mat();
    blurred  = new cv.Mat();
    thresh   = new cv.Mat();
    contours = new cv.MatVector();
    hier     = new cv.Mat();

    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.equalizeHist(gray, gray);
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
    cv.adaptiveThreshold(blurred, thresh, 255,
      cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, 11, 2);
    const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
    cv.morphologyEx(thresh, thresh, cv.MORPH_CLOSE, kernel);
    kernel.delete();
    cv.findContours(thresh, contours, hier, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    const marks = detectMarks(contours, W, H);

    if (marks) {
      if (!lastMarksDetected) { setStatus('Folha detectada ✓'); lastMarksDetected = true; }

      srcPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
        marks.tl.cx, marks.tl.cy,
        marks.tr.cx, marks.tr.cy,
        marks.bl.cx, marks.bl.cy,
        marks.br.cx, marks.br.cy
      ]);
      dstPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
        31, 31,  763, 31,  31, 1092,  763, 1092
      ]);

      M      = cv.getPerspectiveTransform(srcPts, dstPts);
      warped = new cv.Mat();
      cv.warpPerspective(gray, warped, M, new cv.Size(SHEET_W, SHEET_H));

      Minv = new cv.Mat();
      cv.invert(M, Minv);

      const bubbleStates = sampleBubbles(warped.data, scannerKey.nQ);
      lastBubbleStates   = bubbleStates;

      // Draw corner-mark indicators
      ['tl','tr','bl','br'].forEach(c => {
        const m = marks[c];
        ctx.strokeStyle = '#5fc98a';
        ctx.lineWidth   = 2;
        ctx.strokeRect(m.x, m.y, m.w, m.h);
      });

      drawOverlay(ctx, bubbleStates, Minv.data64F, scannerKey.nQ, scannerKey.answers);

    } else {
      if (lastMarksDetected) {
        setStatus('● Posicione a folha na câmera');
        lastMarksDetected = false;
      }
      lastBubbleStates = null;

      // Aiming guide
      const pad = 24;
      ctx.strokeStyle = 'rgba(123,189,232,0.3)';
      ctx.lineWidth   = 2;
      ctx.setLineDash([10, 5]);
      ctx.strokeRect(pad, pad, W - pad * 2, H - pad * 2);
      ctx.setLineDash([]);
    }

  } catch (_) {
    // continue silently on any OpenCV error
  } finally {
    [src, gray, blurred, thresh, contours, hier, warped, M, Minv, srcPts, dstPts]
      .forEach(m => { try { if (m) m.delete(); } catch (_) {} });
  }

  scheduleProcess();
}

// ─── Capture ─────────────────────────────────────────────────
function captureFrame() {
  if (!lastBubbleStates) {
    setStatus('⚠ Nenhuma folha detectada — reposicione e tente novamente');
    return;
  }

  scannerState = 'captured';
  if (processTimer) { clearTimeout(processTimer); processTimer = null; }

  const nQ    = scannerKey.nQ;
  const score = computeScore(lastBubbleStates, scannerKey.answers, nQ);
  const pct   = score.nQ > 0 ? Math.round(score.hits / score.nQ * 100) : 0;

  document.getElementById('result-score').textContent = score.hits + ' / ' + score.nQ;
  document.getElementById('result-pct').textContent   = pct + '%';

  const parts = [];
  if (score.hits)   parts.push('✓ ' + score.hits   + ' acerto'  + (score.hits   !== 1 ? 's' : ''));
  if (score.misses) parts.push('✗ ' + score.misses + ' erro'    + (score.misses !== 1 ? 's' : ''));
  if (score.blank)  parts.push('— ' + score.blank  + ' em branco');
  if (score.double) parts.push('⚠ ' + score.double + ' dupla marcação');
  document.getElementById('result-detail').textContent = parts.join('   ');

  document.getElementById('scanner-result').hidden = false;
  document.getElementById('btn-capture').hidden    = true;
  document.getElementById('btn-new-scan').hidden   = false;
  setStatus('Capturado ✓');
}

// ─── Resume scan ─────────────────────────────────────────────
function resumeScan() {
  scannerState      = 'scanning';
  lastBubbleStates  = null;
  lastMarksDetected = false;
  document.getElementById('scanner-result').hidden = true;
  document.getElementById('btn-capture').hidden    = false;
  document.getElementById('btn-new-scan').hidden   = true;
  setStatus('● Posicione a folha na câmera');
  scheduleProcess();
}

// ─── Score computation ────────────────────────────────────────
function computeScore(states, answers, nQ) {
  let hits = 0, misses = 0, blank = 0, double = 0;
  const limit = Math.min(nQ, states.length);
  for (let q = 0; q < limit; q++) {
    const s       = states[q];
    const correct = answers[q + 1] ? ALTS.indexOf(answers[q + 1]) : -1;
    if      (s.marked === 0)                            blank++;
    else if (s.marked > 1)                              double++;
    else if (s.markedAlt === correct && correct >= 0)   hits++;
    else                                                misses++;
  }
  return { hits, misses, blank, double, nQ: limit };
}
