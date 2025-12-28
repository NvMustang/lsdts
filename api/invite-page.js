import { getAccessToken, text } from "./_sheets.js";
import { ensureMvpTabs, readAll, TAB_INVITES } from "./_mvpStore.js";
import { findInviteInRows } from "./_utils.js";

const SCOPE_RO = "https://www.googleapis.com/auth/spreadsheets.readonly";

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatWhen(invite) {
  const d = new Date(invite.when_at);
  const base = d.toLocaleString("fr-FR", { weekday: "short", day: "2-digit", month: "2-digit" });
  if (!invite.when_has_time) return base;
  const time = d.toLocaleString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  return `${base} ${time}`;
}

function formatConfirm(invite) {
  const c = new Date(invite.confirm_by);
  const w = new Date(invite.when_at);
  const sameDay =
    c.getFullYear() === w.getFullYear() && c.getMonth() === w.getMonth() && c.getDate() === w.getDate();
  const time = c.toLocaleString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  if (sameDay) return time;
  const date = c.toLocaleString("fr-FR", { day: "2-digit", month: "2-digit" });
  return `${date} ${time}`;
}


export default async function handler(req, res) {
  const inviteId = typeof req.query?.inviteId === "string" ? req.query.inviteId : "";
  if (!inviteId) return text(res, 400, "Missing inviteId");

  try {
    await ensureMvpTabs();
    await getAccessToken(SCOPE_RO);
    const rows = await readAll(TAB_INVITES, 5000);
    const invite = findInviteInRows(rows, inviteId);

    const title = invite?.title || "Invitation";
    const whenText = invite ? formatWhen(invite) : "";
    const confirmText = invite ? formatConfirm(invite) : "";
    
    // Construire une description riche avec toutes les données immuables
    // Format avec sauts de ligne pour affichage vertical dans l'aperçu
    let descriptionParts = [];
    if (whenText) {
      descriptionParts.push(whenText);
    }
    if (confirmText) {
      descriptionParts.push(`Confirmation avant ${confirmText}`);
    }
    if (invite?.capacity_max !== null && invite?.capacity_max !== undefined) {
      descriptionParts.push(`Capacité : ${invite.capacity_max} personnes`);
    }
    // Mettre "Répondre ici" en évidence avec emoji pour inciter
    if (descriptionParts.length === 0) {
      descriptionParts.push("👉 RÉPONDRE ICI");
    } else {
      descriptionParts.push("👉 RÉPONDRE ICI");
    }
    // Utiliser des sauts de ligne pour affichage vertical (certaines plateformes les respectent)
    const description = descriptionParts.join("\n");

    // Inclure les infos dans l'URL pour éviter le chargement initial côté guest
    const urlParams = new URLSearchParams();
    urlParams.set("inviteId", inviteId);
    if (invite) {
      urlParams.set("t", encodeURIComponent(invite.title));
      urlParams.set("w", invite.when_at);
      urlParams.set("c", invite.confirm_by);
      if (invite.capacity_max !== null) {
        urlParams.set("m", String(invite.capacity_max));
      }
    }
    const redirectUrl = `/?${urlParams.toString()}`;
    // Construire l'URL canonique (absolue pour les aperçus de liens)
    const protocol = req.headers['x-forwarded-proto'] || (req.headers.host?.includes('localhost') ? 'http' : 'https');
    const host = req.headers.host || '';
    const canonicalUrl = `${protocol}://${host}/i/${inviteId}`;

    // Serve HTML with OG tags. For browsers, redirect to the SPA with inviteId and infos as query params.
    // Note: redirectUrl et canonicalUrl sont déjà des URLs valides, pas besoin d'escapeHtml
    const html = `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
    <link rel="canonical" href="${canonicalUrl}" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:url" content="${canonicalUrl}" />
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta http-equiv="refresh" content="0; url=${redirectUrl}" />
    <style>
      body { 
        margin: 0; 
        padding: 0; 
        background: radial-gradient(circle at 10% 20%, #f1e9dc 0%, #f7f2e9 38%, #fdfbf7 72%);
        min-height: 100vh; 
        font-family: system-ui, -apple-system, sans-serif; 
      }
    </style>
  </head>
  <body>
  </body>
</html>`;

    return text(res, 200, html, "text/html; charset=utf-8");
  } catch (e) {
    return text(res, 500, "Invite page error");
  }
}


