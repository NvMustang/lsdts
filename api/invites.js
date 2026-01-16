import { json } from "./_sheets.js";
import { appendInvite, appendLog, appendResponse, ensureMvpTabs, readAll, updateInviteRowById } from "./_mvpStore.js";
import { badRequest, serverError, randomId, offsetToMs, parseBody, normalizeName, nowIso } from "./_utils.js";
import { computeStatus, computeVerdict } from "./_inviteUtils.js";

function clampInt(n, min, max) {
  const x = Number.parseInt(String(n), 10);
  if (Number.isNaN(x)) return null;
  return Math.min(max, Math.max(min, x));
}


function parseLocalDateTimeLocalString(value) {
  // value: YYYY-MM-DDTHH:MM (heure locale depuis le frontend)
  const s = String(value || "");
  const parts = s.split("T");
  if (parts.length !== 2) return { error: "Invalid datetime" };
  const [dateStr, timeStr] = parts;
  const [y, m, d] = dateStr.split("-").map((x) => Number.parseInt(x, 10));
  const [hh, mm] = timeStr.split(":").map((x) => Number.parseInt(x, 10));
  if (!y || !m || !d || !Number.isFinite(hh) || !Number.isFinite(mm)) return { error: "Invalid datetime" };
  // Minutes doivent être 00 ou 30 (correspond au picker)
  if (!(mm === 0 || mm === 30)) return { error: "Invalid datetime" };
  // Parser comme heure locale (système)
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
  
  // Valider le format (parse pour vérifier, mais on garde la string originale)
  const whenParsed = parseLocalDateTimeLocalString(whenAtLocal);
  if (whenParsed.error) return badRequest(res, whenParsed.error);

  if (!within7Days(whenParsed.date, now)) return badRequest(res, "Quand out of range");
  
  // Valider que l'événement est au minimum à "now arrondi à 30 min sup + 30 min"
  // Pour laisser au minimum 30 min aux guests pour répondre
  const currentMinute = now.getMinutes();
  const currentHour = now.getHours();
  let roundedMin = Math.ceil((currentMinute + 1) / 30) * 30;
  let roundedH = currentHour;
  if (roundedMin >= 60) {
    roundedMin = 0;
    roundedH += 1;
  }
  const nowRounded = new Date(now);
  nowRounded.setHours(roundedH, roundedMin, 0, 0);
  const minTimeForGuests = 30 * 60 * 1000; // 30 min
  const minEventDate = new Date(nowRounded.getTime() + minTimeForGuests);
  
  if (whenParsed.date.getTime() < minEventDate.getTime()) {
    return badRequest(res, "L'événement doit être au minimum dans 30 minutes après l'heure actuelle arrondie.");
  }

  const offsetMs = offsetToMs(confirmOffset);
  if (offsetMs === null) return badRequest(res, "Invalid confirmation offset");

  const confirmByDate = new Date(whenParsed.date.getTime() - offsetMs);
  // Pour "immediate", confirmBy = when_at, donc toujours valide si when_at est dans le futur
  if (confirmOffset !== "immediate" && confirmByDate.getTime() < now.getTime()) {
    return badRequest(res, "Confirmation invalide.");
  }

  // Calculer confirm_by en string (format heure locale)
  const formatDateLocal = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const da = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${y}-${m}-${da}T${hh}:${mm}`;
  };
  const confirmByLocal = formatDateLocal(confirmByDate);

      let capacityMax = null;
      if (body.capacity_max !== null && body.capacity_max !== undefined && String(body.capacity_max).trim() !== "") {
        capacityMax = clampInt(body.capacity_max, 2, 20);
        if (capacityMax === null) return badRequest(res, "Invalid capacity");
      }

      // capacityMin : valeur par défaut 2, minimum 2
      let capacityMin = 2;
      if (body.capacity_min !== null && body.capacity_min !== undefined && String(body.capacity_min).trim() !== "") {
        const parsed = clampInt(body.capacity_min, 2, 100);
        if (parsed === null) return badRequest(res, "Invalid capacity_min");
        capacityMin = parsed;
      }

      // Accepter l'ID fourni par le frontend, ou en générer un nouveau
      let inviteId = typeof body.invite_id === "string" && body.invite_id.length === 32 ? body.invite_id : randomId();
      const createdAt = nowIso();

  // Sauvegarder les dates telles quelles (format YYYY-MM-DDTHH:MM, pas de conversion)
  const inviteRow = [
    inviteId,
    title,
    whenAtLocal, // String originale, pas de conversion
    whenParsed.hasTime ? "1" : "0",
    confirmByLocal, // Format YYYY-MM-DDTHH:MM
    capacityMax === null ? "" : String(capacityMax),
    String(capacityMin),
    createdAt,
    "OPEN",
    "",
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
      confirm_by: confirmByLocal, // Format YYYY-MM-DDTHH:MM, même que when_at
      capacity_max: capacityMax,
      capacity_min: capacityMin,
    };
    const statusResult = computeStatus(inviteForStatus, yesCount, now);
    
    await updateInviteRowById(inviteId, (row, idx) => {
      row[idx.yes_count] = String(yesCount);
      row[idx.first_response_at] = responseCreatedAt;
      // Mettre à jour le statut si nécessaire (CLOSED)
      if (statusResult.status === "CLOSED") {
        row[idx.status] = "CLOSED";
        row[idx.closed_at] = responseCreatedAt;
        row[idx.closure_cause] = statusResult.closureCause || "EXPIRED";
        // Calculer le verdict uniquement à la clôture
        const verdict = computeVerdict(inviteForStatus, yesCount);
        row[idx.verdict] = verdict;
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

