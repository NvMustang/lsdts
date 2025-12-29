import {
  getAccessToken,
  sheetsAppendRow,
  sheetsBatchUpdate,
  sheetsGetMetadata,
  sheetsGetValues,
  sheetsUpdateValues,
  toA1SheetName,
} from "./_sheets.js";

const SCOPE_RW = "https://www.googleapis.com/auth/spreadsheets";
const SCOPE_RO = "https://www.googleapis.com/auth/spreadsheets.readonly";

let tabsReady = false;
let tabsReadyAtMs = 0;

export const TAB_INVITES = "invites";
export const TAB_VIEWS = "views";
export const TAB_RESPONSES = "responses";
export const TAB_LOGS = "logs";

export const HEADERS = {
  [TAB_INVITES]: [
    "id",
    "title",
    "when_at",
    "when_has_time",
    "confirm_by",
    "capacity_max",
    "created_at",
    "status",
    "closed_at",
    "closure_cause",
    "view_count_unique",
    "yes_count",
    "no_count",
    "maybe_count",
    "first_view_at",
    "first_response_at",
    "response_time_delta_ms",
  ],
  [TAB_VIEWS]: ["invite_id", "anon_device_id", "first_seen_at"],
  [TAB_RESPONSES]: ["id", "invite_id", "anon_device_id", "name", "choice", "created_at"],
  [TAB_LOGS]: ["created_at", "type", "invite_id", "anon_device_id", "payload_json"],
};

function spreadsheetId() {
  const id = process.env.GOOGLE_SPREADSHEET_ID;
  if (!id) throw new Error("Missing GOOGLE_SPREADSHEET_ID");
  return id;
}

export async function ensureMvpTabs() {
  const nowMs = Date.now();
  if (tabsReady && nowMs - tabsReadyAtMs < 10 * 60 * 1000) return { ok: true, cached: true };

  const sid = spreadsheetId();
  const accessToken = await getAccessToken(SCOPE_RW);
  const meta = await sheetsGetMetadata(sid, accessToken);
  const existing = new Map(
    (meta?.sheets || [])
      .map((s) => s?.properties)
      .filter(Boolean)
      .map((p) => [p.title, p]),
  );

  const requests = [];
  for (const title of [TAB_INVITES, TAB_VIEWS, TAB_RESPONSES, TAB_LOGS]) {
    if (!existing.has(title)) {
      requests.push({ addSheet: { properties: { title } } });
    }
  }

  let created = null;
  if (requests.length > 0) {
    created = await sheetsBatchUpdate(sid, requests, accessToken);
  }

  const meta2 = requests.length > 0 ? await sheetsGetMetadata(sid, accessToken) : meta;
  const sheets = (meta2?.sheets || []).map((s) => s?.properties).filter(Boolean);
  const byTitle = new Map(sheets.map((p) => [p.title, p]));

  for (const title of [TAB_INVITES, TAB_VIEWS, TAB_RESPONSES, TAB_LOGS]) {
    const props = byTitle.get(title);
    if (!props?.sheetId) throw new Error(`Missing sheetId for ${title}`);
    await ensureHeaderAndFormat(title, props.sheetId, accessToken);
  }

  tabsReady = true;
  tabsReadyAtMs = nowMs;
  return { ok: true, created };
}

async function ensureHeaderAndFormat(title, sheetId, accessToken) {
  const sid = spreadsheetId();
  const a1 = `${toA1SheetName(title)}!A1:Z1`;
  const rows = await sheetsGetValues(sid, a1, accessToken);
  const firstRow = Array.isArray(rows?.[0]) ? rows[0] : [];
  const expected = HEADERS[title];

  const matches =
    firstRow.length >= expected.length &&
    expected.every((h, idx) => String(firstRow[idx] || "").trim() === h);

  if (!matches) {
    const hasAny = firstRow.some((c) => String(c || "").trim().length > 0);
    if (hasAny) {
      await sheetsBatchUpdate(
        sid,
        [
          {
            insertDimension: {
              range: { sheetId, dimension: "ROWS", startIndex: 0, endIndex: 1 },
              inheritFromBefore: false,
            },
          },
        ],
        accessToken,
      );
    }
    await sheetsUpdateValues(sid, `${toA1SheetName(title)}!A1:${colLetter(expected.length)}1`, [expected], accessToken);
  }

  // Freeze header row (best-effort).
  await sheetsBatchUpdate(
    sid,
    [
      {
        updateSheetProperties: {
          properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
          fields: "gridProperties.frozenRowCount",
        },
      },
    ],
    accessToken,
  );
}

function colLetter(n) {
  // 1 -> A
  let x = n;
  let s = "";
  while (x > 0) {
    const r = (x - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    x = Math.floor((x - 1) / 26);
  }
  return s;
}

export async function appendLog({ type, inviteId = "", anonDeviceId = "", payload }) {
  const sid = spreadsheetId();
  const accessToken = await getAccessToken(SCOPE_RW);
  await ensureMvpTabs();
  const d = new Date();
  const formatDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const row = [
    formatDate,
    type,
    inviteId,
    anonDeviceId,
    payload ? JSON.stringify(payload) : "",
  ];
  await sheetsAppendRow(sid, `${toA1SheetName(TAB_LOGS)}!A1:E1`, row, accessToken);
}

export async function appendInvite(inviteRow) {
  const sid = spreadsheetId();
  const accessToken = await getAccessToken(SCOPE_RW);
  await ensureMvpTabs();
  await sheetsAppendRow(sid, `${toA1SheetName(TAB_INVITES)}!A1:Q1`, inviteRow, accessToken);
}

export async function appendView(viewRow) {
  const sid = spreadsheetId();
  const accessToken = await getAccessToken(SCOPE_RW);
  await ensureMvpTabs();
  await sheetsAppendRow(sid, `${toA1SheetName(TAB_VIEWS)}!A1:C1`, viewRow, accessToken);
}

export async function appendResponse(responseRow) {
  const sid = spreadsheetId();
  const accessToken = await getAccessToken(SCOPE_RW);
  await ensureMvpTabs();
  await sheetsAppendRow(sid, `${toA1SheetName(TAB_RESPONSES)}!A1:F1`, responseRow, accessToken);
}

export async function readAll(tab, maxRows = 5000) {
  const sid = spreadsheetId();
  const accessToken = await getAccessToken(SCOPE_RO);
  await ensureMvpTabs();
  const a1 = `${toA1SheetName(tab)}!A1:Z${maxRows}`;
  return await sheetsGetValues(sid, a1, accessToken);
}

export async function updateInviteRowById(inviteId, mutate) {
  const sid = spreadsheetId();
  const accessToken = await getAccessToken(SCOPE_RW);
  await ensureMvpTabs();

  const rows = await sheetsGetValues(sid, `${toA1SheetName(TAB_INVITES)}!A1:Q5000`, accessToken);
  const header = rows?.[0] || [];
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  const wantedLen = HEADERS[TAB_INVITES].length;

  for (let i = 1; i < rows.length; i += 1) {
    const r = rows[i];
    if (!r) continue;
    if (String(r[idx.id] || "") !== inviteId) continue;

    const rowIndex = i + 1; // 1-based
    const current = Array.from({ length: wantedLen }, (_, j) => String(r[j] ?? ""));
    const next = mutate(current, idx) || current;

    const range = `${toA1SheetName(TAB_INVITES)}!A${rowIndex}:Q${rowIndex}`;
    await sheetsUpdateValues(sid, range, [next], accessToken);
    return { ok: true, rowIndex };
  }

  return { ok: false, error: "not_found" };
}


