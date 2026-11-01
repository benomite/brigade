// Une capacité hors du catalogue, tapée par le chef (#1959, épique #1950) :
// les cases de « What it provides » viennent du catalogue de la machine et de
// ce que les autres stations fournissent, si bien qu'une capacité que personne
// n'a jamais déclarée ne se cochait nulle part — et le ticket qui l'attend en
// WAITING attendait un geste que l'app n'offrait pas. Le chef la tape : ce
// module dit le nom qui sera déclaré, ou pourquoi il n'en est pas un.
//
// Le nom tapé se lit comme un nom de capacité écrit ailleurs : sans blanc
// autour, sans les accents graves qu'il garde s'il est recopié d'une carte en
// WAITING (« awaiting a station that provides `enregistrement-ecran` », comme
// la ligne `requiert` d'une fiche, `fiche.ts`), ses blancs intérieurs en tirets,
// et composé comme `capacite` le compare. Le runtime ne le reconnaît pas plus
// qu'un autre : il le compare. Sa casse est gardée — c'est celle que le ticket
// demande.
//
// Déclaré, il ne demande rien de plus : la station relit à chaque service ce
// que les stations fournissent, et rend au rail le ticket qui l'attendait
// (`station.ts`, `rendreLesCorriges`), comme pour une case du catalogue.
//
// La vue de l'app applique la même règle avant tout envoi
// (app/src/vue/capacite-libre/capacite-libre.js) : elle ne lit pas de
// TypeScript, et un test l'y tient identique. Les refus sont en anglais :
// c'est l'app qui les montre. Sans E/S.
import { capacite, CAPACITE, FORME_DE_CAPACITE_EN } from "../capacites.ts";

// Le nom tapé, tel qu'il se déclare — vide s'il ne reste rien.
export const nomDeCapaciteLibre = (ecrite: string): string =>
  capacite(
    ecrite
      .trim()
      .replace(/^`(.*)`$/s, "$1")
      .trim()
      .replace(/\s+/g, "-"),
  );

export type CapaciteLibre = { capacite: string } | { refus: string };

// La capacité à ajouter aux cases d'une station, ou le refus : un nom vide, un
// nom que le runtime ne lirait pas, ou une capacité déjà parmi `presentes` —
// les cases du formulaire, cochées ou non.
export function capaciteLibre(ecrite: string, presentes: readonly string[]): CapaciteLibre {
  const nom = nomDeCapaciteLibre(ecrite);
  if (nom === "") return { refus: "Nothing added: type the capability's name first." };
  if (!CAPACITE.test(nom)) return { refus: `Nothing added: “${nom}” is not a capability name — ${FORME_DE_CAPACITE_EN}.` };
  if (presentes.some((presente) => capacite(presente) === nom)) return { refus: `Nothing added: “${nom}” is already in the form — tick its box.` };
  return { capacite: nom };
}
