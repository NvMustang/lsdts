import { ImageResponse } from "@vercel/og";
import React from "react";
import { getAccessToken } from "./_sheets.js";
import { ensureMvpTabs, readAll, TAB_INVITES } from "./_mvpStore.js";
import { findInviteInRows, parseDateLocalOrUtc } from "./_utils.js";
import { text } from "./_sheets.js";

const SCOPE_RO = "https://www.googleapis.com/auth/spreadsheets.readonly";

// Formate l'heure pour "Décision avant HH:MM"
function formatDecisionTime(confirmBy) {
  if (!confirmBy) return null;
  const d = parseDateLocalOrUtc(confirmBy);
  if (!d) return null;
  return d.toLocaleString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

export default async function handler(req, res) {
  const inviteId = typeof req.query?.inviteId === "string" ? req.query.inviteId : "";
  if (!inviteId) return text(res, 400, "Missing inviteId");

  try {
    let title = "";
    let decisionTime = null;
    let confirmBy = null;

    // Priorité 1 : paramètres de query string (cas où l'invitation n'est pas encore dans le backend)
    const hasQueryParams = req.query?.t && req.query?.c;
    if (hasQueryParams) {
      title = decodeURIComponent(req.query.t);
      confirmBy = req.query.c;
      decisionTime = formatDecisionTime(req.query.c);
    } else {
      // Priorité 2 : données depuis le backend
      await ensureMvpTabs();
      await getAccessToken(SCOPE_RO);
      const rows = await readAll(TAB_INVITES, 5000);
      const invite = findInviteInRows(rows, inviteId);
      if (invite) {
        title = invite.title || "";
        confirmBy = invite.confirm_by;
        decisionTime = formatDecisionTime(invite.confirm_by);
      }
    }

    if (!title) {
      return text(res, 404, "Invite not found");
    }

    // Garantir que decisionTime est toujours présent (confirm_by doit exister selon P0_01)
    if (!decisionTime || !confirmBy) {
      console.error("[og-image] confirm_by manquant pour inviteId:", inviteId, { confirmBy, decisionTime });
      return text(res, 500, "Missing confirm_by");
    }

    // Générer l'image OG : 1200x630px
    return new ImageResponse(
      React.createElement(
        "div",
        {
          style: {
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "#fdfbf7",
            padding: "80px",
            fontFamily: "system-ui, -apple-system, sans-serif",
          },
        },
        React.createElement(
          "div",
          {
            style: {
              fontSize: "56px",
              fontWeight: "bold",
              textAlign: "center",
              color: "#1a1a1a",
              marginBottom: "40px",
              lineHeight: "1.2",
              maxWidth: "1000px",
            },
          },
          title
        ),
        React.createElement(
          "div",
          {
            style: {
              fontSize: "36px",
              color: "#666",
              marginBottom: "30px",
              textAlign: "center",
            },
          },
          `Décision avant ${decisionTime}`
        ),
        React.createElement(
          "div",
          {
            style: {
              fontSize: "32px",
              color: "#1a1a1a",
              textAlign: "center",
            },
          },
          "Répondre ici 👈"
        )
      ),
      {
        width: 1200,
        height: 630,
      }
    );
  } catch (e) {
    console.error("[og-image] Error:", e);
    return text(res, 500, "Image generation error");
  }
}

