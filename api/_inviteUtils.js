// Fonctions utilitaires partagées pour la gestion des invitations
import { parseDateLocalOrUtc, parseDateUTC } from "./_utils.js";

/**
 * Calcule le statut d'une invitation
 * @param {Object} invite - L'invitation avec confirm_by et capacity_max
 * @param {number} yesCount - Nombre de réponses "YES"
 * @param {Date} now - Date actuelle
 * @returns {{status: string, closureCause: string}}
 */
export function computeStatus(invite, yesCount, now) {
  if (!invite?.confirm_by) return { status: "OPEN", closureCause: "" };
  // Parser confirm_by en UTC (stocké en UTC depuis la création)
  const confirmBy = parseDateUTC(invite.confirm_by) || parseDateLocalOrUtc(invite.confirm_by);
  if (!confirmBy) return { status: "OPEN", closureCause: "" };
  // Utiliser >= pour fermer dès que l'heure est atteinte (important pour "confirmation immédiate")
  // Les timestamps sont toujours en UTC, donc la comparaison est cohérente
  if (now.getTime() >= confirmBy.getTime()) return { status: "CLOSED", closureCause: "EXPIRED" };
  // capacity_max atteint : fermer avec CLOSED (pas d'état FULL séparé)
  if (invite.capacity_max !== null && yesCount >= invite.capacity_max)
    return { status: "CLOSED", closureCause: "FULL" };
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
  // Parser confirm_by en UTC (stocké en UTC depuis la création)
  const confirmBy = parseDateUTC(invite.confirm_by) || parseDateLocalOrUtc(invite.confirm_by);
  // Utiliser >= pour être cohérent avec computeStatus (convertit dès que l'heure est atteinte)
  // Les timestamps sont toujours en UTC, donc la comparaison est cohérente
  if (!confirmBy || now.getTime() < confirmBy.getTime()) return counts;
  // MAYBE counts as NO after expiration (server conversion).
  return { ...counts, no: counts.no + counts.maybe, maybe: 0 };
}

/**
 * Calcule le verdict d'une invitation clôturée
 * @param {Object} invite - L'invitation avec capacity_min
 * @param {number} yesCount - Nombre de réponses "YES"
 * @returns {string} "SUCCESS" ou "FAILURE"
 */
export function computeVerdict(invite, yesCount) {
  const capacityMin = invite?.capacity_min !== null && invite?.capacity_min !== undefined
    ? Number.parseInt(String(invite.capacity_min), 10)
    : 2;
  if (Number.isNaN(capacityMin) || capacityMin < 2) {
    // Valeur par défaut si invalide
    return yesCount >= 2 ? "SUCCESS" : "FAILURE";
  }
  return yesCount >= capacityMin ? "SUCCESS" : "FAILURE";
}

