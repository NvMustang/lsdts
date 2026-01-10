# P0_05 — UI-UX States

## Objectif
Définir le **rendu UI par état** : layout, structure, ordre des blocs, comportement. Pas de variantes.

## Périmètre
- Layout et structure (ordre des blocs)
- Comportement UI par état
- Visibilité/masquage des éléments
- Transitions entre états

## Hors périmètre
- Textes exacts (définis dans P0_04 Copy)
- Design visuel (P0_06)
- OpenGraph (P0_03)
- Logique métier (P0_01)
- Règles de visibilité détaillées (P0_02)

## Terminologie
- OPEN = invitation ouverte, réponses possibles
- CLOSED = invitation clôturée, verdict
- Statuts user: UNDECIDED, YES, NO, MAYBE ("À confirmer")

---

## Layout OPEN (ordre strict, sans scroll mobile)
1) Bloc Échéance (countdown)
2) Bloc Avancement
3) Bloc principal (varie selon statut)
4) Bloc Règles (visible si UNDECIDED ou MAYBE, positionné sous les CTA)

### Bloc Règles
- Visible si UNDECIDED ou MAYBE
- Positionné sous le bloc CTA
- 2 lignes (texte défini dans P0_04)

### Bloc Échéance
- Toujours visible en OPEN (tous statuts)
- Format factuel (texte défini dans P0_04)

### Bloc Avancement
- Toujours visible en OPEN (tous statuts)
- Texte unique (défini dans P0_04)
- Aucun détail YES/NO/MAYBE

---

## État OPEN / UNDECIDED
- Bloc "Ton prénom" : champ input dans un bloc séparé (bloc distinct du bloc CTA)
- Bloc CTA : 3 CTA empilés verticalement dans l'ordre :
  1) "J'y vais"
  2) "À confirmer"
  3) "Indisponible"
- Bloc Règles : affiché sous le bloc CTA (2 lignes)
- Comportement : clic sur CTA inactif (désactivé) focus automatiquement le champ prénom
- Aucune liste participants visible
- Aucun compteur détaillé
- Aucun élément social (avatars, badges, likes)

---

## État OPEN / YES
- Le bloc CTA disparaît
- La liste YES devient visible immédiatement (sans refresh)
- La liste ne montre que les participants YES (pas de NO, pas de MAYBE, pas de non-répondants)
- Le nom de l'utilisateur apparaît dans la liste YES
- Bouton "Copier le lien" visible (label défini dans P0_04, visible pour organisateur et YES)
- Stats organisateur visibles en fin de page (breakdown complet uniquement) - voir P0_02
- Aucune mention :
  - de changement possible
  - d'attente d'autres réponses
  - de seuil / capacityMin

## État OPEN / Organisateur
- Voit la liste YES (avec compteur)
- Voit la liste MAYBE (avec compteur, uniquement si count > 0, ne s'affiche pas si count = 0)
- Bloc stats (une seule ligne, séparées par " - ") : "Indisponibles: X - Vues unique: Y - Non répondant: Z"
  - Indisponibles : count NO uniquement (pas de liste de noms)
  - Vues unique : nombre de vues dédupliquées
  - Non répondant : différence entre vues uniques et somme de toutes les réponses (YES + NO + MAYBE)
- Bouton "Copier le lien" visible

---

## État OPEN / NO
- Le bloc CTA disparaît
- La liste YES devient visible immédiatement (sans refresh)
- L'utilisateur n'apparaît pas dans la liste YES
- Pas de bouton "Copier le lien" (réservé à l'organisateur et YES)

---

## État OPEN / MAYBE ("À confirmer")
- Le bloc CTA initial disparaît
- Afficher une phrase (texte défini dans P0_04)
- Afficher uniquement 2 CTA empilés (labels définis dans P0_04) :
  1) "Passer à J'y vais"
  2) "Passer à Indisponible"
- Bloc Règles : affiché sous le bloc CTA (2 lignes, même wording que UNDECIDED)
- Aucune liste participants visible (ni YES, ni MAYBE)

---

## État CLOSED
- L'utilisateur en MAYBE est traité comme NO (aucune mention de l'ancien statut)
- Afficher verdict (texte défini dans P0_04)
- Afficher liste YES (neutre, factuelle)
- Bouton "Recréer la proposition" visible (label défini dans P0_04)
- Stats organisateur visibles (même format que OPEN) - voir section "État OPEN / Organisateur"
- Aucune explication
- Aucun commentaire
- Pas de discussion

---

## Temps d'attente et affichage immédiat
- **Règle fondamentale** : Les temps d'attente doivent être réduits au maximum.
- **Affichage immédiat** : Les informations de base (titre, date, capacité) doivent être affichées immédiatement depuis l'URL, sans attendre le backend.
- **Chargement progressif** : Seule la liste des participants se charge ensuite via les requêtes backend.
- **Valeur perceptible immédiate** : L'utilisateur doit voir les informations de son organisation en attendant les réponses.
- **Pas d'écran de chargement** : Aucun spinner ou état "LOADING" visible si les données de base sont disponibles dans l'URL.

## Notes d'implémentation
- P0_05 définit la structure et le comportement UI
- Tous les textes sont dans P0_04 (source de vérité pour wording)
- Pas de variantes dans le rendu
- Les données de l'URL (titre, date, capacité) sont la source de vérité pour l'affichage immédiat
