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
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fiche } from "./fiche.ts";
import { direAttenteSurMisDeCote, direSaut } from "./retenue/retenue.ts";
import { calibrage as calibrageDesLabels, complet, type Calibrage } from "./calibrage.ts";
import { environnementHorsGitHub, ticketJoint } from "./bac-a-sable/hors-github.ts";
import { dansLeBacASableLocal, type BacASableLocal } from "./bac-a-sable/local.ts";
import { argumentsClaude, consigne, environnementCook, lireFlux, VARIABLES_DE_JETON, verdict } from "./claude.ts";
import { poserALaMain } from "./blocages-sans-question.ts";
import { lireBlocage } from "./livrable.ts";
import { envelopper, type Cloison, type Lancement } from "./cloison.ts";
import type { Depot } from "./depot.ts";
import type { Plafonds } from "./events/guardrails.ts";
import { etatDeLaBase, etatDuTicket, LABEL_IN_PASS, LABEL_TAKEN } from "./github-etat/etats.ts";
import { fermeReparation, type GitHubDeLaFermeture } from "./base-rouge/ferme-reparation.ts";
import { estUneReparation, ouvreReparation, shaDeBaseRouge, type CheckDeLaBase, type GitHubDeLaReparation } from "./base-rouge/ouvre-reparation.ts";
import { lireInstantane, REQUETE, type Instantane } from "./github-etat/instantane.ts";
import { estLaPauseDeGitHub, LimiteGitHubAtteinte } from "./limite-github.ts";
import { ConfigInvalide } from "./runtime.ts";
import { lacher, premierePrise, prendre, purger } from "./github-etat/prise.ts";
import { approuvee, ciDeLaTete, fusionner, relire, type GitHubDeLaFusion, type Jugement, type PRAFusionner } from "./github-etat/fusion.ts";
import { jouerLesGatesDeLaTete, type GitHubDesGates, type LieuDesGates, type VerdictDesGates } from "./github-etat/gates-de-la-tete.ts";
import { declencheSurPr } from "./declencheurs.ts";
import type { Check, Gates } from "./events/pass.ts";
import { aDesGates, jouerGates, jouerSetup, SCRIPT_GATES, SCRIPT_SETUP } from "./gates.ts";
import { VARIABLES_GITHUB } from "./identites.ts";
import { lireSecrets } from "./secrets.ts";
import { HORS_CUISINE, type GitHub, type Issue, type PR } from "./github.ts";
import { relanceDeLaBase, type GitHubDeLaRelance } from "./relance-main-rouge.ts";
import { ouvrirGuerison } from "./guerison/index.ts";
import { briefDuRenvoi, lireLeRenvoi, type Renvoi } from "./brief-renvoi.ts";
import type { GardesDuTour } from "./github-seul/garde-fous/garde-fous.ts";
import { environnementClaude } from "./jeton-claude.ts";
import { argumentsReviewer, consigneDeRelecture, lireRelecture } from "./reviewer.ts";
import { CALIBRAGE_DU_SECOND_JUGE, ConsigneIllisible, consigneDuSecondJuge, corpsDuSecondJugement, lireLaConsigne, lireSecondJugement, secondJugementDe } from "./second-juge.ts";
import { motifArretCook } from "./motif-arret-cook.ts";
import { avecLeDesaccord, classerArret, consigneDuDesaccord, corpsDeLaReponse, renvoisDeLaTete, reponseDuCook, reponseDuMessage } from "./desaccord-cook.ts";
import { superviser, type Supervise } from "./superviseur.ts";
import { estUneSauvegarde, SUJET_DE_SAUVEGARDE } from "./mise-a-jour/attente/attente.ts";
import { horsCuisine } from "./seuil-hors-cuisine.ts";
import { alerteDuClone } from "./alerte-temps-cuisson/alerte.ts";
import { correctionDuTemps, ticketDeCorrection } from "./temps-max/correction.ts";
import { routerLeTempsPerdu, type GitHubDeLaBrigade } from "./routage-temps-perdu.ts";
import { redeposerHorsCuisine } from "./refile-hors-cuisine.ts";
import { lesTempsDesTickets } from "./temps-ticket/ligne-status.ts";
import { mesurerQualite, projetDuClone, type QualiteDuTicket } from "./mesure-qualite.ts";
import { MARQUE_D_ECHEC, MARQUE_DE_RENVOI, qualiteDeLIssue, qualiteLue, qualitesDesTemps, RAISONS_DE_RENVOI } from "./qualite-github.ts";
import { ticketsRecents } from "./temps-max/mesure.ts";
import type { EnregistrementTemps } from "./temps-ticket/synthese.ts";
import { PRIO_REPARATION } from "./reparation.ts";
import { qualiteEnDefaut } from "./alerte-qualite.ts";
import { servirLeTemps } from "./temps-cuisson/ratio.ts";
import { chronometre, completerLesTemps, type DepotDuTicket, rattraperLaPrise } from "./temps-ticket/mesure.ts";

// Un ticket tel que le tour le lit : une issue ouverte qui porte `fire`.
// `epique` : son corps porte la liste des tickets d'une épique — elle se sert
// par eux, jamais ne se prend (#2618).
export type TicketLu = Pick<Issue, "number" | "title" | "labels" | "state" | "epique">;

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
export const priseDeLaStation = (github: GitHubDuTour, station: string): Prise => ({
  prendre: (issue) => prendre(issue, { github, station }),
  lacher: (issue) => lacher(issue, { github, station }),
  purger: (issue) => purger(issue, { github }),
});

// Ce que le tour lit et écrit de GitHub : ce que demandent la relecture et le
// merge, plus les tickets, la PR d'un ticket, les checks de la base, les
// labels et l'ouverture d'une PR.
export type GitHubDuTour = GitHubDeLaFusion &
  Pick<GitHub, "labelliser" | "delabelliser" | "ouvrirPR"> &
  // Les statuts de commit où se lisent et s'écrivent les gates d'une tête
  // (#2456). Absents, la station ne les joue pas.
  Partial<GitHubDesGates> &
  GitHubDeLaReparation &
  GitHubDeLaFermeture & {
    // Les retraits de labels de l'issue, que la prise lit pour le lâcher du chef.
    retraitsDeLabels(numero: number): Promise<{ label: string; createdAt: string }[]>;
    // Quand l'issue a été déposée et mise sur le rail : d'où part le temps du
    // ticket servi (#2662). Absent ou null, il part de la prise.
    depotDuTicket?(numero: number): Promise<DepotDuTicket | null>;
    // Les issues ouvertes qui portent `fire`, dans l'ordre où les servir.
    fires(): Promise<TicketLu[]>;
    // Les issues dont le ticket dépend (`Depends on #N` dans son corps) et qui
    // sont encore ouvertes : tant qu'il y en a, le ticket n'est pas à prendre.
    dependancesOuvertes(issue: number): Promise<number[]>;
    // La PR qui livre le ticket, ou null. `version` change avec tout ce que
    // GitHub change à la PR.
    prDuTicket(issue: number): Promise<(PRAFusionner & Pick<PR, "version">) | null>;
    // Les checks du dernier commit de la branche d'intégration.
    checksDeLaBase(): Promise<CheckDeLaBase[]>;
    // Le corps de l'issue, où le ticket dit sa zone.
    corpsDuTicket(issue: number): Promise<string>;
    // Les PR ouvertes : la branche dont chacune est la tête, et les fichiers qu'elle change.
    prsOuvertes(): Promise<{ branche: string; fichiers: string[] }[]>;
    // L'issue, son état et son corps : ce qu'il faut pour fermer une épique
    // finie (#2757). Absente, la guérison ne ferme aucune épique.
    issue?: GitHub["issue"];
  } & GitHubDeLaRelance;

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

const SOUS_BRIGADE = ".claude/brigade/";
// Tous ses fichiers sont sous `.claude/brigade/`, où la session d'un cook ne peut pas écrire (#2729).
// Un ticket que la station a ouvert (corps à marque) y écrit par conception : il part.
export const neLivreQueSousBrigade = (corps: string): boolean => {
  if (corps.startsWith("<!-- brigade:")) return false;
  const fichiers = fichiersDuCorps(corps);
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
export type Cuisiner = (ticket: TicketLu, calibrage: Calibrage) => Promise<({ branche: string } | { echec: string } | { reste: string } | { bloque: string } | { subi: string; retour?: Date | null; court?: boolean }) & { testsMs?: number }>;
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
  // Combien de cooks elle tient à la fois.
  places: number;
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
  // côté) : la retenue de la cuisine la reprend (#2429).
  sauter?: (ticket: number, ligne: string) => void;
  // Les garde-fous (#2213) : le « stop », le disjoncteur,
  // le quota et l'arbitre, lus avant chaque prise. Absents, rien ne retient.
  gardes?: Pick<GardesDuTour, "retenue" | "redire" | "quitter">;
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
  // Le répertoire d'état du projet, où se compte un `blocked-on-human` sans
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
  // Les tickets `hors-cuisine` du tour, que le redépôt reprend sans humain
  // (`refile-hors-cuisine.ts`, #2786). Absent, rien ne les reprend.
  redeposer?: (tickets: readonly TicketLu[]) => Promise<unknown>;
  // Les fichiers suivis de la base (#2826) : la zone d'un ticket sans zone
  // déclarée ne garde que les chemins de son corps qui nomment le dépôt
  // (`cheminsDuDepot`). Absents ou illisibles, elle les garde tous.
  fichiersSuivis?: () => string[];
};

// Le préfixe du label par lequel un ticket demande une capacité.
export const PREFIXE_BESOIN = "needs:";

// Les capacités qu'un ticket demande, lues de ses seuls labels.
export const besoinsDuTicket = (labels: readonly string[]): string[] => labels.filter((label) => label.startsWith(PREFIXE_BESOIN)).map((label) => label.slice(PREFIXE_BESOIN.length));

export type StationGitHub = {
  // Un tour : relit et merge ce qui est en pass, puis prend ce que ses places
  // libres permettent et lance leurs cooks, sans les attendre.
  tour(): Promise<void>;
  // Les tickets que ses cooks cuisinent.
  enCuisine(): number[];
  // Attend que ses cooks en vol aient fini.
  calme(): Promise<void>;
  // Attend les relectures et les merges en cours, hors du tour (#2329).
  relu(): Promise<void>;
  // Le tour ne reprendra pas : ce qu'il tient chez l'arbitre est rendu.
  quitter?(): Promise<void>;
  // La station s'arrête, avant que ses cooks ne meurent avec elle : leurs
  // tickets sont rendus sans attente (#2543).
  arreter?(): void;
  // Sa mise à jour se relance à son échéance : le travail de ses cooks en vol
  // est sauvé sur leur branche, commité et poussé, pour que le cook suivant en
  // reparte (#2586). Rend les tickets sauvés.
  sauver?(): Promise<number[]>;
  // Posé par la boucle : le pass a bougé (#2333). Les `TOURS_PRESSES` tours
  // suivants viennent à `ATTENTE_PRESSEE_MS` au plus l'un de l'autre, le premier
  // tout de suite si `maintenant` (une livraison à relire).
  presser?: (maintenant?: boolean) => void;
};

// Les issues dont un corps dit dépendre : les numéros d'une ligne `Depends on
// #N` (un ou plusieurs, séparés par une virgule, `and` ou `&`).
export function dependancesDuCorps(corps: string): number[] {
  const numeros = new Set<number>();
  for (const [, liste = ""] of corps.matchAll(/^[ \t>*-]*Depends on[ \t]+(#\d+(?:[ \t]*(?:,|and|&)?[ \t]*#\d+)*)/gim)) {
    for (const [, numero] of liste.matchAll(/#(\d+)/g)) numeros.add(Number(numero));
  }
  return [...numeros];
}

// Après une livraison, un verdict ou une fusion tentée (mergée, branche mise à
// jour, CI qui tourne encore), la station tourne de nouveau dans les 30 s,
// quelques fois, puis reprend son intervalle (#2333). Un tour coûte 2 points
// GraphQL : seul un fait neuf presse, jamais un tour où rien n'a bougé.
export const TOURS_PRESSES = 4;
export const ATTENTE_PRESSEE_MS = 30_000;

const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));

// Ce qui juge une livraison : une PR qui y touche ne se merge qu'approuvée
// aussi par le second juge (#2555) — sa consigne comprise.
const JUGES = [".claude/brigade/", ".github/workflows/", "agents/second-juge.md"];
// Le label d'un ticket qui attend un geste du chef.
export const A_LA_MAIN = "blocked-on-human";

// Le rang d'un ticket dans l'ordre de service : le plus petit `prio:N` qu'il porte.
const rangDePriorite = (ticket: Pick<TicketLu, "labels">): number =>
  Math.min(Number.POSITIVE_INFINITY, ...ticket.labels.map((label) => /^prio:(\d+)$/.exec(label)?.[1]).filter((n) => n !== undefined).map(Number));

// Combien de cooks sans livraison, pour un même ticket, avant qu'il sorte de la cuisine.
export const ECHECS_MAX = 3;

// Au plus ce nombre de tickets récents reçoivent leur qualité à chaque merge (#2707).
export const RATTRAPAGE_PAR_MERGE = 10;

// Des gates qui n'ont pas pu se jouer sur une tête se retentent au plus tôt
// après ce délai (#2456).
export const RELANCE_DES_GATES_MS = 30 * 60_000;

// Combien de fois une livraison repart au cook avant de sortir de la cuisine.
export const RENVOIS_MAX = 2;

// Au plus cinq livraisons en pass : tant que le projet en compte autant, aucune
// station sur l'état GitHub seul ne prend de ticket neuf (#2300). Le pass se
// vide moins vite que les cooks livrent ; l'amas s'y relit à chaque tour et s'y
// met en conflit à chaque merge.
export const PASS_MAX = 5;

// Les tickets en pass : ceux qui portent `in-pass`, hors ceux que ce tour vient
// de renvoyer à un cook — la liste lue peut porter encore leur label.
export const enPass = (tickets: readonly Pick<TicketLu, "number" | "labels">[], renvoyes: ReadonlySet<number> = new Set()): number =>
  tickets.filter((ticket) => ticket.labels.includes(LABEL_IN_PASS) && !renvoyes.has(ticket.number)).length;
// Posée sur un renvoi pour conflit avec la base : il ne compte pas dans le budget des renvois (#2726).
const MARQUE_DE_CONFLIT = " conflit";

// Les commentaires de `marque` qui comptent pour le ticket : ceux d'après le
// dernier retrait de `hors-cuisine`, que GitHub date pour toutes les stations
// (#2430). Relancer un ticket remet à zéro ses renvois et ses cooks sans
// livraison. Des retraits illisibles ne remettent rien à zéro.
const depuisLeRelancement = async (github: Pick<GitHubDuTour, "retraitsDeLabels">, numero: number, commentaires: { body: string; createdAt: string }[], marque: string) => {
  const retraits = await github.retraitsDeLabels(numero).catch(() => []);
  const relance = Math.max(0, ...retraits.filter((r) => r.label === HORS_CUISINE).map((r) => Date.parse(r.createdAt)).filter((t) => !Number.isNaN(t)));
  return commentaires.filter((c) => c.body.startsWith(marque) && !(Date.parse(c.createdAt) <= relance));
};

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
const MARQUE_D_ATTENTE = "<!-- brigade:attente";

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

// Un arrêt que le cook n'a pas causé : le quota, la session Claude, une station
// arrêtée ou un process tué (un signal sans erreur du lanceur). Un plafond (jetons, durée, inactivité) est le sien.
const arretSubi = (conclusion: string, fin: { signal: string | null; arret: { reason: string } | null; erreur: string | null }): boolean => {
  if (conclusion === "86" || conclusion === "disconnected") return true;
  if (fin.arret !== null) return fin.arret.reason === "stop";
  return fin.erreur === null && fin.signal !== null;
};

export function stationGitHub(options: OptionsDeStation): StationGitHub {
  const { nom, places, base, github, prise, cuisiner, juger, gardes } = options;
  const avertir = options.avertir ?? ((texte: string) => console.error(texte));
  const capacites = new Set(options.capacites ?? []);
  const enVol = new Map<number, Promise<void>>();
  const ouvrirLaReparation = ouvreReparation({ github, base });
  // Le parcours de chaque ticket, de sa prise à son merge, phase par phase
  // (#2342), mesuré depuis son dépôt ou `fire`, que GitHub dit au merge (#2662).
  // Illisible, le temps part de la prise, et la station le dit.
  const chrono = chronometre(options.maintenant);
  // Le rapport de sa cuisson à son label `time:` s'écrit à côté (#2675).
  const servir = async (issue: number, labels: readonly string[]) => {
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
    const temps = chrono.servir(issue, depot);
    if (temps === null) return;
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
    await rattraperLesQualites(options.clone);
    await rattraperLesPrises(options.clone);
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
        ajouts.set(ticket, { qualite: qualiteDeLIssue({ corps, labels: shaDeBaseRouge(corps) === null ? [] : [PRIO_REPARATION], commentaires }) });
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
  const rattraperLesPrises = async (dossier: string) => {
    const lire = github.depotDuTicket;
    if (lire === undefined) return;
    const manquants = ticketsRecents(lesTempsDesTickets(dossier).enregistrements)
      .filter((t): t is EnregistrementTemps => t.priseAt === undefined && typeof t.claimedAt === "string" && typeof t.mergedAt === "string")
      .slice(-RATTRAPAGE_PAR_MERGE);
    const ajouts = new Map<number, EnregistrementTemps>();
    for (const t of manquants) {
      try {
        const depot = await lire(t.ticket);
        if (depot !== null) ajouts.set(t.ticket, rattraperLaPrise(t, depot.priseAt ?? null));
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
  const fermerLaReparation = fermeReparation({ github, base });
  // Les gestes de guérison du projet (#2757), joués à chaque tour.
  const { guerir } = ouvrirGuerison({ github, station: nom, base, avertir, ...(options.maintenant === undefined ? {} : { maintenant: () => (options.maintenant as () => Date)().getTime() }) });
  // La médiane des tickets récents au-dessus du max du projet ouvre son ticket
  // de correction, un seul à la fois (#2515) ; les temps se lisent dans le clone.
  const { clone } = options;
  // Devant elle, et devant l'alerte de la cuisson, la porte de qualité (#2680),
  // sur la qualité que les temps du clone portent (#2707) et son projet.json.
  const corrigerLeTemps =
    clone === undefined
      ? null
      : correctionDuTemps({
          github: options.depotServi === undefined ? github : routerLeTempsPerdu({ github, servi: options.depotServi, ...(options.githubDeLaBrigade === undefined ? {} : { brigade: options.githubDeLaBrigade }) }),
          lire: () => {
            const temps = lesTempsDesTickets(clone);
            return { ...temps, qualites: qualitesDesTemps(temps.enregistrements), projet: projetDuClone(clone) };
          },
          ...(options.maintenant === undefined ? {} : { maintenant: options.maintenant }),
        });
  // La médiane des rapports cuisson réelle / attendue au-dessus de
  // `cookingOverEstimateMax` ouvre son ticket de correction, un seul (#2676).
  // La porte de qualité la fait taire aussi : la qualité en défaut, c'est le
  // ticket de qualité, que la correction du temps ouvre, qui part (#2680).
  const alerteDeLaCuisson = clone === undefined ? null : alerteDuClone(clone, { github, avertir, ...(options.maintenant === undefined ? {} : { maintenant: options.maintenant }) });
  const alerterLaCuisson =
    alerteDeLaCuisson === null || clone === undefined
      ? alerteDeLaCuisson
      : async () => {
          const { enregistrements } = lesTempsDesTickets(clone);
          return qualiteEnDefaut(mesurerQualite(enregistrements, qualitesDesTemps(enregistrements), projetDuClone(clone))) ? null : alerteDeLaCuisson();
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
  // La station s'arrête (`arreter`) : ses cooks meurent avec elle.
  let arretee = false;
  // Les PR dont la fusion n'a pas abouti — GitHub a refusé le merge, ou la
  // mise à jour de la branche est demandée —, et ce qu'elles étaient alors :
  // leur tête, leur version et la base. Elle ne se retente qu'une fois l'une
  // d'elles changée (#2198) : une PR approuvée dont la CI tourne encore ne
  // coûte pas un merge refusé à chaque tour.
  const tentees = new Map<number, string>();
  // Les PR dont la CI était attendue, et ce qu'elles étaient alors : une CI
  // qui tourne presse les tours une fois par tête, pas à chaque tour (#2333).
  const attendues = new Map<number, string>();
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
  // Le terme de la dernière attente du ticket n'est pas passé. Illisibles, ses commentaires ne le retiennent pas.
  const enAttente = async (ticket: TicketLu): Promise<boolean> => {
    const derniere = (await github.commentaires(ticket.number).catch(() => [])).filter((c) => c.body.startsWith(MARQUE_D_ATTENTE)).pop();
    const terme = Number(/until=(\d+)/.exec(derniere?.body ?? "")?.[1]);
    return Number.isFinite(terme) && terme > instant();
  };

  // Le cook d'un ticket pris, jusqu'à sa livraison en pass ; sans livraison,
  // le ticket est rendu sur l'issue, et pourquoi s'y dit.
  const cuire = async (ticket: TicketLu, calibrage: Calibrage) => {
    const issue = ticket.number;
    // Le ticket est rendu sur l'issue sans livraison : sa place est libre.
    let liberee = false;
    try {
      let fait = await cuisiner(ticket, calibrage);
      if (fait.testsMs !== undefined) chrono.tests(issue, fait.testsMs);
      if ("branche" in fait) {
        chrono.marquer(issue, "attentePasse");
        // Un renvoi pousse sur la branche d'une PR encore ouverte : elle porte
        // déjà la livraison, il n'en faut pas une seconde.
        const ouverte = await github.prDuTicket(issue);
        let refusee: string | null = null;
        if (ouverte === null || ouverte.state !== "open") {
          // Une PR que GitHub refuse (422, tête introuvable…) n'est pas rejouée à
          // chaque tour : le ticket retourne à un cook avec le motif, et suit la
          // voie des échecs (#2610).
          try {
            await github.ouvrirPR({ branche: fait.branche, base, titre: `#${issue} — ${ticket.title}`, corps: `Closes #${issue}\n\nCooked by station \`${nom}\`.` });
          } catch (erreur) {
            if (erreur instanceof LimiteGitHubAtteinte) throw erreur;
            refusee = `GitHub refused the pull request of \`${fait.branche}\`: ${message(erreur)}`;
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
      // Bloqué n'est pas livré (#2073) : la question du cook va au chef, écrite
      // sur la carte, et le ticket est retenu par `blocked-on-human` jusqu'à sa
      // réponse. Relue, sa livraison partielle revenait rouge à un cook qui se
      // déclarait bloqué à son tour : 6 des 13 relectures bloquantes de
      // BOBL-tech/espace (#798 quatre fois, #755 deux fois) (#2805).
      if ("bloque" in fait) {
        const citee = fait.bloque.split("\n").map((ligne) => `> ${ligne}`).join("\n");
        avertir(`brigade : #${issue} sur ${nom} — the cook declared itself blocked: the ticket goes to the chef, not to review`);
        const pose = await poserALaMain({ github, repertoireEtat: options.repertoireEtat }, issue, `Station \`${nom}\`: the cook stopped, blocked — nothing it did goes to review. Its question:\n\n${citee}\n\nAnswer it on this issue, then remove \`${A_LA_MAIN}\`: a cook resumes the ticket from its branch.`);
        if (!pose.pose) avertir(`brigade : ${pose.echec}`);
        chrono.rater(issue);
        await prise.lacher({ number: issue, labels: [...ticket.labels, LABEL_TAKEN] });
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
      // attend, puis repart, sans `hors-cuisine` (#2508).
      if ("reste" in fait || "subi" in fait) {
        // Sa station s'arrête — une mise à jour la relance — et le cook meurt
        // avec elle. Rien n'est à attendre : la station relancée, ou une autre,
        // le reprend à son tour suivant. L'attente d'un arrêt subi l'en tenait
        // 30 min à l'écart ; relancée toutes les 35 à 45 min, la station tuait
        // le cook repris avant qu'il ne finisse, #2502 quatre fois (#2543).
        if ("subi" in fait && arretee) {
          avertir(`brigade : #${issue} sur ${nom} — the cook stopped with its station: ${fait.subi}`);
          await github.commenter(issue, `Station \`${nom}\`: the cook stopped with its station — ${fait.subi}\n\nThe station is stopping: the ticket is given back with no wait, for the next round of a station; this stop is not counted among the ticket's ${ECHECS_MAX} tries.`);
        } else if ("subi" in fait) {
          const demain = instant() + ATTENTE_MAX_MS;
          const reprise = Math.min(demain, Math.max(instant() + ATTENTE_MS, fait.retour?.getTime() ?? 0));
          avertir(`brigade : #${issue} sur ${nom} — the cook stopped without a delivery, through no fault of its own: ${fait.subi}`);
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
      // Compté depuis le dernier retrait de `hors-cuisine` (#2430).
      const precedents = await depuisLeRelancement(github, issue, await github.commentaires(issue).catch(() => []), MARQUE_D_ECHEC);
      const echecs = precedents.length + 1;
      // Hors cuisine après `ECHECS_MAX` arrêts de suite, ou dès que deux de suite ont le même motif (#2729).
      const motifDe = (corps: string) => corps.match(/ — ([^\n]*)/)?.[1] ?? "";
      const sortie = horsCuisine([...precedents.map((c) => ({ motif: motifDe(c.body), desaccord: false })), { motif: fait.echec, desaccord: false }]);
      avertir(`brigade : #${issue} sur ${nom} — the cook stopped without a delivery (try ${echecs}/${ECHECS_MAX}): ${fait.echec}`);
      await github.commenter(issue, `${MARQUE_D_ECHEC} n=${echecs} -->\nStation \`${nom}\`: the cook stopped without a delivery — ${fait.echec}${sortie ? `\n\nTaken off the kitchen (\`${HORS_CUISINE}\`) after ${echecs} cooks without a delivery: a human decides.` : ""}`);
      chrono.rater(issue);
      if (sortie) {
        chrono.oublier(issue);
        await github.labelliser(issue, [HORS_CUISINE]);
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
  // la station qui le prend reprend sa branche, sous sa PR. Au-delà de
  // `RENVOIS_MAX`, il sort de la cuisine (`hors-cuisine`) : un humain décide.
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
  const renvoyer = async (ticket: TicketLu, sha: string, raison: string, fois = 1, genre: "conflict" | "red CI" | "review" = "review", resynchroniser?: () => Promise<boolean>) => {
    const tous = (await github.commentaires(ticket.number)).filter((c) => c.body.startsWith(MARQUE_DE_RENVOI));
    // Compté depuis le dernier retrait de `hors-cuisine` (#2430).
    const tousRenvois = await depuisLeRelancement(github, ticket.number, tous, MARQUE_DE_RENVOI);
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
    const deja = renvois.length;
    const marque = genre === "conflict" ? MARQUE_DE_CONFLIT : "";
    if (deja >= RENVOIS_MAX && resynchroniser !== undefined && (await resynchroniser())) {
      // La base a bougé depuis : la synchro passe, la PR n'est plus en conflit.
      if (ticket.labels.includes(LABEL_IN_PASS)) await github.delabelliser(ticket.number, LABEL_IN_PASS);
      return;
    }
    if (deja >= RENVOIS_MAX && genre !== "conflict") {
      await github.commenter(ticket.number, `${MARQUE_DE_RENVOI} n=${tousRenvois.length + 1} sha=${sha}${marque} -->\nStation \`${nom}\`: still not mergeable after ${deja} sends back — ${raison}\n\nBlocking reason: ${genre}\nTaken off the kitchen (\`${HORS_CUISINE}\`): a human decides.`);
      await github.labelliser(ticket.number, [HORS_CUISINE]);
      chrono.oublier(ticket.number);
    } else {
      await github.commenter(ticket.number, `${MARQUE_DE_RENVOI} n=${tousRenvois.length + 1} sha=${sha}${marque} -->\nStation \`${nom}\`: sent back to a cook (${genre === "conflict" ? `${deja + 1}, conflicts` : `${deja + 1}/${RENVOIS_MAX}`}) — ${raison}`);
    }
    await github.delabelliser(ticket.number, LABEL_IN_PASS);
    renvoyes.add(ticket.number);
    // De retour en cuisine : le temps jusqu'au cook suivant est celui du renvoi (#2662).
    if (deja < RENVOIS_MAX) chrono.marquer(ticket.number, "renvoi");
  };

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

  // Une base rouge relance d'abord ses jobs en échec, une fois (#2323).
  const relancerLaBase = relanceDeLaBase(github, avertir, nom);

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
    const suite = serieDesGates.then(() => jouerLesGatesDeLaTete(pr.sha, { github: { statuts: statuts.bind(github), poserStatut: poserStatut.bind(github) }, station: nom, preparer: () => preparer(ticket, pr), maintenant: instant }));
    serieDesGates = suite.catch(() => undefined);
    let fait: Awaited<typeof suite>;
    try {
      fait = await suite;
    } catch (erreur) {
      return ecarter(message(erreur));
    }
    if (fait.issue === "non-jouees") return ecarter(fait.motif);
    if (fait.issue === "tenues") sansGates.set(pr.number, { sha: pr.sha, jusqua: fait.jusqua });
    if (fait.issue !== "jouees") return false;
    if (!fait.verdict.vert) {
      await github.commenter(ticket.number, `Station \`${nom}\` ran the project's gates on \`${pr.sha.slice(0, 7)}\` (PR #${pr.number}) — no CI runs on this project's PRs — and they are red.${fait.verdict.detail === "" ? "" : `\n\n${fait.verdict.detail}`}`);
    }
    return true;
  };

  const tour = async () => {
    renvoyes.clear();
    const checksDeLaBase = await relancerLaBase(await github.checksDeLaBase());
    // Rouge après sa relance, la base a son ticket de réparation : un seul par commit (#2339).
    const { erreur } = await ouvrirLaReparation(checksDeLaBase);
    if (erreur !== undefined) avertir(`brigade : ${base} is red but its repair ticket could not be opened on ${nom} — ${erreur}`);
    // La guérison (#2757) : un geste qui échoue est dit, et ne retient ni les
    // autres ni le tour. Le tour lit les tickets tels qu'elle les laisse.
    const { tickets: lus } = await guerir(await github.fires(), new Set(enVol.keys()));
    await options.redeposer?.(lus.filter((ticket) => ticket.labels.includes(HORS_CUISINE))).catch((echec) => avertir(`brigade : a hors-cuisine lost-time ticket could not be re-filed on ${nom} — ${message(echec)}`));
    await Promise.all([
      corrigerLeTemps?.(lus.map((ticket) => ticket.number)).catch((echec) => avertir(`brigade : the median lost time per ticket is over the threshold but its correction ticket could not be opened on ${nom} — ${message(echec)}`)),
      alerterLaCuisson?.().catch((echec) => avertir(`brigade : the median cooking ratio is over cookingOverEstimateMax but its correction ticket could not be opened on ${nom} — ${message(echec)}`)),
    ]);
    // Verte, ses tickets de réparation encore ouverts se ferment (#2340) ; un échec attend le tour suivant.
    await fermerLaReparation(checksDeLaBase, lus).catch((echec) => avertir(`brigade : ${base} is green but its repair ticket could not be closed on ${nom} — ${echec instanceof Error ? echec.message : String(echec)}`));
    // Une épique découpée garde `fire` et sa `prio:` : ni elle ne se prend, ni
    // elle ne compte parmi les tickets du tour (#2618).
    const tickets = lus.filter((ticket) => !ticket.labels.includes(HORS_CUISINE) && ticket.epique !== true);
    const libres: TicketLu[] = [];
    // Les PR ouvertes, lues au premier besoin, une fois par tour.
    let ouvertes: Awaited<ReturnType<GitHubDuTour["prsOuvertes"]>> | null = null;
    for (const ticket of tickets) {
      const enPass = ticket.labels.includes(LABEL_IN_PASS);
      const pr = enPass ? await github.prDuTicket(ticket.number) : null;
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
        // Le `blocked-on-human` qu'un tour d'avant #2555 y posait n'a plus
        // d'objet : le second juge en décide.
        if (juges.length > 0 && ticket.labels.includes(A_LA_MAIN)) await github.delabelliser(ticket.number, A_LA_MAIN);
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
          const tentee = JSON.stringify([pr.sha, pr.version ?? null, checksDeLaBase]);
          if (tentees.get(pr.number) !== tentee) {
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
                    chrono.marquer(ticket.number, "merge");
                    return github.merger(numero, sha);
                  },
                },
                { ciDesPR: ciDesPR(sienne) },
              ),
            );
            const attendue = fusion.issue === "ci-attendue" || fusion.issue === "gates-a-jouer";
            if (attendue || fusion.issue === "mise-a-jour") chrono.marquer(ticket.number, "ci");
            if (fusion.issue === "mergee") {
              mergee = true;
              await servir(ticket.number, ticket.labels);
              await cloreLeServi(ticket);
            }
            // Hors de la série des merges : des gates de plusieurs minutes ne retiennent pas les autres.
            if (fusion.issue === "gates-a-jouer" && (await jouerLesGates(ticket, pr))) bouge = true;
            if (attendue) {
              if (attendues.get(pr.number) !== tentee) bouge = true;
              attendues.set(pr.number, tentee);
            } else {
              attendues.delete(pr.number);
              if (fusion.issue !== "non-approuvee" && fusion.issue !== "close") bouge = true;
            }
            if (fusion.issue === "refusee" || fusion.issue === "mise-a-jour") tentees.set(pr.number, tentee);
            else tentees.delete(pr.number);
            if (fusion.issue === "refusee") avertir(`brigade : merge of #${ticket.number} on ${nom} refused by GitHub — ${fusion.motif}; retried once its PR or the base changes`);
            // Rouge : la livraison repart à un cook, avec pourquoi (#2209).
            if (fusion.issue === "ci-rouge") await renvoyer(ticket, pr.sha, `${RAISONS_DE_RENVOI.ci} \`${pr.sha.slice(0, 7)}\`: ${(await github.ci(pr.sha)).filter((c) => c.outcome === "red").map((c) => c.name).join(", ")}`, 1, "red CI");
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
      // `blocked-on-human` le retient : il attend la réponse du chef (#2805).
      if (etat === null && !enPass && !ticket.labels.includes(LABEL_TAKEN) && !ticket.labels.includes(A_LA_MAIN)) libres.push(ticket);
      // Au premier tour, un `taken` sans cook ici est peut-être une prise
      // qu'un runtime d'avant a laissée : `lacher` ne rend que si c'est la sienne.
      if (premierTour && ticket.labels.includes(LABEL_TAKEN) && !enPass && !enVol.has(ticket.number)) aRendre.set(ticket.number, ticket);
      // À chaque tour, un `taken` que personne ne tient — le retrait d'un
      // lâcher a échoué, ici ou sur une autre station — perd son label : le
      // ticket redevient libre au tour suivant. Un ticket en pass, en vol ici
      // ou déjà à rendre n'est pas un orphelin.
      if (ticket.labels.includes(LABEL_TAKEN) && !enPass && !enVol.has(ticket.number) && !aRendre.has(ticket.number)) {
        try {
          await prise.purger?.(ticket);
        } catch (erreur) {
          avertir(`brigade : purge du \`taken\` de #${ticket.number} sur ${nom} — ${message(erreur)}`);
        }
      }
    }
    premierTour = false;
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
    // Les tickets pris à ce tour : la liste lue ne porte pas encore leur `taken`.
    const prisCeTour = new Set<number>();
    const zoneDuTicket = (numero: number): Promise<string[]> => {
      const deja = zones.get(numero);
      if (deja !== undefined) return deja;
      const lue = (async () => {
        const [corps, commentaires] = await Promise.all([github.corpsDuTicket(numero), github.commentaires(numero).catch(() => [])]);
        const laFiche = fiche(commentaires.map(({ body }) => body));
        const declaree = [...new Set([...zoneDuCorps(corps), ...(laFiche === null || laFiche.problems.length > 0 ? [] : laFiche.zone.map(normalise))])];
        if (declaree.length > 0 || (laFiche?.problems.length ?? 0) > 0 || corps.startsWith("<!-- brigade:")) return declaree;
        const nommes = [...new Set(fichiersDuCorps(corps))];
        const suivis = fichiersSuivisDuTour();
        return suivis === null ? nommes : cheminsDuDepot(nommes, suivis);
      })();
      zones.set(numero, lue);
      return lue;
    };
    // Une zone tenue : un de ses chemins en recoupe un que change une PR
    // ouverte qui n'est pas celle du ticket, ou un de la zone d'un ticket en
    // cuisson, ici ou sur une autre station — un cook tient sa zone avant
    // d'avoir sa PR (#2741).
    const tenue = async (ticket: TicketLu): Promise<string | null> => {
      const zone = await zoneDuTicket(ticket.number);
      if (zone.length === 0) return null;
      ouvertes ??= await github.prsOuvertes();
      const propre = brancheDuTicket(ticket.number);
      const pr = ouvertes.find((ouverte) => ouverte.branche !== propre && ouverte.fichiers.some((fichier) => zone.some((entree) => secoupent(entree, fichier))));
      if (pr !== undefined) return pr.branche;
      for (const autre of tickets) {
        if (autre.number === ticket.number || !(autre.labels.includes(LABEL_TAKEN) || enVol.has(autre.number) || prisCeTour.has(autre.number))) continue;
        const sienne = await zoneDuTicket(autre.number).catch(() => []);
        if (sienne.some((chemin) => zone.some((entree) => secoupent(entree, chemin)))) return brancheDuTicket(autre.number);
      }
      return null;
    };
    // Le premier des tickets que la fiche du ticket attend qui soit mis de côté
    // (`hors-cuisine`, `blocked-on-human`), avec la ligne de raison de son départ.
    const attenduMisDeCote = async (ticket: TicketLu): Promise<{ attendu: number; raison: string } | null> => {
      const commentaires = await github.commentaires(ticket.number);
      for (const attendu of fiche(commentaires.map(({ body }) => body))?.waitsFor ?? []) {
        const lu = lus.find(({ number }) => number === attendu);
        const label = [HORS_CUISINE, A_LA_MAIN].find((candidat) => lu?.labels.includes(candidat));
        if (label === undefined) continue;
        // Le dernier mot de la station sur ce ticket : la ligne qui suit sa marque.
        const dernier = (await github.commentaires(attendu)).map(({ body }) => body).filter((body) => body.startsWith(MARQUE_D_ECHEC) || body.startsWith(MARQUE_DE_RENVOI)).at(-1);
        const ligne = dernier?.split("\n").slice(1).find((l) => l.trim() !== "")?.trim();
        return { attendu, raison: ligne ?? `labelled \`${label}\`` };
      }
      return null;
    };
    // Les plus prioritaires d'abord (`prio:0` avant `prio:1`…, sans `prio:` en
    // dernier), puis les plus anciens (#2209).
    libres.sort((x, y) => rangDePriorite(x) - rangDePriorite(y) || x.number - y.number);
    for (const ticket of libres) {
      if (enVol.size + aRendre.size >= places) break;
      // Le pass est plein : aucun ticket neuf ne se prend avant qu'il ne redescende.
      if (enPass(tickets, renvoyes) >= PASS_MAX) break;
      if (enVol.has(ticket.number)) continue;
      // Sa PR est déjà approuvée par son dernier verdict : elle n'a rien à
      // reprendre, ses remarques sont closes. Le ticket retourne au pass, quels
      // que soient ses labels, et le merge suit quand la CI est verte (#2622).
      // Illisible, la PR ne se devine pas : le ticket ne part pas à un cook.
      try {
        const sienne = await github.prDuTicket(ticket.number);
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
        options.sauter?.(ticket.number, direSaut(ticket.number, `capability missing on this station: ${manques.join(", ")}`));
        continue;
      }
      // Un ticket sans calibrage complet ne part pas, (#2213).
      const calibrage = calibrageDesLabels(ticket.labels);
      if (!complet(calibrage)) {
        options.sauter?.(ticket.number, direSaut(ticket.number, "its calibration (model, effort) is incomplete"));
        continue;
      }
      // Il attend un ticket que la cuisine a mis de côté : il ne part pas, et le dit.
      // Sans lecture de GitHub, la remise du ticket au cook dira pourquoi il ne part pas.
      const misDeCote = await attenduMisDeCote(ticket).catch(() => null);
      if (misDeCote !== null) {
        options.sauter?.(ticket.number, direAttenteSurMisDeCote(ticket.number, misDeCote.attendu, misDeCote.raison));
        continue;
      }
      // Une dépendance ouverte retient le ticket ; sans lecture de GitHub, il attend aussi.
      try {
        if ((await github.dependancesOuvertes(ticket.number)).length > 0) continue;
      } catch (erreur) {
        avertir(`brigade : dépendances de #${ticket.number} sur ${nom} — ${message(erreur)}`);
        continue;
      }
      // Un arrêt subi l'a mis en attente : il n'est pas repris avant son terme (#2508).
      if (await enAttente(ticket)) continue;
      // Tous ses fichiers sont sous `.claude/brigade/` : la session d'un cook y
      // refuse l'écriture, il va au second ou au chef sans cook (#2729).
      try {
        // Un ticket qui porte déjà `blocked-on-human` n'est pas libre : il n'arrive ici qu'une fois.
        if (neLivreQueSousBrigade(await github.corpsDuTicket(ticket.number))) {
          avertir(`brigade : #${ticket.number} sur ${nom} — every file it delivers is under \`${SOUS_BRIGADE}\`; not launched to a cook`);
          await github.commenter(ticket.number, `Station \`${nom}\`: every file this ticket delivers is under \`${SOUS_BRIGADE}\`, where a cook's session refuses writes, so it is not launched to a cook.\n\nQuestion for the second or the chef: deliver it from a local worktree, or give the cook a way to write there?`);
          await github.labelliser(ticket.number, [A_LA_MAIN]);
          continue;
        }
      } catch (erreur) {
        avertir(`brigade : corps de #${ticket.number} sur ${nom} — ${message(erreur)}`);
      }
      // Sa zone est tenue par une PR ouverte : il attend qu'elle soit mergée ou fermée.
      const tenant = await tenue(ticket);
      if (tenant !== null) {
        const numeroDuTenant = /^cook\/(\d+)-/.exec(tenant)?.[1];
        options.sauter?.(ticket.number, direSaut(ticket.number, `zone held by ${numeroDuTenant === undefined ? `the open PR on ${tenant}` : `#${numeroDuTenant}`}`));
        continue;
      }
      // Un garde-fou retient la cuisine : ni ce ticket ni un autre ne se prend.
      if (gardes !== undefined && (await gardes.retenue(enVol.size)) !== null) break;
      let pris: { prise: boolean };
      try {
        pris = await prise.prendre(ticket);
      } catch (erreur) {
        // La prise a pu partir avant le refus : le ticket est à rendre, et le tour s'arrête là.
        aRendre.set(ticket.number, ticket);
        throw erreur;
      }
      if (!pris.prise) continue;
      prisCeTour.add(ticket.number);
      chrono.prendre(ticket.number);
      enVol.set(ticket.number, cuire(ticket, calibrage));
    }
    await gardes?.redire(enVol.size);
  };

  const station: StationGitHub = {
    tour,
    arreter: () => {
      arretee = true;
    },
    enCuisine: () => [...enVol.keys()],
    relu: async () => {
      while (enRelecture.size > 0) await Promise.all(enRelecture.values());
    },
    calme: async () => {
      while (enVol.size > 0 || enRelecture.size > 0) await Promise.all([...enVol.values(), ...enRelecture.values()]);
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
export type ProjetOuvert = { arreter(): Promise<void>; enCuisine(): number[]; sauver?(): Promise<number[]>; presser?(): void; refus?: string };

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
      try {
        await station.tour();
      } catch (erreur) {
        // La pause de GitHub est dite une fois au journal, pas à chaque tour (#2436).
        if (!estLaPauseDeGitHub(erreur)) avertir(`brigade : tour GitHub seul — ${message(erreur)}`);
      }
      enTour = false;
      const delai = demande === 0 ? 0 : presses > 0 ? presseeMs : intervalleMs;
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
    // Les tickets que ses cooks cuisinent : ce qu'une mise à jour attend (#2189).
    enCuisine: () => station.enCuisine(),
    sauver: async () => (await station.sauver?.()) ?? [],
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
  const { teteDeLaBase } = github;
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
  const prDeLInstantane = (issue: number) => instantane?.prs.find((pr) => pr.branche === brancheDuTicket(issue));
  return {
    checksDeLaBase: async () => {
      if (parGraphql === null) return github.ci(base);
      try {
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
    dependancesOuvertes: async (numero) => {
      const dependances = dependancesDuCorps((await github.issue(numero))?.body ?? "").filter((dependance) => dependance !== numero);
      const etats = await Promise.all(dependances.map(async (dependance) => (await github.issue(dependance))?.state));
      return dependances.filter((_, rang) => etats[rang] === "open");
    },
    // Une PR ouverte se lit dans l'instantané ; une PR mergée ou fermée n'y est
    // pas, et se lit en REST — ce qui n'arrive qu'une fois par ticket.
    prDuTicket: async (issue) => {
      const lue = prDeLInstantane(issue);
      if (lue === undefined) return github.prDeBranche(brancheDuTicket(issue));
      return { number: lue.number, url: "", base, sha: lue.sha, state: "open", merged: false, enRetard: lue.enRetard, ...(lue.enConflit ? { enConflit: true } : {}), mergeePar: null, version: lue.version };
    },
    // Lue seulement quand la base est rouge : sans elle, le ticket de réparation
    // ne s'ouvre pas et le tour le dit.
    teteDeLaBase: async () => {
      if (teteDeLaBase === undefined) throw new Error("this GitHub client cannot read the head of the integration branch");
      return teteDeLaBase.call(github, base);
    },
    issuesDepuis: (instant) => github.issuesDepuis(instant),
    creerIssue: (issue) => github.creerIssue(issue),
    fermerIssue: (numero) => github.fermerIssue(numero),
    journalDuCheck: (check) => github.journalDuCheck(check),
    ci: async (sha) => {
      const lue = instantane?.prs.find((pr) => pr.sha === sha);
      return lue === undefined || lue.ciIncomplete ? github.ci(sha) : lue.ci;
    },
    corpsDuTicket: async (issue) => (await github.issue(issue))?.body ?? "",
    issue: (numero) => github.issue(numero),
    depotDuTicket: async (issue) => {
      const lue = await github.issue(issue);
      if (lue === null) return null;
      const [[fireAt = null] = [], commentaires] = await Promise.all([github.posesDeFire?.(issue), github.commentaires(issue)]);
      // Sa prise, que la station qui merge n'a pas vue si une autre l'a prise ou si elle a redémarré depuis (#2732).
      return { deposeAt: lue.createdAt, fireAt, priseAt: premierePrise(commentaires, fireAt ?? lue.createdAt) };
    },
    // Des PR ou des fichiers que la requête a tronqués ou mal rendus (un renommage
    // perd son ancien chemin) : tout se relit en REST, pour ne rien juger de moins.
    prsOuvertes: async () => (instantane !== null && !instantane.prsTronquees && !instantane.prs.some((pr) => pr.fichiersIncomplets) ? instantane.prs.map(({ branche, fichiers }) => ({ branche, fichiers })) : (await prsOuvertes.call(github)).map(({ branche, fichiers }) => ({ branche, fichiers }))),
    // GitHub rend les commentaires dans l'ordre où il les a reçus : leur rang
    // départage, comme leur id, deux commentaires de la même seconde.
    commentaires: async (numero) => (await github.commentaires(numero)).map((lu, rang) => ({ id: rang + 1, body: lu.body, association: lu.association, createdAt: lu.createdAt })),
    commenter: (numero, corps) => github.commenter(numero, corps),
    retraitsDeLabels: (numero) => retraitsDeLabels.call(github, numero),
    etatDuRun: (run) => github.etatDuRun(run),
    relancerLesEchecs: (run) => github.relancerLesEchecs(run),
    mettreAJour: (numero, sha) => mettreAJour.call(github, numero, sha),
    ...(github.statuts === undefined || github.poserStatut === undefined ? {} : { statuts: github.statuts.bind(github), poserStatut: github.poserStatut.bind(github) }),
    merger: (numero, sha) => github.merger(numero, sha),
    labelliser: (numero, labels) => github.labelliser(numero, labels),
    delabelliser: (numero, label) => github.delabelliser(numero, label),
    ouvrirPR: (pr) => github.ouvrirPR(pr),
  };
}

// Un lancement de `claude` sous supervision : le cook, ou le reviewer.
// `flux` rendu : là où son flux s'est écrit, s'il ne l'a pas été où demandé.
export type Lancer = (lancement: Lancement & { cwd: string; env: NodeJS.ProcessEnv; flux: string }) => Pick<Supervise, "fin"> & { flux?: string };

export type OptionsDuDepot = {
  nom: string;
  places: number;
  base: string;
  // L'heure de la station ; les tests la fixent.
  maintenant?: () => Date;
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
  depot: Pick<Depot, "preparer" | "reprendre" | "connait" | "retirer" | "ranger" | "pousser" | "commits" | "changes" | "diff"> & Partial<Pick<Depot, "tete" | "livree" | "vue" | "fichiers" | "lire" | "recolter" | "sujet">>;
  // La prise de #2056, liée à la station.
  prise: (github: GitHubDuTour, station: string) => Prise;
  claude: string;
  env: NodeJS.ProcessEnv;
  cloison: Cloison | null;
  // Le bac à sable de Claude Code, quand la cuisine est sur le poste du chef.
  bacASable?: BacASableLocal | null;
  plafonds: Plafonds;
  graceMs: number;
  reviewer: Calibrage;
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
  // Ce qui regarde le tour par son client GitHub, sans rien y changer : la
  // retenue de la cuisine (`retenue/tour.ts`).
  observer?: (github: GitHubDuTour) => GitHubDuTour;
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
  sauter?: (ticket: number, ligne: string) => void;
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
export function verdictDesGates(gates: Gates, delaiMs: number): VerdictDesGates {
  const vert = gates.outcome === "green";
  const resume = vert ? "" : gates.outcome === "timeout" ? `stopped after ${Math.round(delaiMs / 1000)} s` : (gates.failures[0] ?? `exit code ${gates.code ?? "none"}`);
  if (vert) return { vert, resume, detail: "" };
  const echecs = gates.failures.map((ligne) => `- \`${ligne.replace(/`/g, "'")}\``);
  const fin = gates.tail === "" ? [] : ["", "The end of their output:", "", "```", gates.tail.replace(/```/g, "'''"), "```"];
  return { vert, resume, detail: [gates.outcome === "timeout" ? `They were stopped after ${Math.round(delaiMs / 1000)} s.` : `They exited with code ${gates.code ?? "none"}.`, ...(echecs.length === 0 ? [] : ["", ...echecs]), ...fin].join("\n") };
}

const lireLeFlux = (fichier: string) => lireFlux(existsSync(fichier) ? readFileSync(fichier, "utf8") : "");

// La station GitHub seul de ce runtime, ou pourquoi elle ne peut pas tourner.
export function stationDuDepot(options: OptionsDuDepot): StationGitHub | { refus: string } {
  if (!/^[A-Za-z0-9._/-]+$/.test(options.nom)) return { refus: `the station name ${JSON.stringify(options.nom)} cannot sign a claim or a verdict` };
  if (options.github.retraitsDeLabels === undefined) return { refus: "the GitHub client cannot read the label removals of an issue" };
  if (options.github.mettreAJour === undefined) return { refus: "the GitHub client cannot update a branch" };
  if (options.github.prsOuvertes === undefined) return { refus: "the GitHub client cannot list the files of the open PRs" };
  const { nom, base, depot, depotGitHub, cloison } = options;
  const avertir = options.avertir ?? ((texte: string) => console.error(texte));
  mkdirSync(options.flux, { recursive: true });
  const lancer: Lancer = options.lancer ?? options.gardes?.lancer ?? (({ commande, args, cwd, env, flux }) => superviser({ commande, args, cwd, env, plafonds: options.plafonds, graceMs: options.graceMs, flux }));
  // Le cook n'a besoin d'aucun `gh` : son ticket lui est remis dans sa
  // consigne, et la station pousse sa branche et ouvre sa PR. Rien ne fait
  // donc parler son `gh` au nom du chef (`bac-a-sable/hors-github.ts`).
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

  const ciDesPR = lecteurDeLaCiDesPR(depot, base);

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
    if (!aDesGates(worktree)) return refus(`the project has no \`${SCRIPT_GATES}\`: with no CI either, nothing would judge this delivery`);
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

  // Le worktree de chaque cook en vol, et ceux dont le travail est sauvé avant
  // une relance : leur branche reste, même neuve, quand le cook meurt (#2586).
  const lieuxEnVol = new Map<number, { worktree: string; branche: string }>();
  const sauves = new Set<number>();
  const sauver = async (): Promise<number[]> => {
    if (depot.recolter === undefined) return [];
    const faits: number[] = [];
    for (const [numero, { worktree, branche }] of lieuxEnVol) {
      try {
        depot.recolter(worktree, branche, SUJET_DE_SAUVEGARDE, true);
        depot.pousser(branche);
        sauves.add(numero);
        faits.push(numero);
        avertir(`brigade : #${numero} sur ${nom} — the cook's work is saved on \`${branche}\` before the station restarts: the next cook starts from it`);
      } catch (erreur) {
        avertir(`brigade : #${numero} sur ${nom} — the cook's work could not be saved on \`${branche}\` before the station restarts: ${message(erreur)}`);
      }
    }
    return faits;
  };
  const cuisiner: Cuisiner = async (ticket, calibrage) => {
    try {
      return await cuisinerLeTicket(ticket, calibrage);
    } finally {
      lieuxEnVol.delete(ticket.number);
      sauves.delete(ticket.number);
    }
  };
  const cuisinerLeTicket: Cuisiner = async (ticket, calibrage) => {
    const run = runDuTicket(ticket.number);
    // Le ticket, lu ici : dans le bac à sable, le `gh` du cook n'a aucun
    // identifiant, et `gh issue view` lui serait refusé.
    let joint: string;
    try {
      const [lue, commentaires] = await Promise.all([options.github.issue(ticket.number), options.github.commentaires(ticket.number)]);
      if (lue === null) throw new Error("the issue no longer exists");
      joint = ticketJoint({ number: ticket.number, title: lue.title, body: lue.body ?? "", commentaires });
    } catch (erreur) {
      const dit = `its ticket could not be read on GitHub: ${message(erreur)}`;
      return erreur instanceof LimiteGitHubAtteinte ? { subi: dit } : { echec: dit };
    }
    let lieu: { worktree: string; branche: string };
    // Le run d'un ticket est toujours le même : la branche d'un cook précédent
    // (livrée, ou refusée par la pass) est encore là, et `preparer` ne sait pas
    // la recréer. Le cook en repart, comme d'un renvoi — et elle n'est pas à
    // jeter s'il échoue : elle porte une livraison.
    const reprise = depot.connait(brancheDuTicket(ticket.number));
    try {
      lieu = reprise ? { worktree: await depot.reprendre(run, brancheDuTicket(ticket.number)), branche: brancheDuTicket(ticket.number) } : await depot.preparer(run);
    } catch (erreur) {
      return { echec: `its worktree could not be prepared: ${message(erreur)}` };
    }
    const { worktree, branche } = lieu;
    lieuxEnVol.set(ticket.number, lieu);
    // La tête que le cook reprend : s'il n'y ajoute rien, il n'a rien livré
    // (#2372) — sans quoi la pass ressort une tête déjà renvoyée, et le ticket
    // boucle entre elle et les cooks sans qu'aucun échec ne compte.
    const avant = reprise && depot.tete !== undefined ? depot.tete(branche) : null;
    // La PR de cette branche, si elle est encore ouverte et qu'elle ne se merge
    // pas : en conflit avec la base, ou rouge. Le cook doit la remettre à jour (#2454).
    let resteAFaire: string | null = null;
    // Ses checks rouges : ce qu'ils disent est remis au cook (#2545).
    let rouges: Check[] = [];
    // La branche n'a jamais eu de PR : sa livraison n'est jamais arrivée en pass (#2577).
    let sansPR = false;
    // Ce que la livraison renvoyée laisse au cook : remarques, checks rouges, diff (#2590).
    let renvoi: Renvoi | null = null;
    // La PR ouverte que le cook reprend : il peut y répondre aux remarques (#2592).
    let prOuverte: number | null = null;
    if (reprise) {
      try {
        const ouverte = await options.github.prDeBranche(branche);
        sansPR = ouverte === null;
        if (ouverte !== null && ouverte.state === "open") {
          prOuverte = ouverte.number;
          if (ouverte.enConflit === true) resteAFaire = `PR #${ouverte.number} conflicts with \`${base}\``;
          else {
            const checks = await options.github.ci(ouverte.sha);
            if (etatDeLaBase(checks) === "red") {
              resteAFaire = `the CI of PR #${ouverte.number} is red`;
              rouges = checks.filter((check) => check.outcome === "red");
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
    // son essai comptait pour un échec, trois fois jusqu'à `hors-cuisine` (#2577).
    // Une tête qui sauve le travail d'un cook coupé par une relance n'est pas
    // une livraison : un cook la reprend (#2586).
    const sauvee = reprise && estUneSauvegarde(depot.sujet?.(branche));
    if (sauvee) joint += `\n\n## Work saved before a restart\n\nThe previous cook on this ticket stopped before delivering: its station restarted for an update, or it declared itself blocked and the chef has answered on this issue. Its work in progress is committed on this branch (last commit: \`${SUJET_DE_SAUVEGARDE}\`). Read what it did (\`git log\`, \`git show HEAD\`) and continue from where it stopped, do not start over.`;
    if (sansPR && !sauvee && avant !== null && depot.livree !== undefined) {
      const livree = depot.livree(branche);
      // `livree` rend la branche locale quand l'origine n'a pas la sienne
      // (`reprendre` vient de relire l'origine) : elle n'est alors pas poussée,
      // quoi que dise le clone (#2610). Elle part d'abord sur GitHub ; si le push
      // échoue, un cook la reprend.
      let surGitHub = livree !== branche;
      if (!surGitHub && depot.commits(branche) > 0) {
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
    if (resteAFaire !== null) {
      joint += `\n\n## Work left on the delivery\n\n${resteAFaire}. Bring the branch up to date with \`origin/${base}\` (\`git fetch origin ${base}\`, then rebase or merge), resolve the conflicts, fix what is red, run the gates and commit. If the old branch cannot be saved, start again from \`origin/${base}\` and redo the work. Adding nothing is not an option.`;
    } else if (prOuverte !== null) joint += `\n\n${consigneDuDesaccord(prOuverte)}`;
    const brief = briefDuRenvoi(renvoi, base);
    if (brief !== "") joint += `\n\n${brief}`;
    // Le worktree rendu prêt avant que le cook n'y entre (#2535) : sans ses
    // dépendances, ses premières gates sortaient rouges — contrôle de types
    // injouable —, et il les rejouait après le setup. Le setup part sans le
    // jeton de Claude, comme les gates ; ce qu'il exporte vaut pour le cook.
    // En échec, le cook part comme avant, dans le worktree tel quel.
    let envDuCook = sansJeton();
    if (options.setup !== undefined) {
      const setup = await jouerSetup({ worktree, ticket: ticket.number, env: envDuCook, delaiMs: options.setup.delaiMs, interdites: interditesAuSetup, cloison, signal: abandon.signal });
      if (abandon.signal.aborted) {
        depot.retirer(worktree, reprise || sauves.has(ticket.number) ? undefined : branche);
        return { subi: "the station stopped during the worktree setup" };
      }
      if (setup.pret) envDuCook = setup.env;
      else avertir(`brigade : #${ticket.number} sur ${nom} — \`${SCRIPT_SETUP}\` failed (${setup.depasse ? `stopped after ${Math.round(options.setup.delaiMs / 1000)} s` : `exit code ${setup.code ?? "none"}`}): the cook starts in its worktree as is`);
    }
    const flux = join(options.flux, `${run}.flux.jsonl`);
    const texte = consigne({ ticket: ticket.number, titre: ticket.title, depot: depotGitHub, base, joint });
    const lancement = envelopper(cloison, { commande: options.claude, args: dansLeBacASableLocal(options.bacASable, argumentsClaude(texte, calibrage), worktree) }, { cwd: worktree, depot: "ecriture" });
    const lance = lancer({ ...lancement, cwd: worktree, env: env(envDuCook), flux });
    const fin = await lance.fin;
    const conclusion = fin.arret !== null ? `guard:${fin.arret.reason}` : verdict(lireLeFlux(lance.flux ?? flux), fin.code);
    if (conclusion !== "done") {
      depot.retirer(worktree, reprise || sauves.has(ticket.number) ? undefined : branche);
      const dit = direLaFin({ conclusion, fin, flux: lance.flux ?? flux });
      return arretSubi(conclusion, fin) ? { subi: dit, retour: lireLeFlux(lance.flux ?? flux).quota?.retour ?? null } : { echec: dit };
    }
    const arretDuCook = () => ({ message: lireLeFlux(lance.flux ?? flux).message ?? null, turns: fin.turns, code: fin.code });
    // Le cook déclare la décision ou la condition qui lui manque (#2073) : ce
    // qu'il a commité n'est pas une livraison, et ne part pas en pass (#2805).
    // Lu dans tout son dernier message : sur #755, un cook l'a écrit après son
    // `</livrable>`. Sans PR, sa branche garde la marque de travail sauvé
    // (#2586) : le cook qui reprend le ticket en repart, au lieu que la pass la
    // juge telle quelle (#2577).
    const question = lireBlocage(lireLeFlux(lance.flux ?? flux).message ?? null);
    if (question !== null) {
      if (prOuverte === null && depot.recolter !== undefined) {
        try {
          depot.recolter(worktree, branche);
          if (depot.commits(branche) > 0 && !estUneSauvegarde(depot.sujet?.(branche))) depot.recolter(worktree, branche, SUJET_DE_SAUVEGARDE, true);
        } catch (erreur) {
          avertir(`brigade : #${ticket.number} sur ${nom} — the blocked cook's work could not be marked as saved on \`${branche}\`: ${message(erreur)}`);
        }
      }
      await depot.ranger(worktree, branche);
      if (depot.commits(branche) > 0) {
        try {
          depot.pousser(branche);
        } catch (erreur) {
          avertir(`brigade : #${ticket.number} sur ${nom} — the blocked cook's work stays only in the clone, \`${branche}\` could not be pushed: ${message(erreur)}`);
        }
      }
      return { bloque: question };
    }
    await depot.ranger(worktree, branche);
    // Une écriture refusée par le bac à sable n'est pas le fait du ticket : un
    // motif nommé, qui ne compte pas vers `hors-cuisine` (#2738).
    const refusee = lireLeFlux(lance.flux ?? flux).ecritureRefusee;
    if (depot.commits(branche) === 0 && refusee !== null) return { subi: `write refused by sandbox: ${refusee} (the cook committed nothing)` };
    if (depot.commits(branche) === 0) return { echec: motifArretCook("the cook committed nothing", arretDuCook()) };
    // Sa réponse aux remarques, que la station poste pour lui sur la PR (#2592).
    const reponse = prOuverte === null ? null : reponseDuMessage(lireLeFlux(lance.flux ?? flux).message ?? null);
    const tete = depot.tete?.(branche);
    if (prOuverte !== null && reponse !== null && tete !== undefined) {
      await options.github.commenter(prOuverte, corpsDeLaReponse(tete, reponse)).catch((erreur: unknown) => avertir(`brigade : #${ticket.number} sur ${nom} — the cook's reply could not be posted on PR #${prOuverte}: ${message(erreur)}`));
    }
    if (avant !== null && tete === avant) {
      if (resteAFaire !== null) return { reste: resteAFaire };
      // Il a répondu sur la PR depuis le renvoi : un désaccord, pas un échec —
      // la livraison repart en pass, qui juge sa réponse (#2592).
      if (prOuverte !== null && "desaccord" in classerArret(await options.github.commentaires(prOuverte).catch(() => []), avant, "")) return { branche };
      // Un cook qui s'arrête dans ses premiers tours n'a pas travaillé sur les
      // remarques de la relecture : ce n'est pas un essai (#2508).
      if (fin.turns <= TOURS_POUR_TRAVAILLER) return { court: true, subi: `the cook stopped after ${fin.turns} turn${fin.turns === 1 ? "" : "s"}, before it could work on the review's remarks, and added nothing since its last delivery` };
      return { echec: motifArretCook("the cook added nothing since its last delivery", arretDuCook()) };
    }
    try {
      depot.pousser(branche);
    } catch (erreur) {
      return { echec: `its branch could not be pushed: ${message(erreur)}` };
    }
    return { branche };
  };

  const juger: Juger = async (ticket, pr) => {
    const branche = brancheDuTicket(ticket.number);
    const run = `review-${ticket.number}-github`;
    const worktree = await depot.reprendre(run, branche);
    try {
      const issue = await options.github.issue(ticket.number);
      const diff = { fichiers: depot.changes(branche), texte: depot.diff(branche) };
      // La réponse du cook aux remarques d'avant, s'il en a posté une : la pass la juge (#2592).
      const reponse = reponseDuCook(await options.github.commentaires(pr.number), pr.sha);
      const texte = avecLeDesaccord(consigneDeRelecture({ depot: depotGitHub, base, ticket: { number: ticket.number, title: ticket.title, body: issue?.body ?? "" }, commentaires: [], compteRendu: null, diff }), reponse);
      const flux = join(options.flux, `${run}-${pr.sha.slice(0, 12)}.flux.jsonl`);
      const lancement = envelopper(cloison, { commande: options.claude, args: dansLeBacASableLocal(options.bacASable, argumentsReviewer(texte, options.reviewer), worktree) }, { cwd: worktree, depot: "lecture" });
      const lance = lancer({ ...lancement, cwd: worktree, env: env(), flux });
      await lance.fin;
      const lue = lireRelecture(lireLeFlux(lance.flux ?? flux).message);
      if ("illisible" in lue) throw new Error(`the review of PR #${pr.number} is unreadable: ${lue.illisible}`);
      const { verdict: couleur, summary, findings } = lue.relecture;
      const constats = findings.map((constat) => `- ${constat.severity === "blocking" ? "**Blocking**" : "Remark"}${constat.file === null ? "" : ` (\`${constat.file}\`)`}: ${constat.text}`);
      return { verdict: couleur === "green" ? "approve" : "request-changes", motif: [summary, ...constats].join("\n") };
    } finally {
      depot.retirer(worktree);
    }
  };

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
      const lancement = envelopper(cloison, { commande: options.claude, args: dansLeBacASableLocal(options.bacASable, argumentsReviewer(texte, CALIBRAGE_DU_SECOND_JUGE), worktree) }, { cwd: worktree, depot: "lecture" });
      const lance = lancer({ ...lancement, cwd: worktree, env: env(), flux });
      await lance.fin;
      const lu = lireSecondJugement(lireLeFlux(lance.flux ?? flux).message);
      if ("illisible" in lu) throw new Error(`the second judge of PR #${pr.number} is unreadable: ${lu.illisible}`);
      return lu;
    } finally {
      depot.retirer(worktree);
    }
  };

  // Le ticket de temps perdu resté hors cuisine est redéposé sur brigade (#2786) :
  // sa perte est réelle tant que les temps du clone sont au-dessus du seuil.
  const { clone, githubDeLaBrigade } = options;
  const perteReelle = () => {
    const { enregistrements, lostTimeMaxMin } = lesTempsDesTickets(clone);
    return ticketDeCorrection(enregistrements, lostTimeMaxMin) !== null;
  };
  const redeposer = redeposerHorsCuisine({ depot: depotGitHub, github, ...(githubDeLaBrigade === undefined ? {} : { brigade: () => githubDeLaBrigade }), ...(clone === undefined ? {} : { perteReelle }) });
  const station = stationGitHub({ ...(depot.fichiers === undefined ? {} : { fichiersSuivis: () => depot.fichiers?.() ?? [] }), nom, places: options.places, base, github, prise: options.prise(github, nom), cuisiner, juger, jugerEnSecond, ciDesPR, gates: lieuDesGates, capacites: options.capacites ?? [], ...(options.gardes === undefined ? {} : { gardes: options.gardes }), ...(options.avertir === undefined ? {} : { avertir: options.avertir }), ...(options.maintenant === undefined ? {} : { maintenant: options.maintenant }), ...(options.clone === undefined ? {} : { clone: options.clone }), depotServi: depotGitHub, ...(options.githubDeLaBrigade === undefined ? {} : { githubDeLaBrigade: options.githubDeLaBrigade }), ...(options.repertoireEtat === undefined ? {} : { repertoireEtat: options.repertoireEtat }), ...(options.sauter === undefined ? {} : { sauter: options.sauter }), redeposer });
  station.sauver = sauver;
  const quitter = station.quitter;
  station.quitter = async () => {
    abandon.abort();
    await quitter?.();
  };
  return station;
}
