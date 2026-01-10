#!/usr/bin/env node

/**
 * Script de test pour reproduire l'erreur 500 sur /api/invite-responses
 * Usage: node test-invite-responses.mjs [port] [inviteId]
 */

import http from "node:http";

const PORT = process.argv[2] ? Number.parseInt(process.argv[2], 10) : 8787;
const INVITE_ID = process.argv[3] || "675e820bf01d024cf29c217f8d01d84d";
const BASE_URL = `http://localhost:${PORT}`;

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const RESET = "\x1b[0m";

function makeRequest(method, path) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port || PORT,
      path: url.pathname + url.search,
    };

    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        try {
          const json = data ? JSON.parse(data) : null;
          resolve({ status: res.statusCode, headers: res.headers, body: json, raw: data });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, body: data, raw: data });
        }
      });
    });

    req.on("error", (err) => {
      reject(err);
    });

    req.end();
  });
}

async function testInviteResponses() {
  console.log(`\n🧪 Test GET /api/invite-responses\n`);
  console.log(`InviteId: ${INVITE_ID}`);
  
  // Reproduire l'URL exacte de l'erreur
  const params = new URLSearchParams({
    inviteId: INVITE_ID,
    anon_device_id: "a39461625db98039b0abe7de71a3214f",
    is_organizer: "1",
    confirm_by: "2026-01-10T22:00",
    capacity_max: "",
    title: "TTEsts",
    when_at: "2026-01-10T22:30",
    when_has_time: "1",
  });

  const path = `/api/invite-responses?${params.toString()}`;
  console.log(`URL: ${BASE_URL}${path}\n`);

  try {
    const response = await makeRequest("GET", path);
    console.log(`Status: ${response.status}`);
    console.log(`Response:`, JSON.stringify(response.body, null, 2));
    
    if (response.status === 200) {
      console.log(`\n${GREEN}✓${RESET} Requête réussie\n`);
      return { success: true };
    } else {
      console.log(`\n${RED}✗${RESET} Erreur ${response.status}\n`);
      console.log(`Détails:`, response.body);
      return { success: false, error: response.body };
    }
  } catch (err) {
    console.log(`\n${RED}✗${RESET} Erreur réseau: ${err.message}\n`);
    return { success: false, error: err.message };
  }
}

async function main() {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Test GET /api/invite-responses`);
  console.log(`Port: ${PORT}`);
  console.log(`${"=".repeat(60)}`);

  const result = await testInviteResponses();

  console.log(`${"=".repeat(60)}\n`);
  
  if (result.success) {
    console.log(`${GREEN}✓ Test réussi${RESET}\n`);
    process.exit(0);
  } else {
    console.log(`${RED}✗ Test échoué${RESET}\n`);
    console.log(`Erreur: ${JSON.stringify(result.error, null, 2)}\n`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`${RED}Erreur fatale:${RESET}`, err);
  process.exit(1);
});

