async function readJsonSafe(resp) {
  try {
    return await resp.json();
  } catch {
    return null;
  }
}

async function requestJson(path, { method, body, query }) {
  const url = new URL(path, window.location.origin);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === null || v === undefined) continue;
      url.searchParams.set(k, String(v));
    }
  }

  const resp = await fetch(url.toString(), {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await readJsonSafe(resp);
  if (!resp.ok) {
    const message = data?.error || `HTTP ${resp.status}`;
    const err = new Error(message);
    err.code = data?.error || resp.status;
    err.status = resp.status;
    err.details = data?.details || null;
    throw err;
  }
  if (!data) throw new Error("Réponse serveur invalide.");
  return data;
}

export async function createInvite(payload) {
  return await requestJson("/api/invites", { method: "POST", body: { op: "create", ...payload } });
}

export async function recordView(inviteId, anonDeviceId) {
  return await requestJson("/api/invite", {
    method: "POST",
    body: { op: "view", inviteId, anon_device_id: anonDeviceId },
  });
}

export async function respond(inviteId, anonDeviceId, name, choice) {
  return await requestJson("/api/invite", {
    method: "POST",
    body: { op: "respond", inviteId, anon_device_id: anonDeviceId, name, choice },
  });
}

export async function getInviteResponses(inviteId, anonDeviceId, isOrganizer = false, basicInfo = null) {
  const query = { 
    inviteId, 
    anon_device_id: anonDeviceId || undefined,
    is_organizer: isOrganizer ? "1" : undefined,
  };
  // Passer les infos de base depuis l'URL (guests) ou le cache (organisateur) pour éviter de charger TAB_INVITES
  if (basicInfo) {
    query.confirm_by = basicInfo.confirm_by;
    query.capacity_max = basicInfo.capacity_max !== null ? String(basicInfo.capacity_max) : "";
    // Pour l'organisateur, passer aussi title et when_at pour l'affichage
    if (isOrganizer && basicInfo.title && basicInfo.when_at) {
      query.title = basicInfo.title;
      query.when_at = basicInfo.when_at;
      query.when_has_time = basicInfo.when_has_time ? "1" : "0";
    }
  }
  return await requestJson("/api/invite-responses", {
    method: "GET",
    query,
  });
}

export async function exportAll() {
  return await requestJson("/api/invites", { method: "GET", query: { kind: "all" } });
}


