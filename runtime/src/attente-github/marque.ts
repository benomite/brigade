// Parked (#4129, rule 13 of docs/superpowers/specs/2026-11-24-simplified-process.md) : la seule façon dont un ticket
// attend quelqu'un. L'issue porte le label `parked`, et un commentaire marqué `<!-- brigade:parked … -->` dit qui il
// attend (`who`), pour quoi (`what`), et jusqu'à quand : une date (`followUp`, ISO) ou un fait (`fact`). Le chef, le
// second, l'app et la station écrivent ce même commentaire (`corpsDuParking`) : rien d'autre ne le pose.
// Sans E/S ni import lourd : `parked`, la retenue et `status` la lisent par attente-github.ts, et l'app la lit et l'écrit
// ici (#3761). Les marques d'avant, `<!-- brigade:waiting … -->`, se lisent encore : un ticket parqué avant #4129 garde
// ce qu'il attend.
import type { Commentaire } from "../github.ts";

// Le label d'une issue dont le ticket attend quelqu'un.
export const LABEL_PARKED = "parked";

// Qui attend une carte de TODO : le chef. Un ticket parqué pour lui porte aussi `chef-todo`, sa carte
// (github-seul/carte-todo/carte-todo.ts) : son TODO est exactement ces tickets-là.
export const LE_CHEF = "the chef";

// Ceux dont un commentaire fait foi : le propriétaire du dépôt, les membres de
// son organisation, ses collaborateurs. Tout le monde peut commenter une issue
// publique, et une fiche dit quoi cuisiner.
export const DE_CONFIANCE = ["OWNER", "MEMBER", "COLLABORATOR"];

// Ce qu'un ticket parqué attend : qui, pour quoi, et jusqu'à quand — une date (`followUp`, ISO), à laquelle il reprend
// seul où il était, ou un fait (`fact`), qu'un humain dit arrivé. `failures` : la station l'a parqué en arrêtant sa
// boucle de relances (ses cooks ont échoué trop de fois) ; le superviseur reçoit son dossier.
export type AttenteGitHub = { what: string; who: string; followUp: string; fact?: string; failures?: true };
export type AttenteMarquee = AttenteGitHub;

export const MARQUE = "<!-- brigade:parked";
const MARQUE_LUE = /^<!-- brigade:(?:parked|waiting) (\{.*?\}) -->/;

// La date, dite avec son année : `2026-11-16 15:05 UTC`.
export const direRelance = (iso: string) => `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;

// Jusqu'à quand, en mots : le fait attendu, ou la date.
export const direJusqua = (attente: Pick<AttenteGitHub, "followUp" | "fact">) => (attente.fact !== undefined ? `until ${attente.fact}` : `until ${direRelance(attente.followUp)}`);

// Le commentaire qui parque un ticket : la marque, que `attenteDeLIssue` relit, puis qui, quoi, jusqu'à quand. Dans la
// marque, `>` s'échappe : un `-->` des mots du chef ne la fermerait pas. Posé par la cuisine, il dit la station et les
// mots du cook dont il vient (`par`).
export function corpsDuParking(attente: AttenteGitHub, par?: { station: string; mots: string }): string {
  const marque = JSON.stringify(attente).replace(/>/g, "\\u003e");
  const reprise =
    attente.fact !== undefined
      ? `It resumes exactly where it was as soon as ${attente.who === LE_CHEF ? "the chef answers" : "someone says it happened"}: removing \`${LABEL_PARKED}\` is that gesture.`
      : `On ${direRelance(attente.followUp)} it resumes exactly where it was, on its own; removing \`${LABEL_PARKED}\` resumes it sooner.`;
  return [
    `${MARQUE} ${marque} -->`,
    `**PARKED: waits for ${attente.who}.** ${attente.what}`,
    "",
    `- **who**: ${attente.who}`,
    `- **for what**: ${attente.what}`,
    `- **until**: ${attente.fact !== undefined ? attente.fact : direRelance(attente.followUp)}`,
    "",
    `As long as it carries \`${LABEL_PARKED}\`, nothing takes it: no station, no repair, no supervisor. ${reprise}`,
    ...(par === undefined ? [] : ["", `Parked by station \`${par.station}\`, from what the cook said:`, "", ...par.mots.trim().split("\n").map((ligne) => `> ${ligne}`)]),
  ].join("\n");
}

// Ce qu'attend l'issue, d'après le plus récent commentaire marqué d'un auteur
// du dépôt ; null si aucun ne se lit.
export function attenteDeLIssue(commentaires: readonly Pick<Commentaire, "body" | "association">[]): AttenteMarquee | null {
  for (const { body, association } of [...commentaires].reverse()) {
    if (!DE_CONFIANCE.includes(association)) continue;
    const brut = MARQUE_LUE.exec(body)?.[1];
    if (brut === undefined) continue;
    try {
      const { what, who, followUp, fact, failures, whileSetAside } = JSON.parse(brut) as Record<string, unknown>;
      if (typeof what !== "string" || typeof who !== "string" || typeof followUp !== "string" || Number.isNaN(Date.parse(followUp))) continue;
      const dit = typeof fact === "string" && fact.trim() !== "" ? { fact: fact.trim() } : {};
      // `whileSetAside` : la marque d'avant #4129 d'un ticket que ses échecs mettaient de côté.
      return { what, who, followUp, ...dit, ...(failures === true || whileSetAside === true ? { failures: true as const } : {}) };
    } catch {
      // Une marque illisible ne dit rien : la précédente, s'il y en a une.
    }
  }
  return null;
}

// Le ticket reprend-il à cette date ? Seul un ticket parqué jusqu'à une date reprend seul : un fait se dit arrivé.
export const reprendALaDate = (attente: AttenteGitHub, maintenant: Date): boolean => attente.fact === undefined && Date.parse(attente.followUp) <= maintenant.getTime();
