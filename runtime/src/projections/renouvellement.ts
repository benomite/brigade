// La session Max du compte, vue sans ses identifiants : ce que le runtime a lu
// en dernier du fichier d'état du renouvellement, et la dernière reconnexion
// que le journal connaît — un « reprendre » après une connexion tombée, ou
// après l'annonce de son échéance. C'est ici que se lit « la session va-t-elle
// tomber ? » ; « est-elle tombée ? » se lit des stations.
import type { Base } from "../base.ts";
import type { FaitGardeFous } from "../evenements/garde-fous.ts";
import { PREAVIS_PAR_DEFAUT_S, VIE_PAR_DEFAUT_S, type EchecDeRenouvellement, type FaitRenouvellement, type ObservationDeSession } from "../evenements/renouvellement.ts";
import type { FaitStation } from "../evenements/station.ts";
import { definirProjection } from "../projection.ts";
import { jetonObserve } from "./jeton.ts";
import { stationsDeconnectees } from "./stations.ts";

const ligne = (base: Base) => base.executer("INSERT OR IGNORE INTO session_max (id) VALUES (1)");

export const renouvellement = definirProjection<FaitRenouvellement | Extract<FaitStation, { type: "station.disconnected" }> | Extract<FaitGardeFous, { type: "kitchen.resumed" }>>({
  nom: "renouvellement",
  tables: ["session_max"],
  schema: `
    CREATE TABLE IF NOT EXISTS session_max (
      id             INTEGER PRIMARY KEY CHECK (id = 1),
      observation    TEXT,
      reconnected_at TEXT,
      -- Une connexion est tombée, et aucun « reprendre » ne l'a suivie.
      disconnected   INTEGER NOT NULL DEFAULT 0
    ) STRICT;
  `,
  sur: {
    "session.observed": (base, { payload }) => {
      ligne(base);
      base.executer("UPDATE session_max SET observation = ? WHERE id = 1", JSON.stringify(payload));
    },
    "session.reconnected": (base, { at }) => {
      ligne(base);
      base.executer("UPDATE session_max SET reconnected_at = ?, disconnected = 0 WHERE id = 1", at);
    },
    "session.restored": (base, { at }) => {
      ligne(base);
      base.executer("UPDATE session_max SET reconnected_at = ?, disconnected = 0 WHERE id = 1", at);
    },
    "station.disconnected": (base) => {
      ligne(base);
      base.executer("UPDATE session_max SET disconnected = 1 WHERE id = 1");
    },
    // « reprendre » après une connexion tombée : le chef l'a refaite.
    "kitchen.resumed": (base, { at }) => {
      base.executer("UPDATE session_max SET reconnected_at = ?, disconnected = 0 WHERE id = 1 AND disconnected = 1", at);
    },
  },
});

// D'où vient l'échéance estimée : le dernier renouvellement réussi, la
// dernière écriture des identifiants vue par le renouvellement, ou la
// dernière reconnexion connue du journal — la plus récente des trois.
export type Origine = "renewed" | "written" | "reconnected";

// L'annonce de l'échéance. `since` : l'échec, ou l'instant où l'échéance est
// entrée dans le préavis. `expires` : l'échéance estimée, nulle quand rien ne
// dit quand la session a été ouverte. `failure` : non nul, le renouvellement a
// échoué et rien ne l'a rattrapé.
export type AlerteDeSession = { since: string; expires: string | null; origin: { at: string; what: Origine } | null; lifetimeS: number; failure: EchecDeRenouvellement | null };

const lire = (base: Base) => {
  const lue = base.lire<{ observation: string | null; reconnected_at: string | null }>("SELECT observation, reconnected_at FROM session_max WHERE id = 1")[0];
  return { observation: lue?.observation ? (JSON.parse(lue.observation) as ObservationDeSession) : null, reconnectee: lue?.reconnected_at ?? null };
};

// Ce que le runtime a écrit en dernier du fichier d'état, s'il l'a lu.
export const sessionObservee = (base: Base): ObservationDeSession | null => lire(base).observation;
// La dernière reconnexion que le journal connaît, s'il en connaît une.
export const derniereReconnexion = (base: Base): string | null => lire(base).reconnectee;

// Ce que la file annonce de la session Max à `maintenant`, ou rien. Rien quand
// une connexion est déjà tombée : la file dit alors depuis quand, et le geste.
// Que le renouvellement tourne ou non, l'échéance entrée dans le préavis
// s'annonce — il peut échouer — ; la ligne sort d'elle-même quand un
// renouvellement réussi fait repartir l'échéance.
// Rien non plus quand un jeton longue durée est configuré : il n'y a plus de
// renouvellement, et c'est l'échéance du jeton qui s'annonce (`projections/jeton.ts`).
export function alerteDeSession(base: Base, maintenant: Date): AlerteDeSession | null {
  if (jetonObserve(base)?.token) return null;
  if (stationsDeconnectees(base).length > 0) return null;
  const { observation, reconnectee } = lire(base);
  const lifetimeS = observation?.lifetimeS ?? VIE_PAR_DEFAUT_S;
  const warningS = observation?.warningS ?? PREAVIS_PAR_DEFAUT_S;
  const origines: { at: string; what: Origine }[] = [
    ...(observation?.renewed ? [{ at: observation.renewed, what: "renewed" as const }] : []),
    ...(observation?.written ? [{ at: observation.written, what: "written" as const }] : []),
    ...(reconnectee ? [{ at: reconnectee, what: "reconnected" as const }] : []),
  ];
  // La plus récente ; à égalité, la première nommée.
  const origin = origines.reduce<(typeof origines)[number] | null>((retenue, candidate) => (retenue === null || Date.parse(candidate.at) > Date.parse(retenue.at) ? candidate : retenue), null);
  const expires = origin === null ? null : new Date(Date.parse(origin.at) + lifetimeS * 1000).toISOString();

  const failure = observation?.failure ?? null;
  if (failure !== null && (reconnectee === null || Date.parse(failure.at) > Date.parse(reconnectee))) return { since: failure.at, expires, origin, lifetimeS, failure };

  if (expires === null) return null;
  const preavis = Date.parse(expires) - warningS * 1000;
  return maintenant.getTime() < preavis ? null : { since: new Date(preavis).toISOString(), expires, origin, lifetimeS, failure: null };
}
