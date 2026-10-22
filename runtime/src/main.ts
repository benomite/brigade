// Point d'entrée du runtime : `npm --prefix runtime start`, ou l'unité systemd.
// Tout vient de l'environnement — aucun chemin d'état, aucun projet par défaut.
import { brancherAlerteUrgence } from "./alerte-urgence.ts";
import { avecRail, configRail } from "./alimenter.ts";
import { configArbitrage, joindreArbitre } from "./arbitrage.ts";
import { sessionClaude } from "./claude.ts";
import { brancherJeton, configJeton, direJeton, environnementClaude, masquerLaConsole } from "./jeton-claude.ts";
import { annoncerCloison, configCloison, direFichiers, direReseau, type Cloison } from "./cloison.ts";
import { noterCodeEnService } from "./code.ts";
import { decisionsAuDemarrage, decisionsDansLEnvironnement, direDecisionIgnoree, environnementDecide, suivreDecisions, supportDesDecisions } from "./decisions.ts";
import { lireALaBase } from "./depot.ts";
import { brancherDerive, lireSeuils } from "./derive.ts";
import { brancherFermeture } from "./closing/run.ts";
import { configFermeture } from "./closing/settings.ts";
import { brancherGardeFous, lireReglages } from "./garde-fous.ts";
import { configIdentites, environnementSansGitHub, ouvrirGitHubs, ouvrirIdentites, ROLES, type Identites } from "./identites.ts";
import { etablirLInterrupteur } from "./interrupteur.ts";
import { brancherManager, configManager } from "./manager.ts";
import { brancherPass, configPass } from "./pass.ts";
import { plafondDuProjet } from "./reagir.ts";
import { lireLeDepot } from "./reglages-projet/en-vigueur.ts";
import { CARNET_PATH } from "./carnet/carnet.ts";
import { brancherCarnet } from "./promotion/livrer.ts";
import { brancherRenommage } from "./pause/renommage.ts";
import { brancherReglages } from "./reglages-projet/au-runtime.ts";
import { lireSeuils as lireSeuilsDesLecons } from "./seuils/seuils.ts";
import { lirePlafondDesLecons } from "./apprentissage/injection.ts";
import { leconsDeLEtageCommun } from "./commun/installation.ts";
import { brancherSession, configSession, type ConfigSession } from "./renouvellement.ts";
import { brancherReseau, configReseau, DECLARATION_RESEAU, passerParLaPorte, sonderLeFiltre } from "./reseau.ts";
import { configReviewer } from "./reviewer.ts";
import { configSecrets, DECLARATION } from "./secrets.ts";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { ConfigInvalide, DejaEnCours, demarrer } from "./runtime.ts";
import { lireLesProfils } from "./profils/preference.ts";
import { brancherStation, configStation, depotDeStation } from "./station.ts";
import { direStations, type StationDeclaree } from "./stations-declarees.ts";

// Ce que le runtime dit à journald est masqué, avant même son premier mot.
masquerLaConsole();

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
// Non nul : le fichier qui porte le jeton longue durée de la connexion Max.
let jeton: string | null = null;
// Non nulle : chaque lancement part dans sa cloison.
let cloison: Cloison | null = null;
// Non nul : le port de la porte, seule sortie du projet vers l'extérieur.
let porte: number | null = null;
// Non nul : le port de l'arbitre entre projets, consulté avant chaque lancement.
let arbitre: number | null = null;
// Les stations que le projet déclare. Aucune : aucun cook ne part.
let stations: StationDeclaree[] = [];
// Le fichier d'état du renouvellement de la session Max, relu à chaque tick.
let session: ConfigSession | null = null;
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
  // Les décisions du chef — stations, seuils de coût, calibrage du manager, du
  // reviewer et du closer — n'ont pour support que le journal : lues dès le démarrage, puis
  // relues à chaque lecture.
  // Elles sont le seul support de ces valeurs : une variable de même nom dans
  // l'environnement est ignorée, et dite — une fois par variable, à chaque
  // démarrage.
  for (const nom of decisionsDansLEnvironnement(process.env)) console.error(`brigade : ${direDecisionIgnoree(nom, projet)}`);
  // Le dépôt du projet dit sa branche d'intégration, son calibrage et son
  // plafond : ils passent avant ceux de la box, et se relisent à chaque usage.
  const duDepot = lireLeDepot(process.env);
  for (const ligne of duDepot.dits) console.error(`brigade : ${ligne}`);
  const decide = environnementDecide(duDepot.env, decisionsAuDemarrage(repertoireEtat), duDepot.reglages);
  const station = configStation(decide);
  supportDesDecisions({ repertoireEtat, clone: station.clone });
  ({ stations } = station);
  const delais = configPass(process.env);
  const reviewer = configReviewer(decide);
  const manager = { ...configManager(decide), plafond: plafondDuProjet(decide, duDepot.reglages) };
  // Lus ici pour qu'un seuil mal écrit refuse le démarrage ; la dérive les
  // relit ensuite à chaque réveil.
  lireSeuils(decide);
  // Les seuils des leçons : un réglage de l'unité du projet, lu une fois.
  const seuilsDesLecons = lireSeuilsDesLecons(process.env);
  // Combien de leçons provisoires reçoit le cook d'un ticket : un réglage de
  // l'unité du projet, lu une fois.
  const leconsInjectees = lirePlafondDesLecons(process.env);
  configFermeture(decide);
  arbitre = configArbitrage(process.env);
  secrets = configSecrets(process.env, { repertoireEtat, clone: station.clone });
  jeton = configJeton(process.env, { repertoireEtat, clone: station.clone });
  cloison = configCloison(process.env, { repertoireEtat, clone: station.clone });
  session = configSession(process.env, repertoireEtat);
  const apps = configIdentites(process.env);
  identites = apps && ouvrirIdentites({ ...apps, depot: rail.depot });
  // Ce que le dépôt déclare de son réseau, republié dès que la base est
  // rapatriée : branché plus bas, une fois le journal ouvert.
  let republierReseau = () => {};
  const depot = depotDeStation(repertoireEtat, station, identites?.jeton("cook"), () => republierReseau());
  const githubs = ouvrirGitHubs({ depot: rail.depot, bin: rail.gh, identites });
  socle = demarrer({ repertoireEtat, projet });
  // L'interrupteur du projet, posé avant que rien ne parte : allumé par défaut,
  // repris des anciens interrupteurs sur un journal d'avant (interrupteur.ts).
  const pose = etablirLInterrupteur(socle.journal, projet, new Date());
  if (pose !== null) console.log(pose);
  // Ce que le chef décide sans redémarrer : chaque lecture relit le journal.
  const decisions = suivreDecisions(socle.journal.base, process.env, undefined, duDepot.suivis);
  // Ce que le dépôt déclare sur sa base, relu à chaque rapatriement et à
  // chaque tick : un hôte mergé s'ouvre sans rien redémarrer, et avant le
  // setup du premier ticket pris après lui.
  if (porte !== null) republierReseau = brancherReseau(socle, { base: station.base, declaration: () => lireALaBase(station, DECLARATION_RESEAU) });
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
  const pass = brancherPass(garde, { ...delais, repertoireEtat, depot, github: githubs.pass, env, secrets, cloison, sansIdentite: identites !== null, base: station.base, reviewer, decisions, depotGitHub: rail.depot, bin: station.bin, seuils: station.seuils, ...(process.env.BRIGADE_STATION_DIR ? { etageCommun: { racine: process.env.BRIGADE_STATION_DIR, expiration: seuilsDesLecons.expirationPromue } } : {}) });
  // La fermeture avant la station : c'est par son rail que la station se voit
  // refuser ce qu'une passe tient. Elle ne lance rien sans la commande du chef.
  const fermee = brancherFermeture(pass, { reglages: decisions.fermeture, repertoireEtat, depot, clone: station.clone, base: station.base, github: githubs.station, depotGitHub: rail.depot, bin: station.bin, env, cloison });
  // Le carnet des leçons après la pass, à qui il remet ses PR : elles n'attendent pas le chef.
  const apprise = brancherCarnet(fermee, { depot, github: githubs.station, base: station.base, seuils: seuilsDesLecons, carnetALaBase: () => lireALaBase(station, CARNET_PATH), env });
  // Le renommage du code après la pass, à qui il remet sa PR : il ne part que
  // sur le « oui » du chef à la pause, et la lève lui-même à sa fin.
  const renommee = brancherRenommage(apprise, { depot, github: githubs.station, base: station.base, env, cloison });
  // Les changements des réglages du projet que le chef demande, après la pass
  // à qui chacun remet sa PR : elle la retient pour lui (#1308).
  const reglee = brancherReglages(renommee, { depot, github: githubs.station, base: station.base, env });
  const servie = brancherStation(reglee, {
    stations,
    decisions,
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
    session: () => sessionClaude(station.bin, environnementClaude(process.env, process.env)),
    dureeBailMs: rail.dureeBailMs,
    presenceMs: station.presenceMs,
    entreesMax: station.entreesMax,
    seuils: station.seuils,
    gardeTranscriptsMs: station.gardeTranscriptsMs,
    apresCook: pass.reveillerPass,
    arbitre: arbitre === null ? null : joindreArbitre(arbitre),
    leconsInjectees,
    // Là où le « oui » du chef les écrit : le clone du projet.
    profils: () => lireLesProfils(station.clone, (texte) => console.error(texte)),
    // L'étage commun, si ce projet est servi par une station : aucun sinon.
    commun: () => leconsDeLEtageCommun(process.env.BRIGADE_STATION_DIR),
  });
  // Le manager en dernier : il ne lance que des jugements et des découpages,
  // et rien ne dépend de lui pour servir ce qui est déjà sur le rail.
  // La dérive ne lance rien et ne retient rien : elle lit ce que les autres ont écrit.
  brancherDerive(socle, decisions.seuils);
  const dirige = brancherManager(servie, { ...manager, decisions, repertoireEtat, github: githubs.manager, env, cloison, depotGitHub: rail.depot, bin: station.bin, fichiers: depot.fichiers });
  // La session Max ne lance rien et ne retient rien : son échéance se lit du
  // fichier d'état du renouvellement, jamais des identifiants, et la file la dit.
  // Avec un jeton longue durée, il n'y a plus de renouvellement à suivre.
  const suivie = brancherSession(dirige, session, undefined, jeton);
  // De même pour le jeton longue durée : son échéance se lit de la date de sa
  // création, rangée à côté de lui, jamais du jeton.
  const datee = brancherJeton(suivie, jeton);
  // L'alerte d'urgence ne lance rien : elle écrit ce que le runtime a dit au
  // chef, une fois, puis un rappel espacé.
  runtime = brancherAlerteUrgence(datee);
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
// Les stations se disent, déclarées ou non : sans elles aucun cook ne part, et
// c'est ici que le chef le lit d'abord.
console.log(`brigade : stations — ${direStations(stations)}`);
console.log(
  secrets
    ? `brigade : secrets du projet — ${secrets}, relu à chaque lancement ; ne parviennent au setup, aux cooks et aux gates que ceux que le dépôt déclare (\`${DECLARATION}\`)`
    : `brigade : secrets du projet — aucun (BRIGADE_SECRETS_FILE n'est pas défini) : un dépôt qui en déclare (\`${DECLARATION}\`) ne verra partir aucun cook`,
);
console.log(`brigade : ${direJeton(jeton, process.env)}`);
console.log(
  arbitre === null
    ? "brigade : arbitre — aucun (BRIGADE_ARBITER_PORT n'est pas défini) : ce projet se tient pour seul sur la machine et sur le compte"
    : `brigade : arbitre — 127.0.0.1:${arbitre}, consulté avant chaque lancement ; injoignable, le projet lance quand même, un cook à la fois`,
);
console.log(
  `brigade : session Max — échéance lue de ${session?.etat} (le fichier d'état du renouvellement, relu à chaque tick ; jamais les identifiants), annoncée ${Math.round(((session?.preavisS ?? 0) / 3600) * 10) / 10} h avant`,
);
// La cloison se dit, présente ou non : sans elle, les projets se voient, et
// c'est un choix qui se lit — ici, et au journal pour `npm run partition`.
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
// Avec une porte, l'unité doit refuser ce qui la contourne : cela se sonde,
// et se confirme sur la machine (recette).
if (porte === null) direCloison(null);
else void sonderLeFiltre().then(direCloison);
// Le témoin du démarrage, une fois tout branché : l'empreinte du code sur
// lequel ce process tourne.
noterCodeEnService(repertoireEtat);
console.log(`brigade : runtime du projet « ${projet} » démarré — pid ${process.pid}, état dans ${repertoireEtat}`);
