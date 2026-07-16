# Project Knowledge — AI CAD

Hard-won context for anyone (human or AI) working on this codebase. Captures
non-obvious decisions, gotchas, and conventions learned while building the MVP
frontend. Update this as the project evolves.

---

## What this is

An AI-native parametric CAD application. Users describe parts in natural
language; the app generates parametric CAD code (OpenSCAD / Build123D), executes
a modeling backend, and renders the resulting mesh in a Three.js viewport.

**Current state:** MVP frontend wrapped in an **Electron desktop shell**, plus a
**TypeScript AI-chat backend** (`server/`) that streams chat from the Vercel AI
SDK over OpenRouter. The AI conversation is real (streaming + context), and
**OpenSCAD geometry generation is now wired end-to-end**: in Build mode the
model calls an `update_model` tool whose server-side `execute` runs the
`openscad` CLI and streams a parsed triangle mesh back to the viewport. Plan /
Chat / Build modes are user-selectable. Build123D, persistence, and a code
editor are still deferred. See `AI CAD MVP Project Specification.md` for the
full vision.

> Note on the spec: the spec said *Python backend + WebSocket*. The AI layer was
> deliberately moved to **TypeScript + HTTP streaming** (Vercel AI SDK). The CAD
> kernel also landed in **TypeScript** (Node spawns the `openscad` binary); no
> Python service exists. The dummy WebSocket / connection layer is still mocked.

### MVP frontend layout

```
+----------------------------------------------------------+
|  Toolbar (app name, backend selector, export, theme)     |
+----------------------------------+-----------------------+
|                                  |                       |
|          Viewport (R3F)          |       Chat            |
|          orbit / pan / zoom      |   (resizable panel)   |
|          grid, gizmo             |                       |
+----------------------------------+-----------------------+
|  Status bar (connection, backend, generation state)      |
+----------------------------------------------------------+
```

The viewport and chat are a horizontal `ResizablePanelGroup` (drag the handle).
Default split is 70% / 30%; chat min 20%, max 55%. Panel-size persistence is
intentionally deferred — a storage layer will be added later.

---

## Tech stack

| Layer            | Choice                                                  |
| ---------------- | ------------------------------------------------------- |
| Framework        | React Router 8 (Framework Mode), **SPA** (`ssr: false`) |
| UI               | React 19, TypeScript                                    |
| Styling          | Tailwind CSS v4 (via `@tailwindcss/vite`), shadcn/ui (new-york) |
| 3D viewport      | three.js + @react-three/fiber + @react-three/drei       |
| State            | Zustand                                                 |
| Package manager  | **pnpm** (pnpm-lock.yaml)                               |
| Build tool       | Vite 8                                                  |
| Desktop shell    | **Electron 43** (renderer = the React Router app)       |
| Packaging        | electron-builder (Linux: AppImage + deb)               |
| AI chat backend  | **Hono** (`server/`) + **Vercel AI SDK v7** + OpenRouter |
| Tool schemas     | **zod 4** (added for AI SDK `tool()` input schemas)        |
| CAD kernel       | **OpenSCAD** (external CLI binary, spawned by Node)        |

**Path alias:** `~/*` → `./app/*`

---

## Commands

```bash
pnpm install          # install deps
pnpm dev              # web dev server on http://localhost:5173
pnpm dev:server       # AI chat backend (Hono) on http://localhost:8787
pnpm dev:all          # backend + web dev server together (concurrently)
pnpm dev:desktop      # native Electron app + HMR (loads the dev server)
pnpm run typecheck    # react-router typegen && tsc  (ALWAYS run before committing)
pnpm run build        # production build (SPA)
pnpm build:desktop    # build renderer + electron main (no packaging)
pnpm package:linux    # build + electron-builder -> release/*.AppImage / *.deb
```

---

## Project structure

```
app/
├── components/
│   ├── ui/                  # shadcn primitives (auto-generated, do not hand-edit)
│   ├── Toolbar.tsx
│   ├── Viewport.tsx         # R3F Canvas; off-thread geometry; imperative camera fit (FitController), view modes (shaded/solid/wireframe), grid+gizmo toggles, Frame btn + F hotkey
│   ├── ChatPanel.tsx        # message list + composer (text + image attachments); mode + model Selects + attach/send buttons live below the input
│   ├── ChatMessage.tsx      # memoized; renders text parts + image parts + update_model tool parts (CodeBlock + render status/stderr)
│   ├── CodeBlock.tsx        # read-only code display with copy (used by ChatMessage + CodeView)
│   ├── CodeView.tsx         # right-panel Code tab: shows current cadCode read-only
│   ├── SidePanel.tsx        # right panel container with [Chat | Code] tab switch
│   └── StatusBar.tsx        # connection, backend, OpenSCAD capability, triangle count, build state
├── lib/
│   ├── utils.ts             # cn() helper (required by shadcn)
│   ├── ai-chat.tsx          # ChatProvider: useChat({ throttle: 50 }); SPLIT into Actions/Status/State/HasMessages contexts (NOT one whole-object context); transport injects mode/model/cadCode/language
│   ├── api.ts               # chatApiUrl / meshUrl(id) / capabilitiesUrl / modelsUrl (derived from VITE_AI_API_URL)
│   ├── images.ts            # image-attach helpers: data-URL + canvas downscale (>1600px), limits (≤4, ≤5MB), buildImageParts/extractImageFiles
│   ├── mesh-worker.ts       # Web Worker: computeVertexNormals + Ritter bounding sphere (transferable Float32Array)
│   ├── mesh-worker-client.ts# singleton worker + id-correlated buildMesh() promise
│   └── useModelSync.ts      # watches the LAST chat message; on finished update_model fetches binary /api/mesh/:id -> setModel
├── services/
│   └── websocket.ts         # DummyWebSocketClient — swap for real WS later (CAD progress)
├── store/
│   ├── useModelStore.ts     # mesh (TriangleMesh), cadCode, language, backend, isBuilding, setModel
│   ├── useChatModeStore.ts  # ChatMode = "plan" | "chat" | "build" (default "build")
│   ├── useSettingsStore.ts  # selected OpenRouter model id (default null -> first /api/models entry)
│   └── useConnectionStore.ts
├── types/
│   └── index.ts             # ChatMode, TriangleMesh (positions: Float32Array), BackendName, ModelingBackend, etc.
├── routes/
│   ├── home.tsx             # the workspace; <Workspace> (inside ChatProvider) calls useModelSync
│   └── +types/*             # AUTO-GENERATED by react-router typegen (gitignored)
├── vite-env.d.ts            # augments ImportMetaEnv with VITE_AI_API_URL
├── app.css                  # Tailwind import + shadcn design tokens
└── root.tsx                 # ThemeProvider + Toaster + Layout
```

```
server/                       # AI chat backend (TypeScript, runs standalone now)
├── app.ts                    # Hono app: POST /api/chat (update_model tool, stopWhen: stepCountIs(4) self-correction, MAX_TRIANGLES=500k cap), GET /api/models, /api/mesh/:id (BINARY float32 frame), /api/capabilities, /api/health
├── index.ts                  # Node bootstrap only (serve() via @hono/node-server) — standalone entry
├── env.ts                    # OPENROUTER_* / PORT / ALLOWED_ORIGIN / OPENSCAD_PATH; assertConfig()
├── models.ts                 # loads models.config.json, validates ids vs OpenRouter /api/v1/models (5-min cache), resolveModelId(); exposes supportsVision from architecture.input_modalities
├── models.config.json        # whitelist of selectable model ids + "default" (the UI model picker source)
├── backend-types.ts          # BackendName = "openscad" | "build123d"
├── system-prompt.ts          # BASE_PROMPT + buildInstructions(mode, cadCode, language); attached-image guidance; BUILD retry-on-error policy
├── backends/openscad.ts      # renderScad(code) spawns `openscad -o out.stl`; checkOpenScad()
├── renderer/stl.ts           # parseStl(Buffer) -> { positions:number[], triangleCount } (binary + ASCII)
├── mesh-store.ts             # ephemeral Map<meshId, TriangleMesh> (LRU, capped 64)
├── .env                      # gitignored — your real OpenRouter key goes here
└── .env.example              # committed template
```

```
electron/                    # Electron main process (Node side, NOT the React app)
├── main.ts                  # BrowserWindow, app:// protocol, dev-vs-packaged loading
├── preload.ts               # contextBridge stub (contextIsolation-safe) for future IPC
└── vite.config.ts           # bundles main+preload -> dist-electron/*.cjs (CommonJS)
```

`dist-electron/` and `release/` are build outputs (gitignored). The renderer
build (`build/client/`) is still produced by `react-router build` and is the
exact same SPA as the web app — Electron just loads it.

---

## Key conventions

- **Backend interface is the contract.** `app/types/index.ts` defines
  `ModelingBackend` (`create` / `modify` / `render` / `export`). The frontend
  never cares which CAD engine is running. When the CAD kernel lands, implement
  this same shape; the UI won't change.
- **The frontend performs NO geometry operations.** It only renders meshes and
  ships prompts. All CAD work happens backend-side.
- **AI chat is real and streaming.** A single `useChat({ throttle: 50 })`
  instance lives in `ChatProvider` (`app/lib/ai-chat.tsx`), wrapped around the
  whole workspace in `home.tsx`. It is exposed via FOUR narrow contexts —
  `useChatActions` (stable `sendMessage`/`stop`/`regenerate`/`setMessages`),
  `useChatStatus` (status transitions only), `useChatState` (`messages`+`error`,
  per-throttled-token), `useChatHasMessages` (boolean). **Do NOT put the whole
  `chat` object in one context** — it re-renders the ENTIRE app tree on every
  token (that was the whole-app freeze bug). `ChatMessage` is `React.memo`'d so
  prior messages skip re-render. Message history (context) is held client-side by
  `useChat` and re-sent each turn; there is no server-side store yet.
- **CAD generation is real (OpenSCAD).** In Build mode the model calls the
  `update_model` tool (`server/app.ts`) with `{ code, language, message }`.
  The server's `execute` writes the code to a temp `.scad`, runs
  `openscad -o out.stl`, parses the STL (`server/renderer/stl.ts`) into a flat
  `positions` array, stores it in the ephemeral `server/mesh-store.ts`, and
  returns `{ success, meshId, triangleCount, stderr? }`. The client's
  `useModelSync` (`app/lib/useModelSync.ts`) watches the chat messages for a
  finished tool part, then `GET /api/mesh/:meshId` and calls
  `useModelStore.setModel(mesh, code, language)`. Plan/Chat modes instruct the
  model NOT to call the tool, so no geometry changes.
- **Modes are user-controlled, not model-decided.** `useChatModeStore`
  (`plan|chat|build`) is set by a `Select` in the `ChatPanel` footer (next to
  the model picker — there is no longer a top mode bar). The selected mode +
  model + current `cadCode`/`language` are injected into the request body by
  the transport's `prepareSendMessagesRequest` (reads live store state, so no
  stale closures) and turned into the model `instructions` via
  `buildInstructions(mode, cadCode, language)` server-side. The model never
  switches modes on its own.
- **Model picker is server-driven.** `server/models.config.json` is the
  whitelist; `listAvailableModels()` (`server/models.ts`) intersects it with
  OpenRouter's live `GET /api/v1/models` (5-min in-process cache, fails open —
  returns the raw config ids if OpenRouter is unreachable) and returns
  `{id, name}`. `GET /api/models` is what the client polls on mount. The
  selected id lives in `useSettingsStore`; `ChatPanel` auto-selects the first
  entry if none is set. `POST /api/chat` accepts `model` in the body and
  resolves it through `resolveModelId()` (unknown id → config default).
  `OPENROUTER_MODEL` env is now only a last-resort fallback.
- **Image attachments (vision).** The composer supports paste / drag-drop /
  paperclip image attach (≤4 images, ≤5 MB each, downscaled >1600px via canvas in
  `app/lib/images.ts`). Attaching is **gated on the selected model's
  `supportsVision` flag** (sourced from OpenRouter `architecture.input_modalities`
  in `server/models.ts`). AI SDK v7 `sendMessage({ text, files })` carries
  `FileUIPart` data-URLs straight through the transport → `convertToModelMessages`
  → OpenRouter `image_url`; **no server transport changes were needed**.
  `ChatMessage` renders image parts as thumbnails. A `ScanEye` icon in the model
  dropdown/trigger shows vision capability. Send + attach buttons live in the
  footer row next to the model Select (outside the textarea), so the textarea
  keeps default padding.
- **OpenSCAD self-correction.** `streamText` uses `stopWhen: stepCountIs(4)`, so
  when a Build's `update_model` tool returns `{success:false, stderr}`, the model
  sees the error and retries within the same turn (up to ~3 times). The BUILD-mode
  prompt + the tool's failure `message` tell it to read the stderr line and fix.
  A `MAX_TRIANGLES = 500_000` cap in the tool returns a clear "too dense" error
  the model resolves by lowering `$fn`.
- **Keep the chat composer interactive while busy.** The textarea is NOT
  disabled while the assistant streams or OpenSCAD renders — `submit()` guards
  against sending mid-busy, so the user can compose the next prompt. Don't
  re-add `disabled={busy}` on the Textarea.
- **Tool part shape (client).** `useChat` assembles each tool call into one
  `UIMessage` part with `type: "tool-update_model"`, `state` in
  `input-streaming|input-available|output-available|output-error`, plus
  `input` (the code) and `output` (the render result). `ChatMessage` and
  `useModelSync` both detect parts by `p.type === "tool-update_model"`. Don't
  read `message.content` — iterate `message.parts`.
- **OpenSCAD must be on PATH** (or set `OPENSCAD_PATH`). If missing, build turns
  return `{success:false, stderr:"spawn openscad ENOENT"}` (shown in the chat
  card + status bar "OpenSCAD: not found"); Plan/Chat still work. Install on
  Fedora with `sudo dnf install openscad`.
- **No comments in code** unless explicitly requested (house style).

---

## AI chat backend (`server/`)

Standalone **Hono** app streaming chat via the **Vercel AI SDK v7** through
**OpenRouter**. Designed to run as a separate process now and to be embedded
**in-process inside Electron's main process later** with zero app-code changes
(that's why the Hono `app` in `app.ts` is kept separate from the Node `serve()`
bootstrap in `index.ts`).

- **Endpoints:** `POST /api/chat` (AI SDK UI-message stream), `GET /api/models`
  (whitelisted, OpenRouter-validated model picker source), `GET /api/health`.
  CORS is locked to `ALLOWED_ORIGIN` (default `http://localhost:5173`).
- **OpenRouter wiring:** `@openrouter/ai-sdk-provider`'s `createOpenRouter()`
  + `openrouter.chat(MODEL)`. The model id per request comes from
  `resolveModelId(req.body.model)` — NOT a fixed env. Edit the model menu by
  editing `server/models.config.json` (ids must match OpenRouter's exactly or
  they get filtered out).
- **Server response:** `streamText(...)` → `toUIMessageStream({ stream })` →
  `createUIMessageStreamResponse({ stream })`. We override `toUIMessageStream`'s
  `onError` to **forward the real error text** (the default masks it to
  `"An error occurred."`). This is fine for a local desktop app and lets the UI
  tell auth/model errors apart — the API key itself is never in the message.
- **Errors → client:** `useChat` exposes `error` (an `Error`) and sets
  `status` to `'error'`. `describeChatError()` (`app/lib/ai-chat.tsx`) classifies
  it: network/down vs auth (401) vs model. `ChatPanel` renders a dismissible
  banner with **Retry** (`regenerate()`); `StatusBar` shows a concise
  "Chat error". The banner is the single detailed error UI — don't duplicate it.
- **Env:** loaded via Node 22's native `--env-file-if-exists=server/.env` (no
  dotenv dep). `server/.env` is gitignored; copy from `server/.env.example`.
- **Context** is maintained client-side by `useChat` (full message history is
  POSTed each turn). No DB / server-side history yet.

### Backend gotchas

15. **AI SDK v7 renamed `system` → `instructions`.** `streamText({ system })`
    still works but is **deprecated**; use `instructions`. `convertToModelMessages`
    is async (`await` it) — it resolves file/data-URL parts. Client `useChat`
    takes a **`transport`** (`new DefaultChatTransport({ api })`), not a bare
    `api` string.
16. **The client renders `UIMessage.parts`, not `content`.** Each message is
    `{ id, role, parts: [{ type: 'text', text }, ...] }`. Iterate parts; don't
    read `message.content`. (Future: tool/data parts for meshes.)
17. **`useChat` is one instance shared via React context — but SPLIT, not whole.**
    `ChatProvider` (`app/lib/ai-chat.tsx`) runs `useChat({ throttle: 50 })` once
    and exposes it through four narrow contexts (`useChatActions`/`useChatStatus`/
    `useChatState`/`useChatHasMessages`). Never call `useChat()` per-component
    (you get separate chat states), and never stuff the whole `chat` object into
    one context — it's a fresh object every render and re-renders the entire app
    on every token (full freeze). The action methods are stable (backed by a
    `useRef` chat instance inside the SDK), so the actions context never changes.
18. **Server files ARE typechecked by the root `pnpm typecheck`** (tsconfig
    `include: ["**/*"]`). They are NOT bundled into the client (the client never
    imports `server/`). Obey `verbatimModuleSyntax` → use `import type`.
19. **esbuild build script must be approved.** `tsx` needs esbuild; pnpm v11
    blocks its postinstall until you set `esbuild: true` under `allowBuilds` in
    `pnpm-workspace.yaml` (done). If `dev:server` errors with a missing esbuild
    binary, run `pnpm rebuild esbuild`.
20. **Electron renderer origin is `app://...`, not `localhost`.** During web dev
    CORS `ALLOWED_ORIGIN=http://localhost:5173` is enough. If you test chat from
    the Electron shell and hit CORS, set `ALLOWED_ORIGIN=*` (or the app origin)
    in `server/.env`. (When the backend later moves in-process, CORS goes away.)
21. **"Backend down" surfaces as a *browser* fetch error, message varies by
    browser.** When the AI backend isn't running, `useChat`'s fetch rejects
    before any HTTP response, so `error.message` is the browser's wording —
    Chrome `"Failed to fetch"`, Safari `"Load failed"`, Firefox
    `"NetworkError..."`. `describeChatError()` regexes these
    (`/failed to fetch|network|load failed|.../i`) into the "Can't reach the AI
    backend" banner. **`regenerate()` retries the last user message** — it does
    not need the user to retype. Add new error categories to that function.

---

## shadcn / UI notes

- `components.json` is at repo root; aliases point at `~/components`,
  `~/lib/utils`, etc. CSS file is `app/app.css`.
- Add components with: `pnpm dlx shadcn@latest add <name> --yes`
- shadcn auto-installed two deps worth knowing about:
  - **`next-themes`** — required by `app/components/ui/sonner.tsx`. We wrap the
    app in `<ThemeProvider attribute="class" defaultTheme="dark">` in `root.tsx`.
    Dark mode tokens live under `.dark` in `app/app.css`.
  - **`radix-ui`** (the umbrella package) — used by button/tooltip/etc.
- `app/app.css` holds the shadcn OKLCH design tokens (`:root` + `.dark`) and the
  `@theme inline` mapping. Don't delete these.

---

## Electron / desktop shell

- **React Router owns the renderer; Electron owns only main + preload.** Do NOT
  bring in `electron-vite` to take over the renderer build — RR 8 Framework Mode
  has its own opinions and they conflict. The desktop `build`/`dev` reuse
  `react-router build`/`react-router dev` unchanged; only the Node side is new.
- **Two run modes** (`electron/main.ts` decides via `app.isPackaged`):
  - Dev (`!app.isPackaged`): loads `http://localhost:5173` — full Vite HMR.
  - Packaged: registers a privileged **`app://`** scheme and serves
    `build/client/*` via `protocol.handle`, then loads `app://bundle/index.html`.
- **Why `app://` and not `file://` / `loadFile`:** RR's SPA build emits
  **absolute** asset paths (`/assets/entry.client-…js`, and inline
  `import("/assets/…")`). Under `file://` those resolve to the filesystem root
  and break. The `app://` origin makes `/assets/…` resolve correctly with zero
  changes to Vite `base` or the RR config. (We never touch `vite.config.ts`.)
- **main + preload are bundled to CommonJS `.cjs`.** `package.json` has
  `"type": "module"`, which would make `.js` outputs ESM — but a **sandboxed
  preload must be CJS** (`sandbox: true`). Emitting `.cjs` sidesteps both: Node
  treats `.cjs` as CJS regardless of package type. The Vite config externals
  `electron` + all Node builtins and targets `node22`.
- **Secure window defaults — keep them:** `contextIsolation: true`,
  `nodeIntegration: false`, `sandbox: true`. The renderer is pure browser code.
- **Resolve paths with `app.getAppPath()`**, NOT `import.meta.url` / `__dirname`.
  In the bundled CJS output `import.meta.url` is unreliable, and `__dirname`
  isn't typed in ESM source. `app.getAppPath()` works uniformly in dev (project
  root) and packaged (`app.asar`), and Electron patches `fs` to read inside asar
  transparently — so the `app://` handler's `readFile`/`stat`/`existsSync` work
  on the packed archive without extra setup.
- **`webPreferences.preload`** points at `dist-electron/preload.cjs`. We include
  `dist-electron/**` and `build/client/**` in electron-builder `files`, so both
  ship inside the asar.
- **`main` field** in package.json is `dist-electron/main.cjs` — that's what
  `electron .` and the packaged app execute.
- **The packaged desktop app does NOT run the backend yet.** `electron/main.ts`
  only serves the renderer SPA via `app://`; it never starts the Hono server.
  So chat + CAD work only in web-dev mode (`pnpm dev:all`, where the server is a
  separate process) — in the packaged Electron app `localhost:8787` has nothing
  listening and chat/CAD silently fail. Embedding the server in main (import
  `app` from `server/app.ts`, call `serve()` in-process, set `process.env`
  keys/`OPENSCAD_PATH` first) is the prerequisite for *any* desktop self-
  containment work (bundling/auto-downloading OpenSCAD, real export, etc.).

---



### 1. React Router `+types/*` errors are NOT real errors
Editors show `Cannot find module './+types/home'` for route modules. These types
are generated by `react-router typegen` (run via `pnpm typecheck`). They are
absent until then. **Always run `pnpm run typecheck` before trusting errors.**

### 2. SPA mode is required (not optional)
`react-router.config.ts` has `ssr: false`. React Three Fiber's `<Canvas>` needs
WebGL, which is browser-only; SSR will break. Don't switch SSR back on without
wrapping the viewport in a client-only boundary.

### 3. `w-screen` / `100vw` causes horizontal overflow
`100vw` includes the vertical-scrollbar width, so the page becomes wider than
the viewport and the rightmost panel slides off-screen. **Use `w-full`** for
full-width app shells. We also pin `overflow-hidden` on `html, body`.

### 4. Flexbox scroll: every scroll container needs `min-h-0`
A flex child with `flex-1` defaults to `min-height: auto`, so it grows to fit
content and pushes siblings (e.g. the chat composer) off-screen instead of
scrolling. **Add `min-h-0` (and usually `overflow-hidden`)** to any flex item
that should scroll internally. This bit the chat panel — see
`ChatPanel.tsx`'s `<ScrollArea className="min-h-0 flex-1 overflow-hidden">`.
Radix `ScrollArea` likewise needs a height-constrained parent to scroll.

### 5. react-resizable-panels v4 API differs from docs/older versions
shadcn's `resizable` now installs **v4**, which is NOT API-compatible with v2/v3:
- The orientation prop is **`orientation="horizontal"`**, NOT `direction`.
- The handle is the `Separator` primitive (shadcn exposes `ResizableHandle`).
- **Size units: numbers = PIXELS, strings = PERCENTAGES.** This is the big one.
  `defaultSize={30}` = 30px (a tiny panel); `defaultSize="30%"` = 30%.
  `minSize`/`maxSize`/`defaultSize` all accept `number | string`. If a panel is
  mysteriously tiny and won't grow, you passed a number where you meant a percent
  string. We use strings everywhere (`"70%"`, `"20%"`, `"55%"`).

### 6. pnpm strict node_modules blocks transitive imports
Under pnpm, only declared dependencies are at top-level `node_modules`. You
**cannot** import a transitive dep (e.g. `three-stdlib`, which lives under
`.pnpm/`) directly — it'll fail to resolve. Either add it as a real dependency,
or derive types another way (we dropped an unused OrbitControls ref rather than
importing `three-stdlib`'s type).

### 7. `react-router typegen` prints deprecation warnings
`The envFile option is deprecated, please use envDir: false instead.` appears on
every `typecheck`/`build`. Harmless; ignore it.

### 8. The Three.js bundle is large (~1 MB / ~300 KB gzip)
The viewport chunk dominates the build. Acceptable for an MVP. When it matters,
lazy-load the viewport with `React.lazy` + a route-level split.

### 9. NEVER load the packaged app with `file://` / `loadFile`
React Router's SPA build writes absolute paths (`/assets/...`) into
`index.html`, including inline dynamic imports. `file://` resolves those against
the filesystem root → blank window / failed module loads. Use the `app://`
custom protocol (see "Electron / desktop shell"). Setting Vite `base: './'` is a
tempting shortcut but doesn't reliably rewrite RR's inline `import("...")`
strings — the protocol is the robust fix.

### 10. Electron main/preload MUST ship as CommonJS (`.cjs`)
Two reasons collide: (a) `package.json` is `"type": "module"`, so a `.js` output
is treated as ESM and a sandboxed preload can't be ESM; (b) `sandbox: true`
requires a CJS preload. Bundling to `.cjs` solves both. Don't switch the preload
to ESM unless you also turn sandboxing off (we don't want to).

### 11. Don't use `import.meta.url` / `__dirname` in electron main
The CJS bundle doesn't preserve `import.meta.url`, and `__dirname` isn't
declared in ESM source (TS error). Use `app.getAppPath()` for all path roots.

### 12. pnpm v11 blocks scripts on unapproved build deps
After adding Electron, pnpm wrote `allowBuilds: { electron-winstaller: "set
this to true or false" }` into `pnpm-workspace.yaml` and then **failed every
`pnpm <script>`** with `ERR_PNPM_IGNORED_BUILDS` until resolved. We set
`electron-winstaller: false` (it's a Windows-only packaging dep we don't need).
If a script mysteriously fails right after installing something, check this file
and approve/decline explicitly.

### 13. electron-builder requires package metadata
It errors out without `version`, and the **`.deb`** target (via the bundled
`fpm`/Ruby) additionally requires `homepage`. We set `version`/`description`/
`author`/`homepage` in package.json. (`homepage` is a placeholder
`https://example.com` — replace with the real repo/site before a public
release.)

### 14. `.deb` build needs `libcrypt.so.1` on the host
electron-builder's bundled `fpm` is a Ruby binary; that Ruby fails with
`cannot open shared object file: libcrypt.so.1` on minimal/Fedora hosts.
**AppImage builds fine without it.** For `.deb`, install the lib once:
`sudo dnf install libxcrypt-compat` (Fedora) / `sudo apt install libcrypt1`
(Debian).

### 15. Web Workers under Vite + RR + Electron (and the typing trick)
We use the standard Vite pattern: `new Worker(new URL("./mesh-worker.ts",
import.meta.url), { type: "module" })`. Vite emits the worker as its own chunk
(`build/client/assets/mesh-worker-*.js`) and RR's SPA build + Electron's
`app://` loader both serve it unchanged — no special config.
- **Don't `import three` inside a worker.** Three's main entry pulls in
  DOM-touching classes (`Texture`, etc.). We hand-rolled the normals + Ritter
  bounding-sphere loops instead (pure math, ~40 LOC). Worth it.
- **tsconfig has only `DOM`/`ES2022` libs — no `WebWorker`.** So `self` inside
  the worker is typed as `Window`, and `self.postMessage(msg, [transfer])`
  doesn't match (Window's signature requires `targetOrigin`). Work around it
  with a narrow local cast at the top of the worker file:
  `const ctx = self as unknown as { onmessage: …; postMessage(msg, transfer: Transferable[]): void }`.
- **Always transfer `Float32Array.buffer`, never the typed array.** And once
  transferred, the source is neutered — only build throwaway buffers for the
  transfer. `mesh-worker-client.ts` correlates requests by an incrementing id
  so a single shared worker can serve concurrent `buildMesh()` calls safely.

---

## R3F viewport specifics

- `<Canvas>` uses an internal `ResizeObserver`, so it resizes automatically when
  the resizable panel is dragged — no manual resize wiring needed.
- drei components in use: `OrbitControls` (`makeDefault`, damping, `onStart`/`onEnd`
  for interaction tracking), `Grid` (infinite, toggleable), `GizmoHelper` +
  `GizmoViewport` (toggleable), `Bounds` (used as a plain measuring container —
  **NOT** declarative `fit`; fitting is driven imperatively by `FitController`).
- **three.js CANNOT parse CSS `var()` or `oklch()`.** We previously passed
  `var(--color-background)` to `<color attach="background">` — it silently fell
  back to a bright color and broke dark mode. Fix: the Canvas is **transparent**
  (`gl: { alpha: true }`, no `<color>`) and the wrapper div uses Tailwind
  `bg-background` (theme-correct CSS) so the DOM shows through. Grid line colors
  are resolved at runtime via a DOM probe (`getComputedStyle` → canvas-2D
  normalization → hex) in `resolveTokenColor()`, recomputed on theme change.
  Meshes use plain hex strings.
- **Camera framing is interaction-gated.** `FitController` (a child of `<Bounds>`,
  calls `useBounds()`) auto-frames a finished mesh ONLY when the user is not
  controlling the camera (`OrbitControls` `onStart`/`onEnd` → `interactingRef`).
  While orbiting/panning/zooming, nothing reorients the camera (that was the
  jitter). drei's built-in `start`-cancels-animation is the backstop. Manual
  frame: top-right button + **`F` hotkey** (guarded to skip when typing in chat
  or when modifiers are held).
- **View modes:** Shaded (surface, no edges) / Solid (surface + creased edges via
  `EdgesGeometry` at 20° threshold, surface uses `polygonOffset` to avoid
  z-fighting) / Wireframe (edges only, no surface — NOT every triangle edge, just
  structural creases). `EdgesGeometry` is built lazily (only in Solid/Wireframe)
  and disposed on swap/unmount.
- **Viewport toolbar** (top-right): view-mode segmented group (mesh-gated) · grid
  + gizmo visibility toggles (always visible) · Frame button (mesh-gated).
- **Geometry is built off the main thread.** `Viewport.tsx`'s `useEffect`
  converts `mesh.positions` to a `Float32Array`, transfers it to the singleton
  Web Worker (`mesh-worker.ts`) which computes per-vertex normals (same
  algorithm as three's non-indexed `computeVertexNormals`) + a Ritter bounding
  sphere, and returns both as transferable `Float32Array`s. The main thread
  only attaches them to a `BufferGeometry`. While a new mesh prepares, the
  previous mesh stays visible (no flicker) and a "Processing mesh…" badge
  shows. Old geometries are `.dispose()`d via a ref so GPU memory doesn't leak.
  Lifting this out of the R3F tree (the worker call lives in the outer
  component, not inside `<Canvas>`) is what keeps the textarea/camera
  responsive during large renders.
- Empty state (no mesh) shows a dashed hint. (The old "Generating model…"
  overlay was removed once chat stopped driving the viewport; the viewport no
  longer reacts to chat status.)

---

## What's live vs. mocked

| Layer                          | Status                                                    |
| ------------------------------ | --------------------------------------------------------- |
| AI chat (`server/`, `useChat`) | **LIVE** — streams from OpenRouter via Vercel AI SDK      |
| `update_model` tool → OpenSCAD → mesh → viewport | **LIVE** — requires `openscad` binary installed |
| Plan / Chat / Build modes      | **LIVE** — user-selectable via footer Select; drive system prompt + tool use |
| Model picker                   | **LIVE** — `GET /api/models` (config ∩ live OpenRouter, incl. `supportsVision`) → footer Select with `ScanEye` vision icon, stored in `useSettingsStore` |
| Off-main-thread geometry       | **LIVE** — Web Worker builds normals + bounding sphere (no UI hitch on large meshes) |
| Image attachments (vision)     | **LIVE** — paste / drag-drop / paperclip; gated on per-model `supportsVision`; ≤4 imgs, ≤5 MB, downscaled |
| OpenSCAD auto-retry            | **LIVE** — `stopWhen: stepCountIs(4)` + `MAX_TRIANGLES=500_000` cap; model self-corrects from stderr |
| Chat ↔ Code panel swap         | **LIVE** — `[Chat|Code]` tabs in `SidePanel` (Code read-only) |
| Mesh transport                 | **LIVE** — `GET /api/mesh/:id` returns a BINARY frame `[Uint32 triangleCount][Float32 positions…]` (`application/octet-stream`); client decodes via `arrayBuffer()` + zero-copy `Float32Array` view (was JSON `number[]` — caused load-time freeze) |
| Viewport view modes / controls | **LIVE** — Shaded/Solid/Wireframe, grid + gizmo toggles, Frame btn + `F` hotkey, interaction-gated camera, dark-mode-correct |
| OpenSCAD capability check      | **LIVE** — `GET /api/capabilities`, shown in `StatusBar`  |
| `app/dummy/`                   | **DELETED** — retired now that real OpenSCAD is wired     |
| `app/services/websocket.ts`    | **Mocked** — `DummyWebSocketClient`; becomes real WS for CAD progress |
| Export in `useModelStore`      | **Mocked** — returns a fake blob; real `/api/export` is a later task |
| Connection status              | **Mocked** — reflects the dummy WS, not the AI backend    |

The tool result (`BackendResult`-shaped) is what drives the viewport via
`useModelStore.setModel`; a failed render leaves the previous mesh in place.

---

## Next steps

1. **Install OpenSCAD** on any dev/deploy machine (`sudo dnf install openscad`
   on Fedora, or set `OPENSCAD_PATH`). Without it, build turns fail gracefully.
2. **Real export:** add `GET /api/export/:meshId?format=stl|obj|3mf` (serve the
   cached STL or re-render) and wire `useModelStore.exportModel` to it; the
   toolbar export toast currently says "dummy".
3. **Real WebSocket transport** replacing `DummyWebSocketClient` (for CAD
   progress / long renders), or keep HTTP streaming for everything.
4. Embed the Hono backend in Electron's main process (import `app` from
   `server/app.ts`, call `serve()` in-process) so the desktop app is
   self-contained.
5. Persist the resizable-panel split, the selected view mode, and the grid/gizmo
   toggles. (Phase 2) projects. Code editor + live sync (Phase 3). Build123D
   backend as an alternative `ModelingBackend`.
6. **Optional perf headroom:** R3F runs `frameloop="always"` with damping +
   1024² shadows + `preserveDrawingBuffer`; switching to `frameloop="demand"`
   (invalidate on change) and dropping `preserveDrawingBuffer` would reclaim
   frame budget if the viewport ever feels heavy on low-end GPUs.
