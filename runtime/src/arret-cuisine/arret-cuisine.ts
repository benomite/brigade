// La cuisine arrêtée (#3924, épique #3922) : le 2026-11-20, le rail n'avait aucune carte prise ni en pass, des tickets en
// file, et rien ne le disait — un ticket gelé tenait une zone de fichiers, et main avait été rouge avant. Ce module ne lit
// rien : il juge ce qu'on lui donne (la lecture du rail de l'app, app/src/vue/banner-stop/stop-of-rail.ts), et dit
// l'arrêt, sa cause et depuis quand. Une cause qu'il ne sait pas nommer est dite inconnue, jamais tue.

export type CauseDeLArret = { kind: "frozen-zone"; ticket: number; zone: string } | { kind: "zone-held"; pr: number; zone: string } | { kind: "main-red" } | { kind: "unknown" };
// `statut` : le texte en une ligne de l'arrêt (`statutDeLaCuisine`), posé par la lecture du rail de l'app pour que le bandeau le dise tel quel.
export type ArretDeLaCuisine = { cause: CauseDeLArret; since: string; statut?: string };

// `queued`, `taken`, `inPass` : les cartes du rail en file, prises, en pass. `since` : depuis quand rien ne bouge, quand
// aucune cause ne le sait. `frozen` : un ticket gelé qui tient une zone, et depuis quand ; `mainRed` : main rouge, depuis quand.
export type EntreeDeLArret = {
  queued: number;
  taken: number;
  inPass: number;
  since: string;
  frozen?: { ticket: number; zone: string; since: string };
  mainRed?: { since: string };
  skipped?: SautDeLaPorte[];
};

// Un saut de la porte de prise (#4244), un par ticket cuisinable : `zone-held` porte le numéro `pr` de la PR qui tient la zone.
export type SautDeLaPorte = { ticket: number; reason: string; pr?: number; zone?: string };

// L'arrêt, ou null : au moins un ticket en file, aucune carte prise ni en pass. Main rouge passe d'abord — tant qu'elle
// l'est, la cuisine ne prend rien d'autre que sa réparation —, puis le ticket gelé qui tient une zone.
export function arretDeLaCuisine(entree: EntreeDeLArret): ArretDeLaCuisine | null {
  if (entree.queued < 1 || entree.taken > 0 || entree.inPass > 0) return null;
  if (entree.mainRed) return { cause: { kind: "main-red" }, since: entree.mainRed.since };
  const tenue = prQuiTientLaZone(entree.skipped);
  if (tenue !== null) return { cause: { kind: "zone-held", pr: tenue.pr, zone: tenue.zone ?? entree.frozen?.zone ?? "" }, since: entree.frozen?.since ?? entree.since };
  if (entree.frozen) return { cause: { kind: "frozen-zone", ticket: entree.frozen.ticket, zone: entree.frozen.zone }, since: entree.frozen.since };
  return { cause: { kind: "unknown" }, since: entree.since };
}

// La PR qui tient la zone, quand tous les tickets cuisinables sont sautés pour `zone-held` : celle qui en bloque le plus, le
// plus petit numéro à égalité, avec la zone que son premier saut dit. Sans saut, ou un saut d'une autre raison ou sans PR : null.
function prQuiTientLaZone(skipped: readonly SautDeLaPorte[] | undefined): { pr: number; zone?: string } | null {
  if (skipped === undefined || skipped.length === 0) return null;
  const parPr = new Map<number, number>();
  for (const { reason, pr } of skipped) {
    if (reason !== "zone-held" || pr === undefined) return null;
    parPr.set(pr, (parPr.get(pr) ?? 0) + 1);
  }
  const pr = [...parPr].sort(([prA, nA], [prB, nB]) => nB - nA || prA - prB)[0]?.[0];
  if (pr === undefined) return null;
  const zone = skipped.find((saut) => saut.pr === pr)?.zone;
  return zone === undefined ? { pr } : { pr, zone };
}

// Le statut d'un arrêt en une ligne (#4244), la source des mots que la vue du second lit ; le bandeau du navigateur (app/src/vue/banner-stop/banner-stop.js) n'importe pas le runtime : la lecture du rail (stop-of-rail.ts) lui porte ce texte. Une zone tenue se dit avec sa PR ;
// « cause unknown » ne reste que pour une cause sans code.
export function statutDeLArret({ cause }: ArretDeLaCuisine): string {
  if (cause.kind === "main-red") return "main is red";
  if (cause.kind === "frozen-zone") return `frozen ticket #${cause.ticket} holds the file zone ${cause.zone}`;
  if (cause.kind === "zone-held") return `zone held by PR ${cause.pr}`;
  return "cause unknown";
}

// Le statut de la cuisine en une ligne, ou null quand elle n'est pas arrêtée.
export function statutDeLaCuisine(entree: EntreeDeLArret): string | null {
  const arret = arretDeLaCuisine(entree);
  return arret === null ? null : statutDeLArret(arret);
}
