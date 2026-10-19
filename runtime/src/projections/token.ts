// Le jeton longue durée de la connexion Max, vu sans sa valeur : ce que le
// runtime a lu en dernier de la date de sa création, et quand. C'est ici que
// se lit « le jeton va-t-il échoir ? ».
import type { Base } from "../base.ts";
import type { FaitJeton, ObservationDuJeton } from "../events/token.ts";
import { definirProjection } from "../projection.ts";

const JOUR_MS = 24 * 3600 * 1000;

export const jeton = definirProjection<FaitJeton>({
  nom: "jeton",
  tables: ["jeton_claude"],
  schema: `
    CREATE TABLE IF NOT EXISTS jeton_claude (
      id          INTEGER PRIMARY KEY CHECK (id = 1),
      observation TEXT NOT NULL,
      observed_at TEXT NOT NULL
    ) STRICT;
  `,
  sur: {
    "token.observed": (base, { payload, at }) => {
      base.executer(
        "INSERT INTO jeton_claude (id, observation, observed_at) VALUES (1, ?, ?) ON CONFLICT (id) DO UPDATE SET observation = excluded.observation, observed_at = excluded.observed_at",
        JSON.stringify(payload),
        at,
      );
    },
  },
});

const lire = (base: Base) => {
  const lue = base.lire<{ observation: string; observed_at: string }>("SELECT observation, observed_at FROM jeton_claude WHERE id = 1")[0];
  return lue === undefined ? null : { observation: JSON.parse(lue.observation) as ObservationDuJeton, at: lue.observed_at };
};

// Ce que le runtime a écrit en dernier de la date du jeton, s'il l'a écrit.
export const jetonObserve = (base: Base): ObservationDuJeton | null => lire(base)?.observation ?? null;

// L'annonce de l'échéance du jeton. `since` : l'entrée dans le préavis,
// l'échéance passée, ou la lecture qui n'a pas trouvé de date. `expires` :
// l'échéance, nulle quand la date de création ne se lit pas. `state` : ce qui
// en est — près de son échéance, échu, ou sa date illisible.
export type AlerteDuJeton = {
  since: string;
  state: "soon" | "expired" | "unknown";
  token: string;
  file: string;
  created: string | null;
  expires: string | null;
  lifetimeDays: number;
  reason: Exclude<ObservationDuJeton["state"], "read" | "none"> | null;
};

// Ce que la file annonce du jeton à `maintenant`, ou rien : rien sans jeton
// configuré, rien avant le préavis. Une seule entrée, quel que soit le nombre
// de lectures : elle se recalcule du dernier fait, et sa date ne bouge pas.
export function alerteDuJeton(base: Base, maintenant: Date): AlerteDuJeton | null {
  const lue = lire(base);
  if (lue === null || lue.observation.token === null || lue.observation.file === null) return null;
  const { observation, at } = lue;
  const commun = { token: lue.observation.token, file: lue.observation.file, lifetimeDays: observation.lifetimeDays };
  if (observation.state !== "read" || observation.created === null) {
    return { ...commun, since: at, state: "unknown", created: null, expires: null, reason: observation.state === "read" || observation.state === "none" ? "invalid" : observation.state };
  }
  const echeance = Date.parse(observation.created) + observation.lifetimeDays * JOUR_MS;
  const expires = new Date(echeance).toISOString();
  const alerte = { ...commun, created: observation.created, expires, reason: null };
  if (maintenant.getTime() >= echeance) return { ...alerte, since: expires, state: "expired" };
  const preavis = echeance - observation.warningDays * JOUR_MS;
  return maintenant.getTime() < preavis ? null : { ...alerte, since: new Date(preavis).toISOString(), state: "soon" };
}
