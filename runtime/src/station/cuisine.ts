// La cuisine d'un projet, ouverte dans le process de la station : ce que le
// runtime d'un projet branchait seul (`main.ts`), mais lu d'un environnement
// qu'on lui donne au lieu de celui du process. Plusieurs cuisines vivent ainsi
// côte à côte, chacune avec son journal, son verrou, sa porte et sa cloison.
//
// La mise en service de la box et la comparaison de version n'y sont pas
// branchées : elles sont celles d'une installation par projet, qui disparaît.
// La station se met à jour une fois pour tous ses projets.
import { availableParallelism } from "node:os";
import { plafondDesCoeurs } from "../projections/stations.ts";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { brancherAlerteUrgence } from "../alerte-urgence.ts";
import { brancherIssueDuDisjoncteur, clientGitHubDuDisjoncteur } from "../breaker-issue.ts";
import { brancherRepriseParGitHub } from "../breaker-resume-github.ts";
import { noterGitHubSeul } from "../github-seul-etat.ts";
import { brancherBrigadeGithub, delaiDesGatesMs, priseDeLaStation, stationDuDepot, type ProjetOuvert } from "../brigade-github.ts";
import { retenirLaPrise } from "../station-update/mettre-a-jour.ts";
import { configRail } from "../alimenter.ts";
import { configArbitrage, joindreArbitre } from "../arbitrage.ts";
import { brancherJeton, configJeton, direJeton } from "../jeton-claude.ts";
import { brancherConnexionMax } from "../connexion-max/cuisine.ts";
import type { VeilleConnexionMax } from "../connexion-max/veille.ts";
import { configBacASableLocal, direBacASable, lireCaches } from "../bac-a-sable/local.ts";
import { sondesDeLaMachine, type Sondes } from "../bac-a-sable/detection.ts";
import { annoncerCloison, configCloison, direFichiers, direReseau, type Cloison } from "../cloison.ts";
import { noterCodeEnService } from "../code.ts";
import { decisionsAuDemarrage, decisionsDansLEnvironnement, direDecisionIgnoree, environnementDecide, suivreDecisions, supportDesDecisions } from "../decisions.ts";
import { lireALaBase, ouvrirDepot, worktreesDuProjet } from "../depot.ts";
import { brancherDerive, lireSeuils } from "../derive.ts";
import { brancherElagageGithub, elagageDuClone } from "../github-seul/elagage/elagage.ts";
import { brancherCloserGithub, lectureDuClone } from "../closer-github-passe/closer-github-passe.ts";
import { coutsDesFlux, noterDeriveGithub } from "../closer-github-passe/derive-github.ts";
import { lesTempsDesTickets } from "../temps-ticket/ligne-status.ts";
import { brancherGardeFous, lireReglages } from "../garde-fous.ts";
import { gardesDuTour } from "../github-seul/garde-fous/garde-fous.ts";
import { configIdentites, environnementSansGitHub, ouvrirGitHubs, ouvrirIdentites, ROLES, type Identites } from "../identites.ts";
import { noterLeModeDesIdentites } from "../appels-par-identite.ts";
import { brancherManager, configManager } from "../manager.ts";
import { brancherMiseAJour } from "../mise-a-jour/relais.ts";
import { brancherRetenue } from "../retenue/brancher.ts";
import { suivreLeTour } from "../retenue/tour.ts";
import { railDuJournal } from "../appairage/rail-du-journal.ts";
import type { TicketPublie } from "../appairage/rail-publie.ts";
import { brancherSession, configSession } from "../renouvellement.ts";
import { brancherReseau, configReseau, DECLARATION_RESEAU, lireDeclaration, reglesDuProjet, REGLES_DE_BASE, sonderLeFiltre, variablesDeRelais } from "../reseau.ts";
import { plafondDuProjet } from "../reagir.ts";
import { lireLeDepot, variablesDesGatesDuDepot } from "../reglages-projet/en-vigueur.ts";
import { configReviewer } from "../reviewer.ts";
import { ConfigInvalide, demarrer, type Runtime } from "../runtime.ts";
import { configSecrets, DECLARATION } from "../secrets.ts";
import { configStation } from "../station.ts";
import { direStations } from "../stations-declarees.ts";

export type Cuisine = {
  projet: string;
  repertoireEtat: string;
  // Son rail, lu dans son journal, tel que la station le publie
  // (`appairage/rail-publie.ts`). Lève une fois la cuisine arrêtée.
  rail?(): TicketPublie[];
  // Arrête la cuisine comme un signal arrêtait le runtime du projet : son
  // journal le dit, son verrou est rendu, ses cooks relayés lui survivent.
  arreter(motif: string): void;
  // Résolue une fois la cuisine arrêtée et son tour GitHub seul en cours,
  // s'il y en a un, fini.
  arretee?(): Promise<void>;
  // Les tickets que ses cooks GitHub seul cuisinent en ce moment.
  enCuisine?(): number[];
};

export type OptionsCuisine = {
  // Une ligne du journal de service de la station.
  dire: (ligne: string) => void;
  // La connexion Max de la machine, que la station veille pour tous ses
  // projets : perdue, la cuisine suspend ; rétablie, elle reprend.
  connexion?: VeilleConnexionMax;
  // Ce que la cuisine regarde de la machine pour savoir si elle est locale et
  // si le bac à sable y est : de quoi la simuler dans un test.
  sondes?: Sondes;
  // Entre deux ticks de son runtime — ce qui relit, entre autres, la décision
  // du chef de cuire sans bac à sable : une minute, à défaut.
  intervalleTickMs?: number;
  // Vrai tant que la station se vide pour sa mise à jour (#2189) : sa cuisine
  // GitHub seul ne prend plus aucun ticket (`retenirLaPrise`).
  retenue?: () => boolean;
  // Avant le premier tour GitHub seul du projet : la station décale ses projets (#2436).
  departMs?: number;
};

// Ouvre la cuisine d'un projet. Toute sa configuration est lue avant de rien
// écrire : un refus (`ConfigInvalide`, `DejaEnCours`) ne laisse ni journal ni
// verrou, et la station le dit sans rien arrêter d'autre.
export function ouvrirCuisine(envDuProjet: Record<string, string | undefined>, options: OptionsCuisine): Cuisine {
  const { dire } = options;
  const exiger = (variable: string): string => {
    const valeur = envDuProjet[variable];
    if (!valeur) throw new ConfigInvalide(`${variable} n'est pas défini`);
    return valeur;
  };
  const repertoireEtat = exiger("BRIGADE_STATE_DIR");
  const projet = exiger("BRIGADE_PROJECT");
  // Où ses cooks travaillent : l'atelier de la station, hors de l'état.
  const worktrees = worktreesDuProjet(envDuProjet, repertoireEtat);

  // La porte du projet, seule sortie de ce qu'il lance : son environnement la
  // porte, celui du process de la station n'en change pas — les autres
  // projets ont la leur.
  const porte = configReseau(envDuProjet);
  // Le dépôt du projet dit sa branche d'intégration, son calibrage et son
  // plafond : ils passent avant ceux de la box, et se relisent à chaque usage.
  const duDepot = lireLeDepot(envDuProjet);
  const envProjet: NodeJS.ProcessEnv = porte === null ? { ...duDepot.env } : { ...duDepot.env, ...variablesDeRelais(porte) };
  const reglages = lireReglages(envProjet);
  for (const nom of decisionsDansLEnvironnement(envProjet)) dire(direDecisionIgnoree(nom, projet));
  const decide = environnementDecide(envProjet, decisionsAuDemarrage(repertoireEtat), duDepot.reglages);
  const rail = configRail(decide);
  const station = configStation(decide);
  if (!existsSync(station.clone)) throw new ConfigInvalide(`le clone du projet (${station.clone}) n'existe pas`, "clone-missing");
  supportDesDecisions({ repertoireEtat, clone: station.clone });
  const { stations } = station;
  const reviewer = configReviewer(decide);
  const manager = { ...configManager(decide), plafond: plafondDuProjet(decide, duDepot.reglages) };
  lireSeuils(decide);
  const arbitre = configArbitrage(envProjet);
  // Le plafond des gates d'une tête, lu ici pour qu'un délai mal écrit refuse le démarrage (#2456).
  const delaiGatesMs = delaiDesGatesMs({ ...envProjet, ...variablesDesGatesDuDepot(duDepot.reglages) });
  const secrets = configSecrets(envProjet, { repertoireEtat, clone: station.clone });
  const jeton = configJeton(envProjet, { repertoireEtat, clone: station.clone });
  const cloison: Cloison | null = configCloison(envProjet, { repertoireEtat, clone: station.clone });
  // Sur le Mac du chef, chaque `claude` de la cuisine part dans le bac à sable
  // de Claude Code ; s'il n'y est pas, elle ne s'ouvre pas. Sa liste réseau est
  // celle que la branche d'intégration déclare, relue à chaque lancement ;
  // illisible, le socle seul.
  const hotes = () => {
    try {
      return reglesDuProjet(lireDeclaration(lireALaBase(station, DECLARATION_RESEAU) ?? "").hotes);
    } catch {
      return REGLES_DE_BASE;
    }
  };
  const bacASable = configBacASableLocal(options.sondes ?? sondesDeLaMachine(station.bin), { home: envProjet.HOME, worktrees, caches: lireCaches(envProjet) }, hotes);
  const session = configSession(envProjet, repertoireEtat);
  const apps = configIdentites(envProjet);

  // Passé ce point, ce qui est ouvert se referme si la suite échoue : dans le
  // process de la station, rien ne meurt avec un refus.
  let identites: Identites | null = null;
  let socle: Runtime | null = null;
  let ouverte: Runtime | null = null;
  // Non nul : le projet est servi sur l'état GitHub seul (`brigade-github.ts`).
  let projetGitHub: ProjetOuvert | null = null;
  try {
    identites = apps && ouvrirIdentites({ ...apps, depot: rail.depot });
    let republierReseau = () => {};
    const depot = ouvrirDepot({
      clone: station.clone,
      base: station.base,
      worktrees,
      env: envProjet,
      jeton: identites?.jeton("cook"),
      apresRapatriement: () => republierReseau(),
    });
    const githubs = ouvrirGitHubs({ depot: rail.depot, bin: rail.gh, identites });
    socle = demarrer({ repertoireEtat, projet, ...(options.intervalleTickMs === undefined ? {} : { intervalleTickMs: options.intervalleTickMs }) });
    const decisions = suivreDecisions(socle.journal.base, envProjet, dire, duDepot.suivis);
    if (porte !== null) republierReseau = brancherReseau(socle, { base: station.base, declaration: () => lireALaBase(station, DECLARATION_RESEAU), avertir: dire });
    // Sous une identité par rôle, ni les cooks, ni les gates, ni les juges ne
    // partent avec de quoi parler à GitHub : leur `gh` ne trouve aucun compte.
    let env = envProjet;
    if (identites) {
      const sansCompte = join(repertoireEtat, "gh-sans-compte");
      mkdirSync(sansCompte, { recursive: true });
      env = environnementSansGitHub(envProjet, sansCompte);
      const entretenues = identites;
      void entretenues.entretenir();
      socle.surReveil((cause) => void (cause === "tick" && entretenues.entretenir()));
    }
    const garde = brancherGardeFous(reglages, socle);
    // L'état GitHub seul, seul chemin (#2061) : c'est la station GitHub seul
    // qui prend, cuisine, relit et merge, sous l'identité de la pass et au nom
    // de la station déclarée sur cette machine.
    const ici = stations.find((declaree) => !declaree.distante);
    // Ce que voit le tour GitHub seul, pour la retenue de la cuisine.
    const suiviDuTour = suivreLeTour();
    const ouvert = brancherBrigadeGithub({
      ...(options.departMs === undefined ? {} : { premierTourMs: options.departMs }),
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
              prise: options.retenue === undefined ? priseDeLaStation : (github, nom) => retenirLaPrise(priseDeLaStation(github, nom), options.retenue as () => boolean),
              claude: station.bin,
              env,
              cloison,
              bacASable,
              plafonds: reglages.plafonds,
              graceMs: reglages.graceMs,
              reviewer: reviewer.calibrage,
              flux: join(repertoireEtat, "github-seul"),
              // Le « stop », le disjoncteur, le quota et l'arbitre (#2213).
              gardes: gardesDuTour({ garde, station: ici.nom, repertoireEtat, arbitre: arbitre === null ? null : joindreArbitre(arbitre), avertir: dire }),
              avertir: dire,
              observer: suiviDuTour.envelopper,
            sauter: suiviDuTour.sauter,
              // Le temps de chaque ticket mergé s'écrit dans le clone du projet (#2342).
              clone: station.clone,
              // Les gates d'un projet sans CI sur ses PR, jouées sur leur tête (#2456).
              gates: { delaiMs: delaiGatesMs, secrets, sansIdentite: identites !== null },
              // Le setup du worktree de chaque cook, joué avant lui (#2535).
              setup: { delaiMs: delaiGatesMs },
            }),
      avertir: dire,
    });
    projetGitHub = ouvert;
    brancherDerive(socle, decisions.seuils, dire);
    const manage = brancherManager(garde, { ...manager, decisions, repertoireEtat, github: githubs.manager, env, cloison, bacASable, depotGitHub: rail.depot, bin: station.bin, fichiers: depot.fichiers });
    // La retenue de la cuisine : rien de servi depuis 30 min alors que des
    // tickets attendent, sa cause et son geste entrent une fois dans la file
    // du chef, et en sortent quand la cuisine sert de nouveau.
    const retenir = <R extends Runtime>(runtime: R) => brancherRetenue(runtime, { station: envProjet.BRIGADE_STATION_DIR, tour: ouvert.refus === undefined ? suiviDuTour : null, branche: process.env.BRIGADE_BASE_BRANCH, dire });
    // Les branches `cook/<n>-github` dont l'issue est fermée, retirées à chaque tick ; et le closer sur GitHub (#2361) :
    // sa passe est une issue que les stations cuisinent, et il relève la dérive que `status` lit, des flux des cooks.
    const elaguee = brancherElagageGithub(manage, elagageDuClone({ clone: station.clone, github: githubs.station, env, avertir: dire }));
    const closee = brancherCloserGithub(elaguee, { reglages: decisions.fermeture, github: githubs.station, clone: lectureDuClone({ depot, clone: station.clone, base: station.base, env }), base: station.base, avertir: dire, temps: () => lesTempsDesTickets(station.clone).enregistrements, derive: { seuils: decisions.seuils, couts: coutsDesFlux(join(repertoireEtat, "github-seul")), noter: (derive) => noterDeriveGithub(repertoireEtat, derive) } });
    // Ce que la mise à jour de la station a donné, recopié au journal du
    // projet : la file le dit.
    const suivie = brancherMiseAJour(brancherAlerteUrgence(retenir(brancherJeton(brancherSession(closee, session, undefined, jeton), jeton))), envProjet.BRIGADE_MISE_A_JOUR_DIR || null, dire);
    const connectee = options.connexion ? brancherConnexionMax(suivie, options.connexion) : suivie;
    const roles = identites;
    const sousLeManager = roles ? { jeton: roles.jeton("manager").frais, compte: "manager" } : {};
    // Le disjoncteur ouvert se dit aussi sur GitHub, par une issue labellisée (breaker-issue.ts),
    // et le `/resume` du chef sur cette issue le referme (breaker-resume-github.ts).
    brancherIssueDuDisjoncteur(connectee, { client: clientGitHubDuDisjoncteur({ depot: rail.depot, bin: rail.gh, projet, ...sousLeManager }), avertir: dire });
    ouverte = brancherRepriseParGitHub(connectee, { github: githubs.rail, avertir: dire });
  } catch (erreur) {
    identites?.fermer();
    void projetGitHub?.arreter();
    try {
      (ouverte ?? socle)?.arreter("refus");
    } catch {
      // Le refus est ce qui se dit ; l'arrêt manqué, le démarrage suivant le notera.
    }
    throw erreur;
  }

  // Le mode se retient aussi pour `status`, qui le dit avec les appels de chaque identité (#2316).
  noterLeModeDesIdentites(envProjet, projet, identites !== null);
  dire(
    identites
      ? `GitHub — une identité par rôle (${ROLES.join(", ")}), jetons courts limités au dépôt ; les cooks n'en reçoivent aucun`
      : "GitHub — identité unique, celle du `gh` de la machine : rien ne réserve le merge à la pass (BRIGADE_GITHUB_APPS_DIR n'est pas défini)",
  );
  for (const ligne of duDepot.dits) dire(ligne);
  dire(`stations — ${direStations(stations)}`);
  dire(
    secrets
      ? `secrets du projet — ${secrets}, relu à chaque lancement ; ne parviennent au setup, aux cooks et aux gates que ceux que le dépôt déclare (\`${DECLARATION}\`)`
      : `secrets du projet — aucun (BRIGADE_SECRETS_FILE n'est pas défini) : un dépôt qui en déclare (\`${DECLARATION}\`) ne verra partir aucun cook`,
  );
  dire(direJeton(jeton, envProjet));
  if (bacASable !== null) dire(direBacASable(bacASable));
  dire(
    arbitre === null
      ? "arbitre — aucun (BRIGADE_ARBITER_PORT n'est pas défini) : ce projet se tient pour seul sur la machine et sur le compte"
      : `arbitre — 127.0.0.1:${arbitre}, consulté avant chaque lancement ; injoignable, le projet lance quand même, un cook à la fois`,
  );
  dire(`session Max — échéance lue de ${session.etat} (relu à chaque tick ; jamais les identifiants), annoncée ${Math.round((session.preavisS / 3600) * 10) / 10} h avant`);

  // La cloison se dit, présente ou non, et s'écrit au journal du projet.
  const annoncee = socle;
  let arretee = false;
  const direCloison = (enforced: boolean | null) => {
    if (arretee) return;
    const etat = {
      sandbox: cloison && { bin: cloison.bin, hidden: cloison.masques, credentials: cloison.identifiants },
      proxy: porte === null ? null : { port: porte, enforced },
    };
    try {
      annoncerCloison(annoncee, etat);
    } catch {
      // La cuisine s'est arrêtée entre-temps : la prochaine ouverture l'écrira.
    }
    dire(`cloison — ${direFichiers(etat.sandbox)}`);
    dire(`réseau — ${direReseau(etat.proxy)}`);
  };
  if (porte === null) direCloison(null);
  else void sonderLeFiltre().then(direCloison);
  noterCodeEnService(repertoireEtat);

  const fermer = identites;
  const runtime = ouverte;
  const servieSurGitHub = projetGitHub;
  let finDuTour: Promise<void> = Promise.resolve();
  return {
    projet,
    repertoireEtat,
    rail() {
      if (arretee) throw new Error(`la cuisine de ${projet} est arrêtée`);
      return railDuJournal(annoncee.journal);
    },
    arreter(motif) {
      if (arretee) return;
      arretee = true;
      fermer?.fermer();
      finDuTour = servieSurGitHub.arreter();
      runtime.arreter(motif);
    },
    arretee: () => finDuTour,
    // Ses cooks en vol, pour la mise à jour de la station (#2189).
    enCuisine: () => servieSurGitHub.enCuisine(),
  };
}
