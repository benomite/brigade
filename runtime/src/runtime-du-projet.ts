// Le runtime d'un projet, branché sur l'environnement qu'on lui donne : ce que
// `main.ts` lance pour son process, et qu'un test lance dans le sien. Rend de
// quoi l'arrêter comme un signal l'arrête ; lève `ConfigInvalide` ou
// `DejaEnCours` pour un refus de démarrer, avant d'avoir rien écrit.
import { brancherAlerteUrgence } from "./alerte-urgence.ts";
import { assurerLApp, cheminDeLApp, direLApp } from "./app-par-defaut.ts";
import { brancherIssueDuDisjoncteur, clientGitHubDuDisjoncteur } from "./breaker-issue.ts";
import { brancherBrigadeGithub, priseDeLaStation, stationDuDepot } from "./brigade-github.ts";
import { avecRail, configRail } from "./alimenter.ts";
import { configArbitrage, joindreArbitre } from "./arbitrage.ts";
import { sessionClaude } from "./claude.ts";
import { brancherJeton, configJeton, direJeton, environnementClaude } from "./jeton-claude.ts";
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
import { brancherCadence } from "./produit/cadence/brancher.ts";
import { brancherPass, configPass } from "./pass.ts";
import { plafondDuProjet } from "./reagir.ts";
import { lireLeDepot, variablesDesGatesDuDepot } from "./reglages-projet/en-vigueur.ts";
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
import { ConfigInvalide, demarrer, type Runtime } from "./runtime.ts";
import { lireLesProfils } from "./profils/preference.ts";
import { brancherStation, configStation, depotDeStation } from "./station.ts";
import { direStations, type StationDeclaree } from "./stations-declarees.ts";
import { unSeulEcrivainSurGitHub } from "./board-single-writer.ts";
import { clientGitHubDuTableau } from "./tableau/publication/client.ts";
import { brancherLeTableau, ouvertesDuDepot } from "./tableau/publication/publier.ts";
import { clientGitHubDesGestes } from "./tableau/gestes/client.ts";
import { gestesDuTableau } from "./tableau/gestes/gestes.ts";
import { secondDuProjet } from "./tableau/gestes/second.ts";
import { mentionsDuTableau } from "./tableau/mention/mention.ts";
import { ouvrirGitHub } from "./github.ts";
import { direValeursManquantes, valeursManquantes } from "./valeurs-a-donner.ts";


// Code de sortie d'un refus de démarrer. L'unité systemd ne relance pas sur ce
// code : réessayer ne changerait rien.
export const REFUS = 2;

// Ce que le runtime lancé rend : de quoi l'arrêter, comme SIGTERM ou SIGINT.
export type RuntimeLance = {
  runtime: Runtime;
  arreter(signal: string): void;
};

export type Sorties = {
  // Une ligne sur la sortie standard.
  dire: (ligne: string) => void;
  // Une ligne sur la sortie d'erreur.
  redire: (ligne: string) => void;
};

export function lancerLeRuntime(environnement: NodeJS.ProcessEnv, { dire, redire }: Sorties): RuntimeLance {
  // Ce que l'utilisateur doit donner, dit en une fois — pas une variable par
  // démarrage.
  const manquantes = valeursManquantes(environnement);
  if (manquantes.length > 0) throw new ConfigInvalide(direValeursManquantes(manquantes));
  // Présentes : `valeursManquantes` vient de les exiger.
  const repertoireEtat = environnement.BRIGADE_STATE_DIR ?? "";
  const projet = environnement.BRIGADE_PROJECT ?? "";

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
  // Toute la configuration est lue avant de rien écrire : un refus de démarrer
  // ne laisse ni journal ni verrou.
  // La porte d'abord : tout ce qui suit, et tout ce qui sera lancé, passe par
  // elle.
  porte = configReseau(environnement);
  if (porte !== null) passerParLaPorte(porte);
  const reglages = lireReglages(environnement);
  // Les décisions du chef — stations, seuils de coût, calibrage du manager, du
  // reviewer et du closer — n'ont pour support que le journal : lues dès le démarrage, puis
  // relues à chaque lecture.
  // Elles sont le seul support de ces valeurs : une variable de même nom dans
  // l'environnement est ignorée, et dite — une fois par variable, à chaque
  // démarrage.
  for (const nom of decisionsDansLEnvironnement(environnement)) redire(`brigade : ${direDecisionIgnoree(nom, projet)}`);
  // Le dépôt du projet dit sa branche d'intégration, son calibrage et son
  // plafond : ils passent avant ceux de la box, et se relisent à chaque usage.
  const duDepot = lireLeDepot(environnement);
  for (const ligne of duDepot.dits) redire(`brigade : ${ligne}`);
  const decide = environnementDecide(duDepot.env, decisionsAuDemarrage(repertoireEtat), duDepot.reglages);
  // Le bail, les chemins communs et la politique du carnet : ceux du dépôt
  // d'abord, puis ceux de la box.
  const rail = configRail(decide);
  const station = configStation(decide);
  supportDesDecisions({ repertoireEtat, clone: station.clone });
  ({ stations } = station);
  const delais = configPass({ ...environnement, ...variablesDesGatesDuDepot(duDepot.reglages) });
  const reviewer = configReviewer(decide);
  const manager = { ...configManager(decide), plafond: plafondDuProjet(decide, duDepot.reglages) };
  // Lus ici pour qu'un seuil mal écrit refuse le démarrage ; la dérive les
  // relit ensuite à chaque réveil.
  lireSeuils(decide);
  // Les seuils des leçons : un réglage de l'unité du projet, lu une fois.
  const seuilsDesLecons = lireSeuilsDesLecons(decide);
  // Combien de leçons provisoires reçoit le cook d'un ticket : un réglage de
  // l'unité du projet, lu une fois.
  const leconsInjectees = lirePlafondDesLecons(decide);
  configFermeture(decide);
  arbitre = configArbitrage(environnement);
  secrets = configSecrets(environnement, { repertoireEtat, clone: station.clone });
  jeton = configJeton(environnement, { repertoireEtat, clone: station.clone });
  cloison = configCloison(environnement, { repertoireEtat, clone: station.clone });
  session = configSession(environnement, repertoireEtat);
  const apps = configIdentites(environnement);
  identites = apps && ouvrirIdentites({ ...apps, depot: rail.depot });
  // Ce que le dépôt déclare de son réseau, republié dès que la base est
  // rapatriée : branché plus bas, une fois le journal ouvert.
  let republierReseau = () => {};
  const depot = depotDeStation(repertoireEtat, station, identites?.jeton("cook"), () => republierReseau());
  const githubs = ouvrirGitHubs({ depot: rail.depot, bin: rail.gh, identites });
  const socle = demarrer({ repertoireEtat, projet });
  // Le fichier de l'app, créé neutre s'il manque et complété de ce qui lui manque : le chef
  // n'en écrit aucun à la main. Un échec se dit, et le runtime démarre.
  const fichierDeLApp = cheminDeLApp(environnement);
  const dit = fichierDeLApp === undefined ? undefined : direLApp(assurerLApp(fichierDeLApp));
  if (dit !== undefined) redire(`brigade : ${dit}`);
  // L'interrupteur du projet, posé avant que rien ne parte : allumé par défaut,
  // repris des anciens interrupteurs sur un journal d'avant (interrupteur.ts).
  const pose = etablirLInterrupteur(socle.journal, projet, new Date());
  if (pose !== null) dire(pose);
  // Ce que le chef décide sans redémarrer : chaque lecture relit le journal.
  const decisions = suivreDecisions(socle.journal.base, environnement, undefined, duDepot.suivis);
  // Ce que le dépôt déclare sur sa base, relu à chaque rapatriement et à
  // chaque tick : un hôte mergé s'ouvre sans rien redémarrer, et avant le
  // setup du premier ticket pris après lui.
  if (porte !== null) republierReseau = brancherReseau(socle, { base: station.base, declaration: () => lireALaBase(station, DECLARATION_RESEAU) });
  // Sous une identité par rôle, ni les cooks, ni les gates, ni les juges ne
  // partent avec de quoi parler à GitHub : leur `gh` ne trouve aucun compte.
  let env: NodeJS.ProcessEnv = environnement;
  if (identites) {
    const sansCompte = join(repertoireEtat, "gh-sans-compte");
    mkdirSync(sansCompte, { recursive: true });
    env = environnementSansGitHub(environnement, sansCompte);
    // Un jeton vivant par rôle, d'emblée puis à chaque tick : un push de fin
    // de cook ne peut pas attendre le sien.
    const entretenues = identites;
    void entretenues.entretenir();
    socle.surReveil((cause) => void (cause === "tick" && entretenues.entretenir()));
  }
  const garde = brancherGardeFous(reglages, avecRail(socle, { ...rail, github: githubs.rail }));
  // La pass avant la station : c'est elle que la station réveille quand un
  // cook a livré.
  const pass = brancherPass(garde, { ...delais, repertoireEtat, depot, github: githubs.pass, env, secrets, cloison, sansIdentite: identites !== null, base: station.base, reviewer, decisions, depotGitHub: rail.depot, bin: station.bin, seuils: station.seuils, ...(environnement.BRIGADE_STATION_DIR ? { etageCommun: { racine: environnement.BRIGADE_STATION_DIR, expiration: seuilsDesLecons.expirationPromue } } : {}) });
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
  // L'interrupteur de l'état GitHub seul (#2060), lu sur la branche
  // d'intégration à l'ouverture. Éteint, la station est l'ancienne, telle
  // quelle. Allumé, elle ne lance plus aucun cook — ni déclaré, ni relu des
  // décisions — et c'est la station GitHub seul qui prend, cuisine, relit et
  // merge, sous l'identité de la pass.
  const ici = stations.find((declaree) => !declaree.distante);
  const ouvert = brancherBrigadeGithub({
    reglages: duDepot.reglages,
    ancien: () => ({ stations, decisions }),
    station: () =>
      ici === undefined
        ? { refus: "the project declares no station on this machine" }
        : stationDuDepot({
            nom: ici.nom,
            places: ici.cooks,
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
          }),
  });
  if (ouvert.chemin === "github") projetGitHub = ouvert;
  const servie = brancherStation(reglee, {
    ...(ouvert.chemin === "ancien" ? ouvert.ancien : { stations: [], decisions: { ...decisions, stations: () => [] } }),
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
    session: () => sessionClaude(station.bin, environnementClaude(environnement, environnement)),
    dureeBailMs: rail.dureeBailMs,
    presenceMs: station.presenceMs,
    entreesMax: station.entreesMax,
    seuils: station.seuils,
    gardeTranscriptsMs: station.gardeTranscriptsMs,
    apresCook: pass.reveillerPass,
    arbitre: arbitre === null ? null : joindreArbitre(arbitre),
    leconsInjectees,
    // Là où le « oui » du chef les écrit : le clone du projet.
    profils: () => lireLesProfils(station.clone, (texte) => redire(texte)),
    // L'étage commun, si ce projet est servi par une station : aucun sinon.
    commun: () => leconsDeLEtageCommun(environnement.BRIGADE_STATION_DIR),
  });
  // Le manager en dernier : il ne lance que des jugements et des découpages,
  // et rien ne dépend de lui pour servir ce qui est déjà sur le rail.
  // La dérive ne lance rien et ne retient rien : elle lit ce que les autres ont écrit.
  brancherDerive(socle, decisions.seuils);
  const manage = brancherManager(servie, { ...manager, decisions, repertoireEtat, github: githubs.manager, env, cloison, depotGitHub: rail.depot, bin: station.bin, fichiers: depot.fichiers });
  // Le rôle produit, que le rail vide réveille quand le chef l'a allumé : sous l'identité du manager, par un GitHub à lui.
  const sesRoles = identites;
  const dirige = brancherCadence(manage, { github: ouvrirGitHub({ depot: rail.depot, bin: rail.gh, ...(sesRoles ? { jeton: sesRoles.jeton("manager").frais, identite: () => sesRoles.login("manager"), compte: "manager" } : {}) }), depotGitHub: rail.depot, repertoireEtat, bin: station.bin, calibrage: decisions.manager, env, cloison });
  // La session Max ne lance rien et ne retient rien : son échéance se lit du
  // fichier d'état du renouvellement, jamais des identifiants, et la file la dit.
  // Avec un jeton longue durée, il n'y a plus de renouvellement à suivre.
  const suivie = brancherSession(dirige, session, undefined, jeton);
  // De même pour le jeton longue durée : son échéance se lit de la date de sa
  // création, rangée à côté de lui, jamais du jeton.
  const datee = brancherJeton(suivie, jeton);
  // L'alerte d'urgence ne lance rien : elle écrit ce que le runtime a dit au
  // chef, une fois, puis un rappel espacé.
  const alertee = brancherAlerteUrgence(datee);
  // Le disjoncteur ouvert se dit aussi sur GitHub, par une issue labellisée (breaker-issue.ts).
  brancherIssueDuDisjoncteur(alertee, { client: clientGitHubDuDisjoncteur({ depot: rail.depot, bin: rail.gh, ...(identites ? { jeton: identites.jeton("manager").frais, compte: "manager" } : {}) }) });
  // Le tableau de la cuisine ne lance rien non plus : il publie, dans le dépôt
  // du projet, ce que `status` dit — sous l'identité du manager, s'il en a une.
  // Il n'écrit que le tableau d'un projet que cette station sert (board-single-writer.ts).
  const tableau = unSeulEcrivainSurGitHub(clientGitHubDuTableau({ depot: rail.depot, bin: rail.gh, ...(identites ? { jeton: identites.jeton("manager").frais, compte: "manager" } : {}) }), { depot: rail.depot, gh: rail.gh, env: environnement });
  // Les gestes que le chef y poste se lisent et se répondent sous la même
  // identité ; ils se jouent comme ses gestes locaux, sous celle de la pass —
  // qui merge et commente les tickets —, sans que la box retienne leurs appels.
  const roles = identites;
  const roleDesGestes = roles ? { jeton: roles.jeton("pass").frais, identite: () => roles.login("pass"), compte: "pass" } : {};
  const clientDesGestes = clientGitHubDesGestes({ depot: rail.depot, bin: rail.gh, ...(identites ? { jeton: identites.jeton("manager").frais, compte: "manager" } : {}) });
  const gestes = gestesDuTableau({
    client: clientDesGestes,
    journal: alertee.journal,
    projet,
    repertoireEtat,
    repoDir: station.clone,
    github: ouvrirGitHub({ depot: rail.depot, bin: rail.gh, usage: "geste", ...roleDesGestes }),
    // Le commentaire du chef sur une issue part sous le `gh` de la box, le sien.
    githubDuChef: ouvrirGitHub({ depot: rail.depot, bin: rail.gh, usage: "geste" }),
    // La demande d'un `ask` part dans le second du projet, quand cette box le tient (BRIGADE_SECOND_DIR).
    second: secondDuProjet(environnement),
  });
  // Ce qui est avant le rail se relit sous la même identité, par un GitHub qui n'est qu'au tableau (#1836).
  const ouvertes = ouvertesDuDepot(ouvrirGitHub({ depot: rail.depot, bin: rail.gh, ...(roles ? { jeton: roles.jeton("manager").frais, identite: () => roles.login("manager"), compte: "manager" } : {}) }));
  const runtime = brancherLeTableau(alertee, { client: tableau, depot: rail.depot, station: environnement.BRIGADE_STATION_DIR, gestes, mentions: mentionsDuTableau({ client: clientDesGestes, journal: alertee.journal, projet }), ouvertes });


  dire(
    identites
      ? `brigade : GitHub — une identité par rôle (${ROLES.join(", ")}), jetons courts limités au dépôt ; les cooks n'en reçoivent aucun`
      : "brigade : GitHub — identité unique, celle du `gh` de la machine : rien ne réserve le merge à la pass (BRIGADE_GITHUB_APPS_DIR n'est pas défini)",
  );
  // Les stations se disent, déclarées ou non : sans elles aucun cook ne part, et
  // c'est ici que le chef le lit d'abord.
  dire(`brigade : stations — ${direStations(stations)}`);
  dire(
    secrets
      ? `brigade : secrets du projet — ${secrets}, relu à chaque lancement ; ne parviennent au setup, aux cooks et aux gates que ceux que le dépôt déclare (\`${DECLARATION}\`)`
      : `brigade : secrets du projet — aucun (BRIGADE_SECRETS_FILE n'est pas défini) : un dépôt qui en déclare (\`${DECLARATION}\`) ne verra partir aucun cook`,
  );
  dire(`brigade : ${direJeton(jeton, environnement)}`);
  dire(
    arbitre === null
      ? "brigade : arbitre — aucun (BRIGADE_ARBITER_PORT n'est pas défini) : ce projet se tient pour seul sur la machine et sur le compte"
      : `brigade : arbitre — 127.0.0.1:${arbitre}, consulté avant chaque lancement ; injoignable, le projet lance quand même, un cook à la fois`,
  );
  dire(
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
    dire(`brigade : cloison — ${direFichiers(etat.sandbox)}`);
    dire(`brigade : réseau — ${direReseau(etat.proxy)}`);
  };
  // Avec une porte, l'unité doit refuser ce qui la contourne : cela se sonde,
  // et se confirme sur la machine (recette).
  if (porte === null) direCloison(null);
  else void sonderLeFiltre().then(direCloison);
  // Le témoin du démarrage, une fois tout branché : l'empreinte du code sur
  // lequel ce process tourne.
  noterCodeEnService(repertoireEtat);
  dire(`brigade : runtime du projet « ${projet} » démarré — pid ${process.pid}, état dans ${repertoireEtat}`);

  return {
    runtime,
    arreter(signal) {
      identites?.fermer();
      void projetGitHub?.arreter();
      runtime.arreter(signal);
      dire(`brigade : runtime du projet « ${projet} » arrêté (${signal})`);
    },
  };
}
