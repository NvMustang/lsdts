# Configuration Vercel Blob Storage

## Étapes de configuration sur Vercel

1. **Aller dans le dashboard Vercel**
   - Ouvrir votre projet LSDTS
   - Aller dans l'onglet "Storage"

2. **Créer un Blob Store**
   - Cliquer sur "Create Database"
   - Sélectionner "Blob"
   - Donner un nom (ex: "lsdts-images")
   - Cliquer sur "Create"

3. **Variables d'environnement**
   - Les variables `BLOB_READ_WRITE_TOKEN` seront automatiquement ajoutées au projet
   - Aucune configuration manuelle nécessaire

4. **Redéployer**
   - Les variables d'environnement sont disponibles immédiatement
   - Le prochain déploiement utilisera automatiquement le Blob Storage

## Limites du plan gratuit (Hobby)

- **Stockage** : 1GB
- **Bandwidth** : 1GB/mois
- Soit environ 2000-5000 images (200-500KB chacune)

## Vérification

Pour vérifier que Vercel Blob est bien configuré :
- Créer une invitation avec une image
- L'image doit être uploadée vers `https://[store-id].public.blob.vercel-storage.com/[filename]`
- L'URL doit être stockée dans Google Sheets (colonne `og_image_url`)

## Troubleshooting

Si l'upload échoue :
- Vérifier que le Blob Store est bien créé
- Vérifier que `BLOB_READ_WRITE_TOKEN` est présent dans les variables d'environnement
- Redéployer le projet si nécessaire
