// Une colonne du rail qui passe de cartes à aucune (#2151) : l'app le dit dans son journal, une ligne par colonne, avec la
// lecture qui l'a fait — son heure, celle où la box a publié le rail lu, ce que chaque colonne porte désormais, et où sont
// passées les cartes qui l'ont quittée. Ce n'est pas une panne : un cook qui finit vide Taken. C'est ce qui explique la
// prochaine fois que des cartes disparaissent de la vue alors que GitHub les tient encore.
//
// Seule une lecture qui a dessiné le rail compte : une lecture ratée ne vide aucune colonne — la vue garde le dernier rail
// lu (vue.js, `surFaits`), comme le process principal garde ses derniers faits (faits.ts, `estRateeDuTableau`).
import type { Dessinable } from "./faits.ts";

type Lue = { a: string; publieLe?: string; colonnes: Map<string, number[]> };

const cartes = (nombre: number) => `${nombre} card${nombre > 1 ? "s" : ""}`;
const publiee = ({ publieLe }: Pick<Lue, "publieLe">) => (publieLe === undefined ? "its publication time not given" : `published by the box at ${publieLe}`);

// `dire` : où va chaque ligne — la sortie d'erreur de l'app, et son fichier (main.ts).
export function tenirLesColonnes(dire: (ligne: string) => void) {
  const dernieres = new Map<string, Lue>();
  return {
    // Ce que le process principal envoie à la vue : rend les lignes dites, dans l'ordre des colonnes.
    voir(recue: Dessinable): string[] {
      if (!("tableau" in recue)) return [];
      const { colonnes, hors } = recue.tableau.rail;
      const lue: Lue = { a: recue.a, ...(recue.publieLe === undefined ? {} : { publieLe: recue.publieLe }), colonnes: new Map(colonnes.map(({ nom, cartes: siennes }) => [nom, siennes.map(({ ticket }) => ticket)])) };
      const avant = dernieres.get(recue.projet);
      dernieres.set(recue.projet, lue);
      if (avant === undefined) return [];
      const ou = (ticket: number) => {
        const colonne = [...lue.colonnes].find(([, tickets]) => tickets.includes(ticket))?.[0];
        if (colonne !== undefined) return `#${ticket} now in ${colonne}`;
        return hors.some((carte) => carte.ticket === ticket) ? `#${ticket} now outside the columns` : `#${ticket} not in this reading`;
      };
      const maintenant = [...lue.colonnes].map(([nom, tickets]) => `${nom} ${tickets.length}`).join(" · ");
      const dites = [...avant.colonnes].flatMap(([nom, tickets]) => {
        if (tickets.length === 0 || (lue.colonnes.get(nom)?.length ?? 0) > 0) return [];
        return [
          `brigade: ${recue.projet} — the ${nom} column went from ${cartes(tickets.length)} to none (${tickets.map(ou).join(", ")}), by the reading of ${lue.a}, ${publiee(lue)}; the one before was read at ${avant.a}, ${publiee(avant)}. Columns now: ${maintenant}`,
        ];
      });
      for (const ligne of dites) dire(ligne);
      return dites;
    },
  };
}
