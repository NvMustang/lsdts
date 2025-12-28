import React, { useEffect, useState } from "react";
import TimeSlotPicker from "./components/TimeSlotPicker.jsx";
import { createInvite, getInviteResponses, recordView, respond } from "./lib/api.js";
import { 
  formatWhen, 
  formatConfirm,
  formatClosure,
  dateToWhenAtLocal,
  dateToIsoLocal,
  parseIsoLocal,
  normalizeName,
  parseCapacityMax,
  offsetToMs,
  getAvailableOffsets,
  getDefaultWhenDate,
  parseUrlParams,
  generateId,
  getAnonDeviceId,
  getUserName,
  saveUserName,
  buildShareUrl,
  formatStatus
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

function ParticipantsList({ participants, capacityMax, yesCount, show }) {
  const currentUserName = getUserName();
  const currentNormalized = normalizeName(currentUserName);
  
  // Label centralisé : même format pour orga et guest
  const displayLabel = capacityMax != null
    ? `Participants (${yesCount || participants.length} sur ${capacityMax})`
    : "Participants";
  
  // Structure HTML centralisée - toujours présente, contenu conditionnel
  return (
    <div>
      {show && <p className="subtitle" style={{ paddingBottom: '12px' }}>{displayLabel}</p>}
      {show && (
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
  const [capacityMax, setCapacityMax] = useState("");
  const [showCapacity, setShowCapacity] = useState(false);
  
  const initialWhenDate = prefillWhen 
    ? (parseIsoLocal(prefillWhen) || getDefaultWhenDate())
    : getDefaultWhenDate();
  const [whenDateObj, setWhenDateObj] = useState(initialWhenDate);
  const [confirmOffset, setConfirmOffset] = useState("30m");
  const [pickerOpen, setPickerOpen] = useState(false);

  const whenAtLocal = dateToWhenAtLocal(whenDateObj);
  const deltaMs = whenDateObj ? whenDateObj.getTime() - Date.now() : null;
  const availableOffsets = getAvailableOffsets(deltaMs);

  useEffect(() => {
    if (availableOffsets.length === 0) {
      setConfirmOffset("immediate");
    } else if (!availableOffsets.some((opt) => opt.value === confirmOffset)) {
      setConfirmOffset(availableOffsets[0].value);
    }
  }, [availableOffsets, confirmOffset]);

  const titleRemaining = TITLE_MAX_LENGTH - title.length;
  const canSubmit = title.trim().length > 0 && 
    title.length <= TITLE_MAX_LENGTH && 
    whenDateObj && 
    normalizeName(organizerName).length > 0;

  const offsetMs = offsetToMs(confirmOffset);
  const confirmationAt = whenDateObj && offsetMs !== null
    ? new Date(whenDateObj.getTime() - offsetMs)
    : null;
  const confirmationInvalid = confirmationAt && confirmOffset !== "immediate"
    ? confirmationAt.getTime() < Date.now()
    : false;

  const handleCreate = async () => {
    if (!canSubmit || !whenDateObj) return;
    
    // Validation capacityMax
    const capacityMaxValue = parseCapacityMax(capacityMax);
    
    // Validation confirmation
    if (confirmationInvalid) return;

    const id = generateId();
    localStorage.setItem(`lsdts:organizer:${id}`, "1");

    // Préparer les valeurs minimales pour l'URL (redirection immédiate)
    // Utiliser le format local (sans timezone) pour éviter les problèmes de conversion UTC
    const titleValue = title.trim();
    const whenAtValue = dateToIsoLocal(whenDateObj);
    const confirmByValue = confirmationAt ? dateToIsoLocal(confirmationAt) : dateToIsoLocal(whenDateObj);
    
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

    // Préparer le payload API (calcul différé pour ne pas bloquer la redirection)
    const currentWhenAtLocal = dateToWhenAtLocal(whenDateObj);
    const payload = {
      title: titleValue,
      when_at_local: currentWhenAtLocal,
      confirm_offset: confirmOffset,
      organizer_name: normalizeName(organizerName) || null,
      invite_id: id,
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
                value={whenDateObj ? formatWhen({when_at: whenDateObj.toISOString(), when_has_time: true}) : ""}
                onClick={() => setPickerOpen(true)}
                readOnly
                placeholder="Sélectionner une date"
              />
              <div className="formHelper">Date et heure obligatoire</div>
            </div>
          </div>

          <div className="formRow">
            <div className="formLabel">Confirmation</div>
            <div className="formControl">
              {availableOffsets.length === 0 ? (
                <>
                  <div className="input" style={{ cursor: 'default' }}>
                    Confirmation : immédiate
                  </div>
                  <div className="formHelper">Réponses ouvertes jusqu'à l'événement</div>
                </>
              ) : (
                <>
                  <select
                    className="input"
                    value={confirmOffset}
                    onChange={(e) => setConfirmOffset(e.target.value)}
                    aria-label="Confirmation"
                  >
                    {availableOffsets.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <div className="formHelper">
                    {whenDateObj && confirmationAt && `Clôture : ${formatClosure(confirmationAt)}`}
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="formRow">
            <label className="formLabel" htmlFor="organizerName">
              Ton prénom
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
                  setCapacityMax("2");
                }}
                style={{ cursor: 'pointer', opacity: 0.5, fontSize: '13px' }}
              >
                + Capacité
              </div>
              <div className="formControl"></div>
            </div>
          ) : (
            <div className="formRow">
              <div 
                className="formLabel" 
                onClick={() => setShowCapacity(false)}
                style={{ cursor: 'pointer', fontSize: '13px' }}
              >
                - Capacité
              </div>
              <div className="formControl">
                <select
                  id="capacityMax"
                  className="input"
                  value={capacityMax}
                  onChange={(e) => setCapacityMax(e.target.value)}
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
                <div className="formHelper">Nombre maximum de participants, toi inclus</div>
              </div>
            </div>
          )}
        </div>

        <button
          className="btn btnPrimary"
          type="button"
          onClick={handleCreate}
          disabled={!canSubmit || (confirmationInvalid && confirmOffset !== "immediate")}
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
  const [invitation, setInvitation] = useState(urlInvite ? { 
    invite: urlInvite,
    status: "LOADING"
  } : null);
  const [statusLoaded, setStatusLoaded] = useState(false);
  const [guestName, setGuestName] = useState(getUserName());

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

    // En mode orga, attendre que le POST soit terminé avant de faire le GET
    // On fait un retry jusqu'à ce que l'organisateur soit compté dans les participants
    const loadResponses = async () => {
      const maxRetries = 10;
      const retryDelay = 300; // 300ms entre chaque tentative
      
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          const responses = await getInviteResponses(inviteId, anonDeviceId, orga, urlInvite);
          
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
          
          setInvitation((prev) => ({
            ...prev,
            ...responses,
            invite: {
              ...prev?.invite,
              ...responses.invite,
              // capacity_max vient toujours de l'URL (paramètre m), jamais du backend
              capacity_max: prev?.invite?.capacity_max,
            },
          }));
          setStatusLoaded(true);
          return; // Succès, on sort de la boucle
        } catch (e) {
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
  }, []);

  const doRespond = async (choice) => {
    const n = normalizeName(guestName);
    if (!n) {
      return;
    }
    
    setStatusLoaded(false);
    saveUserName(n);

    try {
      await respond(inviteId, anonDeviceId, n, choice);
      
      // Mise à jour locale optimiste
      setInvitation((prev) => {
        const newData = {
          ...prev,
          my: { choice, name: n },
        };
        
        if (choice === "YES" && prev.participants) {
          newData.participants = [...prev.participants, n];
        }
        
        if (prev.counts) {
          newData.counts = { ...prev.counts };
          if (choice === "YES") newData.counts.yes = (prev.counts.yes || 0) + 1;
          if (choice === "NO") newData.counts.no = (prev.counts.no || 0) + 1;
          if (choice === "MAYBE") newData.counts.maybe = (prev.counts.maybe || 0) + 1;
        }
        
        return newData;
      });
      setStatusLoaded(true);
    } catch (e) {
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

  const invite = invitation?.invite;
  if (!invite) return null;
  const whenText = formatWhen(invite);
  const confirmText = formatConfirm(invite);

  // Récupérer capacity_max uniquement depuis l'URL (paramètre m) - source unique de vérité
  const mValue = urlParams.m;
  const capacityMax = (mValue && mValue !== "undefined" && mValue !== "null") ? parseCapacityMax(mValue) : null;

  // Vue unifiée orga/guest
  const status = invitation.status;
  const views = invitation.counts?.views;
  const yes = invitation.counts?.yes;
  const no = invitation.counts?.no;
  const maybe = invitation.counts?.maybe;

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
  };

  return (
    <PageShell>
      {/* Section centralisée : Titre et infos */}
      <div className="section">
        <h1 className="title">{invite.title}</h1>
        <p className="muted">{whenText}</p>
        <p className="muted">Confirmation avant {confirmText}</p>
        <p className="muted">
          {invite.capacity_max !== null ? `Capacité : ${invite.capacity_max} personnes` : ""}
        </p>
      </div>

      {/* Section commune : Statut */}
      <div className="section">
        <div className={`statusBar ${
          (status === "FULL" || status === "CLOSED") ? "statusAlert" : 
          (status === "OPEN") ? "statusOpen" : ""
        }`}>
          {formatStatus(invitation.status)}
        </div>
        {/* Bouton Copier le lien - même condition que Participants */}
        <button 
          className="btn" 
          type="button" 
          onClick={handleCopyUrl}
          style={{ display: (orga || invitation?.my?.choice === "YES") ? "block" : "none" }}
        >
          Copier le lien
        </button>
      </div>

        {/* Section centralisée : Actions */}
        <div className="section" style={{ 
          display: (
            (!orga && !invitation?.my?.choice && status !== "FULL" && status !== "CLOSED") || 
            (status === "FULL" || status === "CLOSED")
          ) ? "block" : "none" 
        }}>
          <div className="ctaContainer">
            {/* Formulaire guest - toujours présent, contenu conditionnel */}
            <label 
              className="subtitle" 
              htmlFor="guestName"
              style={{ display: (!orga && !invitation?.my?.choice && status !== "FULL" && status !== "CLOSED") ? "block" : "none" }}
            >
              Ton prénom
            </label>
            <input 
              id="guestName" 
              className="input inputInline" 
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              placeholder="Ex : Alex"
              disabled={!statusLoaded}
              style={{ display: (!orga && !invitation?.my?.choice && status !== "FULL" && status !== "CLOSED") ? "block" : "none" }}
            />
            <div 
              style={{ 
                display: (!orga && !invitation?.my?.choice && status !== "FULL" && status !== "CLOSED") ? "flex" : "none",
                flexDirection: "column",
                gap: "8px",
                width: "100%"
              }}
            >
              <button 
                className="btn btnPrimary" 
                type="button" 
                onClick={() => doRespond("YES")} 
                disabled={!statusLoaded || !normalizeName(guestName)}
              >
                J'y vais
              </button>
              <button 
                className="btn" 
                type="button" 
                onClick={() => doRespond("NO")} 
                disabled={!statusLoaded || !normalizeName(guestName)}
              >
                Je ne peux pas
              </button>
              <button 
                className="btn" 
                type="button" 
                onClick={() => doRespond("MAYBE")} 
                disabled={!statusLoaded || !normalizeName(guestName)}
              >
                Je regarde
              </button>
            </div>
          </div>
          {/* Bouton Recréer - directement dans la section pour même largeur que "Copier le lien" */}
          <button 
            className="btn btnPrimary" 
            type="button" 
            onClick={recreate}
            style={{ display: (status === "FULL" || status === "CLOSED") ? "block" : "none" }}
          >
            Recréer la proposition
          </button>
        </div>

        {/* Section Participants centralisée - pleine largeur comme statusBar */}
        <div className="section">
          <ParticipantsList 
            participants={invitation.participants || []} 
            capacityMax={capacityMax}
            yesCount={yes || invitation.participants?.length || 0}
            show={orga || invitation?.my?.choice === "YES"}
          />
        </div>

        {/* Section centralisée : Stats - orga uniquement */}
        <div className="section" style={{ display: orga ? "block" : "none" }}>
          <p className="subtitle">Vues : {views || 0} (unique)</p>
          <p className="subtitle">
            {capacityMax == null ? `Oui : ${yes || 0}` : ""}
          </p>
          <p className="subtitle">Non : {no || 0} / Je regarde : {maybe || 0}</p>
        </div>
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
