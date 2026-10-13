// Ce que la dernière comparaison de la version en service à la branche de son
// origine a dit. C'est ici que se lit « une version attend-elle ? » — et la
// réponse ne vaut que pour le runtime qui l'a écrite : un démarrage l'efface,
// le code servi a pu changer avec lui. Tant qu'aucune comparaison n'a suivi,
// rien n'est dit, donc rien n'est dit « à jour ».
import type { Base } from "../base.ts";
import type { FaitRuntime } from "../evenements/runtime.ts";
import type { Comparaison, FaitVersion } from "../evenements/version.ts";
import { definirProjection } from "../projection.ts";

// `depuis` : pour une version en attente, l'instant de la plus ancienne
// livraison qui n'est pas en service ; sinon, celui de la première comparaison
// qui a répondu ainsi — une origine muette depuis une heure le dit, même si
// son motif a changé entre-temps.
export type VersionComparee = { projet: string; depuis: string; comparaison: Comparaison };

export const version = definirProjection<FaitVersion | Extract<FaitRuntime, { type: "runtime.started" }>>({
  nom: "version",
  tables: ["version_compared"],
  schema: `
    CREATE TABLE IF NOT EXISTS version_compared (
      id      INTEGER PRIMARY KEY CHECK (id = 1),
      project TEXT NOT NULL,
      since   TEXT NOT NULL,
      outcome TEXT NOT NULL,
      payload TEXT NOT NULL
    ) STRICT;
  `,
  sur: {
    "runtime.started": (base) => base.executer("DELETE FROM version_compared"),
    "version.compared": (base, evenement) => {
      const { payload } = evenement;
      const suite = base.lire<{ since: string }>("SELECT since FROM version_compared WHERE id = 1 AND outcome = ?", payload.outcome)[0]?.since;
      const depuis = payload.outcome === "waiting" ? payload.since : (suite ?? evenement.at);
      base.executer("INSERT OR REPLACE INTO version_compared (id, project, since, outcome, payload) VALUES (1, ?, ?, ?, ?)", evenement.project, depuis, payload.outcome, JSON.stringify(payload));
    },
  },
});

// Nulle tant que le runtime en marche n'a rien comparé : il ne tourne pas sur
// une version posée par la bascule, ou sa première comparaison n'a pas fini.
export function versionComparee(base: Base): VersionComparee | null {
  const lue = base.lire<{ project: string; since: string; payload: string }>("SELECT project, since, payload FROM version_compared WHERE id = 1")[0];
  return lue === undefined ? null : { projet: lue.project, depuis: lue.since, comparaison: JSON.parse(lue.payload) as Comparaison };
}
