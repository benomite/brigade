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
import { arbitrationConfig, reachArbiter } from "../arbitration.ts";
import { sessionClaude } from "../claude.ts";
import { brancherJeton, configJeton, direJeton, environnementClaude } from "../jeton-claude.ts";
import { plugMaxConnection } from "../connection-max/kitchen.ts";
import type { MaxConnectionWatch } from "../connection-max/veille.ts";
import { announcePartition, partitionConfig, direFichiers, direReseau, type Partition } from "../partition.ts";
import { noterCodeEnService } from "../code.ts";
import { decisionsAuDemarrage, decisionsDansLEnvironnement, direDecisionIgnoree, environnementDecide, suivreDecisions, supportDesDecisions } from "../decisions.ts";
import { lireALaBase, ouvrirDepot } from "../depot.ts";
import { plugDrift, lireSeuils } from "../drift.ts";
import { plugClosing } from "../closing/run.ts";
import { closingConfig } from "../closing/settings.ts";
import { plugGuardrails, lireReglages } from "../guardrails.ts";
import { configIdentites, environnementSansGitHub, ouvrirGitHubs, ouvrirIdentites, ROLES, type Identites } from "../identites.ts";
import { brancherManager, configManager } from "../manager.ts";
import { brancherMiseAJour } from "../mise-a-jour/relais.ts";
import { brancherPass, configPass } from "../pass.ts";
import { attendreLaPreparation } from "../preparation-depot/attendre.ts";
import { brancherSession, configSession } from "../renouvellement.ts";
import { brancherReseau, configReseau, DECLARATION_RESEAU, sonderLeFiltre, variablesDeRelais } from "../reseau.ts";
import { configReviewer } from "../reviewer.ts";
import { ConfigInvalide, demarrer, type Runtime } from "../runtime.ts";
import { configSecrets, DECLARATION } from "../secrets.ts";
import { brancherStation, configStation } from "../station.ts";
import { direStations } from "../stations-declarees.ts";

export type Kitchen = {
  projet: string;
  repertoireEtat: string;
  // Arrête la cuisine comme un signal arrêtait le runtime du projet : son
  // journal le dit, son verrou est rendu, ses cooks relayés lui survivent.
  arreter(motif: string): void;
};

export type KitchenOptions = {
  // Une ligne du journal de service de la station.
  dire: (ligne: string) => void;
  // La connexion Max de la machine, que la station veille pour tous ses
  // projets : perdue, la cuisine suspend ; rétablie, elle reprend.
  connexion?: MaxConnectionWatch;
};

// Ouvre la cuisine d'un projet. Toute sa configuration est lue avant de rien
// écrire : un refus (`ConfigInvalide`, `DejaEnCours`) ne laisse ni journal ni
// verrou, et la station le dit sans rien arrêter d'autre.
export function openKitchen(envDuProjet: Record<string, string | undefined>, options: KitchenOptions): Kitchen {
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
  const door = configReseau(envDuProjet);
  const envProjet: NodeJS.ProcessEnv = door === null ? { ...envDuProjet } : { ...envDuProjet, ...variablesDeRelais(door) };
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
  closingConfig(decide);
  const arbiter = arbitrationConfig(envProjet);
  const secrets = configSecrets(envProjet, { repertoireEtat, clone: station.clone });
  const jeton = configJeton(envProjet, { repertoireEtat, clone: station.clone });
  const partition: Partition | null = partitionConfig(envProjet, { repertoireEtat, clone: station.clone });
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
    if (door !== null) republierReseau = brancherReseau(socle, { base: station.base, declaration: () => lireALaBase(station, DECLARATION_RESEAU), avertir: dire });
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
    const garde = attendreLaPreparation(plugGuardrails(reglages, avecRail(socle, { ...rail, github: githubs.rail })), { repertoireEtat, dire });
    const pass = brancherPass(garde, { ...delais, repertoireEtat, depot, github: githubs.pass, env, secrets, cloison: partition, sansIdentite: identites !== null, base: station.base, reviewer, decisions, depotGitHub: rail.depot, bin: station.bin, seuils: station.seuils });
    const fermee = plugClosing(pass, { reglages: decisions.fermeture, repertoireEtat, depot, clone: station.clone, base: station.base, github: githubs.station, depotGitHub: rail.depot, bin: station.bin, env, cloison: partition });
    const served = brancherStation(fermee, {
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
      cloison: partition,
      sansIdentite: identites !== null,
      session: () => sessionClaude(station.bin, environnementClaude(envProjet, envProjet)),
      dureeBailMs: rail.dureeBailMs,
      presenceMs: station.presenceMs,
      entreesMax: station.entreesMax,
      seuils: station.seuils,
      gardeTranscriptsMs: station.gardeTranscriptsMs,
      apresCook: pass.reveillerPass,
      arbitre: arbiter === null ? null : reachArbiter(arbiter),
    });
    plugDrift(socle, decisions.seuils, dire);
    const dirige = brancherManager(served, { ...manager, decisions, repertoireEtat, github: githubs.manager, env, cloison: partition, depotGitHub: rail.depot, bin: station.bin, fichiers: depot.fichiers });
    // Ce que la mise à jour de la station a donné, recopié au journal du
    // projet : la file le dit.
    const suivie = brancherMiseAJour(brancherAlerteUrgence(brancherJeton(brancherSession(dirige, session, undefined, jeton), jeton)), envProjet.BRIGADE_MISE_A_JOUR_DIR || null, dire);
    ouverte = options.connexion ? plugMaxConnection(suivie, options.connexion) : suivie;
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
    arbiter === null
      ? "arbitre — aucun (BRIGADE_ARBITER_PORT n'est pas défini) : ce projet se tient pour seul sur la machine et sur le compte"
      : `arbitre — 127.0.0.1:${arbiter}, consulté avant chaque lancement ; injoignable, le projet lance quand même, un cook à la fois`,
  );
  dire(`session Max — échéance lue de ${session.etat} (relu à chaque tick ; jamais les identifiants), annoncée ${Math.round((session.preavisS / 3600) * 10) / 10} h avant`);

  // La cloison se dit, présente ou non, et s'écrit au journal du projet.
  const annoncee = socle;
  let arretee = false;
  const sayPartition = (enforced: boolean | null) => {
    if (arretee) return;
    const etat = {
      sandbox: partition && { bin: partition.bin, hidden: partition.masques, credentials: partition.identifiants },
      proxy: door === null ? null : { port: door, enforced },
    };
    try {
      announcePartition(annoncee, etat);
    } catch {
      // La cuisine s'est arrêtée entre-temps : la prochaine ouverture l'écrira.
    }
    dire(`cloison — ${direFichiers(etat.sandbox)}`);
    dire(`réseau — ${direReseau(etat.proxy)}`);
  };
  if (door === null) sayPartition(null);
  else void sonderLeFiltre().then(sayPartition);
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
