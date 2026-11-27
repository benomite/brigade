// Une colonne du rail qui passe de cartes à aucune (#2151) : l'app le dit dans son journal, une ligne par colonne, avec la
// lecture qui l'a fait — son heure, celle où la box a publié le rail lu, ce que chaque colonne porte désormais, et où sont
// passées les cartes qui l'ont quittée. Ce n'est pas une panne : un cook qui finit vide Taken. C'est ce qui explique la
// prochaine fois que des cartes disparaissent de la vue alors que GitHub les tient encore.
//
// Seule une lecture qui a dessiné le rail compte : une lecture ratée ne vide aucune colonne — la vue garde le dernier rail
// lu (vue.js, `surFaits`), comme le process principal garde ses derniers faits (facts.ts, `estRateeDuTableau`).
import type { Drawable } from "./facts.ts";

type Read = { a: string; publieLe?: string; colonnes: Map<string, number[]> };

const cards = (count: number) => `${count} card${count > 1 ? "s" : ""}`;
const published = ({ publieLe: publishedThe }: Pick<Read, "publieLe">) => (publishedThe === undefined ? "its publication time not given" : `published by the box at ${publishedThe}`);

// `dire` : où va chaque ligne — la sortie d'erreur de l'app, et son fichier (main.ts).
export function holdTheColumns(tell: (line: string) => void) {
  const last = new Map<string, Read>();
  return {
    // Ce que le process principal envoie à la vue : rend les lignes dites, dans l'ordre des colonnes.
    voir(receivedOne: Drawable): string[] {
      if (!("tableau" in receivedOne)) return [];
      const { colonnes: columns, hors: outside } = receivedOne.tableau.rail;
      const readEntry: Read = { a: receivedOne.a, ...(receivedOne.publieLe === undefined ? {} : { publieLe: receivedOne.publieLe }), colonnes: new Map(columns.map(({ nom: name, cartes: itsOwn }) => [name, itsOwn.map(({ ticket }) => ticket)])) };
      const before = last.get(receivedOne.projet);
      last.set(receivedOne.projet, readEntry);
      if (before === undefined) return [];
      const or = (ticket: number) => {
        const column = [...readEntry.colonnes].find(([, tickets]) => tickets.includes(ticket))?.[0];
        if (column !== undefined) return `#${ticket} now in ${column}`;
        return outside.some((card) => card.ticket === ticket) ? `#${ticket} now outside the columns` : `#${ticket} not in this reading`;
      };
      const now = [...readEntry.colonnes].map(([name, tickets]) => `${name} ${tickets.length}`).join(" · ");
      const saidEntries = [...before.colonnes].flatMap(([name, tickets]) => {
        if (tickets.length === 0 || (readEntry.colonnes.get(name)?.length ?? 0) > 0) return [];
        return [
          `brigade: ${receivedOne.projet} — the ${name} column went from ${cards(tickets.length)} to none (${tickets.map(or).join(", ")}), by the reading of ${readEntry.a}, ${published(readEntry)}; the one before was read at ${before.a}, ${published(before)}. Columns now: ${now}`,
        ];
      });
      for (const line of saidEntries) tell(line);
      return saidEntries;
    },
  };
}
