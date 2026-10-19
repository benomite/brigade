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
import { sessionClaude } from "../claude.ts";
import { brancherJeton, configJeton, direJeton, environnementClaude } from "../jeton-claude.ts";
import { brancherConnexionMax } from "../max-connection/kitchen.ts";
import type { VeilleConnexionMax } from "../max-connection/watch.ts";
import { annoncerCloison, configCloison, direFichiers, direReseau, type Cloison } from "../cloison.ts";
import { noterCodeEnService } from "../code.ts";
import { decisionsAuDemarrage, decisionsDansLEnvironnement, direDecisionIgnoree, environnementDecide, suivreDecisions, supportDesDecisions } from "../decisions.ts";
import { lireALaBase, ouvrirDepot } from "../depot.ts";
import { brancherDerive, lireSeuils } from "../derive.ts";
import { brancherFermeture } from "../closing/run.ts";
import { configFermeture } from "../closing/settings.ts";
import { brancherGardeFous, lireReglages } from "../garde-fous.ts";
import { configIdentites, environnementSansGitHub, ouvrirGitHubs, ouvrirIdentites, ROLES, type Identites } from "../identites.ts";
import { brancherManager, configManager } from "../manager.ts";
import { brancherMiseAJour } from "../update/relay.ts";
import { brancherPass, configPass } from "../pass.ts";
import { awaitPreparation } from "../repo-preparation/wait.ts";
import { brancherSession, configSession } from "../renouvellement.ts";
import { brancherReseau, configReseau, DECLARATION_RESEAU, sonderLeFiltre, variablesDeRelais } from "../reseau.ts";
import { configReviewer } from "../reviewer.ts";
import { ConfigInvalide, demarrer, type Runtime } from "../runtime.ts";
import { configSecrets, DECLARATION } from "../secrets.ts";
import { brancherStation, configStation } from "../station.ts";
import { direStations } from "../stations-declarees.ts";

export type Cuisine = {
  projet: string;
  repertoireEtat: string;
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

  // La porte du projet, seule sortie de ce qu'il lance : son environnement la
  // porte, celui du process de la station n'en change pas — les autres
  // projets ont la leur.
  const porte = configReseau(envDuProjet);
  const envProjet: NodeJS.ProcessEnv = porte === null ? { ...envDuProjet } : { ...envDuProjet, ...variablesDeRelais(porte) };
  const rail = configRail(envProjet);
  const reglages = lireReglages(envProjet);
  for (const nom of decisionsDansLEnvironnement(envProjet)) dire(direDecisionIgnoree(nom, projet));
  const decide = environnementDecide(envProjet, decisionsAuDemarrage(repertoireEtat));
  const station = configStation(decide);
  if (!existsSync(station.clone)) throw new ConfigInvalide(`le clone du projet (${station.clone}) n'existe pas`);
  supportDesDecisions({ repertoireEtat, clone: station.clone });
  const { stations } = station;
  const delais = configPass(envProjet);
  const reviewer = configReviewer(decide);
  const manager = configManager(decide);
  lireSeuils(decide);
  configFermeture(decide);
  const arbitre = configArbitrage(envProjet);
  const secrets = configSecrets(envProjet, { repertoireEtat, clone: station.clone });
  const jeton = configJeton(envProjet, { repertoireEtat, clone: station.clone });
  const cloison: Cloison | null = configCloison(envProjet, { repertoireEtat, clone: station.clone });
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
      worktrees: join(repertoireEtat, "worktrees"),
      env: envProjet,
      jeton: identites?.jeton("cook"),
      apresRapatriement: () => republierReseau(),
    });
    const githubs = ouvrirGitHubs({ depot: rail.depot, bin: rail.gh, identites });
    socle = demarrer({ repertoireEtat, projet });
    const decisions = suivreDecisions(socle.journal.base, envProjet, dire);
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
    const garde = awaitPreparation(brancherGardeFous(reglages, avecRail(socle, { ...rail, github: githubs.rail })), { stateDir: repertoireEtat, say: dire });
    const pass = brancherPass(garde, { ...delais, repertoireEtat, depot, github: githubs.pass, env, secrets, cloison, sansIdentite: identites !== null, base: station.base, reviewer, decisions, depotGitHub: rail.depot, bin: station.bin, seuils: station.seuils });
    const fermee = brancherFermeture(pass, { reglages: decisions.fermeture, repertoireEtat, depot, clone: station.clone, base: station.base, github: githubs.station, depotGitHub: rail.depot, bin: station.bin, env, cloison });
    const servie = brancherStation(fermee, {
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
      session: () => sessionClaude(station.bin, environnementClaude(envProjet, envProjet)),
      dureeBailMs: rail.dureeBailMs,
      presenceMs: station.presenceMs,
      entreesMax: station.entreesMax,
      seuils: station.seuils,
      gardeTranscriptsMs: station.gardeTranscriptsMs,
      apresCook: pass.reveillerPass,
      arbitre: arbitre === null ? null : joindreArbitre(arbitre),
    });
    brancherDerive(socle, decisions.seuils, dire);
    const dirige = brancherManager(servie, { ...manager, decisions, repertoireEtat, github: githubs.manager, env, cloison, depotGitHub: rail.depot, bin: station.bin, fichiers: depot.fichiers });
    // Ce que la mise à jour de la station a donné, recopié au journal du
    // projet : la file le dit.
    const suivie = brancherMiseAJour(brancherAlerteUrgence(brancherJeton(brancherSession(dirige, session, undefined, jeton), jeton)), envProjet.BRIGADE_MISE_A_JOUR_DIR || null, dire);
    ouverte = options.connexion ? brancherConnexionMax(suivie, options.connexion) : suivie;
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
  dire(`stations — ${direStations(stations)}`);
  dire(
    secrets
      ? `secrets du projet — ${secrets}, relu à chaque lancement ; ne parviennent au setup, aux cooks et aux gates que ceux que le dépôt déclare (\`${DECLARATION}\`)`
      : `secrets du projet — aucun (BRIGADE_SECRETS_FILE n'est pas défini) : un dépôt qui en déclare (\`${DECLARATION}\`) ne verra partir aucun cook`,
  );
  dire(direJeton(jeton, envProjet));
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
    arreter(motif) {
      if (arretee) return;
      arretee = true;
      fermer?.fermer();
      runtime.arreter(motif);
    },
  };
}
