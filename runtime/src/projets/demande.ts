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
//     Un déménagement de sa cuisine (`demenagement/`) ajoute, sur la station
//     qu'il quitte, `"remise": { "vers": "<station>", "gist": "<son gist>",
//     "demandeLe": "<ISO>" }` (avec `principale: false`), et sur celle qui le
//     reprend `"reprise": { "de": "<station>", "gist": "<son gist>",
//     "demandeLe": "<ISO>" }` (avec `principale: true`). L'app doit les garder
//     tels quels quand elle réécrit la demande : sans eux, le déménagement en
//     cours n'est plus qu'un changement de principale.
//   - `brigade-projets-suivi.json`, écrit par la station seule — où en est
//     chaque projet demandé, et où il cuit :
//       { "brigade": "projets-suivi", "format": 1, "a": "<ISO>",
//         "station": { "nom": "mac", "locale": true }, "projets": [
//         { "nom": "parade", "etat": "servi", "dit": "…", "autoriser": [],
//           "serviLe": "<ISO>" | null, "cuitSur": "mac" | null, "ici": true,
//           "bascule": null | { "de": "box", "vers": "mac", "demandeLe": "<ISO>",
//             "etape": "demandee" | "acceptee" | "refusee" | "remise" | "recue" } } ] }
//     `station.locale` : cette station est celle de l'ordinateur du chef (une
//     cuisine locale, sous macOS). `cuitSur` : la station où le projet cuit, telle
//     que celle-ci la connaît — nul si elle n'en sait rien ; `ici` : il cuit sur
//     celle-ci, et c'est l'ordinateur du chef.
//     `onboarding` (absent s'il est vide) : pour chaque projet dont la station
//     est la principale, par son nom, où il en est de son ajout à son premier
//     ticket — ses quatre étapes, la courante, le geste attendu du chef, le
//     ticket de préparation (`onboarding/etat.ts`, `Onboarding`).
import { EFFORTS, MODELES } from "../calibrage.ts";
import type { Onboarding } from "../onboarding/etat.ts";
import { NOM_DE_PROJET } from "../runtime.ts";

export const FICHIER_PROJETS = "brigade-projets.json";
export const FICHIER_SUIVI = "brigade-projets-suivi.json";
export const FORMAT = 1;

// Un dépôt GitHub : `<owner>/<repo>`.
export const DEPOT = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?\/[A-Za-z0-9_.-]{1,100}$/;
// Une branche, telle qu'elle s'écrit sur une ligne de la configuration.
const BRANCHE = /^[A-Za-z0-9._/-]{1,200}$/;

export type Calibre = { modele: string; effort: string };

// Un déménagement, vu de la station que la cuisine quitte (`remise`) ou de
// celle qui la reprend (`reprise`) : l'autre station, son gist — par où elles
// se répondent —, et l'instant de la demande, qui le fait reconnaître.
export type Remise = { vers: string; gist: string; demandeLe: string };
export type Reprise = { de: string; gist: string; demandeLe: string };

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
  remise?: Remise | null;
  reprise?: Reprise | null;
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

// Où en est un déménagement, vu de cette station :
// - `demandee` : elle sert encore le projet, la station qui doit le reprendre
//   ne s'est pas dite prête ;
// - `acceptee` : elle est prête à le reprendre, et attend que l'autre le lui remette ;
// - `refusee` : elle ne peut pas le reprendre — `dit` dit pourquoi, et rien ne
//   bouge : l'autre le sert toujours ;
// - `remise` : la station qu'il quitte a fermé sa cuisine et publié son état ;
// - `recue` : celle qui le reprend a posé cet état, et le sert.
export type EtapeDeBascule = "demandee" | "acceptee" | "refusee" | "remise" | "recue";
export type Bascule = { de: string; vers: string; demandeLe: string; etape: EtapeDeBascule };

export type SuiviDuProjet = {
  nom: string;
  etat: EtatDuProjet;
  dit: string;
  autoriser: string[];
  serviLe: string | null;
  cuitSur?: string | null;
  ici?: boolean;
  bascule?: Bascule | null;
};

const ETAPES: readonly string[] = ["demandee", "acceptee", "refusee", "remise", "recue"];

const texte = (valeur: unknown): valeur is string => typeof valeur === "string";
const date = (valeur: unknown): string | null => (texte(valeur) && !Number.isNaN(Date.parse(valeur)) ? valeur : null);
const nomDeStation = (valeur: unknown): valeur is string => texte(valeur) && valeur.trim() !== "" && valeur.length <= 100;
const gist = (valeur: unknown): valeur is string => texte(valeur) && /^[A-Za-z0-9]{1,64}$/.test(valeur);

function remiseLue(lue: unknown): Remise | null {
  const { vers, gist: sien, demandeLe } = (lue ?? {}) as Record<string, unknown>;
  return nomDeStation(vers) && gist(sien) && date(demandeLe) !== null ? { vers, gist: sien, demandeLe: demandeLe as string } : null;
}

function repriseLue(lue: unknown): Reprise | null {
  const { de, gist: sien, demandeLe } = (lue ?? {}) as Record<string, unknown>;
  return nomDeStation(de) && gist(sien) && date(demandeLe) !== null ? { de, gist: sien, demandeLe: demandeLe as string } : null;
}

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
    const { nom, depot, base, principale, cooks, manager, reviewer, ouvertLe, demandeLe, remise, reprise } = (brut ?? {}) as Record<string, unknown>;
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
      else {
        // Un déménagement illisible n'est qu'ignoré, et dit : le projet reste
        // demandé tel que le reste de sa ligne le dit.
        const [laRemise, laReprise] = [remise === undefined || remise === null ? null : remiseLue(remise), reprise === undefined || reprise === null ? null : repriseLue(reprise)];
        if (remise !== undefined && remise !== null && laRemise === null) problemes.push(`projet ${dit} demandé par l'app : son déménagement (remise) est illisible — attendu la station qui le reprend, son gist et l'instant de la demande ; il est ignoré`);
        if (reprise !== undefined && reprise !== null && laReprise === null) problemes.push(`projet ${dit} demandé par l'app : son déménagement (reprise) est illisible — attendu la station qu'il quitte, son gist et l'instant de la demande ; il est ignoré`);
        projets.push({
          nom,
          depot,
          base,
          principale,
          cooks,
          manager: pourManager,
          reviewer: pourReviewer,
          ouvertLe: date(ouvertLe),
          demandeLe: date(demandeLe),
          // Une remise ne se fait que depuis une station qui n'en est plus la
          // principale ; une reprise, que vers celle qui l'est.
          ...(laRemise !== null && !principale ? { remise: laRemise } : {}),
          ...(laReprise !== null && principale ? { reprise: laReprise } : {}),
        });
      }
    }
  }
  return { projets, problemes };
}

// Le fichier que l'app écrit dans le gist d'une station — et le déménagement,
// pour elle (`demenagement/demenager.ts`).
export function documentDeDemande(projets: readonly ProjetDemande[]): string {
  return `${JSON.stringify({ brigade: "projets", format: FORMAT, projets }, null, 2)}\n`;
}

// Ce que la station dit d'un déménagement, relu dans le suivi d'une autre.
export function lireBascule(lue: unknown): Bascule | null {
  const { de, vers, demandeLe, etape } = (lue ?? {}) as Record<string, unknown>;
  return nomDeStation(de) && nomDeStation(vers) && date(demandeLe) !== null && texte(etape) && ETAPES.includes(etape) ? { de, vers, demandeLe: demandeLe as string, etape: etape as EtapeDeBascule } : null;
}

// Ce qu'une autre station a écrit de ce projet dans son suivi, ou null.
export function suiviDe(brut: string | undefined, nom: string): (Pick<SuiviDuProjet, "etat" | "dit"> & { bascule: Bascule | null }) | null {
  if (brut === undefined) return null;
  try {
    const lu = JSON.parse(brut) as { brigade?: unknown; projets?: unknown };
    if (lu?.brigade !== "projets-suivi" || !Array.isArray(lu.projets)) return null;
    const projet = (lu.projets as unknown[]).find((brut) => (brut as Record<string, unknown> | null)?.nom === nom) as Record<string, unknown> | undefined;
    if (projet === undefined || !texte(projet.etat)) return null;
    return { etat: projet.etat as EtatDuProjet, dit: texte(projet.dit) ? projet.dit : "", bascule: lireBascule(projet.bascule) };
  } catch {
    return null;
  }
}

// Ce que la station écrit de ses projets demandés. `station` : son nom, et si
// elle est celle de l'ordinateur du chef. `onboarding` : où en est chaque
// projet dont elle est la principale, de son ajout à son premier ticket
// (`onboarding/`), par son nom — absent s'il n'y en a aucun.
export function documentDeSuivi(projets: SuiviDuProjet[], instant: number, station?: { nom: string; locale: boolean }, onboarding: Record<string, Onboarding> = {}): string {
  const avecOnboarding = Object.keys(onboarding).length === 0 ? {} : { onboarding };
  return `${JSON.stringify({ brigade: "projets-suivi", format: FORMAT, a: new Date(instant).toISOString(), ...(station === undefined ? {} : { station }), projets, ...avecOnboarding }, null, 2)}\n`;
}
