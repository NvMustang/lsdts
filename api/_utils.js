import { json } from "./_sheets.js";
import crypto from "node:crypto";

export function badRequest(res, message) {
  return json(res, 400, { error: message });
}

export function serverError(res, message, details) {
  const isProd = process.env.NODE_ENV === "production";
  return json(res, 500, isProd ? { error: message } : { error: message, details });
}

export function parseBody(req) {
  if (typeof req.body === "object" && req.body !== null) return req.body;
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return null;
    }
  }
  return null;
}

export function normalizeName(name) {
  return String(name || "").trim().replace(/\s+/g, " ");
}

export function nowIso() {
  return new Date().toISOString();
}

export function randomId() {
  return crypto.randomBytes(16).toString("hex");
}

export function rowsToObjects(rows) {
  const header = rows?.[0] || [];
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  return { idx, rows: rows.slice(1) };
}

export function offsetToMs(offset) {
  if (offset === "immediate") return 0;
  if (offset === "30m") return 30 * 60 * 1000;
  if (offset === "1h") return 60 * 60 * 1000;
  if (offset === "3h") return 3 * 60 * 60 * 1000;
  if (offset === "8h") return 8 * 60 * 60 * 1000;
  if (offset === "eve") return 24 * 60 * 60 * 1000;
  return null;
}

// Trouve une invitation dans les rows parsées
export function findInviteInRows(rows, inviteId) {
  const { idx, rows: data } = rowsToObjects(rows);
  for (let i = 0; i < data.length; i += 1) {
    const r = data[i];
    if (!r) continue;
    if (String(r[idx.id] || "") !== inviteId) continue;
    
    const cap = String(r[idx.capacity_max] || "").trim();
    return {
      rowIndex: i + 2, // 1-based + header
      id: inviteId,
      title: String(r[idx.title] || ""),
      when_at: String(r[idx.when_at] || ""),
      when_has_time: String(r[idx.when_has_time] || "") === "1",
      confirm_by: String(r[idx.confirm_by] || ""),
      capacity_max: cap ? Number.parseInt(cap, 10) : null,
      created_at: String(r[idx.created_at] || ""),
      status: String(r[idx.status] || "OPEN") || "OPEN",
      closed_at: String(r[idx.closed_at] || ""),
      closure_cause: String(r[idx.closure_cause] || ""),
      view_count_unique: Number.parseInt(String(r[idx.view_count_unique] || "0"), 10) || 0,
      yes_count: Number.parseInt(String(r[idx.yes_count] || "0"), 10) || 0,
      no_count: Number.parseInt(String(r[idx.no_count] || "0"), 10) || 0,
      maybe_count: Number.parseInt(String(r[idx.maybe_count] || "0"), 10) || 0,
      first_view_at: String(r[idx.first_view_at] || ""),
      first_response_at: String(r[idx.first_response_at] || ""),
      response_time_delta_ms: String(r[idx.response_time_delta_ms] || ""),
    };
  }
  return null;
}

