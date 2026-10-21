// L'historique des tests d'un projet : pour chaque test, chaque tour de tests
// où il a figuré — son issue, sa durée, la date du tour et le commit joué —,
// dans <répertoire d'état>/test-history.db, à côté du journal. Comme le
// journal, un registre en ajout seul : un tour s'y inscrit une fois, sous son
// identifiant, et rien ne s'y modifie ni ne s'en efface. Ce qu'on en demande —
// le dernier échec d'un test, ses tours, leur durée — se relit de ses lignes.
//
// Un test sauté a sa ligne, mais pas de tour à son compte : il n'a rien coûté
// et n'a rien dit.
import { join } from "node:path";
import { Base } from "../../base.ts";
import { idDuTest, type ResultatDeTest } from "./junit.ts";

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS runs (
    run         TEXT PRIMARY KEY CHECK (length(run) > 0),
    at          TEXT NOT NULL CHECK (length(at) > 0),
    commit_sha  TEXT NOT NULL CHECK (length(commit_sha) > 0),
    ingested_at TEXT NOT NULL
  ) STRICT;
  CREATE TABLE IF NOT EXISTS results (
    run         TEXT NOT NULL REFERENCES runs (run),
    test        TEXT NOT NULL CHECK (length(test) > 0),
    file        TEXT NOT NULL,
    name        TEXT NOT NULL,
    outcome     TEXT NOT NULL CHECK (outcome IN ('pass', 'fail', 'skip')),
    duration_ms REAL NOT NULL CHECK (duration_ms >= 0),
    PRIMARY KEY (run, test)
  ) STRICT;
  CREATE INDEX IF NOT EXISTS results_test ON results (test, outcome);
  CREATE TRIGGER IF NOT EXISTS runs_no_update BEFORE UPDATE ON runs
    BEGIN SELECT RAISE(ABORT, 'runs : historique en ajout seul, modification refusée'); END;
  CREATE TRIGGER IF NOT EXISTS runs_no_delete BEFORE DELETE ON runs
    BEGIN SELECT RAISE(ABORT, 'runs : historique en ajout seul, suppression refusée'); END;
  CREATE TRIGGER IF NOT EXISTS results_no_update BEFORE UPDATE ON results
    BEGIN SELECT RAISE(ABORT, 'results : historique en ajout seul, modification refusée'); END;
  CREATE TRIGGER IF NOT EXISTS results_no_delete BEFORE DELETE ON results
    BEGIN SELECT RAISE(ABORT, 'results : historique en ajout seul, suppression refusée'); END;
`;

// Comme le journal : un lecteur ne bloque pas l'écrivain, un tour inscrit
// survit à une coupure, et un second process attend son tour plutôt que
// d'échouer.
const PRAGMAS = "PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;";
const ATTENTE_MS = 5000;

export type Tour = {
  // L'identifiant du tour : l'inscrire une seconde fois n'ajoute rien.
  run: string;
  // Quand le tour a été joué.
  date: Date;
  commit: string;
  resultats: ResultatDeTest[];
};

export type Inscription = { nouveau: boolean; tests: number; echecs: number };

export function cheminHistorique(repertoireEtat: string): string {
  return join(repertoireEtat, "test-history.db");
}

export class Historique {
  readonly base: Base;
  #maintenant: () => Date;

  constructor(base: Base, maintenant: () => Date) {
    this.base = base;
    this.#maintenant = maintenant;
  }

  // Inscrit le tour et chacun de ses tests, d'une seule transaction. Un tour
  // déjà inscrit sous cet identifiant n'ajoute rien : `nouveau` est faux.
  inscrire(tour: Tour): Inscription {
    if (tour.run.length === 0) throw new Error("a test run needs an id");
    if (Number.isNaN(tour.date.getTime())) throw new Error(`the date of test run ${tour.run} is not a date`);
    if (tour.commit.length === 0) throw new Error(`test run ${tour.run} needs a commit`);
    const echecs = tour.resultats.filter((r) => r.issue === "fail").length;
    return this.base.transaction(() => {
      const { changements } = this.base.executer(
        "INSERT INTO runs (run, at, commit_sha, ingested_at) VALUES (?, ?, ?, ?) ON CONFLICT (run) DO NOTHING",
        tour.run,
        tour.date.toISOString(),
        tour.commit,
        this.#maintenant().toISOString(),
      );
      if (changements === 0) return { nouveau: false, tests: tour.resultats.length, echecs };
      for (const resultat of tour.resultats) {
        this.base.executer(
          "INSERT INTO results (run, test, file, name, outcome, duration_ms) VALUES (?, ?, ?, ?, ?, ?)",
          tour.run,
          idDuTest(resultat.fichier, resultat.nom),
          resultat.fichier,
          resultat.nom,
          resultat.issue,
          resultat.dureeMs,
        );
      }
      return { nouveau: true, tests: tour.resultats.length, echecs };
    });
  }

  // La date du dernier tour — le plus récent par sa date, pas par son
  // inscription — où ce test a échoué, ou null s'il n'a jamais échoué.
  lastFailure(test: string): Date | null {
    const at = this.base.lire<{ at: string | null }>("SELECT max(runs.at) AS at FROM results JOIN runs USING (run) WHERE test = ? AND outcome = 'fail'", test)[0]?.at ?? null;
    return at === null ? null : new Date(at);
  }

  // Le nombre de tours où ce test a été joué, réussi ou non.
  runCount(test: string): number {
    return this.base.lire<{ n: number }>("SELECT count(*) AS n FROM results WHERE test = ? AND outcome IN ('pass', 'fail')", test)[0]?.n ?? 0;
  }

  // Le temps qu'il a coûté, en millisecondes, sur tous ces tours.
  totalDuration(test: string): number {
    return this.base.lire<{ ms: number }>("SELECT coalesce(sum(duration_ms), 0) AS ms FROM results WHERE test = ? AND outcome IN ('pass', 'fail')", test)[0]?.ms ?? 0;
  }

  fermer(): void {
    this.base.fermer();
  }
}

export function ouvrirHistorique(repertoireEtat: string, options: { maintenant?: () => Date } = {}): Historique {
  const base = new Base(cheminHistorique(repertoireEtat), { attenteMs: ATTENTE_MS });
  base.script(PRAGMAS);
  base.script(SCHEMA);
  return new Historique(base, options.maintenant ?? (() => new Date()));
}
