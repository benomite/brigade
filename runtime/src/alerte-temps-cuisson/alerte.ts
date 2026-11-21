// La mesure du temps de cuisson (#2676, épique #2671) : la médiane des rapports
// cuisson réelle / cuisson attendue des tickets servis récents, son seuil
// (`cookingOverEstimateMax` de `.claude/brigade/projet.json`, 1,5 par défaut) et
// les tickets les plus au-dessus de leur estimation. La cuisine ne dépose plus
// de ticket de correction dessus (#3908) : `status` et l'onglet Health la disent.
//
// Les rapports sont ceux qu'enregistre le service d'un ticket (#2675,
// `temps-cuisson/ratio.ts`) dans `.claude/brigade/ratios-cuisson.json` du
// clone ; `lireRatios` les relit sans importer ce module. Un ticket sans
// estimation (sans label `time:` valide) n'a pas de rapport : il n'entre pas
// dans la médiane.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mediane } from "../temps-ticket/synthese.ts";

export const FICHIER_DU_PROJET = ".claude/brigade/projet.json";
// Le seuil, sans `cookingOverEstimateMax` dans projet.json.
export const SEUIL_PAR_DEFAUT = 1.5;
// Combien de tickets au-dessus de leur estimation le corps nomme.
export const DEPASSEMENTS_NOMMES = 5;
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
