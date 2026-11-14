// Le chevauchement des zones à la porte de prise (#3509) : un ticket ne part
// pas tant qu'un ticket en vol — en cuisson, ou en pass jusqu'à son merge —
// annonce un chemin de sa zone. Deux chemins se chevauchent s'ils sont égaux,
// ou si l'un est un dossier qui contient l'autre : c'est `recouvrement`
// (zones.ts), par segments entiers. Retenu, le ticket attend tous ceux qui le
// retiennent (`attend`), et part au tour qui suit leur merge. Un ticket dont
// la fiche n'annonce aucune zone ne part pas : le manager nomme d'abord ses
// fichiers. Rien n'est lu ici : la station passe les zones qu'elle a lues.
import type { Fiche } from "../fiche.ts";
import { recouvrement } from "../zones.ts";

// Un ticket en vol, et la zone qu'il annonce.
export type EnVol = { ticket: number; zone: readonly string[] };

// Un ticket retenu : les tickets en vol dont la zone chevauche la sienne.
export type AttenteDeZone = { ticket: number; attend: number[] };

// Ceux des tickets en vol dont la zone chevauche `zone`, dans l'ordre des
// numéros. Vide : le ticket part. Une zone vide ne chevauche rien.
function bloquants(zone: readonly string[], enVol: readonly EnVol[]): number[] {
  return [...new Set(enVol.filter((autre) => recouvrement([...zone], [...autre.zone]) !== null).map(({ ticket }) => ticket))].sort((a, b) => a - b);
}

// L'attente d'un ticket sur les tickets en vol, ou null s'il part.
export function attenteDeZone(ticket: number, zone: readonly string[], enVol: readonly EnVol[]): AttenteDeZone | null {
  const attend = bloquants(
    zone,
    enVol.filter((autre) => autre.ticket !== ticket),
  );
  return attend.length === 0 ? null : { ticket, attend };
}

// Ce que la porte dit d'un ticket retenu.
export const direAttenteDeZone = ({ attend }: AttenteDeZone): string => `zone held by ${attend.map((numero) => `#${numero}`).join(", ")}`;

// Vrai si la fiche se lit et n'annonce aucune zone, et que le corps n'en
// déclare pas non plus : le ticket ne part pas. Sans fiche — un ticket qui ne
// naît pas d'une épique —, ou une fiche illisible, ce n'est pas ici que ça se
// juge : la zone vient alors du corps, comme avant.
export const zoneVide = (laFiche: Fiche | null, declaree: readonly string[]): boolean => laFiche !== null && laFiche.problems.length === 0 && declaree.length === 0;

// Ce que la porte dit d'un ticket refusé faute de zone.
export const ZONE_VIDE = "its card announces no zone — the manager must name the files and folders it expects to touch on the card's `zone` line before it starts";
