// Ce que la CI rouge d'une livraison dit d'elle-même, remis au cook qui la
// reprend (#2545). Le cook n'a aucun accès à GitHub : il ne savait que « the
// CI of PR #N is red », au mieux le nom des jobs, et rebâtissait la sélection
// de la CI pour la rejouer et trouver le test en échec — sur les tickets de
// #2545, 16 cooks repris sur une CI rouge, 93 min de cuisson. La CI écrit
// pourtant ses tests en échec, par leur nom et leur erreur, en annotations
// de ses checks (`.github/workflows/tests.yml`) ; la station les lit et les
// lui donne, check par check.
//
// Le texte part dans la consigne, un argument de `claude` : il est borné.
import type { Check } from "../../events/pass.ts";
import type { AnnotationDeCheck } from "../../github.ts";

export type GitHubDeLaCiRouge = { annotationsDuCheck?(check: Check): Promise<AnnotationDeCheck[]> };

// Au-delà de `CHECKS_MAX` checks rouges, les suivants ne sont que nommés ; un
// message d'annotation garde ses `MESSAGE_MAX` premiers caractères — la liste
// des tests en échec vient d'abord —, et le tout tient en `DIT_MAX`.
export const CHECKS_MAX = 12;
export const MESSAGE_MAX = 3_000;
export const DIT_MAX = 24_000;

// Une clôture de bloc plus longue que toute suite d'accents graves du texte.
const cloture = (texte: string) => "`".repeat(Math.max(3, ...[...texte.matchAll(/`+/g)].map(([suite]) => suite.length + 1)));

const couper = (texte: string, max: number) => (texte.length <= max ? texte : `${texte.slice(0, max)}\n…`);

function annotationEnTexte({ chemin, ligne, titre, message }: AnnotationDeCheck): string {
  const ou = chemin === null ? "" : ligne === null ? chemin : `${chemin}:${ligne}`;
  const tete = [ou, titre].filter((partie) => partie !== "").join(" — ");
  return [tete, couper(message.trimEnd(), MESSAGE_MAX)].filter((partie) => partie !== "").join("\n");
}

// Le bloc « What the CI says » des checks rouges, ou "" sans check rouge.
// Un check dont GitHub ne rend pas les annotations est dit tel quel, avec son
// adresse : le cook sait au moins lequel rejouer.
export async function ceQueDitLaCiRouge(github: GitHubDeLaCiRouge, rouges: Check[]): Promise<string> {
  if (rouges.length === 0) return "";
  const lus = rouges.slice(0, CHECKS_MAX);
  const blocs: string[] = [];
  let taille = 0;
  for (const check of lus) {
    let annotations: AnnotationDeCheck[] = [];
    try {
      annotations = (await github.annotationsDuCheck?.(check)) ?? [];
    } catch {
      // Illisibles, elles ne retiennent pas le cook : le check est dit sans elles.
    }
    const titre = `#### \`${check.name}\``;
    const sans = check.url === null ? "_GitHub gives no failure annotation for this check._" : `_GitHub gives no failure annotation for this check: ${check.url}_`;
    const texte = couper(annotations.map(annotationEnTexte).join("\n\n"), DIT_MAX);
    const bloc = texte === "" ? [titre, "", sans].join("\n") : [titre, "", cloture(texte), texte, cloture(texte)].join("\n");
    if (blocs.length > 0 && taille + bloc.length > DIT_MAX) break;
    blocs.push(bloc);
    taille += bloc.length;
  }
  const reste = rouges.slice(blocs.length).map((check) => `\`${check.name}\``);
  return [
    "### What the CI says is red",
    "",
    "Its failure annotations, check by check — the failing tests, with their errors, as the CI wrote them. Start from these: there is no need to rebuild the CI's selection of tests to find what failed.",
    "",
    blocs.join("\n\n"),
    ...(reste.length > 0 ? ["", `${reste.length} more red check${reste.length === 1 ? "" : "s"}, not read here: ${reste.join(", ")}.`] : []),
  ].join("\n");
}
