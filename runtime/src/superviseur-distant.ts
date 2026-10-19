// Surveille un cook qui ne tourne pas ici : celui d'une station distante. La
// box n'a aucun chemin vers lui — ni process à signaler, ni flux à lire. Elle
// tient donc ce qu'elle peut tenir : les mêmes plafonds, sur ce que la station
// rapporte et sur sa propre horloge. Les arrêter, ici, c'est ne plus rien
// accepter de lui : la station l'apprend à sa demande suivante, et arrête le
// sien. Mécanique pure : aucun journal ici.
import type { Caps } from "./events/guardrails.ts";
import { depassement, type Arret, type Fin, type Supervise } from "./superviseur.ts";

export type Measure = { turns: number; tokens: number };

export type SuperviseADistance = Supervise & {
  // Ce que la station dit que son cook a consommé jusqu'ici. Un plafond
  // dépassé l'arrête, comme une ligne du flux arrête un cook de la box.
  mesurer(measure: Measure): void;
  // Le cook a fini chez elle, de lui-même : son code de sortie.
  rendre(code: number | null): void;
};

export function superviserADistance(options: { plafonds: Caps; surArret?: (arret: Arret) => void }): SuperviseADistance {
  const { plafonds: caps } = options;
  const debut = performance.now();
  const ecoule = () => Math.round(performance.now() - debut);

  let measure: Measure = { turns: 0, tokens: 0 };
  let arret: Arret | null = null;
  let fini = false;
  let resoudre: (fin: Fin) => void = () => {};
  const fin = new Promise<Fin>((rendre) => void (resoudre = rendre));
  let duree: NodeJS.Timeout | undefined;
  let inactivite: NodeJS.Timeout | undefined;

  const conclure = (code: number | null) => {
    if (fini) return;
    fini = true;
    clearTimeout(duree);
    clearTimeout(inactivite);
    resoudre({ code, signal: null, ...measure, durationMs: ecoule(), arret, erreur: null });
  };
  const arreter = (motif: Arret) => {
    if (arret || fini) return;
    arret = motif;
    try {
      options.surArret?.(motif);
    } catch {
      // Le motif n'a pas pu être noté : le cook est arrêté quand même, c'est
      // le garde-fou qui prime.
    } finally {
      // Il n'y a personne à attendre : ce cook-là n'a plus rien à rendre ici.
      conclure(null);
    }
  };

  duree = setTimeout(() => arreter({ reason: "duration", limit: caps.durationMs, observed: ecoule() }), caps.durationMs);
  // Le silence d'un cook de la box se lit sur son flux ; celui-ci, sur ce que
  // sa station en rapporte : une mesure qui ne bouge plus, ou plus de mesure
  // du tout.
  const veiller = () => {
    clearTimeout(inactivite);
    const depuis = performance.now();
    inactivite = setTimeout(() => arreter({ reason: "idle", limit: caps.idleMs, observed: Math.round(performance.now() - depuis) }), caps.idleMs);
  };
  veiller();

  return {
    pid: undefined,
    mesure: () => ({ ...measure }),
    mesurer(lue) {
      if (fini) return;
      if (lue.turns !== measure.turns || lue.tokens !== measure.tokens) veiller();
      measure = { turns: lue.turns, tokens: lue.tokens };
      const depasse = depassement(caps, measure);
      if (depasse) arreter(depasse);
    },
    rendre: conclure,
    arreter: (motif = { reason: "stop", limit: null, observed: null }) => arreter(motif),
    abandonner: () => conclure(null),
    fin,
  };
}
