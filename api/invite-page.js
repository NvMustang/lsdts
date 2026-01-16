import { getAccessToken, text } from "./_sheets.js";
import { ensureMvpTabs, readAll, TAB_INVITES } from "./_mvpStore.js";
import { findInviteInRows, parseDateLocalOrUtc, parseDateUTC } from "./_utils.js";

const SCOPE_RO = "https://www.googleapis.com/auth/spreadsheets.readonly";

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Formate l'heure pour "Décision avant HH:MM"
function formatDecisionTime(confirmBy) {
  if (!confirmBy) return "";
  // Parser en heure locale
  const d = parseDateUTC(confirmBy) || parseDateLocalOrUtc(confirmBy);
  if (!d) return "";
  // Formater l'heure locale
  return d.toLocaleString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}


export default async function handler(req, res) {
  const inviteId = typeof req.query?.inviteId === "string" ? req.query.inviteId : "";
  if (!inviteId) return text(res, 400, "Missing inviteId");

  try {
    let title = "";
    let decisionTime = "";
    let invite = null;

    // Priorité 1 : paramètres de query string (cas où l'invitation n'est pas encore dans le backend)
    const hasQueryParams = req.query?.t && req.query?.w && req.query?.c;
    
    if (hasQueryParams) {
      title = decodeURIComponent(req.query.t);
      decisionTime = formatDecisionTime(req.query.c);
    } else {
      // Priorité 2 : données depuis le backend
      await ensureMvpTabs();
      await getAccessToken(SCOPE_RO);
      const rows = await readAll(TAB_INVITES, 5000);
      invite = findInviteInRows(rows, inviteId);
      if (invite) {
        title = invite.title || "";
        decisionTime = formatDecisionTime(invite.confirm_by);
      }
    }

    if (!title) {
      title = "Invitation";
    }

    // Inclure les infos dans l'URL pour éviter le chargement initial côté guest
    const urlParams = new URLSearchParams();
    urlParams.set("inviteId", inviteId);
    
    if (hasQueryParams) {
      urlParams.set("t", req.query.t);
      urlParams.set("w", req.query.w);
      urlParams.set("c", req.query.c);
      if (req.query.m) {
        urlParams.set("m", req.query.m);
      }
    } else if (invite) {
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
    
    // URL de l'image OG - toujours inclure t et c (soit depuis query params, soit depuis backend)
    let ogImageParams = `inviteId=${encodeURIComponent(inviteId)}`;
    if (hasQueryParams) {
      ogImageParams += `&t=${encodeURIComponent(req.query.t)}&c=${encodeURIComponent(req.query.c)}`;
    } else if (invite && invite.title && invite.confirm_by) {
      ogImageParams += `&t=${encodeURIComponent(invite.title)}&c=${encodeURIComponent(invite.confirm_by)}`;
    }
    // Si aucun paramètre disponible, l'image OG retournera une erreur (normal, car confirm_by est obligatoire)
    const ogImageUrl = `${protocol}://${host}/api/og-image?${ogImageParams}`;
    
    // OG Description optionnelle : "Décision avant HH:MM" et "Répondre ici 👈"
    // decisionTime doit toujours être présent (confirm_by est obligatoire selon P0_01)
    let ogDescription = "";
    if (decisionTime) {
      ogDescription = `Décision avant ${decisionTime}. Répondre ici 👈`;
    } else {
      // Fallback de sécurité (ne devrait pas arriver en production normale)
      ogDescription = "Répondre ici 👈";
    }

    // Serve HTML with OG tags. For browsers, redirect to the SPA with inviteId and infos as query params.
    const html = `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
    <link rel="canonical" href="${canonicalUrl}" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:image" content="${ogImageUrl}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:url" content="${canonicalUrl}" />
    ${ogDescription ? `<meta property="og:description" content="${escapeHtml(ogDescription)}" />` : ''}
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


