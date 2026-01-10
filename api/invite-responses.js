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

    // Charger TAB_INVITES pour obtenir confirm_by en UTC (nécessaire pour computeStatus)
    // L'URL contient confirm_by en heure locale (pour affichage), mais computeStatus a besoin de l'UTC
    const invitesRows = await readAll(TAB_INVITES, 5000);
    if (!Array.isArray(invitesRows)) {
      throw new Error(`Invalid invitesRows: expected array, got ${typeof invitesRows}`);
    }
    const inviteFromDb = findInviteInRows(invitesRows, inviteId);
    
    // Construire invite depuis les paramètres de l'URL (pour affichage)
    // Décoder l'URL si nécessaire (le serveur devrait le faire, mais on s'assure)
    const confirmByRaw = req.query.confirm_by;
    const confirmByFromUrl = (typeof confirmByRaw === "string" && confirmByRaw.trim()) 
      ? decodeURIComponent(confirmByRaw.trim()) 
      : null;
    const capacityMaxRaw = req.query.capacity_max;
    const capacityMax = (capacityMaxRaw === "" || !capacityMaxRaw || capacityMaxRaw === "undefined" || capacityMaxRaw === "null") 
      ? null 
      : Number.parseInt(String(capacityMaxRaw), 10);
    
    // Pour computeStatus : utiliser confirm_by depuis la base de données (UTC)
    // Pour l'affichage : utiliser confirm_by depuis l'URL (heure locale)
    const inviteForStatus = {
      id: inviteId,
      confirm_by: inviteFromDb?.confirm_by || confirmByFromUrl,
      capacity_max: Number.isNaN(capacityMax) ? null : capacityMax,
    };
    
    const inviteForDisplay = {
      id: inviteId,
      confirm_by: confirmByFromUrl || inviteFromDb?.confirm_by,
      capacity_max: Number.isNaN(capacityMax) ? null : capacityMax,
    };
    // title et when_at sont disponibles dans l'URL pour tous les utilisateurs
    if (req.query.title && req.query.when_at) {
      inviteForDisplay.title = String(req.query.title);
      inviteForDisplay.when_at = String(req.query.when_at);
      inviteForDisplay.when_has_time = req.query.when_has_time === "1";
    }
    
    // Vérifier que confirm_by est défini (requis pour computeStatus)
    if (!inviteForStatus.confirm_by) {
      throw new Error(`Missing confirm_by. Received from DB: ${inviteFromDb?.confirm_by || "null"}, from URL: ${confirmByFromUrl || "null"}, query: ${JSON.stringify(req.query)}`);
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
    // Utiliser inviteForStatus avec confirm_by en UTC
    const status = computeStatus(inviteForStatus, yes, now);

    const conv = convertMaybeToNoIfExpired(inviteForStatus, now, { yes, no, maybe });
    
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
    // inviteFromDb est déjà chargé plus haut
    let verdict = null;
    if (isClosed && inviteFromDb) {
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
    
    // Initialiser views (calculé uniquement pour l'organisateur)
    let views = null;
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
    // Utiliser inviteForDisplay avec confirm_by en heure locale (pour affichage)
    const response = {
      invite: {
        id: inviteForDisplay.id,
        title: inviteForDisplay.title,
        when_at: inviteForDisplay.when_at,
        when_has_time: inviteForDisplay.when_has_time,
        confirm_by: inviteForDisplay.confirm_by,
        capacity_max: inviteForDisplay.capacity_max,
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

