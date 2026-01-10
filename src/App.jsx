import React, { useEffect, useState, useRef } from "react";
import TimeSlotPicker from "./components/TimeSlotPicker.jsx";
import { createInvite, getInviteResponses, recordView, respond } from "./lib/api.js";
import { 
  normalizeName,
  parseCapacityMax,
  offsetToMs,
  getDefaultWhenDate,
  getAvailableOffsets,
  parseUrlParams,
  generateId,
  getAnonDeviceId,
  getUserName,
  saveUserName,
  buildShareUrl,
  formatStatus,
  parseLocalDate,
  parseDateUTC
} from "./lib/utils.js";

const TITLE_MAX_LENGTH = 40;

// ============================================
// COMPOSANTS UI PARTAGÉS
// ============================================

function PageShell({ children }) {
  return (
    <div className="appShell">
      <div className="card">{children}</div>
    </div>
  );
}

function ParticipantsList({ participants, show, label }) {
  const currentUserName = getUserName();
  const currentNormalized = normalizeName(currentUserName);
  
  // Structure HTML centralisée - toujours présente, contenu conditionnel
  return (
    <div>
      {show && (
        <>
          <p className="subtitle" style={{ paddingBottom: '12px' }}>{label || "Participants"}</p>
          <div className="proposal">
            <p className="proposalText">
              {participants.map((name, idx) => {
                const normalized = normalizeName(name);
                const isCurrentUser = normalized === currentNormalized && currentNormalized.length > 0;
                return (
                  <React.Fragment key={idx}>
                    <span className={isCurrentUser ? "youHighlight" : ""}>{name}</span>
                    {idx < participants.length - 1 ? "\n" : ""}
                  </React.Fragment>
                );
              })}
            </p>
          </div>
        </>
      )}
    </div>
  );
}

// ============================================
// COMPOSANT : CRÉATION D'INVITATION
// ============================================

function CreateView({ urlParams }) {
  // Lire les params URL pour prefill
  const { t, w } = urlParams;
  const prefillTitle = t ? decodeURIComponent(t) : '';
  const prefillWhen = w || '';
  
  const [title, setTitle] = useState(prefillTitle);
  const [organizerName, setOrganizerName] = useState(getUserName());
  const [capacityMin, setCapacityMin] = useState("2");
  const [capacityMax, setCapacityMax] = useState("");
  const [showCapacity, setShowCapacity] = useState(false);
  
  const initialWhenDate = prefillWhen 
    ? (parseLocalDate(prefillWhen) || getDefaultWhenDate())
    : getDefaultWhenDate();
  const [whenDateObj, setWhenDateObj] = useState(initialWhenDate);
  const [confirmOffset, setConfirmOffset] = useState("30m");
  const [availableOffsets, setAvailableOffsets] = useState([]);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Calculer les offsets disponibles selon le delta effectif
  useEffect(() => {
    if (!whenDateObj) {
      setAvailableOffsets([]);
      return;
    }
    
    // Calculer le delta effectif (now arrondi à 30min sup + 30min pour les guests)
    const now = new Date();
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
    const effectiveDeltaMs = whenDateObj.getTime() - (nowRounded.getTime() + minTimeForGuests);
    const effectiveDeltaMinutes = effectiveDeltaMs / (60 * 1000);
    
    // Si delta effectif < 30 min → imposer "immediate" (pas de sélecteur)
    if (effectiveDeltaMinutes < 30) {
      setAvailableOffsets([]);
      setConfirmOffset("immediate");
      return;
    }
    
    // Sinon → sélecteur avec options disponibles
    const offsets = getAvailableOffsets(whenDateObj);
    setAvailableOffsets(offsets);
    
    // Si l'offset actuel n'est plus disponible, réinitialiser à 30m (par défaut)
    const currentAvailable = offsets.find(o => o.value === confirmOffset);
    if (!currentAvailable) {
      setConfirmOffset("30m");
    }
  }, [whenDateObj, confirmOffset]);

  const titleRemaining = TITLE_MAX_LENGTH - title.length;
  
  // Vérifier que la date est >= now arrondi à 30 min + 30 min
  const isDateValid = (() => {
    if (!whenDateObj) return false;
    const now = new Date();
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
    return whenDateObj.getTime() >= minEventDate.getTime();
  })();
  
  // Validation capacityMin
  const capacityMinValue = parseCapacityMax(capacityMin);
  const isValidCapacityMin = capacityMinValue !== null && capacityMinValue >= 2;
  
  const canSubmit = title.trim().length > 0 && 
    title.length <= TITLE_MAX_LENGTH && 
    whenDateObj && 
    isDateValid &&
    normalizeName(organizerName).length > 0 &&
    isValidCapacityMin;

  const offsetMs = offsetToMs(confirmOffset);
  const confirmationAt = whenDateObj && offsetMs !== null
    ? new Date(whenDateObj.getTime() - offsetMs)
    : null;

  const handleCreate = async () => {
    if (!canSubmit || !whenDateObj) return;
    
    // Validation capacityMin et capacityMax
    const capacityMinValue = parseCapacityMax(capacityMin);
    const capacityMaxValue = parseCapacityMax(capacityMax);
    
    if (!capacityMinValue || capacityMinValue < 2) {
      // capacityMin doit être au moins 2
      return;
    }
    
    // Validation : capacityMax doit être >= capacityMin si défini
    if (capacityMaxValue !== null && capacityMaxValue < capacityMinValue) {
      return;
    }

    const id = generateId();
    localStorage.setItem(`lsdts:organizer:${id}`, "1");

    // Préparer les valeurs minimales pour l'URL (redirection immédiate)
    // Format simple : YYYY-MM-DDTHH:MM (sans secondes)
    // Pour when_at : garder l'heure locale (affichage immédiat depuis URL)
    // Pour confirm_by : convertir en UTC pour le serveur (stockage cohérent)
    const titleValue = title.trim();
    const formatDateLocal = (d) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const da = String(d.getDate()).padStart(2, "0");
      const hh = String(d.getHours()).padStart(2, "0");
      const mm = String(d.getMinutes()).padStart(2, "0");
      return `${y}-${m}-${da}T${hh}:${mm}`;
    };
    const formatDateUTC = (d) => {
      const y = d.getUTCFullYear();
      const m = String(d.getUTCMonth() + 1).padStart(2, "0");
      const da = String(d.getUTCDate()).padStart(2, "0");
      const hh = String(d.getUTCHours()).padStart(2, "0");
      const mm = String(d.getUTCMinutes()).padStart(2, "0");
      return `${y}-${m}-${da}T${hh}:${mm}`;
    };
    // when_at : heure locale pour l'URL (affichage immédiat)
    const whenAtValue = formatDateLocal(whenDateObj);
    // confirm_by : UTC pour le serveur (stockage cohérent), mais heure locale pour l'URL (affichage)
    const confirmByDate = confirmationAt || whenDateObj;
    const confirmByValue = formatDateLocal(confirmByDate); // Pour l'URL (affichage)
    const confirmByValueUTC = formatDateUTC(confirmByDate); // Pour le serveur (stockage)
    
    // Construire l'URL directement vers la page principale avec tous les paramètres
    // Évite le passage par /i/{inviteId} qui pourrait ne pas avoir l'invitation encore dans le backend
    const url = new URL(window.location.origin);
    url.searchParams.set('inviteId', id);
    url.searchParams.set('t', encodeURIComponent(titleValue));
    url.searchParams.set('w', whenAtValue);
    url.searchParams.set('c', confirmByValue);
    if (capacityMaxValue != null && typeof capacityMaxValue === 'number' && !Number.isNaN(capacityMaxValue)) {
      url.searchParams.set('m', String(capacityMaxValue));
    }

    // Préparer le payload API
    // when_at_local : convertir l'heure locale utilisateur en UTC pour le serveur
    // Le serveur stockera en UTC, mais l'URL garde l'heure locale pour l'affichage immédiat
    const formatDateUTCForServer = (d) => {
      // Convertir l'heure locale en UTC
      const y = d.getUTCFullYear();
      const m = String(d.getUTCMonth() + 1).padStart(2, "0");
      const da = String(d.getUTCDate()).padStart(2, "0");
      const hh = String(d.getUTCHours()).padStart(2, "0");
      const mm = String(d.getUTCMinutes()).padStart(2, "0");
      return `${y}-${m}-${da}T${hh}:${mm}`;
    };
    const whenAtValueUTC = formatDateUTCForServer(whenDateObj);
    
    const payload = {
      title: titleValue,
      when_at_local: whenAtValueUTC, // UTC pour le serveur (cohérent avec confirm_by)
      confirm_offset: confirmOffset,
      organizer_name: normalizeName(organizerName) || null,
      invite_id: id,
      capacity_min: capacityMinValue,
      capacity_max: capacityMaxValue,
    };

    // Sauvegarder le nom utilisateur (rapide, localStorage)
    saveUserName(organizerName);

    // Lancer le fetch POST (non bloquant, keepalive garantit l'envoi)
    const apiUrl = new URL("/api/invites", window.location.origin);
    fetch(apiUrl.toString(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: "create", ...payload }),
      keepalive: true, // Garantit l'envoi même si la page se décharge
    }).catch((err) => {
      console.error("[App] createInvite fetch échoué (non bloquant):", {
        inviteId: id,
        url: apiUrl.toString(),
        error: {
          message: err?.message,
          name: err?.name,
          stack: err?.stack,
        },
      });
    });

    // Redirection immédiate (replace évite l'entrée dans l'historique, légèrement plus rapide)
    window.location.replace(url.toString());
  };

  return (
    <>
      <PageShell>
        <div className="section">
          <h1 className="title">Nouvelle invitation</h1>
        </div>

        <div className="formGrid" role="group" aria-label="Nouvelle invitation">
          <div className="formRow">
            <label className="formLabel" htmlFor="title">
              Quoi
            </label>
            <div className="formControl">
              <input
                id="title"
                className="input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={TITLE_MAX_LENGTH}
              />
              <div className="formHelper">Caractères restants : {titleRemaining}</div>
            </div>
          </div>

          <div className="formRow">
            <label className="formLabel" htmlFor="whenAt">
              Quand
            </label>
            <div className="formControl">
              <input
                id="whenAt"
                className="input"
                value={whenDateObj ? (() => {
                  const d = whenDateObj;
                  const base = d.toLocaleString("fr-FR", { weekday: "short", day: "2-digit", month: "2-digit" });
                  const time = d.toLocaleString("fr-FR", { hour: "2-digit", minute: "2-digit" });
                  return `${base} ${time}`;
                })() : ""}
                onClick={() => setPickerOpen(true)}
                readOnly
                placeholder="Sélectionner une date"
              />
              <div className="formHelper">Date et heure obligatoire</div>
            </div>
          </div>

          <div className="formRow">
            <label className="formLabel" htmlFor="confirmOffset">
              Confirmation
            </label>
            <div className="formControl">
              {confirmOffset === "immediate" ? (
                <>
                  <div className="input" style={{ cursor: 'default' }}>
                    Immédiate
                  </div>
                  <div className="formHelper">Réponses ouvertes jusqu'à l'événement</div>
                </>
              ) : (
                <>
                  <select
                    id="confirmOffset"
                    className="input"
                    value={confirmOffset}
                    onChange={(e) => setConfirmOffset(e.target.value)}
                    disabled={availableOffsets.length === 0}
                  >
                    {availableOffsets.map(({ value, label }) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <div className="formHelper">
                    {whenDateObj && confirmationAt && (() => {
                      const d = confirmationAt;
                      const day = d.toLocaleString("fr-FR", { weekday: "short" });
                      const time = d.toLocaleString("fr-FR", { hour: "2-digit", minute: "2-digit" });
                      return `Clôture : ${day} ${time}`;
                    })()}
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="formRow">
            <label className="formLabel" htmlFor="organizerName">
              Nom
            </label>
            <div className="formControl">
              <input
                id="organizerName"
                className="input"
                value={organizerName}
                onChange={(e) => {
                  const newName = e.target.value;
                  setOrganizerName(newName);
                  if (normalizeName(newName)) {
                    saveUserName(newName);
                  }
                }}
                placeholder={organizerName ? undefined : "Ex : Alex"}
              />
            </div>
          </div>

          {!showCapacity ? (
            <div className="formRow">
              <div 
                className="formLabel" 
                onClick={() => {
                  setShowCapacity(true);
                  setCapacityMin("2");
                }}
                style={{ cursor: 'pointer', opacity: 0.5, fontSize: '13px' }}
              >
                + Capacité
              </div>
              <div className="formControl"></div>
            </div>
          ) : (
            <>
              <div className="formRow">
                <div 
                  className="formLabel" 
                  onClick={() => setShowCapacity(false)}
                  style={{ cursor: 'pointer', fontSize: '13px' }}
                >
                  - Capacité
                </div>
                <div className="formControl">
                  <p className="formHelper" style={{ marginBottom: '8px' }}>
                    Définissez les limites du nombre de participants.
                  </p>
                </div>
              </div>
              <div className="formRow">
                <div className="formLabel"></div>
                <div className="formControl" style={{ display: 'flex', gap: '12px' }}>
                  <div style={{ flex: 1 }}>
                    <label className="formLabel" htmlFor="capacityMin" style={{ display: 'block', marginBottom: '8px' }}>
                      Minimum
                    </label>
                    <select
                      id="capacityMin"
                      className="input"
                      value={capacityMin}
                      onChange={(e) => setCapacityMin(e.target.value)}
                      style={{ width: '100%' }}
                    >
                      <option value="2">2 personnes</option>
                      <option value="3">3 personnes</option>
                      <option value="4">4 personnes</option>
                      <option value="5">5 personnes</option>
                      <option value="6">6 personnes</option>
                      <option value="7">7 personnes</option>
                      <option value="8">8 personnes</option>
                      <option value="9">9 personnes</option>
                      <option value="10">10 personnes</option>
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label className="formLabel" htmlFor="capacityMax" style={{ display: 'block', marginBottom: '8px' }}>
                      Maximum
                    </label>
                    <select
                      id="capacityMax"
                      className="input"
                      value={capacityMax}
                      onChange={(e) => setCapacityMax(e.target.value)}
                      style={{ width: '100%' }}
                    >
                      <option value="">facultatif</option>
                      <option value="2">2 personnes</option>
                      <option value="3">3 personnes</option>
                      <option value="4">4 personnes</option>
                      <option value="5">5 personnes</option>
                      <option value="6">6 personnes</option>
                      <option value="7">7 personnes</option>
                      <option value="8">8 personnes</option>
                      <option value="9">9 personnes</option>
                      <option value="10">10 personnes</option>
                    </select>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        <button
          className="btn btnPrimary"
          type="button"
          onClick={handleCreate}
          disabled={!canSubmit}
        >
          Lancer l'invitation
        </button>
      </PageShell>

      {/* Modal TimeSlotPicker */}
      {pickerOpen && (
        <div className="modalOverlay" onClick={() => setPickerOpen(false)}>
          <div className="modalContent" onClick={(e) => e.stopPropagation()}>
            <TimeSlotPicker value={whenDateObj} onChange={setWhenDateObj} />
            <button 
              className="btn btnPrimary" 
              type="button"
              onClick={() => setPickerOpen(false)}
              style={{ marginTop: '12px', width: '100%' }}
            >
              Valider
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// ============================================
// COMPOSANT : CONSULTATION D'INVITATION (orga + guest)
// ============================================

function InviteContainer({ inviteId, urlParams }) {
  // Construire l'invitation depuis l'URL pour affichage immédiat
  const { t, w, c, m } = urlParams;
  
  const urlInvite = t && w && c ? {
    id: inviteId,
    title: decodeURIComponent(t),
    when_at: w,
    when_has_time: true,
    confirm_by: c,
    capacity_max: parseCapacityMax(m),
  } : null;

  const [error, setError] = useState(false);
  
  // Calculer le statut initial depuis l'URL (cohérent avec P0_01)
  const computeInitialStatus = (invite) => {
    if (!invite?.confirm_by) return "OPEN";
    // Parser en UTC (nouveau format) avec fallback sur local (anciennes invitations)
    const confirmBy = parseDateUTC(invite.confirm_by) || parseLocalDate(invite.confirm_by);
    if (!confirmBy) return "OPEN";
    const now = new Date();
    // Si confirm_by est dans le passé, l'invitation est CLOSED (P0_01)
    // Les timestamps sont toujours en UTC, donc la comparaison est cohérente
    if (now.getTime() >= confirmBy.getTime()) return "CLOSED";
    return "OPEN";
  };
  
  // Récupérer la réponse de l'utilisateur depuis localStorage pour affichage immédiat
  const getStoredResponse = (inviteId) => {
    try {
      const stored = localStorage.getItem(`lsdts:response:${inviteId}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && parsed.choice && parsed.name) {
          return { choice: parsed.choice, name: parsed.name };
        }
      }
    } catch (e) {
      // Ignorer les erreurs de parsing
    }
    return null;
  };
  
  const storedResponse = getStoredResponse(inviteId);
  
  // Initialiser avec les données de l'URL pour affichage immédiat (cohérent avec 00_INDEX : "valeur perceptible immédiate")
  const [invitation, setInvitation] = useState(urlInvite ? { 
    invite: urlInvite,
    status: computeInitialStatus(urlInvite), // Calculé localement, sera mis à jour par le backend
    participants: [], // Vide au début, sera rempli par les requêtes (cohérent avec P0_05)
    counts: { yes: 0, no: 0, maybe: 0 }, // Par défaut 0, sera mis à jour
    my: storedResponse, // Utiliser la réponse stockée pour affichage immédiat
  } : null);
  const [statusLoaded, setStatusLoaded] = useState(false);
  const [guestName, setGuestName] = useState(getUserName());
  const [linkCopied, setLinkCopied] = useState(false);
  const guestNameInputRef = useRef(null);

  // Props du USER (commun orga/guest)
  const anonDeviceId = getAnonDeviceId();
  
  // Props du RÔLE (dérivé)
  const orga = localStorage.getItem(`lsdts:organizer:${inviteId}`) === "1";

  // useEffect uniquement pour enrichir avec le backend
  useEffect(() => {
    if (!urlInvite) {
      console.error("[App] urlInvite manquant:", {
        inviteId,
        urlParams: {
          t: urlParams.t ? "[présent]" : "[absent]",
          w: urlParams.w ? "[présent]" : "[absent]",
          c: urlParams.c ? "[présent]" : "[absent]",
        },
      });
      setError(true);
      return;
    }

    let cancelled = false;

    // Charger uniquement les participants/réponses (les infos de base sont déjà dans l'URL)
    // Cohérent avec P0_05 : réduire les temps d'attente au maximum
    const loadResponses = async () => {
      // Délai minimal seulement si l'utilisateur n'a pas encore de réponse stockée (nouvelle invitation)
      // Si l'utilisateur a déjà répondu, charger immédiatement
      if (!storedResponse) {
        await new Promise(resolve => setTimeout(resolve, 500));
        if (cancelled) return;
      }
      
      const maxRetries = 5;
      const retryDelay = 300; // 300ms entre chaque tentative
      
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        if (cancelled) return;
        
        try {
          const responses = await getInviteResponses(inviteId, anonDeviceId, orga, urlInvite);
          
          if (cancelled) return;
          
          // En mode orga, vérifier que l'organisateur est compté (yes count >= 1)
          // car l'organisateur doit avoir une réponse "YES" créée par le POST
          if (orga) {
            const yesCount = responses.counts?.yes || 0;
            
            // Si l'organisateur n'est pas encore compté et qu'on peut encore réessayer
            if (yesCount < 1 && attempt < maxRetries - 1) {
              await new Promise(resolve => setTimeout(resolve, retryDelay));
              continue;
            }
          }
          
          // Mettre à jour uniquement les participants et le statut (les infos de base viennent de l'URL)
          setInvitation((prev) => ({
            ...prev,
            status: responses.status || prev?.status,
            closure_cause: responses.closure_cause,
          participants: responses.participants || prev?.participants || [],
          counts: responses.counts || prev?.counts,
          my: responses.my,
          verdict: responses.verdict,
          total_positions: responses.total_positions,
          maybe_names: responses.maybe_names || prev?.maybe_names || [],
          no_names: responses.no_names || prev?.no_names || [],
            // Garder les infos de l'URL (titre, date, etc.)
            invite: {
              ...prev?.invite,
              // capacity_max vient toujours de l'URL (paramètre m), jamais du backend
              capacity_max: prev?.invite?.capacity_max,
            },
          }));
          
          // Mettre à jour localStorage avec la réponse du backend (source de vérité)
          if (responses.my) {
            try {
              localStorage.setItem(`lsdts:response:${inviteId}`, JSON.stringify(responses.my));
            } catch (e) {
              // Ignorer les erreurs de localStorage
            }
          } else {
            // Si pas de réponse, supprimer du localStorage
            try {
              localStorage.removeItem(`lsdts:response:${inviteId}`);
            } catch (e) {
              // Ignorer les erreurs de localStorage
            }
          }
          
          setStatusLoaded(true);
          return; // Succès, on sort de la boucle
        } catch (e) {
          if (cancelled) return;
          
          const isLastAttempt = attempt === maxRetries - 1;
          console.error(`[App] loadResponses échoué (tentative ${attempt + 1}/${maxRetries}):`, {
            inviteId,
            anonDeviceId: anonDeviceId ? "[présent]" : "[absent]",
            isOrganizer: orga,
            attempt: attempt + 1,
            maxRetries,
            isLastAttempt,
            error: {
              type: e?.type,
              message: e?.message,
              status: e?.status,
              code: e?.code,
              details: e?.details,
              stack: e?.stack,
            },
          });
          // Si c'est la dernière tentative, on affiche l'erreur
          if (isLastAttempt) {
            setError(true);
            return;
          }
          // Sinon, on attend avant de réessayer
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
      }
    };

    loadResponses();

    // Enregistrer la vue (non bloquant)
    recordView(inviteId, anonDeviceId).catch((err) => {
      if (cancelled) return;
      console.error("[App] recordView échoué (non bloquant):", {
        inviteId,
        anonDeviceId: anonDeviceId ? "[présent]" : "[absent]",
        error: {
          type: err?.type,
          message: err?.message,
          status: err?.status,
          code: err?.code,
          details: err?.details,
        },
      });
    });

    return () => {
      cancelled = true;
    };
  }, [inviteId, anonDeviceId, orga]);

  const doRespond = async (choice) => {
    const n = normalizeName(guestName);
    if (!n) {
      return;
    }
    
    // Vérifier si l'utilisateur a déjà répondu
    // Permettre la modification si c'est un MAYBE vers YES/NO (P0_01)
    const currentChoice = invitation?.my?.choice;
    if (currentChoice) {
      if (currentChoice === "MAYBE" && (choice === "YES" || choice === "NO")) {
        // Permettre la modification MAYBE -> YES/NO
      } else {
        // L'utilisateur a déjà répondu et ne peut pas modifier (YES/NO définitifs)
        return;
      }
    }
    
    setStatusLoaded(false);
    saveUserName(n);

    try {
      await respond(inviteId, anonDeviceId, n, choice);
      
      // Stocker la réponse dans localStorage pour affichage immédiat au refresh
      try {
        localStorage.setItem(`lsdts:response:${inviteId}`, JSON.stringify({ choice, name: n }));
      } catch (e) {
        // Ignorer les erreurs de localStorage
      }
      
      // Recharger les données depuis le backend pour avoir les données à jour
      // (participants, total_positions, etc.)
      try {
        const responses = await getInviteResponses(inviteId, anonDeviceId, orga, urlInvite);
        setInvitation((prev) => ({
          ...prev,
          status: responses.status || prev?.status,
          closure_cause: responses.closure_cause,
          participants: responses.participants || prev?.participants || [],
          counts: responses.counts || prev?.counts,
          my: responses.my || { choice, name: n },
          verdict: responses.verdict,
          total_positions: responses.total_positions,
          maybe_names: responses.maybe_names || prev?.maybe_names || [],
          no_names: responses.no_names || prev?.no_names || [],
          // Garder les infos de l'URL (titre, date, etc.)
          invite: {
            ...prev?.invite,
            capacity_max: prev?.invite?.capacity_max,
          },
        }));
      } catch (reloadError) {
        console.error("[App] Rechargement après réponse échoué:", reloadError);
        // Fallback: mise à jour optimiste si le rechargement échoue
        setInvitation((prev) => {
          const newData = {
            ...prev,
            my: { choice, name: n },
          };
          
          if (choice === "YES") {
            const currentParticipants = prev?.participants || [];
            if (!currentParticipants.includes(n)) {
              newData.participants = [...currentParticipants, n];
            }
          }
          
          if (prev.counts) {
            newData.counts = { ...prev.counts };
            if (choice === "YES") newData.counts.yes = (prev.counts.yes || 0) + 1;
            if (choice === "NO") newData.counts.no = (prev.counts.no || 0) + 1;
            if (choice === "MAYBE") newData.counts.maybe = (prev.counts.maybe || 0) + 1;
          }
          
          // Mettre à jour total_positions
          const currentTotal = prev?.total_positions || 0;
          newData.total_positions = currentTotal + 1;
          
          return newData;
        });
      }
      setStatusLoaded(true);
    } catch (e) {
      // Si l'erreur est "ALREADY_RESPONDED" (409), recharger les données au lieu d'afficher une erreur
      if (e?.status === 409 && e?.details?.error === "ALREADY_RESPONDED") {
        console.log("[App] Utilisateur a déjà répondu, rechargement des données");
        try {
          const responses = await getInviteResponses(inviteId, anonDeviceId, orga, urlInvite);
          setInvitation((prev) => ({
            ...prev,
            status: responses.status || prev?.status,
            closure_cause: responses.closure_cause,
          participants: responses.participants || prev?.participants || [],
          counts: responses.counts || prev?.counts,
          my: responses.my,
          verdict: responses.verdict,
          total_positions: responses.total_positions,
          maybe_names: responses.maybe_names || prev?.maybe_names || [],
          no_names: responses.no_names || prev?.no_names || [],
            invite: {
              ...prev?.invite,
              capacity_max: prev?.invite?.capacity_max,
            },
          }));
          setStatusLoaded(true);
          return;
        } catch (reloadError) {
          console.error("[App] Rechargement après ALREADY_RESPONDED échoué:", reloadError);
        }
      }
      
      console.error("[App] doRespond échoué:", {
        inviteId,
        anonDeviceId: anonDeviceId ? "[présent]" : "[absent]",
        name: n,
        choice,
        error: {
          type: e?.type,
          message: e?.message,
          status: e?.status,
          code: e?.code,
          details: e?.details,
          stack: e?.stack,
        },
      });
      setError(true);
    }
  };

  // Calculer le countdown pour OPEN (hooks doivent être avant les retours conditionnels)
  const invite = invitation?.invite;
  const status = invitation?.status;
  const [countdown, setCountdown] = useState("");
  useEffect(() => {
    if (status !== "OPEN" || !invite?.confirm_by) {
      setCountdown("");
      return;
    }
    
    const updateCountdown = () => {
      // Parser en UTC (nouveau format) avec fallback sur local (anciennes invitations)
      const confirmBy = parseDateUTC(invite.confirm_by) || parseLocalDate(invite.confirm_by);
      if (!confirmBy) {
        setCountdown("");
        return;
      }
      
      const now = new Date();
      // Les timestamps sont toujours en UTC, donc la comparaison est cohérente
      const deltaMs = confirmBy.getTime() - now.getTime();
      
      if (deltaMs <= 0) {
        setCountdown("");
        return;
      }
      
      const hours = Math.floor(deltaMs / (60 * 60 * 1000));
      const minutes = Math.floor((deltaMs % (60 * 60 * 1000)) / (60 * 1000));
      setCountdown(`${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`);
    };
    
    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [status, invite?.confirm_by]);

  if (error) {
    return (
      <PageShell>
        <p className="error">Une erreur s'est produite.</p>
        <p className="muted">Rafraîchissez la page dans quelques instants.</p>
        <button className="btn btnPrimary" type="button" onClick={() => window.location.reload()}>
          Rafraîchir
        </button>
      </PageShell>
    );
  }

  if (!invite) return null;
  
  // Formatage simple inline - utiliser parseLocalDate pour éviter les problèmes UTC
  const whenText = (() => {
    if (!invite?.when_at) return "";
    const d = parseLocalDate(invite.when_at);
    if (!d) return "";
    const base = d.toLocaleString("fr-FR", { weekday: "short", day: "2-digit", month: "2-digit" });
    if (!invite.when_has_time) return base;
    const time = d.toLocaleString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    return `${base} ${time}`;
  })();
  
  const confirmText = (() => {
    if (!invite?.confirm_by || !invite?.when_at) return "";
    // Parser confirm_by en UTC (nouveau format) avec fallback sur local (anciennes invitations)
    const c = parseDateUTC(invite.confirm_by) || parseLocalDate(invite.confirm_by);
    const w = parseLocalDate(invite.when_at);
    if (!c || !w) return "";
    
    // Si confirm_by = when_at → immédiate (géré dans l'affichage principal)
    if (c.getTime() === w.getTime()) {
      return "";
    }
    
    // Calculer le delta
    const deltaMs = w.getTime() - c.getTime();
    const deltaHours = deltaMs / (60 * 60 * 1000);
    const deltaMinutes = deltaMs / (60 * 1000);
    
    // Formater l'heure (toLocaleString convertit automatiquement UTC vers heure locale)
    const time = c.toLocaleString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    
    // Formater le delta
    let deltaText = "";
    if (deltaMinutes < 60) {
      deltaText = `${Math.round(deltaMinutes)} min avant`;
    } else {
      const hours = Math.round(deltaHours * 10) / 10;
      if (hours < 24) {
        if (hours === Math.floor(hours)) {
          deltaText = `${Math.floor(hours)} h avant`;
        } else {
          deltaText = `${hours} h avant`;
        }
      } else {
        const daysDiff = Math.floor(deltaHours / 24);
        if (daysDiff === 1) {
          deltaText = "la veille";
        } else {
          deltaText = `${daysDiff} jours avant`;
        }
      }
    }
    
    return `${time} (${deltaText})`;
  })();

  // Récupérer capacity_max uniquement depuis l'URL (paramètre m) - source unique de vérité
  const mValue = urlParams.m;
  const capacityMax = (mValue && mValue !== "undefined" && mValue !== "null") ? parseCapacityMax(mValue) : null;

  // Vue unifiée orga/guest
  const yes = invitation.counts?.yes || 0;
  const no = invitation.counts?.no || 0;
  const maybe = invitation.counts?.maybe || 0;
  const views = invitation.counts?.views || 0;
  // Note: noNames est disponible mais ne doit jamais être affichée dans une liste (règle de visibilité)
  const noNames = invitation.no_names || [];
  const maybeNames = invitation.maybe_names || [];
  
  // Calculer les non-répondants : vues uniques - somme de toutes les réponses
  const totalResponses = yes + no + maybe;
  const nonRespondants = Math.max(0, views - totalResponses);

  // Fonctions orga uniquement
  // Utiliser /i/{inviteId} pour que les Open Graph tags soient disponibles
  const shareUrl = buildShareUrl(inviteId);
  const recreate = () => {
    const url = new URL(window.location.origin);
    url.searchParams.set('t', encodeURIComponent(invite.title));
    url.searchParams.set('w', invite.when_at);
    window.location.href = url.toString();
  };

  const handleCopyUrl = async () => {
    try {
      // Tenter d'abord l'API moderne
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      // Fallback pour les navigateurs mobiles
      try {
        // Créer un élément temporaire pour la copie
        const tempInput = document.createElement('input');
        tempInput.style.position = 'absolute';
        tempInput.style.left = '-9999px';
        tempInput.value = shareUrl;
        document.body.appendChild(tempInput);
        tempInput.select();
        tempInput.setSelectionRange(0, 99999); // Pour mobile
        document.execCommand('copy');
        document.body.removeChild(tempInput);
      } catch (err) {
        // Ignorer silencieusement
      }
    }
    setLinkCopied(true);
    setTimeout(() => {
      setLinkCopied(false);
    }, 2000);
  };

  // Gestionnaire pour les CTA inactifs : focus le champ prénom
  const handleCtaClick = (choice) => {
    if (!statusLoaded || !normalizeName(guestName)) {
      // Si le bouton est désactivé, focuser le champ prénom
      if (guestNameInputRef.current) {
        guestNameInputRef.current.focus();
      }
      return;
    }
    // Sinon, exécuter l'action normale
    doRespond(choice);
  };

  // Déterminer le statut utilisateur
  const userStatus = invitation?.my?.choice || (orga ? "YES" : "UNDECIDED");
  const isUndecided = userStatus === "UNDECIDED";
  const isYes = userStatus === "YES";
  const isNo = userStatus === "NO";
  const isMaybe = userStatus === "MAYBE";

  // Calculer total_positions pour l'avancement
  const totalPositions = invitation.total_positions != null 
    ? invitation.total_positions 
    : ((yes || 0) + (no || 0) + (maybe || 0));

  return (
    <PageShell>
      {/* Section centralisée : Titre et infos */}
      <div className="section">
        <h1 className="title">{invite.title}</h1>
        <p className="muted">{whenText}</p>
        <p className="muted">
          {invite.capacity_max !== null ? `Capacité : ${invite.capacity_max} personnes` : ""}
        </p>
      </div>

      {/* Layout OPEN : ordre strict */}
      {status === "OPEN" && (
        <>
          {/* 1) Bloc Échéance (countdown) */}
          {countdown && (
            <div className="lsdts-block">
              <div className="lsdts-meta">
                <span>Clôture dans {countdown}</span>
              </div>
            </div>
          )}

          {/* 2) Bloc Avancement */}
          <div className="lsdts-block">
            <div className="lsdts-meta">
              <span>{totalPositions === 1 ? "1 personne a déjà pris position" : `${totalPositions} personnes ont déjà pris position`}</span>
            </div>
          </div>

          {/* 3) Bloc principal (varie selon statut) */}
          {isUndecided && (
            <>
              <div className="lsdts-block">
                <label className="subtitle" htmlFor="guestName" style={{ marginBottom: "8px", display: "block" }}>
                  Nom
                </label>
                <input 
                  ref={guestNameInputRef}
                  id="guestName" 
                  className="input inputInline" 
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  placeholder="Ex : Alex"
                  disabled={!statusLoaded}
                />
              </div>
              <div className="lsdts-block">
                <div className="lsdts-actions">
                  <button 
                    className="lsdts-btn lsdts-btn--yes" 
                    type="button" 
                    onClick={() => handleCtaClick("YES")} 
                    disabled={!statusLoaded || !normalizeName(guestName)}
                  >
                    J'y vais
                  </button>
                  <button 
                    className="lsdts-btn lsdts-btn--maybe" 
                    type="button" 
                    onClick={() => handleCtaClick("MAYBE")} 
                    disabled={!statusLoaded || !normalizeName(guestName)}
                  >
                    À confirmer
                  </button>
                  <button 
                    className="lsdts-btn lsdts-btn--no" 
                    type="button" 
                    onClick={() => handleCtaClick("NO")} 
                    disabled={!statusLoaded || !normalizeName(guestName)}
                  >
                    Indisponible
                  </button>
                </div>
              </div>
            </>
          )}

          {isMaybe && (
            <div className="lsdts-block">
              <label className="subtitle" style={{ marginBottom: "12px", display: "block" }}>
                Confirmer ma position
              </label>
              <div className="lsdts-actions">
                <button 
                  className="lsdts-btn lsdts-btn--yes" 
                  type="button" 
                  onClick={() => doRespond("YES")} 
                  disabled={!statusLoaded}
                >
                  J'y vais
                </button>
                <button 
                  className="lsdts-btn lsdts-btn--no" 
                  type="button" 
                  onClick={() => doRespond("NO")} 
                  disabled={!statusLoaded}
                >
                  Indisponible
                </button>
              </div>
            </div>
          )}

          {/* Règles (visible si UNDECIDED ou MAYBE) */}
          {isUndecided && (
            <div className="lsdts-rules">
              <ul style={{ margin: 0, paddingLeft: '20px', paddingRight: '20px', paddingTop: '8px', paddingBottom: '8px' }}>
                <li>Réponse définitive. <strong>À confirmer</strong> peut être modifié (1x).</li>
                <li>Participants visibles après réponse.</li>
              </ul>
            </div>
          )}
          {isMaybe && (
            <div className="lsdts-rules">
              <ul style={{ margin: 0, paddingLeft: '20px', paddingRight: '20px', paddingTop: '8px', paddingBottom: '8px' }}>
                <li><strong>À confirmer</strong> est compté comme <strong>'Indisponible'</strong>.</li>
                <li>Vous pouvez modifier votre position (1x).</li>
              </ul>
            </div>
          )}

          {/* Liste YES pour YES et NO (sans refresh, sauf orga) */}
          {(isYes || isNo) && !orga && (
            <div className="lsdts-block">
              <ParticipantsList 
                participants={invitation.participants || []} 
                show={true}
                label="Participants"
              />
            </div>
          )}

          {/* Listes pour organisateur */}
          {orga && (
            <>
              <div className="lsdts-block">
                <ParticipantsList 
                  participants={invitation.participants || []} 
                  show={true}
                  label={`Participants (${yes})`}
                />
              </div>
              {maybe > 0 && (
                <div className="lsdts-block">
                  <ParticipantsList 
                    participants={maybeNames || []} 
                    show={true}
                    label={`À confirmer (${maybe})`}
                  />
                </div>
              )}
              {/* Stats pour organisateur */}
              <div className="lsdts-block">
                <div className="lsdts-meta">
                  <span>Indisponibles: {no} - Vues unique: {views} - Non répondant: {nonRespondants}</span>
                </div>
              </div>
            </>
          )}

          {/* Bouton Copier le lien */}
          {(orga || isYes) && (
            <div className="lsdts-block">
              <button 
                className="lsdts-btn" 
                type="button" 
                onClick={handleCopyUrl}
              >
                {linkCopied ? "Lien copié !" : "Copier le lien"}
              </button>
            </div>
          )}
        </>
      )}

      {/* État CLOSED */}
      {status === "CLOSED" && (
        <>
          {invitation.verdict && (
            <div className={`statusBar ${
              invitation.verdict === "SUCCESS" ? "statusOpen" : "statusAlert"
            }`}>
              {invitation.verdict === "SUCCESS" ? (
                <>
                  <div><strong>Proposition confirmée</strong></div>
                  <div>Rendez-vous à {(() => {
                    if (!invite?.when_at) return "";
                    const d = parseLocalDate(invite.when_at);
                    if (!d) return "";
                    return d.toLocaleString("fr-FR", { hour: "2-digit", minute: "2-digit" });
                  })()}</div>
                </>
              ) : (
                <div><strong>Proposition non confirmée</strong></div>
              )}
            </div>
          )}
          
          <div className="lsdts-block">
            <ParticipantsList 
              participants={invitation.participants || []} 
              show={true}
              label={orga ? `Participants (${yes || 0})` : "Participants"}
            />
          </div>

          {/* Listes et stats pour organisateur en CLOSED */}
          {orga && (
            <>
              {maybe > 0 && (
                <div className="lsdts-block">
                  <ParticipantsList 
                    participants={maybeNames || []} 
                    show={true}
                    label={`À confirmer (${maybe})`}
                  />
                </div>
              )}
              {/* Stats pour organisateur */}
              <div className="lsdts-block">
                <div className="lsdts-meta">
                  <span>Indisponibles: {no} - Vues unique: {views} - Non répondant: {nonRespondants}</span>
                </div>
              </div>
            </>
          )}

          <div className="lsdts-block">
            <button 
              className="lsdts-btn" 
              type="button" 
              onClick={recreate}
            >
              Recréer la proposition
            </button>
          </div>
        </>
      )}
    </PageShell>
  );
}

// ============================================
// COMPOSANT RACINE : ROUTER
// ============================================

export default function App() {
  const urlParams = parseUrlParams();

  if (urlParams.inviteId) {
    return <InviteContainer inviteId={urlParams.inviteId} urlParams={urlParams} />;
  }

  return <CreateView urlParams={urlParams} />;
}
