// La ligne de la vue cuisine (#4299) : sur les dernières 24 heures, la part des tickets mergés en 10 minutes ou
// moins de leur prise, et la médiane de ce temps — la ligne même de `brigade <project> status`, calculée par le
// runtime sur les mêmes données : les temps des tickets que les stations du projet publient (`temps`).
import { evenementsDesTemps } from "../../../runtime/src/delais/evenements.ts";
import { direLeDelai } from "../../../runtime/src/delais/ligne.ts";
import { type Evenement, mesurerLesDelais } from "../../../runtime/src/delais/mesure.ts";

export function direLeDelaiDeLaCuisine({ evenements, maintenant }: { evenements: readonly Evenement[]; maintenant: string }): string {
  return direLeDelai(mesurerLesDelais({ evenements, maintenant }));
}

// La ligne d'un projet vu, sur les enregistrements des temps qu'il publie (un projet sans temps publiés n'en a
// pas : la vue ne pose pas de ligne plutôt que d'en inventer une).
export function delaiDuProjet(temps: { enregistrements: readonly unknown[] }, maintenant: Date): string {
  return direLeDelaiDeLaCuisine({ evenements: evenementsDesTemps(temps.enregistrements), maintenant: maintenant.toISOString() });
}
