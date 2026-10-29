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
// `set-aside`, `answer`, `choose`, `arrived`, `comment`, `ask`, `correction`, `profile`) et `ticket` : ce qu'il demande — nuls pour
// un geste incompris ; le ticket, nul aussi pour une correction ou un profil. `etat` : `pris`, joué ; `refuse`, refusé ou incompris.
// `traiteLe` : l'heure où la box l'a lu. `reponse` : la ligne qu'elle a
// répondue sous lui, en markdown. `demande` : pour un `ask` joué seulement, la
// demande au second que la box a composée, mot pour mot — celle que l'app
// écrit dans le second, sans Entrée, quand la box ne tient pas le second du
// projet. `second` : quand elle le tient, la demande y est partie, et c'est ce
// qu'il en est — `attendu`, il répond encore ; `repondu`, sa réponse
// (`reponse`, en markdown, coupée au-delà de `REPONSE_DU_SECOND_AU_BLOC`
// caractères — `coupee` le dit —, entière dans le commentaire posté sous le
// geste) ; `echec`, et pourquoi (`raison`).
export type SecondDuGeste = { etat: "attendu" } | { etat: "repondu"; reponse: string; coupee: boolean } | { etat: "echec"; raison: string };
export type GesteDuTableau = { commentaire: number; url: string; le: string; geste: string | null; ticket: number | null; etat: "pris" | "refuse"; traiteLe: string; reponse: string; demande?: string; second?: SecondDuGeste };

// La réponse du second que le bloc porte : au-delà, elle n'est entière que sous le geste.
export const REPONSE_DU_SECOND_AU_BLOC = 2_000;

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

// Ce que la box a prêté aux stations distantes, et ce qu'elle a répondu à
// celles qui le lui demandent par GitHub (#1793, tirer-par-github/) : c'est ici
// qu'une station sans ssh vers la box lit sa réponse. Jamais retiré d'un corps
// trop long : c'est l'arbitrage même, et il est borné (tirer-par-github/tableau.ts).
// `attributions` : chaque ticket qu'une station distante tient — son run, et
// l'échéance de son bail, qui avance à chaque renouvellement.
export type AttributionPubliee = { ticket: number; station: string; run: string | null; bailJusqua: string | null };
// `demande` : l'id que la station a donné à sa demande ; `geste` : `announce`,
// `claim`, `renew` ; `run` : celui d'un renouvellement ; `le` : l'heure de la
// réponse. `reponse` : celle du runtime, telle que le runtime la rend, sauf la
// mission d'un `claim` — ses arguments de `claude` sans la consigne, qu'ils
// répéteraient (`suiteDesArgs`).
export type ReponsePubliee = { demande: string; station: string; geste: string; run: string | null; le: string; reponse: { ok: boolean; [champ: string]: unknown } };
export type DistantesPubliees = { attributions: AttributionPubliee[]; reponses: ReponsePubliee[] };

// Ce que fait chaque cook du projet, publié pour une app qui n'a que GitHub
// (#1844) : à la place du terminal du cook, qu'elle suivait par ssh. Une entrée
// par ticket, son dernier cook — celui qui tourne, ou celui qui a fini depuis
// moins de deux heures (tableau/activites/activites.ts). Une étape : un geste
// du cook, tel que son relevé le dit au journal — `fait`, en mots du chef ;
// `faitEn`, le même en anglais ; `cible`, le fichier ou la commande qu'il vise,
// jamais ce qu'il y a dedans ; `depuis`, l'heure où il s'y est mis.
export type EtapeDuCook = { fait: string; faitEn: string; cible: string | null; depuis: string };
// `run` : le cook. `lanceLe` : son départ. `finiLe` : sa fin, nulle tant qu'il
// tourne ; `fin` : comment il a fini (`ok`, `failed`, `guard`, `stop`,
// `neutral`, `refused`, `interrupted`), nulle de même. `maintenant` : ce qu'il
// fait, nul quand il a fini ou que son relevé ne le dit pas (une station
// distante). `etapes` : ses derniers gestes, le plus ancien d'abord — le
// dernier est `maintenant` tant qu'il tourne. `tours`, `tokens` : son dernier
// relevé, ou sa fin. `pr` : la PR de sa livraison, dès que le journal la
// connaît — celle du ticket qu'un cook renvoyé reprend, ou celle que sa
// livraison ouvre ; nulle sans elle. `numero` : nul si son adresse ne le dit pas.
export type ActiviteDuCook = {
  ticket: number;
  titre: string | null;
  run: string;
  station: string | null;
  lanceLe: string;
  finiLe: string | null;
  fin: string | null;
  maintenant: EtapeDuCook | null;
  etapes: EtapeDuCook[];
  tours: number | null;
  tokens: number | null;
  pr: { numero: number | null; url: string } | null;
};

// Ce qu'un corps trop long pour GitHub a retiré du bloc, dans l'ordre où il l'a
// retiré (rendre.ts) : les étapes passées des cooks, les relectures des livrés,
// les livraisons qui attendent, les diffs des corrections, puis les faits et
// les lignes du rail entiers.
export type Resserre = "activites.etapes" | "faits.livres.relecture" | "faits.attend.livraison" | "faits.corrections.diff" | "faits" | "lignesDuRail";

// `lu` : l'heure de la lecture de l'état — les durées que les lignes disent se
// comptent jusqu'à elle. `bilans` : ce que le bloc `awaiting` de `status` dit
// sans que ce soit une décision (la pause, le bilan sans grant, la version passée).
// `gestes` : les derniers gestes du chef lus sur le tableau, le plus ancien
// d'abord — absent d'un bloc écrit sans eux. `faits` et `lignesDuRail` : ce que
// la vue du rail dessine — absents d'un bloc écrit avant eux (#1693).
// `fileDeStatus` : le bloc `awaiting` de `status`, mot pour mot, de sa ligne de
// tête à `end awaiting` comprises — ce que le second relaie à son ouverture,
// lu ici sans ssh (`laFileDuSecond`) ; absent d'un bloc écrit avant lui.
// `resserre` : ce que le corps a dû retirer du bloc pour tenir dans une issue —
// absent quand rien ne l'a été. `distantes` : ce que la box a prêté aux
// stations distantes et répondu à leurs demandes par GitHub — absent quand
// aucune ne tient de ticket ni n'a rien demandé. `activites` : ce que fait
// chaque cook du projet (#1844), lu ici sans ssh (`lesActivitesDesCooks`) —
// vide quand aucun ne tourne ni n'a fini depuis peu, absent d'un bloc écrit
// avant lui.
export type Tableau = {
  projet: string | null;
  lu: string;
  file: LigneDeLaFile[];
  bilans: string[];
  cuisine: CuisineDuTableau;
  gestes?: GesteDuTableau[];
  faits?: FaitsPublies;
  lignesDuRail?: LigneDuRail[];
  fileDeStatus?: string[];
  distantes?: DistantesPubliees;
  activites?: ActiviteDuCook[];
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

// Ce que le second lit à son ouverture, à la place de `brigade <nom> status`
// joué par ssh : la file du projet, telle que la box l'a publiée dans le corps
// du tableau. `texte` : le bloc `awaiting` de `status`, mot pour mot, bords
// compris, puis l'état de la cuisine que le tableau porte, rubrique par
// rubrique dans la forme de `status` — le titre sur onze colonnes, les lignes
// suivantes en retrait. `lu` : l'heure de la lecture de l'état — les durées
// que les lignes disent se comptent jusqu'à elle. Ce qui ne se lit pas est dit
// en une phrase, comme `lireLeTableau` le dit.
export type FileDuSecond = { lue: true; lu: string; texte: string } | { lue: false; raison: string };

export function laFileDuSecond(corps: string): FileDuSecond {
  const lu = lireLeTableau(corps);
  if (!lu.lu) return { lue: false, raison: lu.raison };
  const { fileDeStatus, cuisine } = lu.tableau;
  if (!Array.isArray(fileDeStatus) || fileDeStatus.some((ligne) => typeof ligne !== "string")) {
    return { lue: false, raison: "the board was written by a box that does not publish the project's queue yet: update the box" };
  }
  // Un bloc `awaiting` que la box n'a pas trouvé dans `status` n'est pas une file vide.
  if (fileDeStatus.length === 0) return { lue: false, raison: "the box found no awaiting block in its status: the project's queue is not known" };
  const etat = (Array.isArray(cuisine.rubriques) ? cuisine.rubriques : []).flatMap(({ titre, lignes }) => {
    const [premiere = "", ...suite] = lignes;
    return [titre === "" ? premiere : `${titre.padEnd(10)} ${premiere}`, ...suite.map((ligne) => `  ${ligne}`)];
  });
  return { lue: true, lu: lu.tableau.lu, texte: [...fileDeStatus, "", ...etat].join("\n") };
}

// Ce que fait chaque cook du projet, lu dans le corps du tableau : ce qu'une
// app montre d'un cook à la place de son terminal, avec GitHub seul (#1844).
// `lu` : l'heure de la lecture de l'état — ce qui y dure se compte jusqu'à
// elle. Un bloc d'une box d'avant cette publication n'est pas « aucun cook » :
// la phrase dit de mettre la box à jour. Ce qui ne se lit pas est dit en une
// phrase, comme `lireLeTableau` le dit.
export type ActivitesDesCooks = { lues: true; lu: string; activites: ActiviteDuCook[] } | { lues: false; raison: string };

export function lesActivitesDesCooks(corps: string): ActivitesDesCooks {
  const lu = lireLeTableau(corps);
  if (!lu.lu) return { lues: false, raison: lu.raison };
  const { activites } = lu.tableau;
  if (!Array.isArray(activites) || activites.some((activite) => !estObjet(activite) || typeof activite.ticket !== "number" || typeof activite.run !== "string")) {
    return { lues: false, raison: "the board was written by a box that does not publish its cooks' activity yet: update the box" };
  }
  return { lues: true, lu: lu.tableau.lu, activites };
}
