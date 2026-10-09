// Le runtime d'un projet : il prend le verrou, retrouve son journal, y note sa
// propre vie, et réveille ceux qui l'écoutent. Il ne garde aucun état en
// mémoire : tout ce qu'il sait se relit dans le journal.
import { existsSync, mkdirSync } from "node:fs";
import { hostname } from "node:os";
import type { Fait } from "./evenements.ts";
import { cheminJournal, ouvrirJournal, type Journal } from "./journal.ts";
import { sessionEnCours } from "./projections/sessions.ts";
import { prendreVerrou, VerrouTenu } from "./verrou.ts";

const AUTEUR = "runtime";

// Le nom de projet s'écrit dans chaque événement, dans le nom de l'unité
// systemd et dans le chemin d'état : un identifiant court, sans rien à échapper.
export const NOM_DE_PROJET = /^[a-z0-9][a-z0-9-]*$/;

export class ConfigInvalide extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigInvalide";
  }
}

export class DejaEnCours extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DejaEnCours";
  }
}

// `log` : un autre process a écrit dans le journal. `tick` : la minuterie.
export type CauseReveil = "log" | "tick";

export type OptionsRuntime = {
  repertoireEtat: string;
  projet: string;
  maintenant?: () => Date;
  // Latence maximale avant de voir ce qu'un autre process a écrit.
  intervalleVeilleMs?: number;
  intervalleTickMs?: number;
};

export type Runtime = {
  projet: string;
  journal: Journal;
  // Abonne un écouteur aux réveils ; rend de quoi le désabonner.
  surReveil(ecouter: (cause: CauseReveil) => void): () => void;
  // Journalise l'arrêt, rend le verrou. Sans effet la seconde fois.
  arreter(signal: string): void;
};

export function demarrer(options: OptionsRuntime): Runtime {
  const { repertoireEtat, projet } = options;
  if (!NOM_DE_PROJET.test(projet)) {
    throw new ConfigInvalide(
      `nom de projet invalide : « ${projet} » — attendu un identifiant court en minuscules, chiffres et tirets (brigade, thermigo)`,
    );
  }
  if (repertoireEtat === "") throw new ConfigInvalide("répertoire d'état vide");
  mkdirSync(repertoireEtat, { recursive: true });

  let verrou;
  try {
    verrou = prendreVerrou(repertoireEtat);
  } catch (erreur) {
    if (erreur instanceof VerrouTenu) throw new DejaEnCours(motifDuRefus(projet, repertoireEtat));
    throw erreur;
  }

  // Passé ce point le verrou est à nous : un démarrage qui échoue le rend.
  let journal: Journal;
  try {
    journal = ouvrirJournal(repertoireEtat, { maintenant: options.maintenant });
  } catch (erreur) {
    verrou.relacher();
    throw erreur;
  }
  const noter = (fait: Fait) => journal.ajouter({ project: projet, ticket: null, author: AUTEUR, ...fait });

  try {
    // Les projections sont recalculées à chaque démarrage : le journal est la
    // seule vérité, et une projection ajoutée depuis la dernière vie du runtime
    // se remplit ainsi de tout ce qui a été écrit avant elle.
    journal.reconstruire();

    // Réconciliation : une session sans fin au journal est celle d'un runtime
    // mort sans avoir pu l'écrire.
    journal.base.transaction(() => {
      const orpheline = sessionEnCours(journal.base);
      if (orpheline) noter({ type: "runtime.interrupted", payload: { startedSeq: orpheline.startedSeq } });
      noter({ type: "runtime.started", payload: { pid: process.pid, host: hostname(), node: process.version } });
    });
  } catch (erreur) {
    journal.fermer();
    verrou.relacher();
    throw erreur;
  }

  const ecouteurs = new Set<(cause: CauseReveil) => void>();
  const reveiller = (cause: CauseReveil) => {
    for (const ecouter of [...ecouteurs]) ecouter(cause);
  };
  let version = journal.base.versionDonnees();
  const veille = setInterval(() => {
    const courante = journal.base.versionDonnees();
    if (courante === version) return;
    version = courante;
    reveiller("log");
  }, options.intervalleVeilleMs ?? 1000);
  const intervalleTickMs = options.intervalleTickMs ?? 60_000;
  const tick = setInterval(() => {
    // Le battement s'écrit avant le réveil : son âge, lu par `status`, est ce
    // qui révèle un runtime figé. S'il ne peut pas s'écrire, le tick a lieu
    // quand même — les écouteurs n'attendent pas le journal.
    try {
      noter({ type: "runtime.ticked", payload: { intervalMs: intervalleTickMs } });
    } catch (erreur) {
      console.error(`brigade : tick non journalisé — ${erreur instanceof Error ? erreur.message : String(erreur)}`);
    }
    reveiller("tick");
  }, intervalleTickMs);

  let arrete = false;
  return {
    projet,
    journal,
    surReveil(ecouter) {
      if (arrete) return () => {};
      ecouteurs.add(ecouter);
      return () => ecouteurs.delete(ecouter);
    },
    arreter(signal) {
      if (arrete) return;
      arrete = true;
      clearInterval(veille);
      clearInterval(tick);
      ecouteurs.clear();
      // Même si l'arrêt ne peut pas s'écrire, le verrou est rendu : le
      // démarrage suivant notera l'interruption.
      try {
        noter({ type: "runtime.stopped", payload: { signal } });
      } finally {
        journal.fermer();
        verrou.relacher();
      }
    },
  };
}

// Dit qui tient le projet, d'après le dernier démarrage sans fin du journal.
function motifDuRefus(projet: string, repertoireEtat: string): string {
  const refus = `un runtime tient déjà le projet « ${projet} » (${repertoireEtat})`;
  // Le détail est un confort : celui qui tient le verrou peut ne pas avoir
  // encore posé son journal, ou être en train d'y écrire. Quoi qu'il arrive à
  // cette lecture, le refus reste un refus.
  try {
    if (!existsSync(cheminJournal(repertoireEtat))) return refus;
    const journal = ouvrirJournal(repertoireEtat, { lectureSeule: true });
    try {
      const session = sessionEnCours(journal.base);
      if (!session) return refus;
      return `${refus} : pid ${session.pid} sur ${session.host}, démarré le ${session.startedAt}`;
    } finally {
      journal.fermer();
    }
  } catch {
    return refus;
  }
}
