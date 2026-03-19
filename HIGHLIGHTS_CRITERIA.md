# Highlights Criteria

Les `highlights` sont maintenant bases sur un `highlight_score` explicite, calcule dans le backend, au lieu d'une simple similarite vectorielle.

Le score final est sur 100 et combine plusieurs criteres.

## Ponderations

- `35%` : duree reelle du point via `duree_secondes`
- `15%` : profondeur du rallye
  La duree reste prioritaire, avec `nb_coups` comme renfort secondaire
- `15%` : variete des effets dans `sequence_effets`
- `10%` : variete des lateralites dans `sequence_lateralites`
- `10%` : variete des zones dans `sequence_zones`
- `10%` : qualite de fin de point
  `pt_gagne` est favorise, avec bonus si le dernier coup est offensif
- `5%` : pression du score
  Point de set, `10-10`, `9-9`, ou score serre en fin de set

## Intuition

Un point remonte dans les `highlights` s'il est :

- assez long en temps
- varie dans le jeu
- bien conclu
- eventuellement important dans le contexte du score

Le systeme ne depend donc plus seulement de `nb_coups`.

## Resume simple

Les highlights privilegient les points longs, riches, bien termines, et joues dans des moments importants.

## Personnalisation

Ces ponderations servent de valeurs par defaut.

Le mode `Highlights` permet maintenant de les ajuster via le bouton `Parametres` du frontend, ou directement via l'API `/api/semantic/highlights` avec les query params :

- `duration_weight`
- `rally_depth_weight`
- `effects_variety_weight`
- `laterality_variety_weight`
- `zone_variety_weight`
- `finish_weight`
- `pressure_weight`

Si le total n'est pas exactement a `100`, les poids sont renormalises automatiquement par le backend.
