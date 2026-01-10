#!/usr/bin/env node

/**
 * Script de test pour vérifier la logique de timezone
 * Tests : conversion UTC, parsing, clôture, affichage
 */

import { parseDateUTC, parseDateLocalOrUtc } from "./api/_utils.js";
import { computeStatus, computeVerdict } from "./api/_inviteUtils.js";

// Couleurs pour la sortie
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const RESET = "\x1b[0m";

let testsPassed = 0;
let testsFailed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`${GREEN}✓${RESET} ${name}`);
    testsPassed++;
  } catch (error) {
    console.log(`${RED}✗${RESET} ${name}`);
    console.log(`  ${RED}Erreur:${RESET} ${error.message}`);
    testsFailed++;
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || "Assertion failed");
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(
      message || `Expected ${expected}, got ${actual}`
    );
  }
}

console.log("\n🧪 Tests de timezone LSDTS\n");

// ============================================
// Tests de parsing UTC
// ============================================

test("parseDateUTC - Parse une date en UTC", () => {
  const dateStr = "2024-12-20T21:00";
  const parsed = parseDateUTC(dateStr);
  assert(parsed !== null, "Date should be parsed");
  assertEqual(parsed.getUTCHours(), 21, "UTC hour should be 21");
  assertEqual(parsed.getUTCMinutes(), 0, "UTC minutes should be 0");
});

test("parseDateUTC - Retourne null pour format invalide", () => {
  const parsed = parseDateUTC("invalid");
  assert(parsed === null, "Should return null for invalid format");
});

test("parseDateUTC - Fallback sur parseDateLocalOrUtc pour anciennes invitations", () => {
  // Simuler une ancienne invitation stockée en heure locale serveur
  const localDate = parseDateLocalOrUtc("2024-12-20T21:00");
  assert(localDate !== null, "Local date should be parsed");
});

// ============================================
// Tests de conversion UTC (simulation frontend)
// ============================================

test("Conversion heure locale → UTC (simulation frontend)", () => {
  // Simuler un utilisateur en UTC+1 (France) qui sélectionne 21:00 heure locale
  const userLocalTime = new Date(2024, 11, 20, 21, 0, 0, 0); // 21:00 heure locale
  const utcYear = userLocalTime.getUTCFullYear();
  const utcMonth = String(userLocalTime.getUTCMonth() + 1).padStart(2, "0");
  const utcDate = String(userLocalTime.getUTCDate()).padStart(2, "0");
  const utcHours = String(userLocalTime.getUTCHours()).padStart(2, "0");
  const utcMinutes = String(userLocalTime.getUTCMinutes()).padStart(2, "0");
  const utcString = `${utcYear}-${utcMonth}-${utcDate}T${utcHours}:${utcMinutes}`;
  
  // Parser comme UTC
  const parsed = parseDateUTC(utcString);
  assert(parsed !== null, "UTC string should be parsed");
  
  // Vérifier que le timestamp est correct
  const expectedTimestamp = userLocalTime.getTime();
  const actualTimestamp = parsed.getTime();
  assertEqual(actualTimestamp, expectedTimestamp, "Timestamps should match");
});

// ============================================
// Tests de clôture
// ============================================

test("computeStatus - OPEN avant deadline", () => {
  const now = new Date("2024-12-20T20:00:00Z");
  const confirmByUTC = "2024-12-20T21:00";
  const invite = { confirm_by: confirmByUTC };
  const status = computeStatus(invite, 0, now);
  assertEqual(status.status, "OPEN", "Should be OPEN before deadline");
});

test("computeStatus - CLOSED après deadline", () => {
  const now = new Date("2024-12-20T21:00:00Z");
  const confirmByUTC = "2024-12-20T21:00";
  const invite = { confirm_by: confirmByUTC };
  const status = computeStatus(invite, 0, now);
  assertEqual(status.status, "CLOSED", "Should be CLOSED after deadline");
  assertEqual(status.closureCause, "EXPIRED", "Closure cause should be EXPIRED");
});

test("computeStatus - CLOSED exactement à la deadline", () => {
  // Créer une date exactement à 21:00 UTC
  const confirmByUTC = "2024-12-20T21:00";
  const parsed = parseDateUTC(confirmByUTC);
  const now = new Date(parsed.getTime()); // Exactement à la deadline
  const invite = { confirm_by: confirmByUTC };
  const status = computeStatus(invite, 0, now);
  assertEqual(status.status, "CLOSED", "Should be CLOSED at exact deadline");
});

test("computeStatus - CLOSED par capacity_max", () => {
  const now = new Date("2024-12-20T20:00:00Z");
  const confirmByUTC = "2024-12-20T21:00";
  const invite = { confirm_by: confirmByUTC, capacity_max: 5 };
  const status = computeStatus(invite, 5, now);
  assertEqual(status.status, "CLOSED", "Should be CLOSED when capacity_max reached");
  assertEqual(status.closureCause, "FULL", "Closure cause should be FULL");
});

// ============================================
// Tests de verdict
// ============================================

test("computeVerdict - SUCCESS si count(YES) >= capacityMin", () => {
  const invite = { capacity_min: 3 };
  const verdict = computeVerdict(invite, 3);
  assertEqual(verdict, "SUCCESS", "Should be SUCCESS when YES >= capacityMin");
});

test("computeVerdict - FAILURE si count(YES) < capacityMin", () => {
  const invite = { capacity_min: 3 };
  const verdict = computeVerdict(invite, 2);
  assertEqual(verdict, "FAILURE", "Should be FAILURE when YES < capacityMin");
});

test("computeVerdict - Valeur par défaut capacityMin = 2", () => {
  const invite = {};
  const verdict1 = computeVerdict(invite, 2);
  const verdict2 = computeVerdict(invite, 1);
  assertEqual(verdict1, "SUCCESS", "Should be SUCCESS with default capacityMin=2 and YES=2");
  assertEqual(verdict2, "FAILURE", "Should be FAILURE with default capacityMin=2 and YES=1");
});

// ============================================
// Tests de scénario réel
// ============================================

test("Scénario réel - Utilisateur UTC+1 crée invitation 21:00 locale", () => {
  // 1. Utilisateur sélectionne 21:00 heure locale (UTC+1)
  const userLocalTime = new Date(2024, 11, 20, 21, 0, 0, 0);
  
  // 2. Frontend convertit en UTC
  const formatDateUTC = (d) => {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const da = String(d.getUTCDate()).padStart(2, "0");
    const hh = String(d.getUTCHours()).padStart(2, "0");
    const mm = String(d.getUTCMinutes()).padStart(2, "0");
    return `${y}-${m}-${da}T${hh}:${mm}`;
  };
  const confirmByUTC = formatDateUTC(userLocalTime);
  
  // 3. Serveur parse en UTC
  const parsed = parseDateUTC(confirmByUTC);
  assert(parsed !== null, "Should parse UTC date");
  
  // 4. Vérifier clôture à 21:00 UTC (qui est 22:00 heure locale)
  const nowBefore = new Date(parsed.getTime() - 60000); // 1 min avant
  const nowAfter = new Date(parsed.getTime() + 60000); // 1 min après
  
  const invite = { confirm_by: confirmByUTC };
  const statusBefore = computeStatus(invite, 0, nowBefore);
  const statusAfter = computeStatus(invite, 0, nowAfter);
  
  assertEqual(statusBefore.status, "OPEN", "Should be OPEN before deadline");
  assertEqual(statusAfter.status, "CLOSED", "Should be CLOSED after deadline");
});

test("Scénario réel - Affichage en heure locale", () => {
  // Date stockée en UTC
  const confirmByUTC = "2024-12-20T20:00"; // 20:00 UTC
  const parsed = parseDateUTC(confirmByUTC);
  assert(parsed !== null, "Should parse UTC date");
  
  // Simuler affichage en France (UTC+1)
  // toLocaleString convertit automatiquement
  const localString = parsed.toLocaleString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Paris"
  });
  
  // Vérifier que l'heure affichée est 21:00 (20:00 UTC + 1h)
  assert(localString.includes("21"), "Should display 21:00 in Europe/Paris timezone");
});

// ============================================
// Tests de rétrocompatibilité
// ============================================

test("Rétrocompatibilité - Ancienne invitation en heure locale", () => {
  // Simuler une ancienne invitation stockée en heure locale serveur
  const oldFormat = "2024-12-20T21:00"; // Format ancien (heure locale)
  
  // computeStatus doit gérer avec fallback
  const now = new Date("2024-12-20T20:00:00Z");
  const invite = { confirm_by: oldFormat };
  const status = computeStatus(invite, 0, now);
  
  // Le statut doit être calculé (pas d'erreur)
  assert(status.status === "OPEN" || status.status === "CLOSED", "Should compute status even with old format");
});

// ============================================
// Résumé
// ============================================

console.log("\n" + "=".repeat(50));
console.log(`\n${testsPassed} tests réussis, ${testsFailed} tests échoués\n`);

if (testsFailed === 0) {
  console.log(`${GREEN}✓ Tous les tests sont passés !${RESET}\n`);
  process.exit(0);
} else {
  console.log(`${RED}✗ Certains tests ont échoué${RESET}\n`);
  process.exit(1);
}

