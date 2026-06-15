import http from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize, resolve, sep } from "node:path";

const root = resolve("wo-ai-shuati-pro");
const port = Number(process.env.PORT || 4174);
const host = process.env.HOST || "127.0.0.1";

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".webmanifest", "application/manifest+json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
]);

const server = http.createServer((request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || `${host}:${port}`}`);
  const requestedPath = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const filePath = resolve(root, `.${normalize(requestedPath)}`);

  if (!filePath.startsWith(root + sep) && filePath !== root) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }

  response.writeHead(200, {
    "content-type": mimeTypes.get(extname(filePath)) || "application/octet-stream",
    "cache-control": "no-store",
  });
  createReadStream(filePath).pipe(response);
});

server.listen(port, host, () => {
  console.log(`ShuaTi dev server: http://${host}:${port}/`);
  console.log(`Serving ${root}`);
});
