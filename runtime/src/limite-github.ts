// Le budget d'appels à GitHub : au plus 2 500 par heure glissante, la moitié
// de la limite du compte (5 000/h), pour la station et tous ses projets
// ensemble. Le sondage des issues (`github.ts`) et le canal du gist
// (`appairage/canal.ts`) prennent un appel ici avant de lancer `gh` ; au-delà
// du budget, l'appel est refusé — il ne part pas, et l'appelant échoue comme
// sur une panne de GitHub, que son prochain tour rattrape.
//
// Choix : un compteur partagé, pas un budget par process. Il vit dans le
// répertoire de la station (`<BRIGADE_STATION_DIR>/appels-github/`), une
// base SQLite où chaque appel émis laisse son instant : tout process qui la
// tient — la station et les projets qu'elle sert, un runtime ou une commande
// lancés avec son environnement — compte dans le même budget, et une
// transaction (BEGIN IMMEDIATE) tranche entre deux process qui prennent le
// dernier appel au même instant. Un budget par process aurait demandé de
// découper 2 500 en parts fixes, perdues pour le projet qui sonde beaucoup
// quand un autre dort, et faussées dès que le nombre de projets change ; le
// compteur partagé tient le plafond quel que soit ce nombre.
//
// Hors de toute station (le poste de dev, un test), le process compte seul,
// en mémoire, sous le même budget.
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { Base } from "./base.ts";

// L'ensemble des appels de la station et de ses projets, sur une heure glissante.
export const BUDGET_PAR_HEURE = 2500;
export const FENETRE_MS = 60 * 60_000;
// Le compteur partagé, dans le répertoire de la station : une base et ses
// fichiers de journal, qui changent à chaque appel.
export const REPERTOIRE_COMPTEUR = "appels-github";
const FICHIER_COMPTEUR = "compteur.db";

// Un appel refusé : le budget de l'heure glissante est épuisé. `libreDansMs` :
// dans combien de temps le plus ancien appel compté sort de la fenêtre.
export class BudgetGitHubEpuise extends Error {
  readonly libreDansMs: number;
  constructor(budget: number, libreDansMs: number) {
    super(`budget GitHub épuisé : ${budget} appels sur l'heure glissante, appel refusé — le prochain se libère dans ${Math.ceil(libreDansMs / 1000)} s`);
    this.name = "BudgetGitHubEpuise";
    this.libreDansMs = libreDansMs;
  }
}

export type Limite = {
  readonly budget: number;
  // Compte un appel, ou lève `BudgetGitHubEpuise` sans le compter.
  prendre(): void;
  // Les appels comptés sur l'heure écoulée, par tous ceux qui tiennent ce compteur.
  appels(): number;
  fermer(): void;
};

export type OptionsLimite = {
  // La base du compteur ; absente, un compteur en mémoire, propre au process.
  fichier?: string;
  budget?: number;
  // En millisecondes. Par défaut, l'horloge du système.
  maintenant?: () => number;
};

// Le temps qu'un autre process tienne le compteur : une transaction y dure
// quelques millisecondes.
const ATTENTE_MS = 10_000;

export function ouvrirLimite(options: OptionsLimite = {}): Limite {
  const budget = options.budget ?? BUDGET_PAR_HEURE;
  const maintenant = options.maintenant ?? (() => Date.now());
  const base = new Base(options.fichier ?? ":memory:", { attenteMs: ATTENTE_MS });
  // Un compte perdu dans une coupure de courant ne coûte qu'un peu de marge :
  // aucune écriture n'attend le disque.
  if (options.fichier !== undefined) base.script("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;");
  base.script("CREATE TABLE IF NOT EXISTS appels (instant INTEGER NOT NULL); CREATE INDEX IF NOT EXISTS appels_par_instant ON appels (instant);");

  return {
    budget,
    prendre() {
      const libreDansMs = base.transaction(() => {
        const instant = maintenant();
        // Ce qui est sorti de la fenêtre ne compte plus : rien ne le relira.
        base.executer("DELETE FROM appels WHERE instant <= ?", instant - FENETRE_MS);
        const [compte] = base.lire<{ n: number; premier: number | null }>("SELECT count(*) AS n, min(instant) AS premier FROM appels");
        if ((compte?.n ?? 0) >= budget) return Math.max(0, (compte?.premier ?? instant) + FENETRE_MS - instant);
        base.executer("INSERT INTO appels (instant) VALUES (?)", instant);
        return null;
      });
      if (libreDansMs !== null) throw new BudgetGitHubEpuise(budget, libreDansMs);
    },
    appels() {
      const [compte] = base.lire<{ n: number }>("SELECT count(*) AS n FROM appels WHERE instant > ?", maintenant() - FENETRE_MS);
      return compte?.n ?? 0;
    },
    fermer: () => base.fermer(),
  };
}

// Le compteur partagé de la station dont `racine` est le répertoire.
export function limiteDeLaStation(racine: string, options: Omit<OptionsLimite, "fichier"> = {}): Limite {
  const repertoire = join(racine, REPERTOIRE_COMPTEUR);
  mkdirSync(repertoire, { recursive: true });
  return ouvrirLimite({ ...options, fichier: join(repertoire, FICHIER_COMPTEUR) });
}

let duProcess: Limite | null = null;

// Le compteur de ce process, que la station pose en démarrant.
export function installerLimite(limite: Limite): Limite {
  duProcess = limite;
  return limite;
}

// Le compteur que prennent `github.ts` et le canal quand on ne leur en donne
// pas : celui que la station a posé ; sinon celui de la station dont ce
// process a l'environnement (`BRIGADE_STATION_DIR`) ; sinon un compteur en
// mémoire, propre au process.
export function limiteDuProcess(): Limite {
  if (duProcess === null) {
    const racine = process.env.BRIGADE_STATION_DIR;
    duProcess = racine ? limiteDeLaStation(racine) : ouvrirLimite();
  }
  return duProcess;
}

// Une fois par heure, la ligne qui mesure en conditions réelles : les appels
// comptés sur l'heure écoulée. Rend de quoi l'arrêter.
export function journaliserLesAppels(limite: Limite, options: { dire: (ligne: string) => void; intervalleMs?: number }): () => void {
  const minuterie = setInterval(() => {
    try {
      options.dire(`brigade : ${limite.appels()} appels GitHub sur l'heure écoulée`);
    } catch (erreur) {
      options.dire(`brigade : appels GitHub de l'heure écoulée non comptés — ${erreur instanceof Error ? erreur.message : String(erreur)}`);
    }
  }, options.intervalleMs ?? FENETRE_MS);
  minuterie.unref();
  return () => clearInterval(minuterie);
}
