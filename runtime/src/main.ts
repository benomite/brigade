// Point d'entrée du runtime : `npm --prefix runtime start`, ou l'unité systemd.
// Tout vient de l'environnement — aucun chemin d'état, aucun projet par défaut.
import { avecRail, configRail } from "./alimenter.ts";
import { sessionClaude } from "./claude.ts";
import { brancherGardeFous, lireReglages } from "./garde-fous.ts";
import { ouvrirGitHub } from "./github.ts";
import { brancherPass, configPass } from "./pass.ts";
import { ConfigInvalide, DejaEnCours, demarrer } from "./runtime.ts";
import { brancherStation, configStation, depotDeStation } from "./station.ts";

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
  // Toute la configuration est lue avant de rien écrire : un refus de démarrer
  // ne laisse ni journal ni verrou.
  const rail = configRail(process.env);
  const reglages = lireReglages(process.env);
  const station = configStation(process.env);
  const delais = configPass(process.env);
  const depot = depotDeStation(repertoireEtat, station);
  const github = ouvrirGitHub({ depot: rail.depot, bin: rail.gh });
  const socle = demarrer({ repertoireEtat, projet });
  const garde = brancherGardeFous(reglages, avecRail(socle, { ...rail, github }));
  // La pass avant la station : c'est elle que la station réveille quand un
  // cook a livré.
  const pass = brancherPass(garde, { ...delais, repertoireEtat, depot, github, base: station.base });
  runtime = brancherStation(pass, {
    repertoireEtat,
    depot,
    github,
    depotGitHub: rail.depot,
    base: station.base,
    bin: station.bin,
    session: () => sessionClaude(station.bin, process.env),
    dureeBailMs: rail.dureeBailMs,
    apresCook: pass.reveillerPass,
  });
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
