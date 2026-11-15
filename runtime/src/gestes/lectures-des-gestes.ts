// Les lectures GitHub que les gestes du chef se passent d'un process à l'autre
// (#3682). Chaque geste de l'app — un bouton, la relecture de la vue — est une
// commande du runtime lancée dans son propre process : le cache des ETags de
// `github.ts`, propre au process, y naît vide, et chaque relecture de la vue
// relisait en entier les pages qu'elle venait de lire.
//
// Choix : un cache court des lectures, sur disque, dans le répertoire d'état du
// projet (`<BRIGADE_STATE_DIR>/lectures-des-gestes/`), un fichier par lecture.
//   - Fraîche — lue depuis moins de `FENETRE_DES_LECTURES_MS` —, une lecture se
//     rend telle quelle : aucun appel ne part. N relectures de la vue dans la
//     fenêtre coûtent les pages de la première, quel que soit N.
//   - Plus vieille, elle part sous condition, avec l'ETag gardé : tant que rien
//     n'a changé, GitHub répond 304, qu'il ne compte pas, ni la box.
//   - Chaque écriture d'un geste (`oublier`) les rend toutes périmées : la
//     lecture qui suit repart vers GitHub, et la vue voit ce que le geste vient
//     d'écrire. Ce que la cuisine ou l'app écrivent elles-mêmes sur GitHub se
//     voit au plus une fenêtre plus tard.
// Deux lectures identiques en vol dans le même process n'en font déjà qu'une
// (`enVol`, github.ts) ; deux process qui lisent au même instant lisent chacun.
//
// Cache, pas état : une lecture absente, illisible ou d'un autre format se lit
// comme absente — l'appel part — et un fichier qui ne s'écrit pas ne retient
// aucun geste. Seule la péremption qui ne s'écrit pas se dit (`dire`) : la vue
// d'un autre process pourrait alors rester une fenêtre en arrière ; ce process,
// lui, ne se sert plus de rien de ce qu'il a lu avant.
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Gardee } from "../github.ts";

const REPERTOIRE_DES_LECTURES = "lectures-des-gestes";
// Assez pour couvrir une rafale de relectures de la vue (un onglet, une fenêtre,
// la veille de l'app), assez court pour qu'une écriture de la cuisine s'y voie vite.
const FENETRE_DES_LECTURES_MS = 15_000;
// Au-delà, les lectures les plus anciennes sortent.
const LECTURES_GARDEES = 300;
const VERSION = 1;
// Le fichier qui dit l'instant de la dernière écriture d'un geste.
const OUBLI = "oubli";

export type LecturesDesGestes = {
  // La lecture gardée sous `cle`, et si elle est encore fraîche ; null sans elle.
  lire(cle: string): { gardee: Gardee; fraiche: boolean } | null;
  // Garde la réponse lue sous `cle`, lue depuis `depuis` ; null l'oublie.
  garder(cle: string, gardee: Gardee | null, depuis: number): void;
  // Toutes les lectures gardées sont périmées : un geste vient d'écrire.
  oublier(): void;
  // L'instant, sur l'horloge des lectures.
  instant(): number;
};

export type OptionsLectures = {
  // Le répertoire d'état du projet ; absent, rien ne se garde.
  repertoireEtat: string | undefined;
  // `false` : ce geste ne se sert d'aucune lecture gardée, et n'en garde
  // aucune — il ne fait que les dire périmées quand il écrit. Celui qui décide
  // d'une écriture sur ce qu'il lit lit GitHub.
  servir: boolean;
  maintenant?: () => number;
  fenetreMs?: number;
  dire?: (ligne: string) => void;
  // Écrit le fichier temporaire ; les tests y font échouer l'écriture.
  ecrire?: (fichier: string, contenu: string) => void;
};

type Ecrite = { version: number; depuis: number; etag: string; pleine: boolean; statut: number; entetes: Array<[string, string]>; corps: string };

const nomDe = (cle: string): string => `${createHash("sha256").update(cle).digest("hex")}.json`;

export function ouvrirLecturesDesGestes(options: OptionsLectures): LecturesDesGestes | undefined {
  if (!options.repertoireEtat) return undefined;
  const repertoire = join(options.repertoireEtat, REPERTOIRE_DES_LECTURES);
  const maintenant = options.maintenant ?? Date.now;
  const fenetre = options.fenetreMs ?? FENETRE_DES_LECTURES_MS;
  const dire = options.dire ?? ((ligne: string) => console.error(ligne));
  const ecrire = options.ecrire ?? ((fichier: string, contenu: string) => writeFileSync(fichier, contenu));
  // Ce process a écrit : rien de ce qui a été lu avant n'est frais pour lui,
  // même si le fichier de l'oubli ne s'est pas écrit.
  let oubliDuProcess = -Infinity;

  const ecrireAtomique = (fichier: string, contenu: string) => {
    mkdirSync(repertoire, { recursive: true });
    const temporaire = `${fichier}.${process.pid}.tmp`;
    try {
      ecrire(temporaire, contenu);
      renameSync(temporaire, fichier);
    } finally {
      rmSync(temporaire, { force: true });
    }
  };

  const oubli = (): number => {
    let lu = -Infinity;
    try {
      const nombre = Number(readFileSync(join(repertoire, OUBLI), "utf8"));
      if (Number.isFinite(nombre)) lu = nombre;
    } catch {}
    return Math.max(lu, oubliDuProcess);
  };

  // Les plus anciennes sortent quand il y en a trop.
  const elaguer = () => {
    const fichiers = readdirSync(repertoire).filter((nom) => nom.endsWith(".json"));
    if (fichiers.length <= LECTURES_GARDEES) return;
    const parAge = fichiers.flatMap((nom) => {
      try {
        return [{ nom, age: statSync(join(repertoire, nom)).mtimeMs }];
      } catch {
        return [];
      }
    }).sort((a, b) => a.age - b.age);
    for (const { nom } of parAge.slice(0, parAge.length - LECTURES_GARDEES)) rmSync(join(repertoire, nom), { force: true });
  };

  return {
    instant: maintenant,
    lire(cle) {
      if (!options.servir) return null;
      let lue: Ecrite;
      try {
        lue = JSON.parse(readFileSync(join(repertoire, nomDe(cle)), "utf8")) as Ecrite;
      } catch {
        return null;
      }
      if (lue?.version !== VERSION || typeof lue.depuis !== "number" || typeof lue.etag !== "string" || typeof lue.pleine !== "boolean"
        || typeof lue.statut !== "number" || typeof lue.corps !== "string" || !Array.isArray(lue.entetes)) return null;
      const gardee: Gardee = { etag: lue.etag, pleine: lue.pleine, reponse: { statut: lue.statut, corps: lue.corps, entetes: new Map(lue.entetes) } };
      const fraiche = lue.depuis > oubli() && maintenant() - lue.depuis < fenetre;
      return { gardee, fraiche };
    },
    garder(cle, gardee, depuis) {
      if (!options.servir) return;
      const fichier = join(repertoire, nomDe(cle));
      try {
        if (gardee === null) {
          rmSync(fichier, { force: true });
          return;
        }
        const ecrite: Ecrite = { version: VERSION, depuis, etag: gardee.etag, pleine: gardee.pleine, statut: gardee.reponse.statut, entetes: [...gardee.reponse.entetes], corps: gardee.reponse.corps };
        ecrireAtomique(fichier, JSON.stringify(ecrite));
        elaguer();
      } catch {}
    },
    oublier() {
      const instant = maintenant();
      oubliDuProcess = instant;
      try {
        ecrireAtomique(join(repertoire, OUBLI), String(instant));
      } catch (erreur) {
        dire(`brigade : the GitHub reads gestures share (${repertoire}) were not marked stale after a write: ${(erreur as Error).message} — another gesture may show them for up to ${Math.ceil(fenetre / 1000)} s more`);
      }
    },
  };
}
