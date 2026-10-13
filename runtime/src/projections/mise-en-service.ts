// Où en est la mise en service que le chef a demandée au runtime : elle attend
// le rail calme, le geste de box est parti, ou il a rendu la main sans rien
// redémarrer. C'est ici que se lit « une mise en service est-elle demandée ? »
// — par la file, et par tout ce qui lance un cook : tant qu'une demande vit,
// aucun ne part. Comme la comparaison de version, la réponse ne vaut que pour
// le runtime qui l'a écrite : un démarrage l'efface — celui que le geste
// provoque, ou un autre, après lequel le chef redemande.
import type { Base } from "../base.ts";
import type { FaitMiseEnService } from "../evenements/mise-en-service.ts";
import type { FaitRuntime } from "../evenements/runtime.ts";
import { definirProjection } from "../projection.ts";

// `etat` : `waiting`, elle attend le rail calme — ou le prochain réveil du
// runtime ; `launched`, le geste de box est parti. `depuis` : l'instant de la
// demande. `coupe` : le chef a demandé de ne pas attendre le rail calme.
// `lanceeLe` : l'instant où le geste est parti.
export type Demande = { etat: "waiting" | "launched"; depuis: string; coupe: boolean; lanceeLe: string | null };

// Le dernier geste de box qui a rendu la main sans que ce runtime ait été
// redémarré — jusqu'à ce qu'un autre parte. `fin` : la fin de ce qu'il a écrit ; `erreur` : il n'a pas pu
// être lancé.
export type Rendu = { lanceLe: string; renduLe: string; code: number | null; signal: string | null; fin: string; erreur: string | null };

type Ligne = { state: Demande["etat"]; requestedAt: string; cut: number; launchedAt: string | null };

const lireDemande = (base: Base) => base.lire<Ligne>("SELECT state, requested_at AS requestedAt, cut, launched_at AS launchedAt FROM deploy_demand WHERE id = 1")[0];

export const miseEnService = definirProjection<FaitMiseEnService | Extract<FaitRuntime, { type: "runtime.started" }>>({
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
      exited_at   TEXT NOT NULL,
      code        INTEGER,
      signal      TEXT,
      tail        TEXT NOT NULL,
      error       TEXT
    ) STRICT;
  `,
  sur: {
    "runtime.started": (base) => {
      base.executer("DELETE FROM deploy_demand");
      base.executer("DELETE FROM deploy_outcome");
    },
    "deploy.requested": (base, { at, payload }) => {
      const demande = lireDemande(base);
      // Le geste parti, il n'y a plus rien à demander : il ne part qu'une fois.
      if (demande?.state === "launched") return;
      // Redemandée, elle garde son heure ; une coupure demandée le reste.
      if (demande) base.executer("UPDATE deploy_demand SET cut = ? WHERE id = 1", demande.cut === 1 || payload.cut ? 1 : 0);
      else base.executer("INSERT INTO deploy_demand (id, state, requested_at, cut) VALUES (1, 'waiting', ?, ?)", at, payload.cut ? 1 : 0);
    },
    "deploy.cancelled": (base) => base.executer("DELETE FROM deploy_demand WHERE state = 'waiting'"),
    "deploy.launched": (base, { at }) => {
      // Ce que le geste précédent avait rendu ne vaut plus : un autre part.
      base.executer("DELETE FROM deploy_outcome");
      base.executer(
        `INSERT INTO deploy_demand (id, state, requested_at, cut, launched_at) VALUES (1, 'launched', ?, 0, ?)
         ON CONFLICT (id) DO UPDATE SET state = 'launched', launched_at = excluded.launched_at`,
        at,
        at,
      );
    },
    "deploy.exited": (base, { at, payload }) => {
      const lancee = lireDemande(base)?.launchedAt ?? at;
      base.executer("DELETE FROM deploy_demand");
      base.executer(
        "INSERT OR REPLACE INTO deploy_outcome (id, launched_at, exited_at, code, signal, tail, error) VALUES (1, ?, ?, ?, ?, ?, ?)",
        lancee,
        at,
        Number.isSafeInteger(payload.code) ? payload.code : null,
        typeof payload.signal === "string" ? payload.signal : null,
        typeof payload.tail === "string" ? payload.tail : "",
        typeof payload.error === "string" ? payload.error : null,
      );
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

// Ce que le dernier geste de box a rendu, s'il a rendu la main à ce runtime.
export function dernierRendu(base: Base): Rendu | null {
  return (
    base.lire<Rendu>("SELECT launched_at AS lanceLe, exited_at AS renduLe, code, signal, tail AS fin, error AS erreur FROM deploy_outcome WHERE id = 1")[0] ?? null
  );
}
