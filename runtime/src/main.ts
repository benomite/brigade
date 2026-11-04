// Point d'entrée du runtime : `npm --prefix runtime start`, ou l'unité systemd.
// Tout vient de l'environnement — aucun chemin d'état, aucun projet par défaut.
// Le runtime lui-même est branché par `runtime-du-projet.ts` ; ce process lui
// donne son environnement, sa sortie et ses signaux.
import { masquerLaConsole } from "./jeton-claude.ts";
import { ConfigInvalide, DejaEnCours } from "./runtime.ts";
import { lancerLeRuntime, REFUS, type RuntimeLance } from "./runtime-du-projet.ts";

// Ce que le runtime dit à journald est masqué, avant même son premier mot.
masquerLaConsole();

let lance: RuntimeLance;
try {
  lance = lancerLeRuntime(process.env, { dire: (ligne) => console.log(ligne), redire: (ligne) => console.error(ligne) });
} catch (erreur) {
  if (!(erreur instanceof ConfigInvalide || erreur instanceof DejaEnCours)) throw erreur;
  console.error(`brigade : refus de démarrer — ${erreur.message}`);
  process.exit(REFUS);
}

for (const signal of ["SIGTERM", "SIGINT"] as const) process.on(signal, () => lance.arreter(signal));
