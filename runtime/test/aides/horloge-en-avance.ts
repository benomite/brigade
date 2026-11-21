// L'heure d'un process lancé par un test, en avance de ce que le test écrit : le
// nombre de millisecondes que porte le fichier nommé par HORLOGE_EN_AVANCE (absent
// ou illisible : aucune avance), relu à chaque lecture de l'heure. Seule l'heure
// lue avance — `Date.now()`, `new Date()` — : les minuteries gardent la vraie.
// À donner en `NODE_OPTIONS: \`--import=${HORLOGE_EN_AVANCE}\`` (outils.ts).
import { readFileSync } from "node:fs";

const fichier = process.env.HORLOGE_EN_AVANCE;
if (fichier) {
  const Vraie = Date;
  const avance = (): number => {
    try {
      return Number(readFileSync(fichier, "utf8")) || 0;
    } catch {
      return 0;
    }
  };
  class EnAvance extends Vraie {
    constructor(...valeur: [] | [string | number | Date]) {
      if (valeur.length === 0) super(Vraie.now() + avance());
      else super(valeur[0]);
    }
    static override now(): number {
      return Vraie.now() + avance();
    }
  }
  globalThis.Date = EnAvance as DateConstructor;
}
