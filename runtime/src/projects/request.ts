// What the app asks of a station, and what the station says about it. No direct
// link between the app and the station: the chef adds a project in the app,
// which writes it into the gist of each station they chose (the pairing gist,
// `pairing/document.ts`); the station reads it there, and answers there.
//
// Two more files in the gist:
//   - `brigade-projets.json`, written by the app alone — the projects the chef
//     asks of this station:
//       { "brigade": "projets", "format": 1, "projets": [
//         { "nom": "parade", "depot": "benomite/parade", "base": "main",
//           "principale": true, "cooks": 2,
//           "manager": { "modele": "sonnet", "effort": "medium" },
//           "reviewer": { "modele": "sonnet", "effort": "medium" },
//           "ouvertLe": "<ISO>", "demandeLe": "<ISO>" } ] }
//     `principale`: this station runs its manager and its pass. The
//     calibration and the cook ceiling are the chef's decisions, made in the
//     walkthrough: the station records them in the project's log, with no default.
//     `ouvertLe`: when the chef opened the walkthrough — from which the time it
//     took for the project to be served is measured.
//   - `brigade-projets-suivi.json`, written by the station alone — where each
//     requested project stands:
//       { "brigade": "projets-suivi", "format": 1, "a": "<ISO>", "projets": [
//         { "nom": "parade", "etat": "servi", "dit": "…", "autoriser": [],
//           "serviLe": "<ISO>" | null } ] }
// The JSON keys are the persisted format, read by the app: the field names of
// the types below are those keys.
import { EFFORTS, MODELES } from "../calibrage.ts";
import { NOM_DE_PROJET } from "../runtime.ts";

export const PROJECTS_FILE = "brigade-projets.json";
export const TRACKING_FILE = "brigade-projets-suivi.json";
export const FORMAT = 1;

// A GitHub repo: `<owner>/<repo>`.
export const REPO = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?\/[A-Za-z0-9_.-]{1,100}$/;
// A branch, as written on a configuration line.
const BRANCH = /^[A-Za-z0-9._/-]{1,200}$/;

export type Calibration = { modele: string; effort: string };

export type RequestedProject = {
  nom: string;
  depot: string;
  base: string;
  principale: boolean;
  cooks: number;
  manager: Calibration;
  reviewer: Calibration;
  ouvertLe: string | null;
  demandeLe: string | null;
};

export type Request = { projets: RequestedProject[]; problemes: string[] };

// - `servi`: the station serves it, it is in its list;
// - `a-autoriser`: the station's Apps are not installed on the repo —
//   `autoriser` carries the GitHub pages where the chef authorizes them;
// - `en-preparation`: the station clones the repo and records its decisions;
// - `refuse`: the station cannot serve it, `dit` says why;
// - `secondaire`: the station is not its main one — it runs neither its
//   manager nor its pass.
export type ProjectState = "servi" | "a-autoriser" | "en-preparation" | "refuse" | "secondaire";

export type ProjectTracking = { nom: string; etat: ProjectState; dit: string; autoriser: string[]; serviLe: string | null };

const isText = (value: unknown): value is string => typeof value === "string";
const dateOf = (value: unknown): string | null => (isText(value) && !Number.isNaN(Date.parse(value)) ? value : null);

function calibration(read: unknown): Calibration | null {
  const { modele, effort } = (read ?? {}) as Record<string, unknown>;
  return isText(modele) && (MODELES as readonly string[]).includes(modele) && isText(effort) && (EFFORTS as readonly string[]).includes(effort) ? { modele, effort } : null;
}

// Reads what the app wrote. An unreadable project only affects itself: it is
// reported, and the others are served. A wholly unreadable file is `null`: the
// station touches nothing rather than remove what it serves.
export function readRequest(raw: string): Request | null {
  let parsed: { brigade?: unknown; projets?: unknown };
  try {
    parsed = JSON.parse(raw) as typeof parsed;
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== "object" || parsed.brigade !== "projets" || !Array.isArray(parsed.projets)) return null;
  const projets: RequestedProject[] = [];
  const problemes: string[] = [];
  for (const entry of parsed.projets as unknown[]) {
    const { nom, depot, base, principale, cooks, manager, reviewer, ouvertLe, demandeLe } = (entry ?? {}) as Record<string, unknown>;
    const label = isText(nom) ? `« ${nom.slice(0, 40)} »` : "sans nom";
    const reject = (why: string) => void problemes.push(`projet ${label} demandé par l'app : ${why}`);
    if (!isText(nom) || !NOM_DE_PROJET.test(nom)) reject("nom de projet invalide — attendu un identifiant court en minuscules, chiffres et tirets");
    else if (projets.some((project) => project.nom === nom)) reject("demandé deux fois");
    else if (!isText(depot) || !REPO.test(depot)) reject("dépôt invalide — attendu <owner>/<repo>");
    else if (!isText(base) || !BRANCH.test(base)) reject("branche d'intégration invalide");
    else if (typeof principale !== "boolean") reject("on ne sait pas si cette station en est la principale");
    else if (typeof cooks !== "number" || !Number.isSafeInteger(cooks) || cooks < 1) reject("plafond de cooks invalide — attendu un entier, 1 ou plus");
    else {
      const [managerCalibration, reviewerCalibration] = [calibration(manager), calibration(reviewer)];
      if (managerCalibration === null || reviewerCalibration === null) reject(`calibrage du ${managerCalibration === null ? "manager" : "reviewer"} invalide — attendu un modèle (${MODELES.join(", ")}) et un effort (${EFFORTS.join(", ")})`);
      else projets.push({ nom, depot, base, principale, cooks, manager: managerCalibration, reviewer: reviewerCalibration, ouvertLe: dateOf(ouvertLe), demandeLe: dateOf(demandeLe) });
    }
  }
  return { projets, problemes };
}

// What the station writes about its requested projects.
export function trackingDocument(projects: ProjectTracking[], instant: number): string {
  return `${JSON.stringify({ brigade: "projets-suivi", format: FORMAT, a: new Date(instant).toISOString(), projets: projects }, null, 2)}\n`;
}
