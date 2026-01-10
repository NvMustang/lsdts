import http from "node:http";
import { URL } from "node:url";
import { loadEnvLocalOnce } from "./utils/env.mjs";

import inviteHandler from "../api/invite.js";
import inviteResponsesHandler from "../api/invite-responses.js";
import invitesHandler from "../api/invites.js";
import invitePageHandler from "../api/invite-page.js";
import ogImageHandler from "../api/og-image.js";

const PORT = Number.parseInt(process.env.LSDTS_BACKEND_PORT || "8787", 10);

function readBody(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += String(chunk);
    });
    req.on("end", () => resolve(raw));
    req.on("error", () => resolve(""));
  });
}

function notFound(res) {
  res.statusCode = 404;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify({ error: "Not found" }));
}

function ping(res) {
  res.statusCode = 200;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify({ status: "ok", timestamp: new Date().toISOString() }));
}

async function route(req, res) {
  loadEnvLocalOnce();

  const url = new URL(req.url || "/", "http://localhost");

  // /i/:inviteId -> OG + redirect page
  if (url.pathname.startsWith("/i/")) {
    const inviteId = url.pathname.slice("/i/".length).split("/")[0] || "";
    // Préserver les paramètres de query string (t, w, c, m) s'ils sont présents
    req.query = { inviteId, ...Object.fromEntries(url.searchParams.entries()) };
    return await invitePageHandler(req, res);
  }

  if (!url.pathname.startsWith("/api/")) return notFound(res);

  req.query = Object.fromEntries(url.searchParams.entries());
  req.body = await readBody(req);

  const apiPath = url.pathname.replace(/^\/api\//, "");

  if (apiPath === "ping") return ping(res);
  if (apiPath === "invite") return await inviteHandler(req, res);
  if (apiPath === "invite-responses") return await inviteResponsesHandler(req, res);
  if (apiPath === "invites") return await invitesHandler(req, res);
  if (apiPath === "invite-page") return await invitePageHandler(req, res);
  if (apiPath === "og-image") return await ogImageHandler(req, res);

  return notFound(res);
}

const server = http.createServer((req, res) => {
  route(req, res).catch((err) => {
    const errorInfo = {
      timestamp: new Date().toISOString(),
      method: req.method,
      url: req.url,
      headers: {
        "user-agent": req.headers["user-agent"],
        "content-type": req.headers["content-type"],
      },
      error: {
        message: err instanceof Error ? err.message : String(err),
        name: err instanceof Error ? err.name : "Unknown",
        stack: err instanceof Error ? err.stack : undefined,
        code: err?.code,
        status: err?.status,
      },
    };
    console.error("[Server] Erreur non gérée:", JSON.stringify(errorInfo, null, 2));
    res.statusCode = 500;
    res.setHeader("content-type", "application/json; charset=utf-8");
    const message = err instanceof Error ? err.message : String(err);
    res.end(JSON.stringify({ error: "Server error", details: message }));
  });
});

server.listen(PORT, "0.0.0.0", () => {
  // No console noise in MVP; one line is acceptable for local dev.
  console.log(`LSDTS backend listening on http://0.0.0.0:${PORT}`);
  console.log(`LSDTS backend accessible on http://localhost:${PORT} and network IP:${PORT}`);
});


