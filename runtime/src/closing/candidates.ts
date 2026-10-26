// What a writing pass proposes to its closer: the duplicates and dead code
// the observation spots, each under a short name — and nothing a cook holds.
// The files of its candidates are its zone: what it holds while it tidies, and
// the only ones it may write. After it, the same observation says what is
// left: nothing is taken as removed on the closer's word.
import type { Laisse } from "../events/closing.ts";
import { tenant, type Vol } from "./condition.ts";
import { repererCodeMort } from "./dead-code.ts";
import { extrait, repererDoublons } from "./duplicates.ts";
import type { Depot, Texte } from "./reading.ts";

// A pass proposes no more than this: its brief stays readable, and what it
// may remove stays reviewable.
export const CANDIDATS_MAX = 40;

// `id`: `D<n>` for a duplicate, `M<n>` for a dead export. `quoi`: as it
// reads. `lieux`: where it is, `<path>:<line>` or `<path>:<first>-<last>`, one
// per passage. `fichiers`: those to write in order to remove it. `cle`: what
// recognizes it in another observation, wherever its lines are rendered.
export type Candidat = { id: string; quoi: string; lieux: string[]; fichiers: string[]; cle: string };

const DOC = /\.(md|mdx|markdown|rst|txt)$/;
const cleDeMort = (chemin: string, nom: string) => `mort ${chemin} ${nom}`;
const cleDeDoublon = (lignes: string) => `doublon ${lignes}`;
const liste = (chemins: string[]) => chemins.map((chemin) => `\`${chemin}\``).join(", ");

function cles({ textes }: Pick<Depot, "textes">): Set<string> {
  const contenu = new Map(textes.map(({ chemin, texte }) => [chemin, texte]));
  return new Set([
    ...repererDoublons(textes).flatMap(({ passages }) => passages.map((passage) => cleDeDoublon(extrait(contenu.get(passage.chemin) ?? "", passage)))),
    ...repererCodeMort(textes).map(({ chemin, nom }) => cleDeMort(chemin, nom)),
  ]);
}

// All the candidates of the branch, the longest duplicates first.
export function candidats({ textes }: Pick<Depot, "textes">): Candidat[] {
  const contenu = new Map(textes.map(({ chemin, texte }) => [chemin, texte]));
  // Docs that write a name do not keep it alive: they are to be taken back with it.
  const docs = textes.filter(({ chemin }) => DOC.test(chemin));
  const nomment = (nom: string) => docs.filter(({ texte }: Texte) => new RegExp(`(?<![\\w$])${nom.replaceAll("$", "\\$")}(?![\\w$])`).test(texte)).map(({ chemin }) => chemin);
  const doublons = repererDoublons(textes).map(({ lignes, passages: [premier, second] }, rang): Candidat => ({
    id: `D${rang + 1}`,
    quoi: `${lignes} identical lines of code: \`${premier.chemin}:${premier.debut}-${premier.fin}\` = \`${second.chemin}:${second.debut}-${second.fin}\``,
    lieux: [`${premier.chemin}:${premier.debut}-${premier.fin}`, `${second.chemin}:${second.debut}-${second.fin}`],
    fichiers: [...new Set([premier.chemin, second.chemin])],
    cle: cleDeDoublon(extrait(contenu.get(premier.chemin) ?? "", premier)),
  }));
  const morts = repererCodeMort(textes).map(({ chemin, ligne, nom, tests }, rang): Candidat => {
    // Said in its description: an export that `docs/` names may be API, which
    // the closer leaves.
    const decrit = nomment(nom);
    return {
      id: `M${rang + 1}`,
      quoi: `export \`${nom}\` of \`${chemin}:${ligne}\` — referenced ${tests.length === 0 ? "nowhere" : `only by tests (${liste(tests)})`}${decrit.length === 0 ? "" : `, named in docs (${liste(decrit)})`}`,
      lieux: [`${chemin}:${ligne}`],
      fichiers: [...new Set([chemin, ...tests, ...decrit])],
      cle: cleDeMort(chemin, nom),
    };
  });
  return [...doublons, ...morts];
}

// `proposes`: what the pass hands to its closer. `ecartes`: what it leaves
// outright, and why. `zone`: the files of what it proposes.
export type Proposition = { proposes: Candidat[]; ecartes: Laisse[]; zone: string[] };

// A candidate with even one file held by a cook is not proposed: the pass
// does not touch what a cook holds.
export function proposer(tous: Candidat[], tenues: Vol[], max = CANDIDATS_MAX): Proposition {
  const proposes: Candidat[] = [];
  const ecartes: Laisse[] = [];
  for (const candidat of tous) {
    const tenu = candidat.fichiers.map((fichier) => ({ fichier, par: tenant(tenues, fichier) })).find(({ par }) => par !== null);
    if (tenu?.par) ecartes.push({ id: candidat.id, what: candidat.quoi, reason: `\`${tenu.fichier}\` is held by ticket #${tenu.par.ticket}${tenu.par.chemin === "*" ? "" : ` (zone \`${tenu.par.chemin}\`)`}`, before: true });
    else if (proposes.length >= max) ecartes.push({ id: candidat.id, what: candidat.quoi, reason: `beyond the ${max} candidates of one pass`, before: true });
    else proposes.push(candidat);
  }
  return { proposes, ecartes, zone: [...new Set(proposes.flatMap(({ fichiers }) => fichiers))].sort() };
}

// Those of the proposed candidates that the pass's branch still carries.
export function restants(proposes: Candidat[], apres: Pick<Depot, "textes">): Candidat[] {
  const encore = cles(apres);
  return proposes.filter(({ cle }) => encore.has(cle));
}
