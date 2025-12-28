import crypto from "node:crypto";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

let cachedAccessToken = null;
let cachedAccessTokenExpMs = 0;

function base64UrlEncode(buf) {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function readServiceAccount() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!raw) return { error: "Missing GOOGLE_SERVICE_ACCOUNT_KEY" };
  try {
    const parsed = JSON.parse(raw);
    const clientEmail = parsed.client_email;
    let privateKey = parsed.private_key;
    if (typeof privateKey === "string") privateKey = privateKey.replace(/\\n/g, "\n");
    if (!clientEmail || !privateKey) return { error: "Invalid service account JSON" };
    return { clientEmail, privateKey };
  } catch {
    return { error: "GOOGLE_SERVICE_ACCOUNT_KEY is not valid JSON" };
  }
}

async function fetchToken({ scope, delegatedEmail }) {
  const nowMs = Date.now();
  const sa = readServiceAccount();
  if (sa.error) throw new Error(sa.error);

  const iat = Math.floor(nowMs / 1000);
  const exp = iat + 60 * 50; // 50 minutes

  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: sa.clientEmail,
    scope,
    aud: GOOGLE_TOKEN_URL,
    iat,
    exp,
  };
  if (delegatedEmail) payload.sub = delegatedEmail;

  const signingInput = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(
    JSON.stringify(payload),
  )}`;

  const signer = crypto.createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign(sa.privateKey);
  const assertion = `${signingInput}.${base64UrlEncode(signature)}`;

  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion,
  }).toString();

  const resp = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!resp.ok) {
    let parsed = null;
    try {
      parsed = await resp.json();
    } catch {
      // ignore
    }
    const text = parsed ? JSON.stringify(parsed) : await resp.text();
    const err = new Error(`Google token error: HTTP ${resp.status} ${text}`);
    err._google = parsed;
    err._status = resp.status;
    throw err;
  }

  const data = await resp.json();
  if (!data?.access_token) throw new Error("Google token response missing access_token");
  return data;
}

export async function getAccessToken(scope) {
  const nowMs = Date.now();
  if (cachedAccessToken && nowMs < cachedAccessTokenExpMs - 10_000) return cachedAccessToken;

  const delegated = process.env.GOOGLE_DELEGATED_USER_EMAIL;

  let data;
  try {
    data = await fetchToken({ scope, delegatedEmail: delegated });
  } catch (e) {
    const errObj = e && typeof e === "object" ? e : null;
    const google = errObj?._google;
    const shouldRetry =
      delegated &&
      errObj?._status === 401 &&
      google &&
      typeof google.error === "string" &&
      google.error === "unauthorized_client";
    if (!shouldRetry) throw e;
    data = await fetchToken({ scope, delegatedEmail: null });
  }

  cachedAccessToken = data.access_token;
  cachedAccessTokenExpMs = nowMs + (Number(data.expires_in || 0) * 1000 || 0);
  return cachedAccessToken;
}

export function json(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

export function text(res, statusCode, body, contentType = "text/plain; charset=utf-8") {
  res.statusCode = statusCode;
  res.setHeader("content-type", contentType);
  res.end(body);
}

export function toA1SheetName(title) {
  const raw = String(title || "").trim();
  if (!raw) return "Sheet1";
  const needsQuotes = /[^A-Za-z0-9_]/.test(raw);
  if (!needsQuotes) return raw;
  const escaped = raw.replace(/'/g, "''");
  return `'${escaped}'`;
}

export async function sheetsBatchUpdate(spreadsheetId, requests, accessToken) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
    spreadsheetId,
  )}:batchUpdate`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ requests }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Sheets batchUpdate error: HTTP ${resp.status} ${text}`);
  }
  return await resp.json();
}

export async function sheetsGetValues(spreadsheetId, rangeA1, accessToken) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
    spreadsheetId,
  )}/values/${encodeURIComponent(rangeA1)}?majorDimension=ROWS`;
  const resp = await fetch(url, {
    method: "GET",
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Sheets read error: HTTP ${resp.status} ${text}`);
  }
  const data = await resp.json();
  return Array.isArray(data?.values) ? data.values : [];
}

export async function sheetsUpdateValues(spreadsheetId, rangeA1, values, accessToken) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
    spreadsheetId,
  )}/values/${encodeURIComponent(rangeA1)}?valueInputOption=RAW`;
  const resp = await fetch(url, {
    method: "PUT",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ values }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Sheets update error: HTTP ${resp.status} ${text}`);
  }
}

export async function sheetsAppendRow(spreadsheetId, rangeA1, row, accessToken) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
    spreadsheetId,
  )}/values/${encodeURIComponent(rangeA1)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ values: [row] }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Sheets append error: HTTP ${resp.status} ${text}`);
  }
}

export async function sheetsGetMetadata(spreadsheetId, accessToken) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
    spreadsheetId,
  )}?fields=sheets.properties(sheetId,title,gridProperties.frozenRowCount)`;
  const resp = await fetch(url, {
    method: "GET",
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Sheets metadata error: HTTP ${resp.status} ${text}`);
  }
  return await resp.json();
}


