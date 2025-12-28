// Parse URL params pour invite ou prefill
export function parseUrlParams() {
  const params = new URLSearchParams(window.location.search);
  const m = params.get("m");
  // Si m est null (paramètre absent) ou la chaîne "undefined", retourner undefined
  return {
    inviteId: params.get("inviteId"),
    t: params.get("t"),
    w: params.get("w"),
    c: params.get("c"),
    m: (m !== null && m !== "undefined") ? m : undefined,
  };
}

// Génération d'ID unique
export function generateId() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// LocalStorage - Device ID
export function getAnonDeviceId() {
  const key = "lsdts:anon_device_id";
  const existing = localStorage.getItem(key);
  if (existing && existing.trim()) return existing;
  const id = generateId();
  localStorage.setItem(key, id);
  return id;
}

// LocalStorage - User Name
export function getUserName() {
  return localStorage.getItem("lsdts:user_name") || "";
}

export function saveUserName(name) {
  const normalized = normalizeName(name);
  if (normalized) {
    localStorage.setItem("lsdts:user_name", normalized);
  }
}

// URL / Formatage
export function buildShareUrl(inviteId) {
  return `${window.location.origin}/i/${inviteId}`;
}

export function formatStatus(status) {
  if (status === "LOADING") return "Chargement...";
  if (status === "FULL") return "Complet";
  if (status === "CLOSED") return "Clôturé";
  if (status === "OPEN") return "Ouvert";
  return status;
}

// Formatage de dates
export function formatWhen(invite) {
  if (!invite?.when_at) return "";
  // Essayer d'abord le format local (sans timezone), sinon le format ISO standard
  const d = parseIsoLocal(invite.when_at) || new Date(invite.when_at);
  if (Number.isNaN(d.getTime())) return "";
  const base = d.toLocaleString("fr-FR", { weekday: "short", day: "2-digit", month: "2-digit" });
  if (!invite.when_has_time) return base;
  const time = d.toLocaleString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  return `${base} ${time}`;
}

export function formatConfirm(invite) {
  if (!invite?.confirm_by) return "";
  // Essayer d'abord le format local (sans timezone), sinon le format ISO standard
  const c = parseIsoLocal(invite.confirm_by) || new Date(invite.confirm_by);
  if (Number.isNaN(c.getTime())) return "";
  if (!invite?.when_at) return c.toLocaleString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const w = parseIsoLocal(invite.when_at) || new Date(invite.when_at);
  if (Number.isNaN(w.getTime())) return c.toLocaleString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  
  const sameDay =
    c.getFullYear() === w.getFullYear() && c.getMonth() === w.getMonth() && c.getDate() === w.getDate();
  const time = c.toLocaleString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  
  // Calculer l'offset relatif pour ajouter du contexte
  const deltaMs = w.getTime() - c.getTime();
  const deltaHours = deltaMs / (60 * 60 * 1000);
  const deltaMinutes = deltaMs / (60 * 1000);
  
  let relativeContext = "";
  if (sameDay) {
    // Même jour : afficher l'offset en heures/minutes
    if (deltaMinutes < 60) {
      relativeContext = ` (${Math.round(deltaMinutes)} min avant)`;
    } else if (deltaHours < 24) {
      const hours = Math.round(deltaHours * 10) / 10; // Arrondir à 0.1 h près
      if (hours === Math.floor(hours)) {
        relativeContext = ` (${Math.floor(hours)} h avant)`;
      } else {
        relativeContext = ` (${hours} h avant)`;
      }
    }
  } else {
    // Vérifier si c'est la veille (entre 20h et 24h avant)
    const daysDiff = Math.floor((w.getTime() - c.getTime()) / (24 * 60 * 60 * 1000));
    if (daysDiff === 1) {
      relativeContext = " (la veille)";
    }
  }
  
  if (sameDay) {
    return `${time}${relativeContext}`;
  }
  const date = c.toLocaleString("fr-FR", { day: "2-digit", month: "2-digit" });
  return `${date} ${time}${relativeContext}`;
}

export function formatClosure(date) {
  const day = date.toLocaleString("fr-FR", { weekday: "short" });
  const time = date.toLocaleString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  return `${day} ${time}`;
}

// Conversion Date ↔ string
export function dateToWhenAtLocal(date) {
  if (!date) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const da = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${da}T${hh}:${mm}`;
}

// Convertit une Date en format ISO local (sans timezone) pour éviter les problèmes de conversion UTC
// Format: YYYY-MM-DDTHH:MM:SS (sans le Z final)
export function dateToIsoLocal(date) {
  if (!date) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const da = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${y}-${m}-${da}T${hh}:${mm}:${ss}`;
}

// Parse une date ISO locale (sans timezone) en Date, en l'interprétant comme heure locale
// Accepte les formats: YYYY-MM-DDTHH:MM:SS ou YYYY-MM-DDTHH:MM
export function parseIsoLocal(isoString) {
  if (!isoString) return null;
  const s = String(isoString).trim();
  // Enlever le Z final s'il existe (format UTC)
  const clean = s.endsWith("Z") ? s.slice(0, -1) : s;
  const parts = clean.split("T");
  if (parts.length !== 2) return null;
  const [dateStr, timeStr] = parts;
  const [y, m, d] = dateStr.split("-").map((x) => Number.parseInt(x, 10));
  const timeParts = timeStr.split(":");
  const hh = Number.parseInt(timeParts[0] || "0", 10);
  const mm = Number.parseInt(timeParts[1] || "0", 10);
  const ss = Number.parseInt(timeParts[2] || "0", 10);
  
  if (!y || !m || !d || !Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  
  // Créer une date en heure locale (sans conversion UTC)
  const dt = new Date(y, m - 1, d, hh, mm, ss, 0);
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

export function normalizeName(name) {
  return String(name || "").trim().replace(/\s+/g, " ");
}

// Parse et valide capacityMax (2-10 personnes)
export function parseCapacityMax(value) {
  if (!value || (typeof value === 'string' && !value.trim())) return null;
  const num = Number.parseInt(value, 10);
  if (Number.isNaN(num) || num < 2 || num > 10) return null;
  return num;
}

// Conversion offset → millisecondes
// Retourne null si offset invalide (comportement unifié avec backend)
export function offsetToMs(offset) {
  if (offset === "immediate") return 0;
  if (offset === "30m") return 30 * 60 * 1000;
  if (offset === "1h") return 60 * 60 * 1000;
  if (offset === "3h") return 3 * 60 * 60 * 1000;
  if (offset === "8h") return 8 * 60 * 60 * 1000;
  if (offset === "eve") return 24 * 60 * 60 * 1000;
  return null;
}

// Options de confirmation disponibles (usage interne)
const CONFIRM_OFFSETS = [
  { value: "30m", label: "30 min avant" },
  { value: "1h", label: "1 h avant" },
  { value: "3h", label: "3 h avant" },
  { value: "8h", label: "8 h avant" },
  { value: "eve", label: "La veille" },
];

// Filtre les offsets disponibles selon le delta restant
export function getAvailableOffsets(deltaMs) {
  if (deltaMs === null || deltaMs <= 0) return [];
  const deltaHours = deltaMs / (60 * 60 * 1000);
  const deltaMinutes = deltaMs / (60 * 1000);

  if (deltaMinutes <= 30) return [];
  if (deltaHours <= 1) return [CONFIRM_OFFSETS[0]];
  if (deltaHours <= 3) return CONFIRM_OFFSETS.slice(0, 2);
  if (deltaHours <= 8) return CONFIRM_OFFSETS.slice(0, 3);
  return CONFIRM_OFFSETS;
}

// Génère la date par défaut (now + 1h, arrondie, dans les limites 6h-23h)
export function getDefaultWhenDate() {
  const now = new Date();
  const defaultDate = new Date(now.getTime() + 60 * 60 * 1000); // +1h
  
  // Arrondir à la demi-heure supérieure
  const minutes = defaultDate.getMinutes();
  if (minutes > 30) {
    defaultDate.setMinutes(0);
    defaultDate.setHours(defaultDate.getHours() + 1);
  } else if (minutes > 0) {
    defaultDate.setMinutes(30);
  } else {
    defaultDate.setMinutes(0);
  }
  
  // Vérifier si la date dépasse demain 23:45
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(23, 45, 0, 0);
  
  if (defaultDate > tomorrow) {
    // Si la date dépasse demain 23:45, la limiter à demain 23:45
    defaultDate.setTime(tomorrow.getTime());
  }
  
  // S'assurer que la date est dans la plage valide (aujourd'hui à J+7)
  const maxDate = new Date();
  maxDate.setDate(maxDate.getDate() + 7);
  maxDate.setHours(23, 59, 59, 999);
  if (defaultDate > maxDate) {
    return null;
  }
  
  return defaultDate;
}

