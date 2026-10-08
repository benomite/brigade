// Un événement tel que le chef le lit, sur une ligne :
//   <seq>  <horodatage>  <projet>  #<ticket>  <type>  <auteur>  <charge utile>
import type { Evenement } from "./evenements.ts";

export function formaterEvenement(evenement: Evenement): string {
  return [
    evenement.seq,
    evenement.at,
    evenement.project,
    evenement.ticket === null ? "-" : `#${evenement.ticket}`,
    evenement.type,
    evenement.author,
    JSON.stringify(evenement.payload),
  ].join("  ");
}
