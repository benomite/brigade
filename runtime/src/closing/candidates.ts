// Ce qu'une passe qui écrit propose à son closer : les doublons et le code
// mort que l'observation repère, chacun sous un nom court — et rien de ce
// qu'un cook tient. Les fichiers de ses candidats sont sa zone : ce qu'elle
// tient tant qu'elle range, et les seuls qu'elle peut écrire. Après elle, la
// même observation dit ce qui est resté : rien n'est tenu pour retiré sur la
// parole du closer.
import type { Laisse } from "../events/closing.ts";
import { tenant, type Vol } from "./condition.ts";
import { repererCodeMort } from "./dead-code.ts";
import { extrait, repererDoublons } from "./duplicates.ts";
import type { Depot, Texte } from "./reading.ts";

// Une passe n'en propose pas davantage : sa consigne reste lisible, et ce
// qu'elle peut retirer reste relisible.
export const CANDIDATS_MAX = 40;

// `id` : `D<n>` pour un doublon, `M<n>` pour un export mort. `quoi` : tel
// qu'il se lit. `fichiers` : ceux qu'il faut écrire pour le retirer. `cle` :
// ce qui le reconnaît dans une autre observation, où que ses lignes soient
// rendues.
export type Candidat = { id: string; quoi: string; fichiers: string[]; cle: string };

const DOC = /\.(md|mdx|markdown|rst|txt)$/;
const cleDeMort = (chemin: string, nom: string) => `mort ${chemin} ${nom}`;
const cleDeDoublon = (lignes: string) => `doublon ${lignes}`;

function cles({ textes }: Pick<Depot, "textes">): Set<string> {
  const contenu = new Map(textes.map(({ chemin, texte }) => [chemin, texte]));
  return new Set([
    ...repererDoublons(textes).flatMap(({ passages }) => passages.map((passage) => cleDeDoublon(extrait(contenu.get(passage.chemin) ?? "", passage)))),
    ...repererCodeMort(textes).map(({ chemin, nom }) => cleDeMort(chemin, nom)),
  ]);
}

// Tous les candidats de la branche, les doublons les plus longs d'abord.
export function candidats({ textes }: Pick<Depot, "textes">): Candidat[] {
  const contenu = new Map(textes.map(({ chemin, texte }) => [chemin, texte]));
  // La doc qui écrit un nom ne le fait pas vivre : elle est à reprendre avec lui.
  const docs = textes.filter(({ chemin }) => DOC.test(chemin));
  const nomment = (nom: string) => docs.filter(({ texte }: Texte) => new RegExp(`(?<![\\w$])${nom.replaceAll("$", "\\$")}(?![\\w$])`).test(texte)).map(({ chemin }) => chemin);
  const doublons = repererDoublons(textes).map(({ lignes, passages: [premier, second] }, rang): Candidat => ({
    id: `D${rang + 1}`,
    quoi: `${lignes} identical lines of code: \`${premier.chemin}:${premier.debut}-${premier.fin}\` = \`${second.chemin}:${second.debut}-${second.fin}\``,
    fichiers: [...new Set([premier.chemin, second.chemin])],
    cle: cleDeDoublon(extrait(contenu.get(premier.chemin) ?? "", premier)),
  }));
  const morts = repererCodeMort(textes).map(({ chemin, ligne, nom, tests }, rang): Candidat => ({
    id: `M${rang + 1}`,
    quoi: `export \`${nom}\` of \`${chemin}:${ligne}\` — referenced ${tests.length === 0 ? "nowhere" : `only by tests (${tests.map((test) => `\`${test}\``).join(", ")})`}`,
    fichiers: [...new Set([chemin, ...tests, ...nomment(nom)])],
    cle: cleDeMort(chemin, nom),
  }));
  return [...doublons, ...morts];
}

// `proposes` : ce que la passe remet à son closer. `ecartes` : ce qu'elle
// laisse d'emblée, et pourquoi. `zone` : les fichiers de ce qu'elle propose.
export type Proposition = { proposes: Candidat[]; ecartes: Laisse[]; zone: string[] };

// Un candidat dont un seul fichier est tenu par un cook n'est pas proposé :
// la passe ne touche pas ce qu'un cook tient.
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

// Ceux des candidats proposés que la branche de la passe porte encore.
export function restants(proposes: Candidat[], apres: Pick<Depot, "textes">): Candidat[] {
  const encore = cles(apres);
  return proposes.filter(({ cle }) => encore.has(cle));
}
