// Une horloge simulée : l'heure et les minuteries de la veille, que le test
// avance à la main. Rien n'y dépend du temps qui passe vraiment.
import type { Minuterie } from "../../src/connection-max/veille.ts";

export type HorlogeSimulee = {
  maintenant: () => Date;
  minuterie: Minuterie;
  // Joue tout ce qui tombe d'ici `ms`, dans l'ordre, puis pose l'heure à la fin.
  avancer: (ms: number) => void;
  // Les millisecondes écoulées depuis le départ.
  ecoule: () => number;
};

export function horlogeSimulee(depart = "2026-10-15T12:00:00.000Z"): HorlogeSimulee {
  const origine = Date.parse(depart);
  let instant = origine;
  let numero = 0;
  const minuteries = new Map<number, { faire: () => void; ms: number; prochaine: number }>();
  const minuterie: Minuterie = {
    repeter: (faire, ms) => {
      numero += 1;
      minuteries.set(numero, { faire, ms, prochaine: instant + ms });
      return numero;
    },
    annuler: (poignee) => void minuteries.delete(poignee as number),
  };
  const avancer = (ms: number) => {
    const fin = instant + ms;
    for (;;) {
      const [id, suivante] = [...minuteries].reduce<[number, { prochaine: number }] | [null, null]>(
        (tot, [cle, m]) => (m.prochaine <= fin && (tot[1] === null || m.prochaine < tot[1].prochaine) ? [cle, m] : tot),
        [null, null],
      );
      if (id === null || suivante === null) break;
      const m = minuteries.get(id);
      if (m === undefined) break;
      instant = m.prochaine;
      m.prochaine += m.ms;
      m.faire();
    }
    instant = fin;
  };
  return { maintenant: () => new Date(instant), minuterie, avancer, ecoule: () => instant - origine };
}
