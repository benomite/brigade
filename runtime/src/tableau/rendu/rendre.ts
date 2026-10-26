// Le corps de l'issue « Kitchen board » : une partie lisible en markdown — ce
// qui attend le chef, chaque ligne avec son geste, puis l'état de la cuisine,
// dans les mots de `status` —, et le bloc machine que les apps lisent
// (bloc.ts). Pur : rien n'est lu ni publié ici. Le même tableau rendu deux fois
// donne le même corps, octet pour octet, à l'heure de génération près.
//
// Le corps ne mentionne personne : l'éditer ne doit notifier aucun compte.
// Hors du code, chaque `@` est suivi d'un gluon invisible (U+2060), qui le
// sépare du nom qui le suit ; dans le code, GitHub ne mentionne pas ; dans le
// bloc, il est écrit `@`.
import { dureeEn } from "../../etat.ts";
import { ecrireLeBloc, type LigneDeLaFile, type Resserre, type RubriqueDuTableau, type Tableau } from "./bloc.ts";

// La longueur au-delà de laquelle GitHub refuse le corps d'une issue.
export const LONGUEUR_MAX_DU_CORPS = 65_536;
export const TITRE_DU_TABLEAU = "Kitchen board";
const GLUON = "⁠";
const RUBRIQUE_DU_PROJET = "project";

// Un texte de `status`, posé en markdown tel qu'il se lit : ses bouts de code
// (entre backticks) intacts, le reste échappé, et aucun `@` collé à un nom.
export function enMarkdown(texte: string): string {
  return texte
    .split(/(`[^`\n]+`)/)
    .map((bout, rang) => (rang % 2 === 1 ? bout : bout.replace(/[\\`*_[\]<>~&]/g, (c) => `\\${c}`).replaceAll("@", `@${GLUON}`)))
    .join("");
}

const heure = (instant: string) => `${instant.slice(0, 10)} ${instant.slice(11, 16)} UTC`;

function teteDeLaFile({ file }: Tableau, depuis: (instant: string) => string): string {
  const [premiere] = file;
  if (premiere === undefined) return "## Awaiting the chef — nothing";
  return file.length === 1 ? `## Awaiting the chef — 1 decision, for ${depuis(premiere.depuis)}` : `## Awaiting the chef — ${file.length} decisions, the oldest for ${depuis(premiere.depuis)}`;
}

// Une ligne de la file : ce qui la nomme, depuis quand, son titre, puis ce qui
// attend et le geste du chef ; sous une carte, ses choix numérotés.
function ligneDeLaFile(ligne: LigneDeLaFile, depuis: (instant: string) => string, compacte: boolean): string[] {
  const tete = [`**${enMarkdown(ligne.nom)}**`, `for ${depuis(ligne.depuis)}`, ...(ligne.titre === null || ligne.titre === "" ? [] : [enMarkdown(ligne.titre)])].join(" · ");
  if (compacte) return [`- ${tete}`];
  const choix = ligne.carte?.choix.map(({ texte, suite }, rang) => `   ${rang + 1}. ${enMarkdown(texte)} (${enMarkdown(suite)})`) ?? [];
  return [`- ${tete}\\`, `  ${enMarkdown(ligne.ligne)}`, ...choix];
}

// Une rubrique de l'état : son titre en gras, sa première ligne, les suivantes en dessous.
function rubrique({ titre, lignes }: RubriqueDuTableau, compacte: boolean): string[] {
  const [premiere = "", ...suite] = lignes;
  const tete = `- ${titre === "" ? "" : `**${enMarkdown(titre)}** `}${enMarkdown(premiere)}`;
  return compacte ? [tete] : [tete, ...suite.map((ligne) => `  - ${enMarkdown(ligne)}`)];
}

function partieLisible(tableau: Tableau, compacte: boolean): string[] {
  const depuis = (instant: string) => dureeEn(Date.parse(tableau.lu) - Date.parse(instant));
  const rangDuProjet = tableau.cuisine.rubriques.findIndex(({ titre }) => titre === RUBRIQUE_DU_PROJET);
  // Ce que `status` écrit au-dessus du projet — l'urgence, rien ne cuit — vient en tête du tableau.
  const alertes = rangDuProjet === -1 ? [] : tableau.cuisine.rubriques.slice(0, rangDuProjet);
  const etat = rangDuProjet === -1 ? tableau.cuisine.rubriques : tableau.cuisine.rubriques.slice(rangDuProjet);
  return [
    `# ${TITRE_DU_TABLEAU}${tableau.projet === null ? "" : ` — ${enMarkdown(tableau.projet)}`}`,
    "",
    `_What awaits the chef, then the kitchen's state, as \`status\` says them — read on ${heure(tableau.lu)}. The box rewrites this body: an edit here is lost at its next refresh._`,
    "",
    ...alertes.flatMap(({ titre, lignes }) => [`> **${enMarkdown([titre, ...lignes].filter((bout) => bout !== "").join(" "))}**`, ""]),
    teteDeLaFile(tableau, depuis),
    "",
    ...tableau.file.flatMap((ligne) => ligneDeLaFile(ligne, depuis, compacte)),
    ...(tableau.file.length === 0 ? [] : [""]),
    ...tableau.bilans.flatMap((bilan) => [`_${enMarkdown(bilan)}_`, ""]),
    "## Kitchen",
    "",
    ...etat.flatMap((dite) => rubrique(dite, compacte)),
    ...(compacte ? ["", "_Shortened to fit in an issue: the whole state is in the box's `status`._"] : []),
    "",
  ];
}

// Chaque élément d'une liste, sans ce champ.
const sansLeChamp = (liste: unknown, champ: string): unknown =>
  Array.isArray(liste) ? liste.map((element: unknown) => (typeof element === "object" && element !== null ? Object.fromEntries(Object.entries(element).filter(([cle]) => cle !== champ)) : element)) : liste;
const dansLesFaits = (tableau: Tableau, liste: string, champ: string): Tableau =>
  tableau.faits === undefined || !(liste in tableau.faits) ? tableau : { ...tableau, faits: { ...tableau.faits, [liste]: sansLeChamp(tableau.faits[liste], champ) } };

// Ce qu'un corps encore trop long retire du bloc, dans cet ordre, jusqu'à tenir :
// le plus lourd et le moins utile au rail d'abord — le texte des relectures des
// livrés, les livraisons qui attendent, les diffs des corrections —, puis les
// faits et les lignes du rail entiers. Ce que dit l'état, lui, n'est jamais retiré.
const RESSERREMENTS: Array<{ quoi: Resserre[]; retirer(tableau: Tableau): Tableau }> = [
  { quoi: ["faits.livres.relecture"], retirer: (tableau) => dansLesFaits(tableau, "livres", "relecture") },
  { quoi: ["faits.attend.livraison"], retirer: (tableau) => dansLesFaits(tableau, "attend", "livraison") },
  { quoi: ["faits.corrections.diff"], retirer: (tableau) => dansLesFaits(tableau, "corrections", "diff") },
  { quoi: ["faits", "lignesDuRail"], retirer: ({ faits: _faits, lignesDuRail: _lignes, ...reste }) => reste },
];

// Le corps de l'issue, généré à `genereLe`. Trop long pour GitHub, la partie
// lisible se resserre — les noms de la file et la première ligne de chaque
// rubrique — ; encore trop long, le bloc perd ce que `RESSERREMENTS` retire, et
// `resserre` le dit. Un tableau déjà resserré se rend resserré : le relire et le
// rendre redonne le corps publié, octet pour octet.
export function rendreLeTableau(tableau: Tableau, genereLe: Date): string {
  const corps = (rendu: Tableau, compacte: boolean) => [...partieLisible(rendu, compacte), ecrireLeBloc(rendu, genereLe), ""].join("\n");
  if (tableau.resserre === undefined) {
    const entier = corps(tableau, false);
    if (entier.length <= LONGUEUR_MAX_DU_CORPS) return entier;
  }
  let rendu = tableau;
  for (const { quoi, retirer } of RESSERREMENTS) {
    const compact = corps(rendu, true);
    if (compact.length <= LONGUEUR_MAX_DU_CORPS) return compact;
    const retire = retirer(rendu);
    // Rien à retirer à cette étape : elle ne se dit pas.
    if (JSON.stringify(retire) !== JSON.stringify(rendu)) rendu = { ...retire, resserre: [...(rendu.resserre ?? []), ...quoi] };
  }
  return corps(rendu, true);
}
