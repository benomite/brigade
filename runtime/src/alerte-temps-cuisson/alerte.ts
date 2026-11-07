// L'alerte du temps de cuisson (#2676, épique #2671) : quand la médiane des
// rapports cuisson réelle / cuisson attendue des tickets servis récents dépasse
// le seuil du projet (`cookingOverEstimateMax` de `.claude/brigade/projet.json`,
// 1,5 par défaut), elle ouvre un ticket de correction. Son corps nomme les
// tickets les plus au-dessus de leur estimation — numéro, attendu, réel,
// rapport —, le plus au-dessus d'abord.
//
// Les rapports sont ceux qu'enregistre le service d'un ticket (#2675,
// `temps-cuisson/ratio.ts`) dans `.claude/brigade/ratios-cuisson.json` du
// clone ; `lireRatios` les relit sans importer ce module. Un ticket sans
// estimation (sans label `time:` valide) n'a pas de rapport : il n'entre pas
// dans la médiane.
//
// Un seul ouvert à la fois : avant d'ouvrir, l'alerte cherche sur GitHub une
// issue ouverte, d'un auteur de confiance, qui porte la marque cachée du
// ticket, et n'ouvre rien si elle en trouve une. Une fois le ticket fermé, une
// médiane encore au-dessus du seuil en ouvre un autre.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DE_CONFIANCE } from "../alimenter.ts";
import { LABEL, type IssueOuverte } from "../github.ts";
import { mediane } from "../temps-ticket/synthese.ts";

export const FICHIER_DU_PROJET = ".claude/brigade/projet.json";
// Le seuil, sans `cookingOverEstimateMax` dans projet.json.
export const SEUIL_PAR_DEFAUT = 1.5;
export const LABELS_CORRECTION = [LABEL, "model:opus", "effort:medium"];
export const MARQUE_CORRECTION = "<!-- brigade:temps-cuisson -->";
// Combien de tickets au-dessus de leur estimation le corps nomme.
export const DEPASSEMENTS_NOMMES = 5;
// Jusqu'où, sur GitHub, on cherche un ticket de correction encore ouvert.
export const FENETRE_MS = 30 * 24 * 60 * 60 * 1000;
// Le fichier où le service d'un ticket écrit son rapport (#2675), et combien
// des plus récents la médiane compte.
export const FICHIER_DES_RATIOS = ".claude/brigade/ratios-cuisson.json";
export const RATIOS_RECENTS = 10;

// Le rapport d'un ticket servi, tel que `temps-cuisson/` l'écrit : les minutes
// attendues (null ou absentes : pas d'estimation), les minutes réelles.
export type RatioServi = { ticket: number; attendu: number | null; reel: number; ratio?: number };
type RatioEstime = { ticket: number; attendu: number; reel: number; ratio: number };

// `projet` est le contenu déjà lu de projet.json : absent, mal formé ou sans
// clé valide (un nombre plus grand que 0), c'est le défaut.
export function seuilDuProjet(projet: unknown): number {
  if (typeof projet !== "object" || projet === null || Array.isArray(projet)) return SEUIL_PAR_DEFAUT;
  const valeur = (projet as Record<string, unknown>).cookingOverEstimateMax;
  return typeof valeur === "number" && Number.isFinite(valeur) && valeur > 0 ? valeur : SEUIL_PAR_DEFAUT;
}

// Le seuil du projet dont `dossier` est la racine. Un projet.json absent, ou
// sans la clé, donne le défaut en silence ; illisible, mal formé, ou une
// valeur qui n'est pas un nombre plus grand que 0, le défaut aussi, mais
// `avertir` le dit : un seuil personnalisé ne disparaît pas sans signal.
export function lireSeuil(dossier: string, avertir: (texte: string) => void = () => {}): number {
  const fichier = join(dossier, FICHIER_DU_PROJET);
  let projet: unknown;
  try {
    projet = JSON.parse(readFileSync(fichier, "utf8"));
  } catch (erreur) {
    if ((erreur as NodeJS.ErrnoException).code !== "ENOENT") avertir(`brigade : ${fichier} could not be read (${erreur instanceof Error ? erreur.message : String(erreur)}): cookingOverEstimateMax falls back to ${SEUIL_PAR_DEFAUT}`);
    return SEUIL_PAR_DEFAUT;
  }
  const valeur = typeof projet === "object" && projet !== null ? (projet as Record<string, unknown>).cookingOverEstimateMax : undefined;
  const seuil = seuilDuProjet(projet);
  if (valeur !== undefined && seuil !== valeur) avertir(`brigade : cookingOverEstimateMax in ${fichier} is ${JSON.stringify(valeur)}, not a number over 0: it falls back to ${SEUIL_PAR_DEFAUT}`);
  return seuil;
}

// Les rapports des `combien` derniers tickets servis du projet dont `dossier`
// est la racine, du plus récent au plus ancien (par `servedAt`), tels que #2675
// les écrit : `{ ticket, servedAt, attendu, reel, ratio }`. Sans fichier : aucun.
// Une entrée d'une autre forme est écartée ; un fichier illisible lève.
export function lireRatios(dossier: string, combien: number = RATIOS_RECENTS): RatioServi[] {
  let texte: string;
  try {
    texte = readFileSync(join(dossier, FICHIER_DES_RATIOS), "utf8");
  } catch (erreur) {
    if ((erreur as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw erreur;
  }
  if (texte.trim() === "") return [];
  const lus: unknown = JSON.parse(texte);
  if (!Array.isArray(lus)) throw new Error(`${FICHIER_DES_RATIOS} is not a JSON array`);
  const nombre = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
  return lus
    .flatMap((lu: unknown) => {
      if (typeof lu !== "object" || lu === null) return [];
      const { ticket, servedAt, attendu, reel } = lu as Record<string, unknown>;
      const instant = typeof servedAt === "string" ? Date.parse(servedAt) : Number.NaN;
      return nombre(ticket) && !Number.isNaN(instant) && (attendu === null || nombre(attendu)) && nombre(reel) ? [{ instant, ratio: { ticket, attendu, reel } }] : [];
    })
    .sort((a, b) => b.instant - a.instant)
    .slice(0, Math.max(0, combien))
    .map(({ ratio }) => ratio);
}

// Les rapports qui ont une estimation (un attendu plus grand que 0) et une
// cuisson réelle mesurée ; le rapport est recalculé de l'une et de l'autre.
export function ratiosEstimes(ratios: readonly RatioServi[]): RatioEstime[] {
  return ratios.flatMap(({ ticket, attendu, reel }) =>
    typeof attendu === "number" && Number.isFinite(attendu) && attendu > 0 && Number.isFinite(reel) && reel >= 0 ? [{ ticket, attendu, reel, ratio: reel / attendu }] : [],
  );
}

// La médiane des rapports des tickets estimés ; null sans ticket estimé.
export function medianeDesRatios(ratios: readonly RatioServi[]): number | null {
  const estimes = ratiosEstimes(ratios);
  return estimes.length === 0 ? null : mediane(estimes.map((r) => r.ratio));
}

// Les tickets les plus au-dessus de leur estimation, du plus haut rapport au
// plus bas ; à égalité, dans l'ordre reçu.
export function plusAuDessus(ratios: readonly RatioServi[], combien: number = DEPASSEMENTS_NOMMES): RatioEstime[] {
  return ratiosEstimes(ratios)
    .map((r, rang) => ({ r, rang }))
    .sort((a, b) => b.r.ratio - a.r.ratio || a.rang - b.rang)
    .slice(0, combien)
    .map(({ r }) => r);
}

const fois = (ratio: number) => `×${ratio.toFixed(2)}`;
const min = (minutes: number) => `${Math.round(minutes)} min`;

// Le ticket de correction, ou null quand la médiane est au seuil ou en
// dessous (ou qu'aucun ticket n'est estimé).
export function ticketDeCorrection(ratios: readonly RatioServi[], seuil: number): { titre: string; corps: string } | null {
  const med = medianeDesRatios(ratios);
  if (med === null || med <= seuil) return null;
  const estimes = ratiosEstimes(ratios);
  const titre = `Cooking takes longer than estimated: median ratio ${fois(med)} over the max of ${fois(seuil)}`;
  const corps = [
    MARQUE_CORRECTION,
    "",
    "## Context",
    "",
    `Over the project's ${estimes.length} recent served tickets with an estimate (a \`time:<minutes>\` label), the median ratio of actual to expected cooking time is **${fois(med)}**: over the project's max of ${fois(seuil)} (\`cookingOverEstimateMax\` in \`.claude/brigade/projet.json\`). Tickets with no estimate are not counted.`,
    "",
    "## Tickets most over their estimate",
    "",
    "| Ticket | Expected | Actual | Ratio |",
    "| --- | --- | --- | --- |",
    ...plusAuDessus(ratios).map((r) => `| #${r.ticket} | ${min(r.attendu)} | ${min(r.reel)} | ${fois(r.ratio)} |`),
    "",
    "## To do",
    "",
    "Find why these tickets cooked longer than expected — estimates too low, or cooking slower than it should be — and fix the cause.",
  ].join("\n");
  return { titre, corps };
}

// Ce que l'alerte lit et écrit de GitHub. `state` absent : l'issue compte
// comme ouverte — au pire rien ne s'ouvre, jamais deux.
export type GitHubDeLAlerte = {
  issuesDepuis(instant: string): Promise<(Pick<IssueOuverte, "number" | "body" | "association"> & Partial<Pick<IssueOuverte, "state">>)[]>;
  creerIssue(issue: { titre: string; corps: string; labels: string[] }): Promise<number>;
  fermerIssue(numero: number): Promise<void>;
};

export type DecisionDeLAlerte =
  | { issue: "sous-le-seuil"; mediane: number | null; seuil: number }
  | { issue: "deja-ouverte"; numero: number; mediane: number; seuil: number }
  | { issue: "ouverte"; numero: number; mediane: number; seuil: number };

export type OptionsDeLAlerte = {
  github: GitHubDeLAlerte;
  // Les rapports récents du projet et son seuil, lus à chaque appel.
  lire: () => { ratios: readonly RatioServi[]; seuil: number };
  maintenant?: () => Date;
};

// L'alerte, liée au GitHub du projet. Chaque appel lit les rapports ; au-dessus
// du seuil, il trouve le ticket de correction ouvert, ou en ouvre un.
export function alerteTempsCuisson({ github, lire, maintenant = () => new Date() }: OptionsDeLAlerte) {
  // Les tickets de correction ouverts, du plus ancien au plus récent. Le début
  // de la fenêtre tombe à minuit (UTC) : la même requête toute la journée.
  const ouverts = async (): Promise<number[]> => {
    const debut = new Date(maintenant().getTime() - FENETRE_MS);
    debut.setUTCHours(0, 0, 0, 0);
    return (await github.issuesDepuis(debut.toISOString()))
      .filter((issue) => issue.state !== "closed" && DE_CONFIANCE.includes(issue.association) && issue.body.includes(MARQUE_CORRECTION))
      .map((issue) => issue.number)
      .sort((x, y) => x - y);
  };

  return async (): Promise<DecisionDeLAlerte> => {
    const { ratios, seuil } = lire();
    const mediane = medianeDesRatios(ratios);
    const ticket = ticketDeCorrection(ratios, seuil);
    if (ticket === null || mediane === null) return { issue: "sous-le-seuil", mediane, seuil };
    const [deja] = await ouverts();
    if (deja !== undefined) return { issue: "deja-ouverte", numero: deja, mediane, seuil };
    const creee = await github.creerIssue({ titre: ticket.titre, corps: ticket.corps, labels: LABELS_CORRECTION });
    // Deux stations qui l'ont ouvert ensemble : le plus ancien reste, l'autre se ferme.
    const [premier = creee] = await ouverts();
    if (premier < creee) await github.fermerIssue(creee);
    return { issue: premier < creee ? "deja-ouverte" : "ouverte", numero: Math.min(premier, creee), mediane, seuil };
  };
}

// L'alerte d'un clone : ses rapports récents et son seuil, relus à chaque
// appel. Un même avertissement sur projet.json n'est dit qu'une fois, pas à
// chaque tour.
export function alerteDuClone(clone: string, { github, avertir, maintenant }: { github: GitHubDeLAlerte; avertir: (texte: string) => void; maintenant?: () => Date }) {
  const dits = new Set<string>();
  const avertirUneFois = (texte: string) => {
    if (dits.has(texte)) return;
    dits.add(texte);
    avertir(texte);
  };
  return alerteTempsCuisson({ github, lire: () => ({ ratios: lireRatios(clone), seuil: lireSeuil(clone, avertirUneFois) }), ...(maintenant === undefined ? {} : { maintenant }) });
}
