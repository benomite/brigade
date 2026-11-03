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
import { heureEn } from "../../etat.ts";
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
  return file.length === 1 ? `## Awaiting the chef — 1 decision, since ${depuis(premiere.depuis)}` : `## Awaiting the chef — ${file.length} decisions, the oldest since ${depuis(premiere.depuis)}`;
}

// Une ligne de la file : ce qui la nomme, depuis quand, son titre, puis ce qui
// attend et le geste du chef ; sous une carte, ses choix numérotés.
function ligneDeLaFile(ligne: LigneDeLaFile, depuis: (instant: string) => string, compacte: boolean): string[] {
  const tete = [`**${enMarkdown(ligne.nom)}**`, `since ${depuis(ligne.depuis)}`, ...(ligne.titre === null || ligne.titre === "" ? [] : [enMarkdown(ligne.titre)])].join(" · ");
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
  const depuis = heureEn;
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
    ...(tableau.resserre === undefined || tableau.resserre.length === 0 ? [] : ["", `_Left out of the block to fit: ${tableau.resserre.join(", ")}. The rail and the queue are kept._`]),
    "",
  ];
}

// Chaque élément d'une liste, sans ce champ.
const sansLeChamp = (liste: unknown, champ: string): unknown =>
  Array.isArray(liste) ? liste.map((element: unknown) => (typeof element === "object" && element !== null ? Object.fromEntries(Object.entries(element).filter(([cle]) => cle !== champ)) : element)) : liste;
const dansLesFaits = (tableau: Tableau, liste: string, champ: string): Tableau =>
  tableau.faits === undefined || !(liste in tableau.faits) ? tableau : { ...tableau, faits: { ...tableau.faits, [liste]: sansLeChamp(tableau.faits[liste], champ) } };

// Les étapes passées de chaque cook : ce qu'il fait en ce moment reste.
const sansLesEtapesPassees = (tableau: Tableau): Tableau =>
  tableau.activites === undefined ? tableau : { ...tableau, activites: tableau.activites.map((activite) => ({ ...activite, etapes: activite.maintenant === null ? [] : [activite.maintenant] })) };

// Ce qui retient chaque issue avant le rail : leur nombre et leur état restent.
const sansCeQuiRetient = (tableau: Tableau): Tableau =>
  tableau.avantLeRail === undefined ? tableau : { ...tableau, avantLeRail: { ...tableau.avantLeRail, issues: tableau.avantLeRail.issues.map((issue) => ({ ...issue, dit: "" })) } };

const sans = (champ: "distantes" | "gestes" | "activites") => (tableau: Tableau): Tableau => {
  const { [champ]: _retire, ...reste } = tableau;
  return reste;
};

// Ce qu'un corps encore trop long retire du bloc, dans cet ordre, jusqu'à tenir :
// l'historique et les blocs secondaires d'abord — le relais des stations
// distantes (`distantes`, le plus lourd), les étapes passées des cooks, le texte
// des relectures des livrés, les gestes du chef déjà joués, les activités des
// cooks, les livraisons qui attendent, les diffs des corrections —, puis ce qui
// retient chaque issue avant le rail, et ces issues. Le rail (`faits`,
// `lignesDuRail`), la file du chef avec ses cartes (TODO) et l'état de la cuisine
// ne sont jamais retirés (ticket 2157) : si le corps ne tient pas encore, il
// reste trop long plutôt que d'écarter ce que le chef lit d'abord.
const RESSERREMENTS: Array<{ quoi: Resserre[]; retirer(tableau: Tableau): Tableau }> = [
  { quoi: ["distantes"], retirer: sans("distantes") },
  { quoi: ["activites.etapes"], retirer: sansLesEtapesPassees },
  { quoi: ["faits.livres.relecture"], retirer: (tableau) => dansLesFaits(tableau, "livres", "relecture") },
  { quoi: ["gestes"], retirer: sans("gestes") },
  { quoi: ["activites"], retirer: sans("activites") },
  { quoi: ["faits.attend.livraison"], retirer: (tableau) => dansLesFaits(tableau, "attend", "livraison") },
  { quoi: ["faits.corrections.diff"], retirer: (tableau) => dansLesFaits(tableau, "corrections", "diff") },
  { quoi: ["avantLeRail.dit"], retirer: sansCeQuiRetient },
  { quoi: ["avantLeRail"], retirer: ({ avantLeRail: _avant, ...reste }) => reste },
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
