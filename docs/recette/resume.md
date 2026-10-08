La [recette](index.md) organise le flux de travail des tickets en brigade.
Un ticket se place sur le **rail** quand on lui pose le label `fire`.
La station le confie à un cook qui travaille dans son propre worktree et livre via PR.
La **pass** valide la livraison en rejouant les gates et la CI.
Vert et grant actif, le ticket est mergé et quitte le rail.
