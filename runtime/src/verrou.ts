// Verrou par projet : jamais deux runtimes sur le même répertoire d'état.
//
// C'est une transaction d'écriture tenue pendant toute la vie du process, sur
// un fichier SQLite dédié — distinct du journal, pour que la CLI puisse y
// écrire. Le verrou appartient au noyau : un crash ou un `kill -9` le libère,
// il n'y a jamais de verrou orphelin à nettoyer. Condition : le répertoire
// d'état est sur un disque local, pas sur un montage réseau.
import { join } from "node:path";
import { Base, estOccupee } from "./base.ts";

export class VerrouTenu extends Error {
  constructor(repertoireEtat: string) {
    super(`le verrou de ${repertoireEtat} est tenu par un autre process`);
    this.name = "VerrouTenu";
  }
}

export type Verrou = { relacher(): void };

export function prendreVerrou(repertoireEtat: string): Verrou {
  const base = new Base(join(repertoireEtat, "lock.db"));
  try {
    base.script("BEGIN IMMEDIATE");
  } catch (erreur) {
    base.fermer();
    if (estOccupee(erreur)) throw new VerrouTenu(repertoireEtat);
    throw erreur;
  }
  return {
    relacher() {
      base.script("ROLLBACK");
      base.fermer();
    },
  };
}
