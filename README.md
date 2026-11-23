# LiDAR HD Viewer

Visualiseur web minimaliste de nuages de points 3D — conçu pour les données
open data **LiDAR HD de l'IGN** (France), mais lit n'importe quel `.las` / `.laz` / `.copc.laz`.

Tout se passe **dans le navigateur** : aucun serveur, aucun compte, vos fichiers
ne quittent pas votre machine.

_Application en ligne : https://doumedtx.github.io/lidar-hd-viewer/ (déployée
automatiquement à chaque push sur `main`)._

## Fonctionnalités (v1)

## Fonctionnalités (v1)

- Import par glisser-déposer ou bouton (`.las`, `.laz`, `.copc.laz` — LAS 1.0 à 1.4 inclus)
- Chargement par URL directe d'un fichier (si le serveur autorise le CORS)
- Rendu GPU three.js : millions de points à 60 fps
- Coloration : **classification LAS** (sol / bâtiments / végétation / eau…), **altitude**
  (rampe de couleurs), **intensité**, couleur uniforme
- Filtres instantanés :
  - classes LAS cochables (avec % de points par classe + boutons Tout / Aucun / Sol seul)
  - plage d'altitude
  - densité (sous-échantillonnage 1/1 … 1/20)
  - taille des points
- Vues : 3D orbitale, vue de dessus, recadrage

## Utilisation

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # génère dist/ — site statique déployable partout
npm run test:parse # test du décodage LAS/LAZ sur le Nuage d'exemple fourni (fichier possible en argument : npm run test:parse -- fichier.laz)
```

Les archives `.7z` téléchargées depuis l'IGN doivent être extraites avant
l'import (le navigateur ne sait pas les lire).

## Obtenir des données LiDAR HD

1. [geoservices.ign.fr/lidarhd](https://geoservices.ign.fr/lidarhd) (ou cartes.gouv.fr)
2. « Nuages de points classés » → sélectionner la ou les dalles 1 × 1 km (fichiers `.copc.laz`)
3. Extraire l'archive 7z si besoin, puis glisser le `.copc.laz` dans le viewer

Licence des données : Etalab 2.0 (IGN). Une dalle ≈ 500 points/m², 10-20 M points.

## Stack technique

| Brique | Rôle |
| --- | --- |
| Vite + TypeScript | build, dev server |
| three.js | rendu GPU, contrôles orbitaux |
| @loaders.gl/las (laz-rs WASM) | décodage LAS/LAZ dans le navigateur |

### Décodage et mémoire

La mémoire vive est la limite pratique : comptez ~60 Mo de RAM et de VRAM
par million de points (position + classe + intensité + altitude, tout est
résident sur le GPU). Une dalle LiDAR HD complète de ~15 M points tient dans
un navigateur standard ; pour plusieurs dalles simultanées, la v1 décodera
tout en mémoire — le filtrage GPU (classe, altitude, densité) reste instantané.

Le décodage utilise le backend **laz-rs** (`LAZRsLoader`) et non le défaut
laz-perf : celui-ci ne supporte que LAS ≤ 1.3 alors que l'IGN diffuse du LAS 1.4.

## Feuille de route

- v2 : streaming **COPC** (ne charger que les points visibles, plusieurs dalles, LOD)
- v3 : carte MapLibre + sélection des dalles IGN par zoom-clic
- v4 : mesures, profils transversaux, export PNG/CSV

## Tests

`scripts/smoke-parse.mjs` vérifie le décodage (points, attributs, bbox, classes).
`scripts/e2e.mjs` lance un test navigateur de bout en bout via Playwright
(prérequis : `npx playwright install chromium`).

*Données : IGN — programme LiDAR HD, licence Etalab 2.0.*
