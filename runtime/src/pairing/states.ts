// What the station publishes about its breakdowns, at each sign of life: the
// last update, when it failed and the station rolled back (update/state.ts),
// and the machine's Max connection (max-connection/). The app reads them on
// GitHub and says them in one line, with a button, on the station's line
// (app/src/pannes/). Nothing else leaves: neither the reason for a failure,
// nor the cause of a loss, nor the action a terminal would take.
import type { ConnexionMax } from "../max-connection/connection.ts";
import type { EtatMiseAJour } from "../update/state.ts";
import type { PublishedStates, RolledBackUpdate } from "./document.ts";

export function rolledBackUpdate(state: EtatMiseAJour | null): RolledBackUpdate | null {
  const last = state?.derniere;
  if (last === null || last === undefined || last.quoi !== "revenue") return null;
  return { visee: last.visee, restauree: last.restauree, le: last.le, retourRate: last.retour !== null };
}

export function publishedStates(update: EtatMiseAJour | null, connection: ConnexionMax | null): PublishedStates {
  return { miseAJour: rolledBackUpdate(update), connexionMax: connection === null ? null : { etat: connection.etat, depuis: connection.depuis } };
}
