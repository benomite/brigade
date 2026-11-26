// Un projet servi sur l'état GitHub seul (épique #2053, spec
// `docs/superpowers/specs/2026-11-02-github-only-state.md`) : le tour d'une
// station qui prend, cuisine et merge les tickets en ne lisant et n'écrivant
// que GitHub — ni relais de prise, ni boîte aux lettres, ni journal qui
// arbitre. Aucune station n'y est principale : chacune prend, chacune relit,
// chacune merge, et l'arrêt de l'une n'arrête pas les autres.
//
// C'est le seul chemin (#2061) : la cuisine d'un runtime par projet (`main.ts`)
// comme celle de chaque projet d'une station (`station/cuisine.ts`), qui est ce
// que la box fait tourner, l'ouvrent à l'ouverture. Une station qui ne peut pas
// le servir le dit, et ne cuisine rien pour le projet.
//
// Ce module enchaîne les contrats de l'épique, il ne les refait pas : l'état
// d'un ticket et de la base (`github-etat/etats.ts`, #2057), la prise
// (`github-etat/prise.ts`, #2056), la relecture et le merge
// (`github-etat/fusion.ts`, #2058). Le cook et la relecture sont ceux
// d'aujourd'hui — worktree du dépôt de la station, cloison, consignes du cook
// et du reviewer —, lancés ici sans journal.
import { homedir } from "node:os";
import { REGLES_DE_BASE, type Regle } from "./reseau.ts";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { current } from "./agent-settings/index.ts";
import { direZoneTenue, lecteurDeLaBase, type PRDeLaPorte, type RaisonDuSaut, vivante, ZONE_HELD } from "./claim-gate.ts";
import { retirerLesRestesDuCook } from "./station/restes-du-cook.ts";
import { horsDesBesoins } from "./besoin/besoin.ts";
import { horsDesTickets } from "./issue-de-la-cuisine.ts";
import { fiche, type Fiche } from "./fiche.ts";
import { dependancesDuCorps } from "./attente-du-rail/raison.ts";
import { defaireLesBoucles } from "./boucle-attente/boucle-attente.ts";
import { attendusDuBlocage, attendusDuCorps, corpsDeLAttente, direAttenteDeTicket, direAttenteSurMisDeCote, direSaut } from "./attente-ticket/attente-ticket.ts";
import { consigneDeLAttenteLongue, lireRevue, origineDeLAttente, suiviDesAttentesLongues, type RevoirLAttente } from "./attente-longue/attente-longue.ts";
import { leveesDesCommentaires } from "./boucle-attente/levee.ts";
import { corpsDeLIncapacite, direIncapacite, direLaLacune, gatesInjouables, incapablesLus, stationsCapables } from "./routage-station/routage-station.ts";
import { calibrage as calibrageDesLabels, complet, type Calibrage } from "./calibrage.ts";
import { DERNIERS_COMMENTAIRES, environnementHorsGitHub, ticketJoint } from "./bac-a-sable/hors-github.ts";
import { dansLeBacASableLocal, dansLeModeRestreint, lireCaches, type BacASableLocal } from "./bac-a-sable/local.ts";
import { argumentsClaude, consigne, environnementCook, lireFlux, VARIABLES_DE_JETON, verdict } from "./claude.ts";
import { garderLeCook } from "./garde-cook/garde.ts";
import { poserALaMain } from "./blocages-sans-question.ts";
import { besoinDeSecret } from "./besoin-de-secret.ts";
import { enFluxClaude } from "./passe-moteur/flux.ts";
import { avecLesMotsAuCook } from "./mot-au-cook/lanceur.ts";
import { lireBlocage, lireDejaServi, lireLivrable } from "./livrable.ts";
import { MARQUE_DEJA_SERVI, verifierDejaServi, type DejaServi } from "./deja-servi.ts";
import { admetUnConstat, MARQUE_DE_CONSTAT } from "./constat-seul.ts";
import { lireLeGeste, poserLaCarteDeLaStation } from "./carte-station/carte-station.ts";
import { faireLesGestesGitHub, lireLesGestesDuManager } from "./geste-station/geste-station.ts";
import { consigneDuBlocage, corpsDeLaCarte, corpsDeLaReponseAuBlocage, lireAvis, MARQUE_DE_DECISION, MARQUE_DE_REPONSE, REPONSES_AVANT_DECISION, sectionDeLaDecision, type ConsulterLeManager, type ReponseDuManager } from "./blocage-au-manager.ts";
import { envelopper, type Cloison, type Lancement } from "./cloison.ts";
import type { Depot } from "./depot.ts";
import type { Plafonds } from "./events/guardrails.ts";
import { jamaisParti } from "./projections/guardrails.ts";
import { labelPoseLe } from "./attente-du-rail/lecture.ts";
import { ordreDeMerge } from "./ordre-de-merge/ordre.ts";
import { CHEF_TODO, estParque, etatDeLaBase, etatDuTicket, LABEL_IN_PASS, LABEL_TAKEN, LABEL_PARKED, LABELS_D_AVANT_PARKED } from "./github-etat/etats.ts";
import { lireAttenteDuCook, mettreEnAttenteParLaCuisine, parquerSesEchecs, ramenerALaRelance } from "./attente/attente-par-le-cook.ts";
import { termeDeLAttente, veilleDesOrphelins } from "./reprise-attente/orphelins.ts";
import { attenteDeZone, direAttenteDeZone, type AttenteDeZone, type EnVol, ZONE_VIDE, zoneVide } from "./chevauchement/chevauchement.ts";
import type { CheckDeLaBase } from "./checks-de-la-branche.ts";
import { lireInstantane, REQUETE, type Instantane, type PRDeLInstantane } from "./github-etat/instantane.ts";
import { estLaPauseDeGitHub, LimiteGitHubAtteinte } from "./limite-github.ts";
import type { RelancerLaBase } from "./invariants/base-rouge.ts";
import { controleurDesInvariants, invariantsDuRail, type Invariant } from "./invariants/invariants.ts";
import { tientSaZone } from "./invariants/zones.ts";
import { avecLaTete } from "./invariants/meme-echec.ts";
import { ConfigInvalide } from "./runtime.ts";
import { tenant as tenantDeLaPrise, faitsDePrise, lacher, premierePrise, prendre, purger, stationsDesPrises } from "./github-etat/prise.ts";
import { stationsDuManager } from "./github-etat/prise-du-manager.ts";
import { corpsDeLaQuestion, corpsDeLaReprise, questionEnSuspens, type QuestionEnSuspens } from "./manager/question-sans-manager.ts";
import { corpsDeCeQuiEstFait, lirePointsALEcran, numeroDeLaPR } from "./validation-design/brief.ts";
import { avecChangements, lireChangements } from "./validation-design/changements.ts";
import { cleDansLaLivraison, lancementDuCook, moteurDeLaStation, noterLaLivraison } from "./moteur/moteur.ts";
import { consigneDuChoix, lireLeChoix, type ChoixDeDesign } from "./validation-design/choix-de-design.ts";
import { consigneDesOutils, outilsDuCook } from "./outils-du-cook.ts";
import { consigneDesTestsDeLaZone, selectionnerTests } from "./tests-de-la-zone/tests-de-la-zone.ts";
import { carteEnAttenteDuChef, DESIGN, designsValidesParUnHumain, fermerLaCarteDepassee, fermerLesCartesCaduques, livraisonSansObjet, reponsesGardees, retenirLeDesign } from "./validation-design/validation-design.ts";
import { approuvee, ciDeLaTete, fusionner, relire, type GitHubDeLaFusion, type Jugement, type PRAFusionner } from "./github-etat/fusion.ts";
import { CONTEXTE_DES_GATES, echecDesGates, jouerLesGatesDeLaTete, type GitHubDesGates, type LieuDesGates, type VerdictDesGates } from "./github-etat/gates-de-la-tete.ts";
import { servirLaPRExterne, type GatesExternes, type PRExterne } from "./pr-externe/pr-externe.ts";
import { enLivraisonDuTour, laisserAuxCooksHumains } from "./cook-humain/livraison.ts";
import { humainsDuProjet, type Humain } from "./aiguillage-humains/aiguillage.ts";
import { declencheSurPr } from "./declencheurs.ts";
import type { Check, Gates } from "./events/pass.ts";
import { CHEMIN_DE_LA_FICHE } from "./fiche-projet/defauts.ts";
import { avisDuChefALaBase, faitsDuDossier, type FaitsDeLaCuisine } from "./fiche-projet/fiche.ts";
import { aDesGates, gatesManquantes, jouerGates, jouerSetup, SCRIPT_GATES, SCRIPT_SETUP } from "./gates.ts";
import { gatesQuiNeJugentPas, LABEL_FONDATION } from "./fondation/fondation.ts";
import { VARIABLES_GITHUB } from "./identites.ts";
import { lireSecrets } from "./secrets.ts";
import { estMisDeCote, LABEL, MIS_DE_COTE, type GitHub, type Issue, type IssueOuverte, type Merge, type PR } from "./github.ts";
import { avecListe, porteDesTachesDeTickets, rendreListe } from "./epique.ts";
import { PLAFOND_PAR_DEFAUT, type Plafond } from "./reagir.ts";
import { ceQuiAEteTente, commentaireDeReprise, consigneDeReprise, corpsDuSousTicket, corpsReecrit, lireReprise, MARQUE_DE_LA_REPRISE, parentDeLaReprise, type ReprendreLeTicket } from "./reprise-du-manager.ts";
import { deciderDuPush, ROUGES_DE_SUITE, statutsDesRuns } from "./statuts-ci/regles.ts";
import { githubDeLaLivraison } from "./livraison-rouge/github-de-la-livraison.ts";
import { nommeLaLivraison, type GitHubDeLaLivraison } from "./livraison-rouge/nomme-livraison.ts";
import { ouvrirGuerison } from "./guerison/index.ts";
import type { ManagerDuSuperviseur } from "./superviseur/brancher.ts";
import { relancerLesRouges } from "./superviseur/gestes.ts";
import { OUTCOME } from "./autonomie/agents/gestes.ts";
import { genreDuTicket, ouvrirLePass } from "./risque/risque.ts";
import type { PorteDesGestes } from "./autonomie/agents/porte.ts";
import { geste as gesteDeBox } from "./geste.ts";
import { ligneDuMotif } from "./renvoi-sur-le-fond/motif.ts";
import { verdictDeLaRelecture } from "./renvoi-sur-le-fond/regle.ts";
import { briefDuRenvoi, lireLeRenvoi, type Renvoi } from "./brief-renvoi.ts";
import { consigneDeLIntegration, integrerAvantLeCook, suiteDuBlocageTechnique } from "./renvoi-conflit.ts";
import { apresLaMiseAJour, demandeLaBase, mettreAJourLaBranche, type MiseAJourDeLaBranche } from "./mise-a-jour-branche/mise-a-jour-branche.ts";
import { degelerLesConflits, partirSurLaBase, renvoisPourLaBase, suiteDuConflitBloque } from "./conflit-main/conflit-main.ts";
import { DIT_L_ARRET_DU_BAC, natureDeLArret } from "./bac-a-sable/nature-arret.ts";
import { corpsDuRenvoiPourConflit, demandeUnGesteGit } from "./conflit-main/renvoi.ts";
import { arretSubi, DIT_DES_RETENUES, type GardesDuTour } from "./github-seul/garde-fous/garde-fous.ts";
import { environnementClaude } from "./jeton-claude.ts";
import { argumentsReviewer, consigneDeRelecture, lireRelecture, type Lue } from "./reviewer.ts";
import { lireLaCarte } from "./sortie-attente-capacite/sortie.ts";
import { CALIBRAGE_DU_SECOND_JUGE, ConsigneIllisible, consigneDuSecondJuge, corpsDuSecondJugement, lireLaConsigne, lireSecondJugement, secondJugementDe } from "./second-juge.ts";
import { motifArretCook } from "./motif-arret-cook.ts";
import { direLaMiseDeCote, RUN_OK, runFiniOk, runsEchoues } from "./echecs-sans-livraison.ts";
import { arreterPourDeBon, ESSAIS_AU_TOTAL, essaisDuTicket, motifDeLEssai } from "./claim-hold/essais.ts";
import { avecLeDesaccord, classerArret, consigneDuDesaccord, corpsDeLaReponse, renvoisDeLaTete, reponseDuCook, reponseDuMessage } from "./desaccord-cook.ts";
import { arreterParLeRelais, relaisASuivre, superviser, superviserParRelais, suivreLeRelais, type Fin, type Supervise } from "./superviseur.ts";
import { commitsDuRunPrecedent, consigneDuRunPrecedent, estUneRepriseDeGarde, estUneSauvegarde, gardeLeTravail, marquerLeTravail, SUJET_DE_SAUVEGARDE } from "./cuisson/reprise/reprise.ts";
import { horsCuisine } from "./seuil-served-elsewhere.ts";
import { type GitHubDeLaBrigade } from "./issue-de-la-cuisine.ts";
import { lesTempsDesTickets } from "./temps-ticket/ligne-status.ts";
import { mesurerQualite, projetDuClone, type QualiteDuTicket } from "./mesure-qualite.ts";
import { ESSAIS_MAX, estUnParc, keepParkedAside, parquer, ticketRefusals } from "./essais/essais.ts";
import { checkRougeDit, MARQUE_D_ATTENTE, MARQUE_D_ECHEC, MARQUE_DE_CONFLIT, MARQUE_DE_RENVOI, qualiteDeLIssue, qualiteLue, qualitesDesTemps, RAISONS_DE_RENVOI } from "./qualite-github.ts";
import { ticketsRecents } from "./temps-max/mesure.ts";
import type { EnregistrementTemps } from "./temps-ticket/synthese.ts";
import { checksRepares, estUneReparation, PRIO_REPARATION } from "./reparation.ts";
import { servirLeTemps } from "./temps-cuisson/ratio.ts";
import { retenirLaFiche } from "./delais/lecture.ts";
import { brancherLesDelais } from "./delais/commenter.ts";
import { partagerLaCi } from "./temps-ticket/ci-github.ts";
import { chronometre, completerLesTemps, type DepotDuTicket, rattraperLaPrise } from "./temps-ticket/mesure.ts";
import { retenirLeSensible, SENSIBLE } from "./sensible/sensible.ts";
import { agirSurLaReponse } from "./reponse-validation/reponse-validation.ts";
import { signalerHorsZone } from "./passe-hors-zone/hors-zone.ts";
import { lireLaCharge } from "./rouge-de-charge/classeur.ts";
import { enregistrerGatesRouges, rejouerQuandCalme } from "./rouge-de-charge/crochet.ts";

// Un ticket tel que le tour le lit : une issue ouverte qui porte `fire`.
// `epique` : son corps porte la liste des tickets d'une épique — elle se sert
// par eux, jamais ne se prend (#2618). `besoin` : celui dont il est né (#3479).
// `alerte` : une alerte que la station a ouverte sur la cuisine — pas un ticket (#3620).
export type TicketLu = Pick<Issue, "number" | "title" | "labels" | "state" | "epique" | "besoin" | "alerte">;

// La prise d'un ticket (`github-etat/prise.ts`, #2056), liée à la station qui
// l'appelle et au client GitHub qui la porte. `prendre` poste sa prise si
// personne ne tient le ticket, et y pose `taken` si elle l'emporte ; `lacher`
// la retire ; `purger` retire le `taken` que personne ne tient plus (facultatif :
// une prise sans `purger` ne purge pas).
export type Prise = {
  prendre(issue: Pick<Issue, "number" | "labels">): Promise<{ prise: boolean }>;
  lacher(issue: Pick<Issue, "number" | "labels">): Promise<boolean>;
  purger?(issue: Pick<Issue, "number" | "labels">): Promise<boolean>;
};

// La prise de #2056, liée à la station et au client du tour.
export const priseDeLaStation = (github: GitHubDuTour, station: string, maintenant?: () => Date): Prise => ({
  prendre: (issue) => prendre(issue, { github, station, ...(maintenant === undefined ? {} : { maintenant }) }),
  lacher: (issue) => lacher(issue, { github, station }),
  purger: (issue) => purger(issue, { github }),
});

// Ce que le tour lit et écrit de GitHub : ce que demandent la relecture et le
// merge, plus les tickets, la PR d'un ticket, les checks de la base, les
// labels et l'ouverture d'une PR.
export type GitHubDuTour = GitHubDeLaFusion &
  Pick<GitHub, "labelliser" | "delabelliser" | "ouvrirPR"> &
  // De quoi balayer les cartes de validation sans objet (#3390). Absents, la station ne les balaie pas.
  Partial<Pick<GitHub, "ouvertes" | "prDeBranche">> &
  // Les statuts de commit où se lisent et s'écrivent les gates d'une tête
  // (#2456). Absents, la station ne les joue pas.
  Partial<GitHubDesGates> &
  // Créer, fermer une issue, relancer les jobs en échec d'un run : la guérison, le découpage, les gestes de la station.
  Pick<GitHub, "creerIssue" | "fermerIssue" | "relancerLesEchecs"> & {
    // Les issues modifiées depuis `instant`, ouvertes ou fermées, avec leur corps.
    issuesDepuis(instant: string): Promise<(Pick<IssueOuverte, "number" | "body" | "association"> & Partial<Pick<IssueOuverte, "title" | "state" | "labels" | "updatedAt">>)[]>;
    // Le journal du job d'un check de GitHub Actions, ou null : le brief d'un renvoi le cite (#3806).
    journalDuCheck?(check: Check): Promise<string | null>;
    // Les retraits de labels de l'issue, que la prise lit pour le lâcher du chef.
    retraitsDeLabels(numero: number): Promise<{ label: string; createdAt: string }[]>;
    // Quand l'issue a été déposée et mise sur le rail : d'où part le temps du
    // ticket servi (#2662). Absent ou null, il part de la prise.
    depotDuTicket?(numero: number): Promise<DepotDuTicket | null>;
    // L'instant où `in-pass` a été posé sur l'issue pour la dernière fois, ou null s'il ne se lit pas : l'ordre des livraisons qui
    // changent un même fichier (#4044). Absent, aucune n'en retient une autre par ses fichiers.
    entreeEnPass?(numero: number): Promise<string | null>;
    // Les issues ouvertes qui portent `fire`, dans l'ordre où les servir.
    fires(): Promise<TicketLu[]>;
    // Les issues dont le ticket dépend (`Depends on #N` dans son corps) et qui sont encore ouvertes — celles d'un
    // ticket découpé, ses tickets ouverts (`attendusDuCorps`) : tant qu'il y en
    // a, le ticket n'est pas à prendre.
    dependancesOuvertes(issue: number): Promise<number[]>;
    // La PR qui livre le ticket, ou null. `version` change avec tout ce que
    // GitHub change à la PR.
    prDuTicket(issue: number): Promise<(PRAFusionner & Pick<PR, "version">) | null>;
    // Sa PR ouverte, ou null : une PR mergée ou fermée n'y est pas lue (#3834).
    prOuverteDuTicket?(issue: number): Promise<(PRAFusionner & Pick<PR, "version">) | null>;
    // Les checks du dernier commit de la branche d'intégration.
    checksDeLaBase(): Promise<CheckDeLaBase[]>;
    // De quoi nommer sur son ticket la livraison qui a rendu la base rouge
    // (#3817). Absent ou null, rien n'est nommé.
    livraison?: GitHubDeLaLivraison | null;
    // Le corps de l'issue, où le ticket dit sa zone.
    corpsDuTicket(issue: number): Promise<string>;
    // Remplace le corps de l'issue : la preuve d'un ticket de mesure (#2841) et
    // la décision du manager sur un blocage répété (#2894) s'y ajoutent. Absent,
    // ni l'une ni l'autre ne s'écrit : le blocage va au manager comme un autre,
    // et une décision non écrite compte pour un cook sans livraison.
    ecrireCorps?: GitHub["ecrireCorps"];
    // Les PR ouvertes : la branche dont chacune est la tête, et les fichiers
    // qu'elle change ; son numéro et sa tête, quand le client les dit — sans
    // eux, sa CI rouge ne se lit pas (#2970).
    // Sa dernière activité, ses labels et si ses changements sont déjà sur la base : la porte de prise ne compte que les PR vivantes (#4242).
    prsOuvertes(): Promise<({ branche: string; fichiers: string[]; number?: number; sha?: string } & Omit<PRDeLaPorte, "number" | "branche">)[]>;
    // L'issue, son état et son corps : ce qu'il faut pour fermer une épique
    // finie (#2757). Absente, la guérison ne ferme aucune épique.
    issue?: GitHub["issue"];
    // Ferme une PR sans toucher à sa branche (#3097). Absente, la station n'en ferme aucune.
    fermerPR?: GitHub["fermerPR"];
    // Les fichiers changés entre deux têtes : si la mise à jour d'une PR dont
    // le chef a validé l'écran l'a changé (#3426). Absente, la pass ne merge
    // pas une telle PR sur une autre tête que celle validée, et le dit.
    fichiersEntre?: GitHub["fichiersEntre"];
    // Les PR externes ouvertes — depuis un fork (#2933) —, et ce que leur
    // service écrit de plus : la fin de son travail sur une tête, l'humain
    // `review` assigné à sa carte. Absentes, la station ne les sert pas.
    prsExternes?(): Promise<PRExterne[]>;
    remplacerCommentaire?: GitHub["remplacerCommentaire"];
    // Les étapes en échec du job d'un check rouge, que son renvoi nomme (#3028).
    // Absentes, le renvoi ne nomme que le check.
    etapesEnEchec?: GitHub["etapesEnEchec"];
    // Les runs de CI de la branche d'un ticket, lus à son merge : l'attente
    // des runners et les relances de chaque passage en pass (#3512). Absents,
    // le temps du ticket s'écrit sans eux.
    ciDeLaBranche?: GitHub["ciDeLaBranche"];
    assigner?: GitHub["assigner"];
    // Lire les captures d'une livraison design et publier leur comparaison
    // (#3617). Absents, la carte « Validate its screen » se pose sans elle.
    fichierBinaire?: GitHub["fichierBinaire"];
    publierFichiers?: GitHub["publierFichiers"];
  };

// La fermeture du ticket d'une branche `cook/<n>-…` : son numéro et sa date,
// ou null si la branche n'a pas de numéro, si le ticket est ouvert, si le
// client ne lit pas les issues ou si la lecture manque (#3096) : on ne sait
// pas, le ticket compte pour ouvert.
type Fermeture = { numero: number; date: string | null };
async function fermetureDuTicket(lire: GitHub["issue"] | undefined, branche: string): Promise<Fermeture | null> {
  const numero = /^cook\/(\d+)-/.exec(branche)?.[1];
  if (numero === undefined || lire === undefined) return null;
  const rang = Number(numero);
  const issue = await lire(rang).catch(() => null);
  if (issue?.state !== "closed") return null;
  const date = issue.closedAt === undefined ? NaN : Date.parse(issue.closedAt);
  return { numero: rang, date: Number.isNaN(date) ? null : new Date(date).toISOString().slice(0, 10) };
}

const normalise = (texte: string) => texte.replace(/^\.\//, "").replace(/\/+$/, "");

// La zone d'un ticket : les chemins de sa section `Zone` (un titre markdown),
// séparés par des virgules ou des lignes, avec ou sans puce et accents graves.
// Sans section, ou vide, le ticket n'a pas de zone.
export function zoneDuCorps(corps: string): string[] {
  const lignes = corps.split(/\r?\n/);
  const debut = lignes.findIndex((ligne) => /^#{1,6}\s*zone\s*:?\s*$/i.test(ligne.trim()));
  if (debut === -1) return [];
  const fin = lignes.findIndex((ligne, rang) => rang > debut && /^#{1,6}\s/.test(ligne.trim()));
  return lignes
    .slice(debut + 1, fin === -1 ? undefined : fin)
    .flatMap((ligne) => ligne.replace(/^\s*[-*+]\s+/, "").split(","))
    .map((morceau) => normalise(morceau.trim().replace(/^`+|`+$/g, "").trim()))
    .filter((morceau) => morceau !== "" && !/\s/.test(morceau));
}

// Les fichiers que dit un ticket : sa zone, sinon les chemins de son corps (un
// mot à barre oblique ou à extension, hors lien). Sans chemin, aucun.
export function fichiersDuCorps(corps: string): string[] {
  const zone = zoneDuCorps(corps);
  if (zone.length > 0) return zone;
  const sans = corps.replace(/https?:\/\/\S+/g, " ");
  return [...sans.matchAll(/(?<![\w./-])((?:\.?[\w-]+\/)+[\w.-]*[\w-]|[\w-]+\.[a-z]{1,5})(?![\w/-])/gi)].map((m) => normalise(m[1]!));
}

// Les chemins d'un corps qui nomment le dépôt : un fichier ou un dossier
// suivi de la base, ou un fichier neuf dans un dossier suivi. Le corps d'un
// ticket est du texte : `e.g`, `i.e`, `and/or`, `Node.js` y ont la forme d'un
// chemin. Gardés pour sa zone, deux tickets qui disaient « e.g. » se tenaient
// l'un l'autre à la porte de prise, et le second attendait toute la cuisson
// du premier : de l'attente d'une prise, pour rien (#2826).
export function cheminsDuDepot(chemins: readonly string[], suivis: readonly string[]): string[] {
  const fichiers = new Set(suivis.map(normalise));
  const dossiers = new Set<string>();
  for (const fichier of fichiers) for (let fin = fichier.lastIndexOf("/"); fin > 0; fin = fichier.lastIndexOf("/", fin - 1)) dossiers.add(fichier.slice(0, fin));
  return chemins.filter((chemin) => {
    const parent = chemin.includes("/") ? chemin.slice(0, chemin.lastIndexOf("/")) : null;
    return fichiers.has(chemin) || dossiers.has(chemin) || (parent !== null && dossiers.has(parent));
  });
}

// La zone qu'un ticket déclare : la section `Zone` de son corps, et la ligne
// `zone` de sa fiche quand elle se lit — une fiche illisible ne possède rien.
const zoneDeclaree = (corps: string, laFiche: Fiche | null): string[] => [...new Set([...zoneDuCorps(corps), ...(laFiche === null || laFiche.problems.length > 0 ? [] : laFiche.zone.map(normalise))])];

const SOUS_BRIGADE = ".claude/brigade/";
// Tous ses fichiers sont sous `.claude/brigade/` : un ticket de setup du dépôt
// (gates, worktree, réseau). Son cook y a l'écriture ouverte (`Cook.brigade`) ;
// celui de tout autre ticket ne l'a pas. Ses fichiers : la zone qu'il déclare,
// corps ou fiche (#2888) — un ticket né d'une épique ne dit la sienne que dans
// sa fiche, et son corps nomme bien d'autres choses (`gates.sh`, un dépôt) —,
// sinon les chemins de son corps.
export const livreSousBrigade = (corps: string, commentaires: string[] = []): boolean => {
  const declaree = zoneDeclaree(corps, fiche(commentaires));
  const fichiers = declaree.length > 0 ? declaree : fichiersDuCorps(corps);
  return fichiers.length > 0 && fichiers.every((f) => `${f}/`.startsWith(SOUS_BRIGADE));
};

// Deux chemins se recoupent s'ils sont égaux, ou si l'un contient l'autre.
export const secoupent = (a: string, b: string): boolean => {
  const [x, y] = [normalise(a), normalise(b)];
  return x === y || y.startsWith(`${x}/`) || x.startsWith(`${y}/`);
};

// Le cook d'un ticket pris : la branche qu'il a poussée, ou pourquoi il n'a
// rien livré — et ce que ses tests et ses gates ont pris, en millisecondes,
// quand un cuisinier sait le dire (`temps-ticket/`) : celui de la station ne
// le sait pas, aucun lanceur ne mesure les gates de ses cooks.
// `reste` : le cook n'a rien ajouté, mais la PR qu'il aurait livrée est en
// conflit ou rouge (#2454) : ce n'est pas un échec, il reste du travail.
// `bloque` : le cook s'est déclaré bloqué (`<bloque>` dans son dernier message), avec
// la décision ou la condition qui lui manque : rien ne part en relecture (#2805).
// `miseAJour` : il lui manquait des commits de la base, et la station a tenté
// de la fusionner dans sa branche (#3001).
// `suivre` : le cook du ticket a survécu à une vie précédente de la station, qui le reprend (#4401).
export type Cuisiner = (ticket: TicketLu, calibrage: Calibrage, suivre?: boolean) => Promise<({ branche: string; aLEcran?: string[]; changements?: string[] } | { echec: string; fini?: true; detail?: string } | { arrete: string } | { baseAbsente: string } | { baseInjoignable: string } | { reste: string; rouges?: string[] } | { bloque: string; miseAJour?: MiseAJourDeLaBranche; conflit?: string[] } | { constat: string } | { dejaServi: DejaServi; affirmation: string } | { subi: string; retour?: Date | null; court?: boolean }) & { testsMs?: number }>;
// La relecture de la PR d'un ticket, par la station qui passe.
export type Juger = (ticket: TicketLu, pr: PRAFusionner) => Promise<Jugement>;
// Le second juge d'une livraison qui touche à ce qui la juge (#2555), une fois
// la relecture d'accord : un autre lancement, qui reçoit les fichiers de ses
// juges qu'elle change.
export type JugerEnSecond = (ticket: TicketLu, pr: PRAFusionner, juges: string[]) => Promise<Jugement>;

// La branche du cook d'un ticket : la même sur toutes les stations, pour que
// chacune retrouve sa PR.
export const runDuTicket = (issue: number) => `${issue}-github`;
export const brancheDuTicket = (issue: number) => `cook/${runDuTicket(issue)}`;

export type OptionsDeStation = {
  // Le nom de la station : celui de ses prises et de ses verdicts.
  nom: string;
  // La porte des gestes du runtime (#4039) : la prise d'un ticket par un cook et le merge de la pass y passent, selon
  // leur niveau d'autonomie. Absente, ils se font sans porte ni journal des gestes.
  porte?: PorteDesGestes | null;
  // Combien de cooks elle tient à la fois — un nombre, ou relu à chaque tour :
  // le plafond que le chef règle à chaud (`github-seul/places/`, #3446).
  places: number | (() => number);
  // La branche d'intégration, que visent ses PR.
  base: string;
  github: GitHubDuTour;
  prise: Prise;
  cuisiner: Cuisiner;
  juger: Juger;
  // Le second juge (#2555). Absent, une livraison qui touche à ce qui la juge
  // n'est jamais mergée.
  jugerEnSecond?: JugerEnSecond;
  // Ce que la station fournit (#2187) : un ticket qui demande une capacité
  // qu'elle n'a pas, par un label `needs:<capacité>`, n'est jamais pris ici.
  capacites?: readonly string[];
  // Appelé quand la porte de prise ne prend pas un ticket prenable, avec la
  // ligne qui dit pourquoi (zone tenue, capacité, calibrage, dépendance mise de
  // côté) : le tour du superviseur la lit (#2429, #3945).
  sauter?: (ticket: number, ligne: string, attendus?: readonly number[], raison?: RaisonDuSaut) => void;
  // Appelé quand la porte de prise ne compte plus une PR ouverte, périmée ou marquée `zone-released`, qui recoupe la zone
  // d'un ticket : le superviseur lui pose ce label (`superviseur/zone-liberee.ts`, #4243).
  perimee?: (ticket: number, pr: PRDeLaPorte & { number: number }) => void;
  // Les tickets que la porte prend avant les autres quand une place s'ouvre — celui que le réveil sans merge nomme (#4102) :
  // devant les `prio:N` et l'ordre des numéros, sans quoi il attend derrière des tickets mis de côté qui reviennent sans cesse.
  enPremier?: () => readonly number[];
  // Les garde-fous (#2213) : le « stop », le disjoncteur,
  // le quota et l'arbitre, lus avant chaque prise. Absents, rien ne retient.
  gardes?: Pick<GardesDuTour, "retenue" | "redire" | "quitter"> & Partial<Pick<GardesDuTour, "attendreUnePlace">>;
  // Où va ce qui rate sans arrêter le tour.
  avertir?: (message: string) => void;
  // Le clone du projet : le temps de chaque ticket que la station merge
  // s'ajoute à son `.claude/brigade/temps-tickets.json` (#2342). Absent, rien
  // ne s'écrit.
  clone?: string;
  // Le dépôt du projet servi et le GitHub de la brigade : le ticket du temps
  // perdu se dépose sur la brigade (#2783). Absents, il reste sur le projet.
  depotServi?: string;
  githubDeLaBrigade?: GitHubDeLaBrigade;
  // Le répertoire d'état du projet, où se compte un ticket parqué pour le chef sans
  // question (#2556). Absent, le cas est refusé mais pas compté.
  repertoireEtat?: string;
  // L'horloge des phases de ces temps. Par défaut, la vraie.
  maintenant?: () => Date;
  // Un workflow du projet se lance-t-il sur une PR qui change ces fichiers
  // (#2456) ? Absent, oui : la CI de la PR est attendue, comme avant.
  ciDesPR?: (fichiers: string[]) => boolean;
  // Le lieu des gates de la tête d'une PR, sur cette station (#2456) : un
  // projet sans CI sur ses PR est jugé par elles. Absent, la station ne les
  // joue pas, et une autre le fera.
  gates?: (ticket: TicketLu, pr: PRAFusionner) => Promise<LieuDesGates>;
  // Les fichiers suivis de la base (#2826) : la zone d'un ticket sans zone
  // déclarée ne garde que les chemins de son corps qui nomment le dépôt
  // (`cheminsDuDepot`). Absents ou illisibles, elle les garde tous.
  fichiersSuivis?: () => string[];
  // Le cook de ce ticket a survécu à l'arrêt d'une vie précédente de la
  // station (#4401) : au premier tour, elle le reprend, le suit jusqu'à sa fin
  // et finit le ticket, au lieu de le rendre. Absent, elle le rend.
  survivant?: (issue: number) => boolean;
  // Le manager, à qui va la question d'un cook bloqué avant de parquer le ticket
  // pour le chef (#2894). Absent, le blocage attend, puis compte pour un
  // cook sans livraison : il ne va jamais au chef sans lui.
  consulter?: ConsulterLeManager;
  // Le manager, à qui va un ticket après son dernier essai raté (#3513) : il
  // le réécrit, le découpe, le recalibre, ou pose au chef une question de
  // produit ou de design. Absent, le ticket est parqué, et
  // le commentaire le dit.
  reprendre?: ReprendreLeTicket;
  // Le manager, à qui va un ticket du rail tenu plus d'une heure par une
  // attente (#3764) : il la lève, la garde, ou pose au chef une question de
  // produit. Absent, l'issue dit seulement ce que le ticket attend et qui l'a décidé.
  revoirLAttente?: RevoirLAttente;
  // Le service des PR externes (#2933) : leur relecture et leurs gates, sans
  // les secrets du projet, et ses humains, à qui va leur carte. Absent, la
  // station ne les sert pas.
  externes?: ServiceDesPRExternes;
  // Les stations que le projet déclare, celle-ci comprise (#3057) : un ticket
  // dont les gates ne se jouent pas ici va à une autre. Absentes, aucune
  // autre : il reste retenu sur cette station.
  stationsDuProjet?: () => readonly string[];
  // Un humain valide les designs du projet (#3184, `humanValidatesDesigns`),
  // relu à chaque merge : une livraison design verte attend sa carte au lieu
  // d'être mergée (`validation-design/`). Absent, non.
  designsValidesParUnHumain?: () => boolean;
  // La fiche du projet telle que la branche d'intégration la porte, relue à chaque merge : son classement du risque
  // (`risk`, #4230) parque pour le chef le merge d'un ticket dont le genre d'action est rangé `chef`.
  ficheDuProjet?: () => unknown;
  // Le compte GitHub du chef, résolu à chaque demande de validation (#3615) :
  // la demande posée sur le ticket le mentionne. Absent, nul ou illisible, elle
  // ne mentionne personne, et la station le dit.
  chef?: () => Promise<string | null>;
  // Le jugement du modèle sur une livraison design : fait-elle un choix de
  // design que les critères du ticket n'ont pas tranché (#3609) ? Absent, la
  // pass ne merge pas une livraison design et le dit.
  jugerLeChoixDeDesign?: (ticket: { number: number; title: string; body: string }, fichiers: readonly string[], pr: { number: number; sha: string }) => Promise<ChoixDeDesign>;
  // Les contrôles des invariants du rail, joués chacun une fois à chaque tour
  // (#4026). Absents, les quatre du rail (`invariants/`).
  invariants?: readonly Invariant[];
  // La relance des checks rouges de la base (invariant 4). Absente, le geste
  // `rerun` du superviseur, sur les jobs de GitHub Actions.
  relancerLaBase?: RelancerLaBase;
};

// Ce que la station donne au service d'une PR externe (`pr-externe/`).
export type ServiceDesPRExternes = {
  juger(pr: PRExterne): Promise<Jugement>;
  gates(pr: PRExterne): Promise<GatesExternes>;
  humains(): Humain[];
};

// Le préfixe du label par lequel un ticket demande une capacité.
export const PREFIXE_BESOIN = "needs:";

// Les capacités qu'un ticket demande, lues de ses seuls labels.
export const besoinsDuTicket = (labels: readonly string[]): string[] => labels.filter((label) => label.startsWith(PREFIXE_BESOIN)).map((label) => label.slice(PREFIXE_BESOIN.length));

export type StationGitHub = {
  // La porte des gestes du runtime (#4039), relue à chaque prise et à chaque merge : la station la reçoit après sa
  // construction (`stationDuDepot`).
  porte?: PorteDesGestes | null;
  // La fiche du projet, relue à chaque merge (#4230) : son classement du risque parque pour le chef le merge d'un
  // ticket dont le genre d'action est rangé `chef`. La station la reçoit, comme sa porte, après sa construction.
  ficheDuProjet?: (() => unknown) | null;
  // La charge de la machine, relue pour reprendre un ticket rendu pour elle (#4211) : la station la reçoit après sa
  // construction (`stationDuDepot`). Absente, celle du système.
  lireCharge?: () => number;
  // Un tour : relit et merge ce qui est en pass, puis prend ce que ses places
  // libres permettent et lance leurs cooks, sans les attendre.
  tour(): Promise<void>;
  // Les tickets que ses cooks cuisinent.
  enCuisine(): number[];
  // Les tickets qui attendent une prise, lus au dernier tour : ouverts, lancés,
  // ni pris, ni en pass, ni retenus pour le chef — ce qui garde le Mac éveillé (#3713).
  enAttente?(): number[];
  // Attend que ses cooks en vol aient fini.
  calme(): Promise<void>;
  // Attend les relectures et les merges en cours, hors du tour (#2329).
  relu(): Promise<void>;
  // Le tour ne reprendra pas : ce qu'il tient chez l'arbitre est rendu.
  quitter?(): Promise<void>;
  // La station s'arrête : ses cooks lui survivent, et leurs tickets restent
  // pris pour la station qui la relance (#4401).
  arreter?(): void;
  // Ce que la station n'a pas pu pour un ticket, en une ligne, que sa carte de l'onglet Stations dit (#3870) ; nul : elle le peut de nouveau.
  lacune?: (ligne: string | null) => void;
  // Posé par la boucle : le pass a bougé (#2333). Les `TOURS_PRESSES` tours
  // suivants viennent à `ATTENTE_PRESSEE_MS` au plus l'un de l'autre, le premier
  // tout de suite si `maintenant` (une livraison à relire).
  presser?: (maintenant?: boolean) => void;
};

// Les issues dont un corps dit dépendre (`Depends on #N`) : la lecture est celle du rail (`attente-du-rail/`).
export { dependancesDuCorps };

// Après une livraison, un verdict ou une fusion tentée (mergée, branche mise à
// jour, CI qui tourne encore), la station tourne de nouveau dans les 30 s,
// quelques fois, puis reprend son intervalle (#2333). Un tour coûte 2 points
// GraphQL : seul un fait neuf presse, jamais un tour où rien n'a bougé.
export const TOURS_PRESSES = 4;
export const ATTENTE_PRESSEE_MS = 30_000;
// Le plus court délai d'un tour qui reprend à la fin d'une pause de GitHub
// (#3448) : une pause qu'un `retry-after: 0` dit déjà finie ne fait pas
// tourner la boucle sans arrêt.
export const REPRISE_MIN_MS = 5_000;

const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));

// Ce qui juge une livraison : une PR qui y touche ne se merge qu'approuvée
// aussi par le second juge (#2555) — sa consigne comprise, et la fiche du
// projet, qui nomme les gates (#4237).
const JUGES = [".claude/brigade/", ".github/workflows/", "agents/second-juge.md", CHEMIN_DE_LA_FICHE];

// Le rang d'un ticket dans l'ordre de service : le plus petit `prio:N` qu'il porte.
const rangDePriorite = (ticket: Pick<TicketLu, "labels">): number =>
  Math.min(Number.POSITIVE_INFINITY, ...ticket.labels.map((label) => /^prio:(\d+)$/.exec(label)?.[1]).filter((n) => n !== undefined).map(Number));

// Combien de cooks sans livraison, pour un même ticket, avant qu'il sorte de la cuisine.
export const ECHECS_MAX = 3;

// Au plus ce nombre de tickets récents reçoivent leur qualité à chaque merge (#2707).
export const RATTRAPAGE_PAR_MERGE = 10;

// Des gates qui n'ont pas pu se jouer sur une tête se retentent au plus tôt
// après ce délai (#2456).
// Le délai entre deux balayages des PR ouvertes dont le ticket est fermé (#3097).
export const BALAYAGE_DES_PR_MS = 10 * 60_000;
// Le délai entre deux balayages des cartes de validation sans objet (#3390).
export const BALAYAGE_DES_CARTES_MS = 60_000;
export const RELANCE_DES_GATES_MS = 30 * 60_000;

// Combien de fois une livraison repart au cook avant de sortir de la cuisine.
export const RENVOIS_MAX = 2;

// Au plus cinq livraisons en pass : tant que le projet en compte autant, aucune
// station sur l'état GitHub seul ne prend de ticket neuf (#2300). Le pass se
// vide moins vite que les cooks livrent ; l'amas s'y relit à chaque tour et s'y
// met en conflit à chaque merge.
export const PASS_MAX = 5;

// Ce que la porte de prise dit des tickets qu'elle laisse quand ses places, ou
// le pass, sont pleins (#3677) : la borne, et les tickets qui la tiennent.
const numeros = (tickets: readonly number[]) => [...tickets].sort((a, b) => a - b).map((n) => `#${n}`).join(", ");
const direPlacesPrises = (places: number, tenues: readonly number[]): string => `${places === 1 ? "the station's one place is" : `the station's ${places} places are all`} taken${tenues.length === 0 ? "" : ` (${numeros(tenues)})`}`;
const direPassPlein = (livraisons: readonly number[]): string => `the pass holds ${livraisons.length} deliveries, its most is ${PASS_MAX} (${numeros(livraisons)})`;

// Les tickets en pass : ceux qui portent `in-pass`, hors ceux que ce tour vient
// de renvoyer à un cook — la liste lue peut porter encore leur label.
export const enPass = (tickets: readonly Pick<TicketLu, "number" | "labels">[], renvoyes: ReadonlySet<number> = new Set()): number =>
  tickets.filter((ticket) => ticket.labels.includes(LABEL_IN_PASS) && !renvoyes.has(ticket.number)).length;
// Les commentaires de `marque` qui comptent pour le ticket : ceux d'après le
// dernier retrait de `served-elsewhere` ou de `parked` (#4129), que GitHub date pour toutes les stations
// (#2430). Relancer un ticket remet à zéro ses cooks sans livraison — pas ses
// renvois, comptés par ticket (#3961). Des retraits illisibles ne remettent rien à zéro. La reprise du
// manager après le dernier essai (#3513) les remet à zéro aussi : seuls
// comptent les commentaires d'après le sien.
const relanceDe = async (github: Pick<GitHubDuTour, "retraitsDeLabels">, numero: number): Promise<number> => {
  const retraits = await github.retraitsDeLabels(numero).catch(() => []);
  return Math.max(0, ...retraits.filter((r) => r.label === LABEL_PARKED || (MIS_DE_COTE as readonly string[]).includes(r.label)).map((r) => Date.parse(r.createdAt)).filter((t) => !Number.isNaN(t)));
};
const depuisLeRelancement = async (github: Pick<GitHubDuTour, "retraitsDeLabels">, numero: number, commentaires: { body: string; createdAt: string }[], marque: string) => {
  // Sans commentaire de cette marque, la date du relancement n'ôte rien : elle ne se lit pas (#3834).
  if (!commentaires.some((c) => c.body.startsWith(marque))) return [];
  const relance = await relanceDe(github, numero);
  const reprise = commentaires.findLastIndex((c) => c.body.startsWith(MARQUE_DE_LA_REPRISE));
  return commentaires.slice(reprise + 1).filter((c) => c.body.startsWith(marque) && !(Date.parse(c.createdAt) <= relance));
};
// Le motif d'un essai, tel que son commentaire `brigade:echec` ou `brigade:renvoi` le dit.
const motifDe = motifDeLEssai;
// Le renvoi précédent a rendu le même résultat que `raison` : les mêmes mots, ou la même attente hors de la cuisine (#3814).
const normeDuRenvoi = (texte: string) => texte.trim().replace(/\s+/g, " ").toLowerCase();
function memeRenvoi(corps: string, raison: string, maintenant: Date): boolean {
  const dit = corps.split("\n").slice(1).join("\n");
  const debut = dit.indexOf(" — ");
  if (debut === -1) return false;
  const avant = dit.slice(debut + 3).split("\n\nSend-back reason:")[0] ?? "";
  if (normeDuRenvoi(avant) === normeDuRenvoi(raison)) return true;
  const [a, b] = [lireAttenteDuCook(avant, maintenant), lireAttenteDuCook(raison, maintenant)];
  return a !== null && b !== null && a.followUp === b.followUp;
}

// Le motif d'un verdict, sous son marqueur et sa ligne « Changes requested ».
const motifDuVerdict = (commentaires: { id: number; body: string }[], id: number) => commentaires.find((c) => c.id === id)?.body.split("\n").slice(2).join("\n").trim() || "see the PR";

// Au plus ce nombre de tours, un cook n'a pas encore travaillé sur les
// remarques d'un renvoi : s'il s'arrête là sans rien ajouter, l'essai ne compte pas (#2508).
// `fin.turns`, que le lanceur compte, est le nombre de tours de modèle du cook.
export const TOURS_POUR_TRAVAILLER = 3;

// Après un arrêt subi, le ticket n'est pas repris avant ce délai, ou avant
// l'heure où le quota revient si le flux la donne, au plus `ATTENTE_MAX_MS` (#2508).
export const ATTENTE_MS = 30 * 60_000;
export const ATTENTE_MAX_MS = 6 * 60 * 60_000;


// Les dernières lignes que `claude` a écrites : sa sortie d'erreur, sinon son
// dernier message.
const DERNIERES_LIGNES = 5;
const dernieresLignes = (flux: string): string => {
  const lignesDe = (texte: string) => texte.split("\n").map((l) => l.trim()).filter((l) => l !== "");
  const erreur = existsSync(`${flux}.stderr`) ? lignesDe(readFileSync(`${flux}.stderr`, "utf8")) : [];
  const lignes = erreur.length > 0 ? erreur : lignesDe(lireLeFlux(flux).message ?? "");
  return lignes.slice(-DERNIERES_LIGNES).join(" | ").slice(0, 800);
};

// Pourquoi un cook s'est arrêté sans livrer : sa conclusion, son code, ce que `claude` a dit en dernier.
function direLaFin({ conclusion, fin, flux }: { conclusion: string; fin: { code: number | null; signal: string | null; erreur: string | null }; flux: string }): string {
  const motif = fin.erreur ?? ({ "86": "Claude quota or usage limit reached", disconnected: "the Claude session is gone", refused: "the model refused to answer", failed: "claude ended in error" } as Record<string, string>)[conclusion] ?? conclusion;
  const fini = `exit code ${fin.code ?? "none"}${fin.signal === null ? "" : `, signal ${fin.signal}`}`;
  const lignes = dernieresLignes(flux);
  return `${motif} (${fini})${lignes === "" ? "; claude wrote nothing" : `; last lines of claude: ${lignes}`}`;
}

// Ce que la lecture des stations du projet sur GitHub regarde : les issues qui ont bougé depuis deux jours, et pas plus de quarante.
const FENETRE_DES_STATIONS_MS = 2 * 24 * 3600_000;
const ISSUES_LUES_AU_PLUS = 40;

// Le temps que la station laisse un projet dont la base ne se rapatrie pas, avant de le reprendre.
const REPIT_BASE_INJOIGNABLE_MS = 10 * 60_000;

export function stationGitHub(options: OptionsDeStation): StationGitHub {
  const { nom, places, base, github, prise, cuisiner, juger, gardes } = options;
  const avertir = options.avertir ?? ((texte: string) => console.error(texte));
  const controlerLesInvariants = controleurDesInvariants(options.invariants ?? invariantsDuRail(options.relancerLaBase ?? ((rouges) => relancerLesRouges(github, base, rouges))), avertir);
  // Nomme à chaque tour, sur son ticket, la livraison qui a rendu la base rouge (#3817).
  const nommerLaLivraison = github.livraison ? nommeLaLivraison({ github: github.livraison, base, avertir }) : undefined;
  // Le chef que la demande de validation posée sur le ticket mentionne (#3615) :
  // sans chef résolu, elle ne mentionne personne, et la station le dit une fois.
  const chefsNonMentionnes = new Set<string>();
  const chefAMentionner = async (): Promise<string | null> => {
    let chef: string | null = null;
    let pourquoi = "no chef resolved (`status` says why): set `chef` to the chef's GitHub login in `.claude/brigade/projet.json`";
    try {
      chef = (await options.chef?.())?.trim() || null;
    } catch (erreur) {
      pourquoi = `the chef does not resolve: ${erreur instanceof Error ? erreur.message : String(erreur)}`;
    }
    if (chef === null && options.chef !== undefined && !chefsNonMentionnes.has(pourquoi)) {
      chefsNonMentionnes.add(pourquoi);
      avertir(`brigade : chef not mentioned on a validation asked on its ticket — ${pourquoi}`);
    }
    return chef;
  };
  const capacites = new Set(options.capacites ?? []);
  const enVol = new Map<number, Promise<void>>();
  // Le parcours de chaque ticket, de sa prise à son merge, phase par phase
  // (#2342), mesuré depuis son dépôt ou `fire`, que GitHub dit au merge (#2662).
  // Illisible, le temps part de la prise, et la station le dit.
  const chrono = chronometre(options.maintenant);
  const commenterLesDelais = brancherLesDelais({ github, avertir, maintenant: options.maintenant });
  // Le rapport de sa cuisson à son label `time:` s'écrit à côté (#2675).
  const servir = async (issue: number, labels: readonly string[], titre: string) => {
    if (options.clone === undefined) {
      chrono.oublier(issue);
      return;
    }
    if (github.depotDuTicket === undefined) avertir(`brigade : #${issue} sur ${nom} — this client does not read the filing of a ticket, its time runs from its claim`);
    const depot =
      (await github.depotDuTicket?.(issue).catch((erreur) => {
        avertir(`brigade : #${issue} sur ${nom} — filing of the ticket unreadable, its time runs from its claim: ${message(erreur)}`);
        return null;
      })) ?? undefined;
    const mesure = chrono.servir(issue, depot);
    if (mesure === null) return;
    // La CI de chaque passage en pass, lue sur GitHub : l'attente des runners,
    // la course, les runs relancés (#3512). Illisible, le temps s'écrit sans
    // elle — la mesure dit « no measure yet » —, et la station le dit.
    const temps = await ciDesPasses(issue, mesure);
    // Sa qualité, lue sur l'issue, s'écrit avec son temps (#2707) : le journal
    // ne la sait plus. Illisible, elle reste inconnue, et la station le dit.
    const qualite = await Promise.all([github.corpsDuTicket(issue), github.commentaires(issue)])
      .then(([corps, commentaires]) => qualiteDeLIssue({ corps, labels, commentaires }))
      .catch((erreur) => {
        avertir(`brigade : #${issue} sur ${nom} — its comments are unreadable, its quality is not recorded: ${message(erreur)}`);
        return null;
      });
    try {
      servirLeTemps(options.clone, qualite === null ? temps : { ...temps, qualite }, labels);
    } catch (erreur) {
      avertir(`brigade : the time of #${issue} could not be recorded on ${nom} — ${message(erreur)}`);
    }
    // Son titre et ses labels, que lisent les délais de `status` (#4308).
    try {
      retenirLaFiche(options.clone, { ticket: issue, titre, etiquettes: [...labels] });
    } catch (erreur) {
      avertir(`brigade : the title and labels of #${issue} could not be recorded on ${nom}, its delay counts without an expected time — ${message(erreur)}`);
    }
    await rattraperLesQualites(options.clone);
    await rattraperLesPrises(options.clone);
    // Un ticket mergé plus de 10 min après sa prise : son temps partagé, en commentaire sur son issue (#4299).
    await commenterLesDelais(options.clone);
  };
  const ciDesPasses = async (issue: number, temps: EnregistrementTemps): Promise<EnregistrementTemps> => {
    const { passes } = temps;
    if (passes === undefined || github.ciDeLaBranche === undefined) return temps;
    try {
      return { ...temps, passes: partagerLaCi(await github.ciDeLaBranche(brancheDuTicket(issue)), passes) };
    } catch (erreur) {
      avertir(`brigade : #${issue} sur ${nom} — the CI runs of its branch are unreadable, its CI's wait for runners is not recorded: ${message(erreur)}`);
      return temps;
    }
  };
  // Les tickets récents mergés sans leur qualité — avant #2707, ou GitHub muet
  // à leur merge — la reçoivent après un merge, quelques-uns à la fois : les
  // chiffres de qualité ne restent pas vides jusqu'à ce que la fenêtre se
  // renouvelle. Leurs labels ne se relisent pas ; une réparation de la base s'y
  // reconnaît à la marque de commit rouge que la station seule écrit dans son corps.
  const rattraperLesQualites = async (dossier: string) => {
    const manquants = ticketsRecents(lesTempsDesTickets(dossier).enregistrements)
      .filter(({ qualite }) => qualiteLue(qualite) === null)
      .slice(-RATTRAPAGE_PAR_MERGE);
    const ajouts = new Map<number, { qualite: QualiteDuTicket }>();
    for (const { ticket } of manquants) {
      try {
        const [corps, commentaires] = await Promise.all([github.corpsDuTicket(ticket), github.commentaires(ticket)]);
        ajouts.set(ticket, { qualite: qualiteDeLIssue({ corps, labels: checksRepares(corps).length === 0 ? [] : [PRIO_REPARATION], commentaires }) });
      } catch (erreur) {
        if (erreur instanceof LimiteGitHubAtteinte) break;
      }
    }
    if (ajouts.size === 0) return;
    try {
      completerLesTemps(dossier, ajouts);
    } catch (erreur) {
      avertir(`brigade : the quality of ${[...ajouts.keys()].map((n) => `#${n}`).join(", ")} could not be recorded on ${nom} — ${message(erreur)}`);
    }
  };
  // Les tickets récents mesurés avant #2732 — leur attente d'une prise courait
  // jusqu'à la première phase que la station a vue — reçoivent après un merge
  // la prise que leur issue porte, quelques-uns à la fois (#2734) : sans elle,
  // un ticket cuit par une autre station ou avant un redémarrage gardait des
  // heures de cuisson pour l'attente d'une prise, une journée durant.
  // Ils la reçoivent aussi à chaque tour, avant que la règle du temps perdu ne
  // les lise (#2870) : sur un projet sans merge depuis, espace#822 — 8,2 min
  // d'attente d'une prise sur 8,3, pris 1,9 min après `fire` — ouvrait seul un
  // ticket de correction. Une issue que GitHub ne rend pas (null) ne se relit
  // plus de la vie de la station ; une lecture qui lève se retente.
  const prisesIntrouvables = new Set<number>();
  const rattraperLesPrises = async (dossier: string) => {
    const lire = github.depotDuTicket;
    if (lire === undefined) return;
    const manquants = ticketsRecents(lesTempsDesTickets(dossier).enregistrements)
      .filter((t): t is EnregistrementTemps => t.priseAt === undefined && typeof t.claimedAt === "string" && typeof t.mergedAt === "string" && !prisesIntrouvables.has(t.ticket))
      .slice(-RATTRAPAGE_PAR_MERGE);
    const ajouts = new Map<number, EnregistrementTemps>();
    for (const t of manquants) {
      try {
        const depot = await lire(t.ticket);
        if (depot === null) prisesIntrouvables.add(t.ticket);
        else ajouts.set(t.ticket, rattraperLaPrise(t, depot.priseAt ?? null));
      } catch (erreur) {
        if (erreur instanceof LimiteGitHubAtteinte) break;
      }
    }
    if (ajouts.size === 0) return;
    try {
      completerLesTemps(dossier, ajouts);
    } catch (erreur) {
      avertir(`brigade : the claim of ${[...ajouts.keys()].map((n) => `#${n}`).join(", ")} could not be recorded on ${nom} — ${message(erreur)}`);
    }
  };
  // Les gestes de guérison du projet (#2757), joués à chaque tour.
  // Une cause qui vit dans la station se dépose sur la brigade (#3098), comme le temps perdu.
  const { guerir } = ouvrirGuerison({ github, station: nom, base, avertir, ...(options.depotServi === undefined || options.githubDeLaBrigade === undefined ? {} : { servi: options.depotServi, brigade: options.githubDeLaBrigade }), ...(options.maintenant === undefined ? {} : { maintenant: () => (options.maintenant as () => Date)().getTime() }) });
  const { clone } = options;
  // Le classement du risque de la fiche du projet, relu à chaque action (#4230) : une action rangée `chef` attend
  // l'OK du chef à la porte des gestes, quel que soit le niveau de la pass ; sans fiche, aucun classement à lire.
  const passDuRisque = ouvrirLePass({
    lire: () => station.ficheDuProjet?.(),
    parquer: async (item) => {
      const porte = station.porte ?? null;
      if (porte === null) return avertir(`brigade : #${item.ticket} on ${nom} — parked for the chef, who cannot answer: this runtime has no gesture gate (${item.texte})`);
      await porte.passer({ agent: "pass", reglable: "pass", auChef: true }, { line: item.texte, reason: `the project sheet ranks \`${item.genre}\` 'chef'`, outcome: OUTCOME.HANDED_TO_CHEF }, () => passDuRisque.repondre(item.id));
    },
  });
  // Une PR ouverte dont le ticket est fermé, reste du circuit d'avant, ne sera
  // plus servie par personne : la station la ferme, d'un commentaire, et garde
  // sa branche (#3097). Le commentaire se lit avant d'être posé, pour qu'une
  // fermeture ratée après lui ne le double pas au tour suivant. Une PR externe
  // n'est jamais fermée ; une lecture ou un geste qui échoue attend le tour suivant.
  // Une fois tous les BALAYAGE_DES_PR_MS : un reste du circuit d'avant n'urge pas, et la
  // lecture des PR coûte un point de débit à chaque tour. Rend les PR ouvertes lues, ou
  // null si le balayage n'a pas lieu à ce tour.
  let dernierBalayage = Number.NEGATIVE_INFINITY;
  const fermerLesPRDesTicketsFermes = async (ouverts: ReadonlySet<number>, prsOuvertes: () => ReturnType<GitHubDuTour["prsOuvertes"]>) => {
    const { fermerPR } = github;
    if (fermerPR === undefined || github.issue === undefined || instant() - dernierBalayage < BALAYAGE_DES_PR_MS) return null;
    dernierBalayage = instant();
    const externes = new Set((await github.prsExternes?.())?.map(({ number }) => number));
    const ouvertes = await prsOuvertes();
    for (const pr of ouvertes) {
      if (pr.number === undefined || externes.has(pr.number)) continue;
      // Un ticket que le tour a lu ouvert (il porte `fire`) n'a pas à être relu.
      if (ouverts.has(Number(/^cook\/(\d+)-/.exec(pr.branche)?.[1]))) continue;
      try {
        const fermeture = await fermetureDuTicket(github.issue.bind(github), pr.branche);
        if (fermeture === null) continue;
        if (fermeture.date === null) {
          avertir(`brigade : PR #${pr.number} on ${nom} has a closed ticket #${fermeture.numero} but GitHub does not say when it was closed — the PR stays open`);
          continue;
        }
        const texte = `its ticket #${fermeture.numero} was closed on ${fermeture.date}; nothing serves this PR any more`;
        if (!(await github.commentaires(pr.number)).some(({ body }) => body === texte)) await github.commenter(pr.number, texte);
        await fermerPR.call(github, pr.number);
      } catch (echec) {
        avertir(`brigade : PR #${pr.number} on ${nom} could not be closed after its ticket was — ${message(echec)}`);
      }
    }
    // Lue une fois par tour : la porte de zone ne la relit pas.
    return ouvertes;
  };

  // Une carte de validation dont le ticket est fermé ou la PR mergée ou fermée
  // n'a plus rien à demander au chef : la station la ferme (#3390). Au plus une
  // fois par BALAYAGE_DES_CARTES_MS ; un échec attend le balayage suivant.
  let dernierBalayageDesCartes = Number.NEGATIVE_INFINITY;
  const fermerLesCartesCaduquesDuTour = async () => {
    const { ouvertes, prDeBranche } = github;
    if (github.issue === undefined || ouvertes === undefined || prDeBranche === undefined || instant() - dernierBalayageDesCartes < BALAYAGE_DES_CARTES_MS) return;
    dernierBalayageDesCartes = instant();
    await fermerLesCartesCaduques([DESIGN, SENSIBLE], { ...github, ouvertes: ouvertes.bind(github), prDeBranche: prDeBranche.bind(github), issue: github.issue.bind(github), commenter: github.commenter.bind(github), delabelliser: github.delabelliser.bind(github), fermerIssue: github.fermerIssue.bind(github) }, brancheDuTicket, (carte, erreur) => avertir(`brigade : card #${carte} on ${nom} has nothing left to validate but could not be closed — ${message(erreur)}; retried at the next sweep`));
  };

  // Le ticket dont la livraison est mergée est servi : fermé, puis délesté de
  // `in-pass`. GitHub ne ferme pas toujours l'issue par le `Closes #N` de la PR
  // (#2467) ; la fermeture passe d'abord, pour qu'un retrait réussi sur une
  // fermeture ratée ne rende pas le ticket libre. Un échec attend le tour suivant.
  const cloreLeServi = async (ticket: TicketLu) => {
    try {
      await github.fermerIssue(ticket.number);
      if (ticket.labels.includes(LABEL_IN_PASS)) await github.delabelliser(ticket.number, LABEL_IN_PASS);
    } catch (erreur) {
      avertir(`brigade : closing the served #${ticket.number} on ${nom} — ${message(erreur)}; retried next turn`);
    }
  };
  // Les tickets que la station tient sans cook (#2179) : celui d'un cook qui a
  // levé — GitHub qui limite ses appels, par exemple —, ou la prise qu'un
  // runtime arrêté a laissée. Chacun garde sa place jusqu'à ce qu'un tour le
  // rende sur l'issue : un échec ne libère jamais une place pour un autre.
  const aRendre = new Map<number, TicketLu>();
  let premierTour = true;
  // Les tickets de la cuisine que le dernier tour a lus ouverts : ceux qu'un
  // cook bloqué peut nommer comme attendus (#2968).
  let ouvertsDuTour = new Set<number>();
  let ticketsDuTour: TicketLu[] = [];
  // Les tickets libres du dernier tour qui a lu le rail (#3713) : un tour que GitHub arrête avant garde ceux d'avant.
  let attendentDuTour = new Set<number>();
  // Ce que la porte de prise dit de chaque ticket qu'elle saute : le superviseur le lit (#3945).
  const sauter = (ticket: number, ligne: string, attendus?: readonly number[], raison?: RaisonDuSaut) => options.sauter?.(ticket, ligne, attendus, raison);
  const perimee = (ticket: number, pr: PRDeLaPorte & { number: number }) => options.perimee?.(ticket, pr);
  const enPremier = () => {
    try {
      return options.enPremier?.() ?? [];
    } catch (erreur) {
      avertir(`brigade : the tickets to take first could not be read — ${message(erreur)}`);
      return [];
    }
  };
  // La station s'arrête (`arreter`) : ses cooks meurent avec elle.
  let arretee = false;
  // La branche d'intégration que l'origine n'a pas (#2876) : la station ne prend plus rien de ce projet.
  let baseManquante: string | null = null;
  // Le fetch de la base a échoué (réseau, jeton, origine) : dit une fois, et la station ne prend plus rien de ce projet
  // pendant `REPIT_BASE_INJOIGNABLE_MS`. Passé ce délai l'arrêt se lève seul, au tour suivant : une coupure courte
  // ne met pas fin au projet jusqu'au redémarrage. Si le fetch échoue encore, il est dit de nouveau.
  let baseInjoignable: { depuis: number; raison: string } | null = null;
  // Les PR dont la fusion n'a pas abouti — GitHub a refusé le merge, ou la
  // mise à jour de la branche est demandée —, et ce qu'elles étaient alors :
  // leur tête, leur version et la base. Elle ne se retente qu'une fois l'une
  // d'elles changée (#2198) : une PR approuvée dont la CI tourne encore ne
  // coûte pas un merge refusé à chaque tour.
  const tentees = new Map<number, string>();
  // Les PR dont la CI était attendue, et ce qu'elles étaient alors : une CI
  // qui tourne presse les tours une fois par tête, pas à chaque tour (#2333).
  const attendues = new Map<number, string>();
  // Les livraisons que la pass retient pour le chef — la validation de leur
  // écran, la revue d'un ticket sensible, une carte sans objet — et la tête
  // retenue : elles attendent un humain, pas la pass, et ne prennent aucune de
  // ses places (`PASS_MAX`). Comptées, cinq livraisons qui attendaient le chef
  // arrêtaient toutes les prises du projet jusqu'à sa réponse (#3446).
  const pourLeChef = new Map<number, string>();
  // Les livraisons en pass de ce tour dont la tête est encore celle retenue.
  const retenuesDuTour = new Set<number>();
  // Les livraisons que la station relit et merge en ce moment, hors du tour (#2329).
  const enRelecture = new Map<number, Promise<void>>();
  // Un merge à la fois : chaque merge attend le précédent.
  let serie: Promise<unknown> = Promise.resolve();
  const enSerie = <T>(faire: () => Promise<T>): Promise<T> => {
    const suite = serie.then(faire, faire);
    serie = suite.catch(() => undefined);
    return suite;
  };

  const instant = () => (options.maintenant?.() ?? new Date()).getTime();
  // Les tickets `taken` sans cook sur aucune station ni attente vivante : rendus au rail après 5 min (#3883).
  const orphelins = veilleDesOrphelins({ github, station: nom, maintenant: instant });
  // Les tickets du rail tenus par une attente : passé une heure, le manager la revoit, une fois (#3764).
  const attentesLongues = suiviDesAttentesLongues({ github, station: nom, label: CHEF_TODO, ...(options.revoirLAttente === undefined ? {} : { revoir: options.revoirLAttente }), maintenant: instant, avertir });
  // Le terme de la dernière attente du ticket n'est pas passé. Illisibles, ses commentaires ne le retiennent pas.
  // Rend ce terme (ms), ou null quand le ticket n'attend pas.
  const enAttente = async (ticket: TicketLu): Promise<number | null> => {
    return termeDeLAttente(await github.commentaires(ticket.number).catch(() => []), instant());
  };
  // Les tickets rendus au rail pour des gates rouges sous la charge (#4211) : leur attente se lève dès que la
  // machine est calme. Perdus au redémarrage de la station, ils attendent alors le terme de leur attente.
  const remisPourLaCharge = new Set<number>();
  const railDeLaCharge = { remettre: (numero: number) => void remisPourLaCharge.add(numero) };

  // La question d'un cook bloqué va au manager, jamais au chef directement
  // (#2894). Rend ce que devient le ticket — rendu à la file (`liberee`), retenu
  // pour le chef sur une décision de produit ou de design ou un geste qu'il est
  // seul à pouvoir faire (`retenue`) —, ou l'échec d'un cook sans livraison
  // qu'il devient : le même blocage technique ne boucle pas.
  // Les cartes de station que ce processus a posées : une par prérequis.
  const cartesDeLaStation = new Map<string, number>();
  // Sa livraison ouverte, devenue caduque (réécrit, découpé), se ferme dans le même geste que lui : ouverte, elle tiendrait encore sa zone.
  // Un échec ici ne défait pas le geste : il est dit.
  const fermerLaLivraisonObsolete = async (numero: number, raison: string, geste: string): Promise<void> => {
    try {
      const livraison = (await github.prsOuvertes()).find((ouverte) => ouverte.number !== undefined && ouverte.branche.startsWith(`cook/${numero}-`));
      if (livraison?.number !== undefined && github.fermerPR !== undefined) {
        await github.commenter(livraison.number, `Ticket #${numero} ${raison}`);
        await github.fermerPR(livraison.number);
      }
    } catch (erreur) {
      avertir(`brigade : #${numero} sur ${nom} — ${geste} done, but its open delivery could not be closed: ${message(erreur)}`);
    }
  };

  // Après le dernier essai raté d'un ticket — `ECHECS_MAX` cooks sans
  // livraison, deux au même motif, ou ses renvois épuisés —, il va au manager,
  // pas au chef (#3513) : la station applique ici la reprise qu'il choisit —
  // réécrit, découpé, recalibré, ou une question de produit ou de design. Rend
  // le commentaire de la reprise, que l'appelant poste après celui de l'essai
  // (les essais se recomptent d'après lui) ; ou ce que le chef lit quand le
  // ticket va à lui : déjà repris une fois, sans manager, ou une reprise qui ne
  // se lit ou ne s'applique pas — dite, jamais devinée.
  const apresLesEssais = async (ticket: TicketLu, motifs: string[], { livraisonGardee = false }: { livraisonGardee?: boolean } = {}): Promise<{ auChef: string } | { commentaire: string; question: boolean }> => {
    const numero = ticket.number;
    let corps: string;
    let commentaires: { body: string; createdAt: string }[];
    try {
      [corps, commentaires] = await Promise.all([github.corpsDuTicket(numero), github.commentaires(numero)]);
    } catch (erreur) {
      return { auChef: `The manager did not rework it: the ticket could not be read (${message(erreur)}).` };
    }
    // Repris depuis son dernier relancement, ou né du découpage d'une reprise
    // et jamais relancé : il a eu la sienne, il va au chef avec ce qui a été tenté.
    const relance = await relanceDe(github, numero);
    const dejaRepris = commentaires.filter((c) => c.body.startsWith(MARQUE_DE_LA_REPRISE) && !(Date.parse(c.createdAt) <= relance)).at(-1);
    const parent = parentDeLaReprise(corps);
    if (dejaRepris !== undefined || (parent !== null && relance === 0)) {
      const duParent = dejaRepris === undefined && parent !== null ? (await github.commentaires(parent).catch(() => [])).filter((c) => c.body.startsWith(MARQUE_DE_LA_REPRISE)).at(-1) : undefined;
      avertir(`brigade : #${numero} sur ${nom} — its tries are spent again after the manager reworked it: it goes to the chef, with what was tried`);
      return { auChef: ceQuiAEteTente({ reprise: (dejaRepris ?? duParent)?.body ?? null, parent: dejaRepris === undefined ? parent : null, motifs }) };
    }
    if (options.reprendre === undefined) return { auChef: "No manager runs on this station to rework it." };
    const pose = calibrageDesLabels(ticket.labels);
    const calibrage = complet(pose) ? pose : null;
    const lu = await options.reprendre(ticket, { calibrage, motifs }).catch((erreur: unknown) => ({ illisible: message(erreur) }));
    if ("illisible" in lu) {
      avertir(`brigade : #${numero} sur ${nom} — its tries are spent and the manager could not rework it (${lu.illisible}): it goes to the chef`);
      return { auChef: `The manager could not rework it: ${lu.illisible}.` };
    }
    const { reprise } = lu;
    let nouveaux: number[] = [];
    try {
      if (reprise.choix === "reecrire" || reprise.choix === "decouper") {
        if (github.ecrireCorps === undefined) return { auChef: `The manager chose to ${reprise.choix === "reecrire" ? "rewrite" : "split"} it, but this station cannot write the ticket's body.` };
      }
      if (reprise.choix === "reecrire") {
        await github.ecrireCorps?.(numero, corpsReecrit(corps, reprise.corps));
        // Réécrit, le ticket repart de son nouveau corps : sa livraison ouverte est caduque et ne tient plus sa zone (#3966).
        // Sauf après les renvois de la pass : le cook reprend sous la même PR, qui reste sa livraison en pass.
        if (!livraisonGardee) await fermerLaLivraisonObsolete(numero, "was rewritten by the manager: this delivery is obsolete and is closed, the ticket restarts from its new body.", "rewrite");
      }
      if (reprise.choix === "recalibrer") {
        for (const label of ticket.labels.filter((l) => l.startsWith("model:") || l.startsWith("effort:"))) await github.delabelliser(numero, label);
        await github.labelliser(numero, [`model:${reprise.calibrage.model}`, `effort:${reprise.calibrage.effort}`]);
      }
      if (reprise.choix === "decouper") {
        // Nés sur le rail avec le calibrage, la priorité du ticket ;
        // lui devient leur épique : il ne se prend plus, et se ferme avec eux.
        const labels = [LABEL, ...ticket.labels.filter((l) => /^(model|effort|prio):/.test(l))];
        const lignes = [];
        for (const sous of reprise.tickets) {
          const ne = await github.creerIssue({ titre: sous.titre, corps: corpsDuSousTicket(numero, sous, calibrage), labels });
          nouveaux = [...nouveaux, ne];
          lignes.push({ ticket: ne, title: sous.titre, state: "on the rail", served: false });
        }
        await github.ecrireCorps?.(numero, avecListe(corps, rendreListe(numero, lignes)));
        // Sa livraison ouverte se ferme avec le découpage : épique, elle tiendrait la zone de ses propres sous-tickets (#3932).
        await fermerLaLivraisonObsolete(numero, `was split into ${nouveaux.map((n) => `#${n}`).join(", ")}: this delivery is closed, its sub-tickets carry the work.`, "split");
      }
    } catch (erreur) {
      avertir(`brigade : #${numero} sur ${nom} — the manager's rework (${reprise.choix}) could not be applied: ${message(erreur)}`);
      return { auChef: `The manager chose to ${reprise.choix === "reecrire" ? "rewrite" : reprise.choix === "decouper" ? "split" : "recalibrate"} it, and it could not be applied: ${message(erreur)}.${nouveaux.length === 0 ? "" : ` Already opened: ${nouveaux.map((n) => `#${n}`).join(", ")}.`}` };
    }
    avertir(`brigade : #${numero} sur ${nom} — its tries are spent: the manager ${reprise.choix === "question" ? `asks the chef a ${reprise.sorte} question` : `chose \`${reprise.choix}\`, and the ticket goes back on the rail`}`);
    return { commentaire: commentaireDeReprise({ station: nom, reprise, motifs, avant: calibrage, nouveaux }), question: reprise.choix === "question" };
  };

  // Le commentaire de la reprise, posté après celui de l'essai ; une question
  // de produit ou de design le porte comme carte du chef : le ticket est parqué pour lui (`chef-todo`, #4129).
  // Le commentaire de la reprise garde sa marque en tête — c'est elle qui dit le ticket déjà repris — ; la carte, après
  // lui, en porte la question, qui le clôt.
  const direLaReprise = async (numero: number, suite: { commentaire: string; question: boolean }) => {
    if (!suite.question) return void (await github.commenter(numero, suite.commentaire));
    await github.commenter(numero, suite.commentaire);
    const pose = await poserALaMain({ github, repertoireEtat: options.repertoireEtat }, numero, suite.commentaire.slice(suite.commentaire.lastIndexOf("**Question for the chef")));
    if (!pose.pose) avertir(`brigade : ${pose.echec}`);
  };

  // Une boucle de relances — ses essais épuisés sans livraison, ou un invariant
  // cassé par ses relances — s'arrête ici, sans geste du chef (#4041) : le ticket
  // est parqué (#4129) — qui : le superviseur, qui reçoit son dossier ; pour quoi :
  // sa raison écrite ; jusqu'à une date, sept jours plus loin, où il reprend seul
  // où il était (`ramenerALaRelance`). Rien ne le prend avant.
  const arreterLaBoucle = async (numero: number, motifs: readonly string[]): Promise<void> => {
    await parquerSesEchecs(github, numero, motifs.at(-1) ?? "", { station: nom, mots: motifs.join("\n") }, new Date(instant()), avertir);
  };

  const confierAuManager = async (ticket: TicketLu, question: string): Promise<"liberee" | "retenue" | { echec: string }> => {
    const issue = ticket.number;
    if (options.consulter === undefined) return poserLaQuestionAilleurs(issue, question);
    const consulter = options.consulter;
    const premiereLigne = question.trim().split("\n")[0] ?? "";
    // Les réponses techniques qu'il a déjà données, depuis le dernier retrait de `served-elsewhere`.
    const lus = await github.commentaires(issue).catch(() => null);
    const reponses = lus === null ? null : (await depuisLeRelancement(github, issue, lus, MARQUE_DE_REPONSE)).map((c) => c.body);
    const lu: ReponseDuManager =
      reponses === null
        ? { illisible: "the issue's comments could not be read to count the manager's previous answers" }
        : await consulter(ticket, { question, reponses }).catch((erreur: unknown): ReponseDuManager => ({ illisible: message(erreur) }));
    // Sans avis, le ticket attend puis repart, sans aller au chef ; au-delà de
    // `ECHECS_MAX` attentes de ce genre, il compte pour un cook sans livraison.
    if ("illisible" in lu) {
      const deja = (await depuisLeRelancement(github, issue, lus ?? [], MARQUE_D_ATTENTE)).filter((c) => c.body.includes(" manager ")).length;
      if (deja + 1 >= ECHECS_MAX) return { echec: `the cook declared itself blocked, and the manager could not answer it, ${deja + 1} times (${lu.illisible})` };
      const reprise = instant() + ATTENTE_MS;
      avertir(`brigade : #${issue} sur ${nom} — the cook declared itself blocked and the manager could not answer (${lu.illisible}): the ticket waits, then is retried, not given to the chef`);
      await github.commenter(issue, `${MARQUE_D_ATTENTE} until=${reprise} manager -->\nStation \`${nom}\`: the cook stopped, blocked, and the manager could not answer its question — ${lu.illisible}.\n\nThe ticket does not go to the chef: it waits until ${new Date(reprise).toISOString()}, then a cook resumes it from its branch. This stop is not counted among the ticket's ${ECHECS_MAX} tries.`);
      return "liberee";
    }
    // L'issue cite la question du cook en anglais, traduite par le manager.
    const { avis } = lu;
    const questionEn = lu.questionEn ?? null;
    if (avis.issue === "technique") {
      const deja = reponses ?? [];
      // La troisième réponse s'écrit dans le corps du ticket, une seule fois.
      const ecrite = deja.length >= REPONSES_AVANT_DECISION;
      if (ecrite) {
        const pasEcrite = (pourquoi: string) => ({ echec: `the manager's decision on the cook's block could not be written into the ticket: ${pourquoi}` });
        let corps: string;
        try {
          corps = await github.corpsDuTicket(issue);
        } catch (erreur) {
          return pasEcrite(message(erreur));
        }
        if (corps.includes(MARQUE_DE_DECISION)) return { echec: `the cook blocked again on a technical question after the manager's decision was written into the ticket: ${premiereLigne}` };
        if (github.ecrireCorps === undefined) return pasEcrite("this GitHub client cannot write the ticket's body");
        try {
          await github.ecrireCorps(issue, `${corps.trimEnd()}\n\n${sectionDeLaDecision(questionEn, avis)}\n`);
        } catch (erreur) {
          return pasEcrite(message(erreur));
        }
      }
      avertir(`brigade : #${issue} sur ${nom} — the cook blocked on a technical question: the manager answered it${ecrite ? " and its decision is written into the ticket" : ""}, the ticket goes back to a cook`);
      await github.commenter(issue, corpsDeLaReponseAuBlocage({ station: nom, n: deja.length + 1, questionEn, avis, ecrite }));
      return "liberee";
    }
    // Un secret ou un compte sur la station — une clé d'API, l'URL d'une base, un
    // login — est une vraie carte du chef, posée une fois, jamais un geste git
    // même si les mots du cook nomment sa branche (#4041) : parqué pour le chef
    // (`chef-todo`), le ticket n'est pas relancé tant qu'elle attend.
    if (besoinDeSecret(avis.issue === "geste" ? avis.geste : "")) {
      avertir(`brigade : #${issue} sur ${nom} — the cook declared itself blocked on a secret or an account only the chef can add on the station: the ticket goes to the chef`);
      const pose = await poserALaMain({ github, repertoireEtat: options.repertoireEtat }, issue, corpsDeLaCarte({ station: nom, questionEn, avis, secret: true }));
      if ("echec" in pose) avertir(`brigade : ${pose.echec}`);
      return "retenue";
    }
    // Une installation, un service à démarrer, une base à créer ou migrer n'est
    // jamais une carte du ticket (#3058) : seul le prérequis qu'un humain pose une
    // fois pour la station a sa carte, une par station, et le ticket attend.
    const geste = avis.issue === "geste" ? lireLeGeste(avis.geste) : null;
    if (geste !== null) {
      let suite = "no card is posted for it: the kitchen does it, or the ticket waits";
      if (geste.serveur !== null) {
        const pose = await poserLaCarteDeLaStation({ github, deja: cartesDeLaStation, ...(options.maintenant === undefined ? {} : { maintenant: options.maintenant }) }, nom, geste.serveur);
        if ("echec" in pose) avertir(`brigade : ${pose.echec}`);
        else suite = `the ${geste.serveur.nom} is missing on this station: its single card is #${pose.carte}`;
      }
      const deja = (await depuisLeRelancement(github, issue, lus ?? [], MARQUE_D_ATTENTE)).filter((c) => c.body.includes(" manager ")).length;
      if (deja + 1 >= ECHECS_MAX) return { echec: `the cook declared itself blocked on a ${geste.sorte} gesture, ${deja + 1} times, and no card is posted for such a gesture` };
      const reprise = instant() + ATTENTE_MS;
      avertir(`brigade : #${issue} sur ${nom} — the cook declared itself blocked on a ${geste.sorte} gesture: ${suite}`);
      await github.commenter(issue, `${MARQUE_D_ATTENTE} until=${reprise} manager -->\nStation \`${nom}\`: the cook stopped, blocked on a gesture to ${geste.sorte === "install" ? "install something" : geste.sorte === "service" ? "start a service" : "create or migrate a database"}. Nothing here is for the chef: ${suite}.\n\nThe ticket waits until ${new Date(reprise).toISOString()}, then a cook resumes it from its branch. This stop is not counted among the ticket's ${ECHECS_MAX} tries.`);
      return "liberee";
    }
    // Un geste sur GitHub que la station fait elle-même : jamais une carte
    // (#3136). Qu'elle ne peut pas faire tel quel — un gabarit, une commande
    // illisible —, le ticket dit pourquoi, sur le chemin d'échec (#3374).
    const gestesGitHub = avis.issue === "geste" ? lireLesGestesDuManager(avis, options.depotServi ?? null) : null;
    if (gestesGitHub !== null) {
      if ("refus" in gestesGitHub) return { echec: `the cook asked for a GitHub gesture the station makes, and the station could not make it: ${gestesGitHub.refus}` };
      const fait = await faireLesGestesGitHub(github, { station: nom, ticket: issue, gestes: gestesGitHub.gestes });
      if ("echec" in fait) return { echec: fait.echec };
      avertir(`brigade : #${issue} sur ${nom} — the cook asked for a GitHub gesture: the station made it (${fait.fait.join(" ")}), the ticket goes back to a cook`);
      return "liberee";
    }
    // Un refus du bac à sable n'est pas un geste git (#3552), et n'est jamais une
    // carte du chef (#3562) : quels que soient les mots du cook ou du manager —
    // un geste, une question, un fichier de réglages —, la cuisine ajoute le
    // besoin à la déclaration du projet, le ticket attend puis revient à un cook.
    const limite = [question, questionEn ?? "", avis.issue === "geste" ? avis.geste : avis.question].find((texte) => natureDeLArret(texte) === "bac-a-sable");
    if (limite !== undefined) {
      const dite = limite.trim().split("\n")[0] ?? "";
      const deja = (await depuisLeRelancement(github, issue, lus ?? [], MARQUE_D_ATTENTE)).filter((c) => c.body.includes(" manager ")).length;
      if (deja + 1 >= ECHECS_MAX) return { echec: `the cook stopped on a sandbox limit, ${deja + 1} times, and no card is posted for it: ${dite}` };
      const reprise = instant() + ATTENTE_MS;
      avertir(`brigade : #${issue} sur ${nom} — the cook stopped on a sandbox limit (${dite}): no card for the chef, the kitchen adds the need to the declaration`);
      await github.commenter(issue, `${MARQUE_D_ATTENTE} until=${reprise} manager -->\nStation \`${nom}\`: the cook stopped — ${DIT_L_ARRET_DU_BAC} Nothing here is for the chef.\n\nThe limit: ${dite}\n\nThe ticket waits until ${new Date(reprise).toISOString()}. This stop is not counted among the ticket's ${ECHECS_MAX} tries.`);
      return "liberee";
    }
    // Un geste git n'est jamais une carte du chef (#3476) : le ticket revient à
    // son propre cook, qui met lui-même sa branche à jour de la base.
    if (avis.issue === "geste" && geste === null && demandeUnGesteGit(avis.geste)) {
      const deja = await renvoisPourLaBase(github, issue);
      if (typeof deja !== "number") return deja;
      if (deja + 1 > ECHECS_MAX) return { echec: `the cook declared itself blocked on a git gesture, ${deja + 1} times, and no card is posted for such a gesture: ${avis.geste}` };
      avertir(`brigade : #${issue} sur ${nom} — the cook declared itself blocked on a git gesture (${avis.geste}): no card for the chef, the ticket goes back to its own cook`);
      await github.commenter(issue, corpsDuRenvoiPourConflit({ station: nom, base, branche: brancheDuTicket(issue), fichiers: [], detail: `the manager read a git gesture: ${avis.geste}`, ...(questionEn === null ? {} : { question: questionEn }) }));
      return "liberee";
    }
    avertir(`brigade : #${issue} sur ${nom} — the cook declared itself blocked, and the manager read ${avis.issue === "geste" ? "a gesture only the chef can make" : `a ${avis.issue === "produit" ? "product" : "design"} decision`}: the ticket goes to the chef`);
    const pose = await poserALaMain({ github, repertoireEtat: options.repertoireEtat }, issue, corpsDeLaCarte({ station: nom, questionEn, avis }));
    if (!pose.pose) avertir(`brigade : ${pose.echec}`);
    return "retenue";
  };

  // Les stations du projet : celles que la station déclare, et celles que GitHub
  // montre — une prise postée sur une issue qui a bougé ces deux derniers jours (#3870). Une station
  // ne déclare qu'elle-même, comme la box d'un Mac qui ne la déclare pas : sans
  // GitHub, aucune autre ne serait vue, et le ticket resterait retenu ici. La
  // lecture se garde dix minutes ; une lecture qui échoue ne retire rien aux
  // stations déclarées.
  // `managers` : celles dont une prise du travail du manager s'y lit (#3938).
  let vuesSurGitHub: { a: number; noms: string[]; managers: string[] } | null = null;
  const stationsDuProjet = async (): Promise<string[]> => {
    const declarees = [...(options.stationsDuProjet?.() ?? [])];
    const maintenant = (options.maintenant?.() ?? new Date()).getTime();
    if (vuesSurGitHub === null || maintenant - vuesSurGitHub.a > 10 * 60_000) {
      try {
        const noms = new Set<string>();
        const managers = new Set<string>();
        const recentes = (await github.issuesDepuis(new Date(maintenant - FENETRE_DES_STATIONS_MS).toISOString())).filter((lue) => lue.state !== "closed");
        if (recentes.length > ISSUES_LUES_AU_PLUS) avertir(`brigade : ${nom} — ${recentes.length} issues moved in the last two days: only the ${ISSUES_LUES_AU_PLUS} most recent are read for the stations of the project`);
        for (const lue of recentes.slice(-ISSUES_LUES_AU_PLUS)) {
          const lus = await github.commentaires(lue.number);
          for (const nomVu of stationsDesPrises(lus)) noms.add(nomVu);
          for (const nomVu of stationsDuManager(lus)) managers.add(nomVu);
        }
        vuesSurGitHub = { a: maintenant, noms: [...noms], managers: [...managers] };
      } catch (erreur) {
        if (erreur instanceof LimiteGitHubAtteinte) throw erreur;
        avertir(`brigade : ${nom} — the stations of the project could not be read on GitHub: ${message(erreur)}`);
        return [...new Set([...declarees, ...(vuesSurGitHub?.noms ?? [])])];
      }
    }
    return [...new Set([...declarees, ...vuesSurGitHub.noms])];
  };

  // Les autres stations du projet qui font tourner un manager, telles que GitHub
  // les montre (#3938) ; null quand elles ne se sont jamais lues. Une station que
  // l'issue marque incapable de jouer les gates du ticket ne le prend jamais :
  // son manager n'y répondrait pas, la question ne l'attend pas.
  const stationsAvecManager = async (marquees: ReadonlySet<string>): Promise<string[] | null> => {
    await stationsDuProjet();
    return vuesSurGitHub === null ? null : stationsCapables(nom, vuesSurGitHub.managers, marquees);
  };

  // Sans manager sur la station, la question du cook est postée sur l'issue pour
  // le manager d'une autre station du projet, et le ticket est rendu, sans compter
  // d'essai ni le mettre de côté (#3938). Si aucune station du projet ne fait
  // tourner de manager, le ticket est rendu au rail, et attend avant d'être repris.
  const poserLaQuestionAilleurs = async (issue: number, question: string): Promise<"liberee"> => {
    // Des marques illisibles n'écartent aucune station : la porte relit les siennes.
    const marquees = await github
      .commentaires(issue)
      .then((lus) => incapablesLus(lus, () => Promise.resolve().then(() => github.retraitsDeLabels(issue))))
      .catch(() => new Set<string>());
    const managers = await stationsAvecManager(marquees);
    await github.commenter(issue, corpsDeLaQuestion({ station: nom, question, managers }));
    if (managers !== null && managers.length > 0) {
      avertir(`brigade : #${issue} sur ${nom} — the cook declared itself blocked and this station has no manager: its question is posted on the issue for the manager on ${managers.join(", ")}, the ticket is given back`);
      return "liberee";
    }
    const reprise = instant() + ATTENTE_MS;
    avertir(`brigade : #${issue} sur ${nom} — the cook declared itself blocked, and no station of the project runs a manager: its question is posted on the issue, the ticket is given back to the rail`);
    await github.commenter(issue, `${MARQUE_D_ATTENTE} until=${reprise} -->\nStation \`${nom}\`: the ticket is given back to the rail with its cook's question above. It waits until ${new Date(reprise).toISOString()}, then a cook resumes it from its branch. This stop is not counted among the ticket's ${ECHECS_MAX} tries.`);
    return "liberee";
  };

  // Les questions qu'une station sans manager a postées sur les tickets que la
  // porte de prise laisse partir ici : son manager y répond avant le cook (#3938).
  const questionsAReprendre = new Map<number, QuestionEnSuspens>();

  // Marque sur l'issue que cette station ne joue pas les gates du ticket, et
  // rend les stations du projet qui le peuvent encore (#3057). Des marques
  // illisibles n'en écartent aucune : la porte de chaque station relit les
  // siennes avant de prendre.
  const routerAilleurs = async (issue: number, question: string): Promise<string[]> => {
    let marquees = new Set<string>();
    try {
      const commentaires = await github.commentaires(issue);
      marquees = await incapablesLus(commentaires, () => Promise.resolve().then(() => github.retraitsDeLabels(issue)));
    } catch (erreur) {
      avertir(`brigade : #${issue} sur ${nom} — the stations already unable to run its gates could not be read: ${message(erreur)}`);
    }
    const vers = stationsCapables(nom, await stationsDuProjet(), marquees);
    await github.commenter(issue, corpsDeLIncapacite({ station: nom, vers, question }));
    station.lacune?.(direLaLacune(question));
    return vers;
  };

  // Le cook d'un ticket pris, jusqu'à sa livraison en pass ; sans livraison,
  // le ticket est rendu sur l'issue, et pourquoi s'y dit.
  // La tête de la PR ouverte de chaque ticket pris, lue à sa prise.
  const tetesAuDepart = new Map<number, string | null>();
  const cuire = async (ticket: TicketLu, calibrage: Calibrage, suivre = false) => {
    const issue = ticket.number;
    // Le ticket est rendu sur l'issue sans livraison : sa place est libre.
    let liberee = false;
    try {
      // La question qu'une station sans manager a postée va d'abord au manager
      // d'ici, comme celle de son propre cook : sa réponse s'écrit sur l'issue,
      // où le cook suivant la lit (#3938).
      const aReprendre = questionsAReprendre.get(issue);
      questionsAReprendre.delete(issue);
      if (aReprendre !== undefined) {
        avertir(`brigade : #${issue} sur ${nom} — station ${aReprendre.station} has no manager and posted its cook's question: it goes to the manager here, before a cook`);
        await github.commenter(issue, corpsDeLaReprise({ station: nom, de: aReprendre.station }));
      }
      // La tête de sa PR ouverte au départ du cook : arrêté sans livraison sur la même, il en a rencontré l'échec (invariant 2, #4026).
      // Illisible, elle n'est pas dite : l'échec compte comme avant, par son nombre.
      const depart = tetesAuDepart.get(issue) ?? null;
      tetesAuDepart.delete(issue);
      let fait = aReprendre === undefined ? await cuisiner(ticket, calibrage, suivre) : { bloque: aReprendre.question };
      if (fait.testsMs !== undefined) chrono.tests(issue, fait.testsMs);
      if ("branche" in fait) {
        // Elle a cuit un ticket jusqu'à sa livraison : plus rien ne lui manque.
        station.lacune?.(null);
        chrono.marquer(issue, "attentePasse");
        // Un renvoi pousse sur la branche d'une PR encore ouverte : elle porte
        // déjà la livraison, il n'en faut pas une seconde.
        const ouverte = await github.prDuTicket(issue);
        let refusee: string | null = null;
        let livree = ouverte !== null && ouverte.state === "open" ? ouverte.number : null;
        if (ouverte === null || ouverte.state !== "open") {
          // Une PR que GitHub refuse (422, tête introuvable…) n'est pas rejouée à
          // chaque tour : le ticket retourne à un cook avec le motif, et suit la
          // voie des échecs (#2610).
          try {
            const adresse = await github.ouvrirPR({ branche: fait.branche, base, titre: `#${issue} — ${ticket.title}`, corps: avecChangements(`Closes #${issue}\n\nCooked by station \`${nom}\`.`, fait.changements ?? null) });
            livree = numeroDeLaPR(adresse);
          } catch (erreur) {
            if (erreur instanceof LimiteGitHubAtteinte) throw erreur;
            refusee = `GitHub refused the pull request of \`${fait.branche}\`: ${message(erreur)}`;
          }
        }
        // Une livraison de plus sur la PR encore ouverte : son corps prend les
        // lignes de changement de ce cook-ci, ou perd celles du précédent
        // (#3617). Non écrit, la carte montre celles que la PR porte ; la
        // livraison part quand même.
        if (ouverte !== null && ouverte.state === "open" && github.issue !== undefined && github.ecrireCorps !== undefined) {
          try {
            const corps = (await github.issue(ouverte.number))?.body;
            const neuf = corps === undefined ? corps : avecChangements(corps, fait.changements ?? null);
            if (neuf !== undefined && neuf !== corps) await github.ecrireCorps(ouverte.number, neuf);
          } catch (erreur) {
            if (erreur instanceof LimiteGitHubAtteinte) throw erreur;
            avertir(`brigade : #${issue} sur ${nom} — the cook's change lines could not be written in the body of PR #${ouverte.number}: ${message(erreur)}`);
          }
        }
        // Ce que le cook a changé à l'écran, posté sur la PR : la pass le
        // recopie sur la carte « Validate its screen » (#3330). Non posté, la
        // carte dit qu'aucun résumé n'est disponible ; la livraison part quand même.
        if (refusee === null && fait.aLEcran !== undefined) {
          if (livree === null) avertir(`brigade : #${issue} sur ${nom} — the cook's summary of what it changed on the screen is not posted: the pull request's number could not be read`);
          else {
            try {
              await github.commenter(livree, corpsDeCeQuiEstFait(fait.aLEcran));
            } catch (erreur) {
              if (erreur instanceof LimiteGitHubAtteinte) throw erreur;
              avertir(`brigade : #${issue} sur ${nom} — the cook's summary of what it changed on the screen could not be posted on PR #${livree}: ${message(erreur)}`);
            }
          }
        }
        if (refusee === null) {
          // `in-pass` avant le retrait de `taken` : entre les deux, aucune
          // station ne lit le ticket libre.
          await github.labelliser(issue, [LABEL_IN_PASS]);
          await github.delabelliser(issue, LABEL_TAKEN);
          // Livrée : sa relecture part tout de suite, pas au prochain tour (#2333).
          station.presser?.(true);
          return;
        }
        fait = { echec: refusee };
      }
      // Sa CI est rouge sur le même check trois runs de suite : il ne pousse plus,
      // et sort de la cuisine. Le commentaire qui le dit est déjà sur l'issue (#3953).
      if ("arrete" in fait) {
        avertir(`brigade : #${issue} sur ${nom} — not pushed: ${fait.arrete}; the ticket is parked`);
        await parquerSesEchecs(github, issue, fait.arrete, undefined, new Date(instant()), avertir);
        chrono.rater(issue);
        await prise.lacher({ number: issue, labels: [...ticket.labels, LABEL_TAKEN] });
        liberee = true;
        return;
      }
      // La base de la station manque sur l'origine : c'est sa configuration, pas
      // le ticket. Il est rendu sans compter, et la station n'en prend plus (#2876).
      if ("baseAbsente" in fait) {
        const premiere = baseManquante === null;
        baseManquante ??= fait.baseAbsente;
        if (premiere) avertir(`brigade : #${issue} sur ${nom} — the base branch \`${fait.baseAbsente}\` does not exist on the remote: this station takes no more tickets of ${nom} until it is restarted with a base branch that exists`);
        await github.commenter(issue, `Station \`${nom}\`: its base branch \`${fait.baseAbsente}\` does not exist on the remote, so no worktree can be prepared. This is the station's configuration, not the ticket's: the ticket is given back for another station, and is not counted among its ${ECHECS_MAX} tries.`);
        chrono.rater(issue);
        await prise.lacher({ number: issue, labels: [...ticket.labels, LABEL_TAKEN] });
        liberee = true;
        return;
      }
      // Le fetch de la base échoue : comme une base absente, c'est la station, pas le ticket. Il est rendu sans compter, et la station n'en prend plus.
      if ("baseInjoignable" in fait) {
        if (baseInjoignable === null) {
          baseInjoignable = { depuis: instant(), raison: fait.baseInjoignable };
          avertir(`brigade : #${issue} sur ${nom} — the base branch \`${base}\` could not be fetched: ${fait.baseInjoignable}; this station takes no more tickets of ${nom} for ${REPIT_BASE_INJOIGNABLE_MS / 60_000} minutes, then tries again`);
        }
        await github.commenter(issue, `Station \`${nom}\`: the fetch of its base branch \`${base}\` failed, so no worktree can be prepared. This is the station's state, not the ticket's: the ticket is given back for another station, and is not counted among its ${ECHECS_MAX} tries.`);
        chrono.rater(issue);
        await prise.lacher({ number: issue, labels: [...ticket.labels, LABEL_TAKEN] });
        liberee = true;
        return;
      }
      // Bloqué n'est pas livré (#2073) : la question du cook va au manager, qui
      // y répond et rend le ticket à un cook, ou la pose au chef sur la carte
      // en le parquant pour lui (`chef-todo`) si elle est de produit, de design ou un geste
      // qu'il est seul à pouvoir faire (#2894). Relue, sa livraison partielle revenait rouge à un cook qui se
      // déclarait bloqué à son tour : 6 des 13 relectures bloquantes de
      // BOBL-tech/espace (#798 quatre fois, #755 deux fois) (#2805).
      if ("bloque" in fait) {
        // Il résolvait un conflit de sa branche avec la base : un geste git ou
        // une question technique lui revient, le conflit toujours nommé ; seul
        // un choix de produit ou de design va au chef, en mots de produit (#3476).
        if (fait.conflit !== undefined) {
          const consulter = options.consulter;
          const suite = await suiteDuConflitBloque(github, {
            station: nom,
            ticket: issue,
            base,
            branche: brancheDuTicket(issue),
            fichiers: fait.conflit,
            question: fait.bloque,
            ...(consulter === undefined ? {} : { consulter: (question: string) => consulter(ticket, { question, reponses: [] }) }),
          });
          if ("suite" in suite) {
            avertir(`brigade : #${issue} sur ${nom} — ${suite.dit}`);
            chrono.rater(issue);
            await prise.lacher({ number: issue, labels: [...ticket.labels, LABEL_TAKEN] });
            liberee = suite.suite === "liberee";
            return;
          }
          fait = suite;
        }
      }
      if ("bloque" in fait) {
        // Il lui manquait des commits de la base, et la station l'a fusionnée
        // dans sa branche — ou ouvert le `fix` qu'elle attend : le ticket
        // repart à un cook, jamais au chef (#3001).
        if (fait.miseAJour !== undefined && fait.miseAJour.etat !== "deja") {
          const { dit } = await apresLaMiseAJour(github, { station: nom, ticket: issue, base, branche: brancheDuTicket(issue), question: fait.bloque, miseAJour: fait.miseAJour });
          avertir(`brigade : #${issue} sur ${nom} — the cook stopped on commits of \`origin/${base}\` missing from its branch: ${dit}`);
          chrono.rater(issue);
          await prise.lacher({ number: issue, labels: [...ticket.labels, LABEL_TAKEN] });
          liberee = true;
          return;
        }
        // Les gates ne se jouent pas sur cette station : le ticket va à une
        // autre station du projet, et celle-ci ne le reprend plus (#3057).
        if (gatesInjouables(fait.bloque)) {
          const vers = await routerAilleurs(issue, fait.bloque);
          avertir(
            vers.length > 0
              ? `brigade : #${issue} sur ${nom} — the cook stopped: this station cannot run the ticket's gates; the ticket goes to another station of the project (${vers.join(", ")}), not to the chef`
              : `brigade : station ${nom} cannot run the gates of #${issue}, and no other station of the project can: the ticket stays on the rail, held on this station, until it is fixed — ${fait.bloque.trim().split("\n")[0] ?? ""}`,
          );
          chrono.rater(issue);
          await prise.lacher({ number: issue, labels: [...ticket.labels, LABEL_TAKEN] });
          liberee = true;
          return;
        }
        // Il bâtit sur le travail pas encore mergé d'un ticket ouvert : il
        // l'attend sur le rail, jamais dans la TODO du chef (#2968).
        const attendus = attendusDuBlocage(fait.bloque, issue, ouvertsDuTour);
        if (attendus.length > 0) {
          avertir(`brigade : #${issue} sur ${nom} — the cook stopped on the unmerged work of ${attendus.map((n) => `#${n}`).join(", ")}: the ticket waits for it on the rail, not for the chef`);
          await github.commenter(issue, corpsDeLAttente({ station: nom, attendus, question: fait.bloque }));
          // Si cette attente referme une boucle, la cuisine la défait aussitôt (#3477).
          await defaireLesBoucles(github, issue, ticketsDuTour).catch((erreur: unknown) => avertir(`brigade : #${issue} sur ${nom} — wait loop not checked: ${message(erreur)}`));
          chrono.rater(issue);
          await prise.lacher({ number: issue, labels: [...ticket.labels, LABEL_TAKEN] });
          liberee = true;
          return;
        }
        // Il dit que le ticket ne se fait pas avant une date, ou qu'il attend un tiers hors de la cuisine : le ticket est
        // parqué, sans geste du chef, et ne tient plus sa zone ; il reprend seul où il était à sa date (#3814, #4129).
        const attenteDite = lireAttenteDuCook(fait.bloque, new Date(instant()));
        // Le geste qui échoue laisse la question au manager, comme avant : rien n'est perdu.
        const enWaiting =
          attenteDite !== null &&
          (await mettreEnAttenteParLaCuisine(github, issue, attenteDite, { station: nom, mots: fait.bloque }).then(
            () => true,
            (erreur: unknown) => (avertir(`brigade : #${issue} sur ${nom} — the cook said it cannot be done yet, but the ticket could not be parked: its question goes to the manager — ${message(erreur)}`), false),
          ));
        if (attenteDite !== null && enWaiting) {
          avertir(`brigade : #${issue} sur ${nom} — the cook said it cannot be done yet: the ticket is parked, waiting for ${attenteDite.who}, resuming on ${attenteDite.followUp.slice(0, 10)}`);
          chrono.rater(issue);
          chrono.oublier(issue);
          await prise.lacher({ number: issue, labels: [...ticket.labels, LABEL_TAKEN] });
          liberee = true;
          return;
        }
        // Toute autre question va au manager, jamais au chef directement (#2894).
        const suite = await confierAuManager(ticket, fait.bloque);
        if (typeof suite === "string") {
          chrono.rater(issue);
          await prise.lacher({ number: issue, labels: [...ticket.labels, LABEL_TAKEN] });
          liberee = suite === "liberee";
          return;
        }
        fait = suite;
      }
      // Un constat écrit, que les critères du ticket admettent pour tout
      // livrable, le sert (#2854) : il est posté sur l'issue, qui est fermée.
      // Compté pour un échec, chaque cook juste le menait à `served-elsewhere`.
      if ("constat" in fait) {
        avertir(`brigade : #${issue} sur ${nom} — the cook committed nothing and delivered a written finding, which the ticket's acceptance criteria accept: it is posted and the ticket is closed`);
        await github.commenter(issue, `${MARQUE_DE_CONSTAT} -->\nStation \`${nom}\`: the cook committed nothing and delivered a written finding, which this ticket's acceptance criteria accept as its outcome. The ticket is closed with it; reopen it if the finding does not answer it.\n\n${fait.constat}`);
        await github.fermerIssue(issue);
        await servir(issue, ticket.labels, ticket.title);
        await prise.lacher({ number: issue, labels: [...ticket.labels, LABEL_TAKEN] });
        liberee = true;
        return;
      }
      // Le ticket est déjà satisfait sur la base, la station l'a vérifié : il est
      // servi, fermé avec le commit qui l'a satisfait, sans échec compté (#3146).
      if ("dejaServi" in fait) {
        const { sha, sujet } = fait.dejaServi;
        avertir(`brigade : #${issue} sur ${nom} — the cook committed nothing: the ticket is already satisfied on \`${base}\` by ${sha.slice(0, 7)}, which the station checked (on the branch, gates green): it is closed as served`);
        await github.commenter(issue, `${MARQUE_DEJA_SERVI} sha=${sha} -->\nStation \`${nom}\`: the ticket was already satisfied on \`${base}\` — commit \`${sha}\`${sujet === "" ? "" : ` (${sujet})`}. The station checked that this commit is on \`${base}\` and that the project's gates are green there. The ticket is closed as served; no failed cook is counted. Reopen it if it is not satisfied.\n\nThe cook's statement:\n\n${fait.affirmation}`);
        await github.fermerIssue(issue);
        await servir(issue, ticket.labels, ticket.title);
        await prise.lacher({ number: issue, labels: [...ticket.labels, LABEL_TAKEN] });
        liberee = true;
        return;
      }
      // Un cook qui s'arrête dans ses premiers tours après un renvoi, sans rien
      // ajouter, n'a pas travaillé sur les remarques : ce n'est pas un essai,
      // mais sans progrès il ne boucle pas sans fin — au-delà de `ECHECS_MAX`
      // arrêts de ce genre, il compte (#2508).
      if ("subi" in fait && fait.court === true) {
        const deja = (await depuisLeRelancement(github, issue, await github.commentaires(issue).catch(() => []), MARQUE_D_ATTENTE)).filter((c) => c.body.includes(" court ")).length;
        if (deja + 1 >= ECHECS_MAX) fait = { echec: `the cook added nothing since its last delivery, ${deja + 1} times in a row without working on the review's remarks (${fait.subi})` };
      }
      // Une PR en conflit ou rouge que le cook n'a pas fait avancer n'est pas
      // un cook raté : le travail reste, le ticket est rendu sans compter (#2454).
      // Un arrêt que le cook n'a pas causé — quota, limite GitHub, station
      // relancée, process tué — n'est pas un de ses essais non plus : le ticket
      // attend, puis repart, sans `served-elsewhere` (#2508).
      // Rien ajouté, et la CI rouge sur les mêmes checks : un essai raté, qui compte ; au second de suite, le ticket va au superviseur (#4007).
      if ("reste" in fait && fait.rouges !== undefined && fait.rouges.length > 0) fait = { echec: `the cook added nothing, and the CI of its PR is still red on ${fait.rouges.join(", ")}` };
      // Sa station s'arrête — une mise à jour la relance — : son cook lui survit,
      // et le ticket reste pris. La station relancée le reprend à son premier tour (#4401).
      if ("subi" in fait && arretee) {
        avertir(`brigade : #${issue} sur ${nom} — the station stops, the ticket stays taken for its restart: ${fait.subi}`);
        return;
      }
      if ("reste" in fait || "subi" in fait) {
        if ("subi" in fait) {
          const demain = instant() + ATTENTE_MAX_MS;
          const reprise = Math.min(demain, Math.max(instant() + ATTENTE_MS, fait.retour?.getTime() ?? 0));
          avertir(`brigade : #${issue} sur ${nom} — the cook stopped without a delivery, through no fault of its own: ${fait.subi}`);
          // Rendu pour la charge (`charge`, posé par les gates de `stationDuDepot`) : son attente se lève dès qu'elle tombe.
          if ((fait as { charge?: boolean }).charge === true) railDeLaCharge.remettre(issue);
          await github.commenter(issue, `${MARQUE_D_ATTENTE} until=${reprise}${fait.court === true ? " court " : " "}-->\nStation \`${nom}\`: the cook stopped without a delivery — ${fait.subi}\n\nThis stop is not the cook's doing: it is not counted among the ticket's ${ECHECS_MAX} tries. The ticket waits until ${new Date(reprise).toISOString()}, then is retried.`);
        } else {
          await github.commenter(issue, `Station \`${nom}\`: the cook added nothing, and the delivery still has work left — ${fait.reste}. The ticket is given back; this is not counted as a failed cook.`);
        }
        // Sans livraison, ce cook compte au temps du ticket comme un cook raté (#2662).
        chrono.rater(issue);
        await prise.lacher({ number: issue, labels: [...ticket.labels, LABEL_TAKEN] });
        liberee = true;
        return;
      }
      // Le même ticket qui rate cook après cook ne repart pas sans fin : à
      // `ECHECS_MAX` cooks sans livraison, il sort de la cuisine (#2209).
      // Illisibles, ses commentaires ne retiennent pas le rendu : l'échec compte pour un.
      // Compté depuis le dernier retrait de `served-elsewhere` (#2430).
      const lus = await github.commentaires(issue).catch(() => null);
      const precedents = await depuisLeRelancement(github, issue, lus ?? [], MARQUE_D_ECHEC);
      // Seuls les runs échoués comptent vers la mise de côté : un run fini `ok` sans livraison est relancé (#3652).
      const fini = "fini" in fait && fait.fini === true;
      // Le compte total, lui, ne repart jamais de zéro (#4217) : ni une prise, ni une réécriture du manager, ni une passe
      // du superviseur ne le remettent à zéro. À `ESSAIS_AU_TOTAL`, le ticket s'arrête pour de bon. Illisible, le compte
      // ne se dit pas (`n` manque) et n'arrête rien : le prochain échec le relit.
      const auTotal = lus === null ? null : essaisDuTicket(lus);
      const tentes = auTotal === null ? null : [...auTotal.depuisLArret, ...(fini ? [] : [fait.echec])];
      const auBout = tentes !== null && tentes.length >= ESSAIS_AU_TOTAL;
      const essais = [...precedents.map((c) => ({ motif: motifDe(c.body), runOk: runFiniOk(c.body) })), { motif: fait.echec, runOk: fini }];
      const echoues = runsEchoues(essais);
      const echecs = echoues.length;
      // Hors cuisine après `ECHECS_MAX` arrêts de suite, ou dès que deux de suite ont le même motif (#2729).
      // Un cook fini `ok` dont la livraison est refusée en sort dès ce refus :
      // relancé tel quel, le suivant finit pareil — quinze cooks sur
      // benomite/secondes#48, chacun d'un motif différent par son dernier
      // message (#3651). Le manager le reprend, ou le chef lit ce refus.
      // Les runs finis `ok` ne comptent pas parmi les échecs (#3652).
      const sortie = fini || horsCuisine(essais.filter((essai) => !essai.runOk).map((essai) => ({ motif: essai.motif, desaccord: false })));
      // Ses essais épuisés, le ticket va au manager, pas au chef (#3513).
      const suite = sortie && !auBout ? await apresLesEssais(ticket, echoues) : null;
      const tete = depart === null ? null : await github.prDuTicket(issue).then((pr) => (pr?.state === "open" ? pr.sha : null), () => null);
      avertir(`brigade : #${issue} sur ${nom} — the cook stopped without a delivery (${fini ? "its run ended ok, not counted" : `try ${echecs}/${ECHECS_MAX}`}): ${fait.echec}`);
      await github.commenter(
        issue,
        `${MARQUE_D_ECHEC}${auTotal === null ? "" : ` n=${auTotal.total + 1}`}${fini ? ` ${RUN_OK}` : ""}${avecLaTete(tete === depart ? tete : null)} -->\nStation \`${nom}\`: the cook stopped without a delivery — ${fait.echec}${detailDesGates(fait)}${auBout ? `\n\nIts ${tentes.length} tries in total are spent: the ticket stops for good, parked for the chef — the comment below lists what was tried.` : suite === null ? "" : "auChef" in suite ? `\n\n${fini ? `Parked (\`${LABEL_PARKED}\`) at this refusal: the cook finished \`ok\` and its delivery was refused, and another cook on the ticket as it stands would end the same way. It waits for the supervisor, who takes it and decides what happens to it.` : `Parked (\`${LABEL_PARKED}\`) by its failure count ${direLaMiseDeCote(echoues)}: it waits for the supervisor, who takes it and decides what happens to it.`}\n\n${suite.auChef}` : fini ? `\n\nThe cook finished \`ok\` and its delivery was refused: the ticket is not relaunched as it stands. It went to the manager, not to the chef — its comment below says what it did.` : `\n\nIts ${echecs} tries are spent: the ticket went to the manager, not to the chef — its comment below says what it did.`}`,
      );
      chrono.rater(issue);
      if (auBout) {
        chrono.oublier(issue);
        avertir(`brigade : #${issue} sur ${nom} — its ${tentes.length} tries in total are spent: it stops for good, parked for the chef`);
        await arreterPourDeBon(github, issue, nom, tentes);
      } else if (suite !== null && "auChef" in suite) {
        chrono.oublier(issue);
        await arreterLaBoucle(issue, [...echoues, ...(fini ? [fait.echec] : [])]);
      } else if (suite !== null) {
        await direLaReprise(issue, suite);
      }
      await prise.lacher({ number: issue, labels: [...ticket.labels, LABEL_TAKEN] });
      liberee = true;
    } catch (erreur) {
      avertir(`brigade : #${issue} sur ${nom} — ${message(erreur)}`);
      aRendre.set(issue, ticket);
    } finally {
      enVol.delete(issue);
      // Rendu sans livraison, le ticket a libéré sa place : le suivant du rail
      // la prend à un tour tout de suite, pas à l'intervalle, jusqu'à deux
      // minutes plus loin, compté à son attente d'une prise (#2802).
      if (liberee) station.presser?.(true);
    }
  };

  // Renvoie au cook une livraison rouge ou refusée : la raison s'écrit sur
  // l'issue, que le cook lit, et `in-pass` tombe — le ticket redevient libre, et
  // la station qui le prend reprend sa branche, sous sa PR. Au troisième
  // refus de sa vie, il est mis de côté pour le chef (`essais/`, #4226).
  // Un ticket renvoyé sort du pass dans le tour même : il ne compte plus pour le plafond.
  const renvoyes = new Set<number>();
  // La tête de chaque PR en conflit dont la station a déjà tenté la synchro (#2726).
  const synchrosTentees = new Map<number, string>();
  // `fois` : les renvois que cette tête peut porter — plus d'un quand la pass a
  // refusé la réponse du cook sur la même tête (#2592).
  // `genre` : pourquoi la livraison revient, dit en une ligne sur le commentaire
  // de mise de côté. Un renvoi pour conflit avec la base ne mange pas le budget
  // du cook (la base bouge sous la PR sans que le cook y soit pour rien) : il a
  // le sien, et avant de sortir le ticket pour conflit la station resynchronise
  // une dernière fois (`resynchroniser`) — seul un vrai conflit de contenu sort (#2726).
  // La carte qui retenait sa livraison pour le chef n'attend plus rien de
  // lui : elle quitte TODO tout de suite (#3332). Une fermeture qui échoue se
  // dit ; la carte suivante la fermera, comme avant.
  const fermerLesCartesDuRenvoi = async (numero: number) => {
    for (const sorte of [DESIGN, SENSIBLE]) {
      try {
        await fermerLaCarteDepassee(sorte, github, numero);
      } catch (erreur) {
        avertir(`brigade : #${numero} sur ${nom} — its “${sorte.titre}” card could not be closed after the send-back, the next sweep of the cards closes it: ${message(erreur)}`);
      }
    }
  };
  const renvoyer = async (ticket: TicketLu, sha: string, raison: string, fois = 1, genre: "conflict" | "red CI" | "review" = "review", resynchroniser?: () => Promise<boolean>) => {
    const lus = await github.commentaires(ticket.number);
    const tous = lus.filter((c) => c.body.startsWith(MARQUE_DE_RENVOI) || estUnParc(c));
    // Compté par ticket sur toute sa vie (#3961, #4226) : ni une relance, ni une
    // prise, ni la reprise du manager, ni un redémarrage ne le remet à zéro.
    const tousRenvois = lus.filter((c) => c.body.startsWith(MARQUE_DE_RENVOI));
    const enConflit = tousRenvois.filter((c) => c.body.includes(MARQUE_DE_CONFLIT));
    const renvois = genre === "conflict" ? enConflit : tousRenvois.filter((c) => !c.body.includes(MARQUE_DE_CONFLIT));
    // Une tête déjà renvoyée ne l'est pas deux fois : la liste des tickets lue
    // sous ETag peut porter encore `in-pass` un tour de plus (#2189, 23:07).
    // Mais il doit quitter le pass : si le retrait de \`in-pass\` avait échoué
    // (GitHub qui limite ses appels), il se refait, sans second commentaire (#2319).
    if (tous.filter((c) => c.body.includes(` sha=${sha} `)).length >= fois) {
      if (ticket.labels.includes(LABEL_IN_PASS)) await github.delabelliser(ticket.number, LABEL_IN_PASS);
      return;
    }
    const motifDit = ligneDuMotif(genre, raison);
    // Le troisième refus de sa vie met le ticket de côté pour le chef (#4226) : ni manager, ni quatrième cook. La carte
    // de validation qu'il tenait se ferme d'abord, pour que sa fermeture ne lève pas la carte de la mise de côté.
    if (genre !== "conflict" && ticketRefusals(lus).length + 1 >= ESSAIS_MAX) {
      await fermerLesCartesDuRenvoi(ticket.number);
      await parquer(github, ticket, { station: nom, sha, raison, rouges: () => checksRougesDits(sha), motif: motifDit });
      chrono.oublier(ticket.number);
      await github.delabelliser(ticket.number, LABEL_IN_PASS);
      renvoyes.add(ticket.number);
      return;
    }
    const deja = renvois.length;
    const marque = genre === "conflict" ? MARQUE_DE_CONFLIT : "";
    // Rendu deux fois de suite pour le même résultat, il ne repart pas une troisième fois de la même façon (#3814) : ce
    // résultat dit une attente hors de la cuisine — pas avant une date, un tiers —, il est parqué ; sinon ses renvois
    // sont épuisés, il va au manager, qui le reprend autrement, ou il est parqué avec sa raison en une ligne.
    const precedent = genre === "review" ? renvois.at(-1) : undefined;
    const memeResultat = precedent !== undefined && memeRenvoi(precedent.body, raison, new Date(instant()));
    const attenteDite = memeResultat ? lireAttenteDuCook(raison, new Date(instant())) : null;
    if (attenteDite !== null) {
      // Le parking d'abord : s'il échoue, aucun renvoi n'est écrit pour cette tête, et le tour suivant le refait.
      await mettreEnAttenteParLaCuisine(github, ticket.number, attenteDite, { station: nom, mots: raison });
      await github.commenter(ticket.number, `${MARQUE_DE_RENVOI} n=${tousRenvois.length + 1} sha=${sha}${marque} -->\nStation \`${nom}\`: handed back twice in a row with the same result — ${raison}\n\n${motifDit}\n\nNot relaunched a third time: this result says the ticket cannot be done yet, so it is parked, waiting for ${attenteDite.who}, and resumes where it was on its own on its date (comment above).`);
      avertir(`brigade : #${ticket.number} sur ${nom} — handed back twice with the same result, which says it cannot be done yet: parked, resuming on ${attenteDite.followUp.slice(0, 10)}`);
      chrono.oublier(ticket.number);
    }
    if (attenteDite === null && deja >= RENVOIS_MAX && resynchroniser !== undefined && (await resynchroniser())) {
      // La base a bougé depuis : la synchro passe, la PR n'est plus en conflit.
      if (ticket.labels.includes(LABEL_IN_PASS)) await github.delabelliser(ticket.number, LABEL_IN_PASS);
      return;
    }
    // Ses renvois épuisés, le ticket va au manager, pas au chef (#3513).
    const epuise = attenteDite === null && (deja >= RENVOIS_MAX || memeResultat) && genre !== "conflict";
    const suite = epuise ? await apresLesEssais(ticket, [...renvois.map((c) => motifDe(c.body)), raison.split("\n")[0] ?? ""], { livraisonGardee: true }) : null;
    const pourquoi = memeResultat ? `handed back twice in a row with the same result — ${(raison.split("\n")[0] ?? "").replace(/[.\s]+$/, "")}` : `after ${deja} sends back`;
    if (attenteDite !== null) {
      // Parqué : le commentaire et le label sont posés.
    } else if (suite !== null && "auChef" in suite) {
      await github.commenter(ticket.number, `${MARQUE_DE_RENVOI} n=${tousRenvois.length + 1} sha=${sha}${marque} -->\nStation \`${nom}\`: still not mergeable after ${deja} sends back — ${raison}\n\n${motifDit}\nParked (\`${LABEL_PARKED}\`) by its failure count ${pourquoi}: it waits for the supervisor, who takes it and decides what happens to it.\n\n${suite.auChef}`);
      await parquerSesEchecs(github, ticket.number, raison, undefined, new Date(instant()), avertir);
      chrono.oublier(ticket.number);
    } else if (suite !== null) {
      await github.commenter(ticket.number, `${MARQUE_DE_RENVOI} n=${tousRenvois.length + 1} sha=${sha}${marque} -->\nStation \`${nom}\`: still not mergeable after ${deja} sends back — ${raison}\n\n${motifDit}\nIts tries are spent${memeResultat ? " (handed back twice in a row with the same result: not relaunched a third time as it stands)" : ""}: the ticket went to the manager, not to the chef — its comment below says what it did.`);
      await direLaReprise(ticket.number, suite);
    } else {
      await github.commenter(ticket.number, `${MARQUE_DE_RENVOI} n=${tousRenvois.length + 1} sha=${sha}${marque} -->\nStation \`${nom}\`: sent back to a cook (${genre === "conflict" ? `${deja + 1}, conflicts` : `${deja + 1}/${RENVOIS_MAX}`}) — ${raison}\n\n${motifDit}`);
    }
    await github.delabelliser(ticket.number, LABEL_IN_PASS);
    renvoyes.add(ticket.number);
    await fermerLesCartesDuRenvoi(ticket.number);
    // De retour en cuisine : le temps jusqu'au cook suivant est celui du renvoi (#2662).
    if (attenteDite === null && (!epuise || (suite !== null && !("auChef" in suite) && !suite.question))) chrono.marquer(ticket.number, "renvoi");
  };

  // Les checks rouges du commit, tels que le renvoi les nomme : chacun avec les
  // étapes en échec de son job (#3028), et `brigade/gates` — les gates qu'une
  // station joue sur un projet sans CI sur ses PR — avec ce qui les a fait
  // rougir, que son statut résume (#3157). Illisibles, elles ne retiennent pas le
  // renvoi : le check est nommé sans elles, comme avant. GitHub qui limite ses
  // appels se dit comme ailleurs dans le tour.
  const etapesDesGates = async (sha: string) => {
    const echec = github.statuts === undefined ? null : echecDesGates(await github.statuts(sha, CONTEXTE_DES_GATES));
    return echec === null ? [] : [echec];
  };
  const checksRougesDits = async (sha: string) =>
    Promise.all(
      (await github.ci(sha))
        .filter((check) => check.outcome === "red")
        .map(async (check) => {
          let etapes: string[] = [];
          try {
            etapes = check.name === CONTEXTE_DES_GATES ? await etapesDesGates(sha) : ((await github.etapesEnEchec?.(check)) ?? []);
          } catch (erreur) {
            if (erreur instanceof LimiteGitHubAtteinte) throw erreur;
            avertir(`brigade : failed steps of \`${check.name}\` on ${sha.slice(0, 7)} unreadable on ${nom} — ${message(erreur)}`);
          }
          return checkRougeDit(check.name, etapes);
        }),
    );

  // Le second juge de la tête d'une livraison qui touche à ce qui la juge
  // (#2555) : son verdict s'il l'a déjà rendu sur cette tête, sinon il est
  // lancé — une fois la branche à jour de sa base et la CI verte sur sa tête,
  // pour ne juger qu'une tête qui peut se merger. Null tant qu'elle ne l'est
  // pas : \`fusionner\` la met à jour, attend sa CI ou la renvoie, et ne la
  // merge pas sans lui. \`sans-juge\` : la station n'en lance aucun, dit une
  // fois par tête.
  const sansSecondJuge = new Map<number, string>();
  const sansConsigne = new Set<string>();
  const MARQUE_SANS_CONSIGNE = "<!-- brigade:second-juge-sans-consigne";
  const passerLeSecondJuge = async (ticket: TicketLu, pr: PRAFusionner, juges: string[], sienne: { fichiers: string[] } | undefined): Promise<{ jugement: Jugement; lance: boolean } | "sans-juge" | null> => {
    const rendu = secondJugementDe(await github.commentaires(pr.number), pr.sha);
    if (rendu !== null) return { jugement: rendu, lance: false };
    if (pr.enRetard || ciDeLaTete(await github.ci(pr.sha), ciDesPR(sienne)) !== "green") return null;
    if (options.jugerEnSecond === undefined) {
      if (sansSecondJuge.get(pr.number) !== pr.sha) avertir(`brigade : PR #${pr.number} (#${ticket.number}) changes what judges it and waits for a second judge, which station ${nom} does not launch`);
      sansSecondJuge.set(pr.number, pr.sha);
      return "sans-juge";
    }
    chrono.marquer(ticket.number, "revue");
    let jugement: Jugement;
    try {
      jugement = await options.jugerEnSecond(ticket, pr, juges);
    } catch (erreur) {
      if (!(erreur instanceof ConsigneIllisible)) throw erreur;
      // Sans consigne, pas de second juge, donc pas de merge : dit une fois
      // dans la file du projet, pas à chaque tour.
      const marque = `${MARQUE_SANS_CONSIGNE} sha=${pr.sha} -->`;
      if (!sansConsigne.has(pr.sha)) {
        sansConsigne.add(pr.sha);
        if (!(await github.commentaires(ticket.number)).some((c) => c.body.includes(marque))) {
          await github.commenter(ticket.number, `${marque}\nStation \`${nom}\` cannot run the second judge of PR #${pr.number} on \`${pr.sha.slice(0, 7)}\`: its brief cannot be read at \`${erreur.chemin}\`. The delivery is not merged without it; it waits until the station is fixed.`);
        }
      }
      return "sans-juge";
    }
    chrono.marquer(ticket.number, "ci");
    await github.commenter(pr.number, corpsDuSecondJugement(nom, pr.sha, jugement));
    return { jugement, lance: true };
  };

  // Les PR externes que la station sert, hors du tour comme une relecture, une
  // à la fois ; et les têtes dont le service a échoué, retentées sur une tête
  // neuve ou `RELANCE_DES_GATES_MS` passé.
  const externesEnCours = new Map<number, Promise<void>>();
  const externesEcartees = new Map<number, { sha: string; jusqua: number }>();
  const servirLesExternes = async () => {
    const service = options.externes;
    const { prsExternes, remplacerCommentaire, issue } = github;
    if (service === undefined || prsExternes === undefined || remplacerCommentaire === undefined || issue === undefined || externesEnCours.size > 0) return;
    const pr = (await prsExternes.call(github)).find((lue) => {
      const ecartee = externesEcartees.get(lue.number);
      return ecartee === undefined || ecartee.sha !== lue.sha || instant() >= ecartee.jusqua;
    });
    if (pr === undefined) return;
    const servie = (async () => {
      try {
        const fait = await servirLaPRExterne(pr, {
          github: {
            commentaires: (numero) => github.commentaires(numero),
            commenter: (numero, corps) => github.commenter(numero, corps),
            remplacerCommentaire: remplacerCommentaire.bind(github),
            issue: issue.bind(github),
            labelliser: (numero, labels) => github.labelliser(numero, labels),
            delabelliser: (numero, label) => github.delabelliser(numero, label),
            ...(github.assigner === undefined ? {} : { assigner: github.assigner.bind(github) }),
          },
          station: nom,
          maintenant: () => new Date(instant()),
          juger: service.juger,
          // Une à la fois sur la station, avec celles des tickets : elles prennent la machine comme un cook.
          gates: (lue) => {
            const suite = serieDesGates.then(() => service.gates(lue));
            serieDesGates = suite.catch(() => undefined);
            return suite;
          },
          humains: service.humains,
        });
        // Servie, ou tenue par une autre : rien à refaire sur cette tête avant qu'elle ne bouge.
        externesEcartees.set(pr.number, { sha: pr.sha, jusqua: fait.issue === "tenue" ? instant() + RELANCE_DES_GATES_MS : Number.POSITIVE_INFINITY });
      } catch (erreur) {
        externesEcartees.set(pr.number, { sha: pr.sha, jusqua: instant() + RELANCE_DES_GATES_MS });
        avertir(`brigade : outside PR #${pr.number} not served on ${nom} — ${message(erreur)}; retried in ${RELANCE_DES_GATES_MS / 60_000} min, or on a new head`);
      } finally {
        externesEnCours.delete(pr.number);
      }
    })();
    externesEnCours.set(pr.number, servie);
  };

  // Les PR d'un projet sans CI sur elles se jugent sur ses gates, jouées sur
  // leur tête (#2456). Une PR que `prsOuvertes` ne liste pas, on ne sait pas ce
  // qu'elle change : sa CI est attendue.
  const ciDesPR = (sienne: { fichiers: string[] } | undefined) => sienne === undefined || (options.ciDesPR?.(sienne.fichiers) ?? true);
  // Les gates d'une tête, une à la fois sur la station : elles prennent la
  // machine comme un cook.
  let serieDesGates: Promise<unknown> = Promise.resolve();
  // Les têtes dont les gates ne se jouent pas ici, et jusqu'à quand : elles se
  // retentent sur une tête neuve, ou `RELANCE_DES_GATES_MS` passé — un clone
  // en retard, GitHub qui refuse le statut ne tiennent pas pour toujours. Une
  // tête dont une autre station joue les gates n'est relue qu'une fois sa
  // prise périmée : son verdict, lui, se lit dans la CI de la tête.
  const sansGates = new Map<number, { sha: string; jusqua: number }>();
  // Joue les gates de la tête de la PR, si personne ne l'a jugée ni ne les
  // joue ; rouges, ce qui a échoué s'écrit sur l'issue, que le cook lit. Rend
  // vrai si un verdict est posé : le tour suivant le lit.
  const jouerLesGates = async (ticket: TicketLu, pr: PRAFusionner): Promise<boolean> => {
    const { statuts, poserStatut } = github;
    const preparer = options.gates;
    const ecartee = sansGates.get(pr.number);
    if (preparer === undefined || statuts === undefined || poserStatut === undefined) {
      // Dit une fois par tête.
      if (ecartee?.sha !== pr.sha) avertir(`brigade : PR #${pr.number} (#${ticket.number}) has no CI and waits for the project's gates, which station ${nom} does not run`);
      sansGates.set(pr.number, { sha: pr.sha, jusqua: instant() + RELANCE_DES_GATES_MS });
      return false;
    }
    if (ecartee?.sha === pr.sha && instant() < ecartee.jusqua) return false;
    const ecarter = (motif: string) => {
      sansGates.set(pr.number, { sha: pr.sha, jusqua: instant() + RELANCE_DES_GATES_MS });
      avertir(`brigade : the gates of PR #${pr.number} (#${ticket.number}) are not run on ${nom} — ${motif}; retried in ${RELANCE_DES_GATES_MS / 60_000} min, or on a new head`);
      return false;
    };
    // Les gates de la tête sont une phase de la pass (#3512) : l'attente de leur
    // tour dans la série comprise ; jouées, le ticket attend de nouveau son merge.
    chrono.marquer(ticket.number, "gates");
    const suite = serieDesGates.then(() => jouerLesGatesDeLaTete(pr.sha, { github: { statuts: statuts.bind(github), poserStatut: poserStatut.bind(github) }, station: nom, preparer: () => preparer(ticket, pr), maintenant: instant }));
    serieDesGates = suite.catch(() => undefined);
    let fait: Awaited<typeof suite>;
    try {
      fait = await suite;
    } catch (erreur) {
      return ecarter(message(erreur));
    } finally {
      chrono.marquer(ticket.number, "ci");
    }
    if (fait.issue === "non-jouees") return ecarter(fait.motif);
    if (fait.issue === "tenues") sansGates.set(pr.number, { sha: pr.sha, jusqua: fait.jusqua });
    if (fait.issue !== "jouees") return false;
    if (!fait.verdict.vert) {
      await github.commenter(ticket.number, `Station \`${nom}\` ran the project's gates on \`${pr.sha.slice(0, 7)}\` (PR #${pr.number}) — no CI runs on this project's PRs — and they are red.${fait.verdict.detail === "" ? "" : `\n\n${fait.verdict.detail}`}`);
    }
    return true;
  };

  // Les cartes du chef (`chef-todo`) que le dégel a déjà relues (#3476).
  const cartesExaminees = new Set<number>();
  const tour = async () => {
    renvoyes.clear();
    retenuesDuTour.clear();
    // Une base rouge se relance au tour même (invariant 4, #4026), et se répare au run du superviseur (#3945).
    const checksDeLaBase = await github.checksDeLaBase();
    // La guérison (#2757) : un geste qui échoue est dit, et ne retient ni les
    // autres ni le tour. Le tour lit les tickets tels qu'elle les laisse.
    // Une issue que la station a ouverte sur la cuisine n'est pas un ticket du
    // projet, même lancée et calibrée : aucun cook ne la prend, rien du tour ne la
    // lit (#3620).
    const fires = (await github.fires()).filter((ticket) => !horsDesTickets(ticket.alerte));
    // La zone d'un ticket : la section `Zone` de son corps, et la ligne `zone`
    // de sa fiche — où le découpage l'écrit. Lue du corps seul, la zone d'un
    // ticket né d'une épique n'était jamais tenue : deux cooks partaient sur
    // les mêmes fichiers, et le second livré revenait en conflit (#2741). Une
    // fiche illisible, ou des commentaires que GitHub ne donne pas, ne font
    // pas foi : la zone est alors celle du corps.
    // Sans zone ni fiche — tout ticket qui ne naît pas d'une épique —, la zone
    // est faite des chemins que son corps nomme (`fichiersDuCorps`) : sans
    // elle, il ne tenait ni n'attendait rien, et ces tickets revenaient en
    // conflit avec la base (#2758). Un ticket que la station a ouvert (corps à
    // marque) nomme aussi ce qu'il ne doit pas toucher, et une fiche illisible
    // ne possède rien : ni l'un ni l'autre n'en tient.
    const zones = new Map<number, Promise<string[]>>();
    // Les fichiers suivis de la base, lus au premier besoin, une fois par tour.
    // Illisibles, la zone garde tous les chemins du corps, comme avant #2826 :
    // elle tient trop, elle ne laisse pas partir deux cooks sur un même fichier.
    let suivisDuTour: string[] | null | undefined;
    const fichiersSuivisDuTour = (): string[] | null => {
      if (suivisDuTour !== undefined) return suivisDuTour;
      try {
        // Une base sans un fichier suivi n'est pas lue : elle ne garderait aucun chemin.
        const lus = options.fichiersSuivis?.() ?? [];
        suivisDuTour = lus.length === 0 ? null : lus;
      } catch (erreur) {
        suivisDuTour = null;
        avertir(`brigade : the base's tracked files could not be read on ${nom} — a ticket with no declared zone holds every path its body names this turn: ${message(erreur)}`);
      }
      return suivisDuTour;
    };
    // Un ticket parti ne tient que sa zone, et non plus ses compagnons — les
    // fichiers partagés qu'aucune zone ne nomme (#2963). Toutes les zones de
    // l'app lues le 2026-11-11 avaient les mêmes (`app/src/vue/vue.js`,
    // `docs/app.md`) : chaque ticket de l'app attendait le merge du précédent,
    // et cinq d'entre eux ont attendu 883 min leur prise, un à la fois, quand
    // quatre écrans partis ensemble le même jour écrivaient tous `vue.js` sans
    // un renvoi pour conflit (#3250).
    // Les tickets pris à ce tour : la liste lue ne porte pas encore leur `taken`.
    const prisCeTour = new Set<number>();
    // Les tickets dont la fiche n'annonce aucune zone (#3509) : ils ne partent pas.
    const sansZone = new Set<number>();
    const zoneDuTicket = (numero: number): Promise<string[]> => {
      const deja = zones.get(numero);
      if (deja !== undefined) return deja;
      const lue = (async () => {
        const [corps, commentaires] = await Promise.all([github.corpsDuTicket(numero), github.commentaires(numero).catch(() => [])]);
        const laFiche = fiche(commentaires.map(({ body }) => body));
        const declaree = zoneDeclaree(corps, laFiche);
        if (zoneVide(laFiche, declaree) && !corps.startsWith("<!-- brigade:")) sansZone.add(numero);
        if (declaree.length > 0 || (laFiche?.problems.length ?? 0) > 0 || corps.startsWith("<!-- brigade:")) return declaree;
        const nommes = [...new Set(fichiersDuCorps(corps))];
        const suivis = fichiersSuivisDuTour();
        return suivis === null ? nommes : cheminsDuDepot(nommes, suivis);
      })();
      zones.set(numero, lue);
      return lue;
    };
    // Les PR ouvertes, lues une fois par tour, au premier qui les demande.
    let ouvertesDuTour: ReturnType<GitHubDuTour["prsOuvertes"]> | undefined;
    const prsOuvertesDuTour = () => (ouvertesDuTour ??= github.prsOuvertes());
    // Les invariants du rail (#4026), contrôlés avant tout geste du tour : une
    // base rouge relancée retient le reste du tour jusqu'au résultat de sa relance.
    const retenu = await controlerLesInvariants({
      station: nom,
      base,
      maintenant: new Date(instant()),
      github,
      tickets: fires,
      checksDeLaBase,
      enCuisine: (numero) => enVol.has(numero),
      prsOuvertes: prsOuvertesDuTour,
      zoneDuTicket,
      arreter: async (ticket, motifs) => {
        const suite = await apresLesEssais(ticket, motifs);
        if ("auChef" in suite) {
          await arreterLaBoucle(ticket.number, motifs);
          return `parked (\`${LABEL_PARKED}\`) with its reason: it waits for the supervisor, who takes it and decides what happens to it. ${suite.auChef}`;
        }
        await direLaReprise(ticket.number, suite);
        return "it went to the manager, not to the chef — its comment says what it did.";
      },
    });
    if (retenu) return;
    void nommerLaLivraison?.(checksDeLaBase);
    // Un ticket parqué jusqu'à une date passée reprend seul où il était (#4129, d'abord #3814) : `parked` retiré, il se
    // prend à ce tour, comme s'il n'avait pas attendu. Un geste qui échoue est dit ; le tour suivant réessaie.
    const leve = (numero: number) => fires.filter((ticket) => ticket.number === numero).forEach((ticket) => void (ticket.labels = ticket.labels.filter((label) => label !== LABEL_PARKED)));
    await ramenerALaRelance(github, fires, { station: nom, maintenant: new Date(instant()), avertir, leve }).catch((echec: unknown) => avertir(`brigade : the parked tickets past their date could not resume on ${nom} — ${message(echec)}`));
    const { tickets: gueris } = await guerir(fires, new Set(enVol.keys()));
    // Ce que l'ancien chemin du conflit avec la base a laissé — un ticket ouvert
    // pour changer la branche d'un autre, une carte qui demande un geste git au
    // chef — se défait avant que le tour ne lise ses tickets (#3476).
    const degel = await degelerLesConflits(github, { station: nom, base, tickets: gueris, enVol: new Set(enVol.keys()), examinees: cartesExaminees, avertir });
    const lus = gueris.filter(({ number }) => !degel.fermes.has(number)).map((ticket) => (degel.rendus.has(ticket.number) ? { ...ticket, labels: ticket.labels.filter((label) => label !== CHEF_TODO) } : ticket));
    // Les prises des enregistrements d'avant #2732, avant que le temps perdu ne les lise (#2870).
    if (clone !== undefined) await rattraperLesPrises(clone).catch((echec) => avertir(`brigade : the claims of the recent tickets could not be caught up on ${nom} — ${message(echec)}`));
    // Une épique découpée, ou un besoin dont un ticket lancé est né : ni elle
    // ne se prend, ni elle ne compte parmi les tickets du tour (#2618, #3479).
    // Un ticket mis de côté pour le chef à son troisième refus ne se prend ni ne se sert avant sa réponse (#4226).
    const tickets = horsDesBesoins(await keepParkedAside(lus.filter((ticket) => !estMisDeCote(ticket.labels)), github, avertir));
    ouvertsDuTour = new Set(tickets.map(({ number }) => number));
    ticketsDuTour = tickets;
    const libres: TicketLu[] = [];
    // Les tickets `taken` sans cook ici que la veille des orphelins a regardés à ce tour (#3883).
    const vusSansCookIci = new Set<number>();
    // Les PR ouvertes, lues au premier besoin, une fois par tour.
    let ouvertes: Awaited<ReturnType<GitHubDuTour["prsOuvertes"]>> | null = await fermerLesPRDesTicketsFermes(new Set(lus.map(({ number }) => number)), prsOuvertesDuTour).catch((echec) => {
      avertir(`brigade : the open PRs of closed tickets could not be listed on ${nom} — ${message(echec)}`);
      return null;
    });
    // Celles que les invariants ont lues à ce tour ; illisibles, la porte de zone les relit.
    ouvertes ??= (await ouvertesDuTour?.catch(() => null)) ?? null;

    // Les tickets dont le merge attend celui d'un autre (#4044) : lus au premier ticket en pass, une fois par tour.
    let retenusDuTour: Map<number, number[]> | undefined;
    const aineesDuTour = async (): Promise<Map<number, number[]>> => {
      if (retenusDuTour !== undefined) return retenusDuTour;
      try {
        const enPass = tickets.filter(({ labels }) => labels.includes(LABEL_IN_PASS)).map(({ number }) => number);
        const declarees = new Map<number, number[]>();
        for (const numero of enPass) declarees.set(numero, (await github.dependancesOuvertes(numero)).filter((autre) => autre !== numero && ouvertsDuTour.has(autre)));
        const fichiers = new Map((await github.prsOuvertes()).flatMap((pr) => (/^cook\/(\d+)-/.test(pr.branche) ? [[Number(/^cook\/(\d+)-/.exec(pr.branche)?.[1]), pr.fichiers] as const] : [])));
        const livraisons = await Promise.all(
          enPass.flatMap((numero) => {
            const siens = fichiers.get(numero);
            if (siens === undefined || ![...fichiers].some(([autre, a]) => autre !== numero && enPass.includes(autre) && a.some((f) => siens.includes(f)))) return [];
            return [(async () => ({ ticket: numero, fichiers: siens, enPassLe: (await github.entreeEnPass?.(numero).catch(() => null)) ?? null }))()];
          }),
        );
        retenusDuTour = ordreDeMerge({ declarees, livraisons });
      } catch (echec) {
        // Un ordre qui ne se lit pas ne retient rien : la pass sert comme avant.
        avertir(`brigade : the merge order of the tickets in pass could not be read on ${nom} — ${message(echec)}`);
        retenusDuTour = new Map();
      }
      return retenusDuTour;
    };

    await fermerLesCartesCaduquesDuTour().catch((echec) => avertir(`brigade : the validation cards without an object could not be swept on ${nom} — ${message(echec)}`));

    for (const ticket of tickets) {
      const enPass = ticket.labels.includes(LABEL_IN_PASS);
      const pr = enPass ? await github.prDuTicket(ticket.number) : null;
      if (pr !== null && pourLeChef.get(ticket.number) === pr.sha) retenuesDuTour.add(ticket.number);
      // La base ne gèle pas tout le pass : elle ne retient une livraison que
      // rouge sur un check que cette livraison doit elle-même passer (#2279).
      const etat = etatDuTicket({ state: ticket.state, labels: ticket.labels, pr }, null);
      // `in-pass` sur une issue ouverte dont la PR est mergée : la clôture a été
      // perdue (limite GitHub en plein tour, `Closes` sans effet) — n'importe
      // quelle station la reprend (#2467).
      if (enPass && ticket.state === "open" && pr !== null && pr.merged) {
        await cloreLeServi(ticket);
        continue;
      }
      // Parqué, à quelque étape qu'il soit — au backlog, en cuisson, en pass —, rien ne le prend ni ne le touche avant sa
      // date, son fait ou sa réponse : ni la prise, ni la pass, ni la purge de son `taken` (#4260). Ses labels d'étape
      // restent : il reprend exactement où il était.
      if (etat === "parked") continue;
      // Un ticket dont le merge attend celui d'un autre (#4044) — une dépendance déclarée encore ouverte, ou une livraison arrivée
      // avant la sienne à la pass sur un même fichier — n'est ni relu, ni mis à jour, ni mergé, ni renvoyé pour un conflit :
      // l'aîné servi ou fermé, il repart seul au tour qui suit.
      if (etat === "pass" && pr !== null && !pr.merged && ((await aineesDuTour()).get(ticket.number)?.length ?? 0) > 0) continue;
      // N'importe quelle station relit et merge : GitHub refuse un merge sur
      // une base qui a bougé, et le second de deux merges.
      if (etat === "pass" && pr !== null && pr.enConflit === true) {
        // En conflit avec la base : ni la mise à jour ni le merge ne passent, et
        // rien d'autre ne la débloque. Elle repart à un cook, qui la remet sur la
        // base (#2209).
        // La station la remet d'abord à jour elle-même : un conflit mécanique (la
        // base a bougé) se résout sans cook ni renvoi (#2726).
        const synchroniser = async () => {
          try {
            await github.mettreAJour(pr.number, pr.sha);
            return true;
          } catch {
            return false;
          }
        };
        try {
          if (synchrosTentees.get(pr.number) !== pr.sha) {
            synchrosTentees.set(pr.number, pr.sha);
            if (await synchroniser()) {
              chrono.marquer(ticket.number, "ci");
              continue;
            }
          }
          await renvoyer(ticket, pr.sha, `${RAISONS_DE_RENVOI.conflit}: merge the base into the branch, resolve the conflicts, run the gates, and commit`, 1, "conflict", synchroniser);
        } catch (erreur) {
          avertir(`brigade : pass de #${ticket.number} sur ${nom} — ${message(erreur)}`);
        }
        continue;
      }
      if (etat === "pass" && pr !== null) {
        // Une livraison qui touche à ce qui la juge (gates, CI) ne se merge pas
        // sur le seul verdict du reviewer : un cook pourrait s'y rendre vert
        // seul. Le second juge la relit une fois la relecture d'accord, et
        // c'est son approbation, avec une CI verte, qui la merge (#2555).
        ouvertes ??= await github.prsOuvertes();
        const sienne = ouvertes.find((ouverte) => ouverte.branche === brancheDuTicket(ticket.number));
        const juges = sienne?.fichiers.filter((fichier) => JUGES.some((juge) => fichier.startsWith(juge))) ?? [];
        // Un workflow qui ne tourne que sur la base (les tests Windows) n'a pas
        // de check sur la PR : rouge, il ne la retient pas.
        // La seule exception est la réparation de la base elle-même : elle doit la
        // débloquer, et sa CI, sur sa tête, reste exigée par `fusionner`.
        const siens = new Set((await github.ci(pr.sha)).map((check) => check.name));
        if (checksDeLaBase.some((check) => check.outcome === "red" && check.name !== undefined && siens.has(check.name)) && !estUneReparation(await github.corpsDuTicket(ticket.number), ticket.labels)) continue;
        // La relecture tourne hors du tour, comme un cook (#2329) : un `claude`
        // de plusieurs minutes ne retient plus les merges, les autres relectures
        // ni les prises. Les merges, eux, passent un à un.
        if (enRelecture.has(ticket.number) || enRelecture.size >= PASS_MAX) continue;
        const relireEtFusionner = async () => {
        // Le pass a bougé : un verdict neuf, un merge, une mise à jour, un refus,
        // un renvoi, ou une CI attendue sur une tête neuve (#2333).
        let bouge = false;
        let mergee = false;
        // Retenue pour la validation de son écran (#3184) : pas un refus de GitHub.
        let retenue = false;
        try {
          const rendu = await relire(pr, {
            github,
            station: nom,
            juger: async (lue) => {
              chrono.marquer(ticket.number, "revue");
              const jugement = await juger(ticket, lue);
              chrono.marquer(ticket.number, "ci");
              bouge = true;
              return jugement;
            },
          });
          // Approuvée, une livraison qui touche à ce qui la juge passe devant
          // le second juge ; refusée par lui, elle repart à un cook avec ses
          // raisons, comme une relecture qui demande des changements (#2555).
          if (juges.length > 0 && rendu?.verdict === "approve") {
            const second = await passerLeSecondJuge(ticket, pr, juges, sienne);
            if (second === "sans-juge") return;
            if (second?.lance) bouge = true;
            if (second?.jugement.verdict === "request-changes") {
              await renvoyer(ticket, pr.sha, `${RAISONS_DE_RENVOI.second}: ${second.jugement.motif}`, 1, "review");
              bouge = true;
              return;
            }
          }
          // Le chef a répondu sur le ticket à la question de sa validation
          // (#3616) : validée, la réponse gardée la laisse merger ; renvoyée,
          // elle repart à un cook avec son commentaire, et rien ne se merge.
          // Seule une livraison que la pass retient pour le chef porte une
          // question : les autres ne relisent pas leur ticket pour rien.
          if (pourLeChef.has(ticket.number) && (await agirSurLaReponse(github, ticket.number, pr)) === "sent-back") {
            bouge = true;
            return;
          }
          const tentee = JSON.stringify([pr.sha, pr.version ?? null, checksDeLaBase]);
          // Une livraison retenue pour le chef ne se retente sur la même tête
          // que quand le chef a répondu depuis : une réponse gardée de plus sur
          // le ticket (#3332). Ses commentaires se relisent sous ETag : un
          // ticket où rien n'a bougé coûte un 304, que GitHub ne compte pas.
          const retenueSur = (gardees: number) => `${tentee} retenue ${gardees}`;
          const deja = tentees.get(pr.number);
          const aRetenter = deja !== tentee && (deja === undefined || !deja.startsWith(`${tentee} retenue `) || deja !== retenueSur(await reponsesGardees([DESIGN, SENSIBLE], github, ticket.number, pr.number)));
          if (aRetenter) {
            // Le merge demandé à GitHub ouvre sa phase ; mergée, le temps du ticket s'écrit.
            const fusion = await enSerie(() =>
              fusionner(
                pr,
                {
                  commentaires: (numero) => github.commentaires(numero),
                  commenter: (numero, corps) => github.commenter(numero, corps),
                  mettreAJour: (numero, sha) => github.mettreAJour(numero, sha),
                  ci: (sha) => github.ci(sha),
                  merger: async (numero, sha) => {
                    // Rien de ce qui touche ses juges ne se merge sur une tête
                    // que le second juge n'a pas approuvée (#2555).
                    if (juges.length > 0 && secondJugementDe(await github.commentaires(numero), sha)?.verdict !== "approve") return { fait: false, motif: `the second judge has not approved \`${sha.slice(0, 7)}\`` };
                    // Une livraison dont le ticket est fermé ou la PR mergée ou fermée n'a rien à faire valider : pas de carte (#3390).
                    const sansObjet = await livraisonSansObjet(github, ticket.number, numero, brancheDuTicket);
                    if (sansObjet !== null) {
                      retenue = true;
                      return { fait: false, motif: `no card to validate: ${sansObjet}` };
                    }
                    // Une livraison design attend l'humain qui valide les designs du projet (#3184).
                    if (options.designsValidesParUnHumain?.() === true) {
                      const motif = await retenirLeDesign(github, { depot: options.depotServi, station: nom, ticket, pr: { number: numero, sha }, fichiers: sienne?.fichiers ?? null, chef: await chefAMentionner(), renvoyer: (raison) => renvoyer(ticket, sha, raison, 1, "review"), ...(options.jugerLeChoixDeDesign === undefined ? {} : { jugerLeChoix: (corps: string) => options.jugerLeChoixDeDesign!({ number: ticket.number, title: ticket.title, body: corps }, sienne?.fichiers ?? [], { number: numero, sha }) }) });
                      if (motif !== null) {
                        retenue = true;
                        return { fait: false, motif };
                      }
                    }
                    // Une carte de validation ouverte retient sa PR même si le réglage ne se lit plus ici (#3347).
                    else {
                      const carte = await carteEnAttenteDuChef(DESIGN, github, ticket.number, numero);
                      if (carte !== null) {
                        retenue = true;
                        return { fait: false, motif: `held for the chef's validation of its screen (card #${carte})` };
                      }
                    }
                    // Un ticket \`sensitive\` attend la revue du chef avant son merge (#3223).
                    const sensible = await retenirLeSensible(github, { depot: options.depotServi, station: nom, ticket, pr: { number: numero, sha }, chef: await chefAMentionner() }, () => avisDuChefALaBase(clone, base));
                    if (sensible !== null) {
                      retenue = true;
                      return { fait: false, motif: sensible };
                    }
                    chrono.marquer(ticket.number, "merge");
                    // Le merge est le geste de la pass : il passe par la porte de son niveau (#4039).
                    const mergerParLaPorte = async (): Promise<Merge> => {
                      const porte = station.porte ?? null;
                      if (porte === null) return github.merger(numero, sha);
                      const dit = { line: `merge PR #${numero} of #${ticket.number}`, reason: `its delivery is green on \`${sha.slice(0, 7)}\``, outcome: OUTCOME.FIXED_BY_SELF };
                      const passage = await porte.passer({ agent: "pass", reglable: "pass" }, dit, () => github.merger(numero, sha), (merge) => (merge.fait ? { ...dit, line: `merged PR #${numero} of #${ticket.number}` } : null));
                      if (passage.etat === "done") return passage.valeur;
                      // Attendu ou observé, il est retenu comme une livraison que le chef valide : il ne se retente pas sur la même tête.
                      retenue = true;
                      return { fait: false, motif: "held by the pass's autonomy level" };
                    };
                    // Un ticket qui dit le genre de son action (`action:<genre>`) passe par le classement du risque de la fiche du projet (#4230).
                    const genre = genreDuTicket(ticket.labels);
                    if (genre === null || (station.ficheDuProjet ?? null) === null) return mergerParLaPorte();
                    // Rangé `safe`, le merge passe par le niveau de la pass, comme avant. Parqué, c'est la réponse du chef qui le
                    // lance : il ne lui redemande pas son OK, et un merge qui échoue alors se dit. Ce merge direct tient à
                    // `lance.fusion`, posé après le retour de `soumettre` : la réponse du chef le trouve posé. Sans porte, l'item
                    // parqué reste en mémoire, que personne ne répondra : le `parquer` du pass le dit.
                    const lance: { fusion: Merge | null } = { fusion: null };
                    const issue = await passDuRisque.soumettre({
                      ticket: ticket.number,
                      genre,
                      description: `${genre} by merging PR #${numero} (\`${sha.slice(0, 7)}\`)`,
                      executer: async () => {
                        if (lance.fusion === null) {
                          lance.fusion = await mergerParLaPorte();
                          return;
                        }
                        const merge = await github.merger(numero, sha);
                        if (!merge.fait) avertir(`brigade : #${ticket.number} on ${nom} — the chef answered, but the merge of PR #${numero} did not go through: ${merge.motif}`);
                      },
                    });
                    if (issue === "executee" && lance.fusion !== null) return lance.fusion;
                    retenue = true;
                    lance.fusion = { fait: false, motif: "parked for the chef: its kind of action is ranked 'chef' in the project sheet" };
                    return lance.fusion;
                  },
                },
                { ciDesPR: ciDesPR(sienne) },
              ),
            );
            const attendue = fusion.issue === "ci-attendue" || fusion.issue === "gates-a-jouer";
            if (attendue || fusion.issue === "mise-a-jour") chrono.marquer(ticket.number, "ci");
            if (fusion.issue === "mergee") {
              mergee = true;
              await servir(ticket.number, ticket.labels, ticket.title);
              await cloreLeServi(ticket);
            }
            // Hors de la série des merges : des gates de plusieurs minutes ne retiennent pas les autres.
            if (fusion.issue === "gates-a-jouer" && (await jouerLesGates(ticket, pr))) bouge = true;
            if (attendue) {
              if (attendues.get(pr.number) !== tentee) bouge = true;
              attendues.set(pr.number, tentee);
            } else {
              attendues.delete(pr.number);
              if (fusion.issue !== "non-approuvee" && fusion.issue !== "close" && !retenue) bouge = true;
            }
            if (fusion.issue === "refusee" && retenue) pourLeChef.set(ticket.number, pr.sha);
            else pourLeChef.delete(ticket.number);
            if (fusion.issue === "refusee" && retenue) tentees.set(pr.number, retenueSur(await reponsesGardees([DESIGN, SENSIBLE], github, ticket.number, pr.number)));
            else if (fusion.issue === "refusee" || fusion.issue === "mise-a-jour") tentees.set(pr.number, tentee);
            else tentees.delete(pr.number);
            if (fusion.issue === "refusee" && !retenue) avertir(`brigade : merge of #${ticket.number} on ${nom} refused by GitHub — ${fusion.motif}; retried once its PR or the base changes`);
            // Rouge : la livraison repart à un cook, avec pourquoi (#2209).
            if (fusion.issue === "ci-rouge") await renvoyer(ticket, pr.sha, `${RAISONS_DE_RENVOI.ci} \`${pr.sha.slice(0, 7)}\`: ${(await checksRougesDits(pr.sha)).join(", ")}`, 1, "red CI");
          }
          // Refusée par la relecture sur sa tête : elle repart aussi (#2209).
          if (rendu !== null && rendu.verdict !== "approve" && rendu.sha === pr.sha) {
            const commentaires = await github.commentaires(pr.number);
            await renvoyer(ticket, pr.sha, `${RAISONS_DE_RENVOI.relecture}: ${motifDuVerdict(commentaires, rendu.commentaire)}`, renvoisDeLaTete(commentaires, pr.sha));
          }
        } catch (erreur) {
          avertir(`brigade : pass de #${ticket.number} sur ${nom} — ${message(erreur)}`);
        } finally {
          enRelecture.delete(ticket.number);
          // Mergée, elle libère ce qui retenait des tickets — une dépendance,
          // une zone tenue, une place du pass — : ils se prennent à un tour
          // tout de suite, pas 30 s plus loin (#2802).
          if (bouge || mergee) station.presser?.(mergee);
        }
        };
        enRelecture.set(ticket.number, relireEtFusionner());
      }
      // Libre : aucun état, et aucun label d'état — un `in-pass` dont la PR
      // vient d'être mergée n'est pas à reprendre.
      // Parqué — pour le chef (`chef-todo`) ou pour un autre (`parked`) —, il attend sa date, son fait ou sa réponse
      // (#2805, #4260) : rien ne le prend.
      if (etat === null && !enPass && !ticket.labels.includes(LABEL_TAKEN) && !estParque(ticket.labels)) libres.push(ticket);
      // Au premier tour, un `taken` sans cook ici est peut-être une prise
      // qu'un runtime d'avant a laissée : `lacher` ne rend que si c'est la sienne.
      // Son cook a survécu à ce runtime, et la prise est encore la sienne : il
      // est suivi jusqu'à sa fin, et le ticket fini comme si rien ne s'était arrêté (#4401).
      if (premierTour && ticket.labels.includes(LABEL_TAKEN) && !enPass && !enVol.has(ticket.number)) {
        const calibrage = calibrageDesLabels(ticket.labels);
        if (options.survivant?.(ticket.number) && complet(calibrage) && (await prise.prendre(ticket)).prise) {
          avertir(`brigade : #${ticket.number} sur ${nom} — its cook outlived the station's restart: the station follows it to its end`);
          enVol.set(ticket.number, cuire(ticket, calibrage, true));
        } else aRendre.set(ticket.number, ticket);
      }
      // À chaque tour, un `taken` que personne ne tient — le retrait d'un
      // lâcher a échoué, ici ou sur une autre station — perd son label : le
      // ticket redevient libre au tour suivant. Un ticket en pass, en vol ici
      // ou déjà à rendre n'est pas un orphelin.
      let purge = false;
      if (ticket.labels.includes(LABEL_TAKEN) && !enPass && !enVol.has(ticket.number) && !aRendre.has(ticket.number)) {
        try {
          purge = (await prise.purger?.(ticket)) === true;
        } catch (erreur) {
          avertir(`brigade : purge du \`taken\` de #${ticket.number} sur ${nom} — ${message(erreur)}`);
        }
      }
      // Tenu, sans cook sur aucune station ni attente vivante depuis plus de
      // 5 min : il perd `taken` et rentre sur le rail (#3883). Un ticket à
      // rendre est regardé dès le premier tour : rendu par sa station, il sort
      // de la veille ; tenu par une autre, son temps sans cook court déjà.
      // Illisible, il garde `taken` ce tour-ci, et le tour suivant le relit.
      if (ticket.labels.includes(LABEL_TAKEN) && !enPass && !enVol.has(ticket.number) && !purge) {
        vusSansCookIci.add(ticket.number);
        try {
          // Rendu, il ne tient plus sa zone dès ce tour : la porte de prise lit ses labels sans `taken`.
          if (await orphelins.voir(ticket)) ticket.labels = ticket.labels.filter((label) => label !== LABEL_TAKEN);
        } catch (erreur) {
          if (erreur instanceof LimiteGitHubAtteinte) throw erreur;
          avertir(`brigade : #${ticket.number} on ${nom} — a taken ticket with no cook here could not be checked for an orphan claim: ${message(erreur)}`);
        }
      }
    }
    orphelins.finirLeTour(vusSansCookIci);
    premierTour = false;
    // Les PR externes (#2933) : jamais mergées, servies hors du tour.
    try {
      await servirLesExternes();
    } catch (erreur) {
      if (erreur instanceof LimiteGitHubAtteinte) throw erreur;
      avertir(`brigade : the outside PRs could not be read on ${nom} — ${message(erreur)}`);
    }
    for (const [numero, ticket] of aRendre) {
      try {
        await prise.lacher({ number: numero, labels: [...new Set([...ticket.labels, LABEL_TAKEN])] });
        aRendre.delete(numero);
      } catch (erreur) {
        // GitHub refuse encore : le ticket garde sa place, le tour suivant réessaie.
        avertir(`brigade : rendre #${numero} sur ${nom} — ${message(erreur)}`);
        break;
      }
    }
    // Une zone tenue : un de ses chemins en recoupe un que change une PR
    // ouverte qui n'est pas celle du ticket, ou un de la zone d'un ticket en
    // cuisson, ici ou sur une autre station — un cook tient sa zone avant
    // d'avoir sa PR (#2741).
    // Le ticket d'une branche `cook/<n>-…` est fermé. Une branche sans numéro,
    // une issue que le client ne lit pas ou que la lecture manque : on ne sait
    // pas, la PR continue de tenir sa zone.
    const fermes = new Map<string, Promise<Fermeture | null>>();
    const fermetureDe = (branche: string): Promise<Fermeture | null> => {
      let lu = fermes.get(branche);
      if (lu === undefined) {
        lu = fermetureDuTicket(github.issue?.bind(github), branche);
        fermes.set(branche, lu);
      }
      return lu;
    };
    const ticketFerme = async (branche: string): Promise<boolean> => (await fermetureDe(branche)) !== null;
    // Les tickets en vol, ici ou ailleurs, sont tous nommés : le ticket les
    // attend tous (`attend`), et part au tour qui suit leur merge (#3509). Un
    // ticket en pass tient sa zone jusqu'à son merge, pas seulement les
    // fichiers que sa PR change.
    // Sauf une livraison que la pass retient pour le chef, sur la tête retenue
    // (`retenuesDuTour`) : elle attend un humain, pas la cuisine, et ne tient
    // pas plus sa zone qu'une place du pass (#3446). Tenue, le ticket qui la
    // recoupait attendait la réponse du chef : #3513, 282 min derrière la
    // livraison de #3560, pris 13 s après son merge, venu juste après la
    // réponse du chef sur la carte #3567 (#3677).
    const pourLeChefCeTour = (branche: string): boolean => {
      const numero = /^cook\/(\d+)-/.exec(branche)?.[1];
      return numero !== undefined && retenuesDuTour.has(Number(numero));
    };
    // Une épique ne tient pas de zone : sa livraison ouverte ne doit pas bloquer ses propres sous-tickets (#3932).
    // Un corps qui ne se lit pas ne l'en exempte pas : la zone reste tenue.
    const estUneEpique = async (branche: string): Promise<boolean> => {
      const numero = /^cook\/(\d+)-/.exec(branche)?.[1];
      if (numero === undefined) return false;
      return porteDesTachesDeTickets(await github.corpsDuTicket(Number(numero)).catch(() => ""));
    };
    // Ce que le ticket d'une PR `cook/<n>-…` dit de sa vie : en cuisine, ou au pass (#4242).
    // Un ticket que le tour n'a pas lu se relit ; illisible, il la garde vivante.
    const vieParSonTicket = async (branche: string): Promise<string | null> => {
      const numero = /^cook\/(\d+)-/.exec(branche)?.[1];
      if (numero === undefined) return null;
      const n = Number(numero);
      const labels = lus.find(({ number }) => number === n)?.labels ?? (await Promise.resolve(github.issue?.(n)).then((lu) => lu?.labels ?? [], () => null));
      if (labels === null) return `#${n} could not be read`;
      if (labels.includes(LABEL_IN_PASS)) return "at the pass";
      return labels.includes(LABEL_TAKEN) || enVol.has(n) || prisCeTour.has(n) ? "in cook" : null;
    };
    const tenue = async (ticket: TicketLu): Promise<{ branche: string; attente: AttenteDeZone; tenante?: undefined } | { branche: string; attente: null; tenante: { pr: PRDeLaPorte; pourquoi: string } } | null> => {
      const zone = await zoneDuTicket(ticket.number);
      if (zone.length === 0) return null;
      ouvertes ??= await github.prsOuvertes();
      const propre = brancheDuTicket(ticket.number);
      // Une PR dont le ticket est fermé ne tient plus de zone : personne ne la sert (#3096).
      let tenante: { pr: PRDeLaPorte; pourquoi: string } | undefined;
      for (const ouverte of ouvertes) {
        if (ouverte.branche === propre || !ouverte.fichiers.some((fichier) => zone.some((entree) => secoupent(entree, fichier)))) continue;
        if (pourLeChefCeTour(ouverte.branche)) continue;
        // Invariant 1 (#4026) : un ticket qu'aucun cook ne cuit et qui n'est pas en pass ne tient aucune zone, sa PR ouverte pas plus.
        if (!(await tientSaZone(ouverte.branche, { tickets: lus, enCuisine: (numero) => enVol.has(numero) || prisCeTour.has(numero), commentaires: (numero) => github.commentaires(numero) }))) continue;
        if (await ticketFerme(ouverte.branche)) continue;
        if (await estUneEpique(ouverte.branche)) continue;
        // Une PR oubliée ne tient plus la zone : elle n'est ni en cuisine, ni au pass, ni récente (#4242).
        const pourquoi = await vivante(ouverte, { maintenant: instant(), parSonTicket: () => vieParSonTicket(ouverte.branche) });
        if (pourquoi === null) {
          // Périmée, ou déjà marquée : le superviseur la marque `zone-released`, une fois, et demande au chef s'il faut fermer celle d'un humain (#4243).
          if (typeof ouverte.number === "number") perimee(ticket.number, { ...ouverte, number: ouverte.number });
          continue;
        }
        tenante = { pr: ouverte, pourquoi };
        break;
      }
      if (tenante) return { branche: tenante.pr.branche, attente: null, tenante };
      const enVolDuTour: EnVol[] = [];
      for (const autre of tickets) {
        if (autre.number === ticket.number || !(autre.labels.includes(LABEL_TAKEN) || autre.labels.includes(LABEL_IN_PASS) || enVol.has(autre.number) || prisCeTour.has(autre.number))) continue;
        if (retenuesDuTour.has(autre.number)) continue;
        // Un ticket qu'aucun cook ne cuit ici, qui n'est pas en pass et que nulle station ne tient — `taken` sans prise lisible — est en file : il ne tient aucune zone (#3966).
        // Une prise qui ne se lit pas le tient encore : dans le doute, la zone reste tenue.
        if (!autre.labels.includes(LABEL_IN_PASS) && !enVol.has(autre.number) && !prisCeTour.has(autre.number)) {
          const prise = await github.commentaires(autre.number).then((commentaires) => tenantDeLaPrise(commentaires, []) !== null).catch(() => true);
          if (!prise) continue;
        }
        enVolDuTour.push({ ticket: autre.number, zone: await zoneDuTicket(autre.number).catch(() => []) });
      }
      // Un ticket plus prioritaire qui attend cette zone la garde, même retenu lui-même :
      // à la place libérée, c'est lui qui la prend, pas un ticket de rang plus bas (#3974).
      // Un ticket qui ne partirait pas ce tour (capacité ou calibrage qui manque, ticket attendu, arrêt subi) ne la garde pas.
      for (const autre of libres) {
        if (autre.number === ticket.number || rangDePriorite(autre) >= rangDePriorite(ticket) || enVolDuTour.some((vol) => vol.ticket === autre.number)) continue;
        if (besoinsDuTicket(autre.labels).some((besoin) => !capacites.has(besoin)) || !complet(calibrageDesLabels(autre.labels))) continue;
        if ((await attenduMisDeCote(autre).catch(() => ({ attendu: autre.number, raison: "" }))) !== null) continue;
        if ((await defaireLesBoucles(github, autre.number, lus).catch(() => [autre.number])).length > 0) continue;
        if ((await enAttente(autre).catch(() => 0)) !== null) continue;
        enVolDuTour.push({ ticket: autre.number, zone: await zoneDuTicket(autre.number).catch(() => []) });
      }
      const attente = attenteDeZone(ticket.number, zone, enVolDuTour);
      return attente === null ? null : { branche: brancheDuTicket(attente.attend[0]!), attente };
    };
    // Le premier des tickets que la fiche du ticket attend qui soit mis de côté
    // (`served-elsewhere`) ou parqué, avec la ligne de raison de son départ.
    const attenduMisDeCote = async (ticket: TicketLu): Promise<{ attendu: number; raison: string } | null> => {
      const commentaires = await github.commentaires(ticket.number);
      // Une attente levée — boucle défaite, ou manager après une heure (#3764) — ne retient plus.
      const levees = leveesDesCommentaires(commentaires.map(({ body }) => body));
      for (const attendu of fiche(commentaires.map(({ body }) => body))?.waitsFor ?? []) {
        if (levees.has(attendu)) continue;
        const lu = lus.find(({ number }) => number === attendu);
        const label = [...MIS_DE_COTE, LABEL_PARKED, CHEF_TODO, ...LABELS_D_AVANT_PARKED].find((candidat) => lu?.labels.includes(candidat));
        if (label === undefined) continue;
        // Le dernier mot de la station sur ce ticket : la ligne qui suit sa marque.
        const dernier = (await github.commentaires(attendu)).map(({ body }) => body).filter((body) => body.startsWith(MARQUE_D_ECHEC) || body.startsWith(MARQUE_DE_RENVOI)).at(-1);
        const ligne = dernier?.split("\n").slice(1).find((l) => l.trim() !== "")?.trim();
        return { attendu, raison: ligne ?? `labelled \`${label}\`` };
      }
      return null;
    };
    // Marqué pour un cook humain (#4276) : aucune station ne le prend, et la PR que l'humain ouvre entre en pass comme
    // celle d'un cook (cook-humain/livraison.ts).
    const cooksHumains = { ...enLivraisonDuTour(github), avertir: (ligne: string) => avertir(`brigade : ${ligne} on ${nom}`) };
    if (await laisserAuxCooksHumains(libres, cooksHumains)) station.presser?.(true);
    // Les plus prioritaires (`prio:0` avant `prio:1`…, sans `prio:` en dernier) — une
    // réparation de la base porte `prio:0` —, puis les plus anciens (#2209).
    // Celui que le réveil sans merge nomme passe avant tous (#4102).
    const premiers = new Set(enPremier());
    libres.sort((x, y) => Number(premiers.has(y.number)) - Number(premiers.has(x.number)) || rangDePriorite(x) - rangDePriorite(y) || x.number - y.number);
    attendentDuTour = new Set(libres.map(({ number }) => number));
    attentesLongues.tour(libres.map(({ number }) => number));
    // Les places ou le pass sont pleins : la boucle s'arrête, mais les tickets
    // qui attendent un ticket ouvert le disent encore, sans quoi le superviseur
    // ne sait plus pourquoi ils n'avancent pas (#3647, #3945). Les autres disent
    // l'arrêt qui les retient (#3677) : muet, il laissait l'attente d'une prise
    // sans rien qui dise laquelle de ces deux bornes la tenait (#3446).
    const direLesAttentes = async (restants: readonly TicketLu[], arret: string) => {
      for (const reste of restants) {
        if (enVol.has(reste.number)) continue;
        // Un ticket retenu dont les tests s'écrivent dit d'abord ce qui le retient (#3872).
        const attendus = await defaireLesBoucles(github, reste.number, lus).catch(() => []);
        attentesLongues.tenu(reste, attendus);
        if (attendus.length > 0) sauter(reste.number, direAttenteDeTicket(reste.number, attendus), attendus);
        else sauter(reste.number, direSaut(reste.number, arret));
      }
    };
    for (const [rang, ticket] of libres.entries()) {
      if (baseInjoignable !== null && instant() - baseInjoignable.depuis >= REPIT_BASE_INJOIGNABLE_MS) baseInjoignable = null;
      if (baseManquante !== null || baseInjoignable !== null) break;
      const limite = typeof places === "number" ? places : places();
      if (enVol.size + aRendre.size >= limite) {
        await direLesAttentes(libres.slice(rang), direPlacesPrises(limite, [...enVol.keys(), ...aRendre.keys()]));
        break;
      }
      // Le pass est plein : aucun ticket neuf ne se prend avant qu'il ne redescende.
      // Celles que la pass retient pour le chef n'y comptent pas (#3446).
      const exclues = new Set([...renvoyes, ...retenuesDuTour]);
      if (enPass(tickets, exclues) >= PASS_MAX) {
        await direLesAttentes(libres.slice(rang), direPassPlein(tickets.filter((t) => t.labels.includes(LABEL_IN_PASS) && !exclues.has(t.number)).map(({ number }) => number)));
        break;
      }
      if (enVol.has(ticket.number)) continue;
      // Sa PR est déjà approuvée par son dernier verdict : elle n'a rien à
      // reprendre, ses remarques sont closes. Le ticket retourne au pass, quels
      // que soient ses labels, et le merge suit quand la CI est verte (#2622).
      // Illisible, la PR ne se devine pas : le ticket ne part pas à un cook.
      try {
        const sienne = await (github.prOuverteDuTicket ?? github.prDuTicket).call(github, ticket.number);
        // La tête où son cook partira, s'il part (invariant 2, #4026).
        tetesAuDepart.set(ticket.number, sienne?.state === "open" ? sienne.sha : null);
        // Sauf si la station l'a renvoyé sur cette tête même (CI rouge, conflit,
        // second juge) : l'approbation tient, mais la tête reste à reprendre.
        if (sienne !== null && sienne.state === "open" && !sienne.merged && approuvee(await github.commentaires(sienne.number)) && !(await github.commentaires(ticket.number)).some((c) => c.body.startsWith(MARQUE_DE_RENVOI) && c.body.includes(` sha=${sienne.sha} `))) {
          await github.labelliser(ticket.number, [LABEL_IN_PASS]);
          station.presser?.(true);
          continue;
        }
      } catch (erreur) {
        avertir(`brigade : PR de #${ticket.number} sur ${nom} — ${message(erreur)}`);
        continue;
      }
      // Une capacité qui manque à la station : le ticket attend celle qui l'a.
      const manques = besoinsDuTicket(ticket.labels).filter((besoin) => !capacites.has(besoin));
      if (manques.length > 0) {
        sauter(ticket.number, direSaut(ticket.number, `capability missing on this station: ${manques.join(", ")}`));
        continue;
      }
      // Une station marquée incapable de jouer ses gates ne le reprend jamais :
      // il attend une autre station du projet (#3057). Des commentaires
      // illisibles ne le retiennent pas ici, comme l'attente d'après un arrêt
      // (`enAttente`) : la prise relit ces mêmes commentaires, et ne prend rien
      // sur une issue qu'elle ne lit pas — son tour échoue, et le dit. Des
      // retraits illisibles gardent toutes les marques.
      const lusDuTicket = await github.commentaires(ticket.number).catch(() => null);
      const marquees = await Promise.resolve(lusDuTicket)
        .then((lus) => incapablesLus(lus ?? [], () => Promise.resolve().then(() => github.retraitsDeLabels(ticket.number))))
        .catch(() => new Set<string>());
      if (marquees.has(nom)) {
        sauter(ticket.number, direSaut(ticket.number, direIncapacite(nom, stationsCapables(nom, await stationsDuProjet(), marquees))));
        continue;
      }
      // La question qu'une station sans manager a postée (#3938) : une station
      // qui en a un la prend pour la lui passer avant son cook ; une station sans
      // manager ne la reprend pas tant qu'une autre du projet en fait tourner un.
      const enSuspens = questionEnSuspens(lusDuTicket ?? []);
      questionsAReprendre.delete(ticket.number);
      if (enSuspens !== null && options.consulter !== undefined) questionsAReprendre.set(ticket.number, enSuspens);
      if (enSuspens !== null && options.consulter === undefined) {
        const managers = await stationsAvecManager(marquees);
        if (managers !== null && managers.length > 0) {
          sauter(ticket.number, direSaut(ticket.number, `its cook's question awaits the manager on ${managers.join(", ")}: this station has none`));
          continue;
        }
      }
      // Un ticket sans calibrage complet ne part pas, (#2213).
      const calibrage = calibrageDesLabels(ticket.labels);
      if (!complet(calibrage)) {
        sauter(ticket.number, direSaut(ticket.number, "its calibration (model, effort) is incomplete"));
        continue;
      }
      // Il attend un ticket que la cuisine a mis de côté : il ne part pas, et le dit.
      // Sans lecture de GitHub, la remise du ticket au cook dira pourquoi il ne part pas.
      const misDeCote = await attenduMisDeCote(ticket).catch(() => null);
      if (misDeCote !== null) {
        attentesLongues.tenu(ticket, [misDeCote.attendu]);
        sauter(ticket.number, direAttenteSurMisDeCote(ticket.number, misDeCote.attendu, misDeCote.raison));
        continue;
      }
      // Un ticket ouvert qu'il attend — son corps, sa fiche, l'arrêt de son cook
      // (#2968) — le retient, et son saut le nomme ; sans lecture de GitHub, il attend aussi.
      try {
        const attendus = await defaireLesBoucles(github, ticket.number, lus);
        attentesLongues.tenu(ticket, attendus);
        if (attendus.length > 0) {
          sauter(ticket.number, direAttenteDeTicket(ticket.number, attendus), attendus);
          continue;
        }
      } catch (erreur) {
        avertir(`brigade : dépendances de #${ticket.number} sur ${nom} — ${message(erreur)}`);
        continue;
      }
      // Un arrêt subi l'a mis en attente : il n'est pas repris avant son terme (#2508).
      // Le saut est dit, comme les autres : sans lui, le dossier du superviseur
      // ne sait pas ce qui le tient (#3945).
      const termeDeLAttente = await enAttente(ticket);
      let calme = false;
      if (termeDeLAttente !== null && remisPourLaCharge.has(ticket.number)) {
        await rejouerQuandCalme({
          tickets: [ticket.number],
          lireCharge: station.lireCharge ?? lireLaCharge,
          rail: railDeLaCharge,
          rejouer: (numero) => {
            remisPourLaCharge.delete(numero);
            calme = true;
            avertir(`brigade : #${numero} sur ${nom} — the machine is calm again: the ticket whose gates were red under load is taken again before the end of its wait, and its gates are replayed`);
          },
        });
      }
      if (termeDeLAttente !== null && !calme) {
        sauter(ticket.number, direSaut(ticket.number, `it waits until ${new Date(termeDeLAttente).toISOString()} after a stop`));
        continue;
      }
      // Sa fiche n'annonce aucune zone : il ne part pas avant que le manager nomme ses fichiers (#3509).
      await zoneDuTicket(ticket.number);
      if (sansZone.has(ticket.number)) {
        sauter(ticket.number, direSaut(ticket.number, ZONE_VIDE));
        continue;
      }
      // Sa zone est tenue par une PR ouverte, ou par un ticket en vol : il attend qu'ils soient mergés.
      const tenuePar = await tenue(ticket);
      if (tenuePar !== null) {
        // Tenue par une PR : la ligne la nomme, avec ce qui la garde vivante, et le saut porte `zone-held` et son numéro (#4242).
        // Un client qui ne dit pas ce numéro : la ligne nomme sa branche, le saut ne porte pas de code.
        if (tenuePar.tenante) {
          const { pr, pourquoi } = tenuePar.tenante;
          sauter(ticket.number, direSaut(ticket.number, direZoneTenue(pr, pourquoi)), undefined, pr.number === undefined ? undefined : { code: ZONE_HELD, pr: pr.number });
        } else sauter(ticket.number, direSaut(ticket.number, direAttenteDeZone(tenuePar.attente)));
        continue;
      }
      // Un garde-fou retient la cuisine : ni ce ticket ni un autre ne se prend.
      const retenue = gardes === undefined ? null : await gardes.retenue(enVol.size);
      if (retenue !== null) {
        // L'arbitre donne les places à d'autres projets : la première qui
        // s'ouvre pour celui-ci presse un tour tout de suite. Sans elle, le
        // ticket attendait sa prise jusqu'à l'intervalle (#2832).
        if (retenue === "arbiter") void gardes?.attendreUnePlace?.().then((libre) => libre && station.presser?.(true));
        // Les tickets qu'elle laisse disent cette retenue : le dossier du superviseur la nomme (#3699, #3945).
        await direLesAttentes(libres.slice(rang), DIT_DES_RETENUES[retenue]);
        break;
      }
      // Le prendre et le cuire : le geste du cook, qui passe par la porte de son niveau (#4039).
      let refusDeLaPrise: { erreur: unknown } | null = null;
      const prendreEtCuire = async (): Promise<boolean> => {
        let pris: { prise: boolean };
        try {
          pris = await prise.prendre(ticket);
        } catch (erreur) {
          // La prise a pu partir avant le refus : le ticket est à rendre, et le tour s'arrête là.
          aRendre.set(ticket.number, ticket);
          refusDeLaPrise = { erreur };
          throw erreur;
        }
        if (!pris.prise) return false;
        attendentDuTour.delete(ticket.number);
        chrono.prendre(ticket.number);
        enVol.set(ticket.number, cuire(ticket, calibrage));
        return true;
      };
      let cuit: boolean;
      const porte = station.porte ?? null;
      if (porte === null) cuit = await prendreEtCuire();
      else {
        const dit = { line: `take #${ticket.number} and cook it`, reason: `it is cookable, at ${calibrage.model} / ${calibrage.effort}`, outcome: OUTCOME.FIXED_BY_SELF };
        let passage: Awaited<ReturnType<typeof porte.passer<boolean>>>;
        try {
          passage = await porte.passer({ agent: `cook #${ticket.number}`, reglable: "cook" }, dit, prendreEtCuire, (fait) => (fait ? { ...dit, line: `took #${ticket.number} and cooks it` } : null));
        } catch (erreur) {
          if (refusDeLaPrise === null) {
            // Une porte qui ne se lit pas n'arrête pas le tour : le ticket ne part pas, ou il est parti sans être consigné.
            avertir(`brigade : #${ticket.number} on ${nom} — ${message(erreur)}`);
            if (enVol.has(ticket.number)) prisCeTour.add(ticket.number);
            continue;
          }
          throw erreur;
        }
        if (passage.etat === "done") cuit = passage.valeur;
        else {
          sauter(ticket.number, direSaut(ticket.number, passage.etat === "held" ? `its cook waits for the chef's OK — \`${gesteDeBox(`manager approve ${passage.id}`)}\`` : "the cooks observe: no cook takes it"));
          continue;
        }
      }
      if (cuit) {
        prisCeTour.add(ticket.number);
      }
    }
    await gardes?.redire(enVol.size);
  };

  const station: StationGitHub = {
    porte: options.porte ?? null,
    ficheDuProjet: options.ficheDuProjet ?? null,
    tour,
    arreter: () => {
      arretee = true;
    },
    enCuisine: () => [...enVol.keys()],
    enAttente: () => [...attendentDuTour],
    relu: async () => {
      while (enRelecture.size > 0 || externesEnCours.size > 0) await Promise.all([...enRelecture.values(), ...externesEnCours.values()]);
    },
    calme: async () => {
      while (enVol.size > 0 || enRelecture.size > 0 || externesEnCours.size > 0) await Promise.all([...enVol.values(), ...enRelecture.values(), ...externesEnCours.values()]);
      await attentesLongues.calme();
    },
    quitter: async () => {
      await gardes?.quitter();
    },
  };
  return station;
}

export type OptionsDuProjet = {
  // La station GitHub seul, ou pourquoi elle ne peut pas tourner ici.
  station: () => StationGitHub | { refus: string };
  // Entre deux tours. Par défaut, deux minutes.
  intervalleMs?: number;
  // Avant le premier tour (#2436) : la station décale ses projets, pour ne pas
  // tous les lire à son démarrage. Par défaut, aucun délai.
  premierTourMs?: number;
  avertir?: (message: string) => void;
  // Ce que le runtime a décidé, pour qu'il se lise ailleurs que dans son log (`github-seul-etat.ts`).
  noter?: (decision: { etat: "accepted" } | { etat: "refused"; reason: string }) => void;
};

// Un projet ouvert : ses cooks, et son arrêt. `refus` : la station ne peut pas
// le servir, et ne cuisine rien pour lui. `presser` : un tour tout de suite,
// quand le manager vient de rendre un ticket prenable (#2796).
export type ProjetOuvert = { arreter(): Promise<void>; enCuisine(): number[]; enAttente?(): number[]; presser?(): void; refus?: string };

// Ouvre le projet : un tour de la station, puis un autre l'intervalle passé,
// jusqu'à l'arrêt.
export function brancherBrigadeGithub(options: OptionsDuProjet): ProjetOuvert {
  const avertir = options.avertir ?? ((texte: string) => console.error(texte));
  const station = options.station();
  if ("refus" in station) {
    options.noter?.({ etat: "refused", reason: station.refus });
    avertir(`brigade : this runtime cannot serve the project on GitHub-only state — ${station.refus}; it cooks nothing for it`);
    return { refus: station.refus, arreter: async () => {}, enCuisine: () => [] };
  }
  options.noter?.({ etat: "accepted" });
  avertir("brigade : GitHub-only state — this station takes, cooks, reviews and merges the project's tickets from GitHub only");
  const intervalleMs = options.intervalleMs ?? 120_000;
  let arrete = false;
  let minuterie: NodeJS.Timeout | undefined;
  let enCours: Promise<void> = Promise.resolve();
  const presseeMs = Math.min(ATTENTE_PRESSEE_MS, intervalleMs);
  let enTour = false;
  // Quand vient le prochain tour programmé.
  let echeance = 0;
  // Les tours pressés qui restent (#2333), et le délai qu'un fait du pass a
  // demandé pendant un tour : il vaut pour le tour d'après.
  let presses = 0;
  let demande: number | undefined;
  const programmer = (delai: number) => {
    clearTimeout(minuterie);
    echeance = Date.now() + delai;
    minuterie = setTimeout(tourner, delai);
  };
  const tourner = () => {
    enTour = true;
    enCours = (async () => {
      // La fin de la pause de GitHub qui a arrêté ce tour, s'il s'y est arrêté.
      let repriseMs: number | null = null;
      try {
        await station.tour();
      } catch (erreur) {
        // La pause de GitHub est dite une fois au journal, pas à chaque tour (#2436).
        if (!estLaPauseDeGitHub(erreur)) avertir(`brigade : tour GitHub seul — ${message(erreur)}`);
        if (erreur instanceof LimiteGitHubAtteinte) repriseMs = Math.max(REPRISE_MIN_MS, erreur.jusqua - Date.now());
      }
      enTour = false;
      // Un tour que la pause de GitHub a arrêté reprend à sa fin, si elle vient
      // avant le tour d'après : les tickets prenables attendaient leur prise
      // jusqu'à l'intervalle, la pause passée (#3448).
      const prevu = demande === 0 ? 0 : presses > 0 ? presseeMs : intervalleMs;
      const delai = repriseMs === null ? prevu : Math.min(prevu, repriseMs);
      if (presses > 0) presses -= 1;
      demande = undefined;
      if (!arrete) programmer(delai);
    })();
  };
  // Un fait du pass rapproche les tours suivants, sans attendre l'intervalle
  // (#2333) ; un pass où rien ne bouge garde l'intervalle et son coût.
  station.presser = (maintenant = false) => {
    if (arrete) return;
    const delai = maintenant ? 0 : presseeMs;
    if (enTour) {
      presses = TOURS_PRESSES;
      demande = Math.min(demande ?? delai, delai);
      return;
    }
    // Le tour programmé est le premier des tours pressés.
    presses = TOURS_PRESSES - 1;
    if (echeance - Date.now() > delai) programmer(delai);
  };
  if ((options.premierTourMs ?? 0) > 0) programmer(options.premierTourMs as number);
  else tourner();
  return {
    // Les tickets que ses cooks cuisinent.
    enCuisine: () => station.enCuisine(),
    // Les tickets qui attendent une prise : ce qui garde le Mac éveillé (#3713).
    enAttente: () => station.enAttente?.() ?? [],
    // Le ticket que le manager vient de lancer se prend à ce tour, pas au
    // suivant : sans lui, il attendait sa prise jusqu'à l'intervalle (#2796).
    presser: () => station.presser?.(true),
    arreter: async () => {
      arrete = true;
      // Avant que le runtime ne tue les cooks : leur fin se lit comme celle de la station.
      station.arreter?.();
      clearTimeout(minuterie);
      await enCours;
      await station.quitter?.();
    },
  };
}

// Le client du tour, sur le client GitHub du runtime (`github.ts`).
export function clientDuTour(github: GitHub, base: string, depotGitHub?: string): GitHubDuTour {
  const { mettreAJour } = github;
  const { retraitsDeLabels } = github;
  const { prsOuvertes } = github;
  if (mettreAJour === undefined) throw new Error("this GitHub client cannot update a branch");
  if (prsOuvertes === undefined) throw new Error("this GitHub client cannot list the files of the open PRs");
  if (retraitsDeLabels === undefined) throw new Error("this GitHub client cannot read the label removals of an issue");
  // Le dernier sondage lu : rendu tel quel quand GitHub dit que rien n'a changé.
  let derniers: TicketLu[] = [];
  // L'état du tour en une requête GraphQL (#2301), lu par `checksDeLaBase`, ce
  // que le tour lit en premier : ses tickets, ses PR, leur CI et la base en
  // sortent, sans un appel REST de plus. Sans GraphQL, le REST d'avant.
  const [proprietaire, nomDuDepot] = (depotGitHub ?? "").split("/");
  const { lireGraphql } = github;
  const parGraphql = lireGraphql !== undefined && proprietaire && nomDuDepot ? lireGraphql.bind(github) : null;
  let instantane: Instantane | null = null;
  // Une PR externe n'est celle d'aucun ticket, même sous le nom de sa branche (#2933).
  // Les commentaires que l'instantané a lus (#3834), tant qu'aucun n'a été écrit
  // depuis sur le ticket : un ticket écrit par la station se relit en REST.
  const commentairesLus = (numero: number) => instantane?.commentaires.get(numero);
  const ecrits = new Set<number>();
  const corpsEcrits = new Set<number>();
  const corpsLu = (numero: number) => (!corpsEcrits.has(numero) ? instantane?.corps.get(numero) : undefined);
  const commentairesDuTicket = async (numero: number) => (!ecrits.has(numero) ? commentairesLus(numero) : undefined) ?? (await github.commentaires(numero));
  const prLue = (lue: PRDeLInstantane) => ({ number: lue.number, url: "", base, sha: lue.sha, state: "open" as const, merged: false, enRetard: lue.enRetard, ...(lue.enConflit ? { enConflit: true as const } : {}), mergeePar: null, version: lue.version });
  const prDeLInstantane = (issue: number) => instantane?.prs.find((pr) => !pr.externe && pr.branche === brancheDuTicket(issue));
  // Sans GraphQL, la base ne se compare pas : la PR garde sa zone.
  const lecteur = parGraphql === null ? null : lecteurDeLaBase(parGraphql, { owner: proprietaire as string, repo: nomDuDepot as string, base });
  const surLaBaseDe = (sha: string, fichiers: readonly string[]) => (lecteur === null ? {} : { surLaBase: lecteur(sha, fichiers) });
  return {
    livraison: githubDeLaLivraison(github, base, depotGitHub),
    checksDeLaBase: async () => {
      if (parGraphql === null) return github.ci(base);
      try {
        ecrits.clear();
        corpsEcrits.clear();
        instantane = lireInstantane(await parGraphql(REQUETE, { owner: proprietaire as string, repo: nomDuDepot as string, base: `refs/heads/${base}` }));
        return instantane.baseIncomplete ? github.ci(base) : instantane.base;
      } catch (erreur) {
        // GitHub qui limite ses appels se dit comme avant ; toute autre panne de
        // la lecture GraphQL laisse ce tour au REST, sans arrêter la cuisine.
        instantane = null;
        if (erreur instanceof LimiteGitHubAtteinte) throw erreur;
        return github.ci(base);
      }
    },
    fires: async () => {
      if (instantane !== null && !instantane.incomplet) return instantane.tickets;
      const sonde = await github.tickets();
      if (sonde.inchange) return derniers;
      derniers = sonde.issues.filter((issue) => !issue.pr);
      sonde.confirmer();
      return derniers;
    },
    dependancesOuvertes: async (numero) => attendusDuCorps(numero, corpsLu(numero) ?? (await github.issue(numero))?.body ?? "", (dependance) => github.issue(dependance)),
    // Une PR ouverte se lit dans l'instantané ; une PR mergée ou fermée n'y est
    // pas, et se lit en REST — ce qui n'arrive qu'une fois par ticket.
    prDuTicket: async (issue) => {
      const lue = prDeLInstantane(issue);
      if (lue === undefined) return github.prDeBranche(brancheDuTicket(issue));
      return prLue(lue);
    },
    // Pour qui ne veut que la PR ouverte : l'instantané, complet, dit qu'il n'y en a pas, sans relire la branche en REST (#3834).
    prOuverteDuTicket: async (issue) => {
      const lue = prDeLInstantane(issue);
      if (lue !== undefined) return prLue(lue);
      return instantane !== null && !instantane.prsTronquees ? null : github.prDeBranche(brancheDuTicket(issue));
    },
    issuesDepuis: (instant) => github.issuesDepuis(instant),
    creerIssue: (issue) => github.creerIssue(issue),
    fermerIssue: (numero) => github.fermerIssue(numero),
    ...(github.fermerPR === undefined ? {} : { fermerPR: github.fermerPR.bind(github) }),
    journalDuCheck: (check) => github.journalDuCheck(check),
    ...(github.etapesEnEchec === undefined ? {} : { etapesEnEchec: github.etapesEnEchec.bind(github) }),
    ...(github.ciDeLaBranche === undefined ? {} : { ciDeLaBranche: github.ciDeLaBranche.bind(github) }),
    ci: async (sha) => {
      const lue = instantane?.prs.find((pr) => pr.sha === sha);
      return lue === undefined || lue.ciIncomplete ? github.ci(sha) : lue.ci;
    },
    corpsDuTicket: async (issue) => corpsLu(issue) ?? (await github.issue(issue))?.body ?? "",
    ecrireCorps: (numero, corps) => {
      corpsEcrits.add(numero);
      return github.ecrireCorps(numero, corps);
    },
    issue: (numero) => github.issue(numero),
    depotDuTicket: async (issue) => {
      const lue = await github.issue(issue);
      if (lue === null) return null;
      const [[fireAt = null] = [], commentaires] = await Promise.all([github.posesDeFire?.(issue), commentairesDuTicket(issue)]);
      // Sa prise, que la station qui merge n'a pas vue si une autre l'a prise ou si elle a redémarré depuis (#2732),
      // et ce qui l'a suivie : les cooks rendus sans livraison, les renvois, les reprises (#2954).
      const depuis = fireAt ?? lue.createdAt;
      return { deposeAt: lue.createdAt, fireAt, priseAt: premierePrise(commentaires, depuis), faits: faitsDePrise(commentaires, depuis) };
    },
    // Des PR ou des fichiers que la requête a tronqués ou mal rendus (un renommage
    // perd son ancien chemin) : tout se relit en REST, pour ne rien juger de moins.
    // Chacune dit sa dernière activité, ses labels, et lit à la demande si la base a déjà ses changements (#4242).
    prsOuvertes: async () => (instantane !== null && !instantane.prsTronquees && !instantane.prs.some((pr) => pr.fichiersIncomplets) ? instantane.prs.map(({ number, branche, fichiers, sha, misAJourLe, labels }) => ({ number, branche, fichiers, sha, misAJourLe, labels, ...surLaBaseDe(sha, fichiers) })) : (await prsOuvertes.call(github)).map(({ number, branche, fichiers, sha, misAJourLe, labels }) => ({ number, branche, fichiers, ...(sha === undefined ? {} : { sha, ...surLaBaseDe(sha, fichiers) }), ...(misAJourLe === undefined ? {} : { misAJourLe }), ...(labels === undefined ? {} : { labels }) }))),
    // Les PR externes (#2933), lues dans l'instantané ; tronqué, en REST.
    prsExternes: async () =>
      instantane !== null && !instantane.prsTronquees
        ? instantane.prs.filter((pr) => pr.externe).map(({ number, sha }) => ({ number, sha }))
        : (await prsOuvertes.call(github)).flatMap(({ number, sha, externe }) => (externe === true && sha !== undefined ? [{ number, sha }] : [])),
    remplacerCommentaire: (numero, ancien, nouveau) => {
      ecrits.add(numero);
      return github.remplacerCommentaire(numero, ancien, nouveau);
    },
    ...(github.assigner === undefined ? {} : { assigner: github.assigner.bind(github) }),
    // GitHub rend les commentaires dans l'ordre où il les a reçus : leur rang
    // départage, comme leur id, deux commentaires de la même seconde.
    commentaires: async (numero) => (await commentairesDuTicket(numero)).map((lu, rang) => ({ id: rang + 1, body: lu.body, association: lu.association, createdAt: lu.createdAt })),
    commenter: (numero, corps) => {
      ecrits.add(numero);
      return github.commenter(numero, corps);
    },
    retraitsDeLabels: (numero) => retraitsDeLabels.call(github, numero),
    ...(github.evenements === undefined ? {} : { entreeEnPass: async (numero: number) => labelPoseLe(((await github.evenements?.(numero)) ?? []).flatMap((un) => (typeof un === "object" && un !== null ? [un as Record<string, unknown>] : [])), LABEL_IN_PASS) }),
    relancerLesEchecs: (run) => github.relancerLesEchecs(run),
    mettreAJour: (numero, sha) => mettreAJour.call(github, numero, sha),
    ...(github.fichiersEntre === undefined ? {} : { fichiersEntre: github.fichiersEntre.bind(github) }),
    ...(github.fichierBinaire === undefined || github.publierFichiers === undefined ? {} : { fichierBinaire: github.fichierBinaire.bind(github), publierFichiers: github.publierFichiers.bind(github) }),
    ...(github.statuts === undefined || github.poserStatut === undefined ? {} : { statuts: github.statuts.bind(github), poserStatut: github.poserStatut.bind(github) }),
    merger: (numero, sha) => github.merger(numero, sha),
    labelliser: (numero, labels) => github.labelliser(numero, labels),
    delabelliser: (numero, label) => github.delabelliser(numero, label),
    ouvrirPR: (pr) => github.ouvrirPR(pr),
  };
}

// Un lancement de `claude` sous supervision : le cook, ou le reviewer.
// `flux` rendu : là où son flux s'est écrit, s'il ne l'a pas été où demandé.
// `ticket` : celui que sert le cook, que le disjoncteur nomme s'il échoue (#3656).
// `suivre` : le cook qu'un relais porte déjà sur ce flux, lancé par une vie précédente de la station, est suivi plutôt que relancé (#4401).
export type Lancer = (lancement: Lancement & { entree?: string; cwd: string; env: NodeJS.ProcessEnv; flux: string; ticket?: number; suivre?: boolean }) => Pick<Supervise, "fin"> & { flux?: string };

export type OptionsDuDepot = {
  nom: string;
  // La porte des gestes du runtime (#4039), donnée à la station.
  porte?: PorteDesGestes | null;
  places: number | (() => number);
  base: string;
  // L'heure de la station ; les tests la fixent.
  maintenant?: () => Date;
  // La charge de la machine (#4211) : la station la lit (`lireLaCharge`), les tests la fixent. Absente, elle
  // n'est pas lue et tout rouge des gates compte un essai, comme avant.
  lireCharge?: () => number;
  // `owner/name` du projet.
  depotGitHub: string;
  // Le GitHub de la brigade, où va le ticket du temps perdu (#2783).
  githubDeLaBrigade?: GitHubDeLaBrigade;
  // L'état du tour lu en une requête GraphQL (#2301) ; `false` : le REST
  // d'avant, ce que mesurent les tests du coût par ticket.
  graphql?: boolean;
  github: GitHub;
  // Le dépôt de la station, d'où partent les worktrees de ses cooks. Sans
  // `vue`, `fichiers` et `lire`, ses workflows ne se lisent pas : la CI des PR
  // est attendue, comme avant (#2456).
  depot: Pick<Depot, "preparer" | "reprendre" | "connait" | "retirer" | "ranger" | "pousser" | "commits" | "changes" | "diff"> & Partial<Pick<Depot, "garer" | "surLOrigine" | "elaguer" | "tete" | "livree" | "vue" | "fichiers" | "lire" | "recolter" | "sujet" | "recevoirPR" | "lancerGit" | "essayer" | "jeter" | "ajouts" | "recevoir">>;
  // La prise de #2056, liée à la station.
  prise: (github: GitHubDuTour, station: string) => Prise;
  claude: string;
  env: NodeJS.ProcessEnv;
  cloison: Cloison | null;
  // Le bac à sable de Claude Code, quand la cuisine est sur le poste du chef.
  bacASable?: BacASableLocal | null;
  // La liste réseau du projet, relue à chaque lancement ; sert au cook sans bac à sable ni cloison. Absente, le socle seul.
  hotes?: () => Regle[];
  plafonds: Plafonds;
  graceMs: number;
  // Relu à chaque relecture quand c'est une fonction : un calibrage changé depuis l'app vaut à la suivante (#4222).
  reviewer: Calibrage | (() => Calibrage);
  // Le calibrage du manager, relu à chaque consultation : la question d'un cook
  // bloqué lui va avant de parquer le ticket pour le chef (#2894). Absent, la station n'a
  // pas de manager à consulter, et le dit sur l'issue.
  manager?: () => Calibrage;
  // Le plafond de calibrage du projet (`reagir.ts`) : une recalibration du
  // manager après le dernier essai ne le passe pas (#3513). Absent, le défaut.
  plafond?: () => Plafond;
  // La consigne du second juge (#2555). Par défaut, \`agents/second-juge.md\`
  // du plugin de ce runtime.
  consigneDuSecondJuge?: () => string;
  // Où s'écrit le flux de chaque lancement.
  flux: string;
  // Ce que la station fournit, tel que le projet le déclare.
  capacites?: readonly string[];
  lancer?: Lancer;
  // Les garde-fous (#2213), dont le lancement gardé des cooks et des
  // relectures.
  gardes?: GardesDuTour;
  avertir?: (message: string) => void;
  // Ce qui regarde le tour par son client GitHub, sans rien y changer : le
  // superviseur (`superviseur/tour.ts`, #3945).
  observer?: (github: GitHubDuTour) => GitHubDuTour;
  // Reçoit le manager du projet, tel que le superviseur le consulte (#3945).
  // Sans calibrage du manager, il ne reçoit rien, et aucun run ne part.
  superviseur?: (consulter: ManagerDuSuperviseur) => void;
  // Le clone du projet, où s'écrit le temps des tickets mergés (#2342).
  clone?: string;
  // Le répertoire d'état du projet (#2556).
  repertoireEtat?: string;
  // Les gates d'un projet sans CI sur ses PR, que la station joue sur leur
  // tête (#2456) : leur plafond de durée, le fichier des secrets de la machine,
  // et si la station agit sous une identité par rôle — ses gates ne reçoivent
  // alors aucun jeton GitHub. Absentes, la station ne les joue pas.
  gates?: { delaiMs: number; secrets?: string | null; sansIdentite?: boolean };
  // Le setup du worktree de chaque cook, joué par la station avant de le
  // lancer, sous la cloison, et son plafond de durée (#2535). Absent, le cook
  // part dans un worktree tel que git l'a posé, sans dépendances.
  setup?: { delaiMs: number };
  // Ce que la porte de prise a dit d'un ticket qu'elle n'a pas pris (#2429).
  sauter?: (ticket: number, ligne: string, attendus?: readonly number[], raison?: RaisonDuSaut) => void;
  // La PR périmée que la porte de prise ne compte plus sur la zone d'un ticket (#4243).
  perimee?: (ticket: number, pr: PRDeLaPorte & { number: number }) => void;
  // Les tickets que la porte prend avant les autres quand une place s'ouvre — celui que le réveil sans merge nomme (#4102) :
  // devant les `prio:N` et l'ordre des numéros, sans quoi il attend derrière des tickets mis de côté qui reviennent sans cesse.
  enPremier?: () => readonly number[];
  // Les stations que le projet déclare (#3057), où va un ticket dont les gates
  // ne se jouent pas sur celle-ci.
  stationsDuProjet?: () => readonly string[];
  // Ce que la station n'a pas pu pour un ticket, en une ligne, que sa carte de l'onglet Stations dit (#3870) ; nul : elle le peut de nouveau.
  lacune?: (ligne: string | null) => void;
  // La configuration du projet, relue à chaque PR externe : son humain
  // `review` reçoit la carte « merge #N? » (#2933). Absente, elle va au chef.
  // Relue aussi à chaque merge : `humanValidatesDesigns` y retient une
  // livraison design pour sa carte (#3184). Absente, la pass merge.
  projet?: () => unknown;
  // Le compte GitHub du chef, que mentionne une validation demandée sur son
  // ticket (#3615). Absent, elle ne mentionne personne.
  chef?: () => Promise<string | null>;
};

// Le plafond de durée des gates d'une tête, en millisecondes (#2456) : 30 min
// sans `BRIGADE_GATES_TIMEOUT_SECONDS`, que les réglages du dépôt peuvent
// poser (`variablesDesGatesDuDepot`). Mal écrit, il refuse le démarrage.
export function delaiDesGatesMs(env: Record<string, string | undefined>): number {
  const valeur = env.BRIGADE_GATES_TIMEOUT_SECONDS || "1800";
  if (!/^[1-9][0-9]*$/.test(valeur)) throw new ConfigInvalide(`BRIGADE_GATES_TIMEOUT_SECONDS invalide : « ${valeur} » — attendu un nombre entier de secondes`);
  return Number(valeur) * 1000;
}

// Les workflows d'un dépôt, d'où se lit la CI de ses PR.
const WORKFLOW = /^\.github\/workflows\/[^/]+\.ya?ml$/;

// Un workflow du projet se lance-t-il sur une PR vers `base` qui change ces
// fichiers (#2456) ? Lu sur la base telle que le clone l'a rapatriée — une PR
// qui touche ses workflows attend le chef —, une fois par commit de la base.
// Dans le doute — un dépôt qui ne se lit pas, un workflow illisible —, oui : la
// CI est attendue, comme avant.
export function lecteurDeLaCiDesPR(depot: Partial<Pick<Depot, "vue" | "fichiers" | "lire">>, base: string): (fichiers: string[]) => boolean {
  let workflows: { tete: string; contenus: string[] } | null = null;
  return (fichiers) => {
    const { vue, fichiers: suivis, lire } = depot;
    if (vue === undefined || suivis === undefined || lire === undefined) return true;
    try {
      const tete = vue();
      if (workflows?.tete !== tete) workflows = { tete, contenus: suivis().filter((chemin) => WORKFLOW.test(chemin)).map((chemin) => lire(tete, chemin) ?? "") };
      return workflows.contenus.some((contenu) => declencheSurPr(contenu, base, fichiers));
    } catch {
      return true;
    }
  };
}

// Ce que des gates rendues disent, pour le statut et pour le cook.
// Ce que des gates rouges ont dit, replié sous le motif d'un échec : un commentaire de ticket ne garde que sa fin, au-delà
// de ce qu'une issue affiche (#4113).
const DETAIL_MAX = 6000;
function detailDesGates(fait: { detail?: string }): string {
  if (fait.detail === undefined || fait.detail === "") return "";
  const detail = fait.detail.length > DETAIL_MAX ? `…\n${fait.detail.slice(-DETAIL_MAX)}` : fait.detail;
  return `\n\n<details><summary>What the gates said</summary>\n\n${detail}\n\n</details>`;
}

export function verdictDesGates(gates: Gates, delaiMs: number): VerdictDesGates {
  const vert = gates.outcome === "green";
  const resume = vert ? "" : gates.outcome === "timeout" ? `stopped after ${Math.round(delaiMs / 1000)} s` : (gates.failures[0] ?? `exit code ${gates.code ?? "none"}`);
  if (vert) return { vert, resume, detail: "" };
  const echecs = gates.failures.map((ligne) => `- \`${ligne.replace(/`/g, "'")}\``);
  const fin = gates.tail === "" ? [] : ["", "The end of their output:", "", "```", gates.tail.replace(/```/g, "'''"), "```"];
  return { vert, resume, detail: [gates.outcome === "timeout" ? `They were stopped after ${Math.round(delaiMs / 1000)} s.` : `They exited with code ${gates.code ?? "none"}.`, ...(echecs.length === 0 ? [] : ["", ...echecs]), ...fin].join("\n") };
}

const lireLeFlux = (fichier: string) => lireFlux(enFluxClaude(existsSync(fichier) ? readFileSync(fichier, "utf8") : ""));

// La station GitHub seul de ce runtime, ou pourquoi elle ne peut pas tourner.
export function stationDuDepot(options: OptionsDuDepot): StationGitHub | { refus: string } {
  if (!/^[A-Za-z0-9._/-]+$/.test(options.nom)) return { refus: `the station name ${JSON.stringify(options.nom)} cannot sign a claim or a verdict` };
  if (options.github.retraitsDeLabels === undefined) return { refus: "the GitHub client cannot read the label removals of an issue" };
  if (options.github.mettreAJour === undefined) return { refus: "the GitHub client cannot update a branch" };
  if (options.github.prsOuvertes === undefined) return { refus: "the GitHub client cannot list the files of the open PRs" };
  const { nom, base, depot, depotGitHub, cloison } = options;
  // Le moteur de ses cooks (#3744) : réglé de travers, la station ne s'ouvre pas.
  const moteur = moteurDeLaStation(options.env);
  if ("refus" in moteur) return { refus: moteur.refus };
  const avertir = options.avertir ?? ((texte: string) => console.error(texte));
  mkdirSync(options.flux, { recursive: true });
  const lanceur = options.lancer ?? options.gardes?.lancer;
  const lancer: Lancer = lanceur ?? (({ commande, args, entree, cwd, env, flux }) => superviser({ commande, args, ...(entree === undefined ? {} : { entree }), cwd, env, plafonds: options.plafonds, graceMs: options.graceMs, flux }));
  // Chaque cook part par un relais, et survit à la station (#4401). Repris,
  // celui qu'un relais porte déjà sur son flux est suivi, pas relancé. Les
  // tours du cook, et le mot du chef remis à la fin de chacun (#4047).
  const lancerLeCook = avecLesMotsAuCook(
    lanceur ??
      (({ commande, args, entree, cwd, env, flux, suivre }) => {
        const suivi = { plafonds: options.plafonds, graceMs: options.graceMs, flux };
        return (suivre ? suivreLeRelais(suivi) : null) ?? superviserParRelais({ ...suivi, commande, args, ...(entree === undefined ? {} : { entree }), cwd, env, run: basename(flux), secrets: {} });
      }),
    { repertoireEtat: options.repertoireEtat, avertir },
  );
  // Le cook n'a besoin d'aucun `gh` : son ticket lui est remis dans sa
  // consigne, et la station pousse sa branche et ouvre sa PR. Rien ne fait
  // donc parler son `gh` au nom du chef (`bac-a-sable/hors-github.ts`).
  // Sans bac à sable ni cloison, le cook part en mode restreint : `dontAsk` et des réglages qui tiennent sans le noyau.
  const lancementDuClaude = (args: string[], ou: string, lit: string[] = [], setup?: boolean): string[] =>
    options.bacASable || cloison !== null ? dansLeBacASableLocal(options.bacASable, args, ou, lit, setup) : dansLeModeRestreint(args, { worktree: ou, caches: lireCaches(options.env), hotes: (options.hotes ?? (() => REGLES_DE_BASE))(), home: options.env.HOME ?? homedir(), lit });
  const sansJeton = () => environnementHorsGitHub(environnementCook(options.env), { bacASable: Boolean(options.bacASable) });
  const env = (depart: NodeJS.ProcessEnv = sansJeton()) => environnementClaude(depart, options.env);
  // Ce qu'un setup ne fait pas entrer dans l'environnement du cook : ni le
  // jeton de Claude, ni de quoi parler à GitHub.
  const interditesAuSetup = [...VARIABLES_DE_JETON, ...VARIABLES_GITHUB, "GH_CONFIG_DIR"];
  const github = (options.observer ?? ((client: GitHubDuTour) => client))(
    clientDuTour(options.github, base, options.graphql === false ? undefined : depotGitHub),
  );
  // Coupe les gates en vol quand la station s'arrête : elles n'ont alors rien dit.
  const abandon = new AbortController();
  // La charge de la machine, qui départage un rouge des gates (#4211). Non lue, la machine compte pour calme :
  // tout rouge est celui du code, comme avant.
  const lireCharge = options.lireCharge ?? (() => 0);

  const ciDesPR = lecteurDeLaCiDesPR(depot, base);
  // Les tickets de fondation du dépôt, lus seulement quand des gates ne jouent
  // rien (#3188) : les issues de toujours, celles qui portent le label.
  const lireFondations = async () => (await options.github.issuesDepuis(new Date(0).toISOString())).filter((issue) => issue.labels.includes(LABEL_FONDATION));

  // Le lieu des gates de la tête d'une PR : la branche du ticket, telle que
  // l'origine la porte, dans un worktree à elle. Il ne se joue que sur la tête
  // même de la PR, et que si le projet a des gates et que ses secrets se donnent.
  const lieuDesGates = async (ticket: TicketLu, pr: PRAFusionner): Promise<LieuDesGates> => {
    const reglage = options.gates;
    if (reglage === undefined || depot.tete === undefined) return { nonJouees: "this station does not run gates" };
    const branche = brancheDuTicket(ticket.number);
    let worktree: string;
    try {
      worktree = await depot.reprendre(`gates-${ticket.number}-github`, branche);
    } catch (erreur) {
      return { nonJouees: `its worktree could not be prepared: ${message(erreur)}` };
    }
    const liberer = () => depot.retirer(worktree);
    const refus = (motif: string): LieuDesGates => {
      liberer();
      return { nonJouees: motif };
    };
    if (depot.tete(branche) !== pr.sha) return refus(`the station's clone holds \`${branche}\` at another head than PR #${pr.number}'s \`${pr.sha.slice(0, 7)}\``);
    if (!aDesGates(worktree)) return refus(`the project has no \`${gatesManquantes(worktree).join("`, `")}\`, which its sheet names: with no CI either, nothing would judge this delivery`);
    // Des gates qui ne jouent rien — aucune commande de test, ou provisoires tant que la fondation n'est pas servie (#3188).
    const vides = await gatesQuiNeJugentPas(worktree, ticket, lireFondations);
    if (vides !== null) return refus(vides);
    const secrets = lireSecrets(worktree, reglage.secrets ?? null);
    if (!secrets.pret) return refus(`the secrets the project declares cannot be given to its gates — ${secrets.problemes.join("; ")}`);
    const envGates = environnementCook(options.env);
    return {
      liberer,
      jouer: async () => {
        const gates = await jouerGates({
          worktree,
          ticket: ticket.number,
          ...(Object.keys(secrets.env).length === 0 ? { env: envGates } : { env: { ...envGates, ...secrets.env }, masquer: secrets.masquer }),
          interdites: reglage.sansIdentite ? VARIABLES_GITHUB : [],
          delaiMs: reglage.delaiMs,
          cloison,
          signal: abandon.signal,
        });
        return abandon.signal.aborted ? null : verdictDesGates(gates, reglage.delaiMs);
      },
    };
  };

  // Le worktree de chaque cook en vol.
  const lieuxEnVol = new Map<number, { worktree: string; branche: string }>();
  // La station s'arrête : ses cooks lui survivent, et ce qu'ils laissent est à la station qui la relance (#4401).
  let arretee = false;
  // Ce qu'il faut, hors de GitHub, pour finir le ticket d'un cook qui survit à
  // la station, écrit à son lancement à côté de son flux (#4401) : son
  // worktree, la tête de sa branche à son départ (`avant`) et le flux de son
  // relais. Puis sa fin, quand il a fini : la station qui s'arrête après lui
  // reprend sans le relancer.
  type Reprise = { worktree: string; avant: string | null; reprise: boolean; conflit: string[] | null; reste: string | null; fin?: Fin; flux?: string };
  const repriseDuRun = (run: string) => join(options.flux, `${run}.reprise.json`);
  const lireLaReprise = (run: string): Reprise | null => {
    try {
      return JSON.parse(readFileSync(repriseDuRun(run), "utf8")) as Reprise;
    } catch {
      return null;
    }
  };
  // Les flux d'un run (`<run>.flux.jsonl`, ses relances, leur `.stderr`) : ceux du
  // tour sous `options.flux`, ceux des garde-fous sous `<état>/runs`.
  const fluxDuRun = (run: string): string[] =>
    [options.flux, ...(options.repertoireEtat === undefined ? [] : [join(options.repertoireEtat, "runs")])].flatMap((dossier) => {
      try {
        return readdirSync(dossier).filter((nom) => nom.startsWith(`${run}.`) || nom.startsWith(`${run}-`)).map((nom) => join(dossier, nom));
      } catch {
        return [];
      }
    });
  const cuisiner: Cuisiner = async (ticket, calibrage, suivre) => {
    const run = runDuTicket(ticket.number);
    let fait: Awaited<ReturnType<Cuisiner>> | undefined;
    try {
      fait = await cuisinerLeTicket(ticket, calibrage, suivre);
      return fait;
    } finally {
      // Le cook est sorti : la station reprend ce qu'il a laissé sur le disque
      // (#4104). Un échec ici ne remonte jamais jusqu'à la sortie du cook. Le
      // ticket que la station laisse en s'arrêtant n'est pas fini : la station
      // relancée le reprend, et ses restes avec (#4401).
      try {
        const worktree = lieuxEnVol.get(ticket.number)?.worktree;
        retirerLesRestesDuCook({ cook: run, sorti: !(arretee && fait !== undefined && "subi" in fait), chemins: [...(worktree === undefined ? [] : [worktree]), ...fluxDuRun(run), ...(options.repertoireEtat === undefined ? [] : [join(options.repertoireEtat, "tmp", run)])], avertir });
      } catch (erreur) {
        avertir(`brigade : #${ticket.number} sur ${nom} — the leftovers of its cook could not be removed: ${message(erreur)}`);
      }
      lieuxEnVol.delete(ticket.number);
    }
  };
  // La vérification de ce qu'un cook affirme d'un ticket déjà satisfait (#3146) :
  // le commit est sur la base, et les gates y sont vertes.
  const verifierLeDejaServi = async (ticket: TicketLu, worktree: string, affirmation: string): Promise<{ servi: DejaServi } | { refus: string }> => {
    const reglage = options.gates;
    if (depot.lancerGit === undefined || reglage === undefined) return { refus: "this station cannot run git or the gates in a cook's worktree" };
    if (!aDesGates(worktree)) return { refus: `the project has no \`${gatesManquantes(worktree).join("`, `")}\`, which its sheet names: nothing would show the base is green` };
    const vides = await gatesQuiNeJugentPas(worktree, ticket, lireFondations);
    if (vides !== null) return { refus: vides };
    const secrets = lireSecrets(worktree, reglage.secrets ?? null);
    if (!secrets.pret) return { refus: `the secrets the project declares cannot be given to its gates — ${secrets.problemes.join("; ")}` };
    const envGates = environnementCook(options.env);
    return verifierDejaServi({
      git: (args, cwd) => depot.lancerGit!(args, cwd),
      worktree,
      base,
      affirmation,
      gates: async () => {
        const gates = await jouerGates({
          worktree,
          ticket: ticket.number,
          ...(Object.keys(secrets.env).length === 0 ? { env: envGates } : { env: { ...envGates, ...secrets.env }, masquer: secrets.masquer }),
          interdites: reglage.sansIdentite ? VARIABLES_GITHUB : [],
          delaiMs: reglage.delaiMs,
          cloison,
          signal: abandon.signal,
        });
        return abandon.signal.aborted ? null : verdictDesGates(gates, reglage.delaiMs);
      },
    });
  };
  // Les gates du projet, jouées dans le worktree d'une livraison avant son push
  // (#3996) : la CI ne joue que sur une livraison qu'elles ont jugée prête. Un
  // projet sans `gates.sh` n'a rien à y jouer, ni des gates qui ne jugent rien
  // — provisoires tant que la fondation n'est pas servie (#3188) : la livraison
  // part comme avant, et la pass dit pourquoi elle ne les joue pas.
  // Rend ce qui la retient, ou null quand elle peut partir.
  // L'arbre dont les gates viennent d'être rouges, par ticket : le cook suivant
  // qui le livre sans y rien changer n'a pas à les rejouer — même arbre, même
  // verdict —, ce qui coûtait une suite entière de plus. Un arbre qui ne se lit
  // pas les rejoue.
  const arbresRouges = new Map<number, { arbre: string; echec: string; detail: string }>();
  const gatesAvantLePush = async (ticket: TicketLu, worktree: string): Promise<{ echec: string; detail?: string } | { subi: string; charge?: boolean } | null> => {
    if (!aDesGates(worktree) || (await gatesQuiNeJugentPas(worktree, ticket, lireFondations)) !== null) return null;
    const lu = await depot.lancerGit?.(["rev-parse", "HEAD^{tree}"], worktree);
    const arbre = lu?.code === 0 ? lu.stdout.trim() : null;
    const dejaRouge = arbresRouges.get(ticket.number);
    if (arbre !== null && dejaRouge?.arbre === arbre) return { echec: `${dejaRouge.echec} (the same tree as its previous delivery: the gates were not played again)`, detail: dejaRouge.detail };
    const secrets = lireSecrets(worktree, options.gates?.secrets ?? null);
    if (!secrets.pret) return { echec: `its gates could not run before the push, so its delivery was not pushed: the secrets the project declares cannot be given to them — ${secrets.problemes.join("; ")}` };
    const delaiMs = options.gates?.delaiMs ?? delaiDesGatesMs(options.env);
    // Le tour des gates que la station a reçu (`BRIGADE_GATES_VERROU`), que `environnementCook` écarte avec les autres `BRIGADE_*` :
    // les gates d'un test qui joue celles du dépôt n'attendent pas le tour que tiennent les gates qui le jouent.
    const verrou = options.env.BRIGADE_GATES_VERROU;
    const envGates = { ...environnementCook(options.env), ...(verrou === undefined ? {} : { BRIGADE_GATES_VERROU: verrou }) };
    const gates = await jouerGates({
      worktree,
      ticket: ticket.number,
      env: { ...envGates, ...secrets.env },
      masquer: secrets.masquer,
      interdites: options.gates?.sansIdentite ? VARIABLES_GITHUB : [],
      delaiMs,
      cloison,
      signal: abandon.signal,
    });
    if (abandon.signal.aborted) return { subi: "the station stopped during the gates of the delivery, before its push" };
    const { vert, resume, detail } = verdictDesGates(gates, delaiMs);
    if (vert) {
      arbresRouges.delete(ticket.number);
      return null;
    }
    const echec = `its gates are red, so its delivery was not pushed: ${resume}`;
    // Rouges sous la charge de la machine, elles ne disent rien du code (#4211) : aucun essai raté, et la
    // livraison part quand même (#4366) — la CI de la PR rejoue tout sur des machines calmes et juge avant le
    // merge (#4141). Attendre que la machine se calme coûtait 30 min et plus par ticket pour un rouge sans objet.
    // Rouges pour le code, comme avant : les tests rouges par leur nom et la fin de leur sortie (#4113).
    let sousCharge = false;
    await enregistrerGatesRouges({
      ticket: ticket.number,
      gates,
      lireCharge,
      // L'essai raté se compte au retour du cook, sur `echec`, comme avant.
      essais: { ajouter: () => void (arbre !== null && arbresRouges.set(ticket.number, { arbre, echec, detail })) },
      journal: { ecrire: () => undefined },
      rail: { remettre: () => void (sousCharge = true) },
    });
    if (!sousCharge) return { echec, detail };
    avertir(`brigade : #${ticket.number} — its gates are red under machine load, not because of its code: its delivery is pushed and the CI of its PR judges it (#4366)`);
    return null;
  };
  const cuisinerLeTicket: Cuisiner = async (ticket, calibrage, suivre = false) => {
    const run = runDuTicket(ticket.number);
    // Son cook a survécu à une vie précédente de la station (#4401) : il est
    // suivi, pas relancé, dans son worktree tel qu'il le tient. Rien de ce qui
    // prépare un cook n'y touche. Pris à neuf, ce qu'une vie précédente en a
    // laissé ne se reprend pas : son relais est arrêté.
    let suivi = suivre ? lireLaReprise(run) : null;
    // Son relais est mort sans écrire de fin — la machine a redémarré — : il
    // n'y a rien à suivre, et le ticket repart à neuf, worktree préparé.
    if (suivi !== null && suivi.fin === undefined && !relaisASuivre(suivi.flux ?? join(options.flux, `${run}.flux.jsonl`))) suivi = null;
    if (suivi === null) {
      arreterParLeRelais(join(options.flux, `${run}.flux.jsonl`));
      rmSync(repriseDuRun(run), { force: true });
    }
    // Le ticket, lu ici : dans le bac à sable, le `gh` du cook n'a aucun
    // identifiant, et `gh issue view` lui serait refusé.
    let joint: string;
    let corpsDuTicket = "";
    // Ses critères admettent un constat écrit pour tout livrable (#2854).
    let constatAdmis: boolean;
    let brigade = false;
    let commentairesDuTicket: { body: string; association: string }[] = [];
    try {
      const [lue, commentaires] = await Promise.all([options.github.issue(ticket.number), options.github.commentaires(ticket.number)]);
      if (lue === null) throw new Error("the issue no longer exists");
      commentairesDuTicket = commentaires;
      joint = ticketJoint({ number: ticket.number, title: lue.title, body: lue.body ?? "", commentaires });
      corpsDuTicket = lue.body ?? "";
      constatAdmis = admetUnConstat(lue.body ?? "");
      brigade = livreSousBrigade(lue.body ?? "", commentaires.map(({ body }) => body));
    } catch (erreur) {
      // La limite de GitHub se dit en français au chef (`status`) : le commentaire qui la porte sur le dépôt la dit en anglais (#4056).
      if (erreur instanceof LimiteGitHubAtteinte) return { subi: `its ticket could not be read on GitHub: the kitchen's GitHub calls are held back until ${new Date(erreur.resetAt).toISOString()}` };
      return { echec: `its ticket could not be read on GitHub: ${message(erreur)}` };
    }
    let lieu: { worktree: string; branche: string };
    // Le run d'un ticket est toujours le même : la branche d'un cook précédent
    // (livrée, ou refusée par la pass) est encore là, et `preparer` ne sait pas
    // la recréer. Le cook en repart, comme d'un renvoi — et elle n'est pas à
    // jeter s'il échoue : elle porte une livraison.
    const reprise = suivi?.reprise ?? depot.connait(brancheDuTicket(ticket.number));
    try {
      lieu = suivi !== null ? { worktree: suivi.worktree, branche: brancheDuTicket(ticket.number) } : reprise ? { worktree: await depot.reprendre(run, brancheDuTicket(ticket.number)), branche: brancheDuTicket(ticket.number) } : await depot.preparer(run);
    } catch (erreur) {
      const absente = /couldn't find remote ref (?:refs\/heads\/)?(\S+)/.exec(message(erreur))?.[1];
      if (absente === base) return { baseAbsente: absente };
      // Le fetch de la base échoue (réseau, jeton, origine) : c'est l'état de la station, pas celui du ticket, et le rejouer ticket après ticket les userait tous.
      // Seule `preparer` y mène (jamais `reprendre`, dont le fetch est celui de la branche du ticket), et un échec d'une autre sorte reste celui du ticket. L'arrêt se lève seul (`REPIT_BASE_INJOIGNABLE_MS`).
      if (!reprise && /\bfetch\b/.test(message(erreur)) && message(erreur).includes(base)) return { baseInjoignable: message(erreur) };
      return { echec: `its worktree could not be prepared: ${message(erreur)}` };
    }
    const { worktree, branche } = lieu;
    lieuxEnVol.set(ticket.number, lieu);
    // La tête que le cook reprend : s'il n'y ajoute rien, il n'a rien livré
    // (#2372) — sans quoi la pass ressort une tête déjà renvoyée, et le ticket
    // boucle entre elle et les cooks sans qu'aucun échec ne compte.
    let avant = suivi !== null ? suivi.avant : reprise && depot.tete !== undefined ? depot.tete(branche) : null;
    // La PR de cette branche, si elle est encore ouverte et qu'elle ne se merge
    // pas : en conflit avec la base, ou rouge. Le cook doit la remettre à jour (#2454).
    let resteAFaire: string | null = null;
    // Ses checks rouges : ce qu'ils disent est remis au cook (#2545).
    let rouges: Check[] = [];
    let nomsRouges: string[] = [];
    // La branche n'a jamais eu de PR : sa livraison n'est jamais arrivée en pass (#2577).
    let sansPR = false;
    // Ce que la livraison renvoyée laisse au cook : remarques, checks rouges, diff (#2590).
    let renvoi: Renvoi | null = null;
    // La PR ouverte que le cook reprend : il peut y répondre aux remarques (#2592).
    let prOuverte: number | null = null;
    // Cette PR est en conflit avec la base : c'est un renvoi pour conflit (#2953).
    let enConflit = false;
    // Sa PR a été fermée sans être mergée (la seconde en a fermé une pour défaire un blocage, #3979) (#3990).
    let prFermee = false;
    if (reprise) {
      try {
        const ouverte = await options.github.prDeBranche(branche);
        sansPR = ouverte === null;
        prFermee = ouverte !== null && ouverte.state === "closed" && !ouverte.merged;
        if (ouverte !== null && ouverte.state === "open") {
          prOuverte = ouverte.number;
          if (ouverte.enConflit === true) enConflit = true;
          if (ouverte.enConflit === true) resteAFaire = `PR #${ouverte.number} conflicts with \`${base}\``;
          else {
            const checks = await options.github.ci(ouverte.sha);
            if (etatDeLaBase(checks) === "red") {
              resteAFaire = `the CI of PR #${ouverte.number} is red`;
              rouges = checks.filter((check) => check.outcome === "red");
              nomsRouges = rouges.map((check) => check.name).sort();
            }
          }
          renvoi = await lireLeRenvoi(options.github, ouverte, rouges, depot.diff(branche));
        }
      } catch {
        // Illisible, la PR ne retient pas le cook : il part comme avant.
      }
    }
    // Une tête poussée sans PR est une livraison coupée entre son push et sa PR
    // — la station arrêtée là, GitHub qui refuse la PR. Elle part en pass telle
    // quelle : un cook relancé dessus la trouvait finie, n'y ajoutait rien, et
    // son essai comptait pour un échec, trois fois jusqu'à `served-elsewhere` (#2577).
    // Une tête qui garde le travail d’un cook arrêté sans livraison n’est pas
    // une livraison : un cook la reprend (#2586).
    // Le travail d'un run tué par la garde d'inactivité, gardé sur sa branche (#3649) :
    // le cook en repart, et sa consigne nomme la branche et ses commits.
    const repriseDeGarde = reprise && estUneRepriseDeGarde(depot.sujet?.(branche));
    const sauvee = reprise && (estUneSauvegarde(depot.sujet?.(branche)) || repriseDeGarde);
    const lancerGit = depot.lancerGit === undefined ? undefined : (args: string[], cwd: string) => depot.lancerGit!(args, cwd);
    if (repriseDeGarde) joint += `\n\n${consigneDuRunPrecedent(branche, await commitsDuRunPrecedent(lancerGit, worktree, base))}`;
    else if (sauvee) joint += `\n\n## Work saved by the previous cook\n\nThe previous cook on this ticket stopped before delivering: it declared itself blocked and the chef has answered on this issue, or the station's gates were red on its delivery, which was not pushed (this issue's comments say which). Its work in progress is committed on this branch (last commit: \`${SUJET_DE_SAUVEGARDE}\`). Read what it did (\`git log\`, \`git show HEAD\`) and continue from where it stopped, do not start over.`;
    if (suivi === null && sansPR && !sauvee && avant !== null && depot.livree !== undefined) {
      const livree = depot.livree(branche);
      // `livree` rend la branche locale quand l'origine n'a pas la sienne
      // (`reprendre` vient de relire l'origine) : elle n'est alors pas poussée,
      // quoi que dise le clone (#2610). Elle part d'abord sur GitHub ; si le push
      // échoue, un cook la reprend.
      let surGitHub = livree !== branche;
      // Elle ne part qu'une fois les gates vertes dans son worktree (#3996) :
      // rouges, un cook la reprend, avec ce qu'elles disent.
      const retenue = surGitHub || depot.commits(branche) === 0 ? null : await gatesAvantLePush(ticket, worktree);
      if (retenue !== null) {
        if ("subi" in retenue) {
          await depot.ranger(worktree, branche);
          return retenue;
        }
        avertir(`brigade : #${ticket.number} sur ${nom} — \`${branche}\` carries a delivery that was never pushed, and ${retenue.echec}: a cook resumes it`);
        joint += `\n\n## Gates red on the delivery\n\nThis branch carries a delivery that was never pushed: ${retenue.echec}. Fix what is red, run the gates and commit.${retenue.detail === undefined || retenue.detail === "" ? "" : `\n\nWhat the gates said:\n\n${retenue.detail}`}`;
      }
      if (!surGitHub && retenue === null && depot.commits(branche) > 0) {
        try {
          depot.pousser(branche);
          surGitHub = true;
        } catch (erreur) {
          avertir(`brigade : #${ticket.number} sur ${nom} — \`${branche}\` is only in the clone and could not be pushed (${message(erreur)}): a cook resumes it`);
        }
      }
      if (surGitHub && depot.tete?.(depot.livree(branche)) === avant) {
        depot.retirer(worktree);
        avertir(`brigade : #${ticket.number} sur ${nom} — \`${branche}\` carries a delivery that never reached the pass (pushed, no PR): it goes to the pass as is, without a cook`);
        return { branche };
      }
    }
    // Au départ du cook, sa branche porte la tête de `origin/<base>` (#3001).
    // Une branche neuve en part déjà : `preparer` vient de la rapatrier. Une
    // branche reprise, la station la rapatrie et l'y fusionne ; en conflit,
    // elle suit le renvoi pour conflit, juste après. Une fusion qui bute sur
    // des conflits revient au cook du ticket lui-même : la station la retente
    // sans commit et lui laisse les marqueurs, fichiers nommés (#3476). Une
    // fusion qui échoue autrement est défaite, et le cook part de sa branche
    // telle quelle. La fusion n'est pas une livraison du cook : c'est d'elle
    // que se compte ce qu'il ajoute.
    let consigneIntegree: string | null = null;
    // Les fichiers en conflit avec la base que ce cook a reçus à résoudre (#3476).
    let conflit: string[] | null = null;
    if (suivi === null && reprise && !enConflit && lancerGit !== undefined) {
      const depart = await partirSurLaBase(lancerGit, worktree, base);
      if (depart.etat === "fusionnee" && avant !== null) avant = depot.tete?.(branche) ?? avant;
      if (depart.etat === "conflit") {
        conflit = depart.fichiers;
        consigneIntegree = depart.consigne;
        resteAFaire = `\`${branche}\` does not take \`origin/${base}\` as is`;
        avertir(`brigade : #${ticket.number} sur ${nom} — \`${branche}\` conflicts with \`origin/${base}\`${depart.fichiers.length > 0 ? ` in ${depart.fichiers.join(", ")}` : ""}: the ticket's own cook resolves it in its branch`);
      }
      if (depart.etat === "echec") avertir(`brigade : #${ticket.number} sur ${nom} — the station could not bring \`${branche}\` up to date with \`origin/${base}\` before the cook (${depart.etape}: ${depart.detail}): the cook starts from its branch as is`);
    }
    // Un renvoi pour conflit : la station intègre la base avant le cook, qui
    // reçoit la branche avec la fusion tentée, conflits non commités (#2953).
    if (suivi === null && enConflit && lancerGit !== undefined) {
      const integration = await integrerAvantLeCook(lancerGit, worktree, base);
      consigneIntegree = consigneDeLIntegration(integration, base);
      if (integration.etat === "conflit") conflit = integration.fichiers;
      if (integration.etat === "echec") avertir(`brigade : #${ticket.number} sur ${nom} — the station could not merge \`origin/${base}\` (${integration.etape}: ${integration.detail}): the cook does it itself`);
    }
    if (suivi !== null) ({ conflit, reste: resteAFaire } = suivi);
    if (resteAFaire !== null && consigneIntegree !== null) {
      joint += `\n\n## Work left on the delivery\n\n${resteAFaire}. ${consigneIntegree}`;
    } else if (resteAFaire !== null) {
      joint += `\n\n## Work left on the delivery\n\n${resteAFaire}. Bring the branch up to date with \`origin/${base}\` (\`git fetch origin ${base}\`, then rebase or merge), resolve the conflicts, fix what is red, run the gates and commit. If the old branch cannot be saved, start again from \`origin/${base}\` and redo the work. Adding nothing is not an option.`;
    } else if (prOuverte !== null) joint += `\n\n${consigneDuDesaccord(prOuverte)}`;
    const brief = briefDuRenvoi(renvoi, base);
    if (brief !== "") joint += `\n\n${brief}`;
    // Les outils que le ticket demande et que le projet déclare (#4162) ; un
    // outil demandé et non déclaré est dit, ici et au cook.
    const outils = outilsDuCook({ projet: options.projet?.(), corpsDuTicket });
    if (outils.message) avertir(`brigade : #${ticket.number} sur ${nom} — ${outils.message}`);
    const consigneOutils = consigneDesOutils(ticket.number, outils);
    if (consigneOutils) joint += `\n\n${consigneOutils}`;
    // Les tests de sa zone, et eux seuls (#4301) ; illisible, il ne reçoit que la règle, jamais une liste inventée.
    const zoneDuCook = zoneDeclaree(corpsDuTicket, fiche(commentairesDuTicket.map(({ body }) => body)));
    try {
      joint += `\n\n## Tests to play\n\n${selectionnerTests(zoneDuCook, worktree).consigne}`;
    } catch (erreur) {
      avertir(`brigade : #${ticket.number} sur ${nom} — the tests of its zone could not be listed: ${message(erreur)}`);
      joint += `\n\n## Tests to play\n\n${consigneDesTestsDeLaZone([], [])}`;
    }
    // Le worktree rendu prêt avant que le cook n'y entre (#2535) : sans ses
    // dépendances, ses premières gates sortaient rouges — contrôle de types
    // injouable —, et il les rejouait après le setup. Le setup part sans le
    // jeton de Claude, comme les gates ; ce qu'il exporte vaut pour le cook.
    // En échec, le cook part comme avant, dans le worktree tel quel.
    let envDuCook = sansJeton();
    if (options.setup !== undefined && suivi === null) {
      const setup = await jouerSetup({ worktree, ticket: ticket.number, env: envDuCook, delaiMs: options.setup.delaiMs, interdites: interditesAuSetup, cloison, signal: abandon.signal });
      if (abandon.signal.aborted) {
        depot.retirer(worktree, reprise ? undefined : branche);
        return { subi: "the station stopped during the worktree setup" };
      }
      if (setup.pret) envDuCook = setup.env;
      else avertir(`brigade : #${ticket.number} sur ${nom} — \`${SCRIPT_SETUP}\` failed (${setup.depasse ? `stopped after ${Math.round(options.setup.delaiMs / 1000)} s` : `exit code ${setup.code ?? "none"}`}): the cook starts in its worktree as is`);
    }
    // Le travail du cook, tel que la fiche du projet le dit (#4237). Refusée, aucun cook ne part.
    let ficheDuCook: FaitsDeLaCuisine["cook"];
    try {
      ficheDuCook = faitsDuDossier(worktree, base).cook;
    } catch (erreur) {
      depot.retirer(worktree, reprise ? undefined : branche);
      return { subi: `the project sheet is refused, no cook starts: ${message(erreur)}` };
    }
    const flux = join(options.flux, `${run}.flux.jsonl`);
    const texte = consigne({ ticket: ticket.number, titre: ticket.title, depot: depotGitHub, base, joint, fiche: ficheDuCook });
    // Gardé (#3506) : ses écritures restent dans son worktree, son `gh` sur son ticket.
    const args = garderLeCook(lancementDuClaude(argumentsClaude(calibrage), worktree, [], brigade), { worktree, ticket: ticket.number, depot: depotGitHub, branche });
    // Sur le moteur de la station (#3744) : `claude` tel quel, à la clé d'API, ou Codex.
    const surLeMoteur = lancementDuCook(moteur, { claude: { commande: options.claude, args, env: env(envDuCook) }, worktree, calibrage });
    if ("refus" in surLeMoteur) {
      depot.retirer(worktree, reprise ? undefined : branche);
      return { subi: surLeMoteur.refus };
    }
    const lancement = envelopper(cloison, { commande: surLeMoteur.commande, args: surLeMoteur.args }, { cwd: worktree, depot: "ecriture" });
    const aReprendre: Reprise = suivi ?? { worktree, avant, reprise, conflit, reste: resteAFaire };
    const lance: ReturnType<Lancer> = aReprendre.fin === undefined ? lancerLeCook({ ...lancement, entree: texte, cwd: worktree, env: surLeMoteur.env, flux, ticket: ticket.number, suivre: suivi !== null }) : { fin: Promise.resolve(aReprendre.fin), flux: aReprendre.flux ?? flux };
    // Le flux de son relais, où la station relancée regarde s'il vit encore.
    if (suivi === null) writeFileSync(repriseDuRun(run), JSON.stringify({ ...aReprendre, flux: lance.flux ?? flux } satisfies Reprise));
    const fin = await lance.fin;
    // La station s'arrête pendant son cook : il lui survit, et la station relancée le suit jusqu'à sa fin (#4401).
    if (arretee) return { subi: "the station stopped while its cook ran: the cook goes on, and the restarted station follows it" };
    writeFileSync(repriseDuRun(run), JSON.stringify({ ...aReprendre, fin, flux: lance.flux ?? flux } satisfies Reprise));
    const conclusion = fin.arret !== null ? `guard:${fin.arret.reason}` : verdict(lireLeFlux(lance.flux ?? flux), fin.code);
    if (conclusion !== "done") {
      // Tué par la garde d'inactivité, le cook laisse son travail sur sa
      // branche pour le run suivant (#3649). Sans rien laissé, ou s'il ne se
      // marque pas, le ticket repart comme avant.
      let garde = false;
      const recolter = depot.recolter;
      if (gardeLeTravail(conclusion) && recolter !== undefined) {
        try {
          garde = marquerLeTravail({ recolter, commits: (nom) => depot.commits(nom), ...(depot.tete === undefined ? {} : { tete: depot.tete }) }, worktree, branche, avant);
          if (garde) avertir(`brigade : #${ticket.number} sur ${nom} — the idle guard stopped the cook: its work stays on \`${branche}\`, and the next run starts from it`);
        } catch (erreur) {
          avertir(`brigade : #${ticket.number} sur ${nom} — the idle guard stopped the cook, and its work could not be kept on \`${branche}\`: ${message(erreur)}`);
        }
      }
      depot.retirer(worktree, reprise || garde ? undefined : branche);
      const dit = direLaFin({ conclusion, fin, flux: lance.flux ?? flux });
      if (arretSubi(conclusion, fin)) return { subi: dit, retour: lireLeFlux(lance.flux ?? flux).quota?.retour ?? null };
      // Jamais parti (#3656) : le ticket le dit, et la cuisine sert les autres.
      if (jamaisParti(fin)) return { echec: `the cook of #${ticket.number} never started, its launch failed: ${dit}. A launch that fails before the cook runs does not count toward the kitchen's breaker: the kitchen keeps serving other tickets` };
      return { echec: dit };
    }
    const arretDuCook = () => ({ message: lireLeFlux(lance.flux ?? flux).message ?? null, turns: fin.turns, code: fin.code });
    // Le cook déclare la décision ou la condition qui lui manque (#2073) : ce
    // qu'il a commité n'est pas une livraison, et ne part pas en pass (#2805).
    // Lu dans tout son dernier message : sur #755, un cook l'a écrit après son
    // `</livrable>`. Sans PR, sa branche garde la marque de travail sauvé
    // (#2586) : le cook qui reprend le ticket en repart, au lieu que la pass la
    // juge telle quelle (#2577).
    const question = lireBlocage(lireLeFlux(lance.flux ?? flux).message ?? null);
    // Un renvoi pour conflit qui bute sur le refus d'une commande git n'est pas
    // une question : la station intègre la base elle-même, ou repart de main.
    // Jamais un second renvoi, ni une carte pour le chef (#2953).
    let integree = false;
    if (question !== null && enConflit && lancerGit !== undefined) {
      try {
        const suite = await suiteDuBlocageTechnique(question, base, {
          git: lancerGit,
          worktree,
          recreerLaBranche: async () => {
            depot.retirer(worktree);
            depot.retirer((await depot.preparer(run)).worktree);
          },
        });
        if (suite === "recreee") return { subi: `the cook was refused a git command on a conflict send-back (${question.slice(0, 200)}): the branch restarts from \`origin/${base}\`, for another cook` };
        integree = suite === "integree";
      } catch (erreur) {
        return { echec: `the cook was refused a git command on a conflict send-back, and the station could not take over: ${message(erreur)}` };
      }
    }
    // Il lui manque des commits de la base : la station récolte ce qu'il a
    // laissé, rapatrie `origin/<base>` et la fusionne dans sa branche (#3001).
    // `cuire` en fait la suite, sans carte pour le chef.
    let miseAJour: MiseAJourDeLaBranche | undefined;
    // Arrêté sur un conflit qu'il avait à résoudre, le cook n'en laisse rien
    // de récolté : la fusion non commitée est défaite, marqueurs compris, et le
    // cook suivant la reçoit à nouveau de la station (#3476).
    if (question !== null && !integree && conflit !== null && lancerGit !== undefined) {
      const defaite = await lancerGit(["merge", "--abort"], worktree).catch(() => null);
      if (defaite === null || (defaite.code !== 0 && !/MERGE_HEAD missing|no merge to abort/i.test(defaite.stderr))) await lancerGit(["reset", "--hard", "--quiet", "HEAD"], worktree).catch(() => null);
    }
    if (question !== null && !integree && conflit === null && lancerGit !== undefined && demandeLaBase(question, base)) {
      try {
        depot.recolter?.(worktree, branche);
        miseAJour = await mettreAJourLaBranche(lancerGit, worktree, base);
      } catch (erreur) {
        miseAJour = { etat: "echec", etape: "recolte", detail: message(erreur), fichiers: [] };
      }
    }
    if (question !== null && !integree) {
      if (prOuverte === null && depot.recolter !== undefined) {
        try {
          depot.recolter(worktree, branche);
          if (depot.commits(branche) > 0 && !estUneSauvegarde(depot.sujet?.(branche))) depot.recolter(worktree, branche, SUJET_DE_SAUVEGARDE, true);
        } catch (erreur) {
          avertir(`brigade : #${ticket.number} sur ${nom} — the blocked cook's work could not be marked as saved on \`${branche}\`: ${message(erreur)}`);
        }
      }
      // La clé d'API du moteur n'est jamais poussée (#3744).
      const fuite = cleDansLaLivraison(surLeMoteur, depot, worktree, branche);
      if (fuite !== null) return { echec: fuite };
      await depot.ranger(worktree, branche);
      // Garé, pas poussé sur sa branche (#3996) : la PR ouverte dessus ne voit
      // pas le travail à moitié fait, et la CI n'y joue pas.
      if (depot.commits(branche) > 0) {
        try {
          depot.garer?.(branche);
        } catch (erreur) {
          avertir(`brigade : #${ticket.number} sur ${nom} — the blocked cook's work stays only in the clone, \`${branche}\` could not be parked on the origin: ${message(erreur)}`);
        }
      }
      return { bloque: question ?? "", ...(miseAJour === undefined ? {} : { miseAJour }), ...(conflit === null ? {} : { conflit }) };
    }
    // Il dit que le ticket est déjà satisfait sur la base : la station le vérifie
    // avant que le worktree ne soit rangé, puisque les gates s'y jouent (#3146).
    const messageFinal = lireLeFlux(lance.flux ?? flux).message ?? null;
    const affirmation = prOuverte === null ? lireDejaServi(messageFinal) : null;
    let dejaServi: { servi: DejaServi } | { refus: string } | null = null;
    if (affirmation !== null && depot.commits(branche) === 0) {
      dejaServi = await verifierLeDejaServi(ticket, worktree, affirmation);
    }
    const fuite = cleDansLaLivraison(surLeMoteur, depot, worktree, branche);
    if (fuite !== null) return { echec: fuite };
    // Une tête sauvée (#2586) n'est jamais allée en pass : le cook qui la livre
    // telle quelle, avec son livrable — ce que le manager répond au blocage
    // d'un cook dont le travail est fait —, livre. Sans quoi son essai comptait
    // pour un cook raté, « added nothing since its last delivery », sur #3036.
    const livreLaSauvegarde = sauvee && prOuverte === null && lireLivrable(lireLeFlux(lance.flux ?? flux).message ?? null).texte !== null;
    // Ce qui partira en livraison ne part qu'une fois les gates du projet
    // vertes dans son worktree (#3996), ce que le cook a laissé non commité
    // compris : récolté d'abord. Rouges, la branche garde la marque du travail
    // sauvé (#2586) : le cook suivant en repart, au lieu que la station la
    // pousse telle quelle, sans gates, comme une livraison coupée (#2577).
    depot.recolter?.(worktree, branche);
    const retenue = depot.commits(branche) > 0 && (livreLaSauvegarde || depot.tete?.(branche) !== avant) ? await gatesAvantLePush(ticket, worktree) : null;
    if (retenue !== null && "echec" in retenue && !estUneSauvegarde(depot.sujet?.(branche))) {
      try {
        depot.recolter?.(worktree, branche, SUJET_DE_SAUVEGARDE, true);
      } catch (erreur) {
        avertir(`brigade : #${ticket.number} sur ${nom} — the work whose gates are red could not be marked as saved on \`${branche}\`: ${message(erreur)}`);
      }
    }
    await depot.ranger(worktree, branche);
    if (retenue !== null) return retenue;
    // Une écriture refusée par le bac à sable n'est pas le fait du ticket : un
    // motif nommé, qui ne compte pas vers `served-elsewhere` (#2738).
    const refusee = lireLeFlux(lance.flux ?? flux).ecritureRefusee;
    if (depot.commits(branche) === 0 && refusee !== null) return { subi: `write refused by sandbox: ${refusee} (the cook committed nothing)` };
    if (depot.commits(branche) === 0) {
      if (affirmation !== null) {
        if (abandon.signal.aborted) return { subi: "the station stopped while it checked that the ticket is already satisfied" };
        if (dejaServi !== null && "servi" in dejaServi) return { dejaServi: dejaServi.servi, affirmation };
        return { echec: motifArretCook(`the cook stated that the ticket is already satisfied on \`${base}\`, but the station could not confirm it: ${dejaServi !== null && "refus" in dejaServi ? dejaServi.refus : "nothing was checked"}`, arretDuCook()), fini: true };
      }
      // Sans commit, le constat qu'il a délimité est le livrable d'un ticket
      // dont les critères l'admettent (#2854). Une PR encore ouverte attend
      // une livraison sur sa branche : là, rien commité reste un échec.
      const constat = constatAdmis && prOuverte === null ? lireLivrable(lireLeFlux(lance.flux ?? flux).message ?? null).texte : null;
      if (constat !== null) return { constat };
      return { echec: motifArretCook("the cook committed nothing", arretDuCook()), fini: true };
    }
    // Sa réponse aux remarques, que la station poste pour lui sur la PR (#2592).
    const reponse = prOuverte === null ? null : reponseDuMessage(lireLeFlux(lance.flux ?? flux).message ?? null);
    const tete = depot.tete?.(branche);
    if (prOuverte !== null && reponse !== null && tete !== undefined) {
      await options.github.commenter(prOuverte, corpsDeLaReponse(tete, reponse)).catch((erreur: unknown) => avertir(`brigade : #${ticket.number} sur ${nom} — the cook's reply could not be posted on PR #${prOuverte}: ${message(erreur)}`));
    }
    if (avant !== null && tete === avant && !livreLaSauvegarde) {
      if (resteAFaire !== null) return { reste: resteAFaire, rouges: nomsRouges };
      // La branche porte déjà une livraison et sa PR a été fermée sans merge : le cook n'a rien à y ajouter,
      // la station la remet en pass, qui rouvre la PR. Ce n'est pas un cook raté (#3990).
      if (prFermee && !sauvee) {
        avertir(`brigade : #${ticket.number} sur ${nom} — \`${branche}\` already carries a delivery and its PR was closed: it goes to the pass, not counted as a failed cook`);
        return { branche };
      }
      // Il a répondu sur la PR depuis le renvoi : un désaccord, pas un échec —
      // la livraison repart en pass, qui juge sa réponse (#2592).
      if (prOuverte !== null && "desaccord" in classerArret(await options.github.commentaires(prOuverte).catch(() => []), avant, "")) return { branche };
      // Un cook qui s'arrête dans ses premiers tours n'a pas travaillé sur les
      // remarques de la relecture : ce n'est pas un essai (#2508).
      if (fin.turns <= TOURS_POUR_TRAVAILLER) return { court: true, subi: `the cook stopped after ${fin.turns} turn${fin.turns === 1 ? "" : "s"}, before it could work on the review's remarks, and added nothing since its last delivery` };
      return { echec: motifArretCook("the cook added nothing since its last delivery", arretDuCook()), fini: true };
    }
    // Trois runs rouges de suite sur le même check : pas de quatrième (#3953).
    // Comptés depuis le dernier relancement du ticket. Une branche neuve n'a
    // jamais été poussée : elle n'a aucun run, et rien ne se lit.
    const lireLesRuns = options.github.ciDeLaBranche?.bind(options.github);
    if (reprise && lireLesRuns !== undefined) {
      const statuts = statutsDesRuns(lireLesRuns, brancheDuTicket, await relanceDe({ retraitsDeLabels: async (numero) => (await options.github.retraitsDeLabels?.(numero)) ?? [] }, ticket.number));
      const decision = await deciderDuPush({ statuts, ticket: ticket.number, commenter: (issue, corps) => options.github.commenter(issue, corps) });
      if (decision.pousser && decision.illisible !== undefined) avertir(`brigade : #${ticket.number} sur ${nom} — the CI runs of \`${branche}\` could not be read, the push goes ahead: ${decision.illisible}`);
      if (!decision.pousser) {
        if (decision.nonDit !== undefined) avertir(`brigade : #${ticket.number} sur ${nom} — the comment on the ${ROUGES_DE_SUITE} red runs could not be posted: ${decision.nonDit}`);
        return { arrete: `its CI is red on \`${decision.check}\` ${ROUGES_DE_SUITE} runs in a row` };
      }
    }
    try {
      depot.pousser(branche);
    } catch (erreur) {
      return { echec: `its branch could not be pushed: ${message(erreur)}` };
    }
    // Le moteur de la livraison, et son coût à la clé d'API (#3744). Non
    // écrits, la livraison part quand même.
    try {
      noterLaLivraison(options.flux, { ticket: ticket.number, branche, moteur, flux: lance.flux ?? flux, at: new Date() });
    } catch (erreur) {
      avertir(`brigade : #${ticket.number} sur ${nom} — the engine and cost of this delivery could not be recorded: ${message(erreur)}`);
    }
    // Ce qu'il a changé à l'écran, pour le brief de la carte du chef (#3330).
    const aLEcran = lirePointsALEcran(messageFinal);
    // Et ses lignes de changement, pour le corps de la PR (#3617).
    const changements = lireChangements(messageFinal);
    return { branche, ...(aLEcran === null ? {} : { aLEcran }), ...(changements === null ? {} : { changements }) };
  };

  // La relecture d'une tête dans son worktree : le reviewer, sous la cloison,
  // en lecture seule, sans jeton GitHub ni secret du projet.
  // `ticket` : celui dont elle relit la livraison, absent pour une PR du dehors (#3656).
  const relecture = async (worktree: string, run: string, texte: string, pr: Pick<PRAFusionner, "number" | "sha">, ticket?: number): Promise<Lue> => {
    const flux = join(options.flux, `${run}-${pr.sha.slice(0, 12)}.flux.jsonl`);
    const lancement = { ...envelopper(cloison, { commande: options.claude, args: dansLeBacASableLocal(options.bacASable, argumentsReviewer(current(options.reviewer)), worktree) }, { cwd: worktree, depot: "lecture" }), entree: texte };
    const lance = lancer({ ...lancement, cwd: worktree, env: env(), flux, ...(ticket === undefined ? {} : { ticket }) });
    await lance.fin;
    const lue = lireRelecture(lireLeFlux(lance.flux ?? flux).message);
    if ("illisible" in lue) throw new Error(`the review of PR #${pr.number} is unreadable: ${lue.illisible}`);
    return lue.relecture;
  };
  // Seul un constat d'une catégorie nommée bloque ; les autres sont des conseils (#3504).
  const constatsDe = ({ findings }: Pick<Lue, "findings">) => findings.map((constat) => `- ${constat.severity === "blocking" ? "**Blocking**" : "Advice"}${constat.file === null ? "" : ` (\`${constat.file}\`)`}: ${constat.text}`);
  const relireDans = async (worktree: string, run: string, texte: string, pr: Pick<PRAFusionner, "number" | "sha">): Promise<Jugement> => {
    const lue = await relecture(worktree, run, texte, pr);
    return { verdict: verdictDeLaRelecture(lue), motif: [lue.summary, ...constatsDe(lue)].join("\n") };
  };

  const juger: Juger = async (ticket, pr) => {
    const branche = brancheDuTicket(ticket.number);
    const run = `review-${ticket.number}-github`;
    const worktree = await depot.reprendre(run, branche);
    try {
      const issue = await options.github.issue(ticket.number);
      const diff = { fichiers: depot.changes(branche), texte: depot.diff(branche) };
      const criteres = lireLaCarte(issue?.body ?? "").criteria;
      // Conseil seul (#3511) : les fichiers hors de la zone annoncée, en une ligne sur la PR.
      await signalerHorsZone({ zone: async () => zoneDeclaree(issue?.body ?? "", fiche((await options.github.commentaires(ticket.number)).map(({ body }) => body))), fichiers: diff.fichiers, pr: pr.number, commentaires: async () => (await options.github.commentaires(pr.number)).map(({ body }) => body), commenter: (numero, corps) => options.github.commenter(numero, corps), avertir });
      // La réponse du cook aux remarques d'avant, s'il en a posté une : la pass la juge (#2592).
      const reponse = reponseDuCook(await options.github.commentaires(pr.number), pr.sha);
      // Les règles de la maison, telles que la fiche du projet les dit (#4237). Refusée, la relecture ne part pas.
      const regles = faitsDuDossier(worktree, base).passe.rules;
      const texte = avecLeDesaccord(consigneDeRelecture({ depot: depotGitHub, base, ticket: { number: ticket.number, title: ticket.title, body: issue?.body ?? "" }, commentaires: [], compteRendu: null, diff, criteres, regles }), reponse);
      // La relecture seule juge la livraison, avec la CI de sa PR (#4398).
      const lue = await relecture(worktree, run, texte, pr, ticket.number);
      return { verdict: verdictDeLaRelecture(lue), motif: [lue.summary, ...constatsDe(lue)].join("\n") };
    } finally {
      depot.retirer(worktree);
    }
  };

  // Les PR externes (#2933) : leur tête, rapatriée de `refs/pull/<n>/head`
  // dans un worktree détaché, se relit et joue ses gates sans aucun secret du
  // projet ni jeton GitHub, quelle que soit l'identité de la station. Elles ne
  // se servent que sur une station qui joue les gates, et dont le dépôt sait
  // rapatrier une PR.
  const { recevoirPR, tete } = depot;
  const reglageDesGates = options.gates;
  const teteExterne = async (pr: PRExterne, run: string) => {
    if (recevoirPR === undefined || tete === undefined) throw new Error("this station's clone cannot fetch an outside PR");
    const lieu = await recevoirPR(run, pr.number);
    if (tete(lieu.reference) !== pr.sha) {
      depot.retirer(lieu.worktree);
      throw new Error(`the fork moved: the station fetched another head than PR #${pr.number}'s \`${pr.sha.slice(0, 7)}\``);
    }
    return lieu;
  };
  const externes: ServiceDesPRExternes | undefined =
    reglageDesGates === undefined || recevoirPR === undefined || tete === undefined
      ? undefined
      : {
          juger: async (pr) => {
            const run = `review-pr-${pr.number}-github`;
            const { worktree, reference } = await teteExterne(pr, run);
            try {
              const lue = await options.github.issue(pr.number);
              const diff = { fichiers: depot.changes(reference), texte: depot.diff(reference) };
              const ticket = { number: pr.number, title: `Outside PR #${pr.number} — ${lue?.title ?? "(no title)"}`, body: `This is a pull request opened from a fork, not a ticket of the kitchen: judge its diff against what its description below asks.\n\n${lue?.body ?? ""}` };
              return await relireDans(worktree, run, consigneDeRelecture({ depot: depotGitHub, base, ticket, commentaires: [], compteRendu: null, diff, regles: faitsDuDossier(worktree, base).passe.rules }), pr);
            } finally {
              depot.retirer(worktree);
            }
          },
          gates: async (pr) => {
            const { worktree } = await teteExterne(pr, `gates-pr-${pr.number}-github`);
            try {
              if (!aDesGates(worktree)) return { nonJouees: `the PR's tree has no \`${gatesManquantes(worktree).join("`, `")}\`, which its sheet names` };
              // Ni les secrets du projet (aucun `lireSecrets`), ni jeton GitHub, ni de Claude.
              const gates = await jouerGates({ worktree, ticket: pr.number, env: sansJeton(), interdites: VARIABLES_GITHUB, delaiMs: reglageDesGates.delaiMs, cloison, signal: abandon.signal });
              if (abandon.signal.aborted) throw new Error("the station stopped during the gates");
              return verdictDesGates(gates, reglageDesGates.delaiMs);
            } finally {
              depot.retirer(worktree);
            }
          },
          humains: () => humainsDuProjet(options.projet?.()),
        };

  // Le manager consulté sur le blocage d'un cook (#2894) : dans un worktree de
  // la branche du ticket, où le cook a laissé son travail, avec les outils de
  // lecture du reviewer, pour vérifier dans le dépôt ce que la question demande.
  const calibrageDuManager = options.manager;
  const consulter: ConsulterLeManager | undefined =
    calibrageDuManager === undefined
      ? undefined
      : async (ticket, { question, reponses }) => {
          const [lue, commentaires] = await Promise.all([options.github.issue(ticket.number), options.github.commentaires(ticket.number)]);
          if (lue === null) return { illisible: "the issue no longer exists" };
          const branche = brancheDuTicket(ticket.number);
          const run = `blocage-${ticket.number}-github`;
          const lieu = depot.connait(branche) ? { worktree: await depot.reprendre(run, branche), branche: null } : await depot.preparer(run);
          try {
            const texte = consigneDuBlocage({ depot: depotGitHub, issue: { number: ticket.number, title: lue.title, body: lue.body ?? "", labels: lue.labels }, commentaires: commentaires.slice(-DERNIERS_COMMENTAIRES).map(({ body }) => body), question, reponses });
            const flux = join(options.flux, `${run}-${reponses.length + 1}.flux.jsonl`);
            const lancement = { ...envelopper(cloison, { commande: options.claude, args: dansLeBacASableLocal(options.bacASable, argumentsReviewer(calibrageDuManager()), lieu.worktree) }, { cwd: lieu.worktree, depot: "lecture" }), entree: texte };
            const lance = lancer({ ...lancement, cwd: lieu.worktree, env: env(), flux, ticket: ticket.number });
            const fin = await lance.fin;
            const lu = lireLeFlux(lance.flux ?? flux);
            const conclusion = fin.arret !== null ? `guard:${fin.arret.reason}` : verdict(lu, fin.code);
            if (conclusion !== "done") return { illisible: `the manager's run did not finish: ${direLaFin({ conclusion, fin, flux: lance.flux ?? flux })}` };
            return lireAvis(lu.message ?? null);
          } finally {
            depot.retirer(lieu.worktree, lieu.branche ?? undefined);
          }
        };

  // Le manager consulté après le dernier essai raté d'un ticket (#3513) : dans
  // un worktree de la base, en lecture, avec les motifs de ses essais.
  const reprendre: ReprendreLeTicket | undefined =
    calibrageDuManager === undefined
      ? undefined
      : async (ticket, { calibrage, motifs }) => {
          const [lue, commentaires] = await Promise.all([options.github.issue(ticket.number), options.github.commentaires(ticket.number)]);
          if (lue === null) return { illisible: "the issue no longer exists" };
          const run = `reprise-${ticket.number}-github`;
          const lieu = await depot.preparer(run);
          try {
            const plafond = options.plafond?.() ?? PLAFOND_PAR_DEFAUT;
            const texte = consigneDeReprise({ depot: depotGitHub, issue: { number: ticket.number, title: lue.title, body: lue.body ?? "", labels: lue.labels }, commentaires: commentaires.slice(-DERNIERS_COMMENTAIRES).map(({ body }) => body), calibrage, plafond, motifs });
            const flux = join(options.flux, `${run}-${Date.now()}.flux.jsonl`);
            const lancement = { ...envelopper(cloison, { commande: options.claude, args: dansLeBacASableLocal(options.bacASable, argumentsReviewer(calibrageDuManager()), lieu.worktree) }, { cwd: lieu.worktree, depot: "lecture" }), entree: texte };
            const lance = lancer({ ...lancement, cwd: lieu.worktree, env: env(), flux, ticket: ticket.number });
            const fin = await lance.fin;
            const lu = lireLeFlux(lance.flux ?? flux);
            const conclusion = fin.arret !== null ? `guard:${fin.arret.reason}` : verdict(lu, fin.code);
            if (conclusion !== "done") return { illisible: `the manager's run did not finish: ${direLaFin({ conclusion, fin, flux: lance.flux ?? flux })}` };
            return lireReprise(lu.message ?? null, calibrage, plafond);
          } finally {
            depot.retirer(lieu.worktree, lieu.branche ?? undefined);
          }
        };

  // Le manager consulté sur une attente tenue plus d'une heure (#3764) : dans
  // un worktree de la base, en lecture, avec le ticket et ceux qu'il attend.
  const revoirLAttente: RevoirLAttente | undefined =
    calibrageDuManager === undefined
      ? undefined
      : async (ticket, { attendus, depuisMs }) => {
          const [lue, commentaires] = await Promise.all([options.github.issue(ticket.number), options.github.commentaires(ticket.number)]);
          if (lue === null) return { illisible: "the issue no longer exists" };
          const attendusLus = (await Promise.all(attendus.map((n) => options.github.issue(n).catch(() => null)))).flatMap((attendu, rang) => (attendu === null ? [] : [{ number: attendus[rang] as number, title: attendu.title, body: attendu.body ?? "", labels: attendu.labels }]));
          const run = `attente-longue-${ticket.number}-github`;
          const lieu = await depot.preparer(run);
          try {
            const corps = commentaires.map(({ body }) => body);
            const texte = consigneDeLAttenteLongue({ depot: depotGitHub, issue: { number: ticket.number, title: lue.title, body: lue.body ?? "", labels: lue.labels }, commentaires: corps.slice(-DERNIERS_COMMENTAIRES), attendus, attendusLus, origine: origineDeLAttente(lue.body ?? "", corps, attendus), heures: Math.floor(depuisMs / 3_600_000) });
            const flux = join(options.flux, `${run}-${Date.now()}.flux.jsonl`);
            const lancement = { ...envelopper(cloison, { commande: options.claude, args: dansLeBacASableLocal(options.bacASable, argumentsReviewer(calibrageDuManager()), lieu.worktree) }, { cwd: lieu.worktree, depot: "lecture" }), entree: texte };
            const lance = lancer({ ...lancement, cwd: lieu.worktree, env: env(), flux, ticket: ticket.number });
            const fin = await lance.fin;
            const lu = lireLeFlux(lance.flux ?? flux);
            const conclusion = fin.arret !== null ? `guard:${fin.arret.reason}` : verdict(lu, fin.code);
            if (conclusion !== "done") return { illisible: `the manager's run did not finish: ${direLaFin({ conclusion, fin, flux: lance.flux ?? flux })}` };
            return lireRevue(lu.message ?? null);
          } finally {
            depot.retirer(lieu.worktree, lieu.branche ?? undefined);
          }
        };

  // Le manager au run du superviseur (#3945) : dans un worktree de la base,
  // en lecture, avec le dossier que le superviseur lui donne.
  if (calibrageDuManager !== undefined)
    options.superviseur?.(async (texte) => {
      const run = "superviseur-github";
      const lieu = await depot.preparer(run);
      try {
        const flux = join(options.flux, `${run}-${Date.now()}.flux.jsonl`);
        const lancement = { ...envelopper(cloison, { commande: options.claude, args: dansLeBacASableLocal(options.bacASable, argumentsReviewer(calibrageDuManager()), lieu.worktree) }, { cwd: lieu.worktree, depot: "lecture" }), entree: texte };
        const lance = lancer({ ...lancement, cwd: lieu.worktree, env: env(), flux });
        const fin = await lance.fin;
        const lu = lireLeFlux(lance.flux ?? flux);
        const conclusion = fin.arret !== null ? `guard:${fin.arret.reason}` : verdict(lu, fin.code);
        if (conclusion !== "done") return { illisible: `the manager's run did not finish: ${direLaFin({ conclusion, fin, flux: lance.flux ?? flux })}` };
        return lu.message === undefined || lu.message === null ? { illisible: "the manager's run left no answer" } : { message: lu.message };
      } finally {
        depot.retirer(lieu.worktree, lieu.branche ?? undefined);
      }
    });

  // Le second juge (#2555) : un lancement à part de la relecture, dans son
  // propre worktree et sous son propre flux, qui ne lit ni la relecture ni son
  // verdict — le modèle le plus fort, un effort haut, la consigne du plugin de
  // ce runtime, et les mêmes outils de lecture que le reviewer.
  const jugerEnSecond: JugerEnSecond = async (ticket, pr, juges) => {
    // Lue avant tout worktree : sans elle, rien à lancer.
    const consigne = (options.consigneDuSecondJuge ?? lireLaConsigne)();
    const branche = brancheDuTicket(ticket.number);
    const run = `second-judge-${ticket.number}-github`;
    const worktree = await depot.reprendre(run, branche);
    try {
      const issue = await options.github.issue(ticket.number);
      const diff = { fichiers: depot.changes(branche), texte: depot.diff(branche) };
      const texte = consigneDuSecondJuge(consigne, { depot: depotGitHub, base, pr: pr.number, ticket: { number: ticket.number, title: ticket.title, body: issue?.body ?? "" }, juges, diff });
      const flux = join(options.flux, `${run}-${pr.sha.slice(0, 12)}.flux.jsonl`);
      const lancement = { ...envelopper(cloison, { commande: options.claude, args: dansLeBacASableLocal(options.bacASable, argumentsReviewer(CALIBRAGE_DU_SECOND_JUGE), worktree) }, { cwd: worktree, depot: "lecture" }), entree: texte };
      const lance = lancer({ ...lancement, cwd: worktree, env: env(), flux, ticket: ticket.number });
      await lance.fin;
      const lu = lireSecondJugement(lireLeFlux(lance.flux ?? flux).message);
      if ("illisible" in lu) throw new Error(`the second judge of PR #${pr.number} is unreadable: ${lu.illisible}`);
      return lu;
    } finally {
      depot.retirer(worktree);
    }
  };

  // Le jugement du choix de design (#3609) : le reviewer, sous la cloison, en
  // lecture seule, lit le diff de la PR contre les critères du ticket.
  // Deux lancements ratés de suite, de la même erreur, sur la même tête : la pass ne le relance plus, il échouerait
  // encore (#3786). Une erreur autre, ou une tête neuve, repart d'un compte neuf.
  const echecsDuChoix = new Map<number, { sha: string; erreur: string; fois: number }>();
  const jugerLeChoixDeDesign = async (ticket: { number: number; title: string; body: string }, fichiers: readonly string[], pr: { number: number; sha: string }): Promise<ChoixDeDesign> => {
    const dernier = echecsDuChoix.get(ticket.number);
    if (dernier !== undefined && dernier.sha === pr.sha && dernier.fois >= 2) throw new Error(`${dernier.erreur} (failed ${dernier.fois} times in a row with the same error, not launched again for this head)`);
    try {
      const choix = await lancerLeChoixDeDesign(ticket, fichiers, pr);
      echecsDuChoix.delete(ticket.number);
      return choix;
    } catch (erreur) {
      const dit = erreur instanceof Error ? erreur.message : String(erreur);
      const memeEchec = dernier !== undefined && dernier.sha === pr.sha && dernier.erreur === dit;
      echecsDuChoix.set(ticket.number, { sha: pr.sha, erreur: dit, fois: memeEchec ? dernier.fois + 1 : 1 });
      throw erreur;
    }
  };
  const lancerLeChoixDeDesign = async (ticket: { number: number; title: string; body: string }, fichiers: readonly string[], pr: { number: number; sha: string }): Promise<ChoixDeDesign> => {
    const run = `design-${ticket.number}-github`;
    const worktree = await depot.reprendre(run, brancheDuTicket(ticket.number));
    try {
      const texte = consigneDuChoix({ ticket, fichiers, diff: depot.diff(brancheDuTicket(ticket.number)) });
      const flux = join(options.flux, `${run}-${pr.sha.slice(0, 12)}.flux.jsonl`);
      // La consigne part sur l'entrée du reviewer, pas sur sa ligne de commande : le diff la fait dépasser la limite des arguments (spawn E2BIG, #3786).
      const lancement = { ...envelopper(cloison, { commande: options.claude, args: dansLeBacASableLocal(options.bacASable, argumentsReviewer(current(options.reviewer)), worktree) }, { cwd: worktree, depot: "lecture" }), entree: texte };
      // Sans `ticket` : un lancement qui le porte remet la livraison en « cooking » et la sort de la pass (pass.ts, `cook.launched`) ; le run se lit par son nom (`design-<n>-`).
      const lance = lancer({ ...lancement, cwd: worktree, env: env(), flux });
      const fin = await lance.fin;
      if (fin.erreur !== null) throw new Error(`design review cannot start: ${fin.erreur}`);
      const lu = lireLeChoix(lireLeFlux(lance.flux ?? flux).message);
      if ("illisible" in lu) throw new Error(`the design judgment of PR #${pr.number} is unreadable: ${lu.illisible}`);
      return lu;
    } finally {
      depot.retirer(worktree);
    }
  };

  const station = stationGitHub({ ...(options.perimee === undefined ? {} : { perimee: options.perimee }), ...(revoirLAttente === undefined ? {} : { revoirLAttente }), ...(depot.fichiers === undefined ? {} : { fichiersSuivis: () => depot.fichiers?.() ?? [] }), survivant: (issue) => existsSync(repriseDuRun(runDuTicket(issue))), nom, places: options.places, base, github, prise: options.prise(github, nom), cuisiner, juger, jugerEnSecond, ciDesPR, gates: lieuDesGates, ...(consulter === undefined ? {} : { consulter }), ...(reprendre === undefined ? {} : { reprendre }), capacites: options.capacites ?? [], ...(externes === undefined ? {} : { externes }), ...(options.gardes === undefined ? {} : { gardes: options.gardes }), ...(options.avertir === undefined ? {} : { avertir: options.avertir }), ...(options.maintenant === undefined ? {} : { maintenant: options.maintenant }), ...(options.clone === undefined ? {} : { clone: options.clone }), depotServi: depotGitHub, ...(options.githubDeLaBrigade === undefined ? {} : { githubDeLaBrigade: options.githubDeLaBrigade }), ...(options.repertoireEtat === undefined ? {} : { repertoireEtat: options.repertoireEtat }), ...(options.sauter === undefined ? {} : { sauter: options.sauter }), ...(options.enPremier === undefined ? {} : { enPremier: options.enPremier }), ...(options.stationsDuProjet === undefined ? {} : { stationsDuProjet: options.stationsDuProjet }), jugerLeChoixDeDesign, designsValidesParUnHumain: () => designsValidesParUnHumain(options.projet?.()), ...(options.chef === undefined ? {} : { chef: options.chef }) });
  station.ficheDuProjet = options.projet ?? null;
  const arreterLeTour = station.arreter;
  station.arreter = () => {
    arretee = true;
    arreterLeTour?.();
  };
  station.porte = options.porte ?? null;
  station.lireCharge = lireCharge;
  station.lacune = options.lacune;
  const quitter = station.quitter;
  station.quitter = async () => {
    abandon.abort();
    await quitter?.();
  };
  return station;
}
