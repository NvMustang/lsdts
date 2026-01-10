import { ImageResponse } from "@vercel/og";
import React from "react";
import { getAccessToken } from "./_sheets.js";
import { ensureMvpTabs, readAll, TAB_INVITES } from "./_mvpStore.js";
import { findInviteInRows, parseDateLocalOrUtc, parseDateUTC } from "./_utils.js";
import { text } from "./_sheets.js";

const SCOPE_RO = "https://www.googleapis.com/auth/spreadsheets.readonly";

// Formate l'heure pour "Décision avant HH:MM"
function formatDecisionTime(confirmBy) {
  if (!confirmBy) return null;
  // Parser en UTC (nouveau format) avec fallback sur local (anciennes invitations)
  const d = parseDateUTC(confirmBy) || parseDateLocalOrUtc(confirmBy);
  if (!d) return null;
  // toLocaleString convertit automatiquement UTC vers l'heure locale de l'utilisateur
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

    // Pictogrammes SVG (P06 : accent navy)
    const clockIcon = React.createElement(
      "svg",
      {
        width: "32",
        height: "32",
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "#1e3a5f",
        strokeWidth: "2",
        strokeLinecap: "round",
        strokeLinejoin: "round",
      },
      React.createElement("circle", { cx: "12", cy: "12", r: "10" }),
      React.createElement("polyline", { points: "12 6 12 12 16 14" })
    );

    const arrowRightIcon = React.createElement(
      "svg",
      {
        width: "32",
        height: "32",
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "#1e3a5f",
        strokeWidth: "2.5",
        strokeLinecap: "round",
        strokeLinejoin: "round",
      },
      React.createElement("line", { x1: "5", y1: "12", x2: "19", y2: "12" }),
      React.createElement("polyline", { points: "12 5 19 12 12 19" })
    );

    const arrowLeftIcon = React.createElement(
      "svg",
      {
        width: "32",
        height: "32",
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "#1e3a5f",
        strokeWidth: "2.5",
        strokeLinecap: "round",
        strokeLinejoin: "round",
      },
      React.createElement("line", { x1: "19", y1: "12", x2: "5", y2: "12" }),
      React.createElement("polyline", { points: "12 19 5 12 12 5" })
    );

    // Générer l'image OG : 1200x630px (P06 : fond crème, texte bleu très foncé)
    const imageResponse = new ImageResponse(
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
            padding: "50px 60px",
            fontFamily: "Inter, system-ui, -apple-system, sans-serif",
          },
        },
        // Conteneur centré verticalement
        React.createElement(
          "div",
          {
            style: {
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              width: "100%",
            },
          },
          // Titre
          React.createElement(
            "div",
            {
              style: {
                fontSize: "64px",
                fontWeight: "500",
                textAlign: "center",
                color: "#0a2540",
                marginBottom: "35px",
                lineHeight: "1.2",
                width: "100%",
              },
            },
            title
          ),
          // Ligne de séparation (P06 : 1px, largeur du texte du bas)
          React.createElement(
            "div",
            {
              style: {
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: "35px",
              },
            },
            React.createElement(
              "div",
              {
                style: {
                  width: "400px",
                  height: "1px",
                  backgroundColor: "#8a9ba8",
                },
              }
            )
          ),
          // Décision avec pictogramme horloge
          React.createElement(
            "div",
            {
              style: {
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "12px",
                marginBottom: "35px",
              },
            },
            clockIcon,
            React.createElement(
              "div",
              {
                style: {
                  fontSize: "32px",
                  color: "#4a5568",
                  fontWeight: "400",
                },
              },
              `Décision avant ${decisionTime}`
            )
          ),
          // Ligne de séparation (même largeur que "Répondre ici" avec flèches)
          React.createElement(
            "div",
            {
              style: {
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: "35px",
              },
            },
            React.createElement(
              "div",
              {
                style: {
                  width: "400px",
                  height: "1px",
                  backgroundColor: "#8a9ba8",
                },
              }
            )
          ),
          // Répondre ici avec flèches (→ Répondre ici ←)
          React.createElement(
            "div",
            {
              style: {
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "16px",
              },
            },
            arrowRightIcon,
            React.createElement(
              "div",
              {
                style: {
                  fontSize: "28px",
                  color: "#0a2540",
                  fontWeight: "400",
                },
              },
              "Répondre ici"
            ),
            arrowLeftIcon
          )
        )
      ),
      {
        width: 1200,
        height: 630,
      }
    );

    // Convertir la Response Web API en réponse Node.js
    const arrayBuffer = await imageResponse.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    res.statusCode = 200;
    res.setHeader("content-type", "image/png");
    res.setHeader("content-length", buffer.length.toString());
    res.setHeader("cache-control", "public, max-age=31536000, immutable");
    res.setHeader("access-control-allow-origin", "*");
    res.end(buffer);
  } catch (e) {
    console.error("[og-image] Error:", e);
    return text(res, 500, "Image generation error");
  }
}

