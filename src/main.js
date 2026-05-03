import * as THREE from 'three';

const canvas = document.getElementById('canvas');
const renderMode = document.getElementById('render-mode');
const pauseButton = document.getElementById('pause-button');
const openMathButton = document.getElementById('open-math');
const closeMathButton = document.getElementById('close-math');
const languageToggle = document.getElementById('language-toggle');
const mathModal = document.getElementById('math-modal');
const mathContent = document.getElementById('math-content');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2E3440); // Nord0

const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
camera.position.set(0, 0, 3);

// Mass-spring system visualised as an icosahedron mesh
const geometry = new THREE.IcosahedronGeometry(1, 1);
const material = new THREE.MeshStandardMaterial({
  color: 0x88C0D0, // Nord8
  wireframe: true,
});
const mesh = new THREE.Mesh(geometry, material);
scene.add(mesh);

let isAnimating = true;
let modalLanguage = 'en';

const modalCopy = {
  en: `
    <p>
      A <strong>mass-spring system</strong> models a set of masses connected by springs.
      Its equations of motion form a linear system:
    </p>
    <p>$$M\\ddot{\\mathbf{x}} + K\\mathbf{x} = \\mathbf{0}$$</p>
    <p>
      where $M$ is the diagonal mass matrix and $K$ is the stiffness matrix.
      Assuming harmonic solutions $\\mathbf{x}(t) = \\mathbf{v}\\,e^{i\\omega t}$ leads to the
      <strong>generalised eigenvalue problem</strong>:
    </p>
    <p>$$K\\mathbf{v} = \\omega^2 M\\mathbf{v}$$</p>
    <p>
      Each eigenvalue $\\omega_k^2$ gives a <em>natural frequency</em>, and the
      corresponding eigenvector $\\mathbf{v}_k$ is the <em>mode shape</em> — the pattern
      in which the system vibrates at that frequency.
    </p>
    <p>
      The scene rotates the mesh with two angular velocities $\\omega_x$ and $\\omega_y$
      applied each animation frame:
    </p>
    <pre><code class="language-js">mesh.rotation.x = t * 0.0003; // ωₓ
mesh.rotation.y = t * 0.0005; // ω_y</code></pre>
    <p>
      Rotation around the y-axis is the matrix transform:
    </p>
    <p>$$
      R_y(\\theta) =
      \\begin{bmatrix}
        \\cos\\theta & 0 & \\sin\\theta \\\\
        0           & 1 & 0           \\\\
        -\\sin\\theta & 0 & \\cos\\theta
      \\end{bmatrix}
    $$</p>
  `,
  zhTW: `
    <p>
      <strong>質量-彈簧系統</strong>以彈簧連接多個質點，其運動方程式為線性系統：
    </p>
    <p>$$M\\ddot{\\mathbf{x}} + K\\mathbf{x} = \\mathbf{0}$$</p>
    <p>
      其中 $M$ 為對角質量矩陣，$K$ 為剛度矩陣。
      假設諧和解 $\\mathbf{x}(t) = \\mathbf{v}\\,e^{i\\omega t}$，可導出
      <strong>廣義特徵值問題</strong>：
    </p>
    <p>$$K\\mathbf{v} = \\omega^2 M\\mathbf{v}$$</p>
    <p>
      每個特徵值 $\\omega_k^2$ 對應一個<em>自然頻率</em>，
      對應的特徵向量 $\\mathbf{v}_k$ 則是<em>振型（mode shape）</em>
      —— 系統在該頻率下的振動形態。
    </p>
    <p>
      場景中，網格每幀以兩個角速度 $\\omega_x$ 與 $\\omega_y$ 旋轉：
    </p>
    <pre><code class="language-js">mesh.rotation.x = t * 0.0003; // ωₓ
mesh.rotation.y = t * 0.0005; // ω_y</code></pre>
    <p>以 y 軸旋轉為例，對應的矩陣變換為：</p>
    <p>$$
      R_y(\\theta) =
      \\begin{bmatrix}
        \\cos\\theta & 0 & \\sin\\theta \\\\
        0           & 1 & 0           \\\\
        -\\sin\\theta & 0 & \\cos\\theta
      \\end{bmatrix}
    $$</p>
  `,
};

function renderModalContent() {
  mathContent.innerHTML = modalCopy[modalLanguage];
  if (window.renderMathInElement) {
    window.renderMathInElement(mathContent, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '$', right: '$', display: false },
      ],
    });
  }
  if (window.Prism) {
    window.Prism.highlightAllUnder(mathContent);
  }
}

// Lighting
const dirLight = new THREE.DirectionalLight(0xECEFF4, 1.5);
dirLight.position.set(2, 3, 4);
scene.add(dirLight);
scene.add(new THREE.AmbientLight(0x4C566A, 0.8));

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

renderMode.addEventListener('change', (event) => {
  material.wireframe = event.target.value === 'wireframe';
});

pauseButton.addEventListener('click', () => {
  isAnimating = !isAnimating;
  pauseButton.textContent = isAnimating ? 'Pause Rotation' : 'Resume Rotation';
});

openMathButton.addEventListener('click', () => {
  renderModalContent();
  mathModal.hidden = false;
});

closeMathButton.addEventListener('click', () => {
  mathModal.hidden = true;
});

// Close modal on backdrop click
mathModal.addEventListener('click', (event) => {
  if (event.target === mathModal) mathModal.hidden = true;
});

languageToggle.addEventListener('click', () => {
  modalLanguage = modalLanguage === 'en' ? 'zhTW' : 'en';
  renderModalContent();
});

function animate(t = 0) {
  requestAnimationFrame(animate);
  if (isAnimating) {
    mesh.rotation.x = t * 0.0003;
    mesh.rotation.y = t * 0.0005;
  }
  renderer.render(scene, camera);
}
animate();
