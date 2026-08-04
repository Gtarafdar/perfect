const { test, expect } = require("@playwright/test");
const path = require("node:path");
const http = require("node:http");
const fs = require("node:fs");
const { chromium } = require("playwright");
const { randomBytes } = require("node:crypto");
const { WebSocketServer } = require("ws");

const ROOT = path.join(__dirname, "../..");
const EXT_DIST = path.join(ROOT, "extension/dist");
const FIXTURES = path.join(__dirname, "fixtures");
const E2E_PORT = 17329;
const PROTOCOL_VERSION = 1;

function mintToken() {
  return randomBytes(24).toString("hex");
}

function startFixtureServer() {
  const server = http.createServer((req, res) => {
    const name = (req.url || "/").replace(/^\//, "") || "form.html";
    const file = path.join(FIXTURES, name.split("?")[0]);
    if (!file.startsWith(FIXTURES) || !fs.existsSync(file)) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    const ext = path.extname(file);
    const type =
      ext === ".html"
        ? "text/html"
        : ext === ".json"
          ? "application/json"
          : "text/plain";
    res.writeHead(200, { "Content-Type": type });
    res.end(fs.readFileSync(file));
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      resolve({
        server,
        base: `http://127.0.0.1:${addr.port}`,
      });
    });
  });
}

async function startBridge(token, port) {
  const pending = new Map();
  let ext = null;
  let connected = false;

  const wss = new WebSocketServer({ host: "127.0.0.1", port });
  await new Promise((resolve, reject) => {
    wss.once("listening", resolve);
    wss.once("error", reject);
  });

  wss.on("connection", (ws) => {
    ws.on("message", (raw) => {
      let msg;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (msg.type === "hello") {
        if (msg.token !== token || msg.protocolVersion !== PROTOCOL_VERSION) {
          ws.send(
            JSON.stringify({ type: "hello_ack", ok: false, error: "auth failed" }),
          );
          ws.close();
          return;
        }
        ext = ws;
        connected = true;
        ws.send(JSON.stringify({ type: "hello_ack", ok: true }));
        return;
      }
      if (msg.type === "ping") {
        ws.send(JSON.stringify({ type: "pong", t: msg.t }));
        return;
      }
      if (msg.type === "tool_response") {
        const p = pending.get(msg.id);
        if (p) {
          clearTimeout(p.timer);
          pending.delete(msg.id);
          p.resolve(msg);
        }
      }
    });
    ws.on("close", () => {
      if (ext === ws) {
        ext = null;
        connected = false;
      }
    });
  });

  return {
    callTool(tool, args = {}, timeoutMs = 25000) {
      if (!connected || !ext) {
        return Promise.reject(new Error("Extension not linked"));
      }
      const id = `e2e-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`Timeout ${tool}`));
        }, timeoutMs);
        pending.set(id, { resolve, reject, timer });
        ext.send(JSON.stringify({ type: "tool_request", id, tool, args }));
      });
    },
    waitLinked(timeoutMs = 20000) {
      if (connected) return Promise.resolve(true);
      return new Promise((resolve) => {
        const start = Date.now();
        const tick = () => {
          if (connected) return resolve(true);
          if (Date.now() - start > timeoutMs) return resolve(false);
          setTimeout(tick, 200);
        };
        tick();
      });
    },
    async stop() {
      for (const [, p] of pending) {
        clearTimeout(p.timer);
        p.reject(new Error("stopped"));
      }
      pending.clear();
      try {
        ext?.close();
      } catch {
        /* */
      }
      await new Promise((r) => wss.close(() => r()));
    },
  };
}

async function seedExtension(sw, token, port) {
  await sw.evaluate(
    async ({ token: t, port: p }) => {
      await chrome.storage.local.set({
        settings: {
          mode: "skip",
          skipConfirmed: true,
          token: t,
          wsPort: p,
          allowlist: [],
          allowlistOnly: false,
          blocklist: [],
          alwaysAllowHosts: ["127.0.0.1", "localhost"],
          approvedPlan: null,
          audit: [],
          actionLog: [],
        },
      });
      try {
        chrome.runtime.sendMessage({ type: "perfect_reconnect" });
      } catch (_) {
        /* */
      }
    },
    { token, port },
  );
}

test.describe.configure({ mode: "serial" });

test("Extension MCP bridge tools | browser_status", async () => {
  test.setTimeout(120_000);
  if (!fs.existsSync(path.join(EXT_DIST, "manifest.json"))) {
    test.skip(true, "extension/dist missing — run npm run build");
  }

  const token = mintToken();
  const fixtures = await startFixtureServer();
  const bridge = await startBridge(token, E2E_PORT);

  const userDataDir = path.join(ROOT, "test-results/e2e-chrome-profile");
  fs.rmSync(userDataDir, { recursive: true, force: true });
  fs.mkdirSync(userDataDir, { recursive: true });

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      `--disable-extensions-except=${EXT_DIST}`,
      `--load-extension=${EXT_DIST}`,
      "--no-first-run",
      "--disable-default-apps",
    ],
  });

  try {
    let sw = context.serviceWorkers()[0];
    if (!sw) {
      sw = await context.waitForEvent("serviceworker", { timeout: 30000 });
    }
    await new Promise((r) => setTimeout(r, 1000));
    await seedExtension(sw, token, E2E_PORT);
    await new Promise((r) => setTimeout(r, 800));

    // Worker may restart after storage write
    const workers = context.serviceWorkers();
    sw = workers[workers.length - 1] || sw;
    try {
      await seedExtension(sw, token, E2E_PORT);
    } catch {
      sw = await context.waitForEvent("serviceworker", { timeout: 10000 });
      await seedExtension(sw, token, E2E_PORT);
    }

    const linked = await bridge.waitLinked(25000);
    expect(linked).toBe(true);

    const status = await bridge.callTool("browser_status", {});
    expect(status.ok).toBe(true);

    const nav = await bridge.callTool("browser_navigate", {
      url: `${fixtures.base}/form.html`,
      newTab: true,
    });
    expect(nav.ok).toBe(true);
    const tabId = nav.result.tabId;

    const snap = await bridge.callTool("browser_snapshot", { tabId });
    expect(snap.ok).toBe(true);
    expect(snap.result.fields.length).toBeGreaterThan(0);

    const nameField = snap.result.fields.find((f) => /name/i.test(f));
    expect(nameField).toBeTruthy();
    const ref = nameField.split("\t")[0];

    const filled = await bridge.callTool("browser_fill", {
      tabId,
      ref,
      value: "E2E Ada",
      label: "Name",
    });
    expect(filled.ok).toBe(true);

    const blocked = await bridge.callTool("browser_evaluate", {
      tabId,
      expression: "document.cookie",
    });
    expect(blocked.ok).toBe(false);

    const extract = await bridge.callTool("browser_extract", {
      tabId,
      selector: "h1",
    });
    expect(extract.ok).toBe(true);
  } finally {
    await context.close().catch(() => {});
    await bridge.stop().catch(() => {});
    fixtures.server.close();
  }
});
