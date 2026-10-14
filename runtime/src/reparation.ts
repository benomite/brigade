// Le ticket de réparation d'une base rouge : ce que la pass ouvre sur GitHub
// quand le rouge de la base tient après son rejeu. Il nomme ce qui a échoué et
// la base concernée, passe devant tout le rail (`prio:0`), et part sans geste
// du chef : il porte `fire` et son calibrage. Seul de tout le rail, il part
// d'une base rouge, et la pass le juge et le merge malgré elle.
import type { Gates } from "./evenements/pass.ts";
import { LABEL } from "./github.ts";

// La priorité qui passe devant toutes les autres : celle de la réparation.
export const PRIO_REPARATION = "prio:0";
// Le calibrage d'une réparation : la base retient toute la cuisine.
export const CALIBRAGE_REPARATION = { model: "opus", effort: "high" } as const;
export const LABELS_REPARATION = [LABEL, PRIO_REPARATION, `model:${CALIBRAGE_REPARATION.model}`, `effort:${CALIBRAGE_REPARATION.effort}`];

// La marque d'une issue de réparation, avec le commit du rouge qu'elle répare :
// c'est elle qui retrouve l'issue d'une création dont la réponse s'est perdue.
const MARQUE = /^\s*<!--\s*brigade:reparation-base ([0-9A-Za-z._-]+)\s*-->\s*$/m;
export const marqueDeReparation = (sha: string) => `<!-- brigade:reparation-base ${sha} -->`;
export function shaDeReparation(corps: string): string | null {
  return MARQUE.exec(corps)?.[1] ?? null;
}

const court = (sha: string) => sha.slice(0, 7);

// Ce qui a échoué, tel que les gates le nomment : leurs lignes `FAIL`, sans le
// mot. Sans ligne `FAIL`, ce que leur sortie dit d'elles.
export function echecsDesGates(gates: Gates): string[] {
  const nommes = gates.failures.map((ligne) => ligne.replace(/^FAIL\s+/, "").trim()).filter((ligne) => ligne !== "");
  if (nommes.length > 0) return nommes;
  return [gates.outcome === "timeout" ? "gates arrêtées à leur plafond de durée" : `gates sorties en ${gates.code ?? "erreur"}`];
}

export type RougeAReparer = {
  // La branche d'intégration, et le commit sur lequel ses gates échouent.
  base: string;
  sha: string;
  // Depuis quand elle est rouge, et les merges qui l'ont précédé.
  depuis: string;
  tickets: number[];
  gates: Gates;
  // Le rendu des gates, tel que la pass le donne à un cook.
  sortie: string;
};

export function titreDeReparation({ base, sha, gates }: RougeAReparer): string {
  const [premier, ...autres] = echecsDesGates(gates);
  return `Réparer la base \`${base}\`, rouge sur ${court(sha)} : ${premier}${autres.length === 0 ? "" : ` (et ${autres.length} autre${autres.length > 1 ? "s" : ""})`}`;
}

export function corpsDeReparation(rouge: RougeAReparer): string {
  const { base, sha, depuis, tickets, gates, sortie } = rouge;
  const merges = tickets.length === 0 ? "" : `, après le merge de ${tickets.map((ticket) => `#${ticket}`).join(", ")}`;
  return [
    marqueDeReparation(sha),
    "",
    "## Contexte",
    "",
    `La base d'intégration \`${base}\` est rouge depuis ${depuis}, sur \`${sha}\`${merges} : ses gates, jouées sur elle seule, échouent. Rejouées une fois sans commit, elles échouent encore : ce rouge n'est pas passager.`,
    "",
    `Tant qu'elle est rouge, la cuisine se retient : aucun autre ticket ne part, rien n'est jugé ni mergé. Ce ticket est le seul qui parte d'une base rouge, et la pass le jugera fusionné avec elle.`,
    "",
    "## Ce qui échoue",
    "",
    ...echecsDesGates(gates).map((echec) => `- ${echec}`),
    "",
    sortie,
    "",
    "## Critères d'acceptation",
    "",
    `- Les gates du projet passent sur \`${base}\` une fois cette livraison mergée.`,
    "- Ce qui échouait est corrigé à sa cause : aucun test n'est retiré, sauté ni affaibli pour verdir.",
    "",
    "---",
    "",
    `_Ouvert par la pass, sans geste du chef. Calibré \`${CALIBRAGE_REPARATION.model}\` / \`${CALIBRAGE_REPARATION.effort}\`, \`${PRIO_REPARATION}\` : il passe devant tout le rail._`,
  ].join("\n");
}
