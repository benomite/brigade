// Ce que l'app demande à une station, et ce que la station en dit. Aucune
// liaison directe entre l'app et la station : le chef ajoute un projet dans
// l'app, qui l'écrit dans le gist de chaque station qu'il a choisie (celui de
// l'appairage, `appairage/document.ts`) ; la station le lit là, et y répond.
//
// Deux fichiers de plus dans le gist :
//   - `brigade-projets.json`, écrit par l'app seule — les projets que le chef
//     demande à cette station :
//       { "brigade": "projets", "format": 1, "projets": [
//         { "nom": "parade", "depot": "benomite/parade", "base": "main",
//           "principale": true, "cooks": 2,
//           "manager": { "modele": "sonnet", "effort": "medium" },
//           "reviewer": { "modele": "sonnet", "effort": "medium" },
//           "ouvertLe": "<ISO>", "demandeLe": "<ISO>" } ] }
//     `principale` : cette station fait tourner son manager et sa pass. Le
//     calibrage et le plafond de cooks sont les décisions du chef, prises dans
//     le parcours : la station les pose au journal du projet, sans défaut.
//     `ouvertLe` : quand le chef a ouvert le parcours — d'où se mesure le temps
//     qu'il a fallu pour que le projet soit servi.
//   - `brigade-projets-suivi.json`, écrit par la station seule — où en est
//     chaque projet demandé :
//       { "brigade": "projets-suivi", "format": 1, "a": "<ISO>", "projets": [
//         { "nom": "parade", "etat": "servi", "dit": "…", "autoriser": [],
//           "serviLe": "<ISO>" | null } ] }
import { EFFORTS, MODELES } from "../calibrage.ts";
import { NOM_DE_PROJET } from "../runtime.ts";

export const FICHIER_PROJETS = "brigade-projets.json";
export const FICHIER_SUIVI = "brigade-projets-suivi.json";
export const FORMAT = 1;

// Un dépôt GitHub : `<owner>/<repo>`.
export const DEPOT = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?\/[A-Za-z0-9_.-]{1,100}$/;
// Une branche, telle qu'elle s'écrit sur une ligne de la configuration.
const BRANCHE = /^[A-Za-z0-9._/-]{1,200}$/;

export type Calibre = { modele: string; effort: string };

export type ProjetDemande = {
  nom: string;
  depot: string;
  base: string;
  principale: boolean;
  cooks: number;
  manager: Calibre;
  reviewer: Calibre;
  ouvertLe: string | null;
  demandeLe: string | null;
};

export type Demande = { projets: ProjetDemande[]; problemes: string[] };

// - `servi` : la station le sert, il est dans sa liste ;
// - `a-autoriser` : les Apps de la station ne sont pas installées sur le
//   dépôt — `autoriser` porte les pages GitHub où le chef les autorise ;
// - `en-preparation` : la station clone le dépôt et pose ses décisions ;
// - `refuse` : la station ne peut pas le servir, `dit` dit pourquoi ;
// - `secondaire` : la station n'en est pas la principale — elle ne lui fait
//   tourner ni manager ni pass.
export type EtatDuProjet = "servi" | "a-autoriser" | "en-preparation" | "refuse" | "secondaire";

export type SuiviDuProjet = { nom: string; etat: EtatDuProjet; dit: string; autoriser: string[]; serviLe: string | null };

const texte = (valeur: unknown): valeur is string => typeof valeur === "string";
const date = (valeur: unknown): string | null => (texte(valeur) && !Number.isNaN(Date.parse(valeur)) ? valeur : null);

function calibre(lu: unknown): Calibre | null {
  const { modele, effort } = (lu ?? {}) as Record<string, unknown>;
  return texte(modele) && (MODELES as readonly string[]).includes(modele) && texte(effort) && (EFFORTS as readonly string[]).includes(effort) ? { modele, effort } : null;
}

// Lit ce que l'app a écrit. Un projet illisible n'est que le sien : il est
// dit, et les autres sont servis. Un fichier illisible en entier est `null` :
// la station n'y touche rien plutôt que de retirer ce qu'elle sert.
export function lireDemande(brut: string): Demande | null {
  let lu: { brigade?: unknown; projets?: unknown };
  try {
    lu = JSON.parse(brut) as typeof lu;
  } catch {
    return null;
  }
  if (lu === null || typeof lu !== "object" || lu.brigade !== "projets" || !Array.isArray(lu.projets)) return null;
  const projets: ProjetDemande[] = [];
  const problemes: string[] = [];
  for (const brut of lu.projets as unknown[]) {
    const { nom, depot, base, principale, cooks, manager, reviewer, ouvertLe, demandeLe } = (brut ?? {}) as Record<string, unknown>;
    const dit = texte(nom) ? `« ${nom.slice(0, 40)} »` : "sans nom";
    const refuser = (pourquoi: string) => void problemes.push(`projet ${dit} demandé par l'app : ${pourquoi}`);
    if (!texte(nom) || !NOM_DE_PROJET.test(nom)) refuser("nom de projet invalide — attendu un identifiant court en minuscules, chiffres et tirets");
    else if (projets.some((projet) => projet.nom === nom)) refuser("demandé deux fois");
    else if (!texte(depot) || !DEPOT.test(depot)) refuser("dépôt invalide — attendu <owner>/<repo>");
    else if (!texte(base) || !BRANCHE.test(base)) refuser("branche d'intégration invalide");
    else if (typeof principale !== "boolean") refuser("on ne sait pas si cette station en est la principale");
    else if (typeof cooks !== "number" || !Number.isSafeInteger(cooks) || cooks < 1) refuser("plafond de cooks invalide — attendu un entier, 1 ou plus");
    else {
      const [pourManager, pourReviewer] = [calibre(manager), calibre(reviewer)];
      if (pourManager === null || pourReviewer === null) refuser(`calibrage du ${pourManager === null ? "manager" : "reviewer"} invalide — attendu un modèle (${MODELES.join(", ")}) et un effort (${EFFORTS.join(", ")})`);
      else projets.push({ nom, depot, base, principale, cooks, manager: pourManager, reviewer: pourReviewer, ouvertLe: date(ouvertLe), demandeLe: date(demandeLe) });
    }
  }
  return { projets, problemes };
}

// Ce que la station écrit de ses projets demandés.
export function documentDeSuivi(projets: SuiviDuProjet[], instant: number): string {
  return `${JSON.stringify({ brigade: "projets-suivi", format: FORMAT, a: new Date(instant).toISOString(), projets }, null, 2)}\n`;
}
