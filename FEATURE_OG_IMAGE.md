# Feature : Image personnalisée pour les invitations

## Périmètre

Ajout de la possibilité pour l'organisateur d'uploader une image personnalisée qui sera utilisée :
- Dans le formulaire d'invitation (header visuel)
- Dans l'Open Graph (fond avec titre par-dessus)

## Fichiers créés

1. **api/upload-image.js**
   - Endpoint API pour l'upload d'images vers Vercel Blob
   - Validation : formats jpg/png/webp, max 2MB

2. **src/components/ImageCropper.jsx**
   - Composant React pour crop et zoom de l'image
   - Interface drag + slider zoom
   - Cadre fixe 1200x630 (ratio OG)

3. **VERCEL_BLOB_SETUP.md**
   - Documentation pour configurer Vercel Blob Storage

4. **FEATURE_OG_IMAGE.md**
   - Ce fichier récapitulatif

## Fichiers modifiés

1. **api/_mvpStore.js**
   - Ajout colonne `og_image_url` dans HEADERS[TAB_INVITES]

2. **api/_utils.js**
   - Ajout `og_image_url` dans le retour de `findInviteInRows()`

3. **api/invites.js**
   - Acceptation et stockage de `og_image_url` à la création

4. **api/og-image.js**
   - Génération dynamique avec image uploadée comme fond
   - Titre centré avec text-stroke blanc 4px + drop shadow noire
   - Fallback : fond crème actuel si pas d'image

5. **src/App.jsx**
   - Import de `ImageCropper`
   - États pour gérer upload/crop/preview
   - UI d'upload dans `CreateView` (entre "Quoi" et "Quand")
   - Passage de `og_image_url` dans query param `img`
   - Affichage de l'image en header dans `InviteContainer`

6. **src/lib/utils.js**
   - Ajout paramètre `img` dans `parseUrlParams()`

7. **styles/lsdts.css**
   - Styles pour `ImageCropper` (container, slider, actions)
   - Styles pour preview d'upload
   - Styles pour header image dans l'invitation

8. **package.json**
   - Ajout dépendance `@vercel/blob`

## Workflow utilisateur

### Création d'invitation avec image

1. Organisateur remplit le formulaire "Nouvelle invitation"
2. Clique sur "Uploader une image" (optionnel)
3. Sélectionne une image (jpg/png/webp, max 2MB)
4. Modal s'ouvre avec l'image
5. Ajuste position (drag) et zoom (slider)
6. Clique "Valider"
7. Image uploadée vers Vercel Blob
8. Preview affichée dans le formulaire
9. Crée l'invitation
10. URL de l'image stockée dans Google Sheets + passée en query param

### Affichage pour les invités

1. Ouvre le lien d'invitation
2. Image affichée en header (200px mobile / 300px desktop)
3. Titre et infos en dessous

### Open Graph

1. Lien partagé sur WhatsApp/Messenger/Telegram
2. Image custom utilisée comme fond
3. Titre centré par-dessus avec effet text-stroke
4. Si pas d'image : fond crème actuel (backward compatible)

## Configuration requise

**Vercel Blob Storage** :
- Créer un Blob Store dans le dashboard Vercel
- Variables automatiquement configurées
- Voir VERCEL_BLOB_SETUP.md pour détails

## Tests à effectuer

1. **Upload et crop**
   - [ ] Upload image jpg
   - [ ] Upload image png
   - [ ] Upload image webp
   - [ ] Rejet format non supporté
   - [ ] Rejet taille > 2MB
   - [ ] Drag pour repositionner
   - [ ] Slider zoom
   - [ ] Annulation du crop

2. **Création invitation**
   - [ ] Création avec image
   - [ ] Création sans image (backward compatible)
   - [ ] Image stockée dans Sheet
   - [ ] URL dans query param `img`

3. **Affichage invitation**
   - [ ] Image affichée en header (avec image)
   - [ ] Pas d'image si non uploadée
   - [ ] Responsive mobile/desktop

4. **Open Graph**
   - [ ] OG avec image custom (WhatsApp/Messenger/Telegram)
   - [ ] Titre lisible sur l'image (text-stroke + shadow)
   - [ ] OG par défaut si pas d'image

## Respect des règles dev

- ✅ Une feature = un périmètre (upload image OG)
- ✅ Pas de modification autre que celle demandée
- ✅ Backward compatible (sans image = comportement actuel)
- ✅ Respect de 00_INDEX et SPEC (pas de changement UX global)
- ✅ Pas de refactor opportuniste
