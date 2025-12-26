import React, { useState } from "react";
import { decodeToken } from "../utils/token.js";
import { isExpired } from "../utils/expiration.js";

const Invite = ({ token }) => {
  const data = decodeToken(token);
  const expired = isExpired(data?.expiresAt);

  const [firstName, setFirstName] = useState("");
  const [opened, setOpened] = useState(data?.opened || false);
  const [confirmed, setConfirmed] = useState(false);

  if (!data || expired) {
    return (
      <div className="card center">
        <div className="message">Cette invitation n’est plus disponible.</div>
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
      <div className="card center">
        <div className="message">Réponse envoyée.</div>
      </div>
    );
  }

  if (opened) {
    return (
      <div className="card">
        <h1 className="title">Lettre de Nicolas</h1>
        <p className="message">{data.message}</p>
        <button className="primary-btn" onClick={handleAttend} type="button">
          👉 J’y vais
        </button>
      </div>
    );
  }

  return (
    <div className="card">
      <h1 className="title">Lettre de Nicolas</h1>
      <p className="subtitle">Ton prénom</p>
      <input
        className="input"
        placeholder="Entre ton prénom"
        value={firstName}
        onChange={(e) => setFirstName(e.target.value)}
      />
      <button
        className="primary-btn"
        type="button"
        onClick={handleOpen}
        disabled={!firstName.trim()}
      >
        👉 Ouvrir la lettre
      </button>
    </div>
  );
};

export default Invite;

