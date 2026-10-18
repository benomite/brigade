# Le bas de `status` d'avant (#940)

L'état d'exemple de `test/aides/bas-de-status.ts` (celui du haut de #928, `exemple`, et par-dessus
tout ce que le rail, les cooks, la consommation, les serveurs, les worktrees, la dérive et les
transcripts peuvent dire), lu le `2026-10-12T10:04:00.000Z` par le code d'avant la traduction du
bas (base `66c60b4`, le haut y est déjà en anglais).

- `status-d-avant.txt` — la sortie entière de `status` : le bas (de `rail` à `derniers événements`)
  y est en français, et la ligne `projet` aussi. La ligne `github` n'y est pas : son heure de reprise
  se dit à l'heure locale, que la fixture ne fixe pas.
- `facts.json` — la sortie de `facts` sur le même état. Elle ne change pas avec la traduction : les
  clés et les valeurs sont celles que l'app lit déjà.

Pour les régénérer : extraire `runtime/` d'un commit d'avant la traduction, y poser
`test/aides/bas-de-status.ts`, puis écrire `faits(lireEtat(exempleDuBas(t), LU_LE), LU_LE)` en JSON
(indenté de deux espaces) et `decrireEtat(...)` joint par des retours à la ligne.
