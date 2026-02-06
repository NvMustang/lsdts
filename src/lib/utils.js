// Parse URL params pour invite ou prefill
export function parseUrlParams() {
  const params = new URLSearchParams(window.location.search);
  const m = params.get("m");
  const img = params.get("img");
  // Si m est null (paramètre absent) ou la chaîne "undefined", retourner undefined
  return {
    inviteId: params.get("inviteId"),
    t: params.get("t"),
    w: params.get("w"),
    c: params.get("c"),
    m: (m !== null && m !== "undefined") ? m : undefined,
    img: (img !== null && img !== "undefined") ? img : undefined,
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

export function normalizeName(name) {
  return String(name || "").trim().replace(/\s+/g, " ");
}

// Parse une date locale (format YYYY-MM-DDTHH:MM) en Date, en l'interprétant comme heure locale
export function parseLocalDate(dateString) {
  if (!dateString || typeof dateString !== "string") return null;
  const s = dateString.trim();
  if (!s) return null;
  
  // Parser manuellement pour interpréter comme heure locale (évite UTC)
  const parts = s.split("T");
  if (parts.length === 2) {
    const [dateStr, timeStr] = parts;
    const [y, m, d] = dateStr.split("-").map((x) => Number.parseInt(x, 10));
    const timeParts = timeStr.split(":");
    const hh = Number.parseInt(timeParts[0] || "0", 10);
    const mm = Number.parseInt(timeParts[1] || "0", 10);
    
    if (y && m && d && Number.isFinite(hh) && Number.isFinite(mm)) {
      const dateObj = new Date(y, m - 1, d, hh, mm, 0, 0);
      if (!Number.isNaN(dateObj.getTime())) return dateObj;
    }
  }
  
  return null;
}

// Parse une date en heure locale (anciennement UTC, maintenant unifié en local)
// Conservée pour compatibilité avec le code existant
export function parseDateUTC(dateString) {
  // Déléguer à parseLocalDate qui parse en heure locale
  return parseLocalDate(dateString);
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

// Génère la date par défaut (now + 1h, arrondie à 30min)
export function getDefaultWhenDate() {
  const now = new Date();
  const defaultDate = new Date(now.getTime() + 60 * 60 * 1000); // +1h
  
  // Arrondir à la 30 min supérieure
  const minutes = defaultDate.getMinutes();
  if (minutes > 30) {
    defaultDate.setMinutes(0);
    defaultDate.setHours(defaultDate.getHours() + 1);
  } else if (minutes > 0) {
    defaultDate.setMinutes(30);
  } else {
    defaultDate.setMinutes(0);
  }
  
  return defaultDate;
}

// Retourne les offsets disponibles selon le delta effectif
// Delta effectif = when_at - (now arrondi à 30min sup + 30min pour laisser du temps aux guests)
// "Immédiate" n'est jamais dans le sélecteur, c'est imposé si delta effectif < 30 min
export function getAvailableOffsets(whenDateObj) {
  if (!whenDateObj) return [];
  
  const now = new Date();
  const currentMinute = now.getMinutes();
  const currentHour = now.getHours();
  
  // Arrondir now à la 30 min supérieure (20:08 → 20:30, 20:30 → 21:00)
  let roundedMin = Math.ceil((currentMinute + 1) / 30) * 30;
  let roundedH = currentHour;
  if (roundedMin >= 60) {
    roundedMin = 0;
    roundedH += 1;
  }
  
  const nowRounded = new Date(now);
  nowRounded.setHours(roundedH, roundedMin, 0, 0);
  
  // Delta effectif = when_at - (now arrondi + 30 min pour laisser du temps aux guests)
  const minTimeForGuests = 30 * 60 * 1000; // 30 min
  const effectiveDeltaMs = whenDateObj.getTime() - (nowRounded.getTime() + minTimeForGuests);
  const effectiveDeltaMinutes = effectiveDeltaMs / (60 * 1000);
  
  // Si delta effectif < 30 min, aucune option dans le sélecteur (immédiate imposé)
  if (effectiveDeltaMinutes < 30) {
    return [];
  }
  
  // Sinon, retourner les options disponibles selon le delta effectif
  const allOffsets = [
    { value: "30m", label: "30 min avant" },
    { value: "1h", label: "1 h avant" },
    { value: "3h", label: "3 h avant" },
    { value: "8h", label: "8 h avant" },
    { value: "eve", label: "La veille" },
  ];
  
  // Filtrer selon le delta effectif (30m toujours disponible si delta effectif >= 30 min)
  return allOffsets.filter(({ value }) => {
    const offsetMs = offsetToMs(value);
    if (offsetMs === null) return false;
    // L'offset doit être inférieur ou égal au delta effectif
    return offsetMs <= effectiveDeltaMs;
  });
}

