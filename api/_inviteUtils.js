// Fonctions utilitaires partagées pour la gestion des invitations
import { parseDateLocalOrUtc } from "./_utils.js";

/**
 * Calcule le statut d'une invitation
 * @param {Object} invite - L'invitation avec confirm_by et capacity_max
 * @param {number} yesCount - Nombre de réponses "YES"
 * @param {Date} now - Date actuelle
 * @returns {{status: string, closureCause: string}}
 */
export function computeStatus(invite, yesCount, now) {
  if (!invite?.confirm_by) return { status: "OPEN", closureCause: "" };
  // Parser la date (format local YYYY-MM-DDTHH:MM)
  const confirmBy = parseDateLocalOrUtc(invite.confirm_by);
  if (!confirmBy) return { status: "OPEN", closureCause: "" };
  // Utiliser >= pour fermer dès que l'heure est atteinte (important pour "confirmation immédiate")
  if (now.getTime() >= confirmBy.getTime()) return { status: "CLOSED", closureCause: "EXPIRED" };
  if (invite.capacity_max !== null && yesCount >= invite.capacity_max)
    return { status: "FULL", closureCause: "FULL" };
  return { status: "OPEN", closureCause: "" };
}

/**
 * Convertit les MAYBE en NO si l'invitation est expirée
 * @param {Object} invite - L'invitation avec confirm_by
 * @param {Date} now - Date actuelle
 * @param {{yes: number, no: number, maybe: number}} counts - Compteurs de réponses
 * @returns {{yes: number, no: number, maybe: number}}
 */
export function convertMaybeToNoIfExpired(invite, now, counts) {
  if (!invite?.confirm_by) return counts;
  // Utiliser parseDateLocalOrUtc pour gérer correctement les dates locales et UTC
  const confirmBy = parseDateLocalOrUtc(invite.confirm_by);
  // Utiliser >= pour être cohérent avec computeStatus (convertit dès que l'heure est atteinte)
  if (!confirmBy || now.getTime() < confirmBy.getTime()) return counts;
  // MAYBE counts as NO after expiration (server conversion).
  return { ...counts, no: counts.no + counts.maybe, maybe: 0 };
}

