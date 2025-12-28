import { getAccessToken, json } from "./_sheets.js";
import {
  TAB_INVITES,
  TAB_LOGS,
  TAB_RESPONSES,
  TAB_VIEWS,
  appendLog,
  appendResponse,
  appendView,
  ensureMvpTabs,
  readAll,
  updateInviteRowById,
} from "./_mvpStore.js";
import { badRequest, serverError, parseBody, normalizeName, nowIso, randomId, rowsToObjects, findInviteInRows } from "./_utils.js";
import { computeStatus, convertMaybeToNoIfExpired } from "./_inviteUtils.js";

const SCOPE_RW = "https://www.googleapis.com/auth/spreadsheets";
const SCOPE_RO = "https://www.googleapis.com/auth/spreadsheets.readonly";


function parseChoice(choice) {
  const c = String(choice || "").toUpperCase();
  if (c === "YES" || c === "NO" || c === "MAYBE") return c;
  return null;
}

async function computeStats(inviteId) {
  await ensureMvpTabs();
  // Paralléliser les 3 lectures
  const [invitesRows, viewsRows, responsesRows] = await Promise.all([
    readAll(TAB_INVITES, 5000),
    readAll(TAB_VIEWS, 10000),
    readAll(TAB_RESPONSES, 10000),
  ]);

  const invite = findInviteInRows(invitesRows, inviteId);
  if (!invite) return { error: "not_found" };

  const now = new Date();
  const status = computeStatus(invite, invite.yes_count || 0, now);

  const { idx: vIdx, rows: vData } = rowsToObjects(viewsRows);
  const uniqueViews = new Set(
    vData
      .filter((r) => String(r[vIdx.invite_id] || "") === inviteId)
      .map((r) => String(r[vIdx.anon_device_id] || "")),
  );

  const { idx: rIdx, rows: rData } = rowsToObjects(responsesRows);
  const responsesForInvite = rData
    .filter((r) => String(r[rIdx.invite_id] || "") === inviteId)
    .map((r) => ({
      anon_device_id: String(r[rIdx.anon_device_id] || ""),
      name: String(r[rIdx.name] || ""),
      choice: String(r[rIdx.choice] || ""),
      created_at: String(r[rIdx.created_at] || ""),
    }));

  let yes = 0;
  let no = 0;
  let maybe = 0;
  for (const r of responsesForInvite) {
    if (r.choice === "YES") yes += 1;
    if (r.choice === "NO") no += 1;
    if (r.choice === "MAYBE") maybe += 1;
  }

  const conv = convertMaybeToNoIfExpired(invite, now, { yes, no, maybe });
  const participants = responsesForInvite
    .filter((r) => r.choice === "YES")
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
    .map((r) => r.name)
    .filter((n) => n.trim().length > 0);

  const hasAnyResponse = responsesForInvite.length > 0;

  return {
    invite: {
      id: invite.id,
      title: invite.title,
      when_at: invite.when_at,
      when_has_time: invite.when_has_time,
      confirm_by: invite.confirm_by,
      capacity_max: invite.capacity_max,
      created_at: invite.created_at,
    },
    status: status.status,
    closure_cause: status.closureCause,
    counts: {
      views: uniqueViews.size,
      yes: conv.yes,
      no: conv.no,
      maybe: conv.maybe,
    },
    participants,
    hasAnyResponse,
    // Exposer responsesRows pour éviter la double lecture
    _responsesRows: responsesRows,
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("allow", "POST");
    return json(res, 405, { error: "Method not allowed" });
  }

  const body = parseBody(req);
  if (!body) return badRequest(res, "Invalid JSON body");

  const op = typeof body.op === "string" ? body.op : "";
  const inviteId = typeof body.inviteId === "string" ? body.inviteId : "";
  if (!inviteId) return badRequest(res, "Missing inviteId");

  try {
    await ensureMvpTabs();
    await getAccessToken(SCOPE_RW);

    if (op === "view") {
      const anonDeviceId = typeof body.anon_device_id === "string" ? body.anon_device_id : "";
      if (!anonDeviceId) return badRequest(res, "Missing anon_device_id");

      const viewsRows = await readAll(TAB_VIEWS, 10000);
      const { idx, rows } = rowsToObjects(viewsRows);
      const already = rows.some(
        (r) =>
          String(r[idx.invite_id] || "") === inviteId &&
          String(r[idx.anon_device_id] || "") === anonDeviceId,
      );

      if (!already) {
        await appendView([inviteId, anonDeviceId, nowIso()]);
        await appendLog({ type: "first_view_at", inviteId, anonDeviceId, payload: {} });

        // Update invite row aggregates (best-effort).
        await updateInviteRowById(inviteId, (row, idx) => {
          const firstViewAt = row[idx.first_view_at] || "";
          if (!firstViewAt) row[idx.first_view_at] = nowIso();
          const current = Number.parseInt(row[idx.view_count_unique] || "0", 10) || 0;
          row[idx.view_count_unique] = String(current + 1);
          return row;
        });
      }
      return json(res, 200, { ok: true, recorded: !already });
    }

    if (op === "respond") {
      const anonDeviceId = typeof body.anon_device_id === "string" ? body.anon_device_id : "";
      const name = normalizeName(body.name);
      const choice = parseChoice(body.choice);
      if (!anonDeviceId) return badRequest(res, "Missing anon_device_id");
      if (!name) return badRequest(res, "Missing name");
      if (!choice) return badRequest(res, "Invalid choice");

      const stats = await computeStats(inviteId);
      if (stats.error === "not_found") return json(res, 404, { error: "Not found" });

      // Enforce closure rules (restrictive)
      if (stats.status === "FULL") {
        return json(res, 409, { error: "FULL" });
      }
      if (stats.status === "CLOSED") {
        return json(res, 409, { error: "CLOSED" });
      }

      // One response per device per invite.
      const responsesRows = await readAll(TAB_RESPONSES, 10000);
      const { idx, rows } = rowsToObjects(responsesRows);
      const existing = rows.some(
        (r) =>
          String(r[idx.invite_id] || "") === inviteId &&
          String(r[idx.anon_device_id] || "") === anonDeviceId,
      );
      if (existing) return json(res, 409, { error: "ALREADY_RESPONDED" });

      // Capacity: refuse new YES if would exceed.
      if (choice === "YES" && stats.invite.capacity_max !== null) {
        if (stats.counts.yes >= stats.invite.capacity_max) return json(res, 409, { error: "FULL" });
      }

      const responseId = randomId();
      const createdAt = nowIso();
      await appendResponse([responseId, inviteId, anonDeviceId, name, choice, createdAt]);
      await appendLog({
        type: "first_response_at",
        inviteId,
        anonDeviceId,
        payload: { response_choice: choice },
      });

      // Update aggregates on invite row (best-effort).
      const after = await computeStats(inviteId);
      const deltaMs = (() => {
        const createdIso = after.invite?.created_at || "";
        if (!createdIso) return "";
        const d = new Date(createdAt).getTime() - new Date(createdIso).getTime();
        if (!Number.isFinite(d) || d < 0) return "";
        return String(d);
      })();

      await updateInviteRowById(inviteId, (row, idx) => {
        if (!row[idx.first_response_at]) row[idx.first_response_at] = createdAt;
        if (deltaMs && !row[idx.response_time_delta_ms]) row[idx.response_time_delta_ms] = deltaMs;
        row[idx.yes_count] = String(after.counts.yes);
        row[idx.no_count] = String(after.counts.no);
        row[idx.maybe_count] = String(after.counts.maybe);

        const st = after.status;
        if (st === "FULL" || st === "CLOSED") {
          row[idx.status] = st;
          if (!row[idx.closed_at]) row[idx.closed_at] = createdAt;
          row[idx.closure_cause] = after.closure_cause || (st === "FULL" ? "FULL" : "EXPIRED");
        }
        return row;
      });

      return json(res, 200, { ok: true });
    }

    return badRequest(res, "Invalid op");
  } catch (e) {
    return serverError(res, "Post failed", e instanceof Error ? e.message : String(e));
  }
}


