// Les capacités : ce qu'une station fournit, ce qu'un ticket demande — ce que
// la machine sait faire (`navigateur-headless`, `chrome-connecté`). Un ticket
// ne part que dans une station qui fournit tout ce qu'il demande ; quand
// aucune ne le peut, il ne part pas, et ce module dit ce qui manque et le geste
// qui le fournirait. Sans E/S.
//
// Une capacité n'est pas une permission : elle choisit la station, elle
// n'ouvre rien. Ce qui est permis reste l'affaire des grants (`grant.ts`), que
// rien ici ne lit ni n'écrit. Ce n'est pas non plus une spécialité : seul ce
// qu'un ticket demande écarte une station, jamais ce qu'elle fournit en plus
// ou à côté — un ticket qui ne demande rien part dans n'importe laquelle.
import { SANS_STATION, STATION_ABSENTE } from "./evenements/rail.ts";

// Un nom de capacité : le runtime n'en reconnaît aucun, il les compare.
export const CAPACITE = /^[\p{L}\p{N}][\p{L}\p{N}_-]*$/u;
export const FORME_DE_CAPACITE = "des lettres, des chiffres et des tirets (code, navigateur-headless)";
// La même, en anglais : ce que dit `station`.
export const FORME_DE_CAPACITE_EN = "letters, digits and hyphens (code, navigateur-headless)";

// Le nom tel qu'il se compare : un accent s'écrit de deux façons (composé ou
// non), et `chrome-connecté` tapé sur une machine doit être celui d'une autre.
export const capacite = (ecrite: string): string => ecrite.normalize("NFC");

// Une station peut-elle cuisiner ce ticket ? Oui si elle fournit tout ce
// qu'il demande — donc toujours, s'il ne demande rien.
export const fournitTout = (fournit: readonly string[], demande: readonly string[]): boolean => demande.every((voulue) => fournit.includes(voulue));

// Ce qui manque à un ticket pour partir. `ensemble` : chacune de ses capacités
// est fournie quelque part, mais aucune station ne les fournit toutes.
export type Manque = { capacites: string[]; ensemble: boolean };

// Ce qui manque à une demande devant ce que fournissent les stations
// déclarées (`offres`, une liste par station), ou null si l'une d'elles peut
// la servir. Sans station, toute capacité demandée manque.
export function manque(demande: readonly string[], offres: ReadonlyArray<readonly string[]>): Manque | null {
  // Un ticket qui ne demande rien ne manque de rien, même sans station : il
  // attend, comme avant.
  if (demande.length === 0 || offres.some((offre) => fournitTout(offre, demande))) return null;
  const absentes = demande.filter((voulue) => !offres.some((offre) => offre.includes(voulue)));
  return absentes.length > 0 ? { capacites: absentes, ensemble: false } : { capacites: [...demande], ensemble: true };
}

// Le motif du 86 d'un ticket qu'aucune station ne peut prendre : il nomme ce
// qui manque — `no-station: chrome-connecté`, ou `no-station: a + b` quand
// c'est la réunion des deux que personne ne fournit.
export function motifSansStation({ capacites, ensemble }: Manque): string {
  return `${SANS_STATION}: ${capacites.join(ensemble ? " + " : ", ")}`;
}

// Ce que ce motif dit qu'il manque, ou null si ce n'en est pas un.
export function manqueDuMotif(motif: string | null): Manque | null {
  if (!motif?.startsWith(`${SANS_STATION}: `)) return null;
  const dit = motif.slice(SANS_STATION.length + 2);
  const ensemble = dit.includes(" + ");
  return { capacites: dit.split(ensemble ? " + " : ", "), ensemble };
}

// Le motif du 86 d'un ticket que seules des stations distantes absentes
// peuvent cuisiner : il les nomme — `station-absent: mac/claude`.
export const motifStationAbsente = (stations: readonly string[]): string => `${STATION_ABSENTE}: ${stations.join(", ")}`;

// Les stations que ce motif dit absentes, ou null si ce n'en est pas un.
export function absentesDuMotif(motif: string | null): string[] | null {
  return motif?.startsWith(`${STATION_ABSENTE}: `) ? motif.slice(STATION_ABSENTE.length + 2).split(", ") : null;
}

// L'absence, telle que le chef la lit. Ce n'est pas une panne, et rien n'est à
// réparer sur la box : la station sert de nouveau dès qu'elle se manifeste.
export function direStationAbsente(stations: readonly string[]): string {
  const noms = nommer([...stations], "et");
  return stations.length > 1 ? `stations absentes — ${noms} ne se sont pas manifestées récemment` : `station absente — ${noms} ne s'est pas manifestée récemment`;
}

export const GESTE_DE_PRESENCE = "ce n'est pas une panne, et rien n'est à faire sur la box : le ticket repart seul dès que la station se manifeste (son poste allumé, son runner lancé)";

// La même absence et le même geste, en anglais : ce que dit le bloc
// `awaiting` de `status` (docs/glossary.md). Les sorties pas encore traduites
// gardent les mots français ci-dessus.
export function direStationAbsenteEn(stations: readonly string[]): string {
  const noms = nommer([...stations], "and");
  return stations.length > 1 ? `stations absent — ${noms} have not shown up lately` : `station absent — ${noms} has not shown up lately`;
}

export const GESTE_DE_PRESENCE_EN = "this is not a failure, and there is nothing to do on the box: the ticket starts again on its own as soon as the station shows up (its workstation on, its runner started)";

const nommer = (capacites: string[], liaison: string) => {
  const noms = capacites.map((nom) => `\`${nom}\``);
  return noms.length <= 1 ? noms.join("") : `${noms.slice(0, -1).join(", ")} ${liaison} ${noms.at(-1)}`;
};

// Ce qui manque, tel que le chef le lit.
export function direManque({ capacites, ensemble }: Manque): string {
  return ensemble ? `aucune station ne fournit à la fois ${nommer(capacites, "et")}` : `aucune station ne fournit ${nommer(capacites, "ni")}`;
}

// Ce qui manque, en anglais, pour le bloc `awaiting`.
export function direManqueEn({ capacites, ensemble }: Manque): string {
  return ensemble ? `no station provides ${nommer(capacites, "and")} together` : `no station provides ${nommer(capacites, "or")}`;
}

// La clé de la fiche qui porte ce qu'un ticket demande.
export const CLE_DES_CAPACITES = "requiert";

// Le geste qui fournirait ce qui manque : dit d'un seul endroit, à `status`
// comme à l'issue. Rien n'y donne quoi que ce soit : déclarer une station dit
// ce que la machine sait faire, pas ce qui lui est permis.
export function gesteDeCapacite({ capacites, ensemble }: Manque): string {
  const [la, elle] = capacites.length > 1 ? ["les", `${nommer(capacites, "et")}`] : ["la", nommer(capacites, "et")];
  return `déclarer une station qui ${la} fournit${ensemble ? " ensemble" : ""} par \`brigade <projet> station stations <machine>/<moteur>:<plafond de cooks>:${capacites.join("+")}\`, ou retirer ${elle} de la ligne \`${CLE_DES_CAPACITES}\` de sa fiche — il repart seul`;
}

// Le même geste, en anglais, pour le bloc `awaiting`.
export function gesteDeCapaciteEn({ capacites, ensemble }: Manque): string {
  const [la, elle] = capacites.length > 1 ? ["them", nommer(capacites, "and")] : ["it", nommer(capacites, "and")];
  return `declare a station that provides ${la}${ensemble ? " together" : ""} with \`brigade <project> station stations <machine>/<engine>:<cook cap>:${capacites.join("+")}\`, or remove ${elle} from the \`${CLE_DES_CAPACITES}\` line of its card — it starts again on its own`;
}
