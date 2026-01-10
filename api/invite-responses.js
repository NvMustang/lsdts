import { getAccessToken, json } from "./_sheets.js";
import {
  TAB_INVITES,
  TAB_RESPONSES,
  TAB_VIEWS,
  ensureMvpTabs,
  readAll,
} from "./_mvpStore.js";
import { badRequest, serverError, rowsToObjects, findInviteInRows } from "./_utils.js";
import { computeStatus, convertMaybeToNoIfExpired, computeVerdict } from "./_inviteUtils.js";

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
    // ensureMvpTabs() nécessite SCOPE_RW, mais on peut l'appeler avant getAccessToken(SCOPE_RO)
    // car il gère son propre token en interne
    await ensureMvpTabs();
    await getAccessToken(SCOPE_RO);

    // Construire invite depuis les paramètres de l'URL (toujours disponibles)
    const confirmBy = typeof req.query.confirm_by === "string" && req.query.confirm_by ? req.query.confirm_by : null;
    const capacityMax = req.query.capacity_max === "" || !req.query.capacity_max ? null : Number.parseInt(req.query.capacity_max, 10);
    const invite = {
      id: inviteId,
      confirm_by: confirmBy,
      capacity_max: Number.isNaN(capacityMax) ? null : capacityMax,
    };
    // title et when_at sont disponibles dans l'URL pour tous les utilisateurs
    if (req.query.title && req.query.when_at) {
      invite.title = String(req.query.title);
      invite.when_at = String(req.query.when_at);
      invite.when_has_time = req.query.when_has_time === "1";
    }
    
    // Vérifier que confirm_by est défini (requis pour computeStatus)
    if (!invite.confirm_by) {
      throw new Error(`Missing confirm_by in query parameters. Received: ${JSON.stringify(req.query)}`);
    }

    // Charger uniquement TAB_RESPONSES pour calculer le statut
    const responsesRows = await readAll(TAB_RESPONSES, 10000);
    
    // Vérifier que responsesRows est un tableau valide
    if (!Array.isArray(responsesRows)) {
      throw new Error(`Invalid responsesRows: expected array, got ${typeof responsesRows}`);
    }

    let rIdx, rData;
    try {
      const parsed = rowsToObjects(responsesRows);
      rIdx = parsed.idx;
      rData = parsed.rows;
    } catch (e) {
      throw new Error(`Failed to parse responsesRows: ${e instanceof Error ? e.message : String(e)}`);
    }
    // Une seule réponse par utilisateur (les modifications MAYBE -> YES/NO écrasent la réponse précédente)
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
    
    const anonDeviceId = typeof req.query?.anon_device_id === "string" ? req.query.anon_device_id : "";
    const isOrganizer = req.query?.is_organizer === "1";
    
    // Filtrer les réponses par type et construire les listes
    const yesResponses = responsesForInvite.filter((r) => r.choice === "YES");
    const participants = yesResponses
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
      .map((r) => {
        const name = String(r.name || "").trim();
        return name;
      })
      .filter((n) => n.length > 0);
    
    // Pour l'organisateur, construire aussi les listes NO et MAYBE
    const noResponses = responsesForInvite.filter((r) => r.choice === "NO");
    const noNames = noResponses
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
      .map((r) => {
        const name = String(r.name || "").trim();
        return name;
      })
      .filter((n) => n.length > 0);
    
    const maybeResponses = responsesForInvite.filter((r) => r.choice === "MAYBE");
    const maybeNames = maybeResponses
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
      .map((r) => {
        const name = String(r.name || "").trim();
        return name;
      })
      .filter((n) => n.length > 0);
    
    // Debug: vérifier si l'organisateur est dans les réponses YES
    if (isOrganizer) {
      const organizerDeviceId = `organizer_${inviteId}`;
      const organizerInYes = yesResponses.find((r) => r.anon_device_id === organizerDeviceId);
      if (organizerInYes) {
        console.log(`[invite-responses] Organisateur trouvé dans YES: name="${organizerInYes.name}", trimmed="${String(organizerInYes.name || "").trim()}"`);
      } else {
        console.log(`[invite-responses] Organisateur NON trouvé dans YES. Total YES: ${yesResponses.length}`);
      }
    }
    
    // Pour l'organisateur, chercher sa réponse avec l'ID spécial organizer_${inviteId}
    const organizerDeviceId = `organizer_${inviteId}`;
    const organizerResponse = responsesForInvite.find((r) => r.anon_device_id === organizerDeviceId);
    
    let myChoice = null;
    let myName = null;
    const isResponding = anonDeviceId && responsesForInvite.some((r) => r.anon_device_id === anonDeviceId);
    if (isResponding) {
      const mine = responsesForInvite.find((r) => r.anon_device_id === anonDeviceId);
      if (mine) {
        myChoice = mine.choice;
        myName = mine.name;
      }
    } else if (isOrganizer && organizerResponse) {
      // L'organisateur est toujours considéré comme répondant (YES automatique)
      myChoice = organizerResponse.choice;
      myName = organizerResponse.name;
    }

    // Règles de visibilité P0_02
    const isOpen = status.status === "OPEN";
    const isClosed = status.status === "CLOSED";
    
    // Utiliser le verdict stocké dans la base de données si CLOSED
    // Charger TAB_INVITES si nécessaire (CLOSED) et TAB_VIEWS si organisateur
    let verdict = null;
    let views = null;
    if (isClosed) {
      // Charger TAB_INVITES pour obtenir capacity_min et verdict (CLOSED)
      const invitesRows = await readAll(TAB_INVITES, 5000);
      if (!Array.isArray(invitesRows)) {
        throw new Error(`Invalid invitesRows: expected array, got ${typeof invitesRows}`);
      }
      const inviteFromDb = findInviteInRows(invitesRows, inviteId);
      if (inviteFromDb?.verdict) {
        // Utiliser le verdict stocké (calculé à la clôture)
        verdict = inviteFromDb.verdict;
      } else {
        // Cas edge : invitation CLOSED sans verdict (anciennes invitations)
        // Calculer le verdict une fois
        const capacityMin = inviteFromDb?.capacity_min ?? 2;
        verdict = computeVerdict({ capacity_min: capacityMin }, conv.yes);
      }
    }
    if (isOrganizer) {
      // Calculer le nombre de vues uniques depuis TAB_VIEWS (backend uniquement)
      const viewsRows = await readAll(TAB_VIEWS, 10000);
      if (!Array.isArray(viewsRows)) {
        throw new Error(`Invalid viewsRows: expected array, got ${typeof viewsRows}`);
      }
      const { idx: vIdx, rows: vData } = rowsToObjects(viewsRows);
      const uniqueViews = new Set(
        vData
          .filter((r) => String(r[vIdx.invite_id] || "") === inviteId)
          .map((r) => String(r[vIdx.anon_device_id] || "")),
      );
      views = uniqueViews.size;
    }

    // Construire la réponse selon les règles de visibilité
    const response = {
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
    };

    // Déterminer si l'utilisateur doit voir les participants
    const shouldShowParticipants = isResponding || isOrganizer || isClosed;

    // OPEN — utilisateur non-répondant
    if (isOpen && !shouldShowParticipants) {
      // Seulement: titre, deadline, "X positions prises"
      response.total_positions = responsesForInvite.length;
      // Ne pas retourner: counts détaillés, participants, views
    }
    // OPEN — utilisateur répondant ou organisateur
    else if (isOpen && shouldShowParticipants) {
      // Liste YES uniquement
      response.participants = participants;
      response.my = { choice: myChoice, name: myName };
      // Retourner total_positions pour tous les utilisateurs répondants
      response.total_positions = responsesForInvite.length;
      // Pour l'organisateur, retourner aussi les counts détaillés et les listes (P0_02)
      if (isOrganizer) {
        response.counts = {
          yes: conv.yes,
          no: conv.no,
          maybe: conv.maybe,
          views: views || 0,
        };
        response.no_names = noNames;
        response.maybe_names = maybeNames;
      }
    }
    // CLOSED — tous utilisateurs
    else if (isClosed) {
      // Verdict + liste YES uniquement
      response.verdict = verdict;
      response.participants = participants;
      if (shouldShowParticipants) {
        response.my = { choice: myChoice, name: myName };
      }
      // Pour l'organisateur, retourner aussi les counts détaillés et les listes (P0_02)
      if (isOrganizer) {
        response.counts = {
          yes: conv.yes,
          no: conv.no,
          maybe: conv.maybe,
          views: views || 0,
        };
        response.no_names = noNames;
        response.maybe_names = maybeNames;
      }
    }

    return json(res, 200, response);
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    const errorStack = e instanceof Error ? e.stack : undefined;
    console.error("[invite-responses] Error:", {
      inviteId,
      isOrganizer,
      error: errorMessage,
      stack: errorStack,
    });
    return serverError(res, "Get responses failed", errorMessage);
  }
}

