// Les faits d'un projet, en lecture seule, dans une forme destinée à un programme :
// un objet JSON (`lireLesFaits`). Plus aucune commande ne les rend (ticket 4677) :
// l'onglet des agents (agents-tab/sources.ts) les lit sans process.
import { cadenceDeLaCuisine } from "./activite-cuisine/cadence.ts";
import { activiteDeLaCuisine } from "./activite-cuisine/comptes.ts";
import { LectureImpossible } from "./appel.ts";
import { triagesDesDerniersJours } from "./carte-todo.ts";
import { faits, lireEtat } from "./etat.ts";
import { lireGitHubSeul } from "./github-seul-etat.ts";
import { limiteDuCompteDeLaStation } from "./github-limite.ts";
import { appelsDeLaStation, pauseDeLaStation } from "./limite-github.ts";
import { refusDuProjet } from "./mise-a-jour/en-service.ts";
import { rolesDeLaCuisine } from "./roles-cuisine/roles.ts";
import { equipeDuProjet } from "./autonomie/agents/agents.ts";
import { magasinDeNiveaux, NiveauxIllisibles, type Reglable } from "./autonomie/agents/niveaux.ts";
import { enregistrementDe, gestesDe, GestesIllisibles } from "./autonomie/agents/gestes.ts";
import { progresDe } from "./autonomie/agents/politique.ts";
import { horaireDe } from "./autonomie/agents/horaires.ts";
import { lacuneDeLaStation } from "./routage-station/lacune.ts";
import { ouvrirJournal } from "./journal.ts";
import { journalPasRejoue } from "./journal-pas-rejoue.ts";
import { apprentissageDuProjet } from "./apprentissage/projet.ts";
import { decisionsPosees } from "./decisions.ts";
import { plafondDuProjet } from "./reagir.ts";
import { reglagesPourMontrer } from "./reglages-projet/en-vigueur.ts";
import { coutDuProjet, lireBudget, lireBudgetDeLaBase } from "./cout-des-gates.ts";
import { ticketDuBudget } from "./budget-des-gates.ts";
import { lireBlocagesSansQuestion } from "./blocages-sans-question.ts";
import { lireLesFinsDesPannes, lirePostMortems } from "./post-mortems/post-mortems.ts";

const MANQUE = "BRIGADE_STATE_DIR n'est pas défini";

// Les faits du projet de cet environnement, à cet instant : l'objet des faits. Lève `LectureImpossible` quand son journal ne se lit pas.
export function lireLesFaits(env: Record<string, string | undefined>, maintenant = new Date()): Record<string, unknown> {
  const repertoireEtat = env.BRIGADE_STATE_DIR;
  if (!repertoireEtat) throw new LectureImpossible(2, MANQUE);

  let journal;
  try {
    journal = ouvrirJournal(repertoireEtat, { lectureSeule: true });
  } catch (erreur) {
    throw new LectureImpossible(1, erreur instanceof Error ? erreur.message : String(erreur));
  }
  try {
    // Le refus de la station de cette machine, lu dans ce qu'elle dit d'elle-même :
    // les stations d'ici du projet sont alors `refused`.
    const refus = refusDuProjet(env.BRIGADE_STATION_DIR, env.BRIGADE_PROJECT);
    const forme = faits(lireEtat(journal, maintenant), maintenant, env.BRIGADE_GITHUB_REPO, pauseDeLaStation(env.BRIGADE_STATION_DIR, maintenant.getTime()), refus, appelsDeLaStation(env.BRIGADE_STATION_DIR, maintenant.getTime()), (station) => lacuneDeLaStation(env.BRIGADE_STATION_DIR, env.BRIGADE_PROJECT, station));
    // Ce que les cooks ont appris : absent quand le projet n'a ni leçon ni profil, ou quand son
    // carnet ou une définition est illisible — un fichier du dépôt ne fait pas taire les faits.
    const projet = env.BRIGADE_PROJECT;
    let apprentissage;
    try {
      apprentissage = projet ? apprentissageDuProjet({ journal, projet, repoDir: env.BRIGADE_REPO_DIR, depot: env.BRIGADE_GITHUB_REPO, branche: env.BRIGADE_BASE_BRANCH }) : undefined;
    } catch {
      apprentissage = undefined;
    }
    const appris = apprentissage !== undefined && (apprentissage.lecons.length > 0 || apprentissage.profils.length > 0);
    // Le plafond de calibrage du manager, tel que le runtime le lit : porté
    // par le dépôt du projet (`depuisLeDepot`), posé par le chef, ou son défaut.
    const plafond = plafondDuProjet(decisionsPosees(journal.base), reglagesPourMontrer(env));
    const plafondDeCalibrage = { modele: plafond.model, effort: plafond.effort, parLeChef: { modele: plafond.pose.model, effort: plafond.pose.effort }, ...(plafond.depot ? { depuisLeDepot: true } : {}) };
    // Ce que le triage a fait chacun des sept derniers jours (UTC) : les cartes qu'il a tranchées seul, celles qu'il a laissées entrer dans TODO.
    const triage = triagesDesDerniersJours(journal.base, maintenant, 7);
    // Ce que la cuisine du projet a servi, renvoyé et remonté au chef dans la dernière heure et le dernier
    // jour : six nombres, six zéros sans activité. Le projet est celui de l'unité, à défaut celui du journal.
    const projetDuJournal = journal.base.lire<{ project: string }>("SELECT project FROM events ORDER BY seq DESC LIMIT 1")[0]?.project;
    const activiteCuisine = activiteDeLaCuisine(journal.base, projet || projetDuJournal || "", maintenant);
    // À quelle allure elle sert (#1811) : servis et ratés heure par heure sur les 24 dernières, et le temps
    // ordinaire d'un ticket pris, puis en pass — d'où l'histogramme du rail et la carte qui traîne.
    const cadence = cadenceDeLaCuisine(journal.base, projet || projetDuJournal || "", maintenant);
    // Les rôles de la cuisine du projet, chacun avec sa ligne et sa dernière action — nulle s'il n'a rien fait.
    const rolesCuisine = rolesDeLaCuisine(journal.base, projet || projetDuJournal || "");
    // Une fiche par agent — le manager, le superviseur, le closer, la pass, puis chaque cook —, avec son niveau
    // d'autonomie, son journal de gestes et son prochain passage (#4038). Un fichier de niveaux ou de gestes illisible ne fait pas taire les faits :
    // il est dit à la place des fiches.
    let equipe;
    try {
      // Avec, pour chacune, si le chef a épinglé son niveau et où en est sa promotion (#4380).
      const { niveaux, epingles, traites } = magasinDeNiveaux(repertoireEtat).etat(projet || projetDuJournal || "");
      const politique = (agent: string, reglable: Reglable) => ({ pinned: epingles.has(reglable), progress: progresDe(gestesDe(repertoireEtat, agent), niveaux[reglable], traites) });
      equipe = equipeDuProjet({ agents: forme.agents, cooks: forme.cooks, roles: rolesCuisine, niveaux, gestes: (agent) => enregistrementDe(repertoireEtat, agent), horaires: { maintenant, de: (agent) => horaireDe(repertoireEtat, agent) }, politique });
    } catch (erreur) {
      if (!(erreur instanceof NiveauxIllisibles || erreur instanceof GestesIllisibles)) throw erreur;
      equipe = { illisible: erreur.message };
    }
    // Ce que coûtent les gates du projet face à son budget — posé par le chef,
    // ou son défaut : le dernier passage, son dépassement, le dernier jour ; et
    // le ticket que la cuisine a ouvert seule pour les y ramener, tant que rien
    // ne l'a vu fermé — null sinon.
    const projetDesGates = projet || projetDuJournal || "";
    const posees = decisionsPosees(journal.base);
    // La limite que GitHub impose au compte, la même pour tous les projets de la station :
    // absente quand les appels passent.
    const github = limiteDuCompteDeLaStation(env.BRIGADE_STATION_DIR);
    const coutDesGates = { ...coutDuProjet(journal.base, projetDesGates, lireBudget(posees), maintenant, lireBudgetDeLaBase(posees)), ticket: ticketDuBudget(journal.base, projetDesGates) };
    // L'interrupteur GitHub seul, quand il est allumé : accepté, ou refusé et pourquoi (`github-seul-etat.ts`).
    const githubSeul = lireGitHubSeul(env.BRIGADE_STATE_DIR);
    // Les post-mortems des pannes du projet (#4023) : un fichier illisible les retire des faits, il ne les fait pas taire.
    let postMortems;
    try {
      // Rangés en ajout seul : lus avant leurs fins, ils les précèdent de même rang.
      const lus = projet ? lirePostMortems(repertoireEtat, projet) : undefined;
      const fins = projet ? lireLesFinsDesPannes(repertoireEtat, projet) : [];
      postMortems = lus?.map((postMortem, rang) => ({ ...postMortem, fin: fins[rang] as string }));
    } catch {
      postMortems = undefined;
    }
    return { ...forme, blockedWithoutQuestion: lireBlocagesSansQuestion(repertoireEtat), ...(githubSeul === null ? {} : { githubSeul }), plafondDeCalibrage, triage, activiteCuisine, cadence, rolesCuisine, equipe, coutDesGates, ...(postMortems === undefined ? {} : { postMortems }), ...(github === null ? {} : { github }), ...(appris ? { apprentissage } : {}) };
  } catch (erreur) {
    // En lecture seule, rien ne crée les tables d'un journal écrit par un
    // runtime d'avant ces projections, ni ne leur donne leur forme du jour.
    if (journalPasRejoue(erreur)) {
      throw new LectureImpossible(1, "ce journal n'a pas encore tout l'état que `faits` lit : redémarrer le runtime, qui le recalcule");
    }
    throw erreur;
  } finally {
    journal.fermer();
  }
}
