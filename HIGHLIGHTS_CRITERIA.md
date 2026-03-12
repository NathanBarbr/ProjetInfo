# Highlights Criteria

Les `highlights` sont maintenant basés sur un `highlight_score` explicite, calculé dans le backend, au lieu d'une simple similarité vectorielle.

Le score final est sur 100 et combine plusieurs critères.

## Pondérations

- `35%` : durée réelle du point via `duree_secondes`
- `15%` : profondeur du rallye
  La durée reste prioritaire, avec `nb_coups` comme renfort secondaire
- `15%` : variété des effets dans `sequence_effets`
- `10%` : variété des latéralités dans `sequence_lateralites`
- `10%` : variété des zones dans `sequence_zones`
- `10%` : qualité de fin de point
  `pt_gagne` est favorisé, avec bonus si le dernier coup est offensif
- `5%` : pression du score
  Point de set, `10-10`, `9-9`, ou score serré en fin de set

## Intuition

Un point remonte dans les `highlights` s'il est :

- assez long en temps
- varié dans le jeu
- bien conclu
- éventuellement important dans le contexte du score

Le système ne dépend donc plus seulement de `nb_coups`.

## Résumé simple

Les highlights privilégient les points longs, riches, bien terminés, et joués dans des moments importants.
