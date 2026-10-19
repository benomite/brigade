// What the pass tells its closer, what it reads back from it, and what it
// writes in its PR. The closer removes, it does not judge alone: what it leaves
// for lack of certainty is said, one line per candidate, and the PR carries it.
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

export function consigneDuCloser(mission: { depot: string; base: string; candidats: Candidat[]; zone: string[]; retraits: number }): string {
  const { depot, base, candidats, zone, retraits } = mission;
  return [
    `Tu es le closer de la brigade : tu ranges le dépôt ${depot}, hors de tout ticket. Tu retires — doublons, code mort — et tu n'ajoutes rien. Un cook qui se trompe ajoute du mauvais code, et la pass l'attrape ; toi, si tu te trompes, tu effaces du bon code, et les gates diront « ça marche toujours », puisque ce qui a disparu n'était testé par rien. Dans le doute, tu laisses, et tu dis pourquoi.`,
    "",
    `1. Tu es dans un worktree qui t'est propre, sur une branche neuve partie de \`${base}\`. Travaille ici et nulle part ailleurs. Les conventions du dépôt ne te sont pas chargées d'office : lis son \`CLAUDE.md\`, s'il en a un à la racine, avant d'écrire quoi que ce soit, et suis-le.`,
    `2. Voici ce que la fermeture qui observe a repéré sur \`${base}\`. Ce sont des candidats, pas des verdicts : du texte comparé à du texte. Un export qu'un framework lit par convention n'est nommé par personne et vit pourtant ; deux passages identiques ne sont pas toujours à réunir.`,
    ...candidats.map(({ id, quoi }) => `   - ${id} — ${quoi}`),
    "3. Pour chaque candidat, vérifie avant de retirer : cherche ses usages dans tout le dépôt, y compris ceux qui ne s'écrivent pas comme un import (une convention, une chaîne, un script, une configuration). Tu ne retires que ce dont tu es sûr que rien de vivant ne dépend. Tu ne retires aucun test pour faire passer un retrait, et tu n'affaiblis aucune vérification.",
    `4. Tu n'écris que dans ces fichiers, que la passe tient pour toi tant que tu ranges — tu n'en crées aucun, et un seul fichier écrit ailleurs fait que rien n'est livré :`,
    ...zone.map((fichier) => `   - \`${fichier}\``),
    `5. Tu ne retires pas plus de ${pluriel(retraits, "ligne")} en tout : au-delà, la passe est arrêtée et rien n'est livré. Mieux vaut une passe courte et sûre.`,
    "6. Vérifie ton travail comme le dépôt le demande (tests, gates), puis commite-le sur cette branche. Tu ne pousses rien, tu n'ouvres pas de PR et tu ne merges jamais : la passe ouvre la PR, que la pass juge et merge comme celle d'un ticket.",
    `7. Termine par ton compte-rendu, en clair : ce que tu as retiré, comment tu as vérifié que rien de vivant n'en dépendait. Pour chaque candidat que tu n'as pas retiré, écris une ligne à part, de cette forme exacte : \`${MOT_LAISSE} <nom du candidat> : <pourquoi tu n'es pas sûr>\` — par exemple \`${MOT_LAISSE} M2 : lu par convention par le framework de tests\`. Ces lignes sont recopiées dans la PR : un candidat laissé sans motif y est dit laissé sans motif. ${CONSIGNE_DU_LIVRABLE}`,
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

// The body of a pass's PR: what it removed, and everything it did not remove,
// with its reason.
export function corpsDeLaPR(passe: {
  run: string;
  base: string;
  calibration: { model: string; effort: string };
  proposes: Candidat[];
  laisses: Laisse[];
  ecartes: Laisse[];
  retirees: number;
  cap: number;
  fichiers: string[];
  compteRendu: string | null;
}): string {
  const { proposes, laisses: gardes, ecartes } = passe;
  const restes = new Set(gardes.map(({ id }) => id));
  const retires = proposes.filter(({ id }) => !restes.has(id));
  const dire = ({ id, what, reason }: Laisse) => `- **${id}** — ${what}\n  - ${reason ?? SANS_MOTIF}`;
  return [
    `Passe de fermeture \`${passe.run}\` — lancée par le chef, hors du rail, closer en \`${passe.calibration.model}\` / \`${passe.calibration.effort}\`.`,
    "",
    `Elle n'a rien poussé sur \`${passe.base}\` et ne merge rien : ce qu'elle retire arrive par cette PR, que la pass juge et merge comme celle d'un ticket — fusionnée avec \`${passe.base}\`, sous les gates, le reviewer, la CI et le grant \`merge\`. Rouge, aucun cook ne la reprend : elle remonte au chef. ${pluriel(passe.retirees, "ligne")} retirée${passe.retirees > 1 ? "s" : ""} pour un plafond de ${nombre(passe.plafond)}, dans ${pluriel(passe.fichiers.length, "fichier")}.`,
    "",
    `## Retiré — ${retires.length} sur ${pluriel(proposes.length, "candidat")}`,
    "",
    ...(retires.length === 0 ? ["Aucun des candidats proposés n'a été retiré."] : retires.map(({ id, quoi }) => `- **${id}** — ${quoi}`)),
    "",
    `## Laissé faute d'être sûr — ${gardes.length}`,
    "",
    ...(gardes.length === 0 ? ["Rien : tout ce qui était proposé a été retiré."] : gardes.map(dire)),
    ...(ecartes.length === 0 ? [] : ["", `## Écarté avant la passe — ${ecartes.length}`, "", ...ecartes.map(dire)]),
    ...(passe.compteRendu === null ? [] : ["", "<details>", "<summary>Le compte-rendu du closer</summary>", "", passe.compteRendu, "", "</details>"]),
  ].join("\n");
}
