// Les éléments acceptés (#4421) : une issue ou un commentaire d'un auteur qui
// n'est pas de confiance, que le chef a accepté. L'accord est gardé sur disque,
// dans le répertoire d'état du projet : il tient après un redémarrage, et rien
// n'est redemandé.
//
// Le fichier : `{ "accepted": ["issue:42", "comment:7"] }`. Absent, rien n'est
// accepté. Illisible — JSON cassé, forme inconnue, lecture refusée —, son
// ouverture lève : il n'est jamais lu vide, puis écrasé.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const FICHIER_DES_ACCEPTES = "accepted.json";

export type Element = { kind: "issue" | "comment"; id: number };
export type Acceptes = { accept(item: Element): void; isAccepted(item: Element): boolean };

export const fichierDesAcceptes = (repertoireEtat: string) => join(repertoireEtat, FICHIER_DES_ACCEPTES);

const cleDe = ({ kind, id }: Element) => `${kind}:${id}`;
const CLE = /^(issue|comment):[1-9]\d*$/;

function lire(fichier: string): Set<string> {
  let brut: string;
  try {
    brut = readFileSync(fichier, "utf8");
  } catch (erreur) {
    if ((erreur as NodeJS.ErrnoException).code === "ENOENT") return new Set();
    throw erreur;
  }
  let lu: unknown;
  try {
    lu = JSON.parse(brut);
  } catch {
    throw new Error(`${fichier} is not JSON: the accepted items are not read`);
  }
  const acceptes = (lu as { accepted?: unknown } | null)?.accepted;
  if (!Array.isArray(acceptes) || !acceptes.every((cle) => typeof cle === "string" && CLE.test(cle))) {
    throw new Error(`${fichier} is not a list of accepted items: the accepted items are not read`);
  }
  return new Set(acceptes as string[]);
}

export function ouvrirAcceptes(fichier: string): Acceptes {
  const acceptes = lire(fichier);
  return {
    accept(item) {
      // Une clé que la relecture refuserait n'est jamais écrite : le fichier ne se lirait plus.
      if (!CLE.test(cleDe(item))) throw new Error(`${item.kind} ${item.id} is not an issue or a comment id`);
      // Relu avant d'écrire : un accord qu'un autre process a écrit depuis l'ouverture n'est pas perdu.
      const surDisque = lire(fichier);
      for (const cle of acceptes) surDisque.add(cle);
      surDisque.add(cleDe(item));
      mkdirSync(dirname(fichier), { recursive: true });
      writeFileSync(`${fichier}.tmp`, `${JSON.stringify({ accepted: [...surDisque].sort() })}\n`);
      renameSync(`${fichier}.tmp`, fichier);
      for (const cle of surDisque) acceptes.add(cle);
    },
    isAccepted(item) {
      return acceptes.has(cleDe(item));
    },
  };
}
