import React, { useState } from "react";
import { encodeToken } from "../utils/token.js";
import { getExpiration } from "../utils/expiration.js";

const formatMessage = (activity, timing, customActivity) => {
  const baseActivity =
    activity === "Autre"
      ? (customActivity || "").trim().toLowerCase() || "quelque chose"
      : activity.toLowerCase();

  const timeLabel = timing === "Ce soir" ? "ce soir" : "ce week-end";
  return `Je te propose un ${baseActivity} ${timeLabel}.`;
};

const Create = () => {
  const [activity, setActivity] = useState("Apéro");
  const [customActivity, setCustomActivity] = useState("");
  const [timing, setTiming] = useState("Ce soir");
  const [link, setLink] = useState("");

  const message = formatMessage(activity, timing, customActivity);
  const isCustomRequired = activity === "Autre";
  const customValid = customActivity.trim().length > 0;

  const handleShare = () => {
    const finalActivity =
      activity === "Autre"
        ? customActivity.trim().toLowerCase()
        : activity.toLowerCase();

    const payload = {
      activity: finalActivity,
      timing,
      message,
      opened: false,
      expiresAt: getExpiration(timing).toISOString(),
    };

    const token = encodeToken(payload);
    const url = `${window.location.origin}/p/${encodeURIComponent(token)}`;
    setLink(url);
  };

  return (
    <div className="appShell">
      <div className="card">
        <div className="section">
          <h1 className="title">Créer l’invitation</h1>
          <p className="subtitle">Phrase live :</p>
          <div className="paper fadeInUp">
            <p className="letterText">{message}</p>
          </div>
        </div>

        <div className="section">
          <p className="subtitle">Choisis l’activité</p>
          <div className="pill-row">
            <button
              className={activity === "Apéro" ? "chip chipActive" : "chip"}
              onClick={() => setActivity("Apéro")}
              type="button"
            >
              Apéro
            </button>
            <button
              className={activity === "Ciné" ? "chip chipActive" : "chip"}
              onClick={() => setActivity("Ciné")}
              type="button"
            >
              Ciné
            </button>
            <button
              className={activity === "Autre" ? "chip chipActive" : "chip"}
              onClick={() => setActivity("Autre")}
              type="button"
            >
              Autre
            </button>
          </div>
          <input
            className={`input ${isCustomRequired ? "" : "hidden"}`}
            placeholder="Précise l’activité (max 30 caractères)"
            maxLength={30}
            value={customActivity}
            onChange={(e) => setCustomActivity(e.target.value)}
          />
        </div>

        <div className="section">
          <p className="subtitle">Quand ?</p>
          <div className="pill-row">
            <button
              className={timing === "Ce soir" ? "chip chipActive" : "chip"}
              onClick={() => setTiming("Ce soir")}
              type="button"
            >
              Ce soir
            </button>
            <button
              className={
                timing === "Ce week-end" ? "chip chipActive" : "chip"
              }
              onClick={() => setTiming("Ce week-end")}
              type="button"
            >
              Ce week-end
            </button>
          </div>
        </div>

        <button
          className="btn btnPrimary"
          onClick={handleShare}
          type="button"
          disabled={isCustomRequired && !customValid}
        >
          👉 Partager
        </button>

        <div className={`section ${link ? "" : "hidden"}`}>
          <p className="subtitle">Lien copiable</p>
          <div className="link-box">{link}</div>
          <p className="note muted">Envoie ce lien pour ouvrir la lettre.</p>
        </div>
      </div>
    </div>
  );
};

export default Create;

