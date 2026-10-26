// La cuisine d'un projet, ouverte dans le process de la station : ce que le
// runtime d'un projet branchait seul (`main.ts`), mais lu d'un environnement
// qu'on lui donne au lieu de celui du process. Plusieurs cuisines vivent ainsi
// côte à côte, chacune avec son journal, son verrou, sa porte et sa cloison.
//
// La mise en service de la box et la comparaison de version n'y sont pas
// branchées : elles sont celles d'une installation par projet, qui disparaît.
// La station se met à jour une fois pour tous ses projets.
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { brancherAlerteUrgence } from "../alerte-urgence.ts";
import { avecRail, configRail } from "../alimenter.ts";
import { configArbitrage, joindreArbitre } from "../arbitrage.ts";
import { leconsDeLEtageCommun } from "../commun/installation.ts";
import { sessionClaude } from "../claude.ts";
import { brancherJeton, configJeton, direJeton, environnementClaude } from "../jeton-claude.ts";
import { brancherConnexionMax } from "../connexion-max/cuisine.ts";
import type { VeilleConnexionMax } from "../connexion-max/veille.ts";
import { configBacASableLocal, direBacASable, lireCaches } from "../bac-a-sable/local.ts";
import { sondesDeLaMachine, type Sondes } from "../bac-a-sable/detection.ts";
import { annoncerCloison, configCloison, direFichiers, direReseau, type Cloison } from "../cloison.ts";
import { noterCodeEnService } from "../code.ts";
import { decisionsAuDemarrage, decisionsDansLEnvironnement, direDecisionIgnoree, environnementDecide, suivreDecisions, supportDesDecisions } from "../decisions.ts";
import { lireALaBase, ouvrirDepot, worktreesDuProjet } from "../depot.ts";
import { brancherDerive, lireSeuils } from "../derive.ts";
import { lireSeuils as lireSeuilsDesLecons } from "../seuils/seuils.ts";
import { brancherFermeture } from "../closing/run.ts";
import { configFermeture } from "../closing/settings.ts";
import { brancherGardeFous, lireReglages } from "../garde-fous.ts";
import { configIdentites, environnementSansGitHub, ouvrirGitHubs, ouvrirIdentites, ROLES, type Identites } from "../identites.ts";
import { brancherManager, configManager } from "../manager.ts";
import { brancherMiseAJour } from "../mise-a-jour/relais.ts";
import { brancherPass, configPass } from "../pass.ts";
import { identiteDeLaStation } from "../appairage/presence.ts";
import { railDuJournal } from "../appairage/rail-du-journal.ts";
import type { TicketPublie } from "../appairage/rail-publie.ts";
import { retenirSansDecision } from "../onboarding/attente.ts";
import { attendreLaPreparation } from "../preparation-depot/attendre.ts";
import { brancherSession, configSession } from "../renouvellement.ts";
import { brancherReseau, configReseau, DECLARATION_RESEAU, lireDeclaration, reglesDuProjet, REGLES_DE_BASE, sonderLeFiltre, variablesDeRelais } from "../reseau.ts";
import { plafondDuProjet } from "../reagir.ts";
import { lireLeDepot } from "../reglages-projet/en-vigueur.ts";
import { configReviewer } from "../reviewer.ts";
import { ConfigInvalide, demarrer, type Runtime } from "../runtime.ts";
import { configSecrets, DECLARATION } from "../secrets.ts";
import { brancherStation, configStation } from "../station.ts";
import { direStations } from "../stations-declarees.ts";
import { ouvrirGitHub } from "../github.ts";
import { clientGitHubDuTableau } from "../tableau/publication/client.ts";
import { brancherLeTableau } from "../tableau/publication/publier.ts";
import { clientGitHubDesGestes } from "../tableau/gestes/client.ts";
import { gestesDuTableau } from "../tableau/gestes/gestes.ts";
import { mentionsDuTableau } from "../tableau/mention/mention.ts";

export type Cuisine = {
  projet: string;
  repertoireEtat: string;
  // Son rail, lu dans son journal, tel que la station le publie
  // (`appairage/rail-publie.ts`). Lève une fois la cuisine arrêtée.
  rail?(): TicketPublie[];
  // Arrête la cuisine comme un signal arrêtait le runtime du projet : son
  // journal le dit, son verrou est rendu, ses cooks relayés lui survivent.
  arreter(motif: string): void;
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
  const rail = configRail(envProjet);
  const reglages = lireReglages(envProjet);
  for (const nom of decisionsDansLEnvironnement(envProjet)) dire(direDecisionIgnoree(nom, projet));
  const decide = environnementDecide(envProjet, decisionsAuDemarrage(repertoireEtat), duDepot.reglages);
  const station = configStation(decide);
  if (!existsSync(station.clone)) throw new ConfigInvalide(`le clone du projet (${station.clone}) n'existe pas`, "clone-missing");
  supportDesDecisions({ repertoireEtat, clone: station.clone });
  const { stations } = station;
  const delais = configPass(envProjet);
  const reviewer = configReviewer(decide);
  const manager = { ...configManager(decide), plafond: plafondDuProjet(decide, duDepot.reglages) };
  lireSeuils(decide);
  configFermeture(decide);
  const arbitre = configArbitrage(envProjet);
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
    // Le ticket qui prépare le dépôt, quand la station l'a ouvert : seul à
    // partir tant qu'il n'est pas servi — sous la passe de fermeture, qui ne
    // transmet pas la restriction d'une prise.
    // Sur une station sans bac à sable, rien ne part avant que le chef ait
    // choisi — pas même ce ticket : la retenue est la plus extérieure.
    const garde = retenirSansDecision(attendreLaPreparation(brancherGardeFous(reglages, avecRail(socle, { ...rail, github: githubs.rail })), { repertoireEtat, dire }), { repertoireEtat, station: identiteDeLaStation(envProjet).nom, dire });
    const pass = brancherPass(garde, { ...delais, repertoireEtat, depot, github: githubs.pass, env, secrets, cloison, bacASable, sansIdentite: identites !== null, base: station.base, reviewer, decisions, depotGitHub: rail.depot, bin: station.bin, seuils: station.seuils, ...(envProjet.BRIGADE_STATION_DIR ? { etageCommun: { racine: envProjet.BRIGADE_STATION_DIR, expiration: lireSeuilsDesLecons(envProjet).expirationPromue } } : {}) });
    const fermee = brancherFermeture(pass, { reglages: decisions.fermeture, repertoireEtat, depot, clone: station.clone, base: station.base, github: githubs.station, depotGitHub: rail.depot, bin: station.bin, env, cloison, bacASable });
    const servie = brancherStation(fermee, {
      stations,
      decisions,
      repertoireEtat,
      worktrees,
      depot,
      github: githubs.station,
      depotGitHub: rail.depot,
      base: station.base,
      bin: station.bin,
      env,
      secrets,
      cloison,
      bacASable,
      sansIdentite: identites !== null,
      session: () => sessionClaude(station.bin, environnementClaude(envProjet, envProjet)),
      dureeBailMs: rail.dureeBailMs,
      presenceMs: station.presenceMs,
      entreesMax: station.entreesMax,
      seuils: station.seuils,
      gardeTranscriptsMs: station.gardeTranscriptsMs,
      apresCook: pass.reveillerPass,
      arbitre: arbitre === null ? null : joindreArbitre(arbitre),
      // L'étage commun de la station : ce que le chef a accepté pour tous ses projets.
      commun: () => leconsDeLEtageCommun(envProjet.BRIGADE_STATION_DIR),
    });
    brancherDerive(socle, decisions.seuils, dire);
    const dirige = brancherManager(servie, { ...manager, decisions, repertoireEtat, github: githubs.manager, env, cloison, bacASable, depotGitHub: rail.depot, bin: station.bin, fichiers: depot.fichiers });
    // Ce que la mise à jour de la station a donné, recopié au journal du
    // projet : la file le dit.
    const suivie = brancherMiseAJour(brancherAlerteUrgence(brancherJeton(brancherSession(dirige, session, undefined, jeton), jeton)), envProjet.BRIGADE_MISE_A_JOUR_DIR || null, dire);
    const connectee = options.connexion ? brancherConnexionMax(suivie, options.connexion) : suivie;
    // Le tableau de la cuisine, publié dans le dépôt du projet comme le
    // runtime d'un seul projet le publiait (`main.ts`) : chaque cuisine le
    // sien, dans son dépôt, ses gestes joués sur son journal. Le process de la
    // station ne porte aucun projet : chaque appel est compté au sien.
    const roles = identites;
    const sousLeManager = roles ? { jeton: roles.jeton("manager").frais, compte: "manager" } : {};
    const tableau = clientGitHubDuTableau({ depot: rail.depot, bin: rail.gh, projet, ...sousLeManager });
    const clientDesGestes = clientGitHubDesGestes({ depot: rail.depot, bin: rail.gh, projet, ...sousLeManager });
    const gestes = gestesDuTableau({
      client: clientDesGestes,
      journal: connectee.journal,
      projet,
      repertoireEtat,
      github: ouvrirGitHub({ depot: rail.depot, bin: rail.gh, usage: "geste", projet, ...(roles ? { jeton: roles.jeton("pass").frais, identite: () => roles.login("pass"), compte: "pass" } : {}) }),
      avertir: dire,
    });
    const mentions = mentionsDuTableau({ client: clientDesGestes, journal: connectee.journal, projet, avertir: dire });
    ouverte = brancherLeTableau(connectee, { client: tableau, depot: rail.depot, station: envProjet.BRIGADE_STATION_DIR, gestes, mentions, dire, avertir: dire });
  } catch (erreur) {
    identites?.fermer();
    try {
      (ouverte ?? socle)?.arreter("refus");
    } catch {
      // Le refus est ce qui se dit ; l'arrêt manqué, le démarrage suivant le notera.
    }
    throw erreur;
  }

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
      runtime.arreter(motif);
    },
  };
}
