# Le haut de `status` d'avant (#928)

L'état d'exemple de `test/helpers/status-header.ts` (l'état d'avant de #927 et ce qui arrête la
cuisine par-dessus : disjoncteur ouvert, connexion Max tombée, setup bloqué, mise de côté, base
rouge et sa réparation, grant bientôt éteint, une sauvegarde), lu le `2026-10-12T10:04:00.000Z`
par le code d'avant la traduction (base `d776a54`).

- `status-d-avant.txt` — le haut de la sortie de `status` : les lignes qui précèdent le bloc
  `attend` / `awaiting`, en français.
- `facts.json` — la sortie de `facts` sur le même état. Elle ne change pas avec la traduction : les
  clés et les valeurs sont celles que l'app lit déjà.

Pour les régénérer : extraire `runtime/` d'un commit d'avant la traduction, y poser
`test/helpers/status-header.ts`, puis écrire `faits(lireEtat(exemple(t), LU_LE), LU_LE)` en JSON
(indenté de deux espaces) et les lignes de `decrireEtat` jusqu'au bloc `attend`.
