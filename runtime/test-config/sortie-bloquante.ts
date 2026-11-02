// Chargé dans chaque fichier de test que joue `suite.ts` (`--import`) : sa
// sortie standard et sa sortie d'erreur deviennent bloquantes.
//
// Le fichier de test rend son relevé au lanceur par un tube. Sous Linux,
// Node y écrit sans bloquer : ce que le tube ne prend pas (64 Ko) attend en
// mémoire. Et `--test-force-exit` sort du process dès son dernier test fini,
// par `process.exit()`, qui jette ce qui attend encore. Quand le lanceur, qui
// lit les tubes de tous les fichiers à la fois, est en retard, la fin du relevé
// d'un fichier se perd : ses derniers tests ne sont ni comptés ni montrés, et
// le fichier passe pour vert (#2085 : 23 et 35 tests manquants sur deux
// passages d'une box chargée, ailleurs dans chaque passage). Bloquante, une
// écriture attend que le lanceur ait lu : rien ne reste à jeter.
type Poignee = { setBlocking?: (bloquant: boolean) => number };
for (const flux of [process.stdout, process.stderr]) (flux as unknown as { _handle?: Poignee })._handle?.setBlocking?.(true);
