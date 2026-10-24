// La pass : elle juge ce qu'un cook a livré — les gates du projet sur la
// fusion de sa branche avec la base, la relecture de son diff par le reviewer,
// la CI de son commit — puis décide. Verte, elle merge si le grant `merge` est
// actif, et s'arrête en le disant sinon ; rouge, elle renvoie les findings à
// un cook, deux fois au plus, puis remonte au chef. Manager allumé, elle lui
// passe la main dès le second rouge : c'est lui qui monte le calibrage du
// second renvoi, puis qui choisit la suite. Sa boucle est du code ; elle
// n'appelle un modèle que pour relire, une fois par livraison, et jamais avant
// des gates vertes. Une relecture qui ne se lit pas n'est pas l'affaire du
// cook : elle se redemande au reviewer, sur le même commit, deux fois au plus,
// puis remonte au chef — jamais de merge sans relecture lisible.
//
// Un ticket qui n'a produit aucun diff n'a ni gates, ni CI, ni PR : le
// reviewer est son seul juge, et vert, il est servi sans merge ni grant.
//
// « Vert » veut dire vert une fois fusionné, et rien d'autre. Le worktree du
// cook est parti avec lui : elle fusionne le commit livré avec la base du
// moment dans un worktree jetable, que rien ne pousse, et c'est là qu'elle joue
// les gates et fait relire — c'est ce qui sera sur la base. Si la base a bougé
// entre le verdict et le merge, elle rejuge : la même règle, pas une autre.
// Une fusion qui ne se fait pas renvoie le cook se mettre à jour de la base ;
// une CI rouge sur une branche qui n'a pas la tête de la base, de même.
// Un rouge que la base porte seule n'est celui d'aucune livraison : tant que
// la base est rouge, la pass ne juge ni ne merge, et ne renvoie personne.
// Elle rejoue d'abord seule ses gates, une fois : un rouge passager ne
// dérange personne. S'il tient, elle ouvre un ticket de réparation, qui passe
// devant tout le rail et part d'une base rouge — c'est la seule livraison
// qu'elle juge et merge malgré elle.
//
// Un ticket peut quitter le rail sous elle — issue fermée, `fire` retiré. Elle
// lâche alors sa livraison : plus de relecture, plus de renvoi, plus de merge,
// et la relecture en cours est arrêtée. Elle ne ferme ni la PR ni la branche :
// si la PR est encore ouverte, elle le dit une fois sur l'issue, et c'est au
// chef d'en décider.
//
// Une PR que le chef ferme sans la merger est un refus : elle le constate,
// l'écrit et le dit une fois, puis ne suit plus cette livraison que pour un
// merge à la main. Elle ne sort pas le ticket du rail : c'est au chef.
//
// Une livraison peut lui arriver hors du rail : la PR d'une passe de
// fermeture, qui n'a pas de ticket. Elle la suit sous le numéro de cette PR,
// et y parle. Rien d'autre ne change pour elle — la même fusion, les mêmes
// gates, le même reviewer, la même CI, le même grant —, sauf ce qui tenait au
// ticket : rouge, aucun cook ne la reprend, elle remonte au chef ; mergée ou
// fermée, il n'y a ni ticket à servir ni issue à fermer.
//
// Elle ne garde rien en mémoire qui compte : ce qu'il lui reste à faire se lit
// dans sa projection, donc tient après un redémarrage. Le merge est un effet
// sur le monde — son intention (`grant.used`) est écrite avant l'appel, son
// résultat après, et une intention sans résultat se réconcilie sur GitHub.
import { randomUUID } from "node:crypto";
import { geste } from "./geste.ts";
import { declencheSurPr } from "./declencheurs.ts";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { capturesLivrees, dossierDesCaptures, estDInterface, zoneALaPrise } from "./captures.ts";
import { DE_CONFIANCE, type RuntimeAvecRail } from "./alimenter.ts";
import { environnementClaude } from "./jeton-claude.ts";
import { blocDesGates, blocDuSetup, direRefus, environnementCook, lectureDuTicket, lireFlux, REFUS_MAX, verdict as finDuFlux, type Lecture, type SetupEnEchec } from "./claude.ts";
import type { Decisions } from "./decisions.ts";
import type { Depot } from "./depot.ts";
import {
  A_RELIRE,
  BASE_ROUGE,
  causeDeDeclarations,
  causeDeTestInstable,
  DIRE_GATES_COUPEES,
  ENCORE_ROUGE,
  EN_PAUSE,
  PROJET_ETEINT,
  GATES_COUPEES,
  HORS_RAIL,
  JUGES_MODIFIES,
  MACHINE_SATUREE,
  MERGE_REFUSE,
  NON_JUGEE,
  SANS_GRANT,
  type Check,
  type CI,
  type Depassement,
  type FaitPass,
  type Finding,
  type Gates,
  type MotifDAttente,
  type Review,
  type Verdict,
  type VerdictDuSecondJuge,
} from "./events/pass.ts";
import type { FaitStation } from "./events/station.ts";
import { direMasquage } from "./identifiants.ts";
import { blocDesLecons, type LeconRecue } from "./apprentissage/injection.ts";
import { blocDuCarnet, type CarnetRecu } from "./profils/preference.ts";
import { CONSIGNE_DE_RETRO } from "./apprentissage/retro.ts";
import { enregistrerRetro } from "./apprentissage/provisoires.ts";
import { idsDeLEtageCommun, noterUnTicketServi } from "./commun/installation.ts";
import { noterLeRenvoi } from "./apprentissage/renvoi.ts";
import { CONSIGNE_DE_FIN_DE_TOUR, CONSIGNE_DU_LIVRABLE, FERMETURE, OUVERTURE } from "./livrable.ts";
import { LancementRefuse, type CookLance, type GardeFous, type Verdict as VerdictGarde } from "./garde-fous.ts";
import { REJOUER_LA_BASE } from "./dire-base.ts";
import { dansLeBacASableLocal, type BacASableLocal } from "./bac-a-sable/local.ts";
import { envelopper, type Cloison } from "./cloison.ts";
import { aDesGates, jouerGatesMesurees, SCRIPT_GATES, type DemandeScript } from "./gates.ts";
import { noterCoutDesGates } from "./cout-des-gates.ts";
import { fileDeLaPass, tenantDeLaPass } from "./file-de-la-pass.ts";
import { empreinteDeConfig, gatesReprises, passageVert, type EmpreinteDesGates } from "./empreinte-des-gates.ts";
import { tenirLeBudget } from "./budget-des-gates.ts";
import { constaterExtinction, direExtinction } from "./grant.ts";
import { VARIABLES_GITHUB } from "./identites.ts";
import { jobDuCheck, type GitHub, type PR } from "./github.ts";
import { configMachine, direSaturation, lireMachine, saturation, type Machine, type Saturation, type Seuils } from "./machine.ts";
import type { Evenement } from "./evenements.ts";
import type { FaitPause } from "./pause/evenements.ts";
import { mergeRetenu, RENOMMAGE_ABANDONNE, renommageEcarte } from "./pause/pause.ts";
import { INTRANSPOSABLE, renommagesMerges, traduireChemin } from "./pause/reprise.ts";
import { etatDesGardeFous } from "./projections/guardrails.ts";
import { managerAllume } from "./projections/manager.ts";
import { projetEteint } from "./projections/switch.ts";
import {
  controleRetenu,
  etatDeLaBase,
  etatDuGrant,
  mergesAVerifier,
  orphelines,
  passDuTicket,
  reparationAnnoncee,
  reparationDeLaBase,
  reparationEnCours,
  rougeCompte,
  type Orpheline,
  type PassDeTicket,
  type Relue,
} from "./projections/pass.ts";
import { ticketDuRail } from "./projections/rail.ts";
import { compteRetenu, cookDeRun, refusDAffilee, stationsAnnoncees } from "./projections/stations.ts";
import { GesteRefuse, nomAbandon } from "./rail.ts";
import { corpsDeReparation, echecsDesGates, LABELS_REPARATION, shaDeReparation, titreDeReparation } from "./reparation.ts";
import { FICHIER as REGLAGES_DU_PROJET } from "./reglages-projet/reglages.ts";
import { attribuer, testsEnEchec } from "./relance-de-ci.ts";
import { DECLARATION_RESEAU } from "./reseau.ts";
import { argumentsReviewer, CONSIGNE_MAX, consigneDeRelecture, DE_LA_BRIGADE, debutDeRelecture, diffCoupe, lireRelecture, REVIEWER, type ConfigReviewer } from "./reviewer.ts";
import { calibrageDuSecondJuge, carteDuSecondJuge, consigneDuSecondJuge, debutDuSecondJugement, DIRE_VERDICT, lireSecondJugement, SECOND_JUGE } from "./second-juge.ts";
import { entrerDansTodo, sortirDeTodo } from "./carte-todo.ts";
import { estUneLivraisonDeCorrection } from "./correctif/livrer.ts";
import { estUneLivraisonDuCarnet } from "./promotion/livrer.ts";
import { ConfigInvalide } from "./runtime.ts";
import { DECLARATION, lireSecrets } from "./secrets.ts";
import type { Fin } from "./superviseur.ts";

const AUTEUR = "pass";
// Règle V1 conservée : au deuxième renvoi resté rouge, la pass cesse de renvoyer.
export const RENVOIS_MAX = 2;
// Une relecture qui ne se lit pas est une panne du reviewer, pas du cook : elle
// lui est redemandée, sur la même livraison, autant de fois au plus.
export const REDEMANDES_MAX = 2;
// Le motif sous lequel un ticket rouge revient sur le rail.
export const PASS_ROUGE = "pass-red";
// Ce par quoi une livraison est jugée : qui y touche peut se rendre vert seul.
const JUGES = [".claude/brigade/", ".github/workflows/"];
// Ce par quoi le projet s'ouvre au runtime, et ce que le chef relit avant que
// la base ne le porte : mergée, la déclaration vaut pour le cook suivant.
const DECLARATIONS: Record<string, string> = {
  [DECLARATION_RESEAU]: "chaque hôte qu'elle ajoute s'ouvre aux cooks suivants du projet, qui ont ses secrets de dev dans leur environnement",
  [REGLAGES_DU_PROJET]: "elle change un réglage du projet (branche d'intégration, calibrages, options) que la station lit depuis le dépôt et applique aux cooks suivants",
  [DECLARATION]: "chaque nom qu'elle ajoute est une valeur de la machine remise aux cooks suivants du projet",
};
const WORKFLOWS = ".github/workflows";
// Ce que l'arrêt d'une livraison qui touche à ses juges dit de son second juge.
const SECOND_JUGE_APPELE = "Un second juge, distinct du reviewer et plus fort que lui, va dire si elle affaiblit le contrôle : son verdict s'écrira sur la PR. Ne l'établit-il pas non affaiblie, une carte est proposée au chef, que le triage lit d'abord.";
// Et ce qu'elle devient s'il l'établit, quand rien d'autre ne la retient.
const SECOND_JUGE_PUIS = "S'il établit qu'elle ne l'affaiblit pas, elle suit le chemin d'une livraison ordinaire : mergée par la pass sous le grant `merge`, arrêtée sans lui.";
// Un quota épuisé qui ne dit pas quand il revient est retenté une heure après.
const REPLI_QUOTA_MS = 3_600_000;

// Les phases d'une livraison verte qui n'est ni mergée ni arrêtée.
const VERTES = ["green", "waiting"];
const NON_JOUEES: Gates = { outcome: "skipped", code: null, failures: [], tail: "" };
// Ce que le journal garde du motif d'un essai qui ne s'est pas fait.
const PANNE_MAX = 300;

// Les secrets que le dépôt déclare ne peuvent pas être donnés aux gates.
class SecretsIndisponibles extends Error {
  problemes: string[];
  constructor(problemes: string[]) {
    super(`secrets du projet indisponibles — ${problemes.join(" ; ")}`);
    this.problemes = problemes;
  }
}
const NON_RELU: Review = { outcome: "skipped", run: null, summary: null, findings: [] };

const DELAI_PAR_DEFAUT_S = 1800;
// L'horloge de GitHub n'est pas celle du runtime : une issue de réparation se
// cherche à partir d'un peu avant l'annonce de sa création.
const MARGE_MS = 600_000;
// Les worktrees jetables de la pass : celui d'un jugement et celui d'un second
// jugement, par ticket, et celui de la base.
const essaiDeJugement = (ticket: number) => `jugement-${ticket}`;
const essaiDuSecondJuge = (ticket: number) => `second-jugement-${ticket}`;
const ESSAI_DE_BASE = "base";
// Un rejeu demandé au chef n'attend pas, derrière un appel GitHub qui pend, plus
// que ce délai : le tour suivant le joue.
const DELAI_GITHUB_MS = 120_000;

export type ConfigPass = {
  // Le plafond de durée des gates : au-delà, elles sont arrêtées et rouges.
  delaiGatesMs: number;
  // L'attente tolérée d'une CI qui ne conclut pas, avant de remonter au chef.
  attenteCiMs: number;
  // Ce qu'une pass attend GitHub sur un ticket avant de passer au suivant :
  // un appel qui ne répond pas ne retient ni la base ni les autres tickets.
  delaiGithubMs?: number;
};

export function configPass(env: Record<string, string | undefined>): ConfigPass {
  const secondes = (variable: string): number => {
    const valeur = env[variable] || String(DELAI_PAR_DEFAUT_S);
    if (!/^[1-9][0-9]*$/.test(valeur)) throw new ConfigInvalide(`${variable} invalide : « ${valeur} » — attendu un nombre entier de secondes`);
    return Number(valeur) * 1000;
  };
  return { delaiGatesMs: secondes("BRIGADE_GATES_TIMEOUT_SECONDS"), attenteCiMs: secondes("BRIGADE_CI_WAIT_SECONDS") };
}

export type OptionsPass = ConfigPass & {
  repertoireEtat: string;
  // Chaque rôle a son identité GitHub : ni les gates ni le reviewer ne
  // reçoivent de jeton GitHub, pas même d'un setup de worktree.
  sansIdentite?: boolean;
  // La cloison dans laquelle partent les gates et le reviewer.
  cloison?: Cloison | null;
  // Le bac à sable d'une cuisine locale, sur le Mac du chef : le reviewer y
  // part. Absent : il part sans.
  bacASable?: BacASableLocal | null;
  depot: Depot;
  github: GitHub;
  // La branche d'intégration : la seule base sur laquelle la pass merge.
  base: string;
  // Le calibrage du reviewer, tel qu'il est au démarrage.
  reviewer: ConfigReviewer;
  // Les décisions du chef : présentes, le calibrage du reviewer y est relu à
  // chaque relecture — le chef a pu le changer sans redémarrer.
  decisions?: Pick<Decisions, "reviewer">;
  // `<owner>/<repo>`, pour la consigne du reviewer.
  depotGitHub: string;
  // Le binaire `claude`.
  bin: string;
  // Ce que la machine doit garder pour que la pass rejoue des gates — une
  // livraison à rejuger, la base —, et de quoi la lire : les seuils et la
  // machine de la station. Par défaut : les seuils par défaut, la vraie machine.
  seuils?: Seuils;
  // L'étage commun des leçons (`commun/`), si le projet est servi par une
  // station : son dossier, et les tickets servis sans reconfirmation après
  // lesquels une de ses leçons expire. Chaque ticket servi y est compté.
  etageCommun?: { racine: string; expiration: number };
  machine?: () => Machine;
  // L'environnement dont part celui des gates et du reviewer. Par défaut,
  // celui du runtime.
  env?: NodeJS.ProcessEnv;
  // Le fichier de la machine qui porte les valeurs des secrets du projet
  // (`BRIGADE_SECRETS_FILE`), relu avant chaque passage de gates.
  secrets?: string | null;
  maintenant?: () => Date;
  // Où va ce que la pass a à dire hors du journal (journald).
  avertir?: (message: string) => void;
};

// Une livraison hors du rail : le run qui l'a produite, sa branche poussée, sa PR.
export type LivraisonHorsRail = { run: string; branche: string; pr: string; numero: number };

export type Pass = {
  // Fait repasser la pass sans attendre le tick : un cook vient de livrer.
  reveillerPass(): void;
  // Fait entrer en pass une livraison que le rail ne porte pas — la PR d'une
  // passe de fermeture. Elle est jugée et mergée comme celle d'un ticket.
  prendreHorsRail(livraison: LivraisonHorsRail): void;
};

const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));
const court = (sha: string | null) => (sha ?? "?").slice(0, 7);
const minutes = (ms: number) => `${(ms / 60_000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} min`;
const nombre = (valeur: number) => valeur.toLocaleString("fr-FR");
const pluriel = (combien: number, mot: string) => `${nombre(combien)} ${mot}${combien > 1 ? "s" : ""}`;
const duree = (ms: number) => (ms >= 60_000 ? minutes(ms) : `${(ms / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} s`);
const bloquants = (findings: Finding[]) => findings.filter((finding) => finding.severity === "blocking");
const lieu = (finding: Finding) => (finding.file === null ? "" : ` (\`${finding.file}\`)`);

const constatsBloquants = (combien: number) => (combien === 1 ? "1 constat bloquant" : `${nombre(combien)} constats bloquants`);
const ditDuReviewer = (review: Review) =>
  ({ green: "rien de bloquant", red: constatsBloquants(bloquants(review.findings).length), skipped: "non appelé" })[review.outcome];

// Un constat bloquant du reviewer, tel qu'il repart au cook.
const findingDuReviewer = (finding: Finding) => `Relecture — constat bloquant${lieu(finding)} : ${finding.text}`;

// Le plafond de durée que les gates se donnent n'est pas jugé par la pass : il
// a été mesuré sur le poste de ceux qui écrivent la suite, et la machine du
// runtime n'est pas ce poste. Franchi, il se dit — sans rien retenir.
const PLAFOND_NON_JUGE = "la pass ne juge pas ce plafond, mesuré sur le poste de ceux qui écrivent la suite et non sur cette machine";
const enSecondes = (valeur: number) => `${valeur.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} s`;
const direDepassement = ({ cpuSeconds, limitSeconds }: Depassement) => `${enSecondes(cpuSeconds)} de processeur pour un plafond de ${enSecondes(limitSeconds)}`;

// Le dépassement qu'un verdict fait dire sur l'issue, ou null : celui de gates
// dont le plafond est le seul rouge, sous un verdict vert — rouge, l'issue
// reçoit son renvoi, et « la livraison suit son chemin » y serait faux —, et
// une fois par commit livré : `deja` est ce que le journal porte du ticket.
export function plafondADire(deja: Array<{ type: string; payload: unknown }>, jugement: { sha: string; verdict: Verdict; gates: Gates }): Depassement | null {
  const { sha, verdict, gates } = jugement;
  if (verdict !== "green" || gates.outcome !== "green" || !gates.overCeiling) return null;
  const dit = deja.some((evenement) => {
    if (evenement.type !== "pass.judged") return false;
    const avant = evenement.payload as Partial<typeof jugement>;
    return avant.sha === sha && avant.verdict === "green" && avant.gates?.outcome === "green" && avant.gates.overCeiling !== undefined;
  });
  return dit ? null : gates.overCeiling;
}

// `sur` : ce sur quoi elles ont été jouées, quand ce n'est pas la base seule.
function findingDesGates(gates: Gates, delaiMs: number, sur = ""): string {
  const titre =
    gates.outcome === "timeout"
      ? `Gates arrêtées${sur} : \`${SCRIPT_GATES}\` a dépassé son plafond de ${minutes(delaiMs)}.`
      : `Gates rouges${sur} : \`${SCRIPT_GATES}\` est sorti en ${gates.code ?? "erreur"}.`;
  return [
    titre,
    ...(gates.credentialsMasked ? [direMasquage(gates.credentialsMasked, "la sortie des gates")] : []),
    ...gates.failures,
    ...(gates.clockGuardCut === undefined
      ? []
      : [
          "Aucun test n'a échoué avant que leur garde d'horloge ne les coupe, mais ce rouge n'est pas mis sur le compte de la charge : la machine n'était pas saturée, ou ces gates avaient déjà été coupées une fois sur une machine saturée, puis rejouées. Un test bloqué, ou une suite devenue trop lente : c'est un rouge.",
        ]),
    ...(gates.overCeiling
      ? [`Leur plafond de durée est franchi aussi (${direDepassement(gates.overCeiling)}), et ce n'est pas la cause de ce rouge : ${PLAFOND_NON_JUGE}. Il n'y a rien à corriger pour lui.`]
      : []),
    ...(gates.tail === "" ? [] : ["Fin de sortie :", "```", gates.tail, "```"]),
  ].join("\n");
}

function resume(gates: Gates, ci: CI, review: Review): string {
  const dites = { green: "vertes", red: "rouges", timeout: "arrêtées au plafond", skipped: "non jouées" }[gates.outcome];
  const lue = {
    green: `verte (${ci.checks.length} check${ci.checks.length > 1 ? "s" : ""})`,
    red: "rouge",
    none: "aucun check sur ce commit — le verdict repose sur les seules gates",
    skipped: "non lue",
  }[ci.outcome];
  return `gates ${dites} · CI : ${lue} · reviewer : ${ditDuReviewer(review)}`;
}

// Un renvoi tel qu'il se dit : passé les deux de la pass, c'est une relance
// que le manager a décidée.
const nomDuRenvoi = (n: number) => (n <= RENVOIS_MAX ? `le renvoi ${n} sur ${RENVOIS_MAX}` : `une relance décidée par le manager, après ${RENVOIS_MAX} renvois restés rouges`);

// La consigne d'un cook relancé sur un ticket que la pass a jugé rouge : il
// retrouve le travail, pas la conversation.
export function consigneDeRenvoi(mission: { ticket: number; titre: string; depot: string; base: string; branche: string; n: number; findings: string[]; remis?: string; setup?: SetupEnEchec; lecons?: LeconRecue[]; carnet?: CarnetRecu | null; gates?: string }): string {
  const { ticket, titre, depot, base, branche, n, findings } = mission;
  return [
    `Tu es un cook de la brigade : tu reprends un seul ticket, le ticket #${ticket} du dépôt ${depot} — « ${titre} ».`,
    "",
    `Un cook a déjà livré ce ticket sur la branche \`${branche}\`, partie de \`${base}\`. La pass — les gates du dépôt, sa CI et la relecture du reviewer — a refusé sa livraison : c'est ${nomDuRenvoi(n)}. Ce qu'elle juge n'est pas la branche seule, mais sa fusion avec \`origin/${base}\` telle qu'elle est au moment du jugement : c'est ce résultat qui doit être vert. Tu es dans un worktree neuf, sur sa branche, avec ses commits — et, s'il avait laissé du travail non commité, un commit de plus qui le porte, au nom de \`brigade\`.`,
    "",
    "Ce que la pass a trouvé :",
    "",
    ...findings.flatMap((finding) => [finding, ""]),
    ...blocDesLecons(mission.lecons),
    ...blocDuCarnet(mission.carnet),
    ...blocDesGates(mission.gates),
    ...blocDuSetup(mission.setup),
    `1. Relis le ticket : ${lectureDuTicket(mission)}, et ce qui est déjà commité : \`git log origin/${base}..HEAD\`. Les conventions du dépôt ne te sont pas chargées d'office : lis son \`CLAUDE.md\`, s'il en a un à la racine, avant d'écrire quoi que ce soit, et suis-le.`,
    "2. Corrige ce que la pass a trouvé, et rien d'autre. Un finding que tu tiens pour faux : ne le contourne pas, dis-le dans ton compte-rendu.",
    `3. Rejoue toi-même ce qui a échoué (les gates du dépôt), ta branche à jour de la base — \`git fetch origin ${base}\`, puis rebase sur \`origin/${base}\` —, puis commite sur cette branche ce que tu as changé.`,
    "4. Tu ne pousses rien, tu n'ouvres pas de PR, tu ne merges jamais et tu ne commentes pas le ticket : la station s'en charge quand tu as fini.",
    `5. Termine par ton compte-rendu, en clair : ce que tu as corrigé, ce que tu as vérifié et comment, ce qui reste. ${CONSIGNE_DU_LIVRABLE} ${CONSIGNE_DE_RETRO}`,
    "",
    CONSIGNE_DE_FIN_DE_TOUR,
  ].join("\n");
}

// La consigne d'un renvoi qui reprend la session du cook précédent
// (`reprise-de-session.ts`) : il a déjà lu le ticket, le `CLAUDE.md` et le
// code, et ses règles sont dans sa conversation. Il ne reçoit que ce qui a
// changé — le refus, ce que la pass a trouvé, le worktree où il est désormais.
// Rien de ce qu'elle exige ne change : mêmes gates, même relecture.
export function consigneDeReprise(mission: { base: string; branche: string; worktree: string; n: number; findings: string[]; setup?: SetupEnEchec; lecons?: LeconRecue[]; carnet?: CarnetRecu | null; gates?: string }): string {
  const { base, branche, worktree, n, findings } = mission;
  return [
    `La pass — les gates du dépôt, sa CI et la relecture du reviewer — a refusé ta livraison : c'est ${nomDuRenvoi(n)}. Ce qu'elle juge n'est pas la branche seule, mais sa fusion avec \`origin/${base}\` telle qu'elle est au moment du jugement : c'est ce résultat qui doit être vert.`,
    "",
    `Tu reprends ici ta propre session : ce que tu as lu — le ticket, le \`CLAUDE.md\`, le code — et ce que tu as fait restent acquis, inutile de les relire. Une chose a changé : ton worktree d'avant n'existe plus. Tu es dans un worktree neuf, \`${worktree}\`, sur ta branche \`${branche}\`, avec tes commits — et, si tu avais laissé du travail non commité, un commit de plus qui le porte, au nom de \`brigade\`. Tout chemin absolu que tu as noté se relit sous ce nouveau répertoire, et c'est là que tu travailles.`,
    "",
    "Ce que la pass a trouvé :",
    "",
    ...findings.flatMap((finding) => [finding, ""]),
    ...blocDesLecons(mission.lecons),
    ...blocDuCarnet(mission.carnet),
    ...blocDesGates(mission.gates),
    ...blocDuSetup(mission.setup),
    "1. Corrige ce que la pass a trouvé, et rien d'autre. Un finding que tu tiens pour faux : ne le contourne pas, dis-le dans ton compte-rendu.",
    `2. Rejoue toi-même ce qui a échoué (les gates du dépôt), ta branche à jour de la base — \`git fetch origin ${base}\`, puis rebase sur \`origin/${base}\` —, puis commite sur cette branche ce que tu as changé.`,
    "3. Tu ne pousses rien, tu n'ouvres pas de PR, tu ne merges jamais et tu ne commentes pas le ticket : la station s'en charge quand tu as fini.",
    `4. Termine par ton compte-rendu, en clair : ce que tu as corrigé, ce que tu as vérifié et comment, ce qui reste. ${CONSIGNE_DU_LIVRABLE} ${CONSIGNE_DE_RETRO}`,
    "",
    CONSIGNE_DE_FIN_DE_TOUR,
  ].join("\n");
}

// Ce que le chef peut faire d'un ticket remonté : merger sa PR — s'il en a une.
const suiteDuChef = (pr: string | null) =>
  pr
    ? "Mergée à la main, la pass le verra et fermera le ticket ; retirer `fire` le sort du rail."
    : "Il n'a pas de PR, donc rien à merger : retirer `fire` le sort du rail, ou ferme l'issue si le compte-rendu du cook, plus haut, suffit.";

// De même hors du rail : il n'y a que la PR.
const SUITE_HORS_RAIL = "Mergée à la main, la pass le verra ; fermée sans merge, elle ne la suit plus.";
// Ce que la pass fera d'un merge à la main : hors du rail, il n'y a pas de ticket à servir.
const vuDeLaPass = (horsRail: boolean) => (horsRail ? "la pass le verra" : "la pass le verra et servira le ticket");

// La seule consigne d'une livraison que la base a dépassée.
const mettreAJour = (base: string) => `Mets-toi à jour de la base : \`git fetch origin ${base}\`, puis rebase ta branche sur \`origin/${base}\``;
// Une CI rouge jouée sur une branche que la base a dépassée : elle n'a pas jugé
// ce qui sera mergé. Ses jobs sont nommés pour que le cook les reconnaisse s'ils
// échouent encore une fois à jour.
const findingDeCiDepassee = (base: string, sha: string, retard: number, rouges: Check[]) =>
  `CI rouge sur \`${court(sha)}\` (${rouges.map((check) => `job « ${check.name} » : ${check.conclusion}${check.url ? `, ${check.url}` : ""}`).join(" ; ")}), mais ta branche n'a pas la tête de \`${base}\` — ${retard} commit${retard > 1 ? "s" : ""} de retard : cette CI n'a pas jugé ce qui sera mergé, et son rouge n'est pas un verdict. ${mettreAJour(base)}, et rejoue les gates. Ne corrige que ce qui échoue encore une fois à jour : la CI rejouera sur ta branche à jour.`;
const findingDeConflit = (base: string) => `Conflit avec \`${base}\` : ta branche ne s'y fusionne plus, et c'est sa fusion avec \`${base}\` que la pass juge. ${mettreAJour(base)}, résous les conflits, et rejoue les gates.`;

// Ce que la décision laisse à faire une fois sa transaction refermée.
// `verifier` : la livraison est à merger, reste à voir si la base est encore
// celle de son verdict.
// `repetition` : verte et sans grant, reste à regarder la base pour écrire ce
// que la pass aurait fait — la livraison n'est pas encore arrêtée.
type Suite =
  | { commentaire: string }
  | { service: string }
  | { verifier: true }
  | { merge: { pr: string; number: number; sha: string; branche: string | null; jugee: string; horsRail: boolean } }
  | null;

// Rend le runtime, augmenté de sa pass. Son `arreter` l'emporte avec lui.
export function brancherPass<R extends RuntimeAvecRail & GardeFous>(runtime: R, options: OptionsPass): R & Pass {
  const { journal, projet, rail } = runtime;
  const { base } = journal;
  const { depot, github } = options;
  const maintenant = options.maintenant ?? (() => new Date());
  const avertir = options.avertir ?? ((texte: string) => console.error(texte));
  const envGates = environnementCook(options.env ?? process.env);
  // Les gates exécutent le code de la branche du cook : sous une identité par
  // rôle, un setup qui exporte un jeton GitHub ne le leur donne pas plus qu'à lui.
  const interdites = options.sansIdentite ? VARIABLES_GITHUB : [];
  // Les gates jouent les tests du projet : elles reçoivent ses secrets, comme
  // le cook dont elles jugent le code — relus à chaque passage, dans le
  // worktree jugé. Le reviewer, lui, ne lit qu'un diff : il n'en reçoit aucun.
  // Des gates qui ne peuvent pas recevoir leurs secrets ne sont pas jouées :
  // rouges pour cela, elles renverraient à un cook ce qu'aucun cook ne lève.
  const pourLesGates = (worktree: string): Pick<DemandeScript, "env" | "masquer"> => {
    const secrets = lireSecrets(worktree, options.secrets ?? null);
    if (!secrets.pret) throw new SecretsIndisponibles(secrets.problemes);
    return Object.keys(secrets.env).length === 0 ? { env: envGates } : { env: { ...envGates, ...secrets.env }, masquer: secrets.masquer };
  };
  const masqueDe = (worktree: string) => {
    const secrets = lireSecrets(worktree, options.secrets ?? null);
    return secrets.pret && Object.keys(secrets.env).length > 0 ? secrets.masquer : undefined;
  };
  const ajouter = (ticket: number | null, fait: FaitPass | FaitStation) => journal.ajouter({ project: projet, ticket, author: AUTEUR, ...fait });
  // Le grant `merge` éteint seul — échéance passée, dernier usage consommé —
  // s'écrit une fois, et se dit : c'est ce que le chef n'a pas fait lui-même.
  // L'écrire ne garde rien : un grant échu ne vaut déjà plus pour qui le lit.
  const eteindre = <T>(ecrire: () => T): T => {
    const [ecrit, eteint] = base.transaction(() => [ecrire(), constaterExtinction(journal, projet, AUTEUR, "merge", maintenant())] as const);
    if (eteint) avertir(`brigade : grant \`merge\` éteint seul : ${direExtinction(eteint.cause)} (${eteint.since}) — la pass s'arrête désormais à la PR ouverte`);
    return ecrit;
  };
  // Un merge fait par la pass consomme un usage : le dernier éteint le grant
  // dans la transaction qui l'écrit.
  const noter = (ticket: number | null, fait: FaitPass | FaitStation) => (fait.type === "merge.done" ? eteindre(() => ajouter(ticket, fait)) : ajouter(ticket, fait));

  let arrete = false;
  let aRefaire = false;
  const abandon = new AbortController();
  // Joue les gates, et écrit au journal ce que leur passage a coûté — sauf si
  // le runtime s'arrête pendant : coupées par lui, elles n'ont rien dit de
  // leur coût. `ticket` : nul pour les gates de la base. `empreinte` : ce
  // qu'elles jugent, écrit avec leur coût pour qu'un passage suivant sur le
  // même code les reprenne (`empreinte-des-gates.ts`).
  const jouerGates = async (ticket: number | null, demande: DemandeScript, empreinte?: EmpreinteDesGates) => {
    const { gates, cout } = await jouerGatesMesurees(demande);
    if (!arrete) noterCoutDesGates(journal, { projet, ticket, coureur: "pass", auteur: AUTEUR, gates, cout, ...(empreinte ? { empreinte } : {}) });
    if (!arrete) await budgetTenu();
    return gates;
  };
  // Le passage écrit, hors budget et sans ticket de budget ouvert : la pass en
  // ouvre un sur le projet, sans geste du chef (`budget-des-gates.ts`). Un
  // passage à la fois s'y juge. GitHub en panne : c'est dit une fois, et le
  // passage hors budget suivant y revient. Rien n'y retient le verdict.
  let budgetButee = false;
  let budgetEnCours: Promise<void> = Promise.resolve();
  const budgetTenu = () =>
    (budgetEnCours = budgetEnCours.then(async () => {
      try {
        const tenu = await tenirLeBudget({ journal, github, projet, auteur: AUTEUR, maintenant });
        budgetButee = false;
        if (tenu?.ouvert && !arrete) avertir(`brigade : gates de ${projet} hors budget — ticket #${tenu.ticket} ouvert pour les y ramener`);
      } catch (erreur) {
        if (!arrete && !budgetButee) avertir(`brigade : gates de ${projet} hors budget, mais leur ticket n'a pas pu être ouvert — ${message(erreur)}. La pass y revient au passage suivant, sans le redire`);
        budgetButee = true;
      }
    }));
  // Cache, pas état : les gates déjà jouées sur la fusion d'un commit avec une
  // base, le temps que sa CI conclue. Le perdre coûte de les rejouer.
  const gatesJouees = new Map<number, { sha: string; base: string; gates: Gates; arbre: string }>();
  // Les issues déjà fermées, le temps que le sondage les sorte du rail.
  const fermees = new Set<number>();
  // Les livraisons vertes qu'un merge en vol retient : dit une fois chacune.
  const retenus = new Set<number>();
  // Cache, pas état : les commits livrés qu'un renommage mergé n'a pas à
  // porter sur son arbre (`porterSurLeRenommage`), avec ce renommage.
  const sansRenommageAPorter = new Set<string>();

  const commenter = async (ticket: number, corps: string) => {
    try {
      await github.commenter(ticket, corps);
    } catch (erreur) {
      if (!arrete) avertir(`brigade : commentaire de la pass non posté sur le ticket #${ticket} — ${message(erreur)}`);
    }
  };

  // Hors du rail, une livraison est en pass tant que la pass la suit.
  const enPass = (ticket: number) => ticketDuRail(base, ticket)?.state === "pass" || passDuTicket(base, ticket)?.horsRail === true;
  // Une livraison à la fois est dans sa pass : une autre ne commence pas, ni
  // ne se rejuge, avant qu'elle en soit sortie (`file-de-la-pass.ts`). La
  // passe parcourt la file dans l'ordre : la première prête prend le tour.
  const aSonTour = (ticket: number) => {
    const tenant = tenantDeLaPass(base);
    return tenant === null || tenant === ticket;
  };
  // La réparation en cours d'une base rouge : son rouge, la pass le juge et le
  // merge. Les gates de sa fusion avec la base disent si elle la répare.
  const estLaReparation = (ticket: number) => reparationEnCours(base) === ticket;

  // La carte qu'un second juge a proposée sort de TODO : le chef a
  // tranché, en mergeant ou en fermant la PR. Seulement la sienne — la carte
  // en TODO est la dernière entrée, et c'est la pass qui l'a posée.
  const oterLaCarte = (ticket: number, pourquoi: string) => {
    const entree = journal.duTicket(ticket).findLast((evenement) => evenement.type === "todo.entered");
    if (entree?.author === AUTEUR) sortirDeTodo(journal, projet, ticket, pourquoi, AUTEUR);
  };

  // Le ticket mergé est servi, et son issue fermée par la pass : `Closes`
  // n'agit que sur la branche par défaut du dépôt.
  // Hors du rail, il n'y a ni ticket à servir ni issue à fermer.
  // Servi, il a sa rétro — celle du cook dont la livraison l'est —, écrite
  // dans la même transaction : ses leçons sont lisibles dès qu'il est servi.
  const finir = async (ticket: number, horsRail = false) => {
    // Hors du rail, aucun service n'ôte la carte que son second juge a posée :
    // la PR mergée, elle n'est plus au chef.
    if (horsRail) {
      oterLaCarte(ticket, "its PR is merged");
      return;
    }
    try {
      const etage = options.etageCommun;
      const retro = base.transaction(() => {
        rail.servir(ticket);
        return enregistrerRetro(journal, { projet, ticket, run: passDuTicket(base, ticket)?.run ?? null, auteur: AUTEUR, communes: etage ? idsDeLEtageCommun(etage.racine) : [] });
      });
      // Servi, le ticket vieillit l'étage commun : un étage illisible n'arrête pas la pass.
      if (etage !== undefined && retro !== null) {
        try {
          noterUnTicketServi(etage.racine, retro.kept, etage.expiration, maintenant().toISOString().slice(0, 10));
        } catch (erreur) {
          avertir(`brigade : étage commun illisible, ce ticket servi n'y est pas compté — ${erreur instanceof Error ? erreur.message : String(erreur)}`);
        }
      }
    } catch (erreur) {
      // Déjà servi, ou remonté au chef (86) avant qu'il ne merge lui-même.
      if (!(erreur instanceof GesteRefuse)) throw erreur;
    }
    if (fermees.has(ticket)) return;
    await github.fermerIssue(ticket);
    fermees.add(ticket);
  };

  // Un merge fait hors du runtime a atterri sur une base que personne n'a
  // regardée : rien ne l'a jugé. Celui de la pass, si : il est le verdict.
  const aVerifier = (par: "pass" | "outside") => par === "outside";

  // Le compte sous lequel la pass agit, quand il n'est qu'à elle. Illisible,
  // il se redemande : rien n'en dépend que ce qui se lit d'un merge.
  let moi: string | null = null;
  let lecture: Promise<string | null> | null = null;
  const identite = (): Promise<string | null> =>
    moi !== null
      ? Promise.resolve(moi)
      : (lecture ??= github
          .identite()
          .catch(() => null)
          .then((lue) => ((lecture = null), (moi = lue))));

  // Qui a mergé cette PR. Quand la pass a son identité et que GitHub nomme
  // celui qui a mergé, c'est lui qui tranche ; sinon ce que le runtime en
  // suppose reste tout ce qu'on en sait.
  const auteurDuMerge = async (pr: PR, suppose: "pass" | "outside"): Promise<"pass" | "outside"> => {
    const pass = await identite();
    if (pass === null || pr.mergeePar === null) return suppose;
    return pr.mergeePar === pass ? "pass" : "outside";
  };
  const acteur = (compte: string | null) => (compte === null ? {} : { actor: compte });

  const constaterMerge = async (connu: PassDeTicket, pr: PR, suppose: "pass" | "outside", reconcilie: boolean) => {
    const par = await auteurDuMerge(pr, suppose);
    if (arrete) return;
    // Lire qui a mergé a pris du temps : le ticket a pu quitter le rail, et y
    // revenir avec une autre livraison. Ce merge n'est alors plus à écrire ici
    // — l'écrire servirait le ticket sous le cook qui y travaille. La
    // livraison lâchée le constatera pour elle-même.
    if (passDuTicket(base, connu.ticket)?.branch !== connu.branch) return;
    noter(connu.ticket, { type: "merge.done", payload: { pr: pr.url, sha: pr.sha, by: par, ...acteur(pr.mergeePar), reconciled: reconcilie, unverified: aVerifier(par) } });
    await finir(connu.ticket, connu.horsRail);
  };

  // La PR de la livraison est fermée sans être mergée : le chef a dit non.
  // Écrit une fois — la phase qui en sort ne le constate plus.
  const constaterFermeture = async (connu: PassDeTicket, pr: PR) => {
    const { ticket } = connu;
    // Le ticket a pu quitter le rail, ou repartir, pendant la lecture de GitHub.
    const actuel = passDuTicket(base, ticket);
    if (actuel?.branch !== connu.branch || actuel.phase !== connu.phase) return;
    noter(ticket, { type: "pass.pr-closed", payload: { pr: pr.url } });
    oterLaCarte(ticket, "its PR is closed without merge");
    gatesJouees.delete(ticket);
    avertir(`brigade : la PR ${connu.horsRail ? `#${ticket}, hors du rail,` : `du ticket #${ticket}`} a été fermée sans merge (${pr.url}) — la pass ne suit plus cette livraison`);
    // Rendu au rail par le chef, le ticket garde la phase de sa pass jusqu'au
    // cook suivant : il n'attend plus rien de cette livraison, et il n'y a
    // rien à lui en dire.
    const etat = ticketDuRail(base, ticket)?.state;
    if (etat !== "pass" && etat !== "86") return;
    const reste = etat === "86" ? "Le ticket reste 86" : "Le ticket reste en pass";
    await commenter(
      ticket,
      [
        `**Pass — PR fermée sans merge.** ${pr.url}`,
        "",
        `La PR de cette livraison a été fermée sans être mergée : la pass en prend acte. Plus rien ne sera jugé, renvoyé à un cook ni mergé sur cette livraison. ${reste}, et tient sa place sur le rail : retirer \`fire\` l'en sort, fermer l'issue aussi. Rouverte puis mergée à la main, la pass le verra et servira le ticket.`,
      ].join("\n"),
    );
  };

  // La pass n'a pas pu juger : au chef. `cause` : ce qui l'en a empêchée, d'un mot.
  const remonter = async (connu: PassDeTicket, cause: string, pourquoi: string) => {
    const { ticket } = connu;
    base.transaction(() => {
      noter(ticket, { type: "pass.escalated", payload: { reason: NON_JUGEE, cause } });
      if (!connu.horsRail) rail.quatreVingtSix(ticket, { motif: `pass:${NON_JUGEE}` });
    });
    gatesJouees.delete(ticket);
    avertir(`brigade : la pass remonte ${connu.horsRail ? `la PR #${ticket}, hors du rail,` : `le ticket #${ticket}`} au chef (${NON_JUGEE} : ${cause})`);
    await commenter(
      ticket,
      [
        `**Pass — remontée au chef (\`${NON_JUGEE}\` : ${cause}).** ${pourquoi}`,
        "",
        connu.horsRail
          ? `Rien n'est mergé : cette PR reste ouverte, hors du rail. ${SUITE_HORS_RAIL}`
          : `Rien n'est mergé, et aucun cook n'est relancé : le ticket est 86.${connu.pr ? ` PR : ${connu.pr}.` : ""} ${suiteDuChef(connu.pr)}`,
      ].join("\n"),
    );
  };

  // Une relecture consomme le quota du compte : elle n'a pas lieu si le chef a
  // dit « stop », si le disjoncteur est ouvert, ou si une station dit le compte
  // épuisé ou déconnecté. La livraison attend, sans verdict.
  const peutRelire = (): boolean => {
    const garde = etatDesGardeFous(base);
    if (garde.stoppedAt !== null || garde.breakerOpenedAt !== null) return false;
    return !compteRetenu(base, maintenant());
  };
  // Les stations dont les relectures consomment le quota : celles des cooks,
  // telles que le projet les déclare. Un compte épuisé ou déconnecté se dit
  // d'elles toutes ; sans station, il n'est retenu nulle part, et la relecture
  // suivante le redécouvre.
  const noterDesStations = (fait: (station: string) => FaitStation) => {
    for (const station of stationsAnnoncees(base)) noter(null, fait(station));
  };

  // Un compte épuisé ou déconnecté, vu par un juge de la pass — `qui` : par
  // lequel : il se dit des stations, et rien n'est jugé. Vrai si c'en est un.
  const compteEnPanne = (comment: ReturnType<typeof finDuFlux>, flux: Lecture | null, run: string, qui: string): boolean => {
    if (comment === "86") {
      const instant = maintenant();
      const annonce = flux?.quota?.retour ?? null;
      const retour = annonce !== null && annonce > instant ? annonce : new Date(instant.getTime() + REPLI_QUOTA_MS);
      noterDesStations((station) => ({ type: "station.86", payload: { station, reason: "quota", until: retour.toISOString(), window: flux?.quota?.fenetre ?? null } }));
      return true;
    }
    if (comment === "disconnected") {
      noterDesStations((station) => ({ type: "station.disconnected", payload: { station, reason: "authentication_failed", run } }));
      avertir(`brigade : connexion Max absente ou expirée, vue par ${qui} — \`claude /login\` sous le compte du service — la cuisine reprend seule dans la minute`);
      return true;
    }
    return false;
  };

  // Ce que le cook qui a livré a dit, tel que la station l'a rapporté :
  // `livrable`, ce qu'il a délimité — nul s'il n'a rien délimité, ou si le
  // journal date d'avant la délimitation —, et `message`, son dernier message
  // entier.
  const rapportDuCook = (ticket: number, run: string): { livrable: string | null; message: string | null } => {
    const rapport = journal.duTicket(ticket).findLast((evenement) => evenement.type === "cook.reported" && evenement.payload.run === run);
    return rapport?.type === "cook.reported" ? { livrable: rapport.payload.deliverable ?? null, message: rapport.payload.summary } : { livrable: null, message: null };
  };

  // Ce que le chef lit du reviewer, sur l'issue : chaque constat, bloquant ou
  // non, et ce que la relecture a coûté.
  const direRelecture = (connu: PassDeTicket, sha: string, relue: Relue, sansDiff: boolean): string => {
    const combien = bloquants(relue.findings).length;
    const cook = cookDeRun(base, relue.run);
    const calibrage = cook?.model && cook.effort ? ` en \`${cook.model}\` / \`${cook.effort}\`` : "";
    const mesure = cook?.turns == null ? "" : ` · ${pluriel(cook.turns, "tour")} · ${nombre(cook.tokens ?? 0)} tokens · ${duree(cook.durationMs ?? 0)}`;
    return [
      `**Reviewer — ${combien === 0 ? "rien de bloquant" : constatsBloquants(combien)}.** \`${court(sha)}\`${connu.pr ? ` · ${connu.pr}` : ""}${sansDiff ? " · ticket sans diff : c'est le livrable délimité par le cook qui est relu" : ""}`,
      "",
      relue.summary ?? "",
      ...(relue.findings.length === 0 ? [] : [""]),
      ...relue.findings.map((finding) => `- **${finding.severity === "blocking" ? "Bloquant" : "Remarque"}**${lieu(finding)} — ${finding.text}`),
      "",
      `_Relu par le reviewer${calibrage}${mesure} — un autre process que le cook, sans droit d'écriture._`,
    ].join("\n");
  };

  // Les relectures illisibles d'une livraison (le run du cook, son commit),
  // dans l'ordre : le run de chacune. Lues au journal, elles tiennent après un
  // redémarrage.
  const illisibles = (ticket: number, run: string, sha: string): string[] =>
    journal.duTicket(ticket).flatMap((evenement) => (evenement.type === "pass.reviewed" && evenement.payload.run === run && evenement.payload.sha === sha && evenement.payload.outcome === "unreadable" ? [evenement.payload.review] : []));

  // Fait relire une livraison. Rend la relecture une fois qu'elle est au
  // journal — lisible, ou illisible et ses redemandes épuisées ; null si elle
  // n'a pas abouti, ou ne se lit pas encore, et reste à faire. La même
  // livraison (le run du cook, son commit) ne se relit jamais deux fois une
  // fois lue : seule une relecture illisible se redemande, au reviewer et à
  // lui seul, `REDEMANDES_MAX` fois au plus.
  const relire = async (connu: PassDeTicket, branche: string, ou: () => Promise<string>, sha: string, sansDiff: boolean): Promise<Relue | null> => {
    const { ticket, run } = connu;
    const relue = connu.review?.cook === run && connu.review.sha === sha ? connu.review : null;
    if (relue !== null && relue.outcome !== "unreadable") return relue;
    // Ce que cette livraison a déjà rendu d'illisible : autant de redemandes
    // consommées, celle qui part comprise.
    const redemandes = illisibles(ticket, run, sha).length;
    if (relue !== null && redemandes > REDEMANDES_MAX) return relue;
    if (!peutRelire()) return null;

    const issue = await github.issue(ticket);
    if (arrete || !issue) return null;
    const commentaires = (await github.commentaires(ticket))
      .filter((commentaire) => DE_CONFIANCE.includes(commentaire.association) && !DE_LA_BRIGADE.test(commentaire.body))
      .map((commentaire) => commentaire.body);
    if (arrete) return null;
    const diff = sansDiff ? null : { fichiers: depot.changes(branche), texte: depot.diff(branche), recoltes: depot.recoltes(branche) };
    // Sans diff, le reviewer juge le livrable, et lui seul. Sur un diff, ce
    // que le cook a délimité — ou son message, s'il n'a rien délimité.
    const rapport = rapportDuCook(ticket, run);
    // Un ticket d'interface montre ses captures au reviewer, qui les juge.
    // Un ticket hors du rail n'a pas de zone à la prise : il n'en a pas.
    const captures = diff !== null && !connu.horsRail && estDInterface({ zone: zoneALaPrise(journal.duTicket(ticket)), labels: issue.labels }) ? { dossier: dossierDesCaptures(ticket), screens: capturesLivrees(ticket, diff.fichiers) } : null;
    const mission = {
      depot: options.depotGitHub,
      base: options.base,
      // Hors du rail, c'est la PR qui est lue là : ce qu'elle annonce retirer,
      // ce qu'elle laisse, et le compte-rendu de son closer.
      ticket: { number: ticket, title: issue.title, body: issue.body ?? "" },
      horsRail: connu.horsRail,
      correction: connu.horsRail && estUneLivraisonDeCorrection(connu.run),
      carnet: connu.horsRail && estUneLivraisonDuCarnet(connu.run),
      commentaires,
      compteRendu: sansDiff ? rapport.livrable : (rapport.livrable ?? rapport.message),
      diff,
      captures,
    };
    const consigne = consigneDeRelecture(mission);
    // Une consigne que le système refuserait de passer à `claude` ne se lance
    // pas : elle échouerait à chaque réveil, sans verdict ni remontée.
    const poids = Buffer.byteLength(consigne);
    if (poids > CONSIGNE_MAX) {
      return remonter(connu, "review-unsendable", `La consigne du reviewer pèse ${nombre(poids)} octets, plus que ce qu'une commande accepte (${nombre(CONSIGNE_MAX)}) : cette livraison ne peut pas être relue par le runtime.`).then(() => null);
    }

    const review = `${debutDeRelecture(ticket)}${randomUUID().slice(0, 8)}`;
    let lecture: Lecture | null = null;
    let lue: ReturnType<typeof lireRelecture> | null = null;
    const conclure = (fin: Fin): VerdictGarde => {
      let flux = "";
      try {
        flux = readFileSync(join(options.repertoireEtat, "runs", `${review}.jsonl`), "utf8");
      } catch {
        // Sans flux, il n'y a pas de relecture.
      }
      lecture = lireFlux(flux);
      if (fin.arret) return "failed";
      const comment = finDuFlux(lecture, fin.code);
      if (comment === "86" || comment === "disconnected") return "neutral";
      if (comment === "refused") return "refused";
      if (comment !== "done") return "failed";
      lue = lireRelecture(lecture.message, captures);
      // Une relecture réussie ne remet pas à zéro les échecs d'affilée des
      // cooks : elle ne compte ni pour ni contre. Illisible, elle n'est un
      // échec que si elle laisse la livraison non jugée : redemandée, elle ne
      // compte pas plus — ses redemandes ont leur propre borne.
      return "relecture" in lue || redemandes < REDEMANDES_MAX ? "neutral" : "failed";
    };

    const worktree = await ou();
    // Le ticket a pu quitter le rail pendant les gates : aucune relecture ne
    // part pour lui.
    if (arrete || !enPass(ticket)) return null;
    const calibrage = options.decisions?.reviewer() ?? options.reviewer.calibrage;
    let lance: CookLance;
    try {
      lance = runtime.lancer({
        // Hors ticket, comme un jugement du manager : le ticket a son cook, et
        // c'est `pass.reviewed` qui rattache cette relecture à sa livraison.
        ticket: null,
        run: review,
        contexte: { station: REVIEWER, ...calibrage },
        // Il relit : le worktree et le dépôt lui sont rendus en lecture seule.
        ...envelopper(options.cloison, { commande: options.bin, args: dansLeBacASableLocal(options.bacASable, argumentsReviewer(consigne, calibrage), worktree) }, { cwd: worktree, depot: "lecture" }),
        cwd: worktree,
        env: environnementClaude(envGates, options.env ?? process.env),
        // Il ne reçoit aucun secret, mais il lit un worktree où les gates
        // viennent de tourner avec eux : ce qu'il en citerait est masqué.
        masquer: masqueDe(worktree),
        juger: conclure,
      });
    } catch (erreur) {
      // « stop » ou disjoncteur, arrivés depuis le dernier regard.
      if (erreur instanceof LancementRefuse) return null;
      throw erreur;
    }
    // Le ticket qui quitte le rail pendant sa relecture l'arrête : elle n'a
    // plus d'objet, et ne consomme plus rien.
    const guetter = runtime.surSondage(() => {
      if (!enPass(ticket)) lance.arreter();
    });
    const fin = await lance.fin.finally(guetter);
    if (arrete || fin.outcome === "stop" || fin.outcome === "interrupted") return null;

    const flux = lecture as Lecture | null;
    const relecture = lue as ReturnType<typeof lireRelecture> | null;
    const comment = fin.arret || !flux ? "failed" : finDuFlux(flux, fin.code);
    if (compteEnPanne(comment, flux, review, "une relecture du reviewer")) return null;
    // Le modèle a refusé de relire. Ce n'est pas une panne : la relecture
    // repart au réveil suivant, mais pas sans fin — au-delà, elle remonte.
    if (comment === "refused") {
      const refus = refusDAffilee(base, `review-${ticket}-`);
      avertir(`brigade : relecture du ticket #${ticket} refusée par le modèle (${direRefus(flux)}), essai ${Math.min(refus, REFUS_MAX)}/${REFUS_MAX}`);
      if (refus < REFUS_MAX || !enPass(ticket) || passDuTicket(base, ticket)?.run !== run) return null;
      await remonter(
        connu,
        "review-refused",
        `Le modèle a refusé ${refus} fois d'affilée de relire cette livraison — ${direRefus(flux)}, \`stop_reason: refusal\` : ni verte ni rouge. Ce n'est ni une panne ni un échec — le disjoncteur ne le compte pas —, mais la même consigne, relancée à l'identique, serait sans doute refusée encore. Flux brut du dernier refus : \`runs/${review}.jsonl\`.`,
      );
      return null;
    }
    // Seule une relecture allée à son terme dit quelque chose de la livraison.
    // Tout le reste — binaire introuvable, panne, arrêt par un garde-fou — dit
    // quelque chose de la machine : rien n'est écrit, la relecture repart au
    // réveil suivant, et c'est le disjoncteur qui borne.
    if (comment !== "done" || !relecture) {
      const raison = fin.arret
        ? `guard:${fin.arret.reason}`
        : (fin.erreur ?? (fin.code === 0 ? "flux sans résultat" : fin.code === null ? `signal ${fin.signal}` : `code de sortie ${fin.code}`));
      avertir(`brigade : relecture du ticket #${ticket} non aboutie (${raison}) — elle sera retentée`);
      return null;
    }
    const truncated = diff !== null && diffCoupe(diff);
    // Le ticket a pu quitter le rail pendant la relecture : elle n'a plus d'objet.
    if (!enPass(ticket) || passDuTicket(base, ticket)?.run !== run) return null;
    if ("illisible" in relecture) {
      noter(ticket, { type: "pass.reviewed", payload: { run, sha, review, outcome: "unreadable", summary: null, findings: [], reason: relecture.illisible, truncated } });
      // Aucun cook ne corrige une relecture qui ne se lit pas : elle se
      // redemande au reviewer, sur le même commit, dès la passe suivante —
      // sous les mêmes gardes qu'une première relecture.
      if (redemandes < REDEMANDES_MAX) {
        avertir(`brigade : relecture illisible sur le ticket #${ticket} (${relecture.illisible}) — redemandée au reviewer sur la même livraison, sans relancer de cook (redemande ${redemandes + 1}/${REDEMANDES_MAX})`);
        aRefaire = true;
        return null;
      }
      avertir(`brigade : relecture illisible sur le ticket #${ticket} (${relecture.illisible}) — ni verte ni rouge`);
      return passDuTicket(base, ticket)?.review ?? null;
    }
    const { verdict, summary, findings } = relecture.relecture;
    noter(ticket, { type: "pass.reviewed", payload: { run, sha, review, outcome: verdict, summary, findings, reason: null, truncated } });
    const lisible = passDuTicket(base, ticket)?.review ?? null;
    if (lisible) await commenter(ticket, [direRelecture(connu, sha, lisible, sansDiff), ...(fin.masques ? ["", direMasquage(fin.masques, "ce que le reviewer a dit — son flux brut, d'où vient cette relecture")] : [])].join("\n"));
    return lisible;
  };

  // Une relecture qui ne se lit pas n'est ni verte ni rouge : aucun cook ne
  // peut la corriger. Redemandée au reviewer sans qu'aucune réponse se lise,
  // elle remonte.
  const remonterIllisible = (connu: PassDeTicket, relue: Relue) => {
    const rendues = illisibles(connu.ticket, relue.cook, relue.sha);
    const flux = (rendues.length === 0 ? [relue.run] : rendues).map((review) => `\`runs/${review}.jsonl\``);
    const pourquoi = relue.reason ?? "illisible";
    return remonter(
      connu,
      "review-unreadable",
      flux.length === 1
        ? `Le reviewer a relu cette livraison, mais sa réponse ne se lit pas (${pourquoi}) : ni verte ni rouge. Son flux brut est dans ${flux[0]}.`
        : `Le reviewer a relu cette livraison ${flux.length} fois — la relecture lui a été redemandée ${nombre(flux.length - 1)} fois, sans relancer de cook —, et aucune de ses réponses ne se lit (la dernière : ${pourquoi}) : ni verte ni rouge. Leurs flux bruts sont dans ${flux.join(", ")}.`,
    );
  };

  // Le second jugement d'une livraison (le run du cook, son commit), s'il est
  // rendu. Lu au journal, il tient après un redémarrage.
  const secondJugement = (ticket: number, run: string, sha: string) =>
    journal.duTicket(ticket).findLast((evenement) => evenement.type === "pass.second-judged" && evenement.payload.run === run && evenement.payload.sha === sha) ?? null;

  // La livraison touche à ses juges, et son second juge l'a établie non
  // affaiblie : il ne la retient plus.
  const nonAffaiblie = (connu: PassDeTicket) => {
    const jugement = connu.judgeModified && connu.sha !== null ? secondJugement(connu.ticket, connu.run, connu.sha) : null;
    return jugement?.type === "pass.second-judged" && jugement.payload.verdict === "not-weakened";
  };
  // Arrêtée pour ses seuls juges, que son second juge a établie non affaiblie :
  // elle reprend le chemin d'une livraison ordinaire.
  const aReprendre = (connu: PassDeTicket | null) =>
    connu !== null && connu.phase === "held" && connu.reason === A_RELIRE && connu.cause === JUGES_MODIFIES && connu.verdict === "green" && nonAffaiblie(connu);

  // Une livraison verte qui touche à ses juges, arrêtée pour cela, est jugée
  // une seconde fois — une seule par livraison : par un autre juge que le
  // reviewer, plus fort que lui, qui ne lit ni sa relecture ni son verdict, et
  // à qui l'on ne demande qu'une chose : le contrôle est-il affaibli ? Son
  // verdict et sa raison s'écrivent au journal et sur la PR. `not weakened` :
  // elle reprend le chemin d'une livraison ordinaire (`aReprendre`). Sinon,
  // elle reste arrêtée, et une carte `gesture`, proposée au triage, dit ce qui est
  // affaibli, et où.
  const jugerUneSecondeFois = async (connu: PassDeTicket): Promise<void> => {
    const { ticket, run, sha, number, pr, judgedBase } = connu;
    if (connu.phase !== "held" || connu.reason !== A_RELIRE || !connu.judgeModified || sha === null || number === null) return;
    if (!enPass(ticket) || secondJugement(ticket, run, sha) !== null || !peutRelire()) return;
    const reviewer = options.decisions?.reviewer() ?? options.reviewer.calibrage;
    const review = connu.review?.cook === run && connu.review.sha === sha ? connu.review.run : null;
    const verdictDeLaPass = journal.duTicket(ticket).findLast((evenement) => evenement.type === "pass.judged" && evenement.payload.run === run && evenement.payload.sha === sha);
    const juges = verdictDeLaPass?.type === "pass.judged" ? (verdictDeLaPass.payload.judges ?? []) : [];

    const rendre = async (verdict: VerdictDuSecondJuge, reason: string, lance: { judge: string; model: string; effort: string } | null, masques = 0) => {
      // Le ticket a pu quitter le rail, ou la livraison changer, pendant qu'il jugeait.
      const actuel = passDuTicket(base, ticket);
      if (arrete || !enPass(ticket) || actuel?.run !== run || actuel.sha !== sha || actuel.phase !== "held" || secondJugement(ticket, run, sha) !== null) return;
      // Le verdict et sa carte s'écrivent ensemble : aucun verdict qui retient
      // la livraison sans que le chef en soit saisi.
      const carte = verdict === "not-weakened" ? null : carteDuSecondJuge({ verdict, raison: reason, juges, pr });
      const posee = base.transaction(() => {
        noter(ticket, { type: "pass.second-judged", payload: { run, sha, judge: lance?.judge ?? null, model: lance?.model ?? null, effort: lance?.effort ?? null, reviewer, review, verdict, reason } });
        // Une proposition `gesture` : elle va au triage, qui la tranche ou
        // l'écrit en question pour le chef (carte-todo.ts).
        if (carte !== null) entrerDansTodo(journal, projet, ticket, { type: "gesture", enonce: carte.enonce }, AUTEUR);
        return carte !== null;
      });
      avertir(`brigade : second juge sur ${connu.horsRail ? `la PR #${ticket}, hors du rail,` : `le ticket #${ticket}`}, qui touche à ses juges — ${DIRE_VERDICT[verdict]}${lance ? ` (\`${lance.model}\` / \`${lance.effort}\`)` : ", sans avoir été lancé"}`);
      const qui = lance
        ? `_Jugé par le second juge en \`${lance.model}\` / \`${lance.effort}\` (run \`${lance.judge}\`) : un autre process que le reviewer, qui relit en \`${reviewer.model}\` / \`${reviewer.effort}\`, plus fort que lui, et qui n'a lu ni sa relecture ni son verdict. Sa seule question : le contrôle est-il affaibli ?_`
        : `_Le second juge n'a pas été lancé : ce verdict est celui de la pass, faute de pouvoir le lui demander._`;
      await commenter(
        number,
        [
          `**Second juge — \`${DIRE_VERDICT[verdict]}\`.** \`${court(sha)}\`${pr ? ` · ${pr}` : ""}`,
          "",
          reason,
          "",
          qui,
          ...(masques > 0 ? ["", direMasquage(masques, "ce que le second juge a dit — son flux brut, d'où vient ce verdict")] : []),
        ].join("\n"),
      );
      if (carte !== null && posee) {
        await commenter(
          ticket,
          [
            `**Pass — verte, non mergée : le second juge dit \`${DIRE_VERDICT[verdict]}\`. Une carte est proposée au chef, que le triage lit d'abord.**${pr ? ` ${pr}` : ""}`,
            "",
            ...carte.lignes.map((ligne) => `- ${ligne}`),
          ].join("\n"),
        );
      }
    };

    const calibrage = calibrageDuSecondJuge(reviewer);
    if (calibrage === null) {
      return rendre("cannot-establish", `Aucun calibrage n'est plus fort que celui du reviewer (\`${reviewer.model}\` / \`${reviewer.effort}\`) : le second juge doit l'être, et rien ne peut le remplacer.`, null);
    }
    const issue = await github.issue(ticket);
    if (arrete || !issue) return;
    const ref = connu.branch === null ? null : depot.livree(connu.branch);

    const nom = essaiDuSecondJuge(ticket);
    let worktree: string | null = null;
    let panne: string | null = null;
    try {
      depot.jeter(nom);
      worktree = ref === null || judgedBase === null ? null : ((await depot.fusionner(nom, judgedBase, sha))?.worktree ?? null);
    } catch (erreur) {
      panne = message(erreur);
    }
    try {
      if (arrete) return;
      if (worktree === null || ref === null) {
        return await rendre("cannot-establish", `La livraison (\`${court(sha)}\`) ne se fusionne plus avec \`${options.base}\` (\`${court(judgedBase)}\`)${panne === null ? "" : ` — ${panne}`} : le second juge n'a rien à lire.`, null);
      }
      const consigne = consigneDuSecondJuge({
        depot: options.depotGitHub,
        base: options.base,
        pr: number,
        ticket: { number: ticket, title: issue.title, body: issue.body ?? "" },
        juges,
        diff: { fichiers: depot.changes(ref), texte: depot.diff(ref) },
      });
      const poids = Buffer.byteLength(consigne);
      if (poids > CONSIGNE_MAX) {
        return await rendre("cannot-establish", `La consigne du second juge pèse ${nombre(poids)} octets, plus que ce qu'une commande accepte (${nombre(CONSIGNE_MAX)}) : il n'a pas pu être lancé.`, null);
      }

      const judge = `${debutDuSecondJugement(ticket)}${randomUUID().slice(0, 8)}`;
      let lecture: Lecture | null = null;
      const conclure = (fin: Fin): VerdictGarde => {
        let flux = "";
        try {
          flux = readFileSync(join(options.repertoireEtat, "runs", `${judge}.jsonl`), "utf8");
        } catch {
          // Sans flux, il n'y a pas de jugement.
        }
        lecture = lireFlux(flux);
        if (fin.arret) return "failed";
        const comment = finDuFlux(lecture, fin.code);
        if (comment === "86" || comment === "disconnected") return "neutral";
        if (comment === "refused") return "refused";
        return comment === "done" ? "neutral" : "failed";
      };
      let lance: CookLance;
      try {
        lance = runtime.lancer({
          // Hors ticket, comme une relecture : c'est `pass.second-judged` qui le
          // rattache à la livraison. Sous son nom à lui, pas celui du reviewer.
          ticket: null,
          run: judge,
          contexte: { station: SECOND_JUGE, ...calibrage },
          // Il juge : le worktree et le dépôt lui sont rendus en lecture seule.
          ...envelopper(options.cloison, { commande: options.bin, args: dansLeBacASableLocal(options.bacASable, argumentsReviewer(consigne, calibrage), worktree) }, { cwd: worktree, depot: "lecture" }),
          cwd: worktree,
          env: environnementClaude(envGates, options.env ?? process.env),
          masquer: masqueDe(worktree),
          juger: conclure,
        });
      } catch (erreur) {
        if (erreur instanceof LancementRefuse) return;
        throw erreur;
      }
      const guetter = runtime.surSondage(() => {
        if (!enPass(ticket)) lance.arreter();
      });
      const fin = await lance.fin.finally(guetter);
      if (arrete || fin.outcome === "stop" || fin.outcome === "interrupted") return;
      const flux = lecture as Lecture | null;
      const comment = fin.arret || !flux ? "failed" : finDuFlux(flux, fin.code);
      if (compteEnPanne(comment, flux, judge, "le second juge")) return;
      const fait = { judge, ...calibrage };
      // Un refus n'est ni une panne ni un verdict : il ne s'établit rien.
      if (comment === "refused") return await rendre("cannot-establish", `Le modèle a refusé de juger (${direRefus(flux)}). Son flux brut est dans \`runs/${judge}.jsonl\`.`, fait, fin.masques);
      // Le reste — panne, arrêt par un garde-fou — dit quelque chose de la
      // machine : rien n'est écrit, il repart au réveil suivant.
      if (comment !== "done" || !flux) {
        const raison = fin.arret ? `guard:${fin.arret.reason}` : (fin.erreur ?? (fin.code === null ? `signal ${fin.signal}` : `code de sortie ${fin.code}`));
        avertir(`brigade : second juge du ticket #${ticket} non abouti (${raison}) — il sera relancé`);
        return;
      }
      const lu = lireSecondJugement(flux.message);
      if ("illisible" in lu) return await rendre("cannot-establish", `Sa réponse ne se lit pas (${lu.illisible}). Son flux brut est dans \`runs/${judge}.jsonl\`.`, fait, fin.masques);
      return await rendre(lu.verdict, lu.raison, fait, fin.masques);
    } finally {
      if (!arrete) {
        try {
          depot.jeter(nom);
        } catch (erreur) {
          avertir(`brigade : worktree jetable du second juge non retiré (${nom}) — ${message(erreur)}`);
        }
      }
    }
  };

  // Écrit le verdict. Sur la livraison d'une relance du manager, il compte au
  // disjoncteur : rouge, c'est un échec de plus.
  const prononcer = (connu: PassDeTicket, jugement: Extract<FaitPass, { type: "pass.judged" }>["payload"]) => {
    base.transaction(() => {
      noter(connu.ticket, { type: "pass.judged", payload: jugement });
      if (connu.returns > RENVOIS_MAX) runtime.jugerRelance(connu.ticket, connu.run, jugement.verdict);
    });
  };

  // Un verdict vert qui ne tient plus face à la base : il devient rouge, par
  // ces faits. Sur la livraison d'une relance du manager, il compte au
  // disjoncteur comme un verdict rouge.
  const rougir = (connu: PassDeTicket, faits: FaitPass[]) => {
    base.transaction(() => {
      for (const fait of faits) noter(connu.ticket, fait);
      if (connu.returns > RENVOIS_MAX) runtime.jugerRelance(connu.ticket, connu.run, "red");
    });
  };

  // Rejouer des gates consomme la machine, comme un cook : la pass lit celle de
  // la station, sous les mêmes seuils. Illisible, elle ne retient rien.
  const machine = options.machine ?? (() => lireMachine(options.repertoireEtat));
  const seuils = options.seuils ?? configMachine({});
  const sature = (): Saturation | null => {
    try {
      return saturation(machine(), seuils);
    } catch {
      return null;
    }
  };

  // Les gates de ce commit ont déjà été coupées une fois sur une machine
  // saturée : leur rejeu est parti sur une machine calme.
  const dejaCoupees = (ticket: number, sha: string) =>
    journal.duTicket(ticket).some((evenement) => evenement.type === "pass.waiting" && evenement.payload.reason === GATES_COUPEES && evenement.payload.sha === sha);

  // Ce que la branche d'une livraison porte, sans worktree.
  // Un workflow qui ne se lance pas sur une PR vers la base n'enverra jamais
  // de check : l'attendre ferait perdre le délai entier.
  // Lus sur la branche jugée, à chaque jugement : rien n'est gardé d'un tour à l'autre.
  const workflowsDeLaPr = (branche: string): string[] => {
    const modifies = depot.changes(branche);
    return depot
      .liste(branche, WORKFLOWS)
      .filter((fichier) => /\.ya?ml$/.test(fichier))
      .filter((fichier) => declencheSurPr(depot.lire(branche, `${WORKFLOWS}/${fichier}`) ?? "", options.base, modifies))
      .map((fichier) => `${WORKFLOWS}/${fichier}`);
  };
  // Le clone ne connaît plus la branche : une restauration repart d'un clone
  // neuf. La pass n'a plus rien à juger, et ne la recrée pas.
  const sansBranche = (connu: PassDeTicket, branche: string, pourquoi: string) =>
    remonter(connu, "worktree-lost", `Le clone de la station ne connaît plus la branche de cette livraison (\`${branche}\`) : ${pourquoi}`);

  // La livraison attend, et le dit une fois.
  const attendre = async (connu: PassDeTicket, motif: MotifDAttente, pourquoi: string, sha?: string): Promise<void> => {
    if (connu.phase === "waiting" && connu.reason === motif) return;
    noter(connu.ticket, { type: "pass.waiting", payload: { reason: motif, ...(sha === undefined ? {} : { sha }) } });
    await commenter(connu.ticket, [`**Pass — en attente (\`${motif}\`).** \`${court(connu.sha)}\`${connu.pr ? ` · ${connu.pr}` : ""}`, "", pourquoi].join("\n"));
  };
  // Une livraison se juge fusionnée avec la base : rouge, la base rougirait
  // toutes les livraisons, pour un rouge qu'aucun cook ne peut corriger.
  const attendreLaBase = (connu: PassDeTicket, rouge: string) =>
    attendre(
      connu,
      BASE_ROUGE,
      `\`${options.base}\` est rouge : ses gates, jouées sur elle-même, ont échoué sur \`${court(rouge)}\`. Une livraison se juge fusionnée avec \`${options.base}\` : tant qu'elle est rouge, la pass ne juge ni ne merge rien, et ne renvoie aucun cook — ce rouge-là n'est celui d'aucune livraison. Rien n'est à refaire sur celle-ci : elle sera jugée, et mergée sous grant, dès que \`${options.base}\` sera réparée — la pass rejoue ses gates seule une fois, puis dès qu'elle bouge, ou sans commit à la demande du chef (\`${REJOUER_LA_BASE}\`) ; si le rouge tient, elle ouvre un ticket de réparation, qui part avant tout autre. La merger à la main reste possible.`,
    );

  // Décide de ce que devient une livraison jugée. Le grant est lu dans la
  // transaction qui écrit l'intention de merger : une révocation ne peut pas
  // se glisser entre les deux. `tete` : la tête de la base, telle que la pass
  // vient de la rapatrier — sans quoi une livraison à merger commence par là.
  const decider = async (ticket: number, tete?: string): Promise<void> => {
    // L'extinction se constate avant ce qu'elle arrête : l'histoire se lit dans l'ordre.
    eteindre(() => {});
    const suite = base.transaction((): Suite => {
      const connu = passDuTicket(base, ticket);
      if (!connu || !enPass(ticket)) return null;
      // Arrêtée pour ses juges, que son second juge a établie non affaiblie, elle
      // est verte comme au premier jour.
      const verte = VERTES.includes(connu.phase) || aReprendre(connu);
      if (!verte && connu.phase !== "red" && connu.phase !== "deferred") return null;
      const { pr, number, sha } = connu;
      const fusion = connu.judgedBase === null ? "" : ` fusionné avec \`${options.base}\` (\`${court(connu.judgedBase)}\`)`;
      const livraison = `\`${court(sha)}\`${fusion}${pr ? ` · ${pr}` : ""}${connu.noDiff ? " · ticket sans diff" : ""}`;

      if (!verte) {
        const constat = ["", ...connu.findings.flatMap((finding) => [finding, ""])];
        // Hors du rail, personne ne corrige : ni renvoi, ni manager. Le chef
        // tranche, sur la PR.
        if (connu.horsRail) {
          noter(ticket, { type: "pass.escalated", payload: { reason: ENCORE_ROUGE, cause: HORS_RAIL } });
          return {
            commentaire: [
              `**Pass — rouge : remontée au chef.** ${livraison}`,
              ...constat,
              `Rien n'est mergé, et aucun cook n'est renvoyé sur une livraison hors du rail : cette PR reste ouverte. ${SUITE_HORS_RAIL}`,
            ].join("\n"),
          };
        }
        // Dès le second rouge, la suite est au manager, s'il est allumé : le
        // ticket reste en pass, pour qu'aucun cook ne reparte avant lui.
        if (managerAllume(base) && connu.returns >= 1) {
          if (connu.phase === "deferred") return null;
          noter(ticket, { type: "pass.deferred", payload: {} });
          return {
            commentaire: [
              `**Pass — rouge${connu.returns < RENVOIS_MAX ? "" : ` après ${connu.returns} renvois`} : au manager.** ${livraison}`,
              ...constat,
              connu.returns < RENVOIS_MAX
                ? "Avant le second renvoi, le manager monte le calibrage d'un cran s'il le peut : le ticket reste en pass jusque-là."
                : "Les renvois sont épuisés : le manager choisit la suite — monter le calibrage, redécouper le ticket, ou te le remonter — et la dit ici.",
            ].join("\n"),
          };
        }
        if (connu.returns < RENVOIS_MAX) {
          const n = connu.returns + 1;
          noter(ticket, { type: "pass.returned", payload: { n, findings: connu.findings } });
          // Sa raison devient une leçon candidate du projet (`apprentissage/renvoi.ts`).
          noterLeRenvoi(journal, { projet, ticket, auteur: AUTEUR, origine: "pass-send-back", raisons: connu.findings });
          rail.rendre(ticket, PASS_ROUGE);
          return {
            commentaire: [
              `**Pass — rouge, renvoi ${n}/${RENVOIS_MAX}.** ${livraison}`,
              ...constat,
              "Le ticket est revenu en attente : la station relance un cook dessus, sur la même branche.",
            ].join("\n"),
          };
        }
        noter(ticket, { type: "pass.escalated", payload: { reason: ENCORE_ROUGE, cause: "returns-exhausted" } });
        rail.quatreVingtSix(ticket, { motif: `pass:${ENCORE_ROUGE}` });
        return {
          commentaire: [
            `**Pass — rouge après ${RENVOIS_MAX} renvois : remontée au chef.** ${livraison}`,
            ...constat,
            `Rien n'est mergé, et aucun cook n'est relancé : le ticket est 86. ${suiteDuChef(pr)}`,
          ].join("\n"),
        };
      }

      // Sans diff, il n'y a rien à merger : ni grant, ni PR. Le ticket est
      // servi sur la foi de sa relecture.
      if (connu.noDiff) {
        noter(ticket, { type: "pass.served", payload: { verdict: connu.verdictSeq ?? 0 } });
        return {
          service: [
            `**Pass — verte, servie sans merge.** ${livraison}`,
            "",
            "Ce ticket n'a produit aucun diff : il n'y a rien à merger, et ni les gates ni la CI n'avaient rien à en dire. Le reviewer était son seul juge ; il n'a rien trouvé de bloquant. Le livrable est ce que le cook a délimité, plus haut sur cette issue, que la pass ferme.",
          ].join("\n"),
        };
      }
      // Un verdict vert sur un diff porte toujours sa PR et son commit.
      if (pr === null || number === null || sha === null) return null;
      if (connu.declarations.length > 0) {
        noter(ticket, { type: "pass.held", payload: { reason: A_RELIRE, cause: causeDeDeclarations(connu.declarations) } });
        if (connu.judgeModified) aRefaire = true;
        return {
          commentaire: [
            `**Pass — verte, non mergée (\`${A_RELIRE}\`).** ${livraison}`,
            "",
            "Cette livraison touche à ce que le projet déclare au runtime pour s'ouvrir : la pass ne la merge jamais elle-même, grant ou pas. À relire avant de merger à la main :",
            ...connu.declarations.map((fichier) => `- \`${fichier}\` — ${DECLARATIONS[fichier] ?? "ce que le projet s'ouvre"} ;`),
            "- ce qu'elle en retire ou y réécrit, de même.",
            ...(connu.judgeModified ? ["", `Elle touche aussi à ce qui la juge (${JUGES.map((juge) => `\`${juge}\``).join(", ")}). ${SECOND_JUGE_APPELE}`] : []),
            "",
            `Mergée à la main, ${vuDeLaPass(connu.horsRail)}.`,
          ].join("\n"),
        };
      }
      // Une livraison qui touche à ses juges ne se merge pas sur le seul verdict
      // de la pass : son second juge doit l'avoir établie non affaiblie.
      if (connu.judgeModified && !nonAffaiblie(connu)) {
        noter(ticket, { type: "pass.held", payload: { reason: A_RELIRE, cause: JUGES_MODIFIES } });
        // Son second juge part dès la passe qui suit.
        aRefaire = true;
        return {
          commentaire: [
            `**Pass — verte, non mergée (\`${A_RELIRE}\`).** ${livraison}`,
            "",
            `Cette livraison touche à ce qui la juge (${JUGES.map((juge) => `\`${juge}\``).join(", ")}) : la pass ne la merge pas sur son seul verdict, grant ou pas. ${SECOND_JUGE_APPELE} ${SECOND_JUGE_PUIS} Mergée à la main d'ici là, ${vuDeLaPass(connu.horsRail)}.`,
          ].join("\n"),
        };
      }
      // La PR d'un renommage du code abandonné — échoué, hors délai, ou le
      // « oui » du chef retiré — n'est jamais mergée, pause levée ou non : elle
      // remonte au chef, sans merge, et n'est plus suivie que pour un merge à
      // la main.
      if (renommageEcarte(base, ticket)) {
        noter(ticket, { type: "pass.escalated", payload: { reason: NON_JUGEE, cause: RENOMMAGE_ABANDONNE } });
        return {
          commentaire: [
            `**Pass — verte, non mergée : renommage abandonné.** ${livraison}`,
            "",
            `Ce renommage du code a été abandonné pendant sa pause — échoué, hors délai, ou le « oui » du chef retiré : la pass ne le merge pas, et la carte de la file dit pourquoi. Cette PR reste ouverte, sans merge : à fermer. ${SUITE_HORS_RAIL}`,
          ].join("\n"),
        };
      }
      // La cuisine en pause pour le renommage du code, sur le « oui » du chef :
      // aucun autre merge que celui du renommage. La livraison attend, et
      // repart seule à la fin de la pause.
      if (mergeRetenu(base, ticket) !== null) {
        if (connu.phase === "waiting" && connu.reason === EN_PAUSE) return null;
        noter(ticket, { type: "pass.waiting", payload: { reason: EN_PAUSE } });
        return {
          commentaire: [
            `**Pass — en attente (\`${EN_PAUSE}\`).** ${livraison}`,
            "",
            `La cuisine est en pause pour le renommage du code, sur l'accord du chef : aucun autre merge ne se fait avant sa fin. Rien n'est à refaire sur cette livraison : elle repart seule à la fin de la pause — rejugée d'abord si \`${options.base}\` a bougé, puis mergée sous grant.`,
          ].join("\n"),
        };
      }
      // L'interrupteur du projet éteint : rien n'est mergé. La livraison
      // attend, et repart seule quand il est rallumé.
      if (projetEteint(base)) {
        if (connu.phase === "waiting" && connu.reason === PROJET_ETEINT) return null;
        noter(ticket, { type: "pass.waiting", payload: { reason: PROJET_ETEINT } });
        return {
          commentaire: [
            `**Pass — en attente (\`${PROJET_ETEINT}\`).** ${livraison}`,
            "",
            `L'interrupteur du projet est éteint : rien n'est mergé tant qu'il l'est. Rien n'est à refaire sur cette livraison : elle repart seule quand il est rallumé (\`${geste(`switch on`)}\`) — rejugée d'abord si \`${options.base}\` a bougé, puis mergée.`,
          ].join("\n"),
        };
      }
      const grant = etatDuGrant(base, "merge", maintenant());
      if (!grant?.active) {
        // Ce qu'elle aurait fait sous grant, dit avec l'arrêt : rien n'est
        // rapatrié ni joué pour le dire.
        const sousGrant = `aurait mergé ${pr} sur \`${options.base}\` au commit \`${court(sha)}\`, verdict n° ${connu.verdictSeq ?? 0} — une fois vérifié que \`${options.base}\` n'a pas bougé depuis ce verdict et n'est pas rouge`;
        const eteint = grant?.ended === "expired" ? grant : null;
        noter(ticket, { type: "pass.held", payload: { reason: SANS_GRANT, ...(eteint ? { expired: eteint.since } : {}) } });
        return {
          commentaire: [
            `**Pass — verte, non mergée (\`${SANS_GRANT}\`).** ${livraison}`,
            "",
            eteint
              ? `Le grant \`merge\` s'est éteint seul le ${eteint.since} — ${direExtinction(eteint.cause)} : la pass s'arrête là. À merger à la main — ${vuDeLaPass(connu.horsRail)}. Le réaccorder (\`${geste(`grant enable merge`)}\`, avec ou sans échéance) vaudra pour les livraisons suivantes, pas pour celle-ci.`
              : `Le grant \`merge\` n'est pas actif : la pass s'arrête là. À merger à la main — ${vuDeLaPass(connu.horsRail)}. Activer le grant (\`${geste(`grant enable merge`)}\`) vaudra pour les livraisons suivantes, pas pour celle-ci.`,
            "",
            `Sous grant, la pass ${sousGrant}.`,
          ].join("\n"),
        };
      }
      // Les usages qui restent sont tous retenus par des merges en vol : celui-ci
      // n'en prend pas un de plus. La décision se reprend au réveil suivant,
      // quand leur sort est connu.
      if (grant.usesLeft !== null && grant.usesLeft <= grant.reserved) {
        if (!retenus.has(ticket)) avertir(`brigade : ticket #${ticket} vert, pas mergé pour l'instant — ${grant.reserved > 1 ? "les usages qui restent au grant \`merge\` sont retenus par des merges" : "le dernier usage du grant \`merge\` est retenu par un merge"} en cours : la décision se reprend dès que son sort est connu (\`${geste(`grant`)}\`)`);
        retenus.add(ticket);
        return null;
      }
      retenus.delete(ticket);
      // Le verdict porte sur la fusion avec une base : il n'autorise le merge
      // que sur celle-là.
      if (tete === undefined || tete !== connu.judgedBase) return { verifier: true };
      noter(ticket, { type: "grant.used", payload: { action: "merge", pr, number, sha, base: options.base, verdict: connu.verdictSeq ?? 0 } });
      return { merge: { pr, number, sha, branche: connu.branch, jugee: tete, horsRail: connu.horsRail } };
    });
    if (suite === null) return;
    if ("commentaire" in suite) return commenter(ticket, suite.commentaire);
    if ("service" in suite) {
      await finir(ticket);
      return commenter(ticket, suite.service);
    }
    if ("verifier" in suite) {
      const connu = passDuTicket(base, ticket);
      // La base a pu bouger : la vérifier peut la rejuger, ce qui attend son tour.
      if (!connu || !aSonTour(ticket)) return;
      const controle = etatDeLaBase(base);
      if (controle?.outcome === "red" && !estLaReparation(ticket)) return attendreLaBase(connu, controle.sha);
      const vue = await depot.rapatrier();
      if (arrete) return;
      // La base a bougé depuis le verdict : il ne dit plus ce qui sera sur
      // elle. La livraison se rejuge — la même règle qu'au premier jugement.
      if (vue !== connu.judgedBase) return juger(connu);
      return decider(ticket, vue);
    }

    const { pr, number, sha, branche, jugee, horsRail } = suite.merge;
    let merge;
    try {
      merge = await github.merger(number, sha);
    } catch (erreur) {
      // Rien ne dit si le merge a eu lieu : l'intention reste sans résultat, et
      // se réconcilie au réveil suivant.
      if (!arrete) avertir(`brigade : merge du ticket #${ticket} sans réponse (${pr}) — ${message(erreur)}`);
      return;
    }
    if (arrete) return;
    if (!merge.fait) {
      const { motif } = merge;
      // Le dépôt exige une branche à jour, et celle-ci ne l'est plus : ce
      // refus-là, un cook le lève en rebasant.
      const connu = passDuTicket(base, ticket);
      const relue = branche === null ? null : await github.prDeBranche(branche).catch(() => null);
      if (arrete) return;
      // Mergée entre-temps : GitHub refuse de la merger deux fois. L'intention
      // se conclut sur ce merge, pas sur le refus — c'est lui qui consomme
      // l'usage du grant.
      if (connu && relue?.merged) return constaterMerge(connu, relue, "outside", false);
      if (connu && relue?.enRetard) {
        rougir(connu, [
          { type: "merge.failed", payload: { pr, sha, reason: motif } },
          {
            type: "pass.outdated",
            payload: {
              sha,
              findings: [
                `Branche en retard sur \`${options.base}\` : le dépôt exige une branche à jour pour merger, et GitHub a refusé (${motif}). ${mettreAJour(options.base)}, et rejoue les gates.`,
              ],
            },
          },
        ]);
        avertir(`brigade : merge du ticket #${ticket} refusé par GitHub, branche en retard sur ${options.base} (${pr}) — ${horsRail ? "hors du rail, elle remonte au chef" : "elle repart au cook"}`);
        return decider(ticket);
      }
      base.transaction(() => {
        noter(ticket, { type: "merge.failed", payload: { pr, sha, reason: motif } });
        noter(ticket, { type: "pass.held", payload: { reason: MERGE_REFUSE, cause: motif } });
      });
      avertir(`brigade : merge du ticket #${ticket} refusé par GitHub (${pr}) — ${motif}`);
      return commenter(
        ticket,
        [`**Pass — verte, merge refusé par GitHub.** \`${court(sha)}\` · ${pr}`, "", `${motif}. La pass ne le retente pas : à merger à la main — ${horsRail ? "elle le verra" : "elle le verra et servira le ticket"}.`].join("\n"),
      );
    }
    // GitHub vient de merger sous le jeton de la pass : c'est son identité, si
    // elle en a une à elle — telle qu'elle a déjà été lue. Entre un merge fait
    // et son résultat écrit, rien n'attend : un runtime qui s'arrête là
    // n'écrirait plus rien.
    const sous = moi;
    noter(ticket, { type: "merge.done", payload: { pr, sha, by: "pass", ...acteur(sous), reconciled: false, unverified: false } });
    await finir(ticket, horsRail);
    await commenter(ticket, [`**Pass — verte, mergée sur \`${options.base}\` sous le grant \`merge\`.** \`${court(sha)}\` · ${pr}`, "", `Jugée fusionnée avec \`${options.base}\` telle qu'elle était au moment de merger (\`${court(jugee)}\`).`].join("\n"));
  };

  // Une livraison née avant un renommage du code mergé — celle qu'une pause a
  // retenue, ou celle d'un cook parti avant elle — est portée sur l'arbre
  // renommé avant d'être jugée (pause/reprise.ts) : un commit de plus sur sa
  // branche, poussé, où ce qu'elle change suit les déplacements de l'outil.
  // Elle ne touchait aucun fichier déplacé : elle se juge telle quelle. Elle
  // ne se porte pas — un conflit avec le renommage — : elle est remontée au
  // chef, et la file la nomme avec la raison. Rend vrai si le jugement suit.
  const porterSurLeRenommage = async (connu: PassDeTicket, branch: string): Promise<boolean> => {
    const { ticket } = connu;
    const noterReprise = (fait: FaitPause) => journal.ajouter({ project: projet, ticket, author: AUTEUR, ...fait });
    for (const { request, sha: commit, moves } of renommagesMerges(base)) {
      const vu = `${depot.tete(depot.livree(branch))}@${commit}`;
      if (sansRenommageAPorter.has(vu)) continue;
      const portee = await depot.transposer(essaiDeJugement(ticket), branch, { commit, traduire: (chemin) => traduireChemin(chemin, moves) });
      if (arrete) return false;
      if (portee.issue === "deja" || portee.issue === "intacte") {
        sansRenommageAPorter.add(vu);
        continue;
      }
      if (portee.issue === "conflit") {
        const chemins = portee.chemins.map((chemin) => `\`${chemin}\``).join(", ");
        const why = `it was born before the code rename (${court(commit)}) and does not carry onto the renamed tree: conflict on ${chemins}`;
        noterReprise({ type: "rename.stranded", payload: { request, branch, sha: portee.de, why, paths: portee.chemins } });
        await remonter(
          connu,
          INTRANSPOSABLE,
          `Cette livraison est née avant le renommage du code (\`${court(commit)}\`, mergé sur \`${options.base}\`), et ce qu'elle change ne se porte pas sur l'arbre renommé : conflit sur ${chemins}. Sa branche \`${branch}\` n'a pas bougé.`,
        );
        return false;
      }
      depot.pousser(branch);
      noterReprise({ type: "rename.carried", payload: { request, branch, from: portee.de, to: portee.vers, base: portee.base, paths: portee.chemins } });
      avertir(`brigade : la livraison du ticket #${ticket} est portée sur l'arbre du renommage du code (${court(portee.de)} → ${court(portee.vers)})`);
      await commenter(
        ticket,
        [
          `**Pass — livraison portée sur l'arbre du renommage du code.** \`${court(portee.de)}\` → \`${court(portee.vers)}\` · branche \`${branch}\``,
          "",
          `Née avant le renommage du code (\`${court(commit)}\`, mergé sur \`${options.base}\`), elle touchait des fichiers qu'il a déplacés. Un commit de plus sur sa branche fusionne \`${options.base}\` renommée et y déplace ce qu'elle avait écrit :`,
          "",
          ...portee.chemins.map(([ancien, nouveau]) => `- \`${ancien}\` → \`${nouveau}\``),
          "",
          "Sa zone se lit de même sur les nouveaux chemins. Elle est jugée ainsi, comme toute livraison.",
        ].join("\n"),
      );
    }
    return true;
  };

  // Juge une livraison. Tant qu'un juge n'a pas conclu (CI en cours, GitHub
  // injoignable), rien n'est écrit : le réveil suivant y revient.
  const juger = async (connu: PassDeTicket) => {
    if (connu.branch === null) return;
    // Le worktree jetable du jugement, fait à la première demande seulement —
    // une livraison qui attend sa CI n'en fait pas à chaque réveil —, et
    // d'abord retiré s'il en restait un d'un jugement interrompu.
    const nom = essaiDeJugement(connu.ticket);
    let pose = false;
    const poser = <T>(faire: (nom: string) => Promise<T>): Promise<T> => {
      pose = true;
      depot.jeter(nom);
      return faire(nom);
    };
    try {
      await jugerLivraison(connu, connu.branch, poser);
    } finally {
      // Arrêté, le runtime ne retire rien : ce qu'il laisse part au démarrage
      // suivant, et celui-ci a peut-être déjà posé le sien.
      if (pose && !arrete) {
        try {
          depot.jeter(nom);
        } catch (erreur) {
          avertir(`brigade : worktree jetable de la pass non retiré (${nom}) — ${message(erreur)}`);
        }
      }
    }
  };

  // À qui est le rouge d'une livraison fusionnée avec cette tête de la base ?
  // Si la base n'y a pas été jugée, ses gates sont jouées sur elle seule.
  // `red` : la base est rouge. `unknown` : rien ne le dit — la machine n'a pas
  // de quoi la jouer pour l'instant, ou l'essai ne s'est pas fait : « pas pu
  // vérifier » n'est pas « c'est vert », et ne renvoie aucun cook.
  const jugerLaBase = async (tete: string): Promise<"red" | "green" | "unknown"> => {
    const lue = () => {
      const controle = etatDeLaBase(base);
      if (controle?.outcome === "red") return "red";
      if (controle?.sha !== tete) return null;
      // Non jouée faute de gates, la base n'a rien à dire : le rouge est celui
      // de la fusion. Non jouée faute d'essai, elle ne se rejouera pas mieux.
      return controle.outcome === "green" || controle.reason === null ? "green" : "unknown";
    };
    const connue = lue();
    if (connue !== null) return connue;
    await controlerBase(false, true);
    return lue() ?? "unknown";
  };

  // La relance de la CI rouge de ce commit, si la pass l'a déjà faite pour
  // cette livraison.
  const ciRelancee = (ticket: number, sha: string) =>
    journal.duTicket(ticket).findLast((evenement): evenement is Evenement<Extract<FaitPass, { type: "pass.ci-rerun" }>> => evenement.type === "pass.ci-rerun" && evenement.payload.sha === sha) ?? null;

  // Les tests en échec de ces jobs rouges, en chemins du dépôt, si chacun est
  // hors de ce que la livraison change — sinon null, et le rouge est le sien.
  const testsEtrangers = async (connu: PassDeTicket, ref: string, jobs: Array<{ check: Check; job: ReturnType<typeof jobDuCheck> }>) => {
    const { ticket } = connu;
    if (jobs.some(({ job }) => job === null)) return null;
    const nommes: string[] = [];
    for (const { check } of jobs) {
      const lu = await github.journalDuCheck(check).catch(() => null);
      const tests = lu === null ? null : testsEnEchec(lu);
      if (tests === null) return null;
      nommes.push(...tests);
    }
    if (arrete || !enPass(ticket)) return null;
    const attribution = attribuer(nommes, { changes: depot.changes(ref), fichiers: depot.fichiers(), lire: (chemin) => depot.lire(ref, chemin) });
    return attribution.etranger ? attribution.tests : null;
  };

  // La CI de la livraison est rouge de nouveau après sa relance, sur le même
  // test qu'elle ne touche pas : c'est la base qui est instable, pas le ticket
  // qui a échoué. Elle remonte au chef, sans renvoi, avec une carte qui le dit
  // (`causeDeTestInstable`). Un autre test rouge, ou un rouge qui ne s'établit
  // pas, laisse le rouge à la livraison. Rend vrai si elle a remonté.
  const remonterLInstabilite = async (connu: PassDeTicket, ref: string, sha: string, rouges: Check[]): Promise<boolean> => {
    const { ticket } = connu;
    const relance = ciRelancee(ticket, sha);
    if (relance === null) return false;
    const tests = await testsEtrangers(connu, ref, rouges.map((check) => ({ check, job: jobDuCheck(check) })));
    if (tests === null || tests.some((test) => !relance.payload.tests.includes(test))) return false;
    if (arrete || !enPass(ticket)) return false;
    await remonter(
      connu,
      causeDeTestInstable(tests),
      `La base est instable : cette livraison est rouge sur un test que ce changement ne touche pas, deux fois — ${tests.map((test) => `\`${test}\``).join(", ")}, rouge aussi après la relance des jobs en échec. Ce n'est pas un ticket qui a échoué, et aucun cook n'y peut rien.`,
    );
    return true;
  };

  // Une CI rouge sur des tests que la livraison ne touche pas, et sur rien
  // d'autre, ne fait pas un verdict : ses jobs en échec sont relancés, une fois
  // par livraison — ni renvoi, ni carte (`relance-de-ci.ts`). Rend vrai si la
  // relance est partie : la CI est alors attendue de nouveau. Tout ce qui ne
  // s'établit pas — un check qui n'est pas un job de GitHub Actions, un journal
  // illisible ou qui ne nomme aucun test, un test que la livraison touche —
  // laisse le rouge à la livraison.
  const relancerLaCI = async (connu: PassDeTicket, ref: string, sha: string, rouges: Check[]): Promise<boolean> => {
    const { ticket, run } = connu;
    if (ciRelancee(ticket, sha) !== null) return false;
    const jobs = rouges.map((check) => ({ check, job: jobDuCheck(check) }));
    const etrangers = await testsEtrangers(connu, ref, jobs);
    if (etrangers === null) return false;
    // Run par run : une relance refusée laisse ses jobs rouges, et ceux-là
    // restent le verdict de la livraison.
    const relances: number[] = [];
    for (const runCI of new Set(jobs.map(({ job }) => job!.run))) {
      try {
        await github.relancerLesEchecs(runCI);
        relances.push(runCI);
      } catch (erreur) {
        avertir(`brigade : jobs en échec du run ${runCI} non relancés sur le ticket #${ticket} — ${message(erreur)} (l'identité de la pass a-t-elle \`actions: write\` ?)`);
      }
    }
    if (relances.length === 0) return false;
    const checks = jobs.filter(({ job }) => relances.includes(job!.run)).map(({ check }) => check);
    noter(ticket, { type: "pass.ci-rerun", payload: { run, sha, runs: relances, checks, tests: etrangers } });
    avertir(`brigade : CI relancée sur le ticket #${ticket} (${court(sha)}) — rouge sur des tests que la livraison ne touche pas : ${etrangers.join(", ")}`);
    return true;
  };

  // `poser` : fait le worktree jetable du jugement.
  const jugerLivraison = async (connu: PassDeTicket, branch: string, poser: <T>(faire: (nom: string) => Promise<T>) => Promise<T>) => {
    const { ticket, run } = connu;

    let pr = await github.prDeBranche(branch);
    let ouverte = false;
    if (arrete) return;
    // Sans branche, la pass ne juge rien — mais elle lit encore GitHub : une
    // PR déjà mergée ou fermée se traite comme d'habitude.
    if (pr?.merged) return constaterMerge(connu, pr, "outside", false);
    if (pr?.state === "closed") return constaterFermeture(connu, pr);
    if (!depot.connait(branch)) {
      return sansBranche(connu, branch, "la pass n'a plus de quoi la fusionner avec la base, y jouer les gates ni faire relire le diff, et elle ne la recrée pas. Ce que le cook a poussé est sur l'origine, sous le même nom.");
    }
    // Ni PR ni commit : le cook n'a livré que son compte-rendu.
    // Une branche jamais poussée n'a rien livré d'autre, quoi qu'un rangement
    // y ait posé depuis.
    const ref = depot.livree(branch);
    if (pr === null && (ref === branch || depot.commits(ref) === 0)) return jugerSansDiff(connu, branch, () => poser((nom) => depot.essayer(nom)));
    if (pr === null) {
      // Son ouverture avait échoué à la fin du cook.
      const titre = ticketDuRail(base, ticket)?.title ?? "";
      await github.ouvrirPR({ branche: branch, base: options.base, titre: `#${ticket} — ${titre}`, corps: `Ticket #${ticket}.` });
      ouverte = true;
      pr = await github.prDeBranche(branch);
    }
    if (arrete || pr === null) return;
    if (pr.merged) return constaterMerge(connu, pr, "outside", false);
    if (pr.state === "closed") return constaterFermeture(connu, pr);
    // La livraison ne porte pas sa PR : la station n'avait pas pu l'ouvrir, la
    // pass vient de le faire — ou l'avait fait avant de mourir. C'est écrit
    // avant tout le reste : une remontée la nomme, et la file du chef aussi.
    if (connu.pr === null) noter(ticket, { type: "pass.pr-opened", payload: { pr: pr.url, number: pr.number, reconciled: !ouverte } });
    if (pr.base !== options.base) {
      return remonter({ ...connu, pr: pr.url }, "wrong-base", `La PR ${pr.url} vise \`${pr.base}\` : la pass ne juge et ne merge que vers \`${options.base}\`.`);
    }

    if (!(await porterSurLeRenommage({ ...connu, pr: pr.url }, branch))) return;

    // Ce qui est jugé est ce qui sera sur la base : le commit que l'origine a
    // reçu — celui que la CI connaît et que GitHub mergera, sans la récolte
    // qu'un rangement aurait posée sur la branche locale — fusionné avec la
    // base telle qu'elle est à cet instant.
    const sha = depot.tete(ref);
    const ici = { ...connu, pr: pr.url, sha };
    const rouge = etatDeLaBase(base);
    if (rouge?.outcome === "red" && !estLaReparation(ticket)) return attendreLaBase(ici, rouge.sha);
    // Un jugement dont les gates sont vertes et qui attend sa CI se conclut
    // sur la base où il a commencé : si elle a bougé, c'est le verdict rendu
    // qui sera rejugé, une fois — pas la suite à chaque merge d'un voisin.
    const connues = gatesJouees.get(ticket);
    const commence = connues?.sha === sha && connues.gates.outcome === "green" ? connues.base : null;
    const tete = commence ?? (await depot.rapatrier());
    if (arrete) return;
    // Un verdict vert tient tant que ni le commit ni la base n'ont bougé.
    const verte = connu.verdict === "green" && connu.sha === sha && connu.judgedBase !== null && VERTES.includes(connu.phase);
    if (verte && connu.judgedBase === tete) return decider(ticket, tete);
    const jouees = connues?.sha === sha && connues.base === tete ? connues : null;
    // Rejuger consomme la machine, comme un cook : saturée, la livraison attend.
    const pleine = verte && jouees === null ? sature() : null;
    if (pleine) {
      return attendre(
        ici,
        MACHINE_SATUREE,
        `\`${options.base}\` a bougé depuis le verdict de cette livraison : avant de merger, elle est à rejuger fusionnée avec \`${options.base}\` telle qu'elle est devenue (\`${court(tete)}\`). La machine n'a pas de quoi rejouer les gates pour l'instant — ${direSaturation(pleine)}. La pass y revient seule.`,
      );
    }
    const commencer = () => {
      if (passDuTicket(base, ticket)?.phase !== "judging" || connu.sha !== sha) noter(ticket, { type: "pass.started", payload: { run, pr: pr.url, number: pr.number, sha } });
    };

    // La fusion du commit livré avec cette tête de la base, faite une fois.
    let faite: ReturnType<Depot["fusionner"]> | null = null;
    const fusionner = () => (faite ??= poser((nom) => depot.fusionner(nom, tete, sha)));
    const ou = async () => {
      const fusion = await fusionner();
      if (fusion === null) throw new Error(`la fusion de ${court(sha)} avec ${options.base} (${court(tete)}) ne se fait plus`);
      return fusion.worktree;
    };

    const findings: string[] = [];
    let gates = NON_JOUEES;
    let arbre: string | null = null;
    let ci: CI = { outcome: "skipped", checks: [] };
    let review = NON_RELU;
    if (jouees) {
      commencer();
      ({ gates, arbre } = jouees);
    } else {
      // Une fusion qui ne se fait pas pour une autre raison qu'un conflit est
      // une panne de la machine : elle ne dit rien de la livraison, aucun cook
      // ne la lèverait, et la retenter à chaque réveil ne finirait pas.
      let fusion: Awaited<ReturnType<Depot["fusionner"]>>;
      try {
        fusion = await fusionner();
      } catch (erreur) {
        if (arrete) return;
        return remonter(
          ici,
          "worktree-lost",
          `La pass n'a pas pu fusionner cette livraison (\`${court(sha)}\`) avec \`${options.base}\` (\`${court(tete)}\`) pour la juger : ${message(erreur)}. Ce n'est ni un conflit ni un verdict — rien ne dit ce qu'elle vaut, et aucun cook n'est renvoyé. Une fois le clone de la station réparé, retirer puis reposer \`fire\` remet le ticket sur le rail.`,
        );
      }
      if (arrete) return;
      if (fusion !== null && !aDesGates(fusion.worktree)) {
        return remonter(ici, "no-gates", `Le projet n'a pas de \`${SCRIPT_GATES}\` une fois cette branche fusionnée avec \`${options.base}\` : sans gates, « vert » voudrait dire que personne n'a regardé.`);
      }
      commencer();
      if (fusion !== null) {
        const { worktree } = fusion;
        let secrets: ReturnType<typeof pourLesGates>;
        try {
          secrets = pourLesGates(worktree);
        } catch (erreur) {
          if (!(erreur instanceof SecretsIndisponibles)) throw erreur;
          return remonter(
            ici,
            "secrets-unavailable",
            [
              `Les gates de cette livraison n'ont pas été jouées : les secrets que le dépôt déclare (\`${DECLARATION}\`) ne peuvent pas leur être donnés. Ce n'est pas un verdict — aucun cook ne lèverait cela, et rien ne lui est renvoyé.`,
              "",
              ...erreur.problemes.map((probleme) => `- ${probleme}`),
              "",
              "Les valeurs vivent sur la machine, dans le fichier que nomme `BRIGADE_SECRETS_FILE`. La pass ne rejuge pas une livraison remontée : une fois les valeurs posées, retirer puis reposer `fire` remet le ticket sur le rail, pour un cook neuf.",
            ].join("\n"),
          );
        }
        const demande: DemandeScript = { worktree, ticket, ...secrets, interdites, delaiMs: options.delaiGatesMs, cloison: options.cloison, signal: abandon.signal };
        // Le même arbre, sous la même configuration, déjà passé vert : les
        // gates ne se rejouent pas, le verdict nomme le passage repris, et rien
        // n'est écrit à leur coût (`empreinte-des-gates.ts`).
        const empreinte: EmpreinteDesGates = { tree: fusion.arbre, config: empreinteDeConfig(worktree) };
        const repris = passageVert(base, projet, ticket, empreinte);
        const chargeAuDepart = repris ? null : sature();
        gates = repris ? gatesReprises(repris) : await jouerGates(ticket, demande, empreinte);
        // Parti pendant ses gates, le ticket n'a plus de verdict à recevoir.
        if (arrete || !enPass(ticket)) return;
        // Coupées par leur garde d'horloge sans aucun test en échec, sur une
        // machine saturée au départ ou à l'arrivée : un rouge de charge, pas
        // de code. Ni verdict, ni renvoi, ni base jugée : elles sont rejouées
        // seules quand la machine ne l'est plus. Une fois par commit — coupées
        // à nouveau, elles l'ont été sur une machine calme, et c'est un rouge.
        const saturee = gates.clockGuardCut === undefined || dejaCoupees(ticket, sha) ? null : (chargeAuDepart ?? sature());
        if (saturee) {
          avertir(`brigade : ${DIRE_GATES_COUPEES} — ticket #${ticket}, ${direSaturation(saturee)}`);
          return attendre(
            ici,
            GATES_COUPEES,
            [
              `En attente — ${DIRE_GATES_COUPEES}.`,
              "",
              `Les gates de cette livraison, fusionnée avec \`${options.base}\` (\`${court(tete)}\`), ont été coupées par leur garde d'horloge alors que la machine était saturée — ${direSaturation(saturee)} — et aucun test n'avait échoué avant la coupure :`,
              "",
              "```",
              gates.clockGuardCut,
              "```",
              "",
              `Ce n'est pas un rouge : rien n'est renvoyé au cook, \`${options.base}\` n'est pas jugée, et rien ne compte au disjoncteur. La pass les rejoue seule dès que la machine n'est plus saturée. Coupées à nouveau, elles le seront sur une machine calme : ce sera un rouge — un test bloqué, ou une suite devenue trop lente.`,
            ].join("\n"),
            sha,
          );
        }
        arbre = fusion.arbre;
        gatesJouees.set(ticket, { sha, base: tete, gates, arbre });
      }
    }

    if (arbre === null) {
      findings.push(findingDeConflit(options.base));
    } else if (gates.outcome === "green") {
      // Relu avant de lire la CI : elle conclut pendant ce temps, et un cook
      // renvoyé repart avec tout ce qui a été trouvé, pas la moitié.
      const relue = await relire(connu, ref, ou, sha, false);
      if (arrete || relue === null) return;
      if (relue.outcome === "unreadable") return remonterIllisible(connu, relue);
      review = { outcome: relue.outcome, run: relue.run, summary: relue.summary, findings: relue.findings };
      // Les jobs que la pass a relancés, tant que GitHub rend encore leur
      // rouge d'avant, sont en cours : leur relance n'a pas encore conclu.
      const relance = ciRelancee(ticket, sha);
      const relances = new Set(relance?.payload.checks.map((check) => check.url) ?? []);
      const checks = (await github.ci(sha)).map((check): Check => (check.outcome === "red" && relances.has(check.url) ? { ...check, outcome: "pending" } : check));
      if (arrete) return;
      // Des workflows sans aucun check : la CI n'a pas encore démarré.
      const workflows = checks.length === 0 ? workflowsDeLaPr(ref) : [];
      const attendue = workflows.length > 0;
      if (attendue && !journal.duTicket(ticket).some((evenement) => evenement.type === "pass.ci-awaited" && evenement.payload.sha === sha)) {
        noter(ticket, { type: "pass.ci-awaited", payload: { sha, workflows } });
      }
      const enCours = attendue || checks.some((check) => check.outcome === "pending");
      // Un constat bloquant n'attend pas la CI : le verdict est déjà rouge,
      // et elle sera lue sur le commit qui le corrige.
      if (enCours && review.outcome !== "red") {
        // Relancée, la CI s'attend de nouveau depuis sa relance.
        const depuis = Math.max(Date.parse(passDuTicket(base, ticket)?.startedAt ?? ""), relance === null ? -Infinity : Date.parse(relance.at));
        if (!(maintenant().getTime() - depuis > options.attenteCiMs) || !enPass(ticket)) return;
        return remonter(
          connu,
          "ci-silent",
          `La CI du commit \`${court(sha)}\` n'a pas conclu en ${minutes(options.attenteCiMs)}${attendue ? ` (aucun check, alors que la branche porte ${workflows.length > 1 ? "des workflows qui se lancent" : "un workflow qui se lance"} sur les PR : ${workflows.map((fichier) => `\`${fichier}\``).join(", ")})` : ""}. Les gates, elles, sont vertes.`,
        );
      }
      if (!enCours) {
        const rouges = checks.filter((check) => check.outcome === "red");
        // Un rouge de CI n'est un verdict que si la branche porte la tête de
        // la base : sinon la base à jour ne le reproduirait peut-être plus,
        // et le cook ne le lève qu'en s'y mettant. Cela se lit dans le clone,
        // sans rien redemander à GitHub ; une CI verte, elle, reste verte.
        const retard = rouges.length > 0 ? depot.avance(sha) : 0;
        if (retard > 0) {
          ci = { outcome: "skipped", checks };
          findings.push(findingDeCiDepassee(options.base, sha, retard, rouges));
        } else {
          // Rouge seulement par sa CI, sur des tests qu'elle ne touche pas.
          if (rouges.length > 0 && review.outcome !== "red" && (await relancerLaCI(connu, ref, sha, rouges))) return;
          if (rouges.length > 0 && review.outcome !== "red" && (await remonterLInstabilite(connu, ref, sha, rouges))) return;
          if (arrete || !enPass(ticket)) return;
          ci = { outcome: checks.length === 0 ? "none" : rouges.length > 0 ? "red" : "green", checks };
          findings.push(...rouges.map((check) => `CI rouge — job « ${check.name} » : ${check.conclusion}${check.url ? ` (${check.url})` : ""}.`));
        }
      }
      findings.push(...bloquants(review.findings).map(findingDuReviewer));
    } else {
      // Rouges une fois fusionnée : la base l'est-elle seule ? Ce rouge-là
      // n'est pas celui de la livraison, et ne renvoie aucun cook — sauf de la
      // réparation de ce rouge : il est le sien.
      const seule = estLaReparation(ticket) ? "green" : await jugerLaBase(tete);
      if (arrete || !enPass(ticket)) return;
      // Rouges avec une base rouge, ces gates ne disent rien de la livraison :
      // la base réparée ou rejouée verte, elles sont à rejouer, pas à resservir.
      if (seule === "red") {
        gatesJouees.delete(ticket);
        return attendreLaBase(ici, etatDeLaBase(base)?.sha ?? tete);
      }
      if (seule === "unknown") return;
      findings.push(findingDesGates(gates, options.delaiGatesMs, ` sur la fusion de \`${court(sha)}\` avec \`${options.base}\` (\`${court(tete)}\`)`));
    }

    const changes = depot.changes(ref);
    const declarations = changes.filter((fichier) => Object.hasOwn(DECLARATIONS, fichier)).sort();
    // Comptées à part des juges, dont elles partagent le répertoire : le motif
    // de l'arrêt dit laquelle des deux règles joue.
    const judgeModified = changes.some((fichier) => !declarations.includes(fichier) && JUGES.some((juge) => fichier.startsWith(juge)));
    // Ce que le chef relit de ces juges : chaque fichier, avec les lignes ajoutées et retirées.
    const comptes = new Map(depot.comptes(ref).map(({ fichier, ajoutees, retirees }) => [fichier, { added: ajoutees, removed: retirees }]));
    const judges = changes.filter((fichier) => !declarations.includes(fichier) && JUGES.some((juge) => fichier.startsWith(juge))).map((file) => ({ file, added: comptes.get(file)?.added ?? 0, removed: comptes.get(file)?.removed ?? 0 }));
    gatesJouees.delete(ticket);
    // Le ticket a pu quitter le rail pendant une attente de GitHub : gates et
    // relecture en cache n'y changent rien, il n'a plus de verdict à recevoir.
    if (!enPass(ticket)) return;
    const verdict = findings.length === 0 ? "green" : "red";
    const franchi = plafondADire(journal.duTicket(ticket), { sha, verdict, gates });
    prononcer(connu, { run, pr: pr.url, number: pr.number, sha, base: tete, merged: arbre, verdict, gates, ci, review, findings, judgeModified, ...(judges.length > 0 ? { judges } : {}), declarations, noDiff: false });
    if (verdict === "red") avertir(`brigade : pass rouge sur le ticket #${ticket} (${resume(gates, ci, review)})`);
    // Seul rouge des gates, le plafond de durée ne retient rien : il se lit.
    if (franchi) {
      avertir(`brigade : plafond des gates franchi sur le ticket #${ticket}, non jugé — ${direDepassement(franchi)}`);
      await commenter(
        ticket,
        [
          `**Pass — plafond des gates franchi, non jugé.** \`${court(sha)}\` · ${pr.url}`,
          "",
          "Les gates de cette livraison n'ont qu'un rouge, leur plafond de durée :",
          "",
          "```",
          franchi.line,
          "```",
          "",
          `Ce n'est pas un motif de renvoi : ${PLAFOND_NON_JUGE}. Tout le reste des gates est vert, et la livraison suit son chemin. Le plafond reste jugé là où il a été mesuré — les gates jouées sur le poste de dev, le hook d'arrêt ; ici, le dépassement se suit au relevé (\`${geste(`measures`)}\`).`,
        ].join("\n"),
      );
    }
    await decider(ticket);
  };

  // Juge un ticket sans diff : ni gates, ni CI, ni PR — le reviewer relit le
  // livrable que le cook a délimité, et il est le seul juge. Sans lui, pas de
  // verdict. Sans livrable, il n'y a rien à relire : le message du cook n'en
  // est pas un.
  const jugerSansDiff = async (connu: PassDeTicket, branch: string, ou: () => Promise<string>) => {
    const { ticket, run } = connu;
    const sha = depot.tete(branch);
    if (connu.phase !== "judging" || connu.sha !== sha) noter(ticket, { type: "pass.started", payload: { run, pr: null, number: null, sha } });

    const findings: string[] = [];
    let review = NON_RELU;
    if (rapportDuCook(ticket, run).livrable === null) {
      findings.push(
        `Ni diff ni livrable : le cook n'a rien délimité qui puisse être relu. Le livrable d'un ticket sans diff est ce que tu délimites entre \`${OUVERTURE}\` et \`${FERMETURE}\` dans ton dernier message, et rien d'autre — écris-le, dans la forme que le ticket demande.`,
      );
    } else {
      const relue = await relire(connu, branch, ou, sha, true);
      if (arrete || relue === null) return;
      if (relue.outcome === "unreadable") return remonterIllisible(connu, relue);
      review = { outcome: relue.outcome, run: relue.run, summary: relue.summary, findings: relue.findings };
      findings.push(...bloquants(review.findings).map(findingDuReviewer));
    }

    // Parti pendant sa relecture, ou avant : pas de verdict pour un ticket sorti du rail.
    if (!enPass(ticket)) return;
    const verdict = findings.length === 0 ? "green" : "red";
    const ci: CI = { outcome: "skipped", checks: [] };
    prononcer(connu, { run, pr: null, number: null, sha, verdict, gates: NON_JOUEES, ci, review, findings, judgeModified: false, noDiff: true });
    if (verdict === "red") avertir(`brigade : pass rouge sur le ticket #${ticket}, sans diff (reviewer : ${ditDuReviewer(review)})`);
    await decider(ticket);
  };

  // Une intention de merger restée sans résultat : GitHub dit ce qu'il en est.
  const reconcilier = async (connu: PassDeTicket) => {
    if (connu.branch === null) return;
    const pr = await github.prDeBranche(connu.branch);
    if (arrete) return;
    if (pr?.merged) return constaterMerge(connu, pr, "pass", true);
    // Une PR que GitHub ne connaît plus n'a pas été mergée : l'intention rend
    // son usage comme les autres, elle ne le retient pas sans fin.
    noter(connu.ticket, { type: "merge.failed", payload: { pr: pr?.url ?? connu.pr ?? "", sha: connu.sha ?? pr?.sha ?? "", reason: "interrupted" } });
    await decider(connu.ticket);
  };

  // Un ticket que la pass a arrêté, ou qu'elle fait attendre : si le chef a
  // mergé sa PR, il est servi ; s'il l'a fermée sans la merger, c'est constaté.
  // Rend vrai si le chef a tranché, d'une façon ou de l'autre.
  const surveiller = async (connu: PassDeTicket): Promise<boolean> => {
    if (connu.branch === null) return false;
    const pr = await github.prDeBranche(connu.branch);
    if (arrete || !pr) return false;
    if (pr.merged) {
      await constaterMerge(connu, pr, "outside", false);
      return true;
    }
    if (pr.state !== "closed") return false;
    if (connu.phase !== "closed") await constaterFermeture(connu, pr);
    return true;
  };

  // Une livraison que son ticket a laissée en quittant le rail : la pass ne la
  // suit plus. GitHub dit ce qu'il en reste — une PR encore ouverte est dite
  // sur l'issue, une fois : le fait retire la livraison de ce qui reste à dire.
  // Ni la PR ni la branche ne sont touchées : c'est au chef d'en décider.
  // Mergée à la main avant que la pass ait relu GitHub, elle n'a pas été
  // abandonnée : le merge est constaté, et le ticket servi pour qui l'attend.
  // Son issue reste comme le chef l'a laissée. Sauf si le ticket est revenu sur
  // le rail entre-temps avec une autre livraison : ce merge n'est pas le sien,
  // et l'écrire servirait le ticket sous le cook qui y travaille.
  const lacher = async ({ ticket, branch, verdict, reason }: Orpheline) => {
    const pr = await github.prDeBranche(branch);
    if (arrete) return;
    if (pr?.merged) {
      const par = await auteurDuMerge(pr, "outside");
      if (arrete) return;
      const reprise = passDuTicket(base, ticket);
      base.transaction(() => {
        if (reprise === null || reprise.branch === branch) {
          noter(ticket, { type: "merge.done", payload: { pr: pr.url, sha: pr.sha, by: par, ...acteur(pr.mergeePar), reconciled: false, unverified: aVerifier(par) } });
        }
        noter(ticket, { type: "pass.abandoned", payload: { branch, pr: null, merged: true } });
      });
      return;
    }
    const ouverte = pr !== null && pr.state === "open" ? pr.url : null;
    noter(ticket, { type: "pass.abandoned", payload: { branch, pr: ouverte, ...(pr?.state === "closed" ? { closed: true } : {}) } });
    if (ouverte === null) return;
    avertir(`brigade : le ticket #${ticket} a quitté le rail (${reason}) en laissant sa PR ouverte, que la pass ne suit plus — ${ouverte}`);
    const jugee = verdict === null ? "La pass n'avait pas encore jugé cette livraison" : `Le dernier verdict de la pass sur cette livraison était ${verdict === "green" ? "vert" : "rouge"}`;
    await commenter(
      ticket,
      [
        `**Pass — ticket sorti du rail (${nomAbandon(reason)}), PR encore ouverte.** ${ouverte} · branche \`${branch}\``,
        "",
        `Ce ticket a quitté le rail alors que sa livraison n'était pas mergée : la pass la lâche. Plus rien ne sera relu, renvoyé à un cook ni mergé, et plus personne ne la suit. ${jugee}.`,
        "",
        `À toi d'en décider : la merger si elle te convient, ou la fermer — la pass ne fait ni l'un ni l'autre, et ne supprime pas la branche. Remettre le ticket sur le rail ne la reprend pas : un cook neuf repartirait de \`${options.base}\`, sur une autre branche.`,
      ].join("\n"),
    );
  };

  const traiter = async (connu: PassDeTicket, tick: boolean) => {
    switch (connu.phase) {
      case "delivered":
      case "judging":
        if (enPass(connu.ticket) && aSonTour(connu.ticket)) await juger(connu);
        return;
      // Jugé, mais le runtime est mort avant de décider.
      case "green":
      case "red":
        return decider(connu.ticket);
      // Une livraison qui attend peut être mergée à la main : c'est dit sur
      // son issue. GitHub n'est relu qu'au tick ; le jugement, lui, ne se
      // reprend — et ne relit la PR — qu'une fois levé ce qu'il attendait.
      case "waiting":
        if (tick && (await surveiller(connu))) return;
        if (connu.reason === PROJET_ETEINT ? projetEteint(base) : connu.reason === EN_PAUSE ? mergeRetenu(base, connu.ticket) !== null : connu.reason === BASE_ROUGE ? etatDeLaBase(base)?.outcome === "red" && !estLaReparation(connu.ticket) : sature() !== null) return;
        if (enPass(connu.ticket) && aSonTour(connu.ticket)) await juger(connu);
        return;
      case "merging":
        return reconcilier(connu);
      case "merged":
      case "served":
        return finir(connu.ticket);
      // GitHub n'est relu qu'au tick : une fois par minute suffit.
      // Fermée sans merge, sa PR peut encore être rouverte et mergée.
      // Arrêtée parce qu'elle touche à ses juges, elle attend encore son
      // second juge — lancé dès l'arrêt, ou au réveil qui suit ce qui le
      // retenait : stop, disjoncteur, compte épuisé, redémarrage.
      case "held":
        if (tick && (await surveiller(connu))) return;
        await jugerUneSecondeFois(connu);
        // Établie non affaiblie, elle est décidée comme une livraison verte.
        if (aReprendre(passDuTicket(base, connu.ticket))) await decider(connu.ticket);
        return;
      case "escalated":
      case "closed":
        if (tick) await surveiller(connu);
        return;
      // Entre les mains du manager. Éteint depuis, il ne dira rien : la pass
      // reprend sa règle.
      case "deferred":
        if (!managerAllume(base)) await decider(connu.ticket);
        return;
      case "cooking":
      case "returned":
        return;
    }
  };

  // Joue les gates sur la base elle-même, hors ticket : après des merges faits
  // hors du runtime, quand une livraison fusionnée avec elle est rouge
  // (`exige`), et — tant qu'elle est rouge — dès qu'elle bouge, ou sur la même
  // tête quand le chef le demande : un rouge instable ne doit pas attendre un
  // commit. Une fois par passe : les merges d'une même
  // passe se vérifient d'un bloc. Rouge, jugements et merges s'arrêtent ; la
  // pass rejoue d'elle-même, une fois, un rouge que rien n'a encore rejoué —
  // passager, il tombe sans que personne n'ait rien vu d'autre. S'il tient,
  // `reparer` ouvre son ticket.
  let machineDite = false;
  // La tête de la base dont les gates ont été coupées sur une machine saturée,
  // sans aucun test en échec : leur rejeu est parti sur une machine calme.
  let baseCoupee: string | null = null;
  const controlerBase = async (tick: boolean, exige = false) => {
    if (!arrete && rougeCompte(base)?.replayed === false) noter(null, { type: "base.recheck-requested", payload: {} });
    const avant = etatDeLaBase(base);
    const rouge = avant?.outcome === "red" ? avant : null;
    const demande = rouge?.recheck ?? null;
    // Qui a demandé le rejeu, tel que la pass le dit.
    const rejeu = demande?.by === AUTEUR ? `rejeu automatique des gates de ${options.base}` : `rejeu des gates de ${options.base} demandé par le chef`;
    const tickets = mergesAVerifier(base);
    // GitHub n'est relu qu'au tick : une base rouge ne bouge pas plus vite, et
    // un rejeu que la machine retient n'y revient pas plus souvent.
    const due = demande !== null && (tick || demande.heldAt === null);
    if (tickets.length === 0 && !due && !exige && !(tick && rouge)) return;
    // Une base qui ne se rapatrie pas n'est pas une butée à redire à chaque
    // réveil : c'est écrit une fois, et retenté au tick seulement — puis redit
    // si la panne change de cause, pour que le chef ne cherche pas la mauvaise.
    // Rien n'est contrôlé entre-temps — donc aucun rouge n'est levé.
    const retenu = controleRetenu(base);
    if (retenu !== null && !tick && !exige) return;
    let tete: string;
    try {
      tete = await depot.rapatrier();
    } catch (erreur) {
      const motif = message(erreur).replace(/\s+/g, " ").trim().slice(0, PANNE_MAX);
      if (arrete || retenu?.reason === motif) return;
      noter(null, { type: "base.check-held", payload: { reason: motif } });
      if (retenu !== null) {
        avertir(`brigade : ${options.base} ne se rapatrie toujours pas, mais la panne a changé — ${motif}. La pass y revient à chaque tick, sans le redire`);
        return;
      }
      const quoi =
        demande !== null
          ? rejeu
          : tickets.length > 0
            ? `gates de ${options.base} à jouer après le merge de ${tickets.map((ticket) => `#${ticket}`).join(", ")}`
            : `${options.base} est rouge, à rejouer dès qu'elle bouge`;
      avertir(`brigade : ${quoi}, mais ${options.base} ne se rapatrie pas — ${motif}. La pass y revient à chaque tick, sans le redire`);
      return;
    }
    if (retenu !== null && !arrete) {
      noter(null, { type: "base.check-resumed", payload: {} });
      avertir(`brigade : ${options.base} se rapatrie de nouveau — son contrôle reprend`);
    }
    // La tête déjà contrôlée : celle du rouge, ou celle d'un contrôle non joué depuis.
    if (arrete || (tickets.length === 0 && !due && !exige && tete === (avant?.unplayed?.sha ?? avant?.sha))) return;
    const pleine = sature();
    if (pleine) {
      if (demande !== null && demande.heldAt === null) {
        noter(null, { type: "base.recheck-held", payload: pleine });
        avertir(`brigade : ${rejeu}, mais la machine n'en peut plus — ${direSaturation(pleine)}. La pass y revient`);
      } else if (demande === null && !machineDite) {
        avertir(`brigade : gates de ${options.base} à jouer sur elle seule, mais la machine n'en peut plus — ${direSaturation(pleine)}. La pass y revient`);
      }
      machineDite = true;
      return;
    }
    machineDite = false;
    // Sans ticket : le setup du projet reçoit zéro.
    let gates = NON_JOUEES;
    // L'essai qui ne se fait pas — le worktree jetable ne se crée pas — est un
    // contrôle non joué, pas une butée : écrit, il n'est pas retenté à chaque
    // réveil, il sert la demande du chef, et il dit pourquoi.
    let panne: string | null = null;
    // Le ménage, lui, ne décide de rien : un worktree jetable qui ne se retire
    // pas ne défait pas un verdict joué. Ce qu'il laisse part à l'essai suivant.
    const retirer = () => {
      try {
        depot.jeter(ESSAI_DE_BASE);
      } catch (erreur) {
        if (!arrete) avertir(`brigade : le worktree jetable du contrôle de ${options.base} n'a pas pu être retiré — ${message(erreur)}`);
      }
    };
    let essai: string | null = null;
    try {
      depot.jeter(ESSAI_DE_BASE);
      essai = await depot.essayer(ESSAI_DE_BASE);
    } catch (erreur) {
      panne = message(erreur).replace(/\s+/g, " ").trim().slice(0, PANNE_MAX);
    }
    try {
      if (essai !== null && aDesGates(essai)) gates = await jouerGates(null, { worktree: essai, ticket: 0, ...pourLesGates(essai), interdites, delaiMs: options.delaiGatesMs, cloison: options.cloison, signal: abandon.signal });
    } catch (erreur) {
      // Sans leurs secrets, les gates de la base ne sont pas jouées : un
      // contrôle non joué, avec son motif.
      if (!(erreur instanceof SecretsIndisponibles)) throw erreur;
      panne = erreur.message.slice(0, PANNE_MAX);
    } finally {
      retirer();
    }
    if (arrete) return;
    // Coupées par leur garde d'horloge sans aucun test en échec, sur une
    // machine saturée à l'arrivée — elle ne l'était pas au départ : un rouge
    // de charge, pas de code. Rien n'est écrit, la base n'est pas vue rouge :
    // ce qui demandait ce contrôle le redemande, et il se rejoue une fois la
    // machine calme. Une fois par tête — coupées à nouveau, c'est un rouge.
    const saturee = gates.clockGuardCut === undefined || baseCoupee === tete ? null : sature();
    if (saturee) {
      baseCoupee = tete;
      machineDite = true;
      avertir(`brigade : gates de ${options.base} (${court(tete)}) — ${DIRE_GATES_COUPEES} (${direSaturation(saturee)}). Ce n'est pas un rouge : la pass les rejoue seule une fois la machine calme`);
      return;
    }
    const outcome = gates.outcome === "skipped" ? "skipped" : gates.outcome === "green" ? "green" : "red";
    // Un contrôle non joué ne lève pas un rouge constaté : la projection le
    // garde, et le fait dit lequel.
    const reste = outcome === "skipped" && rouge !== null;
    noter(null, { type: "base.checked", payload: { sha: tete, outcome, gates, tickets, ...(reste ? { red: rouge.sha } : {}), ...(panne === null ? {} : { reason: panne }) } });
    if (reste) {
      avertir(
        `brigade : ${options.base} reste ROUGE : ses gates n'ont pas pu être jouées sur ${court(tete)}${panne === null ? "" : ` (${panne})`}, et un contrôle non joué ne lève pas le rouge constaté sur ${court(rouge.sha)} — jugements et merges restent suspendus`,
      );
      return;
    }
    if (panne !== null) {
      const merges = tickets.length === 0 ? "" : ` après le merge de ${tickets.map((ticket) => `#${ticket}`).join(", ")}`;
      avertir(`brigade : gates de ${options.base} non jouées sur ${court(tete)}${merges} : l'essai ne s'est pas fait (${panne}) — rien n'est retenu, et rien n'a été vérifié`);
    }
    if (gates.outcome === "green" && gates.overCeiling) {
      avertir(`brigade : plafond des gates franchi sur ${options.base} (${court(tete)}), non jugé — ${direDepassement(gates.overCeiling)} : la base n'est pas vue rouge pour lui`);
    }
    if (outcome !== "red") {
      if (rouge) avertir(`brigade : ${options.base} n'est plus rouge (${court(tete)}) — jugements et merges reprennent`);
      // Ce qui attendait la base repart.
      aRefaire = true;
      return;
    }
    // Le rouge rejoué n'est pas une nouvelle : aucune issue n'est recommentée.
    if (demande !== null && tete === rouge?.sha && tickets.length === 0) {
      const rejouees = demande.by === AUTEUR ? "rejouées une fois d'elles-mêmes" : "rejouées à la demande du chef";
      avertir(`brigade : ${options.base} reste ROUGE (${court(tete)}) : ${rejouees}, ses gates ne passent toujours pas — jugements et merges restent suspendus`);
      return;
    }
    const merges = tickets.map((ticket) => `#${ticket}`).join(", ");
    avertir(`brigade : ${options.base} est ROUGE (${court(tete)}${merges === "" ? "" : ` — merges à vérifier : ${merges}`}) — jugements et merges sont suspendus`);
    // Un rouge neuf se rejoue aussitôt, sans attendre le tick.
    if (rouge === null) aRefaire = true;
    for (const ticket of tickets) {
      await commenter(
        ticket,
        [
          `**Pass — \`${options.base}\` est rouge après merge.** \`${court(tete)}\``,
          "",
          `Les gates, jouées sur \`${options.base}\` elle-même après ${tickets.length === 1 ? "ce merge" : `les merges de ${merges}`}, ne passent pas. ${tickets.length === 1 ? "Ce merge s'est fait" : "Ces merges se sont faits"} hors du runtime : rien ne l'avait jugé sur \`${options.base}\` telle qu'elle était.`,
          "",
          findingDesGates(gates, options.delaiGatesMs),
          "",
          `La pass ne juge ni ne merge plus rien tant que \`${options.base}\` est rouge ; les livraisons attendent. Elle rejoue d'abord ses gates une fois, sans commit : un rouge qui ne tient pas au code — un test instable, un délai dépassé — tombe ainsi seul. S'il tient, elle ouvre un ticket de réparation, qui part avant tout autre ; elle rejoue les gates dès que \`${options.base}\` bouge, et reprend seule.`,
        ].join("\n"),
      );
    }
  };

  // Le rouge de la base a tenu après son rejeu — deux contrôles joués l'ont
  // constaté : la pass ouvre son ticket de réparation, sans geste du chef. Un
  // par rouge, et aucun tant qu'un autre est en cours. Sa création est
  // annoncée avant l'appel à GitHub : la réponse perdue, ou le runtime tué
  // entre les deux, l'issue se retrouve par sa marque au lieu d'être ouverte
  // deux fois. GitHub en panne : c'est dit une fois, et retenté au tick.
  let reparationButee = false;
  const reparer = async (tick: boolean) => {
    const controle = etatDeLaBase(base);
    const compte = rougeCompte(base);
    if (arrete || controle?.outcome !== "red" || compte === null || compte.redChecks < 2) return;
    if (reparationButee && !tick) return;
    let annonce = reparationAnnoncee(base);
    const tentee = annonce !== null;
    if (annonce === null) {
      const derniere = reparationDeLaBase(base);
      if (derniere !== null && (derniere.etat === "en-cours" || derniere.redSince === controle.redSince)) return;
      noter(null, { type: "base.repair-opening", payload: { sha: controle.sha } });
      annonce = { at: maintenant().toISOString(), sha: controle.sha };
    }
    // Ce que disaient les gates du dernier contrôle joué rouge.
    const [dernier] = base.lire<{ payload: string }>(
      "SELECT payload FROM events WHERE type = 'base.checked' AND json_extract(payload, '$.outcome') = 'red' ORDER BY seq DESC LIMIT 1",
    );
    const gates: Gates = dernier ? (JSON.parse(dernier.payload) as { gates: Gates }).gates : { outcome: "red", code: null, failures: [], tail: "" };
    const rouge = { base: options.base, sha: annonce.sha, depuis: controle.redSince ?? controle.at, tickets: controle.tickets, gates, sortie: findingDesGates(gates, options.delaiGatesMs) };
    const { sha } = annonce;
    let numero: number | undefined;
    try {
      if (tentee) {
        const recentes = await github.issuesDepuis(new Date(Date.parse(annonce.at) - MARGE_MS).toISOString());
        // La marque ne vaut que sur une issue de confiance : n'importe qui peut
        // en ouvrir une qui la porte, et elle partirait d'une base rouge.
        numero = recentes.find((issue) => DE_CONFIANCE.includes(issue.association) && shaDeReparation(issue.body) === sha)?.number;
      }
      if (arrete) return;
      const retrouvee = numero !== undefined;
      numero ??= await github.creerIssue({ titre: titreDeReparation(rouge), corps: corpsDeReparation(rouge), labels: LABELS_REPARATION });
      reparationButee = false;
      if (arrete) return;
      noter(numero, { type: "base.repair-opened", payload: { sha, failures: echecsDesGates(gates), reconciled: retrouvee } });
    } catch (erreur) {
      if (!arrete && !reparationButee) avertir(`brigade : ${options.base} reste ROUGE après son rejeu, mais son ticket de réparation n'a pas pu être ouvert — ${message(erreur)}. La pass y revient à chaque tick, sans le redire`);
      reparationButee = true;
      return;
    }
    avertir(`brigade : ${options.base} reste ROUGE après son rejeu (${court(sha)}) — ticket de réparation #${numero} ouvert : il passe devant tout le rail, et part seul d'une base rouge`);
  };

  // Cache, pas état : les départs sur lesquels GitHub n'a pas répondu.
  const butees = new Set<number>();

  // Une seule passe à la fois. Un réveil qui arrive pendant qu'elle juge n'est
  // pas perdu : elle repasse aussitôt finie.
  let enCours = false;
  let tickDemande = false;
  // Une pass suspendue à un appel qui ne répond pas ne repasse plus, et la
  // base n'est plus contrôlée : l'appel est abandonné au bout du délai.
  const borner = <T>(travail: Promise<T>, quoi: string): Promise<T> => {
    const delai = options.delaiGithubMs ?? DELAI_GITHUB_MS;
    let minuteur: NodeJS.Timeout;
    const abandonne = new Promise<never>((_, rejeter) => {
      minuteur = setTimeout(() => rejeter(new Error(`sans réponse après ${Math.round(delai / 1000)} s, abandonné`)), delai);
    });
    // L'appel abandonné peut encore échouer : personne ne l'attend plus.
    travail.catch(() => {});
    return Promise.race([travail, abandonne]).finally(() => clearTimeout(minuteur));
  };
  const passer = (tick: boolean) => {
    if (arrete) return;
    tickDemande ||= tick;
    if (enCours) {
      aRefaire = true;
      return;
    }
    enCours = true;
    void (async () => {
      try {
        do {
          aRefaire = false;
          const avecTick = tickDemande;
          tickDemande = false;
          // Un ticket sorti du rail peut y revenir (issue rouverte) : son issue
          // sera alors à refermer.
          for (const ticket of fermees) if (ticketDuRail(base, ticket) === null) fermees.delete(ticket);
          // Avant toute décision : un grant échu, runtime arrêté ou non,
          // s'écrit éteint dès que la pass repasse.
          eteindre(() => {});
          // Dans l'ordre de la file : celui où les livraisons sont arrivées.
          for (const { ticket } of fileDeLaPass(base)) {
            if (arrete) return;
            try {
              const connu = passDuTicket(base, ticket);
              if (connu) await borner(traiter(connu, avecTick), `ticket #${ticket}`);
            } catch (erreur) {
              // GitHub injoignable, worktree disparu : la livraison reste où
              // elle en est, et le tick suivant y revient.
              if (!arrete) avertir(`brigade : la pass a buté sur le ticket #${ticket} — ${message(erreur)}`);
            }
          }
          // GitHub en panne : la livraison lâchée reste à dire, et n'y est
          // relue qu'au tick.
          for (const orpheline of orphelines(base)) {
            if (arrete) return;
            if (!avecTick && butees.has(orpheline.seq)) continue;
            try {
              await borner(lacher(orpheline), `livraison lâchée du ticket #${orpheline.ticket}`);
              butees.delete(orpheline.seq);
            } catch (erreur) {
              butees.add(orpheline.seq);
              if (!arrete) avertir(`brigade : la pass a buté sur la livraison lâchée du ticket #${orpheline.ticket} — ${message(erreur)}`);
            }
          }
          try {
            if (!arrete) await controlerBase(avecTick);
          } catch (erreur) {
            if (!arrete) avertir(`brigade : la pass a buté sur le contrôle de ${options.base} — ${message(erreur)}`);
          }
          try {
            if (!arrete) await reparer(avecTick);
          } catch (erreur) {
            if (!arrete) avertir(`brigade : la pass a buté sur la réparation de ${options.base} — ${message(erreur)}`);
          }
        } while (aRefaire && !arrete);
      } catch (erreur) {
        if (!arrete) avertir(`brigade : la pass a buté — ${erreur instanceof Error ? (erreur.stack ?? erreur.message) : String(erreur)}`);
      } finally {
        enCours = false;
      }
    })();
  };

  // Un runtime tué pendant un jugement a laissé son worktree jetable.
  try {
    depot.jeter();
  } catch (erreur) {
    avertir(`brigade : worktrees jetables de la pass non retirés — ${message(erreur)}`);
  }
  // L'identité de la pass se lit d'avance, et se redemande tant qu'elle manque :
  // le résultat d'un merge s'écrit sans l'attendre.
  const desabonner = runtime.surReveil((cause) => {
    if (moi === null) void identite();
    passer(cause === "tick");
  });
  void identite();
  // Ce qui était en cours se retrouve : une intention de merger sans résultat
  // n'attend pas le premier tick.
  passer(true);

  return {
    ...runtime,
    reveillerPass: () => passer(false),
    prendreHorsRail({ run, branche, pr, numero }) {
      noter(numero, { type: "pass.entered", payload: { run, branch: branche, pr, number: numero } });
      passer(false);
    },
    arreter(signal) {
      arrete = true;
      abandon.abort();
      desabonner();
      runtime.arreter(signal);
    },
  };
}
