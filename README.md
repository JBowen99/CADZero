# CADZero

An AI-native parametric CAD application. Describe a part in natural language and
CADZero generates parametric CAD code, executes it, and renders the resulting 3D
mesh in a real-time viewport — then keeps refining the model through conversation.

It is designed as an AI-powered parametric modeling IDE rather than an editor for
a single CAD language. It supports two modeling backends: **OpenSCAD** (external
CLI) and **Build123D** (Python over the OpenCascade B-rep kernel, enabling STEP
export). The frontend never cares which engine is running; every backend exposes
the same interface.

> **Platform status:** CADZero currently targets **Linux**. Windows and macOS
> support will come later.

---

## How it works

```
User ──▶ AI Conversation ──▶ Modeling Backend (OpenSCAD)
                                      │
                                      ▼
                          Generated Geometry (mesh)
                                      │
                                      ▼
                            Three.js Viewport
```

- **Chat** — Streamed AI conversation (Vercel AI SDK over OpenRouter) with
  Plan / Chat / Build modes.
- **Build** — The model calls an `update_model` tool; the server runs the
  selected backend (OpenSCAD CLI, or Build123D via a persistent Python worker
  over OpenCascade), parses the STL into a mesh, and streams it to the viewport.
  If a render fails, the model reads the error and self-corrects.
- **Viewport** — three.js / React Three Fiber with orbit/pan/zoom, view modes
  (shaded / solid / wireframe), grid, and a view cube.
- **Persistence** — Each part is a self-contained `.cadz` SQLite file
  (revisions, chat history, and cached meshes) inside a workspace folder, with
  PDM-style revision history and multi-part tabs.

---

## Tech stack

| Layer           | Choice                                                    |
| --------------- | --------------------------------------------------------- |
| Desktop shell   | Electron 43                                               |
| Framework       | React Router 8 (Framework Mode, SPA `ssr: false`)         |
| UI              | React 19, TypeScript, Tailwind CSS v4, shadcn/ui          |
| 3D viewport     | three.js + @react-three/fiber + @react-three/drei         |
| State           | Zustand                                                   |
| Build tool      | Vite 8                                                    |
| AI backend      | Hono + Vercel AI SDK v7 + OpenRouter                      |
| CAD kernel      | OpenSCAD (external CLI) **and** Build123D (OpenCascade, spawned Python) |
| Persistence     | better-sqlite3 (`.cadz` SQLite part files)               |
| Package manager | pnpm                                                      |

---

## Prerequisites (Linux)

1. **Node.js 22+** — <https://nodejs.org> (or via your distro / nvm)
2. **pnpm** — `corepack enable && corepack prepare pnpm@latest --activate`
3. **OpenSCAD** — required for OpenSCAD parts in Build mode:
   - Fedora / RHEL: `sudo dnf install openscad`
   - Debian / Ubuntu: `sudo apt install openscad`
   - (If `openscad` isn't on `PATH`, set `OPENSCAD_PATH` to its location.)
4. **Build123D runtime (optional, for Build123D parts + STEP export)** — a
   self-contained CPython 3.12 with `build123d` + OpenCascade (OCP) is fetched
   on demand:
   ```bash
   pnpm setup:python      # downloads CPython 3.12 + pip installs build123d (~200MB)
   ```
   This is **not** required if you only use OpenSCAD. To point the backend at a
   different Python instead, set `PYTHON_PATH` in `server/.env`.
5. **OpenRouter API key** — create one at <https://openrouter.ai/keys>
6. *(Optional, only for `.deb` packaging)* `libxcrypt-compat`:
   - Fedora: `sudo dnf install libxcrypt-compat`
   - Debian: `sudo apt install libcrypt1`

---

## Getting started

### 1. Install dependencies

```bash
pnpm install
```

> pnpm v11+ blocks native build scripts until approved. This repo already
> approves `better-sqlite3` and `esbuild` in `pnpm-workspace.yaml`. If the
> install reports ignored builds, rebuild the native deps:
>
> ```bash
> pnpm rebuild better-sqlite3 esbuild
> ```

### 2. Configure the AI backend

Copy the env template and add your OpenRouter key:

```bash
cp server/.env.example server/.env
```

Then edit `server/.env` and set `OPENROUTER_API_KEY`. The selectable models come
from `server/models.config.json` (validated against OpenRouter at runtime).

### 3. Run in development

Run the backend and web frontend together:

```bash
pnpm dev:all
```

- Web app: <http://localhost:5173>
- AI backend: <http://localhost:8787>

Or run them separately:

```bash
pnpm dev:server   # AI backend only (http://localhost:8787)
pnpm dev          # web frontend only (http://localhost:5173)
```

To run the native **Electron** desktop app with HMR (the web dev server must be
running too):

```bash
pnpm dev:desktop
```

> The packaged Electron app proxies `/api/*` to the backend, so the backend must
> be running as a separate process even in desktop mode.

---

## Building & packaging

Production build of the renderer + Electron main:

```bash
pnpm build:desktop
```

Build and package a Linux distributable (AppImage + `.deb` written to
`release/`):

```bash
pnpm package:linux
```

---

## Useful commands

```bash
pnpm install          # install dependencies
pnpm setup:python     # fetch the Build123D Python runtime (optional, ~200MB)
pnpm dev              # web dev server (http://localhost:5173)
pnpm dev:server       # AI backend (http://localhost:8787)
pnpm dev:all          # backend + web dev server together
pnpm dev:desktop      # Electron app + HMR
pnpm run typecheck    # react-router typegen && tsc  (run before committing)
pnpm run build        # production build (SPA)
pnpm build:desktop    # build renderer + Electron main
pnpm package:linux    # build + package -> release/*.AppImage / *.deb
```

---

## Project layout

```
app/         Renderer (React Router SPA): components, stores, lib, routes
server/      AI chat backend (Hono + AI SDK) + storage/persistence layer
electron/    Electron main + preload (bundled to CommonJS .cjs)
build/       Renderer build output (gitignored)
dist-electron/  Electron main/preload bundles (gitignored)
release/     Packaged distributables (gitignored)
```

See `project-knowledge.md` for detailed architecture, conventions, and gotchas,
and `AI CAD MVP Project Specification.md` for the full product vision.
