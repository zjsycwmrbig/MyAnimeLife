import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "dist",
);
const port = Number(process.env.PORT || 4173);

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
]);

async function resolveRequestPath(requestUrl) {
  const pathname = decodeURIComponent(new URL(requestUrl, "http://localhost").pathname);
  const relativePath = pathname === "/" ? "index.html" : pathname.slice(1);
  let filePath = path.resolve(root, relativePath);

  if (!filePath.startsWith(`${root}${path.sep}`) && filePath !== root) {
    return null;
  }

  try {
    const stat = await fs.stat(filePath);
    if (stat.isDirectory()) {
      filePath = path.join(filePath, "index.html");
    }
    await fs.access(filePath);
    return filePath;
  } catch {
    return null;
  }
}

const server = http.createServer(async (request, response) => {
  const filePath = await resolveRequestPath(request.url ?? "/");

  if (!filePath) {
    try {
      const notFound = await fs.readFile(path.join(root, "404.html"));
      response.writeHead(404, { "content-type": contentTypes.get(".html") });
      response.end(notFound);
    } catch {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found");
    }
    return;
  }

  const contents = await fs.readFile(filePath);
  response.writeHead(200, {
    "content-type":
      contentTypes.get(path.extname(filePath).toLowerCase()) ??
      "application/octet-stream",
    "cache-control": "no-store",
  });
  response.end(contents);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`本地预览: http://127.0.0.1:${port}`);
});
