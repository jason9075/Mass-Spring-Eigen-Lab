import * as THREE from 'three';
import GUI from 'lil-gui';

// ── DOM refs ──────────────────────────────────────────────
const canvas     = document.getElementById('canvas');
const btnSwing   = document.getElementById('btn-swing');
const btnStretch = document.getElementById('btn-stretch');
const btnReset   = document.getElementById('btn-reset');
const btnPause   = document.getElementById('btn-pause');
const openMath   = document.getElementById('open-math');
const closeMath  = document.getElementById('close-math');
const langToggle = document.getElementById('lang-toggle');
const mathModal  = document.getElementById('math-modal');
const mathContent= document.getElementById('math-content');
const labelA  = document.getElementById('label-a');
const labelB  = document.getElementById('label-b');
const labelS1 = document.getElementById('label-s1');
const labelS2 = document.getElementById('label-s2');
const labelV1 = document.getElementById('label-v1');
const labelV2 = document.getElementById('label-v2');
const elK11   = document.getElementById('k11');
const elK12   = document.getElementById('k12');
const elK21   = document.getElementById('k21');
const elK22   = document.getElementById('k22');
const elL1    = document.getElementById('lam1');
const elL2    = document.getElementById('lam2');
const elF1    = document.getElementById('freq1');
const elF2    = document.getElementById('freq2');
const elV1a   = document.getElementById('v1a');
const elV1b   = document.getElementById('v1b');
const elV2a   = document.getElementById('v2a');
const elV2b   = document.getElementById('v2b');
const elExt1x  = document.getElementById('ext1x');
const elExt1y  = document.getElementById('ext1y');
const elExt2x  = document.getElementById('ext2x');
const elExt2y  = document.getElementById('ext2y');
const elFaxNet = document.getElementById('fax-net');
const elFayNet = document.getElementById('fay-net');
const elFbxNet = document.getElementById('fbx-net');
const elFbyNet = document.getElementById('fby-net');
const elC1     = document.getElementById('c1-val');
const elC2     = document.getElementById('c2-val');
const labelAxisX = document.getElementById('label-axis-x');
const labelAxisY = document.getElementById('label-axis-y');
const forceTooltip = document.getElementById('force-tooltip');
const fttName     = document.getElementById('ftt-name');
const fttF1Label  = document.getElementById('ftt-f1-label');
const fttF1x      = document.getElementById('ftt-f1x');
const fttF1y      = document.getElementById('ftt-f1y');
const fttF2Row    = document.getElementById('ftt-f2-row');
const fttF2x      = document.getElementById('ftt-f2x');
const fttF2y      = document.getElementById('ftt-f2y');
const fttSumRow   = document.getElementById('ftt-sum-row');
const fttSumLabel = document.getElementById('ftt-sum-label');
const fttNetx     = document.getElementById('ftt-netx');
const fttNety     = document.getElementById('ftt-nety');
const springTooltip = document.getElementById('spring-tooltip');
const sttName  = document.getElementById('stt-name');
const sttLen   = document.getElementById('stt-len');
const sttRest  = document.getElementById('stt-rest');
const sttExt   = document.getElementById('stt-ext');
const sttDirx  = document.getElementById('stt-dirx');
const sttDiry  = document.getElementById('stt-diry');
const tooltip = document.getElementById('mass-tooltip');
const ttName  = document.getElementById('tt-name');
const ttPx    = document.getElementById('tt-px');
const ttPy    = document.getElementById('tt-py');
const ttVx    = document.getElementById('tt-vx');
const ttVy    = document.getElementById('tt-vy');
const ttFx    = document.getElementById('tt-fx');
const ttFy    = document.getElementById('tt-fy');

// ── Renderer ──────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2E3440);

const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 50);
camera.position.set(0, 1.5, 7);
camera.lookAt(0, 1.5, 0);

// ── Physics constants ─────────────────────────────────────
const ANCHOR    = { x: 0, y: 4.0 };
const G         = 9.8;
const REST      = 1.0;   // spring natural length
const DT        = 1 / 120;
const DAMP      = 0.9994;
const SPRING_N  = 23;    // fixed point count for spring geometry (10 coils)

// ── Mutable physics parameters ────────────────────────────
const P = { k1: 15, k2: 10, m1: 1.0, m2: 1.0 };

// ── State ─────────────────────────────────────────────────
const pos = { ax: 0, ay: 0, bx: 0, by: 0 };
const vel = { ax: 0, ay: 0, bx: 0, by: 0 };
let paused = false;
const SIM = { speed: 1.0 };
let stepAccum = 0;

function getEquilibrium() {
  const ext1 = (P.m1 + P.m2) * G / P.k1;
  const ext2 = P.m2 * G / P.k2;
  return {
    ax: 0, ay: ANCHOR.y - REST - ext1,
    bx: 0, by: ANCHOR.y - REST - ext1 - REST - ext2,
  };
}

function resetToEquilibrium() {
  const eq = getEquilibrium();
  Object.assign(pos, eq);
  vel.ax = vel.ay = vel.bx = vel.by = 0;
}
resetToEquilibrium();

// ── Eigenvalue computation (analytic, 2×2 symmetric) ──────
let eigen = { K: [[25,-10],[-10,10]], l1: 5, l2: 30, v1: [0,0], v2: [0,0], f1: 0, f2: 0 };

function computeEigen() {
  const { k1, k2, m1, m2 } = P;
  const K = [[k1 + k2, -k2], [-k2, k2]];
  const tr  = K[0][0] + K[1][1];
  const det = K[0][0] * K[1][1] - K[0][1] * K[1][0];
  const disc = Math.sqrt(Math.max(0, tr * tr / 4 - det));
  const l1 = tr / 2 - disc;
  const l2 = tr / 2 + disc;

  function eigvec(lam) {
    const a = K[0][0] - lam, b = K[0][1];
    let v = Math.abs(a) > 1e-9 ? [-b / a, 1] : [1, -a / (b || 1e-9)];
    const n = Math.hypot(v[0], v[1]);
    v = [v[0] / n, v[1] / n];
    if (v[0] < 0) { v[0] = -v[0]; v[1] = -v[1]; }
    return v;
  }

  const v1 = eigvec(l1);
  const v2 = eigvec(l2);
  const f1 = (1 / (2 * Math.PI)) * Math.sqrt(Math.max(l1, 0) / m1);
  const f2 = (1 / (2 * Math.PI)) * Math.sqrt(Math.max(l2, 0) / m2);

  eigen = { K, l1, l2, v1, v2, f1, f2 };
}
computeEigen();

// ── Drag-force state ──────────────────────────────────────
const K_PULL = 55;
const drag  = { active: false, mass: null, cursor: new THREE.Vector3() };
const hover = { mass: null, cx: 0, cy: 0 };
const springHover = { spring: null, cx: 0, cy: 0 };
const forceHover  = { mass: null, cx: 0, cy: 0 };

function getDragForce() {
  if (!drag.active || !drag.mass) return null;
  const mx = drag.mass === 'a' ? pos.ax : pos.bx;
  const my = drag.mass === 'a' ? pos.ay : pos.by;
  return { mass: drag.mass, fx: K_PULL * (drag.cursor.x - mx), fy: K_PULL * (drag.cursor.y - my) };
}

// ── Verlet physics step ───────────────────────────────────
function computeAccel(df) {
  const { k1, k2, m1, m2 } = P;

  // Spring 1: anchor → A
  const dx1 = pos.ax - ANCHOR.x, dy1 = pos.ay - ANCHOR.y;
  const len1 = Math.hypot(dx1, dy1) || 1e-4;
  const ext1 = len1 - REST;
  const f1x = -k1 * ext1 * dx1 / len1;
  const f1y = -k1 * ext1 * dy1 / len1;

  // Spring 2: A → B
  const dx2 = pos.bx - pos.ax, dy2 = pos.by - pos.ay;
  const len2 = Math.hypot(dx2, dy2) || 1e-4;
  const ext2 = len2 - REST;
  const f2x = k2 * ext2 * dx2 / len2;
  const f2y = k2 * ext2 * dy2 / len2;

  // Extra drag force (mouse pull)
  const dafx = (df && df.mass === 'a') ? df.fx : 0;
  const dafy = (df && df.mass === 'a') ? df.fy : 0;
  const dbfx = (df && df.mass === 'b') ? df.fx : 0;
  const dbfy = (df && df.mass === 'b') ? df.fy : 0;

  // f2 points in direction A→B (force on A from spring 2).
  // Reaction on B is -f2 (B pulled toward A).
  return {
    aax: (f1x + f2x + dafx) / m1,
    aay: (f1y + f2y + dafy) / m1 - G,
    abx: (-f2x + dbfx) / m2,
    aby: (-f2y + dbfy) / m2 - G,
  };
}

function stepPhysics() {
  const df = getDragForce();
  const a1 = computeAccel(df);

  pos.ax += vel.ax * DT + 0.5 * a1.aax * DT * DT;
  pos.ay += vel.ay * DT + 0.5 * a1.aay * DT * DT;
  pos.bx += vel.bx * DT + 0.5 * a1.abx * DT * DT;
  pos.by += vel.by * DT + 0.5 * a1.aby * DT * DT;

  const a2 = computeAccel(df);

  vel.ax = (vel.ax + 0.5 * (a1.aax + a2.aax) * DT) * DAMP;
  vel.ay = (vel.ay + 0.5 * (a1.aay + a2.aay) * DT) * DAMP;
  vel.bx = (vel.bx + 0.5 * (a1.abx + a2.abx) * DT) * DAMP;
  vel.by = (vel.by + 0.5 * (a1.aby + a2.aby) * DT) * DAMP;
}

// ── Mode activation ───────────────────────────────────────
const AMP = 0.5;

function setMode(mode) {
  resetToEquilibrium();
  computeEigen();
  if (mode === 1) {
    // Swing: horizontal pendulum displacement — spring physics provides gravity-based restoring force
    pos.ax += eigen.v1[0] * AMP;
    pos.bx += eigen.v1[1] * AMP;
  } else {
    // Stretch: vertical spring displacement — A up, B down (opposite signs in v2)
    pos.ay += eigen.v2[0] * AMP;
    pos.by += eigen.v2[1] * AMP;
  }
  vel.ax = vel.ay = vel.bx = vel.by = 0;
}

// ── Three.js scene objects ────────────────────────────────

// Ceiling bar
const ceilGeom = new THREE.BufferGeometry().setFromPoints([
  new THREE.Vector3(-1.2, ANCHOR.y, 0),
  new THREE.Vector3( 1.2, ANCHOR.y, 0),
]);
scene.add(new THREE.Line(ceilGeom, new THREE.LineBasicMaterial({ color: 0x4C566A, linewidth: 2 })));

// Anchor pin
const anchorMesh = new THREE.Mesh(
  new THREE.SphereGeometry(0.07, 12, 12),
  new THREE.MeshStandardMaterial({ color: 0x4C566A }),
);
anchorMesh.position.set(ANCHOR.x, ANCHOR.y, 0);
scene.add(anchorMesh);

// Mass spheres
const massMat = new THREE.MeshStandardMaterial({ color: 0xD8DEE9 }); // Nord4
const meshA = new THREE.Mesh(new THREE.SphereGeometry(0.18, 32, 32), massMat);
const meshB = new THREE.Mesh(new THREE.SphereGeometry(0.18, 32, 32), massMat.clone());
scene.add(meshA, meshB);

// Spring lines (zigzag)
function makeSpringLine(color) {
  const buf = new Float32Array(SPRING_N * 3);
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(buf, 3));
  const line = new THREE.Line(geom, new THREE.LineBasicMaterial({ color }));
  scene.add(line);
  return line;
}

const spring1Line = makeSpringLine(0xECEFF4); // Nord6
const spring2Line = makeSpringLine(0xECEFF4);

function updateSpring(line, fx, fy, tx, ty) {
  const buf = line.geometry.attributes.position.array;
  const dx = tx - fx, dy = ty - fy;
  const len = Math.hypot(dx, dy) || 1e-4;
  const nx = -dy / len, ny = dx / len; // normal
  const amp = 0.1 + Math.abs(len - REST) * 0.05; // tension-reactive width

  for (let i = 0; i < SPRING_N; i++) {
    const t = i / (SPRING_N - 1);
    const side = (i === 0 || i === SPRING_N - 1) ? 0 : (i % 2 === 1 ? amp : -amp);
    buf[i * 3]     = fx + dx * t + nx * side;
    buf[i * 3 + 1] = fy + dy * t + ny * side;
    buf[i * 3 + 2] = 0;
  }
  line.geometry.attributes.position.needsUpdate = true;
}

// ── Eigenvector arrows ────────────────────────────────────
// Nord8 (#88C0D0) for v1, Nord12 (#D08770) for v2
const ARROW_SCALE = 0.55;

function makeArrow(color) {
  const arr = new THREE.ArrowHelper(
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(0, 0, 0),
    0.2, color, 0.07, 0.05,
  );
  scene.add(arr);
  return arr;
}

const arrV1A = makeArrow(0x88C0D0);
const arrV1B = makeArrow(0x88C0D0);
const arrV2A = makeArrow(0xD08770);
const arrV2B = makeArrow(0xD08770);

function updateArrow(arr, wx, wy, dirX, dirY, magnitude) {
  if (magnitude < 0.01) { arr.visible = false; return; }
  arr.visible = true;
  arr.position.set(wx, wy, 0);
  arr.setDirection(new THREE.Vector3(dirX, dirY, 0).normalize());
  arr.setLength(magnitude * ARROW_SCALE, 0.07, 0.05);
}

// ── Coordinate axes (bottom-left of scene) ────────────────
const AXIS_ORIGIN = new THREE.Vector3(-3.5, -1.0, 0);
const AXIS_LEN    = 0.75;
const axisX = new THREE.ArrowHelper(
  new THREE.Vector3(1, 0, 0), AXIS_ORIGIN, AXIS_LEN,
  0xBF616A, 0.18, 0.10,
);
const axisY = new THREE.ArrowHelper(
  new THREE.Vector3(0, 1, 0), AXIS_ORIGIN, AXIS_LEN,
  0xA3BE8C, 0.18, 0.10,
);
scene.add(axisX, axisY);

// ── Lights ────────────────────────────────────────────────
const dirLight = new THREE.DirectionalLight(0xECEFF4, 1.6);
dirLight.position.set(2, 4, 5);
scene.add(dirLight);
scene.add(new THREE.AmbientLight(0x4C566A, 1.0));

// ── World → screen projection ─────────────────────────────
const _proj = new THREE.Vector3();

function placeLabel(el, wx, wy) {
  _proj.set(wx, wy, 0).project(camera);
  el.style.left = `${(_proj.x  + 1) / 2 * window.innerWidth}px`;
  el.style.top  = `${(-_proj.y + 1) / 2 * window.innerHeight}px`;
}

// ── Resize ────────────────────────────────────────────────
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// ── Raycasting + drag interaction (both masses) ───────────
const raycaster = new THREE.Raycaster();
const dragPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
const GRAB_R    = 0.38;

function ndcFromEvent(e) {
  const rect = canvas.getBoundingClientRect();
  return new THREE.Vector2(
    ((e.clientX - rect.left) / rect.width)  *  2 - 1,
    ((e.clientY - rect.top)  / rect.height) * -2 + 1,
  );
}

function worldFromNdc(ndc) {
  raycaster.setFromCamera(ndc, camera);
  const pt = new THREE.Vector3();
  raycaster.ray.intersectPlane(dragPlane, pt);
  return pt;
}

// Pull-force visual line (Nord13 yellow)
const pullBuf  = new Float32Array(6);
const pullGeom = new THREE.BufferGeometry();
pullGeom.setAttribute('position', new THREE.BufferAttribute(pullBuf, 3));
const pullLine = new THREE.Line(pullGeom, new THREE.LineBasicMaterial({ color: 0xEBCB8B }));
pullLine.visible = false;
scene.add(pullLine);

canvas.addEventListener('pointerdown', (e) => {
  const pt = worldFromNdc(ndcFromEvent(e));
  const dA = Math.hypot(pt.x - pos.ax, pt.y - pos.ay);
  const dB = Math.hypot(pt.x - pos.bx, pt.y - pos.by);
  const nearest = dA < dB ? { mass: 'a', d: dA } : { mass: 'b', d: dB };
  if (nearest.d < GRAB_R) {
    drag.active = true;
    drag.mass   = nearest.mass;
    drag.cursor.set(pt.x, pt.y, 0);
    canvas.style.cursor = 'grabbing';
    e.preventDefault();
  }
});

canvas.addEventListener('pointermove', (e) => {
  const pt = worldFromNdc(ndcFromEvent(e));
  if (drag.active) {
    drag.cursor.set(pt.x, pt.y, 0);
    hover.mass = null;
    return;
  }
  const dA = Math.hypot(pt.x - pos.ax, pt.y - pos.ay);
  const dB = Math.hypot(pt.x - pos.bx, pt.y - pos.by);
  if (dA < GRAB_R) {
    hover.mass = 'a'; hover.cx = e.clientX; hover.cy = e.clientY;
    canvas.style.cursor = 'grab';
  } else if (dB < GRAB_R) {
    hover.mass = 'b'; hover.cx = e.clientX; hover.cy = e.clientY;
    canvas.style.cursor = 'grab';
  } else {
    hover.mass = null;
    canvas.style.cursor = '';
  }
});

canvas.addEventListener('pointerup', () => {
  drag.active = false;
  drag.mass   = null;
  pullLine.visible = false;
  canvas.style.cursor = '';
});

canvas.addEventListener('pointerleave', () => {
  drag.active = false;
  drag.mass   = null;
  hover.mass  = null;
  pullLine.visible = false;
  canvas.style.cursor = '';
});

const delta1Row = document.getElementById('delta1-row');
const delta2Row = document.getElementById('delta2-row');

delta1Row.addEventListener('pointerenter', (e) => { springHover.spring = 1; springHover.cx = e.clientX; springHover.cy = e.clientY; });
delta1Row.addEventListener('pointermove',  (e) => { springHover.cx = e.clientX; springHover.cy = e.clientY; });
delta1Row.addEventListener('pointerleave', () => { springHover.spring = null; springTooltip.hidden = true; });
delta2Row.addEventListener('pointerenter', (e) => { springHover.spring = 2; springHover.cx = e.clientX; springHover.cy = e.clientY; });
delta2Row.addEventListener('pointermove',  (e) => { springHover.cx = e.clientX; springHover.cy = e.clientY; });
delta2Row.addEventListener('pointerleave', () => { springHover.spring = null; springTooltip.hidden = true; });

const faNetRow = document.getElementById('fa-net-row');
const fbNetRow = document.getElementById('fb-net-row');
faNetRow.addEventListener('pointerenter', (e) => { forceHover.mass = 'a'; forceHover.cx = e.clientX; forceHover.cy = e.clientY; });
faNetRow.addEventListener('pointermove',  (e) => { forceHover.cx = e.clientX; forceHover.cy = e.clientY; });
faNetRow.addEventListener('pointerleave', () => { forceHover.mass = null; forceTooltip.hidden = true; });
fbNetRow.addEventListener('pointerenter', (e) => { forceHover.mass = 'b'; forceHover.cx = e.clientX; forceHover.cy = e.clientY; });
fbNetRow.addEventListener('pointermove',  (e) => { forceHover.cx = e.clientX; forceHover.cy = e.clientY; });
fbNetRow.addEventListener('pointerleave', () => { forceHover.mass = null; forceTooltip.hidden = true; });

// ── Matrix board update ───────────────────────────────────
function updateBoard() {
  const { K, l1, l2, f1, f2, v1, v2 } = eigen;
  elK11.textContent = K[0][0].toFixed(0);
  elK12.textContent = K[0][1].toFixed(0);
  elK21.textContent = K[1][0].toFixed(0);
  elK22.textContent = K[1][1].toFixed(0);
  elL1.textContent  = l1.toFixed(2);
  elL2.textContent  = l2.toFixed(2);
  elF1.textContent  = f1.toFixed(3);
  elF2.textContent  = f2.toFixed(3);
  elV1a.textContent = (v1[0] >= 0 ? '+' : '') + v1[0].toFixed(2);
  elV1b.textContent = (v1[1] >= 0 ? '+' : '') + v1[1].toFixed(2);
  elV2a.textContent = (v2[0] >= 0 ? '+' : '') + v2[0].toFixed(2);
  elV2b.textContent = (v2[1] >= 0 ? '+' : '') + v2[1].toFixed(2);
}
updateBoard();

// ── Live force display ────────────────────────────────────
function signed(v, dec) {
  return (v >= 0 ? '+' : '') + v.toFixed(dec);
}

function updateForceDisplay() {
  const dx1 = pos.ax - ANCHOR.x, dy1 = pos.ay - ANCHOR.y;
  const len1 = Math.hypot(dx1, dy1) || 1e-4;
  const ext1 = len1 - REST;
  const f1x = -P.k1 * ext1 * dx1 / len1;
  const f1y = -P.k1 * ext1 * dy1 / len1;

  const dx2 = pos.bx - pos.ax, dy2 = pos.by - pos.ay;
  const len2 = Math.hypot(dx2, dy2) || 1e-4;
  const ext2 = len2 - REST;
  const f2x = P.k2 * ext2 * dx2 / len2;
  const f2y = P.k2 * ext2 * dy2 / len2;

  elExt1x.textContent = signed(ext1 * dx1 / len1, 2);
  elExt1y.textContent = signed(ext1 * dy1 / len1, 2);
  elExt2x.textContent = signed(ext2 * dx2 / len2, 2);
  elExt2y.textContent = signed(ext2 * dy2 / len2, 2);

  elFaxNet.textContent = signed(f1x + f2x, 2);
  elFayNet.textContent = signed(f1y + f2y, 2);
  elFbxNet.textContent = signed(-f2x, 2);
  elFbyNet.textContent = signed(-f2y, 2);
}

function updateModalAmplitudes() {
  const eq = getEquilibrium();
  // c1: project horizontal displacement onto v1 (swing mode)
  const dxa = pos.ax - eq.ax;
  const dxb = pos.bx - eq.bx;
  // c2: project vertical displacement onto v2 (stretch mode)
  const dya = pos.ay - eq.ay;
  const dyb = pos.by - eq.by;
  const { v1, v2 } = eigen;
  elC1.textContent = signed(v1[0] * dxa + v1[1] * dxb, 3);
  elC2.textContent = signed(v2[0] * dya + v2[1] * dyb, 3);
}

// ── Mass hover tooltip ────────────────────────────────────
function updateTooltip() {
  if (!hover.mass) { tooltip.hidden = true; return; }
  const isA = hover.mass === 'a';
  const px = isA ? pos.ax : pos.bx;
  const py = isA ? pos.ay : pos.by;
  const vx = isA ? vel.ax : vel.bx;
  const vy = isA ? vel.ay : vel.by;
  const m  = isA ? P.m1 : P.m2;

  const dx1 = pos.ax - ANCHOR.x, dy1 = pos.ay - ANCHOR.y;
  const len1 = Math.hypot(dx1, dy1) || 1e-4;
  const ext1 = len1 - REST;
  const f1x = -P.k1 * ext1 * dx1 / len1;
  const f1y = -P.k1 * ext1 * dy1 / len1;
  const dx2 = pos.bx - pos.ax, dy2 = pos.by - pos.ay;
  const len2 = Math.hypot(dx2, dy2) || 1e-4;
  const ext2 = len2 - REST;
  const f2x = P.k2 * ext2 * dx2 / len2;
  const f2y = P.k2 * ext2 * dy2 / len2;
  const fx = isA ? f1x + f2x : -f2x;
  const fy = isA ? f1y + f2y : -f2y;

  ttName.textContent = `Mass ${isA ? 'A' : 'B'}  (m${isA ? '₁' : '₂'} = ${m.toFixed(1)} kg)`;
  ttPx.textContent = signed(px, 2);
  ttPy.textContent = signed(py, 2);
  ttVx.textContent = signed(vx, 2);
  ttVy.textContent = signed(vy, 2);
  ttFx.textContent = signed(fx, 2);
  ttFy.textContent = signed(fy, 2);

  tooltip.style.left = `${hover.cx + 16}px`;
  tooltip.style.top  = `${hover.cy - 10}px`;
  tooltip.hidden = false;
}

function updateSpringTooltip() {
  if (!springHover.spring) { springTooltip.hidden = true; return; }
  const s = springHover.spring;

  let dx, dy, k, label;
  if (s === 1) {
    dx = pos.ax - ANCHOR.x; dy = pos.ay - ANCHOR.y; k = P.k1; label = 'Spring 1  (k₁ = ' + k.toFixed(1) + ' N/m)';
  } else {
    dx = pos.bx - pos.ax; dy = pos.by - pos.ay; k = P.k2; label = 'Spring 2  (k₂ = ' + k.toFixed(1) + ' N/m)';
  }
  const len = Math.hypot(dx, dy) || 1e-4;
  const ext = len - REST;

  sttName.textContent = label;
  sttLen.textContent  = len.toFixed(3);
  sttRest.textContent = REST.toFixed(2);
  sttExt.textContent  = signed(ext, 3);
  sttDirx.textContent = signed(dx / len, 2);
  sttDiry.textContent = signed(dy / len, 2);

  springTooltip.style.left = `${springHover.cx + 16}px`;
  springTooltip.style.top  = `${springHover.cy - 10}px`;
  springTooltip.hidden = false;
}

function updateForceTooltip() {
  if (!forceHover.mass) { forceTooltip.hidden = true; return; }

  const dx1 = pos.ax - ANCHOR.x, dy1 = pos.ay - ANCHOR.y;
  const len1 = Math.hypot(dx1, dy1) || 1e-4;
  const ext1 = len1 - REST;
  const f1x = -P.k1 * ext1 * dx1 / len1;
  const f1y = -P.k1 * ext1 * dy1 / len1;

  const dx2 = pos.bx - pos.ax, dy2 = pos.by - pos.ay;
  const len2 = Math.hypot(dx2, dy2) || 1e-4;
  const ext2 = len2 - REST;
  const f2x = P.k2 * ext2 * dx2 / len2;
  const f2y = P.k2 * ext2 * dy2 / len2;

  if (forceHover.mass === 'a') {
    fttName.textContent     = 'Force on A  (Fₐ = F₁ + F₂)';
    fttF1Label.textContent  = 'F₁ = −k₁·ext₁·dir₁';
    fttF1x.textContent      = signed(f1x, 2);
    fttF1y.textContent      = signed(f1y, 2);
    fttF2x.textContent      = signed(f2x, 2);
    fttF2y.textContent      = signed(f2y, 2);
    fttSumLabel.textContent = 'Fₐ = F₁ + F₂       ';
    fttNetx.textContent     = signed(f1x + f2x, 2);
    fttNety.textContent     = signed(f1y + f2y, 2);
    fttF2Row.hidden  = false;
    fttSumRow.hidden = false;
  } else {
    fttName.textContent    = 'Force on B  (F_B = −F₂)';
    fttF1Label.textContent = 'F_B = −k₂·ext₂·dir₂';
    fttF1x.textContent     = signed(-f2x, 2);
    fttF1y.textContent     = signed(-f2y, 2);
    fttF2Row.hidden  = true;
    fttSumRow.hidden = true;
  }

  forceTooltip.style.left = `${forceHover.cx + 16}px`;
  forceTooltip.style.top  = `${forceHover.cy - 10}px`;
  forceTooltip.hidden = false;
}

// ── Modal content ─────────────────────────────────────────
let modalLang = 'en';

const MODAL = {
  en: `
    <p><strong>Step 0 — What is the spring constant $k$?</strong></p>
    <p>
      A spring resists being stretched or compressed. Hooke's Law says the restoring force is
      proportional to how much the spring is deformed:
      $$F = -k \\Delta x$$
      where $F$ is the restoring force, $k$ is the spring constant, and $\\Delta x$ is the deformation
      (positive = stretched, negative = compressed).
      $k$ (N/m) is the <strong>spring constant</strong> — a measure of stiffness.
      A large $k$ means the spring is stiff (hard to stretch); a small $k$ means it is soft.
      The minus sign means the force always pushes <em>back</em> toward the natural length.
    </p>

    <p><strong>Step 1 — Newton's 2nd Law for each mass</strong></p>
    <p>
      Each mass obeys $F = ma$, i.e., force equals mass times acceleration.
      Acceleration is the second derivative of position with respect to time,
      written $\\ddot{x}$ (read: "x double-dot" — two dots mean differentiated twice).
      So $\\ddot{\\Delta x}_A$ simply means "how fast mass A's velocity is changing right now."
    </p>
    <p>
      For mass A (pulled up by spring 1, pulled down by spring 2 and gravity):
      $$m_1\\,\\ddot{\\Delta x}_A = -k_1\\,\\Delta x_A + k_2\\,(\\Delta x_B - \\Delta x_A)$$
      For mass B (pulled up by spring 2, pulled down by gravity):
      $$m_2\\,\\ddot{\\Delta x}_B = -k_2\\,(\\Delta x_B - \\Delta x_A)$$
      Here $\\Delta x_A,\\,\\Delta x_B$ are vertical displacements <em>from the resting equilibrium</em>
      (gravity is already baked in — it only shifts the rest position, not the oscillation).
    </p>

    <p><strong>Step 2 — Rewrite as a matrix equation</strong></p>
    <p>
      Stack both equations into one compact form using vectors and matrices.
      Let $\\mathbf{x} = \\begin{bmatrix} \\Delta x_A \\\\ \\Delta x_B \\end{bmatrix}$ (a column vector of the two displacements).
      Then:
      $$M\\,\\ddot{\\mathbf{x}} = -K\\,\\mathbf{x}$$
      where $M = \\begin{bmatrix} m_1 & 0 \\\\ 0 & m_2 \\end{bmatrix}$ is the <strong>mass matrix</strong>
      (diagonal, each entry is one mass), and
      $$K = \\begin{bmatrix} k_1+k_2 & -k_2 \\\\ -k_2 & k_2 \\end{bmatrix}$$
      is the <strong>stiffness matrix</strong>.
    </p>
    <p>
      Reading the live panel's $K$ matrix entry by entry:
    </p>
    <ul>
      <li><strong>$K_{11} = k_1+k_2$</strong>: Mass A is attached to <em>both</em> springs, so both resist its motion — their stiffnesses add up.</li>
      <li><strong>$K_{22} = k_2$</strong>: Mass B is only attached to spring 2, so its self-restoring stiffness is just $k_2$.</li>
      <li><strong>$K_{12} = K_{21} = -k_2$</strong>: The coupling term. When A displaces by 1, spring 2 pulls B by $k_2$, and vice versa. The minus sign means they pull each other — displacement in one mass reduces the net force needed by the other.</li>
    </ul>
    <p>Try dragging $k_2$ higher in the Parameters panel: $K_{22}$ and the coupling $-k_2$ both grow, tightening the link between A and B.</p>

    <p><strong>Step 3 — Find the natural frequencies (eigenvalue problem)</strong></p>
    <p>
      Assume the system vibrates at a single frequency $\\omega$ (rad/s):
      $\\mathbf{x}(t) = \\mathbf{v}\\cos(\\omega t)$.
      Plugging in gives $-\\omega^2 M\\mathbf{v} = -K\\mathbf{v}$, or:
      $$K\\,\\mathbf{v} = \\omega^2\\,M\\,\\mathbf{v}$$
      This is the <strong>generalised eigenvalue problem</strong>.
      Each solution $\\omega_n^2$ is an <em>eigenvalue</em> (think of it as a "allowed frequency squared"),
      and the matching $\\mathbf{v}_n$ is an <em>eigenvector</em> — the <strong>mode shape</strong>
      that tells you the relative displacement ratio between A and B.
    </p>
    <p>
      Convert angular frequency $\\omega_n$ to cycles-per-second (Hz):
      $$f_n = \\frac{\\omega_n}{2\\pi} = \\frac{1}{2\\pi}\\sqrt{\\frac{\\lambda_n}{m}}
      \\quad (\\lambda_n = \\omega_n^2 m)$$
    </p>
    <p>
      Reading the live panel's <span style="color:#88C0D0">$\\lambda_1$</span>, <span style="color:#D08770">$\\lambda_2$</span>:
      a <em>small</em> eigenvalue means the system meets weak opposition for that mode — it vibrates slowly.
      A <em>large</em> eigenvalue means stiff opposition — the system snaps back hard and vibrates fast.
      With the defaults $k_1\\!=\\!15,\\,k_2\\!=\\!10$:
    </p>
    <ul>
      <li><span style="color:#88C0D0"><strong>$\\lambda_1 = 5$</strong> → $f_1 \\approx 0.36\\,\\text{Hz}$ — one full swing every ~2.8 s. This is <strong>The Swing</strong>.</span></li>
      <li><span style="color:#D08770"><strong>$\\lambda_2 = 30$</strong> → $f_2 \\approx 0.87\\,\\text{Hz}$ — one full cycle every ~1.1 s. This is <strong>The Stretch</strong>.</span></li>
    </ul>
    <p>Rule of thumb: stiffer springs or lighter masses → larger $\\lambda$ → higher frequency.</p>

    <p><strong>Step 4 — The two modes</strong></p>
    <p>
      <span style="color:#88C0D0">■ <strong>Mode 1 — The Swing</strong>
      (low frequency, $f_1 \\approx 0.36\\,\\text{Hz}$)</span><br>
      Eigenvector <span style="color:#88C0D0">$\\mathbf{v}_1 \\propto \\begin{bmatrix}1\\\\2\\end{bmatrix}$</span>.
      Both entries have the <em>same sign</em>, meaning A and B move in the same direction simultaneously.
      B moves twice as far as A. The whole system rocks together like a pendulum.
    </p>
    <p>
      <span style="color:#D08770">■ <strong>Mode 2 — The Stretch</strong>
      (high frequency, $f_2 \\approx 0.87\\,\\text{Hz}$)</span><br>
      Eigenvector <span style="color:#D08770">$\\mathbf{v}_2 \\propto \\begin{bmatrix}2\\\\{-1}\\end{bmatrix}$</span>.
      The entries have <em>opposite signs</em>: A goes up while B goes down (or vice versa).
      The spring between them is being stretched and compressed rapidly.
    </p>

    <p><strong>Step 5 — Numerical integration (Velocity Verlet)</strong></p>
    <p>
      The eigenvalue analysis above tells us the <em>shape</em> of the motion, but not how it unfolds in time.
      To animate the system, we must numerically integrate Newton's law $F = ma$ frame by frame.
    </p>
    <p>The simulation loop each frame:</p>
    <pre><code class="language-js">// State: positions and velocities are already known from the previous step.
// Step A — geometry → deformation (Hooke's ΔX)
const ext = currentLength - restLength;        // ΔX = len − REST
// Step B — deformation → force  (Hooke's law: F = k · ΔX)
const F = -k * ext * unitDirection;
// Step C — force → acceleration  (Newton: a = F / m)
const accel = F / mass;
// Step D — integrate → new positions and velocities</code></pre>
    <p>
      Notice that $\\Delta X$ is a <em>geometric</em> quantity computed purely from positions —
      it does not require knowing the force first.
      Force is then derived from $\\Delta X$ via Hooke's law, making the chain
      $\\text{positions} \\to \\Delta X \\to F \\to a \\to \\text{new positions}$ one-directional.
    </p>
    <p>
      A naïve <strong>Euler</strong> integrator would use only the current acceleration, which
      causes energy to drift upward over time (the spring appears to gain energy from nothing).
      <strong>Velocity Verlet</strong> fixes this by averaging the acceleration <em>before and after</em> the position update:
    </p>
    <pre><code class="language-js">// 1. predict new position using current velocity + half-step acceleration
pos += vel * DT + 0.5 * accel * DT * DT;
// 2. recompute forces at the new position
const accelNew = computeForces(pos) / mass;
// 3. update velocity using the average of old and new acceleration
vel = (vel + 0.5 * (accel + accelNew) * DT) * damping;</code></pre>
    <p>
      This second-order scheme conserves energy far better than Euler for the same step size,
      keeping the simulation stable even at $\\Delta t = 1/120\\,\\text{s}$.
    </p>
  `,
  zhTW: `
    <p><strong>第零步 — 彈簧係數 $k$ 是什麼？</strong></p>
    <p>
      彈簧被拉伸或壓縮時，會產生一個把它「拉回原長」的恢復力。
      虎克定律（Hooke's Law）說這個力與形變量成正比：
      $$F = -k \\Delta x$$
      其中 $F$ 為恢復力，$k$ 為彈簧係數，$\\Delta x$ 為形變量（正值代表拉伸，負值代表壓縮）。
      $k$（單位：N/m）就是<strong>彈簧係數</strong>，代表彈簧的硬度。
      $k$ 越大，彈簧越硬（越難拉伸）；$k$ 越小，彈簧越軟。
      負號代表力的方向永遠朝向恢復原長的那一側。
    </p>

    <p><strong>第一步 — 對每個質點套用牛頓第二定律</strong></p>
    <p>
      每個質點都遵守 $F = ma$，即「合力 = 質量 × 加速度」。
      加速度是位置對時間的<em>二階導數</em>，寫成 $\\ddot{x}$（讀作「x 雙點」，
      兩個點代表對時間微分兩次）。
      $\\ddot{\\Delta x}_A$ 的意思就是：<strong>質點 A 的速度此刻正在以多快的速率改變</strong>。
    </p>
    <p>
      對質點 A（彈簧 1 向上拉、彈簧 2 向下拉）：
      $$m_1\\,\\ddot{\\Delta x}_A = -k_1\\,\\Delta x_A + k_2\\,(\\Delta x_B - \\Delta x_A)$$
      對質點 B（彈簧 2 向上拉）：
      $$m_2\\,\\ddot{\\Delta x}_B = -k_2\\,(\\Delta x_B - \\Delta x_A)$$
      這裡 $\\Delta x_A,\\,\\Delta x_B$ 是相對於<em>靜態平衡位置</em>的位移——重力只決定平衡點的位置，
      不影響振動本身，所以可以直接消掉。
    </p>

    <p><strong>第二步 — 改寫為矩陣方程式</strong></p>
    <p>
      把兩條方程式合併成一個向量形式。
      令 $\\mathbf{x} = \\begin{bmatrix} \\Delta x_A \\\\ \\Delta x_B \\end{bmatrix}$（兩個位移疊成一列），則：
      $$M\\,\\ddot{\\mathbf{x}} = -K\\,\\mathbf{x}$$
      其中 $M = \\begin{bmatrix} m_1 & 0 \\\\ 0 & m_2 \\end{bmatrix}$ 為<strong>質量矩陣</strong>（對角線），
      $$K = \\begin{bmatrix} k_1+k_2 & -k_2 \\\\ -k_2 & k_2 \\end{bmatrix}$$
      為<strong>剛度矩陣</strong>。
    </p>
    <p>逐項對照左下角的看板：</p>
    <ul>
      <li><strong>$K_{11} = k_1+k_2$</strong>：質點 A 同時被兩段彈簧拉著，兩者的硬度相加，所以自回復剛度最大。</li>
      <li><strong>$K_{22} = k_2$</strong>：質點 B 只靠彈簧 2 支撐，自回復剛度就是 $k_2$。</li>
      <li><strong>$K_{12} = K_{21} = -k_2$</strong>：耦合項。A 移動 1 單位，透過彈簧 2 對 B 施加 $k_2$ 的力，反之亦然。負號代表互相牽制——某一方位移，反而減輕了另一方所需的回復力。</li>
    </ul>
    <p>試試在 Parameters 面板把 $k_2$ 調大：看板上的 $K_{22}$ 和耦合項 $-k_2$ 會同步增加，兩顆球之間的連動會更緊密。</p>

    <p><strong>第三步 — 求自然頻率（特徵值問題）</strong></p>
    <p>
      假設系統以單一頻率 $\\omega$（rad/s）振動：$\\mathbf{x}(t) = \\mathbf{v}\\cos(\\omega t)$。
      代入方程式後化簡得：
      $$K\\,\\mathbf{v} = \\omega^2\\,M\\,\\mathbf{v}$$
      這就是<strong>廣義特徵值問題</strong>。
      每個解 $\\omega_n^2$ 稱為<em>特徵值</em>（代表系統「允許存在」的振動頻率平方），
      對應的 $\\mathbf{v}_n$ 稱為<em>特徵向量（振型）</em>——
      它告訴你 A 與 B 位移的<strong>比例關係</strong>。
    </p>
    <p>
      將角頻率 $\\omega_n$ 換算為每秒幾次（Hz）：
      $$f_n = \\frac{\\omega_n}{2\\pi} = \\frac{1}{2\\pi}\\sqrt{\\frac{\\lambda_n}{m}}
      \\quad (\\lambda_n = \\omega_n^2 m)$$
    </p>
    <p>
      如何解讀看板上的 <span style="color:#88C0D0">$\\lambda_1$</span>、<span style="color:#D08770">$\\lambda_2$</span>：
      <em>小</em>的特徵值代表系統在該模式下受到的回復力弱，振動慢；
      <em>大</em>的特徵值代表剛度強，系統彈回快，頻率高。
      以預設值 $k_1\\!=\\!15,\\,k_2\\!=\\!10$ 為例：
    </p>
    <ul>
      <li><span style="color:#88C0D0"><strong>$\\lambda_1 = 5$</strong> → $f_1 \\approx 0.36\\,\\text{Hz}$，約每 2.8 秒振一次。這就是<strong>同向擺動</strong>。</span></li>
      <li><span style="color:#D08770"><strong>$\\lambda_2 = 30$</strong> → $f_2 \\approx 0.87\\,\\text{Hz}$，約每 1.1 秒振一次。這就是<strong>反向拉伸</strong>。</span></li>
    </ul>
    <p>口訣：彈簧越硬（$k$ 越大）或質量越輕（$m$ 越小）→ $\\lambda$ 越大 → 頻率越高。</p>

    <p><strong>第四步 — 兩種振動模式</strong></p>
    <p>
      <span style="color:#88C0D0">■ <strong>模式一 — 同向擺動 (The Swing)</strong>
      （低頻，$f_1 \\approx 0.36\\,\\text{Hz}$）</span><br>
      振型向量 <span style="color:#88C0D0">$\\mathbf{v}_1 \\propto \\begin{bmatrix}1\\\\2\\end{bmatrix}$</span>。
      兩個分量<em>同號</em>，代表 A 和 B 同時往同一方向移動。
      B 的位移是 A 的兩倍。整體看起來像鐘擺一樣晃動。
    </p>
    <p>
      <span style="color:#D08770">■ <strong>模式二 — 反向拉伸 (The Stretch)</strong>
      （高頻，$f_2 \\approx 0.87\\,\\text{Hz}$）</span><br>
      振型向量 <span style="color:#D08770">$\\mathbf{v}_2 \\propto \\begin{bmatrix}2\\\\{-1}\\end{bmatrix}$</span>。
      兩個分量<em>異號</em>：A 向上時 B 向下（或反之）。
      中間的彈簧被快速拉伸與壓縮。
    </p>

    <p><strong>第五步 — 數值積分（Velocity Verlet）</strong></p>
    <p>
      特徵值分析告訴我們運動的<em>形狀</em>，但無法告訴我們它如何隨時間展開。
      要讓系統動起來，必須逐幀對牛頓第二定律 $F = ma$ 做數值積分。
    </p>
    <p>每一幀的模擬循環：</p>
    <pre><code class="language-js">// 狀態：位置與速度已從上一步得知。
// A — 幾何 → 形變量（虎克定律的 ΔX）
const ext = currentLength - restLength;        // ΔX = len − REST
// B — 形變量 → 力（虎克定律：F = k · ΔX）
const F = -k * ext * unitDirection;
// C — 力 → 加速度（牛頓：a = F / m）
const accel = F / mass;
// D — 積分 → 新位置與速度</code></pre>
    <p>
      注意：$\\Delta X$ 是純粹從<em>位置</em>算出的幾何量，不需要先知道力。
      力再由 $\\Delta X$ 透過虎克定律推導出來，整條計算鏈是單向的：
      $\\text{位置} \\to \\Delta X \\to F \\to a \\to \\text{新位置}$。
    </p>
    <p>
      若使用最簡單的 <strong>Euler 積分</strong>，每步只用當前加速度更新，
      能量會隨時間不斷上漲（彈簧像是憑空增加能量）。
      <strong>Velocity Verlet</strong> 的做法是在位置更新前後各算一次加速度，再取平均來更新速度：
    </p>
    <pre><code class="language-js">// 1. 用目前速度 + 半步加速度預測新位置
pos += vel * DT + 0.5 * accel * DT * DT;
// 2. 在新位置重新計算力
const accelNew = computeForces(pos) / mass;
// 3. 用新舊加速度的平均值更新速度
vel = (vel + 0.5 * (accel + accelNew) * DT) * damping;</code></pre>
    <p>
      這個二階方法在相同步長下能量保持得遠比 Euler 好，
      讓模擬在 $\\Delta t = 1/120\\,\\text{s}$ 的條件下依然穩定。
    </p>
  `,
};

function renderModal() {
  mathContent.innerHTML = MODAL[modalLang];
  if (window.renderMathInElement) {
    window.renderMathInElement(mathContent, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '$',  right: '$',  display: false },
      ],
    });
  }
  if (window.Prism) window.Prism.highlightAllUnder(mathContent);
}

// ── Button handlers ───────────────────────────────────────
function setActiveMode(btn) {
  [btnSwing, btnStretch].forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

btnSwing.addEventListener('click', () => {
  setMode(1);
  setActiveMode(btnSwing);
});

btnStretch.addEventListener('click', () => {
  setMode(2);
  setActiveMode(btnStretch);
});

btnReset.addEventListener('click', () => {
  resetToEquilibrium();
  [btnSwing, btnStretch].forEach(b => b.classList.remove('active'));
});

btnPause.addEventListener('click', () => {
  paused = !paused;
  btnPause.textContent = paused ? 'Resume' : 'Pause';
});

openMath.addEventListener('click', () => {
  renderModal();
  mathModal.hidden = false;
});

closeMath.addEventListener('click', () => { mathModal.hidden = true; });

mathModal.addEventListener('click', (e) => {
  if (e.target === mathModal) mathModal.hidden = true;
});

langToggle.addEventListener('click', () => {
  modalLang = modalLang === 'en' ? 'zhTW' : 'en';
  renderModal();
});

// ── lil-gui parameter controls ────────────────────────────
function onParamChange() {
  computeEigen();
  updateBoard();
}

const gui = new GUI({ title: 'Parameters', width: 220 });
// Position below the GitHub ribbon (top-right)
gui.domElement.style.position = 'fixed';
gui.domElement.style.top      = '155px';
gui.domElement.style.right    = '0';

gui.add(SIM, 'speed', 0.1, 3.0, 0.1).name('Speed  ×');
gui.add(P, 'k1', 1, 50, 0.5).name('k₁  (N/m)').onChange(onParamChange);
gui.add(P, 'k2', 1, 50, 0.5).name('k₂  (N/m)').onChange(onParamChange);
gui.add(P, 'm1', 0.1, 5, 0.1).name('m₁  (kg)').onChange(onParamChange);
gui.add(P, 'm2', 0.1, 5, 0.1).name('m₂  (kg)').onChange(onParamChange);
gui.add({ reset: () => { gui.reset(); onParamChange(); } }, 'reset').name('Reset Params');

// ── Animation loop ────────────────────────────────────────
function animate() {
  requestAnimationFrame(animate);

  if (!paused) {
    stepAccum += SIM.speed;
    while (stepAccum >= 1) {
      stepPhysics();
      stepPhysics();
      stepAccum -= 1;
    }
  }

  // Update mesh positions
  meshA.position.set(pos.ax, pos.ay, 0);
  meshB.position.set(pos.bx, pos.by, 0);

  // Update springs
  updateSpring(spring1Line, ANCHOR.x, ANCHOR.y, pos.ax, pos.ay);
  updateSpring(spring2Line, pos.ax, pos.ay, pos.bx, pos.by);

  // v₁ (blue): horizontal arrows — shows swing mode (both masses move sideways together).
  // v₂ (orange): vertical arrows — shows stretch mode (A up, B down).
  const { v1, v2 } = eigen;
  updateArrow(arrV1A, pos.ax + 0.38, pos.ay + 0.35, v1[0], 0, Math.abs(v1[0]));
  updateArrow(arrV1B, pos.bx + 0.38, pos.by + 0.35, v1[1], 0, Math.abs(v1[1]));
  updateArrow(arrV2A, pos.ax - 0.38, pos.ay, 0, v2[0], Math.abs(v2[0]));
  updateArrow(arrV2B, pos.bx - 0.38, pos.by, 0, v2[1], Math.abs(v2[1]));

  // Scene labels
  placeLabel(labelA,  pos.ax, pos.ay);
  placeLabel(labelB,  pos.bx, pos.by);
  placeLabel(labelS1, (ANCHOR.x + pos.ax) / 2 - 0.55, (ANCHOR.y + pos.ay) / 2);
  placeLabel(labelS2, (pos.ax  + pos.bx) / 2 - 0.55, (pos.ay  + pos.by)  / 2);
  // v1 label: right of B's horizontal arrow; v2 label: left of B's vertical arrow
  placeLabel(labelV1, pos.bx + 1.23, pos.by + 0.35);
  placeLabel(labelV2, pos.bx - 0.65, pos.by - 0.35);
  // Axis labels: just past the arrow tips
  placeLabel(labelAxisX, AXIS_ORIGIN.x + AXIS_LEN + 0.12, AXIS_ORIGIN.y);
  placeLabel(labelAxisY, AXIS_ORIGIN.x, AXIS_ORIGIN.y + AXIS_LEN + 0.12);

  // Pull-force visual line
  if (drag.active && drag.mass) {
    const mx = drag.mass === 'a' ? pos.ax : pos.bx;
    const my = drag.mass === 'a' ? pos.ay : pos.by;
    pullBuf[0] = mx;             pullBuf[1] = my;             pullBuf[2] = 0;
    pullBuf[3] = drag.cursor.x;  pullBuf[4] = drag.cursor.y;  pullBuf[5] = 0;
    pullGeom.attributes.position.needsUpdate = true;
    pullLine.visible = true;
  } else {
    pullLine.visible = false;
  }

  updateForceDisplay();
  updateModalAmplitudes();
  updateTooltip();
  updateSpringTooltip();
  updateForceTooltip();
  renderer.render(scene, camera);
}

// Start at static equilibrium, no initial perturbation
resetToEquilibrium();
animate();
