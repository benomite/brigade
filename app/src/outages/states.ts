// Ce qu'une station publie de ses pannes, tel que l'app le lit sur GitHub : sa dernière mise à
// jour quand elle a raté et que la station est revenue en arrière, et sa connexion Max. Le format
// est celui de la station (runtime/src/appairage/document.ts, `miseAJour` et `connexionMax`) ;
// outages.ts en tire les lignes de la home.
export type UpdateRevenue = { visee: string; restauree: string; le: string; retourRate: boolean };
export type PublishedConnection = { etat: "connectee" | "perdue" | "inconnue"; depuis: string | null };
export type StatesPublies = { miseAJour: UpdateRevenue | null; connexionMax: PublishedConnection | null };

// Une version telle que la mise à jour les nomme (runtime/src/mise-a-jour/versions.ts) : rien
// d'autre ne se pose dans une ligne.
const VERSION = /^[0-9][A-Za-z0-9.+~]{0,39}$/;
const STATES = ["connectee", "perdue", "inconnue"] as const;
const date = (valeur: unknown): valeur is string => typeof valeur === "string" && !Number.isNaN(Date.parse(valeur));
const version = (valeur: unknown): valeur is string => typeof valeur === "string" && VERSION.test(valeur);

// Ce que le document d'une station dit de ses pannes. Une station d'avant ces champs, ou qui les
// écrit mal, n'en dit rien.
export function lireStatesPublies(lu: Record<string, unknown>): StatesPublies {
  const mise = lu.miseAJour as Partial<Record<keyof UpdateRevenue, unknown>> | null | undefined;
  const connection = lu.connexionMax as Partial<Record<keyof PublishedConnection, unknown>> | null | undefined;
  return {
    miseAJour:
      mise !== null && typeof mise === "object" && version(mise.visee) && version(mise.restauree) && date(mise.le)
        ? { visee: mise.visee, restauree: mise.restauree, le: mise.le, retourRate: mise.retourRate === true }
        : null,
    connexionMax:
      connection !== null && typeof connection === "object" && STATES.includes(connection.etat as (typeof STATES)[number])
        ? { etat: connection.etat as PublishedConnection["etat"], depuis: date(connection.depuis) ? connection.depuis : null }
        : null,
  };
}

