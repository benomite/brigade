// Une vision produit ou un document de référence n'est pas un livrable : elle
// ne se cuisine pas, et ne reste pas sur le rail (#3479). Seen on
// benomite/secondes : la vision du produit (#3) portait `fire` et attendait un
// cook. Le tri du manager la reconnaît avant tout jugement et l'écarte
// (`vision`) ; ce module la sort du rail — `fire` retiré — et le dit sur
// l'issue, en une seule ligne, une seule fois.
import type { GitHub, IssueOuverte } from "../github.ts";
import { LABEL } from "../github.ts";

// Les labels par lesquels une issue se dit vision ou document de référence.
const LABELS_DE_REFERENCE = ["vision", "reference", "product-vision"];

// Un titre qui s'annonce vision : « Product vision — Secondes », « Vision: … »,
// « [Vision] … », « Vision produit ». Le mot seul en tête ne suffit pas :
// « Vision mode for the camera » est un livrable. Un document de référence se
// dit par son label : « Reference docs: … » peut être un livrable à écrire.
const TITRE = /^\s*\[?\s*(?:product\s+)?vision(?:\s+(?:produit|du\s+produit|document))?\s*(?:\]|:|—|–|-|$)/iu;

export function estUneVision(issue: Pick<IssueOuverte, "title" | "labels">): boolean {
  return issue.labels.some((label) => LABELS_DE_REFERENCE.includes(label.toLowerCase())) || TITRE.test(issue.title);
}

// La marque de la ligne : elle ne se pose pas deux fois. Sur la même ligne que
// ce qu'elle dit — GitHub n'en montre rien.
export const MARQUE_VISION = "<!-- brigade:vision -->";

export const LIGNE_VISION = `**Manager — taken off the rail:** a product vision or a reference document is not a deliverable, so no cook takes it; \`fire\` is removed. ${MARQUE_VISION}`;

// Sort du rail une vision qui porte `fire` : la ligne d'abord, si elle n'est pas
// déjà sur l'issue, puis le label. Rend vrai quand il ne reste rien à faire,
// faux si GitHub n'a pas répondu — le tour suivant reprend là.
export async function sortirLaVision(
  github: Pick<GitHub, "commentaires" | "commenter" | "delabelliser">,
  issue: Pick<IssueOuverte, "number" | "labels">,
  avertir: (message: string) => void,
): Promise<boolean> {
  if (!issue.labels.includes(LABEL)) return true;
  try {
    const dite = (await github.commentaires(issue.number)).some((commentaire) => commentaire.body.includes(MARQUE_VISION));
    if (!dite) await github.commenter(issue.number, LIGNE_VISION);
    await github.delabelliser(issue.number, LABEL);
  } catch (erreur) {
    avertir(`brigade : la vision #${issue.number} n'est pas sortie du rail, reprise au tour suivant — ${erreur instanceof Error ? erreur.message : String(erreur)}`);
    return false;
  }
  return true;
}
