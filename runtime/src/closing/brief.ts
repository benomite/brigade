// What the pass tells its closer, what it reads back from it, and what it
// writes in its PR. The closer removes dead code and factors duplicates, it
// does not judge alone: what it leaves for lack of certainty is said, one line
// per candidate, and the PR carries it.
import type { Laisse } from "../events/closing.ts";
import { CONSIGNE_DE_FIN_DE_TOUR, CONSIGNE_DU_LIVRABLE } from "../livrable.ts";
import type { Candidat } from "./candidates.ts";

// The line by which the closer says it leaves a candidate, and why.
export const MOT_LAISSE = "LAISSÉ";
const LIGNE_LAISSE = /^[\s>*-]*LAISS[ÉE]\s+`?([DM]\d+)`?\s*:\s*(\S.*)$/gimu;
// What the pass says of a remaining candidate the closer did not name.
export const SANS_MOTIF = "the closer gave no reason — the candidate is still spotted after the pass";

const nombre = (valeur: number) => valeur.toLocaleString("fr-FR");
const pluriel = (combien: number, mot: string) => `${nombre(combien)} ${mot}${combien > 1 ? "s" : ""}`;

// The four parts of a pass's PR, in this order: the brief names them to the
// closer, and the PR body is written under them.
export const PARTIES_DE_LA_PR = { retire: "Retiré", factorise: "Factorisé", gagne: "Lignes gagnées", laisse: "Laissé faute d'être sûr" } as const;

// A dead export is removed; a duplicate is factored.
const estMort = ({ id }: { id: string }) => id.startsWith("M");

export function consigneDuCloser(mission: { depot: string; base: string; candidats: Candidat[]; zone: string[]; retraits: number }): string {
  const { depot, base, candidats, zone, retraits } = mission;
  const { retire, factorise, gagne, laisse } = PARTIES_DE_LA_PR;
  return [
    `Tu es le closer de la brigade : tu ranges le dépôt ${depot}, hors de tout ticket, pour qu'il ne devienne pas une usine à gaz. Ton but est d'en retirer le plus que tu peux, sûrement : le code mort, tu le supprimes ; les passages dupliqués, tu les réunis en un seul endroit partagé. Tu ne te contentes pas de les lister, et tu n'ajoutes rien d'autre — ni fonctionnalité, ni fichier. Un cook qui se trompe ajoute du mauvais code, et la pass l'attrape ; toi, si tu te trompes, tu effaces du bon code, et les gates diront « ça marche toujours », puisque ce qui a disparu n'était testé par rien. Dans le doute, tu laisses, et tu dis pourquoi.`,
    "",
    `1. Tu es dans un worktree qui t'est propre, sur une branche neuve partie de \`${base}\`. Travaille ici et nulle part ailleurs. Les conventions du dépôt ne te sont pas chargées d'office : lis son \`CLAUDE.md\`, s'il en a un à la racine, avant d'écrire quoi que ce soit, et suis-le.`,
    `2. Voici ce que la fermeture qui observe a repéré sur \`${base}\`. Ce sont des candidats, pas des verdicts : du texte comparé à du texte. Un export qu'un framework lit par convention n'est nommé par personne et vit pourtant ; deux passages identiques ne sont pas toujours à réunir.`,
    ...candidats.map(({ id, quoi }) => `   - ${id} — ${quoi}`),
    "3. Ce que tu en fais :",
    "   - un export mort (`M…`) : tu le supprimes, et avec lui ce qui n'existait que pour lui — le test qui n'exerce que lui, la phrase de doc qui le décrit. Tu ne retires ni n'affaiblis aucun test de ce qui vit pour faire passer un retrait ;",
    "   - un doublon (`D…`) : tu le factorises. Tu gardes une seule copie, dans l'un des fichiers que tu tiens, sous un nom qui dit ce qu'elle fait, et l'autre endroit l'appelle : les deux passages n'en font plus qu'un. Deux passages qui se ressemblent mais doivent évoluer chacun de son côté ne sont pas à réunir : tu les laisses, en le disant.",
    "4. La règle de sûreté. Tu ne supprimes et ne factorises que ce que les gates, puis la CI que la pass attend avant de merger, prouvent encore vert après coup : joue les gates après chaque geste, et défais celui qui les fait virer au rouge — le candidat est alors laissé, avec ce qui a viré. Tu laisses tout ce qu'un framework ou un outil peut lire par convention, même si rien ne le nomme : les points d'entrée (un `main`, un `bin`, ce qu'un script, un `package.json` ou une configuration lance), l'API exportée que nomme `docs/`, et les fichiers chargés par leur nom (import dynamique, chaîne, glob, convention de nommage). Avant chaque geste, cherche les usages du candidat dans tout le dépôt, y compris ceux qui ne s'écrivent pas comme un import. Dans le doute, tu laisses, et tu dis pourquoi.",
    `5. Tu n'écris que dans ces fichiers, que la passe tient pour toi tant que tu ranges — tu n'en crées aucun, et un seul fichier écrit ailleurs fait que rien n'est livré. L'endroit partagé d'un doublon est donc l'un d'eux :`,
    ...zone.map((fichier) => `   - \`${fichier}\``),
    `6. Tu ne retires pas plus de ${pluriel(retraits, "ligne")} en tout, factorisations comprises : au-delà, la passe est arrêtée et rien n'est livré. Mieux vaut une passe courte et sûre.`,
    "7. Vérifie ton travail comme le dépôt le demande (tests, gates), puis commite-le sur cette branche. Tu ne pousses rien, tu n'ouvres pas de PR et tu ne merges jamais : la passe ouvre la PR, que la pass juge et merge comme celle d'un ticket.",
    `8. La PR que la passe écrit pour toi a quatre parties, dans cet ordre : « ${retire} » (le code mort supprimé), « ${factorise} » (les doublons réunis), « ${gagne} » (les lignes retirées contre les lignes ajoutées) et « ${laisse} » (chaque candidat laissé, avec son motif). Elle les tire de ta branche — ce que l'observation n'y repère plus — et de ton compte-rendu : rien n'y est tenu pour retiré sur ta parole.`,
    `9. Termine par ton compte-rendu, en clair : ce que tu as supprimé, ce que tu as factorisé et où vit la copie partagée, et comment tu as vérifié que rien de vivant n'en dépendait. Pour chaque candidat que tu n'as ni supprimé ni factorisé, écris une ligne à part, de cette forme exacte : \`${MOT_LAISSE} <nom du candidat> : <pourquoi tu n'es pas sûr>\` — par exemple \`${MOT_LAISSE} M2 : lu par convention par le framework de tests\`. Ces lignes sont recopiées dans la PR : un candidat laissé sans motif y est dit laissé sans motif. ${CONSIGNE_DU_LIVRABLE}`,
    "",
    CONSIGNE_DE_FIN_DE_TOUR,
  ].join("\n");
}

// The candidates the closer says it leaves, each with its reason. The last
// line naming a candidate wins.
export function motifsDuCloser(message: string | null): Map<string, string> {
  const motifs = new Map<string, string>();
  for (const [, id = "", motif = ""] of (message ?? "").matchAll(LIGNE_LAISSE)) motifs.set(id.toUpperCase(), motif.trim());
  return motifs;
}

// What the pass did not remove of what it proposed: what its branch still
// carries, and what the closer says it left — either is enough, nothing is
// taken as removed on its word.
export function laisses(proposes: Candidat[], restes: Candidat[], motifs: Map<string, string>): Laisse[] {
  const encore = new Set(restes.map(({ id }) => id));
  return proposes
    .filter(({ id }) => encore.has(id) || motifs.has(id))
    .map(({ id, quoi }) => ({ id, what: quoi, reason: motifs.get(id) ?? null, before: false }));
}

export function titreDeLaPR(run: string): string {
  return `Fermeture — passe ${run}`;
}

// What a pass left for lack of certainty, as the next pass can store it: one
// entry per candidate, where it is and why it was left.
export type Reste = { id: string; location: string[]; reason: string };

export function aRetenir(gardes: Laisse[], proposes: Candidat[]): Reste[] {
  const lieux = new Map(proposes.map(({ id, lieux }) => [id, lieux]));
  return gardes.map(({ id, reason }) => ({ id, location: lieux.get(id) ?? [], reason: reason ?? SANS_MOTIF }));
}

// The body of a pass's PR, in four parts: what it removed, what it factored,
// the lines saved, and everything it did not remove, with its reason. `deja`:
// how many candidates were not proposed again, left by an earlier pass with
// the code around them unchanged since (`memory.ts`).
export function corpsDeLaPR(passe: {
  run: string;
  base: string;
  calibration: { model: string; effort: string };
  proposes: Candidat[];
  laisses: Laisse[];
  ecartes: Laisse[];
  deja?: number;
  retirees: number;
  ajoutees: number;
  cap: number;
  fichiers: string[];
  compteRendu: string | null;
}): string {
  const { proposes, laisses: gardes, ecartes, retirees, ajoutees, deja = 0 } = passe;
  const { retire, factorise, gagne, laisse } = PARTIES_DE_LA_PR;
  const encore = new Set(gardes.map(({ id }) => id));
  const morts = proposes.filter(estMort);
  const doublons = proposes.filter((candidat) => !estMort(candidat));
  const faits = (genre: Candidat[]) => genre.filter(({ id }) => !encore.has(id));
  const [supprimes, reunis] = [faits(morts), faits(doublons)];
  const nommer = ({ id, quoi }: Candidat) => `- **${id}** — ${quoi}`;
  const dire = ({ id, what, reason }: Laisse) => `- **${id}** — ${what}\n  - ${reason ?? SANS_MOTIF}`;
  const gagnees = retirees - ajoutees;
  const bilan = gagnees >= 0 ? `${pluriel(gagnees, "ligne")} de moins` : `${pluriel(-gagnees, "ligne")} de plus`;
  return [
    `Passe de fermeture \`${passe.run}\` — hors du rail, closer en \`${passe.calibration.model}\` / \`${passe.calibration.effort}\`.`,
    "",
    `Elle n'a rien poussé sur \`${passe.base}\` et ne merge rien : ce qu'elle retire arrive par cette PR, que la pass juge et merge comme celle d'un ticket — fusionnée avec \`${passe.base}\`, sous les gates, le reviewer, la CI et le grant \`merge\`. Rouge, aucun cook ne la reprend : elle remonte au chef.`,
    "",
    `## ${retire} — ${supprimes.length} sur ${pluriel(morts.length, "export")} mort${morts.length > 1 ? "s" : ""}`,
    "",
    ...(supprimes.length === 0 ? ["Aucun code mort n'a été supprimé."] : supprimes.map(nommer)),
    "",
    `## ${factorise} — ${reunis.length} sur ${pluriel(doublons.length, "doublon")}`,
    "",
    ...(reunis.length === 0 ? ["Aucun doublon n'a été réuni."] : reunis.map(nommer)),
    "",
    `## ${gagne} — ${gagnees >= 0 ? nombre(gagnees) : `−${nombre(-gagnees)}`}`,
    "",
    `${pluriel(retirees, "ligne")} retirée${retirees > 1 ? "s" : ""}, ${ajoutees === 0 ? "aucune" : nombre(ajoutees)} ajoutée${ajoutees > 1 ? "s" : ""}, dans ${pluriel(passe.fichiers.length, "fichier")} : ${bilan}. Le plafond de retraits de la passe est de ${nombre(passe.cap)}.`,
    "",
    `## ${laisse} — ${gardes.length}`,
    "",
    ...(gardes.length === 0 ? ["Rien : tout ce qui était proposé a été retiré ou factorisé."] : gardes.map(dire)),
    ...(deja === 0 ? [] : ["", `${pluriel(deja, "candidat")} laissé${deja > 1 ? "s" : ""} par une passe précédente, sans que le code autour ait changé depuis, ${deja > 1 ? "n'ont" : "n'a"} pas été reproposé${deja > 1 ? "s" : ""} au closer.`]),
    ...(ecartes.length === 0 ? [] : ["", `## Écarté avant la passe — ${ecartes.length}`, "", ...ecartes.map(dire)]),
    ...(gardes.length === 0 ? [] : ["", "<details>", "<summary>Ce qui est laissé, une entrée par candidat</summary>", "", "```json", JSON.stringify(aRetenir(gardes, proposes), null, 2), "```", "", "</details>"]),
    ...(passe.compteRendu === null ? [] : ["", "<details>", "<summary>Le compte-rendu du closer</summary>", "", passe.compteRendu, "", "</details>"]),
  ].join("\n");
}
