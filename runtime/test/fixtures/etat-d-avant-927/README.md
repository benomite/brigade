# L'état d'avant (#927)

Un état de la box écrit avant que le bloc `attend` de `status` passe en anglais,
et la sortie de `status` qu'il donnait alors.

- `evenements.ndjson` — le journal, un événement par ligne, chacun avec son
  instant (`at`). Rien n'est binaire : le test le rejoue dans un `log.db` neuf
  (`etatDAvant`, dans `test/attend-en-anglais.test.ts`), sans l'éditer.
- `status-d-avant.txt` — la sortie de `status` sur ce journal, lue le
  `2026-10-12T10:04:00.000Z`, par le code d'avant la traduction (base `00dd070`).

Pour régénérer `status-d-avant.txt` : extraire `runtime/` d'un commit d'avant la
traduction, y rejouer `evenements.ndjson` comme le fait `etatDAvant`, puis
écrire `decrireEtat(lireEtat(journal, lu), lu).join("\n")` avec le même instant
de lecture. Les tickets suivants qui traduisent un autre bloc de `status`
reprennent cet état : la sortie d'avant reste celle-ci.
