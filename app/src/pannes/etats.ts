// Ce qu'une station publie de ses pannes, tel que l'app le lit sur GitHub : sa dernière mise à
// jour quand elle a raté et que la station est revenue en arrière, et sa connexion Max. Le format
// est celui de la station (runtime/src/appairage/document.ts, `miseAJour` et `connexionMax`) ;
// pannes.ts en tire les lignes de la home.
export type MiseAJourRevenue = { visee: string; restauree: string; le: string; retourRate: boolean };
export type ConnexionPubliee = { etat: "connectee" | "perdue" | "inconnue"; depuis: string | null };
export type EtatsPublies = { miseAJour: MiseAJourRevenue | null; connexionMax: ConnexionPubliee | null };

// Une version telle que la mise à jour les nomme (runtime/src/mise-a-jour/versions.ts) : rien
// d'autre ne se pose dans une ligne.
const VERSION = /^[0-9][A-Za-z0-9.+~]{0,39}$/;
const ETATS = ["connectee", "perdue", "inconnue"] as const;
const date = (valeur: unknown): valeur is string => typeof valeur === "string" && !Number.isNaN(Date.parse(valeur));
const version = (valeur: unknown): valeur is string => typeof valeur === "string" && VERSION.test(valeur);

// Ce que le document d'une station dit de ses pannes. Une station d'avant ces champs, ou qui les
// écrit mal, n'en dit rien.
export function lireEtatsPublies(lu: Record<string, unknown>): EtatsPublies {
  const mise = lu.miseAJour as Partial<Record<keyof MiseAJourRevenue, unknown>> | null | undefined;
  const connexion = lu.connexionMax as Partial<Record<keyof ConnexionPubliee, unknown>> | null | undefined;
  return {
    miseAJour:
      mise !== null && typeof mise === "object" && version(mise.visee) && version(mise.restauree) && date(mise.le)
        ? { visee: mise.visee, restauree: mise.restauree, le: mise.le, retourRate: mise.retourRate === true }
        : null,
    connexionMax:
      connexion !== null && typeof connexion === "object" && ETATS.includes(connexion.etat as (typeof ETATS)[number])
        ? { etat: connexion.etat as ConnexionPubliee["etat"], depuis: date(connexion.depuis) ? connexion.depuis : null }
        : null,
  };
}

