// Le cache des lectures sous condition (les ETags de `github.ts`), gardé sur
// disque : après un redémarrage, la première lecture de chaque ressource part
// avec son ETag et GitHub peut répondre 304, qu'il ne compte pas dans son quota.
// Cache, pas état : un fichier absent, illisible ou corrompu se lit vide, se dit
// en une ligne, et n'empêche jamais de démarrer.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { gardeesDuProcess, type Gardee } from "../github.ts";

const VERSION = 1;
// Entre deux écritures, tant que la station tourne.
export const INTERVALLE_MS = 5 * 60_000;

export type OptionsCacheEtag = {
  fichier: string;
  dire?: (ligne: string) => void;
  intervalleMs?: number;
  // Ce que le cache contient / reçoit ; par défaut, celui de `github.ts`.
  cache?: { lire(): Array<[string, Gardee]>; remplir(entrees: Array<[string, Gardee]>): void };
  // Écrit le fichier temporaire puis le renomme ; les tests y interrompent l'écriture.
  ecrire?: (fichier: string, contenu: string) => void;
};

const estGardee = (v: unknown): v is Gardee => {
  const g = v as Gardee | null;
  return typeof g === "object" && g !== null && typeof g.etag === "string" && typeof g.pleine === "boolean"
    && typeof g.reponse === "object" && g.reponse !== null && typeof g.reponse.statut === "number"
    && typeof g.reponse.corps === "string" && Array.isArray(g.reponse.entetes);
};

export function ouvrirCacheEtag(options: OptionsCacheEtag) {
  const { fichier } = options;
  const dire = options.dire ?? ((ligne: string) => console.log(ligne));
  const cache = options.cache ?? gardeesDuProcess;
  const ecrire = options.ecrire ?? ((f: string, contenu: string) => writeFileSync(f, contenu));
  let minuterie: NodeJS.Timeout | undefined;

  // Recharge le fichier ; rend le nombre d'entrées reprises.
  const charger = (): number => {
    let texte: string;
    try {
      texte = readFileSync(fichier, "utf8");
    } catch (erreur) {
      if ((erreur as NodeJS.ErrnoException).code === "ENOENT") return 0;
      dire(`brigade : cache des ETags illisible (${fichier}) — démarre vide : ${(erreur as Error).message}`);
      return 0;
    }
    try {
      const lu = JSON.parse(texte);
      if (lu?.version !== VERSION || !Array.isArray(lu.entrees)) throw new Error("format inconnu");
      const entrees: Array<[string, Gardee]> = [];
      for (const [cle, g] of lu.entrees) {
        if (typeof cle !== "string" || !estGardee(g)) throw new Error("entrée invalide");
        entrees.push([cle, { etag: g.etag, pleine: g.pleine, reponse: { statut: g.reponse.statut, corps: g.reponse.corps, entetes: new Map(g.reponse.entetes) } }]);
      }
      cache.remplir(entrees);
      return entrees.length;
    } catch (erreur) {
      dire(`brigade : cache des ETags corrompu (${fichier}) — démarre vide : ${(erreur as Error).message}`);
      return 0;
    }
  };

  // Écriture atomique : un fichier à côté, renommé sur l'ancien. Interrompue,
  // elle laisse l'ancien intact. Ne lève jamais : un cache qui ne s'écrit pas se dit.
  const enregistrer = (): boolean => {
    const temporaire = `${fichier}.tmp`;
    try {
      const entrees = cache.lire().map(([cle, g]) => [cle, { etag: g.etag, pleine: g.pleine, reponse: { statut: g.reponse.statut, corps: g.reponse.corps, entetes: [...g.reponse.entetes] } }]);
      mkdirSync(dirname(fichier), { recursive: true });
      ecrire(temporaire, JSON.stringify({ version: VERSION, entrees }));
      renameSync(temporaire, fichier);
      return true;
    } catch (erreur) {
      dire(`brigade : cache des ETags non écrit (${fichier}) : ${(erreur as Error).message}`);
      return false;
    }
  };

  // Régulièrement, jusqu'à `arreter`, qui écrit une dernière fois.
  const demarrer = () => {
    minuterie ??= setInterval(enregistrer, options.intervalleMs ?? INTERVALLE_MS);
    minuterie.unref();
  };
  const arreter = () => {
    if (minuterie) clearInterval(minuterie);
    minuterie = undefined;
    enregistrer();
  };
  return { charger, enregistrer, demarrer, arreter };
}
