#!/usr/bin/env node

/**
 * Script de test pour tester la création d'invitation (POST /api/invites)
 * Usage: node test-create-invite.mjs [port]
 */

import http from "node:http";

const PORT = process.argv[2] ? Number.parseInt(process.argv[2], 10) : 8787;
const BASE_URL = `http://localhost:${PORT}`;

// Couleurs
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const RESET = "\x1b[0m";

function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port || PORT,
      path: url.pathname + url.search,
      headers: {
        "Content-Type": "application/json",
      },
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

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

// Générer une date future (maintenant + 2h, arrondie à 30 min)
function getFutureDate() {
  const now = new Date();
  const future = new Date(now.getTime() + 2 * 60 * 60 * 1000); // +2h
  const minutes = future.getMinutes();
  const roundedMinutes = minutes < 30 ? 30 : 0;
  if (roundedMinutes === 0) {
    future.setHours(future.getHours() + 1);
  }
  future.setMinutes(roundedMinutes, 0, 0);
  
  // Formater en UTC pour le serveur
  const y = future.getUTCFullYear();
  const m = String(future.getUTCMonth() + 1).padStart(2, "0");
  const d = String(future.getUTCDate()).padStart(2, "0");
  const hh = String(future.getUTCHours()).padStart(2, "0");
  const mm = String(future.getUTCMinutes()).padStart(2, "0");
  return `${y}-${m}-${d}T${hh}:${mm}`;
}

async function testCreateInvite() {
  console.log(`\n🧪 Test création d'invitation (POST ${BASE_URL}/api/invites)\n`);

  // Test 1: Payload minimal valide
  console.log("Test 1: Payload minimal valide");
  const whenAtUTC = getFutureDate();
  const payload1 = {
    op: "create",
    title: "Test Event",
    when_at_local: whenAtUTC,
    confirm_offset: "30m",
    organizer_name: "Test Organizer",
    capacity_min: 2,
  };

  try {
    const response1 = await makeRequest("POST", "/api/invites", payload1);
    console.log(`  Status: ${response1.status}`);
    console.log(`  Response:`, JSON.stringify(response1.body, null, 2));
    
    if (response1.status === 200) {
      console.log(`${GREEN}✓${RESET} Création réussie\n`);
      return { success: true, invite: response1.body };
    } else {
      console.log(`${RED}✗${RESET} Erreur: ${response1.body?.error || response1.raw}\n`);
      return { success: false, error: response1.body?.error || response1.raw };
    }
  } catch (err) {
    console.log(`${RED}✗${RESET} Erreur réseau: ${err.message}\n`);
    return { success: false, error: err.message };
  }
}

async function testPing() {
  console.log("Test ping (vérification serveur)");
  try {
    const response = await makeRequest("GET", "/api/ping");
    if (response.status === 200) {
      console.log(`${GREEN}✓${RESET} Serveur accessible\n`);
      return true;
    } else {
      console.log(`${RED}✗${RESET} Serveur répond avec status ${response.status}\n`);
      return false;
    }
  } catch (err) {
    console.log(`${RED}✗${RESET} Serveur inaccessible: ${err.message}\n`);
    console.log(`${YELLOW}💡${RESET} Assurez-vous que le serveur est démarré: npm run dev:api\n`);
    return false;
  }
}

async function main() {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Test POST /api/invites`);
  console.log(`Port: ${PORT}`);
  console.log(`${"=".repeat(60)}\n`);

  // Test ping d'abord
  const serverOk = await testPing();
  if (!serverOk) {
    process.exit(1);
  }

  // Test création
  const result = await testCreateInvite();

  console.log(`${"=".repeat(60)}\n`);
  
  if (result.success) {
    console.log(`${GREEN}✓ Tous les tests sont passés${RESET}\n`);
    process.exit(0);
  } else {
    console.log(`${RED}✗ Test échoué${RESET}\n`);
    console.log(`Erreur: ${result.error}\n`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`${RED}Erreur fatale:${RESET}`, err);
  process.exit(1);
});

