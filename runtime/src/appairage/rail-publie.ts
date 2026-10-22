// Le rail de chaque projet qu'une station sert, tel qu'elle le publie dans son
// gist (#1432) : l'app d'un ordinateur neuf, qui n'a ni `ssh` vers la station
// ni état local, y lit les mêmes tickets que le Mac lit sur la station
// (`rail-du-projet.ts`). La source est la même : le journal du projet, sur la
// station qui le sert — ce qui se publie est ce que `facts` en dit, ticket pour
// ticket, dans le même ordre et avec le même mot d'état (`rail-du-journal.ts`).
//
// Le fichier `brigade-rail.json`, écrit par la station seule, à chacune de ses
// écritures dans le gist (`presence.ts`) — l'heure de publication est donc le
// signe de vie de son état :
//   { "brigade": "rail", "format": 1,
//     "projets": { "brigade": [ { "ticket": 14, "etat": "pris", "titre": "…", "url": "…" }, … ] } }
// Un projet que la station n'a pas pu lire à cet instant n'y est pas.
//
// Ce module n'importe rien : l'app d'un ordinateur neuf le lit sans journal.

export const FICHIER_RAIL = "brigade-rail.json";
export const FORMAT_DU_RAIL = 1;

// Un ticket du rail, tel que `facts` le dit : `etat` est le mot de son champ `etat`.
export type TicketPublie = { ticket: number; etat: string; titre: string; url: string };
// Le rail de chaque projet, par son nom.
export type RailsPublies = Record<string, TicketPublie[]>;
export type DocumentRail = { brigade: "rail"; format: number; projets: RailsPublies };

export const documentDuRail = (projets: RailsPublies): DocumentRail => ({ brigade: "rail", format: FORMAT_DU_RAIL, projets });

const lisible = (ticket: unknown): ticket is TicketPublie => {
  if (ticket === null || typeof ticket !== "object") return false;
  const { ticket: numero, etat, titre, url } = ticket as Record<string, unknown>;
  return Number.isSafeInteger(numero) && typeof etat === "string" && etat !== "" && typeof titre === "string" && typeof url === "string";
};

// Le rail d'un projet dans ce que la station a publié : ses tickets ; `absent`
// quand elle n'en publie aucun pour lui ; `illisible` quand ce qu'elle publie ne
// se lit pas — un format que ce runtime ne connaît pas compris.
export function railDuDocument(brut: string | undefined, projet: string): { tickets: TicketPublie[] } | "absent" | "illisible" {
  if (brut === undefined) return "absent";
  let lu: unknown;
  try {
    lu = JSON.parse(brut);
  } catch {
    return "illisible";
  }
  if (lu === null || typeof lu !== "object") return "illisible";
  const { brigade, format, projets } = lu as Record<string, unknown>;
  if (brigade !== "rail" || format !== FORMAT_DU_RAIL || projets === null || typeof projets !== "object") return "illisible";
  if (!Object.hasOwn(projets, projet)) return "absent";
  const tickets = (projets as Record<string, unknown>)[projet];
  if (!Array.isArray(tickets) || !tickets.every(lisible)) return "illisible";
  return { tickets: tickets.map(({ ticket, etat, titre, url }) => ({ ticket, etat, titre, url })) };
}
