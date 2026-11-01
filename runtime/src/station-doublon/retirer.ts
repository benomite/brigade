// Une station déclarée deux fois pour le même ordinateur (#1990, épique 1986) :
// la machine change de nom (`macbook-air-de-benoit`, puis
// `macbook-air-de-benoit4` quand un conflit de nom lui ajoute un numéro) et
// l'ancienne station reste déclarée, absente. La box la retire d'elle-même
// quand la nouvelle est là — le chef n'a rien à faire.
//
// Deux noms sont le même ordinateur quand leurs formes normalisées sont égales
// (`normaliser`). On ne retire que l'ancienne, et seulement si elle est absente :
// une station présente reste déclarée, et deux présentes ne se fondent jamais.
import type { Journal } from "../journal.ts";
import { lireStations, VARIABLE_DES_STATIONS } from "../stations-declarees.ts";
import { changerUneStation, declarationDuJournal } from "../une-station.ts";

// Le nom de la machine d'une station `<machine>/<moteur>`, sans la casse, sans
// le suffixe `.home` ou `.local`, sans le numéro de conflit final.
export function normaliser(station: string): string {
  const barre = station.indexOf("/");
  const machine = barre === -1 ? station : station.slice(0, barre);
  const moteur = barre === -1 ? "" : station.slice(barre);
  const forme = machine.toLowerCase().replace(/\.(home|local)$/, "").replace(/-?\d+$/, "");
  return `${forme === "" ? machine.toLowerCase() : forme}${moteur.toLowerCase()}`;
}

// Parmi les stations déclarées, celles à retirer : absentes, et même ordinateur
// qu'une station présente d'un autre nom.
export function doublonsAbsents(declarees: readonly string[], presentes: readonly string[]): string[] {
  const vivantes = new Set(presentes);
  const formes = new Set(presentes.map(normaliser));
  return declarees.filter((nom) => !vivantes.has(nom) && formes.has(normaliser(nom)));
}

// Retire du journal du projet les doublons absents, chacun seul. Rend les noms
// retirés ; rejouée, elle ne retire plus rien.
export function retirerLesDoublons(journal: Journal, pose: { projet: string; presentes: readonly string[]; auteur: string }): string[] {
  const declarees = lireStations({ [VARIABLE_DES_STATIONS]: declarationDuJournal(journal) }).map((station) => station.nom);
  const retirees = doublonsAbsents(declarees, pose.presentes);
  for (const nom of retirees) changerUneStation(journal, { projet: pose.projet, nom, changement: { retiree: true }, auteur: pose.auteur });
  return retirees;
}
