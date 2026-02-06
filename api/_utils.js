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
  // Format simple : YYYY-MM-DDTHH:MM (sans secondes, cohérent avec le reste)
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${da}T${hh}:${mm}`;
}

export function randomId() {
  return crypto.randomBytes(16).toString("hex");
}

export function rowsToObjects(rows) {
  if (!Array.isArray(rows)) {
    return { idx: {}, rows: [] };
  }
  const header = rows[0] || [];
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

// Parse une date - version simplifiée, utilise directement new Date()
export function parseDateLocalOrUtc(dateString) {
  if (!dateString || typeof dateString !== "string") return null;
  const s = dateString.trim();
  if (!s) return null;
  
  // Parser manuellement pour interpréter comme heure locale (évite UTC)
  // Format attendu: YYYY-MM-DDTHH:MM ou YYYY-MM-DDTHH:MM:SS
  const parts = s.split("T");
  if (parts.length === 2) {
    const [dateStr, timeStr] = parts;
    const [y, m, d] = dateStr.split("-").map((x) => Number.parseInt(x, 10));
    const timeParts = timeStr.split(":");
    const hh = Number.parseInt(timeParts[0] || "0", 10);
    const mm = Number.parseInt(timeParts[1] || "0", 10);
    const ss = Number.parseInt(timeParts[2] || "0", 10);
    
    if (y && m && d && Number.isFinite(hh) && Number.isFinite(mm)) {
      const dateObj = new Date(y, m - 1, d, hh, mm, ss, 0);
      if (!Number.isNaN(dateObj.getTime())) return dateObj;
    }
  }
  
  // Si le format n'est pas reconnu, retourner null plutôt que d'utiliser new Date()
  // qui pourrait interpréter comme UTC
  return null;
}

// Parse une date en heure locale (anciennement UTC, maintenant unifié en local)
// Conservée pour compatibilité avec le code existant
export function parseDateUTC(dateString) {
  // Déléguer à parseDateLocalOrUtc qui parse en heure locale
  return parseDateLocalOrUtc(dateString);
}

// Trouve une invitation dans les rows parsées
export function findInviteInRows(rows, inviteId) {
  const { idx, rows: data } = rowsToObjects(rows);
  for (let i = 0; i < data.length; i += 1) {
    const r = data[i];
    if (!r) continue;
    if (String(r[idx.id] || "") !== inviteId) continue;
    
    const cap = String(r[idx.capacity_max] || "").trim();
    const capMin = String(r[idx.capacity_min] || "").trim();
    const ogImageUrl = String(r[idx.og_image_url] || "").trim();
    return {
      rowIndex: i + 2, // 1-based + header
      id: inviteId,
      title: String(r[idx.title] || ""),
      when_at: String(r[idx.when_at] || ""),
      when_has_time: String(r[idx.when_has_time] || "") === "1",
      confirm_by: String(r[idx.confirm_by] || ""),
      capacity_max: cap ? Number.parseInt(cap, 10) : null,
      capacity_min: capMin ? Number.parseInt(capMin, 10) : 2,
      og_image_url: ogImageUrl || null,
      created_at: String(r[idx.created_at] || ""),
      status: String(r[idx.status] || "OPEN") || "OPEN",
      closed_at: String(r[idx.closed_at] || ""),
      closure_cause: String(r[idx.closure_cause] || ""),
      verdict: String(r[idx.verdict] || ""),
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

