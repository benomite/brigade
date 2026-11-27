// Ce qu'une station publie de ses pannes, tel que l'app le lit sur GitHub : sa dernière mise à
// jour quand elle a raté et que la station est revenue en arrière, et sa connexion Max. Le format
// est celui de la station (runtime/src/appairage/document.ts, `miseAJour` et `connexionMax`) ;
// outages.ts en tire les lignes de la home.
export type UpdateBack = { visee: string; restauree: string; le: string; retourRate: boolean };
export type PublishedConnection = { etat: "connectee" | "perdue" | "inconnue"; depuis: string | null };
export type StatesPublished = { miseAJour: UpdateBack | null; connexionMax: PublishedConnection | null };

// Une version telle que la mise à jour les nomme (runtime/src/mise-a-jour/versions.ts) : rien
// d'autre ne se pose dans une ligne.
const VERSION = /^[0-9][A-Za-z0-9.+~]{0,39}$/;
const STATES = ["connectee", "perdue", "inconnue"] as const;
const date = (value: unknown): value is string => typeof value === "string" && !Number.isNaN(Date.parse(value));
const version = (value: unknown): value is string => typeof value === "string" && VERSION.test(value);

// Ce que le document d'une station dit de ses pannes. Une station d'avant ces champs, ou qui les
// écrit mal, n'en dit rien.
export function readStatesPublished(readOne: Record<string, unknown>): StatesPublished {
  const putting = readOne.miseAJour as Partial<Record<keyof UpdateBack, unknown>> | null | undefined;
  const connection = readOne.connexionMax as Partial<Record<keyof PublishedConnection, unknown>> | null | undefined;
  return {
    miseAJour:
      putting !== null && typeof putting === "object" && version(putting.visee) && version(putting.restauree) && date(putting.le)
        ? { visee: putting.visee, restauree: putting.restauree, le: putting.le, retourRate: putting.retourRate === true }
        : null,
    connexionMax:
      connection !== null && typeof connection === "object" && STATES.includes(connection.etat as (typeof STATES)[number])
        ? { etat: connection.etat as PublishedConnection["etat"], depuis: date(connection.depuis) ? connection.depuis : null }
        : null,
  };
}

