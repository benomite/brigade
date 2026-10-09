// Point d'entrée du runtime : `npm --prefix runtime start`, ou l'unité systemd.
// Tout vient de l'environnement — aucun chemin d'état, aucun projet par défaut.
import { avecRail, configRail } from "./alimenter.ts";
import { sessionClaude } from "./claude.ts";
import { brancherDerive, lireSeuils } from "./derive.ts";
import { brancherGardeFous, lireReglages } from "./garde-fous.ts";
import { configIdentites, environnementSansGitHub, ouvrirGitHubs, ouvrirIdentites, ROLES, type Identites } from "./identites.ts";
import { brancherManager, configManager } from "./manager.ts";
import { brancherPass, configPass } from "./pass.ts";
import { configReviewer } from "./reviewer.ts";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
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
// Non nul : chaque rôle agit sur GitHub sous sa propre identité.
let identites: Identites | null = null;
try {
  // Toute la configuration est lue avant de rien écrire : un refus de démarrer
  // ne laisse ni journal ni verrou.
  const rail = configRail(process.env);
  const reglages = lireReglages(process.env);
  const station = configStation(process.env);
  const delais = configPass(process.env);
  const reviewer = configReviewer(process.env);
  const manager = configManager(process.env);
  const seuils = lireSeuils(process.env);
  const apps = configIdentites(process.env);
  identites = apps && ouvrirIdentites({ ...apps, depot: rail.depot });
  const depot = depotDeStation(repertoireEtat, station, identites?.jeton("cook"));
  const githubs = ouvrirGitHubs({ depot: rail.depot, bin: rail.gh, identites });
  const socle = demarrer({ repertoireEtat, projet });
  // Sous une identité par rôle, ni les cooks, ni les gates, ni les juges ne
  // partent avec de quoi parler à GitHub : leur `gh` ne trouve aucun compte.
  let env: NodeJS.ProcessEnv = process.env;
  if (identites) {
    const sansCompte = join(repertoireEtat, "gh-sans-compte");
    mkdirSync(sansCompte, { recursive: true });
    env = environnementSansGitHub(process.env, sansCompte);
    // Un jeton vivant par rôle, d'emblée puis à chaque tick : un push de fin
    // de cook ne peut pas attendre le sien.
    const entretenues = identites;
    void entretenues.entretenir();
    socle.surReveil((cause) => void (cause === "tick" && entretenues.entretenir()));
  }
  const garde = brancherGardeFous(reglages, avecRail(socle, { ...rail, github: githubs.rail }));
  // La pass avant la station : c'est elle que la station réveille quand un
  // cook a livré.
  const pass = brancherPass(garde, { ...delais, repertoireEtat, depot, github: githubs.pass, env, base: station.base, reviewer, depotGitHub: rail.depot, bin: station.bin, seuils: station.seuils });
  const servie = brancherStation(pass, {
    repertoireEtat,
    depot,
    github: githubs.station,
    depotGitHub: rail.depot,
    base: station.base,
    bin: station.bin,
    env,
    sansIdentite: identites !== null,
    session: () => sessionClaude(station.bin, process.env),
    dureeBailMs: rail.dureeBailMs,
    entreesMax: station.entreesMax,
    seuils: station.seuils,
    apresCook: pass.reveillerPass,
  });
  // Le manager en dernier : il ne lance que des jugements et des découpages,
  // et rien ne dépend de lui pour servir ce qui est déjà sur le rail.
  // La dérive ne lance rien et ne retient rien : elle lit ce que les autres ont écrit.
  brancherDerive(socle, seuils);
  runtime = brancherManager(servie, { ...manager, repertoireEtat, github: githubs.manager, env, depotGitHub: rail.depot, bin: station.bin, fichiers: depot.fichiers });
} catch (erreur) {
  if (erreur instanceof ConfigInvalide || erreur instanceof DejaEnCours) refuser(erreur.message);
  throw erreur;
}
const { arreter } = runtime;

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    identites?.fermer();
    arreter(signal);
    console.log(`brigade : runtime du projet « ${projet} » arrêté (${signal})`);
  });
}

console.log(
  identites
    ? `brigade : GitHub — une identité par rôle (${ROLES.join(", ")}), jetons courts limités au dépôt ; les cooks n'en reçoivent aucun`
    : "brigade : GitHub — identité unique, celle du `gh` de la machine : rien ne réserve le merge à la pass (BRIGADE_GITHUB_APPS_DIR n'est pas défini)",
);
console.log(`brigade : runtime du projet « ${projet} » démarré — pid ${process.pid}, état dans ${repertoireEtat}`);
