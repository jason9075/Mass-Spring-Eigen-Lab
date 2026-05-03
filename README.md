# Mass-Spring Eigen Lab

An interactive browser simulation that visualises the **eigenvalues and eigenvectors** of a two-mass vertical spring system — built to make the abstract concept of modal analysis tangible.

**[Live Demo](https://jason9075.github.io/Mass-Spring-Eigen-Lab)**

---

## What it shows

Two masses (A and B) hang from a ceiling on two springs. The system's vibration is governed by the stiffness matrix:

```
K = [ k₁+k₂   -k₂ ]
    [  -k₂      k₂ ]
```

Solving `K v = λ v` yields two eigenpairs:

| | Mode 1 — The Swing | Mode 2 — The Stretch |
|---|---|---|
| Eigenvalue λ | small → slow | large → fast |
| Eigenvector v | same-sign components → both masses move together | opposite-sign → A up, B down |
| Arrow colour | cyan (v₁) | orange (v₂) |

## Features

- **The Swing / The Stretch buttons** — trigger pure mode 1 or mode 2 initial conditions
- **Drag masses** to perturb the system and watch the modal decomposition (c₁, c₂) update in real time
- **Live matrix board** — stiffness matrix K, eigenvalues λ₁/λ₂, eigenvectors v₁/v₂, spring displacement vectors [x, y], and net spring forces [Fx, Fy]
- **Eigenvector arrows** on each mass (cyan = v₁ horizontal, orange = v₂ vertical)
- **Coordinate axes** (red = X, green = Y) for spatial orientation
- **Parameter panel** (k₁, k₂, m₁, m₂) with live re-computation and reset
- **Math modal** (💡) with step-by-step derivation in English / 中文

## Tech stack

- [Three.js](https://threejs.org/) — 3D rendering
- [lil-gui](https://lil-gui.georgealways.com/) — parameter controls
- [KaTeX](https://katex.org/) — math typesetting
- [Prism.js](https://prismjs.com/) (Nord theme) — code highlighting
- Physics: Velocity Verlet integration, analytic 2×2 eigendecomposition

## Run locally

```sh
nix develop       # enter dev shell (requires Nix + flakes)
just dev          # starts live-server on http://localhost:8080
```

Or with any static file server:

```sh
npx live-server --port 8080 .
```

## License

MIT © 2026 [Jason Kuan](https://github.com/jason9075)
