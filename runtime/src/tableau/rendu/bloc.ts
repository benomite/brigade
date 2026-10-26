// Le bloc machine du tableau de la cuisine (« Kitchen board ») : ce que le
// corps de l'issue porte pour un programme, à la suite de sa partie lisible.
// C'est un contrat entre la box, qui l'écrit, et les apps, qui le lisent : ce
// module n'importe rien d'autre que des types, pour qu'une app le charge sans
// tirer le runtime avec lui.
//
// Le bloc est un commentaire HTML, que GitHub n'affiche pas, en fin de corps :
//
//   <!-- brigade:kitchen-board
//   {"version":1,"genereLe":"2026-10-12T10:04:00.000Z","tableau":{…}}
//   -->
//
// `version` : la forme du bloc — elle change quand un champ change de sens ou
// disparaît ; un champ ajouté ne la change pas. `genereLe` : l'heure à laquelle
// la box a écrit le corps. `tableau` : la file du chef et l'état de la cuisine,
// tels que `status` les lit. Dans le JSON, `<`, `>`, `&` et `@` sont écrits en
// `\uXXXX` : rien de ce qu'il porte ne ferme le commentaire, et aucun `@`
// n'y mentionne personne. `JSON.parse` les rend tels quels.
//
// Le format, champ par champ, est décrit pour les apps dans
// docs/runtime/tableau-de-cuisine.md.

export const VERSION_DU_TABLEAU = 1;
export const OUVERTURE_DU_BLOC = "<!-- brigade:kitchen-board";
export const FERMETURE_DU_BLOC = "-->";

// Ce qu'une ligne de la file attend du chef, en champs (attend.ts, `Decision`) :
// nulle pour ce qui n'est à aucun ticket.
export type DecisionDuTableau = { quoi: string; motif: string | null; cause: string | null; pr: string | null };

// Une carte de TODO : sa sorte, sa question, ses choix, dans l'ordre que
// `rail choose` numérote à partir de 1.
export type CarteDuTableau = { type: string; question: string; choix: Array<{ texte: string; suite: string }> };

// Une ligne de la file : ce qui attend le chef, le plus ancien d'abord. `nom` :
// ce qui la nomme en tête de sa ligne de `status` (`#18`, `breaker`, une
// station). `quoi` : la sorte de l'attente (attend.ts). `depuis` : l'instant où
// elle a commencé d'attendre. `ligne` : ce qui attend, puis le geste du chef,
// mot pour mot comme `status` l'écrit.
export type LigneDeLaFile = {
  nom: string;
  ticket: number | null;
  titre: string | null;
  quoi: string;
  depuis: string;
  ligne: string;
  decision: DecisionDuTableau | null;
  carte: CarteDuTableau | null;
};

// Une rubrique de l'état de la cuisine, telle que `status` l'écrit : son titre
// (`runtime`, `base`, `cooks`… — vide pour une ligne qui n'en a pas), puis ses
// lignes, la première sur la ligne du titre, les suivantes en retrait.
export type RubriqueDuTableau = { titre: string; lignes: string[] };

// Ce qu'un ensemble de lancements a consommé (projections/guardrails.ts).
export type ConsommationDuTableau = { runs: number; reviews: number; judgments: number; turns: number; tokens: number };

export type CuisineDuTableau = {
  // L'état du projet en un mot, celui des faits : `éteinte`, `arrêtée`, `retenue`, `ouverte`.
  etat: string;
  // Le runtime d'après le journal : son démarrage, son arrêt, son dernier tick — nuls sans eux.
  runtime: { demarreLe: string | null; arreteLe: string | null; dernierTick: string | null };
  // Le « stop » du chef, nul sans lui ; le disjoncteur, ouvert depuis `ouvertLe`.
  arreteeLe: string | null;
  disjoncteur: { ouvertLe: string | null; echecs: number; seuil: number | null };
  // Le dernier contrôle de la base d'intégration, nul sans contrôle. `reparation` :
  // le ticket qui la répare, nul sans lui.
  base: { resultat: string; sha: string; le: string; rougeDepuis: string | null; reparation: number | null } | null;
  // Plus rien ne cuit et toute la cuisine attend le chef : depuis quand, les
  // tickets à l'arrêt, et les noms des lignes de la file qui les retiennent.
  urgence: { depuis: string; retenus: number[]; decisions: string[] } | null;
  // Les cooks en cours. `coince` : son ticket a passé la moitié de son bail sans progrès.
  cooks: Array<{ ticket: number | null; run: string; station: string | null; modele: string | null; effort: string | null; lanceLe: string; coince: boolean; tours: number | null; tokens: number | null }>;
  // Les stations du projet : leur plafond de cooks (nul : sans limite), la
  // machine qui sature et sur quoi, la station qui se retient, la connexion
  // Max tombée, le quota épuisé jusqu'à quand.
  stations: Array<{
    station: string;
    distante: boolean;
    plafond: number | null;
    satureeDepuis: string | null;
    saturation: string[];
    retenueDepuis: string | null;
    deconnecteeDepuis: string | null;
    quotaJusqua: string | null;
  }>;
  // Les plafonds d'un cook (garde-fous), nuls tant qu'aucun runtime ne les a posés.
  plafonds: { tours: number; tokens: number; dureeMs: number; inactiviteMs: number } | null;
  // Ce que les cooks ont consommé : ceux qui tournent, puis par fenêtre glissante.
  consommation: { enCours: ConsommationDuTableau; fenetres: Array<{ heures: number } & ConsommationDuTableau> };
  // L'état tel que `status` l'écrit, rubrique par rubrique.
  rubriques: RubriqueDuTableau[];
};

// Un geste du chef posté en commentaire sur le tableau (tableau/gestes/), tel
// que la box l'a pris. `commentaire` : l'id GitHub du commentaire ; `url` : son
// adresse ; `le` : son heure sur GitHub. `geste` (`merge`, `send-back`,
// `set-aside`, `answer`, `choose`) et `ticket` : ce qu'il demande — nuls pour
// un geste incompris. `etat` : `pris`, joué ; `refuse`, refusé ou incompris.
// `traiteLe` : l'heure où la box l'a lu. `reponse` : la ligne qu'elle a
// répondue sous lui, en markdown.
export type GesteDuTableau = { commentaire: number; url: string; le: string; geste: string | null; ticket: number | null; etat: "pris" | "refuse"; traiteLe: string; reponse: string };

// Ce que la vue du rail d'un projet dessine (#1693) : l'objet de `facts`, dans
// sa forme et ses mots (etat.ts, `Faits` ; docs/runtime/etat-et-mesures.md,
// « Les faits, pour un programme ») — ses tickets et leur état, les cooks en
// cours, ce qui attend le chef et ses cartes, les livrés, les stations —, sans
// ce que d'autres écrans lisent (donnees.ts, `FaitsDuTableau`). Ce module
// n'importe rien : la forme est typée là, et une app la vérifie en la lisant,
// comme elle vérifie la sortie de `facts`.
export type FaitsPublies = { [champ: string]: unknown };

// Un ticket du rail tel que `status` l'écrit sous sa ligne `rail`, dans l'ordre
// du rail : sa priorité (`prio:` de l'issue, nulle sans elle), que les faits ne
// portent pas, et sa ligne mot pour mot, retrait compris —
// `  #<ticket>  <état>  <priorité>  <détail>  <titre>`.
export type LigneDuRail = { ticket: number; priorite: number | null; ligne: string };

// Ce qu'un corps trop long pour GitHub a retiré du bloc, dans l'ordre où il l'a
// retiré (rendre.ts) : les relectures des livrés, les livraisons qui attendent,
// les diffs des corrections, puis les faits et les lignes du rail entiers.
export type Resserre = "faits.livres.relecture" | "faits.attend.livraison" | "faits.corrections.diff" | "faits" | "lignesDuRail";

// `lu` : l'heure de la lecture de l'état — les durées que les lignes disent se
// comptent jusqu'à elle. `bilans` : ce que le bloc `awaiting` de `status` dit
// sans que ce soit une décision (la pause, le bilan sans grant, la version passée).
// `gestes` : les derniers gestes du chef lus sur le tableau, le plus ancien
// d'abord — absent d'un bloc écrit sans eux. `faits` et `lignesDuRail` : ce que
// la vue du rail dessine — absents d'un bloc écrit avant eux (#1693).
// `resserre` : ce que le corps a dû retirer du bloc pour tenir dans une issue —
// absent quand rien ne l'a été.
export type Tableau = {
  projet: string | null;
  lu: string;
  file: LigneDeLaFile[];
  bilans: string[];
  cuisine: CuisineDuTableau;
  gestes?: GesteDuTableau[];
  faits?: FaitsPublies;
  lignesDuRail?: LigneDuRail[];
  resserre?: Resserre[];
};

export type BlocDuTableau = { version: number; genereLe: string; tableau: Tableau };

// Ce que la lecture d'un corps rend : le bloc, ou pourquoi il ne se lit pas,
// en une phrase qu'une app peut montrer telle quelle.
export type LectureDuTableau = ({ lu: true } & BlocDuTableau) | { lu: false; raison: string };

const ECHAPPES: Record<string, string> = { "<": "\\u003c", ">": "\\u003e", "&": "\\u0026", "@": "\\u0040" };

// Le bloc, prêt à finir le corps.
export function ecrireLeBloc(tableau: Tableau, genereLe: Date): string {
  const bloc: BlocDuTableau = { version: VERSION_DU_TABLEAU, genereLe: genereLe.toISOString(), tableau };
  return `${OUVERTURE_DU_BLOC}\n${JSON.stringify(bloc).replace(/[<>&@]/g, (c) => ECHAPPES[c] ?? c)}\n${FERMETURE_DU_BLOC}`;
}

const estObjet = (valeur: unknown): valeur is Record<string, unknown> => typeof valeur === "object" && valeur !== null && !Array.isArray(valeur);

// Le bloc d'un corps d'issue — le dernier, s'il y en a plusieurs. Un bloc d'une
// version plus récente que celle-ci ne se lit pas : ses champs peuvent avoir
// changé de sens.
export function lireLeTableau(corps: string): LectureDuTableau {
  const debut = corps.lastIndexOf(OUVERTURE_DU_BLOC);
  if (debut === -1) return { lu: false, raison: "the board carries no machine block: it was not written by the box, or was edited by hand" };
  const fin = corps.indexOf(FERMETURE_DU_BLOC, debut + OUVERTURE_DU_BLOC.length);
  if (fin === -1) return { lu: false, raison: "the board's machine block is cut off: it has no end" };
  let brut: unknown;
  try {
    brut = JSON.parse(corps.slice(debut + OUVERTURE_DU_BLOC.length, fin));
  } catch {
    return { lu: false, raison: "the board's machine block is not readable JSON" };
  }
  if (!estObjet(brut)) return { lu: false, raison: "the board's machine block is not an object" };
  const { version, genereLe, tableau } = brut;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) return { lu: false, raison: "the board's machine block has no version" };
  if (version > VERSION_DU_TABLEAU) return { lu: false, raison: `the board is in version ${version}, newer than this app reads (${VERSION_DU_TABLEAU}): update the app` };
  if (typeof genereLe !== "string" || Number.isNaN(Date.parse(genereLe))) return { lu: false, raison: "the board's machine block has no generation time" };
  if (!estObjet(tableau) || !Array.isArray(tableau.file) || !Array.isArray(tableau.bilans) || !estObjet(tableau.cuisine) || typeof tableau.lu !== "string") {
    return { lu: false, raison: "the board's machine block carries neither the queue nor the kitchen's state" };
  }
  return { lu: true, version, genereLe, tableau: tableau as Tableau };
}
