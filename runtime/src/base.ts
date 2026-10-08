// Seul module du runtime qui importe node:sqlite. Tout accès à une base passe
// par ici : si node:sqlite se révélait insuffisant, le repli (better-sqlite3,
// API proche) ne toucherait que ce fichier.
import { DatabaseSync } from "node:sqlite";

export type Valeur = string | number | bigint | null;
export type Ligne = Record<string, Valeur>;

export type OptionsBase = {
  lectureSeule?: boolean;
  // Durée pendant laquelle une écriture attend qu'un autre process libère la
  // base. Zéro : échouer sur-le-champ.
  attenteMs?: number;
};

export class Base {
  #db: DatabaseSync;
  #profondeur = 0;

  constructor(chemin: string, options: OptionsBase = {}) {
    this.#db = new DatabaseSync(chemin, {
      readOnly: options.lectureSeule ?? false,
      timeout: options.attenteMs ?? 0,
    });
  }

  // Plusieurs instructions d'un coup, sans paramètre : schéma et pragmas.
  script(sql: string): void {
    this.#db.exec(sql);
  }

  executer(sql: string, ...parametres: Valeur[]): { changements: number; dernierId: number } {
    const resultat = this.#db.prepare(sql).run(...parametres);
    return { changements: Number(resultat.changes), dernierId: Number(resultat.lastInsertRowid) };
  }

  lire<L = Ligne>(sql: string, ...parametres: Valeur[]): L[] {
    // node:sqlite rend des objets sans prototype : on en fait des objets
    // ordinaires, pour qu'ils se comparent et s'affichent comme les autres.
    return this.#db.prepare(sql).all(...parametres).map((ligne) => ({ ...ligne })) as L[];
  }

  // Transaction d'écriture : le verrou est pris dès l'ouverture (BEGIN
  // IMMEDIATE), donc ce que `fn` lit ne peut pas changer avant qu'elle écrive.
  // Imbriquée, elle se fond dans la transaction englobante : tout est validé
  // ou annulé ensemble.
  transaction<T>(fn: () => T): T {
    if (this.#profondeur > 0) return fn();
    this.#db.exec("BEGIN IMMEDIATE");
    this.#profondeur = 1;
    try {
      const resultat = fn();
      this.#db.exec("COMMIT");
      return resultat;
    } catch (erreur) {
      this.#db.exec("ROLLBACK");
      throw erreur;
    } finally {
      this.#profondeur = 0;
    }
  }

  fermer(): void {
    this.#db.close();
  }
}
