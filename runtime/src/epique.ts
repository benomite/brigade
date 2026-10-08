// La liste des tickets d'une épique, telle que le runtime l'écrit dans le
// corps de l'issue : un bloc entre deux marqueurs, seule partie de ce corps
// qui soit à lui. Tout le reste est écrit par un humain, et n'est jamais
// touché. Sans E/S.
export const DEBUT = "<!-- brigade:tickets -->";
export const FIN = "<!-- /brigade:tickets -->";

// La ligne par laquelle un ticket dit de quelle épique il vient. Le manager
// l'écrit en tête des siens ; le chef l'écrit sur un ticket qu'il ajoute.
const REFERENCE = /^[ \t]*[*_]{0,2}[ÉEé]pique[ \t]*:[ \t]*[*_]{0,2}[ \t]*#([1-9]\d*)\b/imu;

export function reference(epic: number): string {
  return `Épique : #${epic}`;
}

// L'épique dont le corps d'une issue se réclame, ou null.
export function epiqueDe(corps: string): number | null {
  const numero = Number(REFERENCE.exec(corps)?.[1]);
  return Number.isSafeInteger(numero) ? numero : null;
}

export function porteListe(corps: string): boolean {
  return corps.includes(DEBUT);
}

// Où le bloc commence et finit dans le corps, ou null s'il n'y est pas. Un
// marqueur de début sans marqueur de fin ne possède que lui-même : ce qui le
// suit a pu être écrit par un humain.
function bornes(corps: string): [number, number] | null {
  const debut = corps.indexOf(DEBUT);
  if (debut === -1) return null;
  const fin = corps.indexOf(FIN, debut);
  return [debut, fin === -1 ? debut + DEBUT.length : fin + FIN.length];
}

// Le corps sans son bloc : ce que l'humain a écrit.
export function sansListe(corps: string): string {
  const trouve = bornes(corps);
  return trouve ? `${corps.slice(0, trouve[0]).trimEnd()}${corps.slice(trouve[1])}` : corps;
}

// Le corps, son bloc remplacé par celui-ci — ou ajouté à la fin s'il n'en
// portait pas.
export function avecListe(corps: string, bloc: string): string {
  const trouve = bornes(corps);
  if (trouve) return `${corps.slice(0, trouve[0])}${bloc}${corps.slice(trouve[1])}`;
  return corps.trim() === "" ? bloc : `${corps.trimEnd()}\n\n${bloc}`;
}

export type LigneDeListe = { ticket: number; title: string; state: string; served: boolean };

const cellule = (texte: string) => texte.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();

// Le bloc : un tableau d'une ligne par ticket, et le décompte de ce qui est
// servi — l'avancement d'un seul coup d'œil.
export function rendreListe(epic: number, lignes: LigneDeListe[]): string {
  const servis = lignes.filter((ligne) => ligne.served).length;
  return [
    DEBUT,
    "## Tickets de l'épique",
    "",
    `**${servis}/${lignes.length} ${servis > 1 ? "servis" : "servi"}.**`,
    "",
    "| # | Ticket | État |",
    "|---|---|---|",
    ...lignes.map((ligne) => `| #${ligne.ticket} | ${cellule(ligne.title)} | ${cellule(ligne.state)} |`),
    "",
    `_Liste tenue par le manager : ce qui est entre ses deux marqueurs est réécrit, le reste de l'épique est à toi. Pour y faire entrer un ticket que tu ajoutes, écris \`${reference(epic)}\` dans son corps._`,
    FIN,
  ].join("\n");
}
