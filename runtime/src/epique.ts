// La liste des tickets d'une épique, telle que le runtime l'écrit dans le
// corps de l'issue : un bloc entre deux marqueurs, seule partie de ce corps
// qui soit à lui. Tout le reste est écrit par un humain, et n'est jamais
// touché. Sans E/S.
export const DEBUT = "<!-- brigade:tickets -->";
export const FIN = "<!-- /brigade:tickets -->";

const LIGNE_DEBUT = /^\s*<!--\s*brigade:tickets\s*-->\s*$/i;
const LIGNE_FIN = /^\s*<!--\s*\/brigade:tickets\s*-->\s*$/i;
const BLOC_DE_CODE = /^\s*(```|~~~)/;

export type Ligne = { texte: string; debut: number; fin: number };

// Les lignes d'un corps, sans celles de ses blocs de code, chacune avec sa
// place : un marqueur cité dans un exemple n'est pas un marqueur.
export function lignesHorsCode(corps: string): Ligne[] {
  const lignes: Ligne[] = [];
  let dansUnBloc = false;
  let debut = 0;
  for (const brute of corps.split("\n")) {
    const fin = debut + brute.length;
    if (BLOC_DE_CODE.test(brute)) dansUnBloc = !dansUnBloc;
    else if (!dansUnBloc) lignes.push({ texte: brute.replace(/\r$/, ""), debut, fin });
    debut = fin + 1;
  }
  return lignes;
}

// La ligne par laquelle un ticket dit de quelle épique il vient. Le manager
// l'écrit en tête des siens, en anglais (`Epic: #N`) ; le chef l'écrit sur un
// ticket qu'il ajoute. La forme française d'avant (`Épique : #N`) se lit encore.
const REFERENCE = /^[ \t]*[*_]{0,2}(?:[ÉEé]pique|Epic)[ \t]*:[ \t]*[*_]{0,2}[ \t]*#([1-9]\d*)\b/iu;

export function reference(epic: number): string {
  return `Epic: #${epic}`;
}

// L'épique dont le corps d'une issue se réclame, ou null.
export function epiqueDe(corps: string): number | null {
  for (const { texte } of lignesHorsCode(corps)) {
    const numero = Number(REFERENCE.exec(texte)?.[1]);
    if (Number.isSafeInteger(numero)) return numero;
  }
  return null;
}

// Où le bloc commence et finit dans le corps, ou null s'il n'y est pas. Un
// marqueur ne compte que seul sur sa ligne, hors bloc de code : le citer dans
// une phrase ou dans un exemple ne pose pas de liste. Un marqueur de début
// sans marqueur de fin ne possède que sa ligne : ce qui le suit a pu être
// écrit par un humain.
function bornes(corps: string): [number, number] | null {
  const lignes = lignesHorsCode(corps);
  const debut = lignes.findIndex((ligne) => LIGNE_DEBUT.test(ligne.texte));
  const ouvre = lignes[debut];
  if (!ouvre) return null;
  const ferme = lignes.slice(debut + 1).find((ligne) => LIGNE_FIN.test(ligne.texte));
  return [ouvre.debut, (ferme ?? ouvre).fin];
}

// Le marqueur de début suffit : c'est le geste par lequel le chef dit qu'une
// épique est déjà découpée.
export function porteListe(corps: string): boolean {
  return bornes(corps) !== null;
}

// Les tickets que le bloc nomme, dans son ordre et sans doublon : le numéro en
// tête de chaque ligne de son tableau, ou de chaque élément de liste quand le
// chef l'a écrit à la main (`- #68`). Rien hors du bloc.
const LIGNE_DE_TICKET = /^\s*(?:\|\s*|[-*+]\s+(?:\[[ xX]\]\s+)?)#([1-9]\d*)\b/;

export function ticketsDeLaListe(corps: string): number[] {
  const trouve = bornes(corps);
  if (!trouve) return [];
  const numeros = new Set<number>();
  for (const { texte } of lignesHorsCode(corps.slice(trouve[0], trouve[1]))) {
    const numero = Number(LIGNE_DE_TICKET.exec(texte)?.[1]);
    if (Number.isSafeInteger(numero)) numeros.add(numero);
  }
  return [...numeros];
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
    "## Tickets of the epic",
    "",
    `**${servis}/${lignes.length} served.**`,
    "",
    "| # | Ticket | State |",
    "|---|---|---|",
    ...lignes.map((ligne) => `| #${ligne.ticket} | ${cellule(ligne.title)} | ${cellule(ligne.state)} |`),
    "",
    `_List kept by the manager: what is between its two markers is rewritten, the rest of the epic is yours. To bring in a ticket you add, write \`${reference(epic)}\` in its body._`,
    FIN,
  ].join("\n");
}
