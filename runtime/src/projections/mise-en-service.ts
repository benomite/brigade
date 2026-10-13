// Où en est la mise en service que le chef a demandée au runtime : elle attend
// le rail calme, le geste de box est parti — et ce qu'il est advenu du dernier
// qui est parti. C'est ici que se lit « une mise en service est-elle
// demandée ? » — par la file, et par tout ce qui lance un cook : tant qu'une
// demande vit, aucun ne part.
//
// La demande ne vaut que pour le runtime qui l'a reçue : un démarrage l'efface
// — celui que le geste provoque, ou un autre, après lequel le chef redemande.
// Ce que le dernier geste a donné, lui, survit aux démarrages : un échec se lit
// encore après le redémarrage qu'il a provoqué, jusqu'à ce qu'un autre geste
// parte ou que la version en service ne soit plus celle qu'il a laissée.
import type { Base } from "../base.ts";
import type { FaitMiseEnService } from "../evenements/mise-en-service.ts";
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
// parti. `issue` : nulle tant que personne n'a écrit ce qu'il a donné — il
// tourne, ou le runtime qui l'a lancé n'est plus là pour le dire.
export type Geste = { lanceLe: string; avant: string | null; issue: Issue | null };
// Un geste qui n'a pas mis sa version en service, et l'a dit.
export type GesteRendu = Geste & { issue: Extract<Issue, { quoi: "exited" | "returned" }> };

type Ligne = { state: Demande["etat"]; requestedAt: string; cut: number; launchedAt: string | null };
type LigneDeGeste = {
  launchedAt: string;
  origin: string | null;
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
    "SELECT launched_at AS launchedAt, origin, outcome, settled_at AS settledAt, served, refused, reason, code, signal, tail, error FROM deploy_outcome WHERE id = 1",
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
      // Ce que le geste précédent avait donné ne vaut plus : un autre part.
      base.executer("INSERT OR REPLACE INTO deploy_outcome (id, launched_at, origin) VALUES (1, ?, ?)", at, texte(payload.served));
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
  return lue === undefined ? null : { lanceLe: lue.launchedAt, avant: lue.origin, issue: issueDe(lue) };
}

// Le dernier geste, s'il a dit ne pas avoir mis sa version en service — ce que
// la file montre tant qu'aucune demande ne vit.
export function dernierGesteRendu(base: Base): GesteRendu | null {
  const geste = dernierGeste(base);
  return geste !== null && geste.issue !== null && geste.issue.quoi !== "served" ? { ...geste, issue: geste.issue } : null;
}
