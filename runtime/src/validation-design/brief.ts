// Le brief de la carte « Validate its screen » (#3330) : en tête du détail en
// grand, ce que le ticket demandait et ce que le cook a changé à l'écran, pour
// que le chef sache où regarder sur les captures sans ouvrir l'issue ni la PR.
//
// - Ce qui a été fait : le cook l'écrit dans son dernier message, entre
//   `<a-l-ecran>` et `</a-l-ecran>` — 1 à 5 points, un par ligne, en mots
//   simples sur ce qui se voit (`CONSIGNE_DU_BRIEF`, dans la consigne des
//   captures). La station le lit à la fin de sa cuisson et le poste sur la PR,
//   sous un marqueur (`corpsDeCeQuiEstFait`).
// - Ce qui était demandé : tiré de l'issue, sans génération — son titre, puis
//   le premier paragraphe de son corps, coupés à `DEMANDE_MAX` caractères.
// - La pass, quand elle pose la carte, y recopie les deux (`lignesDuBrief`) :
//   l'app les lit dans le corps de la carte, comme ses captures. Une PR sans
//   points — un cook d'avant ce ticket, ou qui n'en a écrit aucun — donne une
//   carte qui le dit.
import { DE_CONFIANCE } from "../alimenter.ts";
import { lireDelimitation } from "../livrable.ts";

export const OUVERTURE_A_L_ECRAN = "<a-l-ecran>";
export const FERMETURE_A_L_ECRAN = "</a-l-ecran>";
export const POINTS_MAX = 5;
const POINT_MAX = 160;
// Deux lignes du détail, à peu près, sur un écran de bureau : la vue les coupe
// à deux lignes affichées, le corps de la carte n'en garde pas plus.
export const DEMANDE_MAX = 240;

// Ce que la consigne du cook d'une livraison design lui dit d'écrire.
export const CONSIGNE_DU_BRIEF = `Le chef qui valide tes captures lit d'abord ce que tu as changé à l'écran : dans ton dernier message, écris-le entre \`${OUVERTURE_A_L_ECRAN}\` et \`${FERMETURE_A_L_ECRAN}\`, balises nues, en 1 à ${POINTS_MAX} points, un par ligne, en anglais, en mots simples sur ce qui se voit à l'écran (« the TODO column takes the full width », « cards show their question on one line ») — aucun nom de fichier, de test ni détail technique.`;

const aPlat = (texte: string) => texte.replace(/\s+/g, " ").trim();

function couper(texte: string, max: number): string {
  if (texte.length <= max) return texte;
  const coupe = texte.slice(0, max - 1);
  const espace = coupe.lastIndexOf(" ");
  return `${(espace > max / 2 ? coupe.slice(0, espace) : coupe).replace(/[\s,;:.—-]+$/, "")}…`;
}

// Les points que le cook a écrits à l'écran, une ligne chacun, sans leur puce ;
// nul s'il n'en a écrit aucun. Au-delà de cinq, les premiers.
export function lirePointsALEcran(message: string | null): string[] | null {
  const texte = lireDelimitation(message, "a-l-ecran");
  if (texte === null) return null;
  const points = texte
    .split("\n")
    .map((ligne) => aPlat(ligne.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "")))
    .filter((ligne) => ligne !== "")
    .slice(0, POINTS_MAX)
    .map((ligne) => couper(ligne, POINT_MAX));
  return points.length === 0 ? null : points;
}

// ── Sur la PR ──

const MARQUE = "<!-- brigade:a-l-ecran -->";

// Le numéro de la PR que GitHub vient d'ouvrir, lu dans son adresse ; nul
// s'il ne s'y lit pas.
export function numeroDeLaPR(adresse: string): number | null {
  const lu = /\/pull\/([1-9][0-9]*)\/?$/.exec(adresse);
  return lu === null ? null : Number(lu[1]);
}

// Le commentaire que la station poste sur la PR à la fin d'une cuisson.
export const corpsDeCeQuiEstFait = (points: readonly string[]) => [MARQUE, "**What was done on the screen**, by the cook:", "", ...points.map((point) => `- ${point}`)].join("\n");

// Les points du dernier commentaire marqué de la PR, d'un auteur de confiance ;
// nuls si aucun.
export function ceQuiEstFait(commentaires: ReadonlyArray<{ body: string; association: string }>): string[] | null {
  const dernier = commentaires.findLast((c) => DE_CONFIANCE.includes(c.association) && c.body.startsWith(MARQUE));
  if (dernier === undefined) return null;
  const points = dernier.body
    .split("\n")
    .filter((ligne) => ligne.startsWith("- "))
    .map((ligne) => aPlat(ligne.slice(2)))
    .filter((ligne) => ligne !== "");
  return points.length === 0 ? null : points.slice(0, POINTS_MAX);
}

// ── Ce qui était demandé ──

// Du Markdown, le texte qui se lit : sans images, liens réduits à leur texte,
// sans emphase ni code.
const sansMarkdown = (texte: string) =>
  texte
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/[*_`]+/g, "");

// Le besoin que le corps de l'issue énonce : son premier paragraphe de texte,
// ses titres, tableaux, blocs de code et commentaires HTML passés.
export function besoinDuCorps(corps: string): string {
  const paragraphes = corps
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/```[\s\S]*?```/g, "\n\n")
    .split(/\n\s*\n/);
  for (const paragraphe of paragraphes) {
    const lignes = paragraphe.split("\n").filter((ligne) => !/^\s*#/.test(ligne) && !/^\s*\|/.test(ligne) && !/^\s*(?:-{3,}|\*{3,})\s*$/.test(ligne));
    const texte = aPlat(sansMarkdown(lignes.map((ligne) => ligne.replace(/^\s*>\s?/, "")).join(" ")));
    if (texte !== "") return texte;
  }
  return "";
}

// Ce que le ticket demandait, en deux lignes au plus : son titre, puis son besoin.
export function ceQuiEstDemande(titre: string, corps: string | null): string {
  const besoin = corps === null ? "" : besoinDuCorps(corps);
  return couper(aPlat(besoin === "" ? titre : `${aPlat(titre)} — ${besoin}`), DEMANDE_MAX);
}

// ── Sur la carte ──

export const TITRE_DEMANDE = "### What was asked";
export const TITRE_FAIT = "### What was done";
export const SANS_RESUME = "No summary of what was done is available: the cook wrote none for this delivery.";

// Le brief, tel que le corps de la carte le porte, avant ses captures.
export const lignesDuBrief = (demande: string, fait: readonly string[] | null): string[] => [
  TITRE_DEMANDE,
  "",
  demande,
  "",
  TITRE_FAIT,
  "",
  ...(fait === null ? [`_${SANS_RESUME}_`] : fait.map((point) => `- ${point}`)),
  "",
];
