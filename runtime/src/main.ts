// Point d'entrée du runtime : `npm --prefix runtime start`, ou l'unité systemd.
// Tout vient de l'environnement — aucun chemin d'état, aucun projet par défaut.
import { availableParallelism } from "node:os";
import { plafondDesCoeurs } from "./projections/stations.ts";
import { brancherAlerteUrgence } from "./alerte-urgence.ts";
import { assurerLApp, cheminDeLApp, direLApp } from "./app-par-defaut.ts";
import { brancherIssueDuDisjoncteur, clientGitHubDuDisjoncteur } from "./breaker-issue.ts";
import { brancherRepriseParGitHub } from "./breaker-resume-github.ts";
import { noterGitHubSeul } from "./github-seul-etat.ts";
import { brancherBrigadeGithub, delaiDesGatesMs, priseDeLaStation, stationDuDepot } from "./brigade-github.ts";
import { configRail } from "./alimenter.ts";
import { configArbitrage, joindreArbitre } from "./arbitrage.ts";
import { brancherJeton, configJeton, direJeton, masquerLaConsole } from "./jeton-claude.ts";
import { annoncerCloison, configCloison, direFichiers, direReseau, type Cloison } from "./cloison.ts";
import { noterCodeEnService } from "./code.ts";
import { decisionsAuDemarrage, decisionsDansLEnvironnement, direDecisionIgnoree, environnementDecide, suivreDecisions, supportDesDecisions } from "./decisions.ts";
import { lireALaBase } from "./depot.ts";
import { brancherDerive, lireSeuils } from "./derive.ts";
import { brancherCloserGithub, lectureDuClone } from "./closer-github-passe/closer-github-passe.ts";
import { lireBlocagesSansQuestion } from "./blocages-sans-question.ts";
import { coutsDesFlux, noterDeriveGithub } from "./closer-github-passe/derive-github.ts";
import { lesTempsDesTickets } from "./temps-ticket/ligne-status.ts";
import { brancherGardeFous, lireReglages } from "./garde-fous.ts";
import { brancherElagageGithub, elagageDuClone } from "./github-seul/elagage/elagage.ts";
import { gardesDuTour } from "./github-seul/garde-fous/garde-fous.ts";
import { configIdentites, environnementSansGitHub, ouvrirGitHubs, ouvrirIdentites, ROLES, type Identites } from "./identites.ts";
import { noterLeModeDesIdentites } from "./appels-par-identite.ts";
import { etablirLInterrupteur } from "./interrupteur.ts";
import { brancherManager, configManager } from "./manager.ts";
import { plafondDuProjet } from "./reagir.ts";
import { lireLeDepot, variablesDesGatesDuDepot } from "./reglages-projet/en-vigueur.ts";
import { brancherRetenue } from "./retenue/brancher.ts";
import { suivreLeTour } from "./retenue/tour.ts";
import { brancherSession, configSession, type ConfigSession } from "./renouvellement.ts";
import { brancherReseau, configReseau, DECLARATION_RESEAU, passerParLaPorte, sonderLeFiltre } from "./reseau.ts";
import { configReviewer } from "./reviewer.ts";
import { configSecrets, DECLARATION } from "./secrets.ts";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { ConfigInvalide, DejaEnCours, demarrer } from "./runtime.ts";
import { configStation, depotDeStation } from "./station.ts";
import { direStations, type StationDeclaree } from "./stations-declarees.ts";
import { direValeursManquantes, valeursManquantes } from "./valeurs-a-donner.ts";

// Ce que le runtime dit à journald est masqué, avant même son premier mot.
masquerLaConsole();

// Code de sortie d'un refus de démarrer. L'unité systemd ne relance pas sur ce
// code : réessayer ne changerait rien.
const REFUS = 2;

function refuser(motif: string): never {
  console.error(`brigade : refus de démarrer — ${motif}`);
  process.exit(REFUS);
}

// Ce que l'utilisateur doit donner, dit en une fois — pas une variable par
// démarrage.
const manquantes = valeursManquantes(process.env);
if (manquantes.length > 0) refuser(direValeursManquantes(manquantes));
// Présentes : `valeursManquantes` vient de les exiger.
const repertoireEtat = process.env.BRIGADE_STATE_DIR ?? "";
const projet = process.env.BRIGADE_PROJECT ?? "";

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
// Non nul : le projet est servi sur l'état GitHub seul (`brigade-github.ts`).
let projetGitHub: { arreter(): Promise<void> } | null = null;
let socle;
try {
  // Toute la configuration est lue avant de rien écrire : un refus de démarrer
  // ne laisse ni journal ni verrou.
  // La porte d'abord : tout ce qui suit, et tout ce qui sera lancé, passe par
  // elle.
  porte = configReseau(process.env);
  if (porte !== null) passerParLaPorte(porte);
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
  // Le bail, les chemins communs et la politique du carnet : ceux du dépôt
  // d'abord, puis ceux de la box.
  const rail = configRail(decide);
  const station = configStation(decide);
  supportDesDecisions({ repertoireEtat, clone: station.clone });
  ({ stations } = station);
  const reviewer = configReviewer(decide);
  const manager = { ...configManager(decide), plafond: plafondDuProjet(decide, duDepot.reglages) };
  // Lus ici pour qu'un seuil mal écrit refuse le démarrage ; la dérive les
  // relit ensuite à chaque réveil.
  lireSeuils(decide);
  arbitre = configArbitrage(process.env);
  // Le plafond des gates d'une tête, lu ici pour qu'un délai mal écrit refuse le démarrage (#2456).
  const delaiGatesMs = delaiDesGatesMs({ ...process.env, ...variablesDesGatesDuDepot(duDepot.reglages) });
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
  // Le fichier de l'app, créé neutre s'il manque et complété de ce qui lui manque : le chef
  // n'en écrit aucun à la main. Un échec se dit, et le runtime démarre.
  const fichierDeLApp = cheminDeLApp(process.env);
  const dit = fichierDeLApp === undefined ? undefined : direLApp(assurerLApp(fichierDeLApp));
  if (dit !== undefined) console.error(`brigade : ${dit}`);
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
  const garde = brancherGardeFous(reglages, socle);
  // L'état GitHub seul, seul chemin (#2061) : c'est la station GitHub seul qui
  // prend, cuisine, relit et merge, sous l'identité de la pass.
  const ici = stations.find((declaree) => !declaree.distante);
  // Ce que voit le tour GitHub seul, pour la retenue de la cuisine.
  const suiviDuTour = suivreLeTour();
  const ouvert = brancherBrigadeGithub({
    noter: (decision) => noterGitHubSeul(repertoireEtat, decision),
    station: () =>
      ici === undefined
        ? { refus: "the project declares no station on this machine" }
        : stationDuDepot({
            nom: ici.nom,
            // Pas plus de cooks que la machine n'en porte (`plafondDesCoeurs`) :
            // une station déclarée à 30 en tiendrait 30.
            places: Math.min(ici.cooks, plafondDesCoeurs(availableParallelism())),
            capacites: ici.fournit,
            base: station.base,
            depotGitHub: rail.depot,
            github: githubs.pass,
            depot,
            // La prise de #2056, liée à la station et au client du tour.
            prise: priseDeLaStation,
            claude: station.bin,
            env,
            cloison,
            plafonds: reglages.plafonds,
            graceMs: reglages.graceMs,
            reviewer: reviewer.calibrage,
            flux: join(repertoireEtat, "github-seul"),
            observer: suiviDuTour.envelopper,
            sauter: suiviDuTour.sauter,
            // Le temps de chaque ticket mergé s'écrit dans le clone du projet (#2342).
            clone: station.clone,
            // Les gates d'un projet sans CI sur ses PR, jouées sur leur tête (#2456).
            gates: { delaiMs: delaiGatesMs, secrets, sansIdentite: identites !== null },
            // Le setup du worktree de chaque cook, joué avant lui (#2535).
            setup: { delaiMs: delaiGatesMs },
            // Le « stop », le disjoncteur, le quota et l'arbitre (#2213).
            gardes: gardesDuTour({ garde, station: ici.nom, repertoireEtat, arbitre: arbitre === null ? null : joindreArbitre(arbitre) }),
          }),
  });
  projetGitHub = ouvert;
  // La dérive ne lance rien et ne retient rien : elle lit ce que les autres ont écrit.
  brancherDerive(socle, decisions.seuils);
  // Le manager : il ne lance que des jugements et des découpages.
  const manage = brancherManager(garde, { ...manager, decisions, repertoireEtat, github: githubs.manager, env, cloison, depotGitHub: rail.depot, bin: station.bin, fichiers: depot.fichiers });
  // Les branches `cook/<n>-github` dont l'issue est fermée, retirées à chaque tick.
  const elaguee = brancherElagageGithub(manage, elagageDuClone({ clone: station.clone, github: githubs.station, env }));
  // Le closer, sur GitHub (#2361) : sa passe est une issue que les stations cuisinent,
  // et il relève la dérive que `status` lit, des flux des cooks.
  const closee = brancherCloserGithub(elaguee, { reglages: decisions.fermeture, github: githubs.station, statut: () => ({ blockedWithoutQuestion: lireBlocagesSansQuestion(repertoireEtat) }), clone: lectureDuClone({ depot, clone: station.clone, base: station.base, env }), base: station.base, temps: () => lesTempsDesTickets(station.clone).enregistrements, derive: { seuils: decisions.seuils, couts: coutsDesFlux(join(repertoireEtat, "github-seul")), noter: (derive) => noterDeriveGithub(repertoireEtat, derive) } });
  // La session Max ne lance rien et ne retient rien : son échéance se lit du
  // fichier d'état du renouvellement, jamais des identifiants, et la file la dit.
  // Avec un jeton longue durée, il n'y a plus de renouvellement à suivre.
  const suivie = brancherSession(closee, session, undefined, jeton);
  // De même pour le jeton longue durée : son échéance se lit de la date de sa
  // création, rangée à côté de lui, jamais du jeton.
  const datee = brancherJeton(suivie, jeton);
  // La retenue ne lance rien : rien de servi depuis 30 min alors que des
  // tickets attendent, elle écrit sa cause et son geste — une fois — dans la
  // file du chef, et l'en ôte quand la cuisine sert de nouveau.
  const retenue = brancherRetenue(datee, { station: process.env.BRIGADE_STATION_DIR, tour: ouvert.refus === undefined ? suiviDuTour : null, branche: process.env.BRIGADE_BASE_BRANCH });
  // L'alerte d'urgence ne lance rien : elle écrit ce que le runtime a dit au
  // chef, une fois, puis un rappel espacé.
  const alertee = brancherAlerteUrgence(retenue);
  // Le disjoncteur ouvert se dit aussi sur GitHub, par une issue labellisée (breaker-issue.ts),
  // et le `/resume` du chef sur cette issue le referme (breaker-resume-github.ts).
  brancherIssueDuDisjoncteur(alertee, { client: clientGitHubDuDisjoncteur({ depot: rail.depot, bin: rail.gh, ...(identites ? { jeton: identites.jeton("manager").frais, compte: "manager" } : {}) }) });
  runtime = brancherRepriseParGitHub(alertee, { github: githubs.rail });
} catch (erreur) {
  if (erreur instanceof ConfigInvalide || erreur instanceof DejaEnCours) refuser(erreur.message);
  throw erreur;
}
const { arreter } = runtime;

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    identites?.fermer();
    void projetGitHub?.arreter();
    arreter(signal);
    console.log(`brigade : runtime du projet « ${projet} » arrêté (${signal})`);
  });
}

// Le mode se retient aussi pour `status`, qui le dit avec les appels de chaque identité (#2316).
noterLeModeDesIdentites(process.env, projet, identites !== null);
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
