import { json } from "./_sheets.js";
import { appendInvite, appendLog, appendResponse, ensureMvpTabs, readAll, updateInviteRowById } from "./_mvpStore.js";
import { badRequest, serverError, randomId, offsetToMs, parseBody, normalizeName, nowIso, dateToIsoLocal } from "./_utils.js";
import { computeStatus } from "./_inviteUtils.js";

function clampInt(n, min, max) {
  const x = Number.parseInt(String(n), 10);
  if (Number.isNaN(x)) return null;
  return Math.min(max, Math.max(min, x));
}


function parseLocalDateTimeLocalString(value) {
  // value: YYYY-MM-DDTHH:MM
  const s = String(value || "");
  const parts = s.split("T");
  if (parts.length !== 2) return { error: "Invalid datetime" };
  const [dateStr, timeStr] = parts;
  const [y, m, d] = dateStr.split("-").map((x) => Number.parseInt(x, 10));
  const [hh, mm] = timeStr.split(":").map((x) => Number.parseInt(x, 10));
  if (!y || !m || !d || !Number.isFinite(hh) || !Number.isFinite(mm)) return { error: "Invalid datetime" };
  // Strict: minutes must be 00 or 30.
  if (!(mm === 0 || mm === 30)) return { error: "Invalid datetime" };
  const dt = new Date(y, m - 1, d, hh, mm, 0, 0);
  if (Number.isNaN(dt.getTime())) return { error: "Invalid datetime" };
  return { date: dt, hasTime: true };
}

function within7Days(date, now) {
  const max = new Date(now);
  max.setDate(max.getDate() + 7);
  return date.getTime() <= max.getTime();
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    // Export logs/tables (JSON)
    const kind = typeof req.query?.kind === "string" ? req.query.kind : "all";
    try {
      await ensureMvpTabs();
      const invites = await readAll("invites");
      const views = await readAll("views");
      const responses = await readAll("responses");
      const logs = await readAll("logs");
      const payload = { invites, views, responses, logs };
      return json(res, 200, kind === "all" ? payload : payload[kind] || null);
    } catch (e) {
      return serverError(res, "Export failed", e instanceof Error ? e.message : String(e));
    }
  }

  if (req.method !== "POST") {
    res.setHeader("allow", "GET, POST");
    return json(res, 405, { error: "Method not allowed" });
  }

  const body = parseBody(req);
  if (!body) return badRequest(res, "Invalid JSON body");

  const op = typeof body.op === "string" ? body.op : "create";
  if (op !== "create") return badRequest(res, "Invalid op");

  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) return badRequest(res, "Missing Quoi");
  if (title.length > 40) return badRequest(res, "Quoi too long");

  const organizerName = typeof body.organizer_name === "string" ? normalizeName(body.organizer_name) : null;
  if (!organizerName) return badRequest(res, "Missing organizer name");

  const whenAtLocal = typeof body.when_at_local === "string" ? body.when_at_local : "";
  const confirmOffset = typeof body.confirm_offset === "string" ? body.confirm_offset : "";

  const now = new Date();
  if (!whenAtLocal) return badRequest(res, "Missing Quand");
  const whenParsed = parseLocalDateTimeLocalString(whenAtLocal);
  if (whenParsed.error) return badRequest(res, whenParsed.error);

  if (!within7Days(whenParsed.date, now)) return badRequest(res, "Quand out of range");

  const offsetMs = offsetToMs(confirmOffset);
  if (offsetMs === null) return badRequest(res, "Invalid confirmation offset");

  const confirmBy = new Date(whenParsed.date.getTime() - offsetMs);
  // Pour "immediate", confirmBy = when_at, donc toujours valide si when_at est dans le futur
  if (confirmOffset !== "immediate" && confirmBy.getTime() < now.getTime()) {
    return badRequest(res, "Confirmation invalide.");
  }

      let capacityMax = null;
      if (body.capacity_max !== null && body.capacity_max !== undefined && String(body.capacity_max).trim() !== "") {
        capacityMax = clampInt(body.capacity_max, 2, 20);
        if (capacityMax === null) return badRequest(res, "Invalid capacity");
      }

      // Accepter l'ID fourni par le frontend, ou en générer un nouveau
      let inviteId = typeof body.invite_id === "string" && body.invite_id.length === 32 ? body.invite_id : randomId();
      const createdAt = new Date().toISOString();

  // Stocker les dates en format local (sans timezone) pour éviter les problèmes de conversion UTC
  const inviteRow = [
    inviteId,
    title,
    dateToIsoLocal(whenParsed.date),
    whenParsed.hasTime ? "1" : "0",
    dateToIsoLocal(confirmBy),
    capacityMax === null ? "" : String(capacityMax),
    createdAt,
    "OPEN",
    "",
    "",
    "0",
    "0",
    "0",
    "0",
    "",
    "",
    "",
  ];

  try {
    await ensureMvpTabs();
    await appendInvite(inviteRow);
    await appendLog({ type: "invite_created", inviteId, payload: { confirm_by: inviteRow[4], when_at: inviteRow[2] } });

    // Créer automatiquement une réponse "YES" pour l'organisateur
    const organizerDeviceId = `organizer_${inviteId}`;
    const responseId = randomId();
    const responseCreatedAt = nowIso();
    await appendResponse([responseId, inviteId, organizerDeviceId, organizerName, "YES", responseCreatedAt]);

    // Mettre à jour les compteurs de l'invitation pour refléter la réponse de l'organisateur
    // yes_count = 1 (l'organisateur compte dans la capacité)
    const yesCount = 1;
    const inviteForStatus = {
      confirm_by: dateToIsoLocal(confirmBy),
      capacity_max: capacityMax,
    };
    const statusResult = computeStatus(inviteForStatus, yesCount, now);
    
    await updateInviteRowById(inviteId, (row, idx) => {
      row[idx.yes_count] = String(yesCount);
      row[idx.first_response_at] = responseCreatedAt;
      // Mettre à jour le statut si nécessaire (ex: capacity_max === 1)
      if (statusResult.status === "FULL") {
        row[idx.status] = "FULL";
        row[idx.closed_at] = responseCreatedAt;
        row[idx.closure_cause] = "FULL";
      }
      return row;
    });

    return json(res, 200, {
      invite: {
        id: inviteId,
        title,
        when_at: inviteRow[2],
        when_has_time: inviteRow[3] === "1",
        confirm_by: inviteRow[4],
        capacity_max: capacityMax,
        created_at: createdAt,
        status: statusResult.status,
      },
      warnings: capacityMax !== null && capacityMax > 6 ? ["capacity_soft_warning"] : [],
    });
  } catch (e) {
    return serverError(res, "Create failed", e instanceof Error ? e.message : String(e));
  }
}

