// Ce que la passe dit à son closer, ce qu'elle relit de lui, et ce qu'elle
// écrit dans sa PR. Le closer retire, il ne juge pas seul : ce qu'il laisse
// faute d'être sûr se dit, une ligne par candidat, et la PR le porte.
import type { Laisse } from "../evenements/fermeture.ts";
import { CONSIGNE_DE_FIN_DE_TOUR, CONSIGNE_DU_LIVRABLE } from "../livrable.ts";
import type { Candidat } from "./candidats.ts";

// La ligne par laquelle le closer dit qu'il laisse un candidat, et pourquoi.
export const MOT_LAISSE = "LAISSÉ";
const LIGNE_LAISSE = /^[\s>*-]*LAISS[ÉE]\s+`?([DM]\d+)`?\s*:\s*(\S.*)$/gimu;
// Ce que la passe dit d'un candidat resté que le closer n'a pas nommé.
export const SANS_MOTIF = "le closer n'a donné aucun motif — le candidat est toujours repéré après la passe";

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
    "6. Vérifie ton travail comme le dépôt le demande (tests, gates), puis commite-le sur cette branche. Tu ne pousses rien, tu n'ouvres pas de PR et tu ne merges jamais : la passe ouvre la PR, qui suit le chemin de toute PR.",
    `7. Termine par ton compte-rendu, en clair : ce que tu as retiré, comment tu as vérifié que rien de vivant n'en dépendait. Pour chaque candidat que tu n'as pas retiré, écris une ligne à part, de cette forme exacte : \`${MOT_LAISSE} <nom du candidat> : <pourquoi tu n'es pas sûr>\` — par exemple \`${MOT_LAISSE} M2 : lu par convention par le framework de tests\`. Ces lignes sont recopiées dans la PR : un candidat laissé sans motif y est dit laissé sans motif. ${CONSIGNE_DU_LIVRABLE}`,
    "",
    CONSIGNE_DE_FIN_DE_TOUR,
  ].join("\n");
}

// Les candidats que le closer dit laisser, chacun avec son motif. La dernière
// ligne qui nomme un candidat l'emporte.
export function motifsDuCloser(message: string | null): Map<string, string> {
  const motifs = new Map<string, string>();
  for (const [, id = "", motif = ""] of (message ?? "").matchAll(LIGNE_LAISSE)) motifs.set(id.toUpperCase(), motif.trim());
  return motifs;
}

// Ce que la passe n'a pas retiré de ce qu'elle proposait : ce que sa branche
// porte encore, et ce que le closer dit avoir laissé — l'un ou l'autre suffit,
// rien n'est tenu pour retiré sur parole.
export function laisses(proposes: Candidat[], restes: Candidat[], motifs: Map<string, string>): Laisse[] {
  const encore = new Set(restes.map(({ id }) => id));
  return proposes
    .filter(({ id }) => encore.has(id) || motifs.has(id))
    .map(({ id, quoi }) => ({ id, what: quoi, reason: motifs.get(id) ?? null, before: false }));
}

export function titreDeLaPR(run: string): string {
  return `Fermeture — passe ${run}`;
}

// Le corps de la PR d'une passe : ce qu'elle a retiré, et tout ce qu'elle n'a
// pas retiré, avec son motif.
export function corpsDeLaPR(passe: {
  run: string;
  base: string;
  calibrage: { model: string; effort: string };
  proposes: Candidat[];
  laisses: Laisse[];
  ecartes: Laisse[];
  retirees: number;
  plafond: number;
  fichiers: string[];
  compteRendu: string | null;
}): string {
  const { proposes, laisses: gardes, ecartes } = passe;
  const restes = new Set(gardes.map(({ id }) => id));
  const retires = proposes.filter(({ id }) => !restes.has(id));
  const dire = ({ id, what, reason }: Laisse) => `- **${id}** — ${what}\n  - ${reason ?? SANS_MOTIF}`;
  return [
    `Passe de fermeture \`${passe.run}\` — lancée par le chef, hors du rail, closer en \`${passe.calibrage.model}\` / \`${passe.calibrage.effort}\`.`,
    "",
    `Elle n'a rien poussé sur \`${passe.base}\` et ne merge rien : ce qu'elle retire arrive par cette PR, qui suit le chemin de toute PR vers \`${passe.base}\`. ${pluriel(passe.retirees, "ligne")} retirée${passe.retirees > 1 ? "s" : ""} pour un plafond de ${nombre(passe.plafond)}, dans ${pluriel(passe.fichiers.length, "fichier")}.`,
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
