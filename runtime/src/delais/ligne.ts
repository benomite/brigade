// La ligne de `brigade <project> status` (#4299) : sur les dernières 24 heures, la part des tickets mergés en
// 10 minutes ou moins de leur prise, et la médiane de ce temps. La vue cuisine de l'app dit la même.
import { lireLesEvenements } from "./evenements.ts";
import { type MesureDesDelais, mesurerLesDelais, SEUIL_MIN } from "./mesure.ts";

const ETIQUETTE = "taken-to-merged 24 h:";

const dixieme = (v: number) => Math.round(v * 10) / 10;

export function direLeDelai(mesure: MesureDesDelais): string {
  if (mesure.part === null || mesure.medianeMin === null) return `${ETIQUETTE} no merged ticket in the last 24 h`;
  const rapides = Math.round(mesure.part * mesure.nombre);
  return `${ETIQUETTE} ${Math.round(mesure.part * 100)}% in ${SEUIL_MIN} min or less (${rapides} of ${mesure.nombre}), median ${dixieme(mesure.medianeMin)} min`;
}

// La ligne, sur ce que le clone du projet dit à `maintenant`.
export function ligneDuDelaiDePrise(repertoireDepot: string | undefined, maintenant: Date): string {
  const evenements = lireLesEvenements(repertoireDepot);
  if (evenements === null) return `${ETIQUETTE} not known — the ticket times of the clone cannot be read`;
  return direLeDelai(mesurerLesDelais({ evenements, maintenant: maintenant.toISOString() }));
}
