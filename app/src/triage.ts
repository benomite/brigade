// Ce que le triage a fait chaque jour (#1283, épique #1277) : les cartes qu'il a tranchées seul, et celles qu'il a
// laissées entrer dans TODO. `facts` les donne dans `triage` (docs/runtime/etat-et-mesures.md) : sept jours (UTC),
// le plus ancien d'abord, un jour sans issue à zéro et zéro. La file les pose en tête, le plus récent d'abord,
// de quoi comparer un jour au suivant d'un coup d'œil.
//
// Ce module tient ce que la vue ne calcule pas : la lecture du champ, et la ligne de chaque jour, nommée.
// Ce que `facts` dit d'un jour (runtime/src/carte-todo.ts, `TriagesDuJour`).
export type JourLu = { day: string; decidedAlone: number; sentToTodo: number };
// Un jour, tel que la vue le pose : son nom (« today », « yesterday », « Oct 19 »), la date entière au survol.
export type JourDeTriage = { jour: string; date: string; decidedAlone: number; sentToTodo: number };

const MOIS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const JOUR_UTC = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PAR_JOUR = 86_400_000;

// Le champ `triage` d'un `facts` : une liste de jours, chacun avec ses deux comptes. Un champ qui n'a pas cette
// forme n'est pas lu — le rail se dessine sans, comme pour un runtime d'avant ce champ.
export function triageLu(brut: unknown): JourLu[] | undefined {
  if (!Array.isArray(brut)) return undefined;
  const jours: JourLu[] = [];
  for (const un of brut as unknown[]) {
    if (typeof un !== "object" || un === null) return undefined;
    const { day, decidedAlone, sentToTodo } = un as Record<string, unknown>;
    const compte = (valeur: unknown): valeur is number => typeof valeur === "number" && Number.isSafeInteger(valeur) && valeur >= 0;
    if (typeof day !== "string" || !JOUR_UTC.test(day) || !compte(decidedAlone) || !compte(sentToTodo)) return undefined;
    jours.push({ day, decidedAlone, sentToTodo });
  }
  return jours;
}

// Le nom d'un jour, d'après l'heure de la lecture : « today » et « yesterday » ont le jour UTC de `lu`, comme le
// runtime compte ses jours.
function nom(day: string, lu: string): string {
  const [, , mois, jour] = JOUR_UTC.exec(day) as RegExpExecArray;
  const ecart = Math.round((Date.parse(lu.slice(0, 10)) - Date.parse(day)) / MS_PAR_JOUR);
  if (ecart === 0) return "today";
  if (ecart === 1) return "yesterday";
  return `${MOIS[Number(mois) - 1]} ${Number(jour)}`;
}

// Les jours à poser : le plus récent d'abord, chacun sous son nom. Rien à poser sans jours.
export function triageDe(jours: JourLu[] | undefined, lu: string): JourDeTriage[] | undefined {
  if (jours === undefined || jours.length === 0) return undefined;
  return [...jours]
    .sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0))
    .map(({ day, decidedAlone, sentToTodo }) => ({ jour: nom(day, lu), date: day, decidedAlone, sentToTodo }));
}
