// Les lignes de `status` sur les temps des tickets mergés dans les dernières
// 24 h (#4308) : la part dans les temps, comptes à l'appui, puis les pires
// dépassements, le pire d'abord, chacun avec où son temps est passé.
import type { Delais } from "./delais.ts";

const ligne = (titre: string, valeur: string) => `${titre.padEnd(11)} ${valeur}`;

// Les délais illisibles (`lecture.ts`) : la ligne dit pourquoi, rien de calculé.
export function direLesDelais(delais: Delais | { illisible: string }): string[] {
  if ("illisible" in delais) return [ligne("on time", `merged tickets unreadable: ${delais.illisible}`)];
  const fenetre = `the last ${delais.fenetre_heures} h`;
  if (delais.fusionnes === 0) return [ligne("on time", `no merged ticket in ${fenetre}`)];
  const sans = delais.sans_temps_attendu === 0 ? "" : ` · ${delais.sans_temps_attendu} without an expected time`;
  const avecAttendu = delais.fusionnes - delais.sans_temps_attendu;
  const part = delais.part_dans_les_temps === null ? `no merged ticket with an expected time in ${fenetre}` : `${Math.round(delais.part_dans_les_temps * 100)} % (${delais.dans_les_temps}/${avecAttendu}) of the tickets merged in ${fenetre} within their expected time`;
  return [
    ligne("on time", `${part}${sans}`),
    ...delais.pires_depassements.map(({ ticket, titre, attendu_min, reel_min, modele, effort, repartition_min: r }) =>
      ligne("overrun", `#${ticket} ${titre} — expected ${attendu_min} min, actual ${reel_min} min (${modele} / ${effort}): cook ${r.cook} · gates ${r.gates} · review ${r.review} · send-backs ${r.renvois} · waits ${r.attentes} min`),
    ),
  ];
}

