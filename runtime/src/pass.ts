// La pass : elle juge ce qu'un cook a livré — les gates du projet sur la
// fusion de sa branche avec la base, la relecture de son diff par le reviewer,
// la CI de son commit — puis décide. Verte, elle merge si le grant `merge` est
// actif, et s'arrête en le disant sinon ; rouge, elle renvoie les findings à
// un cook, deux fois au plus, puis remonte au chef. Manager allumé, elle lui
// passe la main dès le second rouge : c'est lui qui monte le calibrage du
// second renvoi, puis qui choisit la suite. Sa boucle est du code ; elle
// n'appelle un modèle que pour relire, une fois par livraison, et jamais avant
// des gates vertes.
//
// Un ticket qui n'a produit aucun diff n'a ni gates, ni CI, ni PR : le
// reviewer est son seul juge, et vert, il est servi sans merge ni grant.
//
// « Vert » veut dire vert une fois fusionné, et rien d'autre. Le worktree du
// cook est parti avec lui : elle fusionne le commit livré avec la base du
// moment dans un worktree jetable, que rien ne pousse, et c'est là qu'elle joue
// les gates et fait relire — c'est ce qui sera sur la base. Si la base a bougé
// entre le verdict et le merge, elle rejuge : la même règle, pas une autre.
// Une fusion qui ne se fait pas renvoie le cook se mettre à jour de la base.
// Un rouge que la base porte seule n'est celui d'aucune livraison : tant que
// la base est rouge, la pass ne juge ni ne merge, et ne renvoie personne.
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
// Elle ne garde rien en mémoire qui compte : ce qu'il lui reste à faire se lit
// dans sa projection, donc tient après un redémarrage. Le merge est un effet
// sur le monde — son intention (`grant.used`) est écrite avant l'appel, son
// résultat après, et une intention sans résultat se réconcilie sur GitHub.
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DE_CONFIANCE, type RuntimeAvecRail } from "./alimenter.ts";
import { direRefus, environnementCook, lectureDuTicket, lireFlux, REFUS_MAX, verdict as finDuFlux, type Lecture } from "./claude.ts";
import type { Depot } from "./depot.ts";
import {
  A_RELIRE,
  BASE_ROUGE,
  causeDeDeclarations,
  ENCORE_ROUGE,
  JUGES_MODIFIES,
  MACHINE_SATUREE,
  MERGE_REFUSE,
  NON_JUGEE,
  SANS_GRANT,
  type CI,
  type Depassement,
  type FaitPass,
  type Finding,
  type Gates,
  type MotifDAttente,
  type Review,
  type Verdict,
} from "./evenements/pass.ts";
import type { FaitStation } from "./evenements/station.ts";
import { direMasquage } from "./identifiants.ts";
import { CONSIGNE_DU_LIVRABLE, FERMETURE, OUVERTURE } from "./livrable.ts";
import { LancementRefuse, type CookLance, type GardeFous, type Verdict as VerdictGarde } from "./garde-fous.ts";
import { REJOUER_LA_BASE } from "./dire-base.ts";
import { envelopper, type Cloison } from "./cloison.ts";
import { aDesGates, jouerGates, SCRIPT_GATES, type DemandeScript } from "./gates.ts";
import { constaterExtinction, direExtinction } from "./grant.ts";
import { VARIABLES_GITHUB } from "./identites.ts";
import type { GitHub, PR } from "./github.ts";
import { configMachine, direSaturation, lireMachine, saturation, type Machine, type Saturation, type Seuils } from "./machine.ts";
import { etatDesGardeFous } from "./projections/garde-fous.ts";
import { managerAllume } from "./projections/manager.ts";
import { controleRetenu, etatDeLaBase, etatDuGrant, lirePass, mergesAVerifier, orphelines, passDuTicket, type Orpheline, type PassDeTicket, type Relue } from "./projections/pass.ts";
import { ticketDuRail } from "./projections/rail.ts";
import { cookDeRun, etatStation, refusDAffilee } from "./projections/stations.ts";
import { GesteRefuse, nomAbandon } from "./rail.ts";
import { DECLARATION_RESEAU } from "./reseau.ts";
import { argumentsReviewer, CONSIGNE_MAX, consigneDeRelecture, DE_LA_BRIGADE, diffCoupe, lireRelecture, REVIEWER, type ConfigReviewer } from "./reviewer.ts";
import { ConfigInvalide } from "./runtime.ts";
import { DECLARATION, lireSecrets } from "./secrets.ts";
import type { Fin } from "./superviseur.ts";

const AUTEUR = "pass";
// Règle V1 conservée : au deuxième renvoi resté rouge, la pass cesse de renvoyer.
export const RENVOIS_MAX = 2;
// Le motif sous lequel un ticket rouge revient sur le rail.
export const PASS_ROUGE = "pass-red";
// Ce par quoi une livraison est jugée : qui y touche peut se rendre vert seul.
const JUGES = [".claude/brigade/", ".github/workflows/"];
// Ce par quoi le projet s'ouvre au runtime, et ce que le chef relit avant que
// la base ne le porte : mergée, la déclaration vaut pour le cook suivant.
const DECLARATIONS: Record<string, string> = {
  [DECLARATION_RESEAU]: "chaque hôte qu'elle ajoute s'ouvre aux cooks suivants du projet, qui ont ses secrets de dev dans leur environnement",
  [DECLARATION]: "chaque nom qu'elle ajoute est une valeur de la machine remise aux cooks suivants du projet",
};
const WORKFLOWS = ".github/workflows";
// La station dont les relectures consomment le quota : celle des cooks. Le
// nom est redit ici plutôt qu'importé — la station importe déjà la pass.
const STATION = "box/claude";
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
// Les worktrees jetables de la pass : celui d'un jugement, par ticket, et
// celui de la base.
const essaiDeJugement = (ticket: number) => `jugement-${ticket}`;
const ESSAI_DE_BASE = "base";

export type ConfigPass = {
  // Le plafond de durée des gates : au-delà, elles sont arrêtées et rouges.
  delaiGatesMs: number;
  // L'attente tolérée d'une CI qui ne conclut pas, avant de remonter au chef.
  attenteCiMs: number;
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
  depot: Depot;
  github: GitHub;
  // La branche d'intégration : la seule base sur laquelle la pass merge.
  base: string;
  // Le calibrage du reviewer.
  reviewer: ConfigReviewer;
  // `<owner>/<repo>`, pour la consigne du reviewer.
  depotGitHub: string;
  // Le binaire `claude`.
  bin: string;
  // Ce que la machine doit garder pour que la pass rejoue des gates — une
  // livraison à rejuger, la base —, et de quoi la lire : les seuils et la
  // machine de la station. Par défaut : les seuils par défaut, la vraie machine.
  seuils?: Seuils;
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

export type Pass = {
  // Fait repasser la pass sans attendre le tick : un cook vient de livrer.
  reveillerPass(): void;
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
export function consigneDeRenvoi(mission: { ticket: number; titre: string; depot: string; base: string; branche: string; n: number; findings: string[]; remis?: string }): string {
  const { ticket, titre, depot, base, branche, n, findings } = mission;
  return [
    `Tu es un cook de la brigade : tu reprends un seul ticket, le ticket #${ticket} du dépôt ${depot} — « ${titre} ».`,
    "",
    `Un cook a déjà livré ce ticket sur la branche \`${branche}\`, partie de \`${base}\`. La pass — les gates du dépôt, sa CI et la relecture du reviewer — a refusé sa livraison : c'est ${nomDuRenvoi(n)}. Ce qu'elle juge n'est pas la branche seule, mais sa fusion avec \`origin/${base}\` telle qu'elle est au moment du jugement : c'est ce résultat qui doit être vert. Tu es dans un worktree neuf, sur sa branche, avec ses commits — et, s'il avait laissé du travail non commité, un commit de plus qui le porte, au nom de \`brigade\`.`,
    "",
    "Ce que la pass a trouvé :",
    "",
    ...findings.flatMap((finding) => [finding, ""]),
    `1. Relis le ticket : ${lectureDuTicket(mission)}, et ce qui est déjà commité : \`git log origin/${base}..HEAD\`. Les conventions du dépôt ne te sont pas chargées d'office : lis son \`CLAUDE.md\`, s'il en a un à la racine, avant d'écrire quoi que ce soit, et suis-le.`,
    "2. Corrige ce que la pass a trouvé, et rien d'autre. Un finding que tu tiens pour faux : ne le contourne pas, dis-le dans ton compte-rendu.",
    `3. Rejoue toi-même ce qui a échoué (les gates du dépôt), ta branche à jour de la base — \`git fetch origin ${base}\`, puis rebase sur \`origin/${base}\` —, puis commite sur cette branche ce que tu as changé.`,
    "4. Tu ne pousses rien, tu n'ouvres pas de PR, tu ne merges jamais et tu ne commentes pas le ticket : la station s'en charge quand tu as fini.",
    `5. Termine par ton compte-rendu, en clair : ce que tu as corrigé, ce que tu as vérifié et comment, ce qui reste. ${CONSIGNE_DU_LIVRABLE}`,
    "",
    "Personne ne te répondra. S'il te manque une décision, ne la devine pas : arrête-toi et dis laquelle dans ton compte-rendu.",
  ].join("\n");
}

// Ce que le chef peut faire d'un ticket remonté : merger sa PR — s'il en a une.
const suiteDuChef = (pr: string | null) =>
  pr
    ? "Mergée à la main, la pass le verra et fermera le ticket ; retirer `fire` le sort du rail."
    : "Il n'a pas de PR, donc rien à merger : retirer `fire` le sort du rail, ou ferme l'issue si le compte-rendu du cook, plus haut, suffit.";

// La seule consigne d'une livraison que la base a dépassée.
const mettreAJour = (base: string) => `Mets-toi à jour de la base : \`git fetch origin ${base}\`, puis rebase ta branche sur \`origin/${base}\``;
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
  | { merge: { pr: string; number: number; sha: string; branche: string | null; jugee: string } }
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
  // Cache, pas état : les gates déjà jouées sur la fusion d'un commit avec une
  // base, le temps que sa CI conclue. Le perdre coûte de les rejouer.
  const gatesJouees = new Map<number, { sha: string; base: string; gates: Gates; arbre: string }>();
  // Les issues déjà fermées, le temps que le sondage les sorte du rail.
  const fermees = new Set<number>();
  // Les livraisons vertes qu'un merge en vol retient : dit une fois chacune.
  const retenus = new Set<number>();

  const commenter = async (ticket: number, corps: string) => {
    try {
      await github.commenter(ticket, corps);
    } catch (erreur) {
      if (!arrete) avertir(`brigade : commentaire de la pass non posté sur le ticket #${ticket} — ${message(erreur)}`);
    }
  };

  const enPass = (ticket: number) => ticketDuRail(base, ticket)?.state === "pass";

  // Le ticket mergé est servi, et son issue fermée par la pass : `Closes`
  // n'agit que sur la branche par défaut du dépôt.
  const finir = async (ticket: number) => {
    try {
      rail.servir(ticket);
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
    await finir(connu.ticket);
  };

  // La PR de la livraison est fermée sans être mergée : le chef a dit non.
  // Écrit une fois — la phase qui en sort ne le constate plus.
  const constaterFermeture = async (connu: PassDeTicket, pr: PR) => {
    const { ticket } = connu;
    // Le ticket a pu quitter le rail, ou repartir, pendant la lecture de GitHub.
    const actuel = passDuTicket(base, ticket);
    if (actuel?.branch !== connu.branch || actuel.phase !== connu.phase) return;
    noter(ticket, { type: "pass.pr-closed", payload: { pr: pr.url } });
    gatesJouees.delete(ticket);
    avertir(`brigade : la PR du ticket #${ticket} a été fermée sans merge (${pr.url}) — la pass ne suit plus cette livraison`);
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
      rail.quatreVingtSix(ticket, { motif: `pass:${NON_JUGEE}` });
    });
    gatesJouees.delete(ticket);
    avertir(`brigade : la pass remonte le ticket #${ticket} au chef (${NON_JUGEE} : ${cause})`);
    await commenter(
      ticket,
      [
        `**Pass — remontée au chef (\`${NON_JUGEE}\` : ${cause}).** ${pourquoi}`,
        "",
        `Rien n'est mergé, et aucun cook n'est relancé : le ticket est 86.${connu.pr ? ` PR : ${connu.pr}.` : ""} ${suiteDuChef(connu.pr)}`,
      ].join("\n"),
    );
  };

  // Une relecture consomme le quota du compte : elle n'a pas lieu si le chef a
  // dit « stop », si le disjoncteur est ouvert, ou si la station dit le compte
  // épuisé ou déconnecté. La livraison attend, sans verdict.
  const peutRelire = (): boolean => {
    const garde = etatDesGardeFous(base);
    if (garde.stoppedAt !== null || garde.breakerOpenedAt !== null) return false;
    const station = etatStation(base, STATION);
    if (station?.disconnectedAt) return false;
    return !(station?.quotaUntil && station.quotaUntil > maintenant().toISOString());
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

  // Fait relire une livraison. Rend la relecture — lisible ou non — une fois
  // qu'elle est au journal ; null si elle n'a pas abouti et reste à faire. La
  // même livraison (le run du cook, son commit) ne se relit jamais deux fois.
  const relire = async (connu: PassDeTicket, branche: string, ou: () => Promise<string>, sha: string, sansDiff: boolean): Promise<Relue | null> => {
    const { ticket, run } = connu;
    if (connu.review?.cook === run && connu.review.sha === sha) return connu.review;
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
    const mission = {
      depot: options.depotGitHub,
      base: options.base,
      ticket: { number: ticket, title: issue.title, body: issue.body ?? "" },
      commentaires,
      compteRendu: sansDiff ? rapport.livrable : (rapport.livrable ?? rapport.message),
      diff,
    };
    const consigne = consigneDeRelecture(mission);
    // Une consigne que le système refuserait de passer à `claude` ne se lance
    // pas : elle échouerait à chaque réveil, sans verdict ni remontée.
    const poids = Buffer.byteLength(consigne);
    if (poids > CONSIGNE_MAX) {
      return remonter(connu, "review-unsendable", `La consigne du reviewer pèse ${nombre(poids)} octets, plus que ce qu'une commande accepte (${nombre(CONSIGNE_MAX)}) : cette livraison ne peut pas être relue par le runtime.`).then(() => null);
    }

    const review = `review-${ticket}-${randomUUID().slice(0, 8)}`;
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
      lue = lireRelecture(lecture.message);
      // Une relecture réussie ne remet pas à zéro les échecs d'affilée des
      // cooks : elle ne compte ni pour ni contre.
      return "relecture" in lue ? "neutral" : "failed";
    };

    const worktree = await ou();
    // Le ticket a pu quitter le rail pendant les gates : aucune relecture ne
    // part pour lui.
    if (arrete || !enPass(ticket)) return null;
    let lance: CookLance;
    try {
      lance = runtime.lancer({
        // Hors ticket, comme un jugement du manager : le ticket a son cook, et
        // c'est `pass.reviewed` qui rattache cette relecture à sa livraison.
        ticket: null,
        run: review,
        contexte: { station: REVIEWER, ...options.reviewer.calibrage },
        // Il relit : le worktree et le dépôt lui sont rendus en lecture seule.
        ...envelopper(options.cloison, { commande: options.bin, args: argumentsReviewer(consigne, options.reviewer.calibrage) }, { cwd: worktree, depot: "lecture" }),
        cwd: worktree,
        env: envGates,
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
    if (comment === "86") {
      const instant = maintenant();
      const annonce = flux?.quota?.retour ?? null;
      const retour = annonce !== null && annonce > instant ? annonce : new Date(instant.getTime() + REPLI_QUOTA_MS);
      noter(null, { type: "station.86", payload: { station: STATION, reason: "quota", until: retour.toISOString(), window: flux?.quota?.fenetre ?? null } });
      return null;
    }
    if (comment === "disconnected") {
      noter(null, { type: "station.disconnected", payload: { station: STATION, reason: "authentication_failed", run: review } });
      avertir(`brigade : connexion Max absente ou expirée, vue par une relecture du reviewer — \`claude /login\` sous le compte du service, puis « reprendre »`);
      return null;
    }
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
      avertir(`brigade : relecture illisible sur le ticket #${ticket} (${relecture.illisible}) — ni verte ni rouge`);
      return passDuTicket(base, ticket)?.review ?? null;
    }
    const { verdict, summary, findings } = relecture.relecture;
    noter(ticket, { type: "pass.reviewed", payload: { run, sha, review, outcome: verdict, summary, findings, reason: null, truncated } });
    const relue = passDuTicket(base, ticket)?.review ?? null;
    if (relue) await commenter(ticket, [direRelecture(connu, sha, relue, sansDiff), ...(fin.masques ? ["", direMasquage(fin.masques, "ce que le reviewer a dit — son flux brut, d'où vient cette relecture")] : [])].join("\n"));
    return relue;
  };

  // Une relecture qui ne se lit pas n'est ni verte ni rouge : aucun cook ne
  // peut la corriger, elle remonte.
  const remonterIllisible = (connu: PassDeTicket, relue: Relue) =>
    remonter(
      connu,
      "review-unreadable",
      `Le reviewer a relu cette livraison, mais sa réponse ne se lit pas (${relue.reason ?? "illisible"}) : ni verte ni rouge. Son flux brut est dans \`runs/${relue.run}.jsonl\`.`,
    );

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

  // Ce que la branche d'une livraison porte, sans worktree.
  const porteDesWorkflows = (branche: string) => depot.liste(branche, WORKFLOWS).some((fichier) => /\.ya?ml$/.test(fichier));
  // Le clone ne connaît plus la branche : une restauration repart d'un clone
  // neuf. La pass n'a plus rien à juger, et ne la recrée pas.
  const sansBranche = (connu: PassDeTicket, branche: string, pourquoi: string) =>
    remonter(connu, "worktree-lost", `Le clone de la station ne connaît plus la branche de cette livraison (\`${branche}\`) : ${pourquoi}`);

  // La livraison attend, et le dit une fois.
  const attendre = async (connu: PassDeTicket, motif: MotifDAttente, pourquoi: string): Promise<void> => {
    if (connu.phase === "waiting" && connu.reason === motif) return;
    noter(connu.ticket, { type: "pass.waiting", payload: { reason: motif } });
    await commenter(connu.ticket, [`**Pass — en attente (\`${motif}\`).** \`${court(connu.sha)}\`${connu.pr ? ` · ${connu.pr}` : ""}`, "", pourquoi].join("\n"));
  };
  // Une livraison se juge fusionnée avec la base : rouge, la base rougirait
  // toutes les livraisons, pour un rouge qu'aucun cook ne peut corriger.
  const attendreLaBase = (connu: PassDeTicket, rouge: string) =>
    attendre(
      connu,
      BASE_ROUGE,
      `\`${options.base}\` est rouge : ses gates, jouées sur elle-même, ont échoué sur \`${court(rouge)}\`. Une livraison se juge fusionnée avec \`${options.base}\` : tant qu'elle est rouge, la pass ne juge ni ne merge rien, et ne renvoie aucun cook — ce rouge-là n'est celui d'aucune livraison. Rien n'est à refaire sur celle-ci : elle sera jugée, et mergée sous grant, dès que \`${options.base}\` sera réparée — la pass rejoue ses gates dès qu'elle bouge, ou sans commit à la demande du chef (\`${REJOUER_LA_BASE}\`). La merger à la main reste possible.`,
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
      const verte = VERTES.includes(connu.phase);
      if (!verte && connu.phase !== "red" && connu.phase !== "deferred") return null;
      const { pr, number, sha } = connu;
      const fusion = connu.judgedBase === null ? "" : ` fusionné avec \`${options.base}\` (\`${court(connu.judgedBase)}\`)`;
      const livraison = `\`${court(sha)}\`${fusion}${pr ? ` · ${pr}` : ""}${connu.noDiff ? " · ticket sans diff" : ""}`;

      if (!verte) {
        const constat = ["", ...connu.findings.flatMap((finding) => [finding, ""])];
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
        return {
          commentaire: [
            `**Pass — verte, non mergée (\`${A_RELIRE}\`).** ${livraison}`,
            "",
            "Cette livraison touche à ce que le projet déclare au runtime pour s'ouvrir : la pass ne la merge jamais elle-même, grant ou pas. À relire avant de merger à la main :",
            ...connu.declarations.map((fichier) => `- \`${fichier}\` — ${DECLARATIONS[fichier] ?? "ce que le projet s'ouvre"} ;`),
            "- ce qu'elle en retire ou y réécrit, de même.",
            ...(connu.judgeModified ? ["", `Elle touche aussi à ce qui la juge (${JUGES.map((juge) => `\`${juge}\``).join(", ")}).`] : []),
            "",
            "Mergée à la main, la pass le verra et servira le ticket.",
          ].join("\n"),
        };
      }
      if (connu.judgeModified) {
        noter(ticket, { type: "pass.held", payload: { reason: A_RELIRE, cause: JUGES_MODIFIES } });
        return {
          commentaire: [
            `**Pass — verte, non mergée (\`${A_RELIRE}\`).** ${livraison}`,
            "",
            `Cette livraison touche à ce qui la juge (${JUGES.map((juge) => `\`${juge}\``).join(", ")}) : la pass ne la merge jamais elle-même, grant ou pas. À relire et merger à la main — la pass le verra et servira le ticket.`,
          ].join("\n"),
        };
      }
      const grant = etatDuGrant(base, "merge", maintenant());
      if (!grant?.active) {
        // Ce qu'elle aurait fait sous grant, dit avec l'arrêt, de ce qu'elle
        // sait déjà de la base : rien n'est rapatrié pour le dire.
        const rouge = etatDeLaBase(base);
        const sousGrant =
          rouge?.outcome === "red"
            ? `aurait attendu que \`${options.base}\`, rouge (\`${court(rouge.sha)}\`), repasse verte avant de merger ${pr}`
            : `aurait mergé ${pr} sur \`${options.base}\` au commit \`${court(sha)}\`, verdict n° ${connu.verdictSeq ?? 0} — ou rejugé la livraison, si \`${options.base}\` a bougé depuis`;
        const eteint = grant?.ended === "expired" ? grant : null;
        noter(ticket, { type: "pass.held", payload: { reason: SANS_GRANT, ...(eteint ? { expired: eteint.since } : {}) } });
        return {
          commentaire: [
            `**Pass — verte, non mergée (\`${SANS_GRANT}\`).** ${livraison}`,
            "",
            eteint
              ? `Le grant \`merge\` s'est éteint seul le ${eteint.since} — ${direExtinction(eteint.cause)} : la pass s'arrête là. À merger à la main — la pass le verra et servira le ticket. Le réaccorder (\`npm --prefix runtime run grant -- activer merge\`, avec ou sans échéance) vaudra pour les livraisons suivantes, pas pour celle-ci.`
              : "Le grant `merge` n'est pas actif : la pass s'arrête là. À merger à la main — la pass le verra et servira le ticket. Activer le grant (`npm --prefix runtime run grant -- activer merge`) vaudra pour les livraisons suivantes, pas pour celle-ci.",
            "",
            `Sous grant, la pass ${sousGrant}.`,
          ].join("\n"),
        };
      }
      // Les usages qui restent sont tous retenus par des merges en vol : celui-ci
      // n'en prend pas un de plus. La décision se reprend au réveil suivant,
      // quand leur sort est connu.
      if (grant.usesLeft !== null && grant.usesLeft <= grant.reserved) {
        if (!retenus.has(ticket)) avertir(`brigade : ticket #${ticket} vert, pas mergé pour l'instant — ${grant.reserved > 1 ? "les usages qui restent au grant \`merge\` sont retenus par des merges" : "le dernier usage du grant \`merge\` est retenu par un merge"} en cours : la décision se reprend dès que son sort est connu (\`run grant\`)`);
        retenus.add(ticket);
        return null;
      }
      retenus.delete(ticket);
      // Le verdict porte sur la fusion avec une base : il n'autorise le merge
      // que sur celle-là.
      if (tete === undefined || tete !== connu.judgedBase) return { verifier: true };
      noter(ticket, { type: "grant.used", payload: { action: "merge", pr, number, sha, base: options.base, verdict: connu.verdictSeq ?? 0 } });
      return { merge: { pr, number, sha, branche: connu.branch, jugee: tete } };
    });
    if (suite === null) return;
    if ("commentaire" in suite) return commenter(ticket, suite.commentaire);
    if ("service" in suite) {
      await finir(ticket);
      return commenter(ticket, suite.service);
    }
    if ("verifier" in suite) {
      const connu = passDuTicket(base, ticket);
      if (!connu) return;
      const controle = etatDeLaBase(base);
      if (controle?.outcome === "red") return attendreLaBase(connu, controle.sha);
      const vue = await depot.rapatrier();
      if (arrete) return;
      // La base a bougé depuis le verdict : il ne dit plus ce qui sera sur
      // elle. La livraison se rejuge — la même règle qu'au premier jugement.
      if (vue !== connu.judgedBase) return juger(connu);
      return decider(ticket, vue);
    }

    const { pr, number, sha, branche, jugee } = suite.merge;
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
        avertir(`brigade : merge du ticket #${ticket} refusé par GitHub, branche en retard sur ${options.base} (${pr}) — elle repart au cook`);
        return decider(ticket);
      }
      base.transaction(() => {
        noter(ticket, { type: "merge.failed", payload: { pr, sha, reason: motif } });
        noter(ticket, { type: "pass.held", payload: { reason: MERGE_REFUSE, cause: motif } });
      });
      avertir(`brigade : merge du ticket #${ticket} refusé par GitHub (${pr}) — ${motif}`);
      return commenter(
        ticket,
        [`**Pass — verte, merge refusé par GitHub.** \`${court(sha)}\` · ${pr}`, "", `${motif}. La pass ne le retente pas : à merger à la main — elle le verra et servira le ticket.`].join("\n"),
      );
    }
    // GitHub vient de merger sous le jeton de la pass : c'est son identité, si
    // elle en a une à elle — telle qu'elle a déjà été lue. Entre un merge fait
    // et son résultat écrit, rien n'attend : un runtime qui s'arrête là
    // n'écrirait plus rien.
    const sous = moi;
    noter(ticket, { type: "merge.done", payload: { pr, sha, by: "pass", ...acteur(sous), reconciled: false, unverified: false } });
    await finir(ticket);
    await commenter(ticket, [`**Pass — verte, mergée sur \`${options.base}\` sous le grant \`merge\`.** \`${court(sha)}\` · ${pr}`, "", `Jugée fusionnée avec \`${options.base}\` telle qu'elle était au moment de merger (\`${court(jugee)}\`).`].join("\n"));
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

    // Ce qui est jugé est ce qui sera sur la base : le commit que l'origine a
    // reçu — celui que la CI connaît et que GitHub mergera, sans la récolte
    // qu'un rangement aurait posée sur la branche locale — fusionné avec la
    // base telle qu'elle est à cet instant.
    const sha = depot.tete(ref);
    const ici = { ...connu, pr: pr.url, sha };
    const rouge = etatDeLaBase(base);
    if (rouge?.outcome === "red") return attendreLaBase(ici, rouge.sha);
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
        gates = await jouerGates({ worktree, ticket, ...secrets, interdites, delaiMs: options.delaiGatesMs, cloison: options.cloison, signal: abandon.signal });
        // Parti pendant ses gates, le ticket n'a plus de verdict à recevoir.
        if (arrete || !enPass(ticket)) return;
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
      const checks = await github.ci(sha);
      if (arrete) return;
      // Des workflows sans aucun check : la CI n'a pas encore démarré.
      const attendue = checks.length === 0 && porteDesWorkflows(ref);
      const enCours = attendue || checks.some((check) => check.outcome === "pending");
      // Un constat bloquant n'attend pas la CI : le verdict est déjà rouge,
      // et elle sera lue sur le commit qui le corrige.
      if (enCours && review.outcome !== "red") {
        const depuis = Date.parse(passDuTicket(base, ticket)?.startedAt ?? "");
        if (!(maintenant().getTime() - depuis > options.attenteCiMs) || !enPass(ticket)) return;
        return remonter(
          connu,
          "ci-silent",
          `La CI du commit \`${court(sha)}\` n'a pas conclu en ${minutes(options.attenteCiMs)}${attendue ? " (aucun check, alors que la branche porte des workflows)" : ""}. Les gates, elles, sont vertes.`,
        );
      }
      if (!enCours) {
        const rouges = checks.filter((check) => check.outcome === "red");
        ci = { outcome: checks.length === 0 ? "none" : rouges.length > 0 ? "red" : "green", checks };
        findings.push(...rouges.map((check) => `CI rouge — job « ${check.name} » : ${check.conclusion}${check.url ? ` (${check.url})` : ""}.`));
      }
      findings.push(...bloquants(review.findings).map(findingDuReviewer));
    } else {
      // Rouges une fois fusionnée : la base l'est-elle seule ? Ce rouge-là
      // n'est pas celui de la livraison, et ne renvoie aucun cook.
      const seule = await jugerLaBase(tete);
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
    gatesJouees.delete(ticket);
    // Le ticket a pu quitter le rail pendant une attente de GitHub : gates et
    // relecture en cache n'y changent rien, il n'a plus de verdict à recevoir.
    if (!enPass(ticket)) return;
    const verdict = findings.length === 0 ? "green" : "red";
    const franchi = plafondADire(journal.duTicket(ticket), { sha, verdict, gates });
    prononcer(connu, { run, pr: pr.url, number: pr.number, sha, base: tete, merged: arbre, verdict, gates, ci, review, findings, judgeModified, declarations, noDiff: false });
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
          `Ce n'est pas un motif de renvoi : ${PLAFOND_NON_JUGE}. Tout le reste des gates est vert, et la livraison suit son chemin. Le plafond reste jugé là où il a été mesuré — les gates jouées sur le poste de dev, le hook d'arrêt ; ici, le dépassement se suit au relevé (\`npm --prefix runtime run mesures\`).`,
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
        if (enPass(connu.ticket)) await juger(connu);
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
        if (connu.reason === BASE_ROUGE ? etatDeLaBase(base)?.outcome === "red" : sature() !== null) return;
        if (enPass(connu.ticket)) await juger(connu);
        return;
      case "merging":
        return reconcilier(connu);
      case "merged":
      case "served":
        return finir(connu.ticket);
      // GitHub n'est relu qu'au tick : une fois par minute suffit.
      // Fermée sans merge, sa PR peut encore être rouverte et mergée.
      case "held":
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
  // réparer est au chef.
  let machineDite = false;
  const controlerBase = async (tick: boolean, exige = false) => {
    const avant = etatDeLaBase(base);
    const rouge = avant?.outcome === "red" ? avant : null;
    const demande = rouge?.recheck ?? null;
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
          ? `rejeu des gates de ${options.base} demandé par le chef`
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
        avertir(`brigade : rejeu des gates de ${options.base} demandé par le chef, mais la machine n'en peut plus — ${direSaturation(pleine)}. La pass y revient`);
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
      if (essai !== null && aDesGates(essai)) gates = await jouerGates({ worktree: essai, ticket: 0, ...pourLesGates(essai), interdites, delaiMs: options.delaiGatesMs, cloison: options.cloison, signal: abandon.signal });
    } catch (erreur) {
      // Sans leurs secrets, les gates de la base ne sont pas jouées : un
      // contrôle non joué, avec son motif.
      if (!(erreur instanceof SecretsIndisponibles)) throw erreur;
      panne = erreur.message.slice(0, PANNE_MAX);
    } finally {
      retirer();
    }
    if (arrete) return;
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
    // Le rouge que le chef a fait rejouer n'est pas une nouvelle : aucune issue n'est recommentée.
    if (demande !== null && tete === rouge?.sha && tickets.length === 0) {
      avertir(`brigade : ${options.base} reste ROUGE (${court(tete)}) : rejouées à la demande du chef, ses gates ne passent toujours pas — jugements et merges restent suspendus`);
      return;
    }
    const merges = tickets.map((ticket) => `#${ticket}`).join(", ");
    avertir(`brigade : ${options.base} est ROUGE (${court(tete)}${merges === "" ? "" : ` — merges à vérifier : ${merges}`}) — jugements et merges sont suspendus`);
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
          `La pass ne juge ni ne merge plus rien tant que \`${options.base}\` est rouge ; les livraisons attendent. À réparer à la main : la pass rejoue les gates dès que \`${options.base}\` bouge, et reprend seule. Un rouge qui ne tient pas au code — un test instable, un délai dépassé — se rejoue sans commit : \`${REJOUER_LA_BASE}\`.`,
        ].join("\n"),
      );
    }
  };

  // Cache, pas état : les départs sur lesquels GitHub n'a pas répondu.
  const butees = new Set<number>();

  // Une seule passe à la fois. Un réveil qui arrive pendant qu'elle juge n'est
  // pas perdu : elle repasse aussitôt finie.
  let enCours = false;
  let tickDemande = false;
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
          for (const { ticket } of lirePass(base)) {
            if (arrete) return;
            try {
              const connu = passDuTicket(base, ticket);
              if (connu) await traiter(connu, avecTick);
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
              await lacher(orpheline);
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
    arreter(signal) {
      arrete = true;
      abandon.abort();
      desabonner();
      runtime.arreter(signal);
    },
  };
}
