"use strict";
/**
 * Serves bundled PWA static files and proxies /ws to the local relay.
 */
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT || 8080);
const RELAY_PORT = Number(process.env.RELAY_PORT || 8787);
const STATIC_ROOT = process.env.STATIC_ROOT;

if (!STATIC_ROOT) {
  console.error("STATIC_ROOT required");
  process.exit(1);
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".map": "application/json",
  ".webmanifest": "application/manifest+json",
};

function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0] || "/");
  const rel = decoded === "/" ? "index.html" : decoded.replace(/^\//, "");
  const file = path.normalize(path.join(STATIC_ROOT, rel));
  if (!file.startsWith(path.normalize(STATIC_ROOT))) return null;
  return file;
}

function serveStatic(req, res) {
  if (req.url === "/healthz") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ok\n");
    return;
  }

  let file = safePath(req.url || "/");
  if (!file || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    file = path.join(STATIC_ROOT, "index.html");
  }
  if (!fs.existsSync(file)) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  const ext = path.extname(file).toLowerCase();
  res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer(serveStatic);

server.on("upgrade", (req, socket, head) => {
  if (!(req.url || "").startsWith("/ws")) {
    socket.destroy();
    return;
  }

  const proxyReq = http.request({
    hostname: "127.0.0.1",
    port: RELAY_PORT,
    method: "GET",
    path: "/",
    headers: {
      ...req.headers,
      host: `127.0.0.1:${RELAY_PORT}`,
    },
  });

  proxyReq.on("upgrade", (proxyRes, proxySocket, proxyHead) => {
    let raw = "HTTP/1.1 101 Switching Protocols\r\n";
    for (const [key, value] of Object.entries(proxyRes.headers)) {
      raw += `${key}: ${Array.isArray(value) ? value.join(", ") : value}\r\n`;
    }
    raw += "\r\n";
    socket.write(raw);
    if (proxyHead.length) proxySocket.write(proxyHead);
    if (head.length) proxySocket.write(head);
    socket.on("error", () => proxySocket.destroy());
    proxySocket.on("error", () => socket.destroy());
    proxySocket.pipe(socket);
    socket.pipe(proxySocket);
  });

  socket.on("error", () => proxyReq.destroy());
  proxyReq.on("error", () => socket.destroy());
  proxyReq.on("response", () => socket.destroy());
  proxyReq.end();
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`app-server listening on http://127.0.0.1:${PORT}`);
});
