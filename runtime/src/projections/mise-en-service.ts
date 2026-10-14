// Où en est la mise en service que le chef a demandée au runtime : elle attend
// le rail calme, le geste de box est parti — et ce qu'il est advenu du dernier
// qui est parti, demandé ou lancé seul. C'est ici que se lit « une mise en
// service est-elle demandée ? » — par la file, et par tout ce qui lance un
// cook : tant qu'une demande vit, aucun ne part. Un essai que le runtime lance
// seul n'est pas une demande : il ne retient rien. Et c'est ici que se lit
// « cette version a-t-elle déjà raté ? » : elle n'est pas réessayée.
//
// La demande ne vaut que pour le runtime qui l'a reçue : un démarrage l'efface
// — celui que le geste provoque, ou un autre, après lequel le chef redemande.
// Ce que le dernier geste a donné, lui, survit aux démarrages : un échec se lit
// encore après le redémarrage qu'il a provoqué, jusqu'à ce qu'un autre geste
// parte ou que la version en service ne soit plus celle qu'il a laissée.
import type { Base } from "../base.ts";
import { CLONE_PAS_A_JOUR, type FaitMiseEnService } from "../evenements/mise-en-service.ts";
import type { FaitRuntime } from "../evenements/runtime.ts";
import type { FaitVersion } from "../evenements/version.ts";
import { definirProjection } from "../projection.ts";

// `etat` : `waiting`, elle attend le rail calme — ou le prochain réveil du
// runtime ; `launched`, le geste de box est parti. `depuis` : l'instant de la
// demande. `coupe` : le chef a demandé de ne pas attendre le rail calme.
// `lanceeLe` : l'instant où le geste est parti.
export type Demande = { etat: "waiting" | "launched"; depuis: string; coupe: boolean; lanceeLe: string | null };

// Ce qu'il est advenu d'un geste de box. `le` : l'instant où cela s'est écrit.
// `fin` : la fin de ce que le geste a écrit.
export type Issue =
  // Il a rendu la main au runtime qui l'avait lancé : rien n'a été redémarré.
  // `erreur` : il n'a pas pu être lancé.
  | { quoi: "exited"; le: string; code: number | null; signal: string | null; fin: string; erreur: string | null }
  // Le runtime est reparti sur la version d'avant, `servie`. `refusee`,
  // `motif` : ce que la bascule a noté de son refus, si elle en a noté un.
  | { quoi: "returned"; le: string; servie: string; refusee: string | null; motif: string | null; fin: string }
  // Le runtime est reparti sur une autre version, `servie` : elle est en service.
  | { quoi: "served"; le: string; servie: string };

// Le dernier geste de box parti. `avant` : le commit en service quand il est
// parti. `cible` : la version qu'il essayait — la tête de la branche que la
// comparaison disait en attente —, nulle d'un journal d'avant. `seul` : le
// runtime l'a lancé de lui-même, sans demande du chef. `essais` : combien de
// gestes d'affilée ont visé cette version sans que le clone de brigade ait pu
// être mis à jour, celui-ci compris. Toujours lus de la projection ;
// facultatifs pour qui écrit un geste à la main — l'app, dans ses tests —,
// absents ils valent nul, faux et un. `issue` : nulle tant que personne n'a
// écrit ce qu'il a donné — il tourne, ou le runtime qui l'a lancé n'est plus là
// pour le dire.
export type Geste = { lanceLe: string; avant: string | null; cible?: string | null; seul?: boolean; essais?: number; issue: Issue | null };
// Un geste qui n'a pas mis sa version en service, et l'a dit.
export type GesteRendu = Geste & { issue: Extract<Issue, { quoi: "exited" | "returned" }> };

type Ligne = { state: Demande["etat"]; requestedAt: string; cut: number; launchedAt: string | null };
type LigneDeGeste = {
  launchedAt: string;
  origin: string | null;
  target: string | null;
  auto: number;
  tries: number;
  outcome: Issue["quoi"] | null;
  settledAt: string | null;
  served: string | null;
  refused: string | null;
  reason: string | null;
  code: number | null;
  signal: string | null;
  tail: string;
  error: string | null;
};

const lireDemande = (base: Base) => base.lire<Ligne>("SELECT state, requested_at AS requestedAt, cut, launched_at AS launchedAt FROM deploy_demand WHERE id = 1")[0];
const lireGeste = (base: Base) =>
  base.lire<LigneDeGeste>(
    "SELECT launched_at AS launchedAt, origin, target, auto, tries, outcome, settled_at AS settledAt, served, refused, reason, code, signal, tail, error FROM deploy_outcome WHERE id = 1",
  )[0];

const texte = (valeur: unknown): string | null => (typeof valeur === "string" ? valeur : null);

export const miseEnService = definirProjection<FaitMiseEnService | FaitVersion | Extract<FaitRuntime, { type: "runtime.started" }>>({
  nom: "mise-en-service",
  tables: ["deploy_demand", "deploy_outcome"],
  schema: `
    CREATE TABLE IF NOT EXISTS deploy_demand (
      id           INTEGER PRIMARY KEY CHECK (id = 1),
      state        TEXT NOT NULL,
      requested_at TEXT NOT NULL,
      cut          INTEGER NOT NULL,
      launched_at  TEXT
    ) STRICT;
    CREATE TABLE IF NOT EXISTS deploy_outcome (
      id          INTEGER PRIMARY KEY CHECK (id = 1),
      launched_at TEXT NOT NULL,
      origin      TEXT,
      target      TEXT,
      auto        INTEGER NOT NULL DEFAULT 0,
      tries       INTEGER NOT NULL DEFAULT 1,
      outcome     TEXT,
      settled_at  TEXT,
      served      TEXT,
      refused     TEXT,
      reason      TEXT,
      code        INTEGER,
      signal      TEXT,
      tail        TEXT NOT NULL DEFAULT '',
      error       TEXT
    ) STRICT;
  `,
  sur: {
    // La demande s'éteint avec le runtime qui la tenait ; ce que le dernier
    // geste a donné reste.
    "runtime.started": (base) => base.executer("DELETE FROM deploy_demand"),
    "deploy.requested": (base, { at, payload }) => {
      const demande = lireDemande(base);
      // Le geste parti, il n'y a plus rien à demander : il ne part qu'une fois.
      if (demande?.state === "launched") return;
      // Redemandée, elle garde son heure ; une coupure demandée le reste.
      if (demande) base.executer("UPDATE deploy_demand SET cut = ? WHERE id = 1", demande.cut === 1 || payload.cut ? 1 : 0);
      else base.executer("INSERT INTO deploy_demand (id, state, requested_at, cut) VALUES (1, 'waiting', ?, ?)", at, payload.cut ? 1 : 0);
    },
    "deploy.cancelled": (base) => base.executer("DELETE FROM deploy_demand WHERE state = 'waiting'"),
    "deploy.launched": (base, { at, payload }) => {
      // Ce que le geste précédent avait donné ne vaut plus : un autre part. Il
      // ne reste de lui que le compte des essais de la même version que le
      // clone a empêchés.
      const cible = texte(payload.target);
      const precedent = lireGeste(base);
      const essais = cible !== null && precedent?.target === cible && precedent.outcome === "exited" && precedent.code === CLONE_PAS_A_JOUR ? precedent.tries + 1 : 1;
      base.executer(
        "INSERT OR REPLACE INTO deploy_outcome (id, launched_at, origin, target, auto, tries) VALUES (1, ?, ?, ?, ?, ?)",
        at,
        texte(payload.served),
        cible,
        payload.auto === true ? 1 : 0,
        essais,
      );
      // Lancé seul, il ne retient aucun cook : la cuisine continue pendant
      // l'essai. Une demande du chef qui attendait le rail calme n'a plus
      // d'objet — la version est essayée.
      if (payload.auto === true) {
        base.executer("DELETE FROM deploy_demand");
        return;
      }
      base.executer(
        `INSERT INTO deploy_demand (id, state, requested_at, cut, launched_at) VALUES (1, 'launched', ?, 0, ?)
         ON CONFLICT (id) DO UPDATE SET state = 'launched', launched_at = excluded.launched_at`,
        at,
        at,
      );
    },
    "deploy.exited": (base, { at, payload }) => {
      const lancee = lireGeste(base)?.launchedAt ?? lireDemande(base)?.launchedAt ?? at;
      base.executer("DELETE FROM deploy_demand");
      base.executer("INSERT OR IGNORE INTO deploy_outcome (id, launched_at) VALUES (1, ?)", lancee);
      base.executer(
        "UPDATE deploy_outcome SET outcome = 'exited', settled_at = ?, served = NULL, refused = NULL, reason = NULL, code = ?, signal = ?, tail = ?, error = ? WHERE id = 1",
        at,
        Number.isSafeInteger(payload.code) ? payload.code : null,
        texte(payload.signal),
        texte(payload.tail) ?? "",
        texte(payload.error),
      );
    },
    // Écrit par le runtime qui repart : le dernier mot sur le geste qui l'a
    // redémarré — une version dite en service par un runtime qui n'a pas tenu
    // est redite revenue par celui qui la remplace.
    "deploy.concluded": (base, { at, payload }) => {
      const revenue = payload.outcome === "returned" ? payload : null;
      base.executer(
        "UPDATE deploy_outcome SET outcome = ?, settled_at = ?, served = ?, refused = ?, reason = ?, code = NULL, signal = NULL, tail = ?, error = NULL WHERE id = 1",
        revenue === null ? "served" : "returned",
        at,
        texte(payload.served),
        texte(revenue?.refused),
        texte(revenue?.reason),
        texte(revenue?.tail) ?? "",
      );
    },
    // Un échec ne se lit que tant que la version qu'il a laissée en service y
    // est : à jour, ou servie par un autre commit — une mise en service faite à
    // la main, par exemple —, il n'y a plus rien à en dire.
    "version.compared": (base, { payload }) => {
      const geste = lireGeste(base);
      if (geste === undefined || (geste.outcome !== "exited" && geste.outcome !== "returned")) return;
      const laissee = geste.origin ?? geste.served;
      if (payload.outcome === "current" || (laissee !== null && payload.served !== laissee)) base.executer("DELETE FROM deploy_outcome");
    },
  },
});

// La demande en cours, ou nulle : rien n'est demandé.
export function demandeDeMiseEnService(base: Base): Demande | null {
  const lue = lireDemande(base);
  return lue === undefined ? null : { etat: lue.state, depuis: lue.requestedAt, coupe: lue.cut === 1, lanceeLe: lue.launchedAt };
}

// Vrai tant qu'une demande vit : aucun cook ne part. En attente, la cuisine se
// vide — sans cela, un rail qui enchaîne ne serait jamais calme ; le geste
// parti, un cook lancé serait interrompu par le redémarrage sans que personne
// l'ait demandé.
export const miseEnServiceRetient = (base: Base): boolean => lireDemande(base) !== undefined;

function issueDe(lue: LigneDeGeste): Issue | null {
  const le = lue.settledAt ?? lue.launchedAt;
  switch (lue.outcome) {
    case "exited":
      return { quoi: "exited", le, code: lue.code, signal: lue.signal, fin: lue.tail, erreur: lue.error };
    case "returned":
      return { quoi: "returned", le, servie: lue.served ?? "", refusee: lue.refused, motif: lue.reason, fin: lue.tail };
    case "served":
      return { quoi: "served", le, servie: lue.served ?? "" };
    default:
      return null;
  }
}

// Le dernier geste de box parti, et ce qu'il a donné ; nul : aucun n'est parti,
// ou ce qu'il avait laissé ne vaut plus.
export function dernierGeste(base: Base): Geste | null {
  const lue = lireGeste(base);
  return lue === undefined ? null : { lanceLe: lue.launchedAt, avant: lue.origin, cible: lue.target, seul: lue.auto === 1, essais: lue.tries, issue: issueDe(lue) };
}

// Vrai si le geste a rendu la main sans avoir essayé sa version : le clone de
// brigade n'a pas pu être mis à jour, rien n'a été basculé. La version n'y est
// pour rien — le clone est celui de toute la box, et le geste d'un autre projet
// le tenait peut-être : elle n'a pas raté, elle se réessaie
// (`mettre-en-service.ts`).
export const empecheParLeClone = (geste: Geste | null): boolean => geste?.issue?.quoi === "exited" && geste.issue.code === CLONE_PAS_A_JOUR;

// Ce que le runtime laisse passer avant de réessayer une version que le clone
// a empêchée — le geste d'un autre projet a fini de le mettre à jour —, doublé
// à chaque nouvel empêchement de la même version, jusqu'au plafond : un clone
// durablement en défaut ne fait pas tourner le geste en boucle.
export const REESSAI_DU_CLONE_MS = 5 * 60_000;
export const REESSAI_DU_CLONE_MAX_MS = 4 * 3_600_000;

// L'instant où la version que ce geste visait se réessaie ; nul : le clone ne
// l'a pas empêché.
export function reessaiDuClone(geste: Geste | null, attenteMs = REESSAI_DU_CLONE_MS): number | null {
  if (geste === null || geste.issue === null || !empecheParLeClone(geste)) return null;
  const attente = Math.min(attenteMs * 2 ** Math.max(0, (geste.essais ?? 1) - 1), Math.max(attenteMs, REESSAI_DU_CLONE_MAX_MS));
  return Date.parse(geste.issue.le) + attente;
}

// La version que le dernier geste a essayée sans la mettre en service : celle
// que la bascule a refusée, sinon celle qu'il visait. Nulle : le dernier geste
// n'a pas raté, ou rien ne dit ce qu'il essayait.
export function versionRatee(geste: Geste | null): string | null {
  if (geste === null || geste.issue === null || geste.issue.quoi === "served") return null;
  return (geste.issue.quoi === "returned" ? geste.issue.refusee : null) ?? geste.cible ?? null;
}

// Vrai si cette version a déjà été essayée et a raté : elle n'est pas
// réessayée seule. Ce qui le dit survit aux redémarrages, et s'efface quand la
// version en service change ou se dit à jour. Un geste que le clone a empêché
// n'a rien essayé : sa version n'a pas raté.
export function dejaRatee(base: Base, version: string): boolean {
  const geste = dernierGeste(base);
  if (empecheParLeClone(geste)) return false;
  return geste !== null && geste.issue !== null && geste.issue.quoi !== "served" && (versionRatee(geste) === version || geste.cible === version);
}

// Le dernier geste, s'il a dit ne pas avoir mis sa version en service — ce que
// la file montre tant qu'aucune demande ne vit.
export function dernierGesteRendu(base: Base): GesteRendu | null {
  const geste = dernierGeste(base);
  return geste !== null && geste.issue !== null && geste.issue.quoi !== "served" ? { ...geste, issue: geste.issue } : null;
}
