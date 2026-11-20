// La cuisine arrêtée (#3924, épique #3922) : le 2026-11-20, le rail n'avait aucune carte prise ni en pass, des tickets en
// file, et rien ne le disait — un ticket gelé tenait une zone de fichiers, et main avait été rouge avant. Ce module ne lit
// rien : il juge ce qu'on lui donne (la lecture du rail de l'app, app/src/vue/bandeau-arret/arret-du-rail.ts), et dit
// l'arrêt, sa cause et depuis quand. Une cause qu'il ne sait pas nommer est dite inconnue, jamais tue.

export type CauseDeLArret = { kind: "frozen-zone"; ticket: number; zone: string } | { kind: "main-red" } | { kind: "unknown" };
export type ArretDeLaCuisine = { cause: CauseDeLArret; since: string };

// `queued`, `taken`, `inPass` : les cartes du rail en file, prises, en pass. `since` : depuis quand rien ne bouge, quand
// aucune cause ne le sait. `frozen` : un ticket gelé qui tient une zone, et depuis quand ; `mainRed` : main rouge, depuis quand.
export type EntreeDeLArret = {
  queued: number;
  taken: number;
  inPass: number;
  since: string;
  frozen?: { ticket: number; zone: string; since: string };
  mainRed?: { since: string };
};

// L'arrêt, ou null : au moins un ticket en file, aucune carte prise ni en pass. Main rouge passe d'abord — tant qu'elle
// l'est, la cuisine ne prend rien d'autre que sa réparation —, puis le ticket gelé qui tient une zone.
export function arretDeLaCuisine(entree: EntreeDeLArret): ArretDeLaCuisine | null {
  if (entree.queued < 1 || entree.taken > 0 || entree.inPass > 0) return null;
  if (entree.mainRed) return { cause: { kind: "main-red" }, since: entree.mainRed.since };
  if (entree.frozen) return { cause: { kind: "frozen-zone", ticket: entree.frozen.ticket, zone: entree.frozen.zone }, since: entree.frozen.since };
  return { cause: { kind: "unknown" }, since: entree.since };
}
