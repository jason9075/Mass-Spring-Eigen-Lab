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
const elExt1  = document.getElementById('ext1');
const elExt2  = document.getElementById('ext2');
const elFaNet = document.getElementById('fa-net');
const elFbNet = document.getElementById('fb-net');
const elC1    = document.getElementById('c1-val');
const elC2    = document.getElementById('c2-val');

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
const drag = { active: false, mass: null, cursor: new THREE.Vector3() };

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
    // Mode 1: both masses displaced vertically in same direction, B more than A
    pos.ay += eigen.v1[0] * AMP;
    pos.by += eigen.v1[1] * AMP;
  } else {
    // Mode 2: A and B displaced in opposite vertical directions
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
    return;
  }
  // hover cursor
  const dA = Math.hypot(pt.x - pos.ax, pt.y - pos.ay);
  const dB = Math.hypot(pt.x - pos.bx, pt.y - pos.by);
  canvas.style.cursor = (dA < GRAB_R || dB < GRAB_R) ? 'grab' : '';
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
  pullLine.visible = false;
  canvas.style.cursor = '';
});

// ── Matrix board update ───────────────────────────────────
function updateBoard() {
  const { K, l1, l2, f1, f2 } = eigen;
  elK11.textContent = K[0][0].toFixed(0);
  elK12.textContent = K[0][1].toFixed(0);
  elK21.textContent = K[1][0].toFixed(0);
  elK22.textContent = K[1][1].toFixed(0);
  elL1.textContent  = l1.toFixed(2);
  elL2.textContent  = l2.toFixed(2);
  elF1.textContent  = f1.toFixed(3);
  elF2.textContent  = f2.toFixed(3);
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
  const f1y  = -P.k1 * ext1 * dy1 / len1;

  const dx2 = pos.bx - pos.ax, dy2 = pos.by - pos.ay;
  const len2 = Math.hypot(dx2, dy2) || 1e-4;
  const ext2 = len2 - REST;
  const f2y  = P.k2 * ext2 * dy2 / len2;

  elExt1.textContent  = signed(ext1, 3);
  elExt2.textContent  = signed(ext2, 3);
  elFaNet.textContent = signed(f1y + f2y, 2);
  elFbNet.textContent = signed(-f2y, 2);
}

function updateModalAmplitudes() {
  const eq = getEquilibrium();
  const dya = pos.ay - eq.ay;
  const dyb = pos.by - eq.by;
  const { v1, v2 } = eigen;
  // Project vertical displacement onto each normalised eigenvector
  elC1.textContent = signed(v1[0] * dya + v1[1] * dyb, 3);
  elC2.textContent = signed(v2[0] * dya + v2[1] * dyb, 3);
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
      Reading the live panel's $\\lambda_1,\\,\\lambda_2$:
      a <em>small</em> eigenvalue means the system meets weak opposition for that mode — it vibrates slowly.
      A <em>large</em> eigenvalue means stiff opposition — the system snaps back hard and vibrates fast.
      With the defaults $k_1\\!=\\!15,\\,k_2\\!=\\!10$:
    </p>
    <ul>
      <li><strong>$\\lambda_1 = 5$</strong> → $f_1 \\approx 0.36\\,\\text{Hz}$ — one full swing every ~2.8 s. This is <span style="color:#88C0D0">The Swing</span>.</li>
      <li><strong>$\\lambda_2 = 30$</strong> → $f_2 \\approx 0.87\\,\\text{Hz}$ — one full cycle every ~1.1 s. This is <span style="color:#D08770">The Stretch</span>.</li>
    </ul>
    <p>Rule of thumb: stiffer springs or lighter masses → larger $\\lambda$ → higher frequency.</p>

    <p><strong>Step 4 — The two modes</strong></p>
    <p>
      <span style="color:#88C0D0">■</span> <strong>Mode 1 — The Swing</strong>
      (low frequency, $f_1 \\approx 0.36\\,\\text{Hz}$)<br>
      Eigenvector $\\mathbf{v}_1 \\propto \\begin{bmatrix}1\\\\2\\end{bmatrix}$.
      Both entries have the <em>same sign</em>, meaning A and B move in the same direction simultaneously.
      B moves twice as far as A. The whole system rocks together like a pendulum.
    </p>
    <p>
      <span style="color:#D08770">■</span> <strong>Mode 2 — The Stretch</strong>
      (high frequency, $f_2 \\approx 0.87\\,\\text{Hz}$)<br>
      Eigenvector $\\mathbf{v}_2 \\propto \\begin{bmatrix}2\\\\{-3}\\end{bmatrix}$.
      The entries have <em>opposite signs</em>: A goes up while B goes down (or vice versa).
      The spring between them is being stretched and compressed rapidly.
    </p>

    <p><strong>Step 5 — Numerical integration (Velocity Verlet)</strong></p>
    <p>
      Each animation frame the simulator advances time by $\\Delta t = 1/120\\,\\text{s}$.
      Velocity Verlet keeps energy stable by using the average acceleration across the step:
    </p>
    <pre><code class="language-js">// 1. predict new position using current velocity + half-step acceleration
pos += vel * DT + 0.5 * accel * DT * DT;
// 2. recompute forces at the new position
const accelNew = computeForces(pos) / mass;
// 3. update velocity using the average of old and new acceleration
vel = (vel + 0.5 * (accel + accelNew) * DT) * damping;</code></pre>
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
      如何解讀看板上的 $\\lambda_1,\\,\\lambda_2$：
      <em>小</em>的特徵值代表系統在該模式下受到的回復力弱，振動慢；
      <em>大</em>的特徵值代表剛度強，系統彈回快，頻率高。
      以預設值 $k_1\\!=\\!15,\\,k_2\\!=\\!10$ 為例：
    </p>
    <ul>
      <li><strong>$\\lambda_1 = 5$</strong> → $f_1 \\approx 0.36\\,\\text{Hz}$，約每 2.8 秒振一次。這就是<span style="color:#88C0D0">同向擺動</span>。</li>
      <li><strong>$\\lambda_2 = 30$</strong> → $f_2 \\approx 0.87\\,\\text{Hz}$，約每 1.1 秒振一次。這就是<span style="color:#D08770">反向拉伸</span>。</li>
    </ul>
    <p>口訣：彈簧越硬（$k$ 越大）或質量越輕（$m$ 越小）→ $\\lambda$ 越大 → 頻率越高。</p>

    <p><strong>第四步 — 兩種振動模式</strong></p>
    <p>
      <span style="color:#88C0D0">■</span> <strong>模式一 — 同向擺動 (The Swing)</strong>
      （低頻，$f_1 \\approx 0.36\\,\\text{Hz}$）<br>
      振型向量 $\\mathbf{v}_1 \\propto \\begin{bmatrix}1\\\\2\\end{bmatrix}$。
      兩個分量<em>同號</em>，代表 A 和 B 同時往同一方向移動。
      B 的位移是 A 的兩倍。整體看起來像鐘擺一樣晃動。
    </p>
    <p>
      <span style="color:#D08770">■</span> <strong>模式二 — 反向拉伸 (The Stretch)</strong>
      （高頻，$f_2 \\approx 0.87\\,\\text{Hz}$）<br>
      振型向量 $\\mathbf{v}_2 \\propto \\begin{bmatrix}2\\\\{-3}\\end{bmatrix}$。
      兩個分量<em>異號</em>：A 向上時 B 向下（或反之）。
      中間的彈簧被快速拉伸與壓縮。
    </p>

    <p><strong>第五步 — 數值積分（Velocity Verlet）</strong></p>
    <p>
      每個動畫幀推進 $\\Delta t = 1/120\\,\\text{s}$。
      Velocity Verlet 用「前後加速度平均」更新速度，確保能量不會無限膨脹：
    </p>
    <pre><code class="language-js">// 1. 用目前速度 + 半步加速度預測新位置
pos += vel * DT + 0.5 * accel * DT * DT;
// 2. 在新位置重新計算力
const accelNew = computeForces(pos) / mass;
// 3. 用新舊加速度的平均值更新速度
vel = (vel + 0.5 * (accel + accelNew) * DT) * damping;</code></pre>
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

gui.add(P, 'k1', 1, 50, 0.5).name('k₁  (N/m)').onChange(onParamChange);
gui.add(P, 'k2', 1, 50, 0.5).name('k₂  (N/m)').onChange(onParamChange);
gui.add(P, 'm1', 0.1, 5, 0.1).name('m₁  (kg)').onChange(onParamChange);
gui.add(P, 'm2', 0.1, 5, 0.1).name('m₂  (kg)').onChange(onParamChange);

// ── Animation loop ────────────────────────────────────────
function animate() {
  requestAnimationFrame(animate);

  if (!paused) {
    stepPhysics();
    stepPhysics(); // two sub-steps per frame for stability
  }

  // Update mesh positions
  meshA.position.set(pos.ax, pos.ay, 0);
  meshB.position.set(pos.bx, pos.by, 0);

  // Update springs
  updateSpring(spring1Line, ANCHOR.x, ANCHOR.y, pos.ax, pos.ay);
  updateSpring(spring2Line, pos.ax, pos.ay, pos.bx, pos.by);

  // Eigenvector arrows — both pairs vertical, representing physical mode shapes.
  // v₁ (blue, right): both components same sign → both arrows point same direction.
  // v₂ (orange, left): components opposite sign → A up, B down.
  const { v1, v2 } = eigen;
  updateArrow(arrV1A, pos.ax + 0.38, pos.ay, 0, v1[0], Math.abs(v1[0]));
  updateArrow(arrV1B, pos.bx + 0.38, pos.by, 0, v1[1], Math.abs(v1[1]));
  updateArrow(arrV2A, pos.ax - 0.38, pos.ay, 0, v2[0], Math.abs(v2[0]));
  updateArrow(arrV2B, pos.bx - 0.38, pos.by, 0, v2[1], Math.abs(v2[1]));

  // Scene labels
  placeLabel(labelA,  pos.ax, pos.ay);
  placeLabel(labelB,  pos.bx, pos.by);
  placeLabel(labelS1, (ANCHOR.x + pos.ax) / 2 - 0.55, (ANCHOR.y + pos.ay) / 2);
  placeLabel(labelS2, (pos.ax  + pos.bx) / 2 - 0.55, (pos.ay  + pos.by)  / 2);
  // Eigenvector group labels — shown below mass B on each side
  placeLabel(labelV1, pos.bx + 0.6, pos.by - 0.35);
  placeLabel(labelV2, pos.bx - 0.6, pos.by - 0.35);

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
  renderer.render(scene, camera);
}

// Start at static equilibrium, no initial perturbation
resetToEquilibrium();
animate();
