import * as THREE from 'three';

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
const elK11 = document.getElementById('k11');
const elK12 = document.getElementById('k12');
const elK21 = document.getElementById('k21');
const elK22 = document.getElementById('k22');
const elL1  = document.getElementById('lam1');
const elL2  = document.getElementById('lam2');
const elF1  = document.getElementById('freq1');
const elF2  = document.getElementById('freq2');

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
    // In-phase swing: horizontal displacement ∝ v1
    pos.ax += eigen.v1[0] * AMP;
    pos.bx += eigen.v1[1] * AMP;
  } else {
    // Out-of-phase stretch: vertical displacement ∝ v2
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
const ARROW_SCALE = 0.38;

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

// ── Modal content ─────────────────────────────────────────
let modalLang = 'en';

const MODAL = {
  en: `
    <p>
      A <strong>two-mass spring chain</strong> hangs vertically from a fixed anchor.
      Linearising around the static equilibrium $\\mathbf{x}_{\\text{eq}} = K^{-1}\\mathbf{F}_g$
      eliminates gravity and yields pure spring dynamics:
    </p>
    <p>$$M\\ddot{\\mathbf{x}} + K\\mathbf{x} = \\mathbf{0}$$</p>
    <p>with the <strong>stiffness matrix</strong></p>
    <p>$$K = \\begin{bmatrix} k_1+k_2 & -k_2 \\\\ -k_2 & k_2 \\end{bmatrix}$$</p>
    <p>
      Assuming harmonic motion $\\mathbf{x}(t) = \\mathbf{v}\\,e^{i\\omega t}$ gives the
      <strong>eigenvalue problem</strong> $K\\mathbf{v} = \\omega^2 M\\mathbf{v}$.
      Each eigenvalue $\\lambda_n = \\omega_n^2 m$ yields a <em>natural frequency</em>:
    </p>
    <p>$$f_n = \\frac{1}{2\\pi}\\sqrt{\\frac{\\lambda_n}{m}}$$</p>
    <p>
      <span style="color:#88C0D0">■</span> <strong>Mode 1 — The Swing:</strong>
      eigenvector $\\mathbf{v}_1 \\propto [1,\\,2]$; both masses move in phase (same direction).
      Low frequency, represents large-scale motion.
    </p>
    <p>
      <span style="color:#D08770">■</span> <strong>Mode 2 — The Stretch:</strong>
      eigenvector $\\mathbf{v}_2 \\propto [2,\\,-3]$; mass A and B move in opposite directions.
      High frequency, represents local spring tension.
    </p>
    <p>The simulation uses <strong>Velocity Verlet</strong> integration each frame:</p>
    <pre><code class="language-js">// Each physics tick (DT = 1/120 s)
pos += vel * DT + 0.5 * accel * DT²;
const accelNew = computeForces() / mass;
vel = (vel + 0.5 * (accel + accelNew) * DT) * damping;</code></pre>
  `,
  zhTW: `
    <p>
      兩個質點以彈簧串聯，垂直懸掛於固定錨點。
      在靜態平衡點 $\\mathbf{x}_{\\text{eq}} = K^{-1}\\mathbf{F}_g$ 附近線性化後，
      重力項消去，系統化為純彈性動力方程：
    </p>
    <p>$$M\\ddot{\\mathbf{x}} + K\\mathbf{x} = \\mathbf{0}$$</p>
    <p>其中<strong>剛度矩陣</strong>為：</p>
    <p>$$K = \\begin{bmatrix} k_1+k_2 & -k_2 \\\\ -k_2 & k_2 \\end{bmatrix}$$</p>
    <p>
      代入諧和解 $\\mathbf{x}(t) = \\mathbf{v}\\,e^{i\\omega t}$，可得
      <strong>廣義特徵值問題</strong> $K\\mathbf{v} = \\omega^2 M\\mathbf{v}$。
      每個特徵值 $\\lambda_n = \\omega_n^2 m$ 對應一個<em>自然頻率</em>：
    </p>
    <p>$$f_n = \\frac{1}{2\\pi}\\sqrt{\\frac{\\lambda_n}{m}}$$</p>
    <p>
      <span style="color:#88C0D0">■</span> <strong>模式一 — 同向擺動 (The Swing)：</strong>
      特徵向量 $\\mathbf{v}_1 \\propto [1,\\,2]$；兩球同向運動，低頻，代表整體擺動。
    </p>
    <p>
      <span style="color:#D08770">■</span> <strong>模式二 — 反向拉伸 (The Stretch)：</strong>
      特徵向量 $\\mathbf{v}_2 \\propto [2,\\,-3]$；A 球與 B 球反向運動，高頻，代表彈簧內部張力。
    </p>
    <p>模擬採用 <strong>Velocity Verlet</strong> 積分，每幀（$\\Delta t = 1/120\\,\\text{s}$）執行：</p>
    <pre><code class="language-js">// 每個物理 tick
pos += vel * DT + 0.5 * accel * DT²;
const accelNew = computeForces() / mass;
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

  // Update eigenvector arrows (always visible, show eigenspace)
  const { v1, v2 } = eigen;
  updateArrow(arrV1A, pos.ax + 0.28, pos.ay,  1, 0, v1[0]);
  updateArrow(arrV1B, pos.bx + 0.28, pos.by,  1, 0, v1[1]);
  updateArrow(arrV2A, pos.ax - 0.28, pos.ay,  0, Math.sign(v2[0]) || 1,  Math.abs(v2[0]));
  updateArrow(arrV2B, pos.bx - 0.28, pos.by,  0, Math.sign(v2[1]) || -1, Math.abs(v2[1]));

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

  renderer.render(scene, camera);
}

// Start at static equilibrium, no initial perturbation
resetToEquilibrium();
animate();
