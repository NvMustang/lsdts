import React, { useState } from "react";
import { decodeToken } from "../utils/token.js";
import { isExpired } from "../utils/expiration.js";

const Invite = ({ token }) => {
  const data = decodeToken(token);
  const expired = isExpired(data?.expiresAt);

  const organizerName = data?.organizer || data?.organizer_name || "Nicolas";
  const [firstName, setFirstName] = useState("");
  const [opened, setOpened] = useState(data?.opened || false);
  const [confirmed, setConfirmed] = useState(false);

  if (!data || expired) {
    return (
      <div className="appShell">
        <div className="paper fadeInUp">
          <p className="letterText">Cette invitation n’est plus disponible.</p>
          <div className="expiredStamp pop">EXPIRÉ</div>
        </div>
      </div>
    );
  }

  const handleOpen = () => {
    const name = firstName.trim();
    console.log("OPEN", { ...data, name });
    setOpened(true);
  };

  const handleAttend = () => {
    const name = firstName.trim();
    console.log("ATTEND", { ...data, name });
    setConfirmed(true);
  };

  if (confirmed) {
    return (
      <div className="appShell">
        <div className="paper fadeInUp">
          <p className="muted">Lettre de {organizerName}</p>
          <p className="letterText">{data.message}</p>
          <p className="muted fadeInUp">Réponse envoyée.</p>
        </div>
      </div>
    );
  }

  if (opened) {
    return (
      <div className="appShell">
        <div className="paper fadeInUp">
          <p className="muted">Lettre de {organizerName}</p>
          <p className="letterText">{data.message}</p>
          <button className="btn btnPrimary" onClick={handleAttend} type="button">
            👉 J’y vais
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="appShell">
      <div className="envelope fadeInUp">
        <div className="stamp">LSDTS</div>
        <p className="muted">Lettre de {organizerName}</p>
        <div className="section">
          <p className="subtitle">Ton prénom</p>
          <input
            className="input"
            placeholder="Entre ton prénom"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
          />
          <button
            className="btn btnPrimary"
            type="button"
            onClick={handleOpen}
            disabled={!firstName.trim()}
          >
            👉 Ouvrir la lettre
          </button>
        </div>
      </div>
    </div>
  );
};

export default Invite;

