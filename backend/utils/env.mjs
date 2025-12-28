import fs from "node:fs";
import path from "node:path";

let loaded = false;

function stripOuterQuotes(value) {
  if (
    (value.startsWith("\"") && value.endsWith("\"")) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function isJsonBalanced(text) {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === "\"") {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") depth += 1;
    if (ch === "}") depth -= 1;
  }

  return depth === 0;
}

export function loadEnvLocalOnce() {
  if (loaded) return;
  loaded = true;

  try {
    const envPath = path.resolve(process.cwd(), ".env.local");
    if (!fs.existsSync(envPath)) return;

    const text = fs.readFileSync(envPath, "utf8");
    const lines = text.split(/\r?\n/);

    for (let i = 0; i < lines.length; i += 1) {
      const rawLine = lines[i];
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;

      const idx = line.indexOf("=");
      if (idx <= 0) continue;

      const key = line.slice(0, idx).trim();
      let value = rawLine.slice(rawLine.indexOf("=") + 1);

      if (!key) continue;
      if (process.env[key] && process.env[key].length > 0) continue;

      value = value.trim();
      const unquoted = stripOuterQuotes(value).trim();

      // Multiline JSON (service account key) support.
      if (unquoted.startsWith("{") && !isJsonBalanced(unquoted)) {
        let collected = unquoted;
        while (i + 1 < lines.length && !isJsonBalanced(collected)) {
          i += 1;
          collected += `\n${lines[i]}`;
        }
        process.env[key] = collected;
        continue;
      }

      process.env[key] = stripOuterQuotes(value);
    }
  } catch {
    // ignore
  }
}


