// Point d'entrée du runtime : `npm --prefix runtime start`, ou l'unité systemd.
// Tout vient de l'environnement — aucun chemin d'état, aucun projet par défaut.
import { avecRail, configRail } from "./alimenter.ts";
import { sessionClaude } from "./claude.ts";
import { annoncerCloison, configCloison, direFichiers, direReseau, type Cloison } from "./cloison.ts";
import { lireALaBase } from "./depot.ts";
import { brancherDerive, lireSeuils } from "./derive.ts";
import { brancherGardeFous, lireReglages } from "./garde-fous.ts";
import { configIdentites, environnementSansGitHub, ouvrirGitHubs, ouvrirIdentites, ROLES, type Identites } from "./identites.ts";
import { brancherManager, configManager } from "./manager.ts";
import { brancherPass, configPass } from "./pass.ts";
import { brancherReseau, configReseau, DECLARATION_RESEAU, passerParLaPorte, sonderLeFiltre } from "./reseau.ts";
import { configReviewer } from "./reviewer.ts";
import { configSecrets, DECLARATION } from "./secrets.ts";
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
// Non nul : le fichier de la machine qui porte les secrets du projet.
let secrets: string | null = null;
// Non nulle : chaque lancement part dans sa cloison.
let cloison: Cloison | null = null;
// Non nul : le port de la porte, seule sortie du projet vers l'extérieur.
let porte: number | null = null;
let socle;
try {
  // Toute la configuration est lue avant de rien écrire : un refus de démarrer
  // ne laisse ni journal ni verrou.
  // La porte d'abord : tout ce qui suit, et tout ce qui sera lancé, passe par
  // elle.
  porte = configReseau(process.env);
  if (porte !== null) passerParLaPorte(porte);
  const rail = configRail(process.env);
  const reglages = lireReglages(process.env);
  const station = configStation(process.env);
  const delais = configPass(process.env);
  const reviewer = configReviewer(process.env);
  const manager = configManager(process.env);
  const seuils = lireSeuils(process.env);
  secrets = configSecrets(process.env, { repertoireEtat, clone: station.clone });
  cloison = configCloison(process.env, { repertoireEtat, clone: station.clone });
  const apps = configIdentites(process.env);
  identites = apps && ouvrirIdentites({ ...apps, depot: rail.depot });
  const depot = depotDeStation(repertoireEtat, station, identites?.jeton("cook"));
  const githubs = ouvrirGitHubs({ depot: rail.depot, bin: rail.gh, identites });
  socle = demarrer({ repertoireEtat, projet });
  // Ce que le dépôt déclare sur sa base, relu à chaque tick : un hôte mergé
  // s'ouvre sans rien redémarrer.
  if (porte !== null) brancherReseau(socle, { base: station.base, declaration: () => lireALaBase(station, DECLARATION_RESEAU) });
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
  const pass = brancherPass(garde, { ...delais, repertoireEtat, depot, github: githubs.pass, env, secrets, cloison, sansIdentite: identites !== null, base: station.base, reviewer, depotGitHub: rail.depot, bin: station.bin, seuils: station.seuils });
  const servie = brancherStation(pass, {
    repertoireEtat,
    depot,
    github: githubs.station,
    depotGitHub: rail.depot,
    base: station.base,
    bin: station.bin,
    env,
    secrets,
    cloison,
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
  runtime = brancherManager(servie, { ...manager, repertoireEtat, github: githubs.manager, env, cloison, depotGitHub: rail.depot, bin: station.bin, fichiers: depot.fichiers });
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
console.log(
  secrets
    ? `brigade : secrets du projet — ${secrets}, relu à chaque lancement ; ne parviennent au setup, aux cooks et aux gates que ceux que le dépôt déclare (\`${DECLARATION}\`)`
    : `brigade : secrets du projet — aucun (BRIGADE_SECRETS_FILE n'est pas défini) : un dépôt qui en déclare (\`${DECLARATION}\`) ne verra partir aucun cook`,
);
// La cloison se dit, présente ou non : sans elle, les projets se voient, et
// c'est un choix qui se lit — ici, et au journal pour `npm run cloison`.
const annoncee = socle;
const direCloison = (enforced: boolean | null) => {
  const etat = {
    sandbox: cloison && { bin: cloison.bin, hidden: cloison.masques, credentials: cloison.identifiants },
    proxy: porte === null ? null : { port: porte, enforced },
  };
  try {
    annoncerCloison(annoncee, etat);
  } catch {
    // Le runtime s'est arrêté entre-temps : le prochain démarrage l'écrira.
  }
  console.log(`brigade : cloison — ${direFichiers(etat.sandbox)}`);
  console.log(`brigade : réseau — ${direReseau(etat.proxy)}`);
};
// Avec une porte, l'unité doit refuser ce qui la contourne : cela s'éprouve.
if (porte === null) direCloison(null);
else void sonderLeFiltre().then(direCloison);
console.log(`brigade : runtime du projet « ${projet} » démarré — pid ${process.pid}, état dans ${repertoireEtat}`);
