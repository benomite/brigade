// Point d'entrée du runtime : `npm --prefix runtime start`, ou l'unité systemd.
// Tout vient de l'environnement — aucun chemin d'état, aucun projet par défaut.
import { avecRail, configRail } from "./alimenter.ts";
import { ConfigInvalide, DejaEnCours, demarrer } from "./runtime.ts";

// Code de sortie d'un refus de démarrer. L'unité systemd ne relance pas sur ce
// code : réessayer ne changerait rien.
const REFUS = 2;

function refuser(motif: string): never {
  console.error(`brigade : refus de démarrer — ${motif}`);
  process.exit(REFUS);
}

function exiger(variable: string): string {
  const valeur = process.env[variable];
  if (!valeur) refuser(`${variable} n'est pas défini`);
  return valeur;
}

const repertoireEtat = exiger("BRIGADE_STATE_DIR");
const projet = exiger("BRIGADE_PROJECT");

let runtime;
try {
  const rail = configRail(process.env);
  runtime = demarrer({ repertoireEtat, projet });
  runtime = avecRail(runtime, rail);
} catch (erreur) {
  if (erreur instanceof ConfigInvalide || erreur instanceof DejaEnCours) refuser(erreur.message);
  throw erreur;
}
const { arreter } = runtime;

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    arreter(signal);
    console.log(`brigade : runtime du projet « ${projet} » arrêté (${signal})`);
  });
}

console.log(`brigade : runtime du projet « ${projet} » démarré — pid ${process.pid}, état dans ${repertoireEtat}`);
