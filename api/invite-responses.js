import { getAccessToken, json } from "./_sheets.js";
import {
  TAB_RESPONSES,
  TAB_VIEWS,
  ensureMvpTabs,
  readAll,
} from "./_mvpStore.js";
import { badRequest, serverError, rowsToObjects } from "./_utils.js";
import { computeStatus, convertMaybeToNoIfExpired } from "./_inviteUtils.js";

const SCOPE_RO = "https://www.googleapis.com/auth/spreadsheets.readonly";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("allow", "GET");
    return json(res, 405, { error: "Method not allowed" });
  }

  const inviteId = typeof req.query?.inviteId === "string" ? req.query.inviteId : "";
  if (!inviteId) return badRequest(res, "Missing inviteId");

  const isOrganizer = req.query?.is_organizer === "1";

  try {
    await getAccessToken(SCOPE_RO);
    await ensureMvpTabs();

    // Ne jamais charger TAB_INVITES : toutes les infos sont disponibles dans l'URL
    const promises = [readAll(TAB_RESPONSES, 10000)];
    if (isOrganizer) {
      promises.push(readAll(TAB_VIEWS, 10000));
    }
    const results = await Promise.all(promises);
    const responsesRows = results[0];
    const viewsRows = isOrganizer ? results[1] : null;

    // Construire invite depuis les paramètres de l'URL (toujours disponibles)
    const confirmBy = req.query.confirm_by;
    const capacityMax = req.query.capacity_max === "" ? null : (req.query.capacity_max ? Number.parseInt(req.query.capacity_max, 10) : null);
    const invite = {
      id: inviteId,
      confirm_by: confirmBy,
      capacity_max: capacityMax,
    };
    // title et when_at sont disponibles dans l'URL pour tous les utilisateurs
    if (req.query.title && req.query.when_at) {
      invite.title = req.query.title;
      invite.when_at = req.query.when_at;
      invite.when_has_time = req.query.when_has_time === "1";
    }

    const { idx: rIdx, rows: rData } = rowsToObjects(responsesRows);
    const responsesForInvite = rData
      .filter((r) => String(r[rIdx.invite_id] || "") === inviteId)
      .map((r) => ({
        anon_device_id: String(r[rIdx.anon_device_id] || ""),
        name: String(r[rIdx.name] || ""),
        choice: String(r[rIdx.choice] || ""),
        created_at: String(r[rIdx.created_at] || ""),
      }));

    const now = new Date();
    
    // Compter les réponses
    let yes = 0;
    let no = 0;
    let maybe = 0;
    for (const r of responsesForInvite) {
      if (r.choice === "YES") yes += 1;
      if (r.choice === "NO") no += 1;
      if (r.choice === "MAYBE") maybe += 1;
    }

    // Calculer le statut AVANT la conversion MAYBE->NO
    const status = computeStatus(invite, yes, now);

    const conv = convertMaybeToNoIfExpired(invite, now, { yes, no, maybe });
    const participants = responsesForInvite
      .filter((r) => r.choice === "YES")
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
      .map((r) => r.name)
      .filter((n) => n.trim().length > 0);

    // Calculer les vues uniques (seulement si organisateur)
    let uniqueViews = 0;
    if (isOrganizer && viewsRows) {
      const { idx: vIdx, rows: vData } = rowsToObjects(viewsRows);
      const viewsSet = new Set(
        vData
          .filter((r) => String(r[vIdx.invite_id] || "") === inviteId)
          .map((r) => String(r[vIdx.anon_device_id] || "")),
      );
      uniqueViews = viewsSet.size;
    }

    const anonDeviceId = typeof req.query?.anon_device_id === "string" ? req.query.anon_device_id : "";
    let myChoice = null;
    let myName = null;
    if (anonDeviceId) {
      const mine = responsesForInvite.find((r) => r.anon_device_id === anonDeviceId);
      if (mine) {
        myChoice = mine.choice;
        myName = mine.name;
      }
    }

    return json(res, 200, {
      invite: {
        id: invite.id,
        title: invite.title,
        when_at: invite.when_at,
        when_has_time: invite.when_has_time,
        confirm_by: invite.confirm_by,
        capacity_max: invite.capacity_max,
      },
      status: status.status,
      closure_cause: status.closureCause,
      counts: {
        views: uniqueViews,
        yes: conv.yes,
        no: conv.no,
        maybe: conv.maybe,
      },
      participants,
      hasAnyResponse: responsesForInvite.length > 0,
      my: anonDeviceId ? { choice: myChoice, name: myName } : null,
    });
  } catch (e) {
    return serverError(res, "Get responses failed", e instanceof Error ? e.message : String(e));
  }
}

