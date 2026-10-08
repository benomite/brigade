// Le journal d'un projet : une table d'événements en ajout seul, dans
// <répertoire d'état>/log.db. Tout l'état du runtime en dérive.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { Base } from "./base.ts";
import type { Ajout, Evenement } from "./evenements.ts";
import type { Projection } from "./projection.ts";
import { PROJECTIONS } from "./projections.ts";

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS events (
    seq       INTEGER PRIMARY KEY AUTOINCREMENT,
    at        TEXT NOT NULL CHECK (length(at) > 0),
    project   TEXT NOT NULL CHECK (length(project) > 0),
    ticket    INTEGER,
    type      TEXT NOT NULL CHECK (length(type) > 0),
    author    TEXT NOT NULL CHECK (length(author) > 0),
    payload   TEXT NOT NULL CHECK (json_valid(payload)),
    dedup_key TEXT UNIQUE
  ) STRICT;
  CREATE INDEX IF NOT EXISTS events_ticket ON events (ticket, seq);
  CREATE TRIGGER IF NOT EXISTS events_no_update BEFORE UPDATE ON events
    BEGIN SELECT RAISE(ABORT, 'events : journal en ajout seul, modification refusée'); END;
  CREATE TRIGGER IF NOT EXISTS events_no_delete BEFORE DELETE ON events
    BEGIN SELECT RAISE(ABORT, 'events : journal en ajout seul, suppression refusée'); END;
  CREATE TABLE IF NOT EXISTS cursors (
    consumer TEXT PRIMARY KEY,
    seq      INTEGER NOT NULL
  ) STRICT;
`;

// Les lecteurs (la CLI) ne bloquent pas l'écrivain, et un événement validé
// survit à une coupure de courant.
const PRAGMAS = "PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;";

// Un autre process peut écrire dans le même journal (la CLI, pour une commande
// du chef) : une écriture attend son tour au lieu d'échouer.
const ATTENTE_ECRITURE_MS = 5000;

const COLONNES = "seq, at, project, ticket, type, author, payload";

type LigneEvenement = {
  seq: number;
  at: string;
  project: string;
  ticket: number | null;
  type: string;
  author: string;
  payload: string;
};

export type OptionsJournal = {
  lectureSeule?: boolean;
  maintenant?: () => Date;
  // Par défaut, le registre du runtime.
  projections?: Projection[];
};

export class Journal {
  readonly base: Base;
  #maintenant: () => Date;
  #projections: Projection[];

  constructor(base: Base, maintenant: () => Date, projections: Projection[]) {
    this.base = base;
    this.#maintenant = maintenant;
    this.#projections = projections;
  }

  // Écrit l'événement et l'applique aux projections, dans une seule
  // transaction : jamais d'événement sans son effet, ni l'inverse. Rend
  // l'événement écrit, ou null si sa clé d'unicité était déjà au journal.
  ajouter(ajout: Ajout): Evenement | null {
    return this.base.transaction(() => {
      const { changements, dernierId } = this.base.executer(
        `INSERT INTO events (at, project, ticket, type, author, payload, dedup_key)
         VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (dedup_key) DO NOTHING`,
        this.#maintenant().toISOString(),
        ajout.project,
        ajout.ticket,
        ajout.type,
        ajout.author,
        JSON.stringify(ajout.payload),
        ajout.dedupKey ?? null,
      );
      if (changements === 0) return null;
      const evenement = this.#lire("WHERE seq = ?", dernierId)[0];
      if (!evenement) throw new Error(`événement ${dernierId} introuvable après son écriture`);
      for (const projection of this.#projections) projection.appliquer(this.base, evenement);
      return evenement;
    });
  }

  tout(): Evenement[] {
    return this.#lire("");
  }

  // Les événements postérieurs à `seq`, dans l'ordre.
  depuis(seq: number): Evenement[] {
    return this.#lire("WHERE seq > ?", seq);
  }

  duTicket(ticket: number): Evenement[] {
    return this.#lire("WHERE ticket = ?", ticket);
  }

  // Fait traiter à `traiter` chaque événement que le consommateur `nom` n'a pas
  // encore vu, puis avance son curseur — dans une seule transaction, avec les
  // événements que `traiter` ajoute en réaction. Une panne au milieu ne perd
  // rien et ne rejoue rien à moitié. Rend le nombre d'événements traités.
  consommer(nom: string, traiter: (evenement: Evenement) => void): number {
    return this.base.transaction(() => {
      const curseur = this.base.lire<{ seq: number }>("SELECT seq FROM cursors WHERE consumer = ?", nom)[0]?.seq ?? 0;
      const evenements = this.depuis(curseur);
      const dernier = evenements.at(-1);
      if (!dernier) return 0;
      for (const evenement of evenements) traiter(evenement);
      this.base.executer(
        "INSERT INTO cursors (consumer, seq) VALUES (?, ?) ON CONFLICT (consumer) DO UPDATE SET seq = excluded.seq",
        nom,
        dernier.seq,
      );
      return evenements.length;
    });
  }

  // Vide les projections et les recalcule en rejouant tout le journal. L'état
  // obtenu doit être celui d'avant : c'est ce qui fait du journal la seule
  // vérité.
  reconstruire(): void {
    this.base.transaction(() => {
      for (const projection of this.#projections) {
        for (const table of projection.tables) this.base.executer(`DELETE FROM ${table}`);
      }
      for (const evenement of this.tout()) {
        for (const projection of this.#projections) projection.appliquer(this.base, evenement);
      }
    });
  }

  fermer(): void {
    this.base.fermer();
  }

  #lire(condition: string, ...parametres: number[]): Evenement[] {
    return this.base
      .lire<LigneEvenement>(`SELECT ${COLONNES} FROM events ${condition} ORDER BY seq`, ...parametres)
      .map((ligne) => ({ ...ligne, payload: JSON.parse(ligne.payload) }) as Evenement);
  }
}

export function cheminJournal(repertoireEtat: string): string {
  return join(repertoireEtat, "log.db");
}

export function ouvrirJournal(repertoireEtat: string, options: OptionsJournal = {}): Journal {
  const chemin = cheminJournal(repertoireEtat);
  const maintenant = options.maintenant ?? (() => new Date());
  const projections = options.projections ?? PROJECTIONS;
  if (options.lectureSeule) {
    if (!existsSync(chemin)) throw new Error(`aucun journal dans ${repertoireEtat}`);
    return new Journal(new Base(chemin, { lectureSeule: true }), maintenant, projections);
  }
  const base = new Base(chemin, { attenteMs: ATTENTE_ECRITURE_MS });
  base.script(PRAGMAS);
  base.script(SCHEMA);
  for (const projection of projections) base.script(projection.schema);
  return new Journal(base, maintenant, projections);
}
