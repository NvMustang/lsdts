async function readJsonSafe(resp) {
  try {
    return await resp.json();
  } catch (parseError) {
    console.error("[API] Erreur de parsing JSON:", {
      status: resp.status,
      statusText: resp.statusText,
      url: resp.url,
      error: parseError instanceof Error ? parseError.message : String(parseError),
    });
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

  const fullUrl = url.toString();
  const requestInfo = {
    method,
    path,
    url: fullUrl,
    hasBody: !!body,
    queryKeys: query ? Object.keys(query) : [],
  };

  console.log("[API] Requête:", requestInfo);

  let resp;
  try {
    resp = await fetch(fullUrl, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (networkError) {
    const err = new Error(`Erreur réseau: ${networkError instanceof Error ? networkError.message : String(networkError)}`);
    err.type = "NETWORK_ERROR";
    err.originalError = networkError;
    err.requestInfo = requestInfo;
    console.error("[API] Erreur réseau:", {
      ...requestInfo,
      error: networkError instanceof Error ? {
        message: networkError.message,
        name: networkError.name,
        stack: networkError.stack,
      } : String(networkError),
    });
    throw err;
  }

  const data = await readJsonSafe(resp);
  
  if (!resp.ok) {
    const message = data?.error || `HTTP ${resp.status}`;
    const err = new Error(message);
    err.type = "HTTP_ERROR";
    err.code = data?.error || resp.status;
    err.status = resp.status;
    err.statusText = resp.statusText;
    err.details = data?.details || null;
    err.requestInfo = requestInfo;
    err.responseData = data;
    console.error("[API] Erreur HTTP:", {
      ...requestInfo,
      status: resp.status,
      statusText: resp.statusText,
      error: message,
      details: data?.details,
      responseData: data,
    });
    throw err;
  }
  
  if (!data) {
    const err = new Error("Réponse serveur invalide (pas de JSON)");
    err.type = "INVALID_RESPONSE";
    err.status = resp.status;
    err.requestInfo = requestInfo;
    console.error("[API] Réponse invalide:", {
      ...requestInfo,
      status: resp.status,
      statusText: resp.statusText,
    });
    throw err;
  }
  
  console.log("[API] Succès:", {
    method,
    path,
    status: resp.status,
  });
  
  return data;
}

export async function createInvite(payload) {
  try {
    return await requestJson("/api/invites", { method: "POST", body: { op: "create", ...payload } });
  } catch (err) {
    console.error("[API] createInvite échoué:", {
      payload: { ...payload, organizer_name: payload.organizer_name ? "[présent]" : "[absent]" },
      error: {
        type: err.type,
        message: err.message,
        status: err.status,
        code: err.code,
        details: err.details,
      },
    });
    throw err;
  }
}

export async function recordView(inviteId, anonDeviceId) {
  try {
    return await requestJson("/api/invite", {
      method: "POST",
      body: { op: "view", inviteId, anon_device_id: anonDeviceId },
    });
  } catch (err) {
    console.error("[API] recordView échoué:", {
      inviteId,
      anonDeviceId: anonDeviceId ? "[présent]" : "[absent]",
      error: {
        type: err.type,
        message: err.message,
        status: err.status,
        code: err.code,
        details: err.details,
      },
    });
    throw err;
  }
}

export async function respond(inviteId, anonDeviceId, name, choice) {
  try {
    return await requestJson("/api/invite", {
      method: "POST",
      body: { op: "respond", inviteId, anon_device_id: anonDeviceId, name, choice },
    });
  } catch (err) {
    console.error("[API] respond échoué:", {
      inviteId,
      anonDeviceId: anonDeviceId ? "[présent]" : "[absent]",
      name: name ? "[présent]" : "[absent]",
      choice,
      error: {
        type: err.type,
        message: err.message,
        status: err.status,
        code: err.code,
        details: err.details,
      },
    });
    throw err;
  }
}

export async function getInviteResponses(inviteId, anonDeviceId, isOrganizer = false, basicInfo = null) {
  const query = { 
    inviteId, 
    anon_device_id: anonDeviceId || undefined,
    is_organizer: isOrganizer ? "1" : undefined,
  };
  // Passer les infos de base depuis l'URL pour éviter de charger TAB_INVITES
  if (basicInfo) {
    query.confirm_by = basicInfo.confirm_by;
    query.capacity_max = basicInfo.capacity_max !== null ? String(basicInfo.capacity_max) : "";
    // Passer title et when_at pour tous les utilisateurs (disponibles dans l'URL)
    if (basicInfo.title && basicInfo.when_at) {
      query.title = basicInfo.title;
      query.when_at = basicInfo.when_at;
      query.when_has_time = basicInfo.when_has_time ? "1" : "0";
    }
  }
  try {
    return await requestJson("/api/invite-responses", {
      method: "GET",
      query,
    });
  } catch (err) {
    console.error("[API] getInviteResponses échoué:", {
      inviteId,
      anonDeviceId: anonDeviceId ? "[présent]" : "[absent]",
      isOrganizer,
      hasBasicInfo: !!basicInfo,
      queryKeys: Object.keys(query),
      error: {
        type: err.type,
        message: err.message,
        status: err.status,
        code: err.code,
        details: err.details,
      },
    });
    throw err;
  }
}

