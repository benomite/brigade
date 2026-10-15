// Ce que la mise à jour a donné, relayé par la station au journal de chaque
// projet qu'elle sert — et lu de là par la file. La mise à jour le note dans
// son répertoire (`BRIGADE_MISE_A_JOUR_DIR`) ; la station le relit à
// l'ouverture de chaque projet, puis dès qu'il change, et n'écrit chaque
// issue qu'une fois (sa clé d'unicité).
import { statSync } from "node:fs";
import { join } from "node:path";
import type { Base } from "../base.ts";
import type { Fait } from "../evenements.ts";
import type { FaitMiseAJour } from "../evenements/mise-a-jour.ts";
import type { Runtime } from "../runtime.ts";
import { direIssue } from "./dire.ts";
import { ISSUES, lireIssues, type Issue } from "./etat.ts";

const AUTEUR = "runtime";
// Une issue plus vieille n'est plus relayée : un projet ajouté longtemps après
// n'a pas à la porter.
const RELAYEE_MS = 7 * 24 * 3_600_000;
// Combien de temps la file dit la dernière mise à jour : l'heure seule, sans
// le jour, tromperait au-delà.
export const DITE_MS = 24 * 3_600_000;

const TYPES = ["update.installed", "update.reverted"] as const;

function enFait(issue: Issue): FaitMiseAJour {
  return issue.quoi === "passee"
    ? { type: "update.installed", payload: { version: issue.version, previous: issue.depuis, at: issue.le } }
    : { type: "update.reverted", payload: { target: issue.visee, restored: issue.restauree, reason: issue.motif, at: issue.le, restoreFailed: issue.retour } };
}

function enIssue(fait: FaitMiseAJour): Issue {
  return fait.type === "update.installed"
    ? { quoi: "passee", version: fait.payload.version, depuis: fait.payload.previous, le: fait.payload.at }
    : { quoi: "revenue", visee: fait.payload.target, restauree: fait.payload.restored, motif: fait.payload.reason, le: fait.payload.at, retour: fait.payload.restoreFailed };
}

// Recopie au journal du projet les issues qu'il ne porte pas encore. Rend
// combien il en a écrit.
export function relayer(runtime: Pick<Runtime, "projet" | "journal">, dossier: string, maintenant = new Date()): number {
  let ecrites = 0;
  for (const issue of lireIssues(dossier)) {
    if (maintenant.getTime() - Date.parse(issue.le) > RELAYEE_MS) continue;
    const fait = enFait(issue);
    const cle = `update:${fait.type}:${issue.le}:${issue.quoi === "passee" ? issue.version : issue.visee}`;
    if (runtime.journal.ajouter({ project: runtime.projet, ticket: null, author: AUTEUR, dedupKey: cle, ...(fait as Fait) })) ecrites++;
  }
  return ecrites;
}

// Branche le relais sur la cuisine d'un projet : il relit le fichier des
// issues à l'ouverture, puis dès qu'il change — regardé toutes les deux
// secondes, sans le lire. `dossier` nul : la station n'a pas de mise à jour
// (le poste de dev, un test) — rien n'est relayé.
export function brancherMiseAJour<R extends Runtime>(runtime: R, dossier: string | null, dire: (ligne: string) => void = () => {}, intervalleMs = 2000): R {
  if (dossier === null) return runtime;
  const fichier = join(dossier, ISSUES);
  let vu = "";
  let dit = "";
  const relayerSansRompre = () => {
    let empreinte: string;
    try {
      const { size, mtimeMs } = statSync(fichier);
      empreinte = `${size}:${mtimeMs}`;
    } catch {
      empreinte = "absent";
    }
    if (empreinte === vu) return;
    try {
      relayer(runtime, dossier);
      vu = empreinte;
      dit = "";
    } catch (erreur) {
      // Réessayé au regard suivant ; dit une fois.
      const motif = erreur instanceof Error ? erreur.message : String(erreur);
      if (motif !== dit) dire(`brigade : mise à jour non relayée au journal — ${motif}`);
      dit = motif;
    }
  };
  relayerSansRompre();
  const veille = setInterval(relayerSansRompre, intervalleMs);
  veille.unref();
  return {
    ...runtime,
    arreter(signal) {
      clearInterval(veille);
      runtime.arreter(signal);
    },
  };
}

// La dernière mise à jour de la station, telle que la file la dit — tant
// qu'elle date de moins d'un jour à `maintenant`. Nulle sinon.
export function miseAJourDuJour(base: Base, maintenant = new Date()): { le: string; ligne: string } | null {
  const [derniere] = base.lire<{ type: FaitMiseAJour["type"]; payload: string }>(`SELECT type, payload FROM events WHERE type IN (${TYPES.map(() => "?").join(", ")}) ORDER BY seq DESC LIMIT 1`, ...TYPES);
  if (derniere === undefined) return null;
  const issue = enIssue({ type: derniere.type, payload: JSON.parse(derniere.payload) } as FaitMiseAJour);
  const age = maintenant.getTime() - Date.parse(issue.le);
  return age >= 0 && age < DITE_MS ? { le: issue.le, ligne: direIssue(issue) } : null;
}
