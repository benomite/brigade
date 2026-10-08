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

// Vrai si l'erreur dit qu'un autre process tient la base en écriture
// (SQLITE_BUSY), et rien d'autre.
export function estOccupee(erreur: unknown): boolean {
  return erreur instanceof Error && (erreur as { errcode?: number }).errcode === 5;
}

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
      // Sur un disque plein ou une erreur d'E/S, SQLite a déjà annulé la
      // transaction : ce ROLLBACK lève alors à son tour, et ne doit pas
      // masquer l'erreur d'origine.
      try {
        this.#db.exec("ROLLBACK");
      } catch {}
      throw erreur;
    } finally {
      this.#profondeur = 0;
    }
  }

  // Écrit dans `chemin` une copie complète et cohérente de la base — l'état
  // d'une transaction de lecture —, sans gêner celui qui y écrit. Une base
  // ouverte ne se copie pas autrement : ses fichiers ne se correspondent qu'à
  // travers SQLite.
  instantane(chemin: string): void {
    this.#db.prepare("VACUUM INTO ?").run(chemin);
  }

  // Compteur qui change dès qu'une AUTRE connexion — donc un autre process —
  // a modifié la base. Les écritures de cette connexion ne le changent pas.
  versionDonnees(): number {
    return Number(this.lire<{ data_version: number }>("PRAGMA data_version")[0]?.data_version);
  }

  fermer(): void {
    this.#db.close();
  }
}
