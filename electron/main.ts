import { app, BrowserWindow, ipcMain, protocol, shell } from "electron";
import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { serve } from "@hono/node-server";
import { config } from "../server/env";
import { app as honoApp, configureServer } from "../server/app";
import { SafeStorageCredentialStore } from "./credentials";

const DEV_SERVER_URL = "http://localhost:5173";
const BACKEND_ORIGIN =
  process.env.ELECTRON_BACKEND_URL ?? "http://localhost:8787";

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
};

protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: true,
    },
  },
]);

let mainWindow: BrowserWindow | null = null;
let backendServer: ReturnType<typeof serve> | null = null;

function getPreloadPath(): string {
  return path.join(app.getAppPath(), "dist-electron", "preload.cjs");
}

function getRendererDir(): string {
  return path.join(app.getAppPath(), "build", "client");
}

function startEmbeddedBackend(): Promise<void> {
  const credentialStore = new SafeStorageCredentialStore();
  configureServer(credentialStore);
  return new Promise((resolve, reject) => {
    try {
      backendServer = serve(
        { fetch: honoApp.fetch, port: config.port, hostname: "127.0.0.1" },
        (info) => {
          const port = typeof info.port === "number" ? info.port : config.port;
          console.log(`[cadzero] Embedded backend listening on http://127.0.0.1:${port}`);
          resolve();
        },
      );
      backendServer.on("error", reject);
    } catch (e) {
      reject(e);
    }
  });
}

function stopEmbeddedBackend(): Promise<void> {
  if (!backendServer) return Promise.resolve();
  return new Promise((resolve) => {
    backendServer?.close(() => {
      backendServer = null;
      resolve();
    });
  });
}

async function proxyToBackend(request: Request, url: URL): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }
  const target = new URL(`${url.pathname}${url.search}`, BACKEND_ORIGIN);
  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  const init: RequestInit = { method: request.method, headers };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = await request.arrayBuffer();
  }
  try {
    const upstream = await fetch(target, init);
    const respHeaders = new Headers(upstream.headers);
    respHeaders.set("Access-Control-Allow-Origin", "*");
    return new Response(upstream.body, {
      status: upstream.status,
      headers: respHeaders,
    });
  } catch {
    return new Response(
      JSON.stringify({ error: "backend unreachable", target: target.toString() }),
      {
        status: 502,
        headers: {
          "content-type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      },
    );
  }
}

async function handleAppProtocol(request: Request): Promise<Response> {
  const url = new URL(request.url);

  if (url.pathname.startsWith("/api/")) {
    return proxyToBackend(request, url);
  }

  const baseDir = getRendererDir();

  let relativePath = decodeURIComponent(url.pathname);
  if (relativePath === "/" || relativePath === "") {
    relativePath = "/index.html";
  }

  let filePath = path.join(baseDir, relativePath);

  if (!existsSync(filePath)) {
    filePath = path.join(baseDir, "index.html");
  }

  try {
    const isDirectory = (await stat(filePath)).isDirectory();
    if (isDirectory) {
      filePath = path.join(filePath, "index.html");
    }
  } catch {
    filePath = path.join(baseDir, "index.html");
  }

  try {
    const body = await readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] ?? "application/octet-stream";
    return new Response(body, { headers: { "content-type": contentType } });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: false,
    frame: false,
    backgroundColor: "#0a0a0a",
    title: "CADZero",
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  if (!app.isPackaged) {
    void mainWindow.loadURL(DEV_SERVER_URL);
  } else {
    void mainWindow.loadURL("app://bundle/");
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.on("maximize", () => {
    mainWindow?.webContents.send("window:maximize-change", true);
  });
  mainWindow.on("unmaximize", () => {
    mainWindow?.webContents.send("window:maximize-change", false);
  });
}

app.whenReady().then(async () => {
  protocol.handle("app", handleAppProtocol);

  try {
    await startEmbeddedBackend();
  } catch (e) {
    console.error(
      "[cadzero] Failed to start embedded backend:",
      e instanceof Error ? e.message : e,
    );
  }

  ipcMain.on("window:minimize", () => mainWindow?.minimize());
  ipcMain.on("window:toggle-maximize", () => {
    if (!mainWindow) return;
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  });
  ipcMain.on("window:close", () => mainWindow?.close());
  ipcMain.handle("window:is-maximized", () => mainWindow?.isMaximized() ?? false);

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", (event) => {
  if (backendServer) {
    event.preventDefault();
    void stopEmbeddedBackend().then(() => {
      backendServer = null;
      app.quit();
    });
  }
});

app.on("web-contents-created", (_event, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
});
