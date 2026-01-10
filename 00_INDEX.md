PM NOTE — 00_INDEX.md (version consolidée v2)

- But :
  Servir de **source de vérité unique** pour LSDTS.
  Donner le cadre minimal lisible par tous les agents Cursor.
  Fixer les invariants et l’ordre d’exécution sans refaire le produit.

- Positionnement (1 phrase) :
  LSDTS est un outil de **prise de position et de décision**, conçu pour éviter l’attentisme et produire de la clarté.

- Principes structurants (non explicatifs) :
  - Une décision existe uniquement sur le lien LSDTS.
  - Répondre est un acte irréversible (YES/NO définitifs, MAYBE modifiable 1x uniquement).
  - Toute action utilisateur **doit produire une valeur perceptible immédiate**.
  - Toute action utilisateur **doit débloquer de l’information**.
  - L’opacité est acceptable avant réponse, jamais après.
  - La visibilité est conditionnelle, jamais gratuite.
  - LSDTS n’est pas un espace de discussion.

- Glossaire minimal :
  - Invitation : objet décisionnel partagé par lien.
  - OPEN : invitation active, réponses possibles.
  - CLOSED : invitation clôturée, verdict figé.
  - Position : réponse utilisateur (YES / NO / MAYBE).
  - Verdict : résultat final (“Ça se fait” / “Ça ne se fait pas”).
  - Seuil : nombre minimal de YES requis (invisible côté invités).

- Règles de visibilité (résumé) :
  - Avant réponse (OPEN, non-répondant) :
    - Deadline visible
    - "X positions prises"
    - Aucune liste, aucun détail
  - Après réponse (OPEN, répondant) :
    - Liste des **YES uniquement**
    - Pas de NO / MAYBE
    - Pas de non-répondants
  - Après clôture (CLOSED) :
    - Verdict
    - Liste des YES (neutre, factuelle)
  - Organisateur uniquement (OPEN et CLOSED) :
    - Liste YES avec compteur
    - Liste MAYBE avec compteur (si count > 0)
    - Stats : Indisponibles (count NO), Vues unique, Non répondant
    - Breakdown complet YES/NO/MAYBE
  - Jamais (pour les invités) :
    - vues uniques
    - breakdown complet YES/NO/MAYBE
    - visibilité des absents

- OpenGraph (verrouillé) :
  - Ligne 1 :
    → **Titre de la proposition** (court, factuel)
  - Ligne 2 :
    → **Décision avant HH:MM**
  - Ligne 3 :
    → **Répondre ici 👈**
  - Interdits :
    - lieu
    - statut
    - nom d’organisateur
    - liste de participants
    - emoji hors 👈

- Ordre d'implémentation (P0) :
  1) Core logic (OPEN/CLOSED, seuil invisible, verdict, irréversibilité)
  2) Privacy / Visibility (opacité conditionnelle, visibilité YES post-réponse)
  3) OpenGraph minimal + surfaces de partage
  4) Copy (wording, textes exacts, source de vérité)
  5) UI-UX States (layout, structure, rendu par état)

- Hors scope explicite :
  - discussion
  - chat
  - likes / réactions
  - gamification
  - pression sociale temps réel

- Rôle de ce document :
  - Référence obligatoire pour tous les agents
  - Aucun agent ne peut contredire ce document
  - Toute ambiguïté → retour PM (ici)
