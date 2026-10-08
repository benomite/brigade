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
// l'écrit en tête des siens ; le chef l'écrit sur un ticket qu'il ajoute.
const REFERENCE = /^[ \t]*[*_]{0,2}[ÉEé]pique[ \t]*:[ \t]*[*_]{0,2}[ \t]*#([1-9]\d*)\b/iu;

export function reference(epic: number): string {
  return `Épique : #${epic}`;
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
