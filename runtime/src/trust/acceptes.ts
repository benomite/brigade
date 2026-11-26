// Les éléments acceptés (#4421) : une issue ou un commentaire dont le texte a
// été accepté le reste, même après un redémarrage, et n'est pas redemandé. Le
// fichier se relit à l'ouverture et se réécrit à chaque acceptation, en entier,
// par un fichier provisoire renommé : une coupure ne le laisse jamais à moitié.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

type ElementAccepte = { kind: "issue" | "comment"; id: number };

export type Acceptes = {
  accept(item: ElementAccepte): void;
  isAccepted(item: ElementAccepte): boolean;
};

// Un fichier illisible n'est ni lu vide ni écrasé : ce qu'il retenait serait perdu.
export class AcceptesIllisibles extends Error {}

const cleDe = (item: ElementAccepte): string => {
  if ((item.kind !== "issue" && item.kind !== "comment") || !Number.isSafeInteger(item.id) || item.id <= 0) throw new Error(`élément accepté invalide : ${JSON.stringify(item)}`);
  return `${item.kind}:${item.id}`;
};

function lire(fichier: string): Set<string> {
  if (!existsSync(fichier)) return new Set();
  let lu: unknown;
  try {
    lu = JSON.parse(readFileSync(fichier, "utf8"));
  } catch (erreur) {
    throw new AcceptesIllisibles(`${fichier} illisible — ${erreur instanceof Error ? erreur.message : String(erreur)}`);
  }
  const accepted = (lu as { accepted?: unknown } | null)?.accepted;
  if (!Array.isArray(accepted) || !accepted.every((cle) => typeof cle === "string" && /^(issue|comment):[1-9]\d*$/.test(cle))) throw new AcceptesIllisibles(`${fichier} illisible — « accepted » n'est pas une liste d'éléments`);
  return new Set(accepted as string[]);
}

export function ouvrirAcceptes(fichier: string): Acceptes {
  const acceptes = lire(fichier);
  return {
    accept(item) {
      const cle = cleDe(item);
      if (acceptes.has(cle)) return;
      const suivants = new Set(acceptes).add(cle);
      mkdirSync(dirname(fichier), { recursive: true });
      const provisoire = `${fichier}.${process.pid}.tmp`;
      writeFileSync(provisoire, `${JSON.stringify({ accepted: [...suivants] }, null, 2)}\n`);
      renameSync(provisoire, fichier);
      acceptes.add(cle);
    },
    isAccepted(item) {
      return acceptes.has(cleDe(item));
    },
  };
}
