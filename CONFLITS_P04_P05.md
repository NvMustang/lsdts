# Conflits entre P0_04 (Copy) et P0_05 (UI-UX States)

## Conflit 1 : Texte de cadrage principal — Irréversibilité

### P0_04 (lignes 35-40)
```
Prendre position

Répondre ici est une décision.
Ta réponse ne pourra pas être modifiée.

Les participants seront affichés après ta prise de position.
```

### P0_05 (lignes 17-19)
```
Réponse définitive. Seul À confirmer peut être modifié.
Les participants sont visibles après réponse.
```

**Conflit:**
- P0_04 : "Ta réponse ne pourra pas être modifiée" (absolu, aucune exception)
- P0_05 : "Seul À confirmer peut être modifié" (exception explicite)

**Impact:** Message contradictoire à l'utilisateur.

---

## Conflit 2 : Temps du verbe — Visibilité participants

### P0_04 (ligne 40)
```
Les participants seront affichés après ta prise de position.
```
- Futur ("seront")

### P0_05 (ligne 19)
```
Les participants sont visibles après réponse.
```
- Présent ("sont")

**Conflit:** Temps grammatical différent pour le même concept.

**Impact:** Cohérence linguistique.

---

## Conflit 3 : Structure du texte

### P0_04
- 4 lignes avec titre "Prendre position" (gras)
- Structure hiérarchique claire

### P0_05
- 2 lignes sans titre
- Structure plate

**Conflit:** Format et structure différents.

**Impact:** Rendu UI non aligné.

---

## Conflit 4 : P0_01 vs P0_05 — Irréversibilité MAYBE

### P0_01 (lignes 52-55)
```
Une réponse est définitive :
- impossible de modifier
- impossible de supprimer
- impossible de re-répondre
```

### P0_05 (lignes 50-57)
```
État OPEN / MAYBE ("À confirmer")
- Afficher une seule phrase:
  "À confirmer est compté comme NON. Vous pouvez toutefois modifier 1x votre réponse."
- Afficher uniquement 2 CTA empilés:
  - "Passer à J'y vais"
  - "Passer à Indisponible"
```

**Conflit:**
- P0_01 : Toute réponse est irréversible (absolu)
- P0_05 : MAYBE peut être modifié (1x)

**Impact:** Logique métier contradictoire.

---

## Synthèse

**Conflits identifiés:** 4

1. **Irréversibilité absolue vs exception MAYBE** (P0_04 vs P0_05)
2. **Temps grammatical** (futur vs présent)
3. **Structure du texte** (4 lignes avec titre vs 2 lignes)
4. **Logique métier** (P0_01 vs P0_05)

**Priorité:** Critique — Les conflits 1 et 4 touchent la logique métier et le message utilisateur.

---

## Recommandations

### Option A : Aligner P0_05 sur P0_04
- Utiliser le texte complet de P0_04
- Supprimer l'exception MAYBE de P0_05
- Rendre MAYBE irréversible (comme YES/NO)

### Option B : Aligner P0_04 sur P0_05
- Modifier P0_04 pour mentionner l'exception MAYBE
- Adapter P0_01 pour autoriser modification MAYBE (1x)

### Option C : Clarifier la hiérarchie
- Si INDEX > SPEC, déterminer quelle spec prime
- Documenter l'exception MAYBE dans P0_01 et P0_04

**Décision requise:** PM doit trancher selon INDEX (ligne 74: "En cas de conflit : INDEX > SPEC > reste").

