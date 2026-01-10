# P0_01 — Core Logic (États, capacityMin, verdict, irréversibilité)

## Objectif
Garantir qu’une invitation LSDTS produise **une décision claire et finale**, sans ambiguïté, et sans possibilité de négociation ou de réécriture a posteriori.

## Périmètre
- États de l’invitation
- Création des réponses
- Capacité minimale (`capacityMin`)
- Clôture et verdict
- Irréversibilité des réponses

## Hors périmètre
- Wording / UI
- OpenGraph
- Visibilité des participants
- Stats
- Intégrations

## Concepts clés
- Invitation
- OPEN / CLOSED
- Position (YES / NO / MAYBE)
- capacityMin
- Verdict

## États de l'invitation
- **OPEN**
  - L'invitation accepte des réponses.
  - L'état OPEN est borné par une deadline (`expiresAt`).
  - L'invitation peut aussi être clôturée si `capacity_max` est atteint.
- **CLOSED**
  - L'invitation est clôturée automatiquement à `expiresAt` (closure_cause: "EXPIRED").
  - L'invitation est clôturée si `capacity_max` est atteint (closure_cause: "FULL").
  - Aucun changement n'est possible après passage à CLOSED.

Aucun autre état n'est autorisé.

## Création de l’invitation
- À la création d’une invitation, une réponse **YES est automatiquement créée pour l’organisateur**.
- L’organisateur compte toujours comme **1 YES initial**.
- Cette réponse :
  - est définitive
  - ne peut pas être supprimée
  - est traitée comme toute autre réponse YES

## Réponses (positions)
- Une réponse est une **prise de position**.
- Types autorisés :
  - YES
  - NO
  - MAYBE
- Une invitation accepte **une seule réponse par utilisateur**.
- Une réponse est **définitive** :
  - YES : impossible de modifier, supprimer, re-répondre
  - NO : impossible de modifier, supprimer, re-répondre
  - MAYBE : peut être modifiée **1x uniquement** vers YES ou NO (voir P0_05)

## Identification utilisateur
- Basée sur l’identifiant existant (anonyme ou authentifié).
- La logique d’unicité doit empêcher toute double réponse.

## capacityMin (capacité minimale)
- Chaque invitation possède une `capacityMin`.
- `capacityMin` est un entier **≥ 2**.
- Valeur par défaut : **2**.
- Interprétation :
  - organisateur (YES initial)
  - + au moins **une autre personne**

- `capacityMin` est :
  - définie à la création (modifiable via formulaire)
  - obligatoire (minimum 2)
  - invisible côté invités
  - jamais recalculée dynamiquement

## Clôture
- La clôture est **automatique** à `expiresAt`.
- Aucune action utilisateur ne peut :
  - prolonger
  - rouvrir
  - modifier une invitation CLOSED

## Verdict
- Le verdict est calculé **uniquement à la clôture**.
- Règle :
  - Si `count(YES) >= capacityMin` → verdict = SUCCESS
  - Sinon → verdict = FAILURE
- Le verdict est :
  - binaire
  - définitif
  - identique pour tous les utilisateurs

## Contraintes fortes
- Aucun verdict intermédiaire.
- Aucun état “presque”, “en cours”, “il manque X”.
- Aucun recalcul après clôture.
- Aucun lien entre verdict et nombre de vues.

## Edge cases
- Invitation créée sans autre réponse que l’organisateur :
  - `count(YES) = 1`
  - verdict = FAILURE
- Réponse après `expiresAt` → rejetée
- Double soumission → rejetée

## Critères d'acceptation
- Une invitation passe automatiquement de OPEN à CLOSED (à `expiresAt` ou si `capacity_max` atteint).
- YES et NO sont définitifs et ne peuvent jamais être modifiés.
- MAYBE peut être modifiée 1x uniquement vers YES ou NO.
- `capacityMin` ne peut pas être < 2.
- Le verdict est cohérent, stable et binaire.
- Aucun état ou logique non décrite ici n'existe.

## Notes d’implémentation
- La logique doit être centralisée (pas dupliquée front/back).
- Toute tentative de contournement doit être bloquée côté backend.
