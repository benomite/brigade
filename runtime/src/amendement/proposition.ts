// L'amendement d'un critère d'acceptation (#3729). Un cook ne touche jamais un
// test d'acceptation gelé : quand il juge un critère faux, il propose un
// amendement dans son dernier message, entre `<amendement>` et
// `</amendement>` — le test, ce que le critère dit, ce qu'il devrait dire, et
// pourquoi —, et s'arrête. La station poste la proposition sur l'issue, puis
// le manager la classe (`amender.ts`) :
//   - petite, elle n'affaiblit rien — tout ce que l'ancien critère acceptait,
//     le nouveau l'accepte encore, et ce que l'utilisateur voit ne change pas
//     (une coquille, une ambiguïté levée, une assertion plus stricte ou plus
//     précise) : le manager l'applique sans le chef, dans un commit à lui qui
//     porte `Amendment: #<issue>`, et l'issue dit ce qui a changé ;
//   - tout le reste — elle change ce que l'utilisateur voit ou fait, ou elle
//     affaiblit le critère — n'est pas appliqué : une carte dans la TODO du
//     chef décrit le changement proposé, et le ticket attend sa réponse.
// Ce fichier est sans E/S : la lecture de la proposition, la consigne et la
// lecture du classement du manager, et les corps postés sur l'issue.
import { lireDelimitation } from "../livrable.ts";
import { issueEnDonnee, objet, phrase, type IssueAJuger } from "../juger.ts";

const BALISE = "amendement";
// Le pied du commit du manager : le seul qui touche un test gelé.
export const PIED = (issue: number) => `Amendment: #${issue}`;
// La première ligne de la consigne du manager : ce qui la distingue, pour qui lit les lancements.
const MARQUE_DU_CLASSEMENT = "<!-- brigade:amendement-au-manager -->";
// La proposition du cook, postée sur l'issue.
const MARQUE_DE_PROPOSITION = "<!-- brigade:amendement-propose -->";
// L'amendement appliqué par le manager, sur l'issue.
const MARQUE_D_APPLICATION = "<!-- brigade:amendement-applique";

export type Proposition = { test: string; ancien: string; nouveau: string; pourquoi: string };

// Les quatre champs, sous leur nom dans la balise.
const CHAMPS = { test: "test", old: "ancien", new: "nouveau", why: "pourquoi" } as const;

// La proposition que le dernier message du cook porte entre ses balises ; null
// sans balise, `illisible` quand un champ manque. Même lecture que `<bloque>` :
// une balise citée n'en est pas une, la dernière délimitation l'emporte.
export function lireLaProposition(message: string | null): Proposition | { illisible: string } | null {
  const texte = lireDelimitation(message, BALISE);
  if (texte === null) return null;
  const lus: Partial<Record<keyof typeof CHAMPS, string[]>> = {};
  let courant: keyof typeof CHAMPS | null = null;
  for (const ligne of texte.split("\n")) {
    const champ = /^\s*(test|old|new|why)\s*:\s?(.*)$/i.exec(ligne);
    if (champ !== null) {
      courant = (champ[1] ?? "").toLowerCase() as keyof typeof CHAMPS;
      lus[courant] = [champ[2] ?? ""];
    } else if (courant !== null) lus[courant]?.push(ligne);
  }
  const valeur = (cle: keyof typeof CHAMPS) => (lus[cle] ?? []).join("\n").trim();
  const manquants = (Object.keys(CHAMPS) as (keyof typeof CHAMPS)[]).filter((cle) => valeur(cle) === "");
  if (manquants.length > 0) return { illisible: `the cook's amendment proposal has no ${manquants.map((cle) => `\`${cle}:\``).join(", ")}` };
  return { test: valeur("test"), ancien: valeur("old"), nouveau: valeur("new"), pourquoi: valeur("why") };
}

// Ce que le brief de chaque cook dit de l'amendement.
export function consigneDeLAmendement(): string {
  const [ouvre, ferme] = [`<${BALISE}>`, `</${BALISE}>`];
  return [
    "## Si un critère d'acceptation te semble faux",
    "",
    `Tu ne modifies jamais un test d'acceptation gelé, même pour le corriger. Si un critère te semble faux, propose un amendement : dans ton dernier message, entre ${ouvre} et ${ferme}, balises nues, une seule fois, écris quatre champs, chacun au début d'une ligne — \`test:\` le chemin du test gelé depuis la racine du dépôt, \`old:\` ce que le critère dit, \`new:\` ce qu'il devrait dire, \`why:\` pourquoi —, en anglais, puis arrête-toi. La station poste ta proposition sur l'issue. Le manager l'applique lui-même si tout ce que l'ancien critère acceptait reste accepté et que ce que voit l'utilisateur ne change pas ; sinon elle va au chef, et rien n'est changé avant sa réponse. Un cook reprend ensuite le ticket depuis ta branche.`,
  ].join("\n");
}

const citer = (texte: string) =>
  texte
    .trim()
    .split("\n")
    .map((ligne) => `> ${ligne}`)
    .join("\n");

const laProposition = (proposition: Proposition): string[] => [
  `**Frozen test.** \`${proposition.test}\``,
  "",
  "**The criterion says:**",
  "",
  citer(proposition.ancien),
  "",
  "**It should say:**",
  "",
  citer(proposition.nouveau),
  "",
  "**Why:**",
  "",
  citer(proposition.pourquoi),
];

// La proposition du cook, postée sur l'issue avant tout classement.
export function corpsDeLaProposition({ station, proposition }: { station: string; proposition: Proposition }): string {
  return [MARQUE_DE_PROPOSITION, `**A cook proposes an amendment to an acceptance criterion.** Station \`${station}\`: the cook does not change the frozen test; the manager classifies the proposal.`, "", ...laProposition(proposition)].join("\n");
}

// Ce que le manager rend : appliquer — le texte exact du test à remplacer, et
// par quoi —, ou porter au chef, et pourquoi.
export type Classement =
  | { classe: "petit"; raison: string; remplacer: string; par: string; changement: string }
  | { classe: "produit" | "affaiblit"; raison: string }
  | { illisible: string };

export function consigneDuClassement(mission: { depot: string; issue: IssueAJuger; commentaires: string[]; proposition: Proposition }): string {
  const { depot, issue, commentaires, proposition } = mission;
  return [
    MARQUE_DU_CLASSEMENT,
    `Tu es le manager de la brigade sur le dépôt ${depot}. Le cook de l'issue #${issue.number} juge faux un critère d'acceptation, dont le test est gelé : un cook ne le modifie jamais. Il propose un amendement, que tu classes.`,
    "",
    `Tu es dans un worktree de la branche du ticket, en lecture (Read, Grep, Glob) : lis le test gelé \`${proposition.test}\` avant de répondre.`,
    "",
    "## Ce que tu réponds",
    "",
    "- `accepte_tout_l_ancien` — vrai si chaque comportement que l'ancien critère acceptait est encore accepté par le nouveau ; faux si le nouveau en refuse un seul : l'amendement affaiblirait le critère.",
    "- `change_ce_que_voit_l_utilisateur` — vrai si le comportement que l'utilisateur voit ou fait change ; faux pour une coquille, une ambiguïté levée, une assertion plus stricte ou plus précise.",
    "- `raison` — en anglais, en une ou deux phrases : ce qui fonde ces deux réponses.",
    "- Seulement si `accepte_tout_l_ancien` est vrai et `change_ce_que_voit_l_utilisateur` faux : `remplacer`, le texte exact du test gelé à remplacer, recopié caractère pour caractère et présent une seule fois dans le fichier ; `par`, le texte qui le remplace ; `changement`, en anglais, sur une ligne, ce qui change dans le test. La station l'applique dans un commit à ton nom ; sinon, rien n'est appliqué et la proposition va au chef.",
    "",
    "Dans le doute sur l'une des deux réponses, réponds comme si l'amendement changeait le produit : c'est le chef qui tranche.",
    "",
    "## La proposition du cook",
    "",
    "<proposition>",
    `test: ${proposition.test}`,
    `old: ${proposition.ancien}`,
    `new: ${proposition.nouveau}`,
    `why: ${proposition.pourquoi}`,
    "</proposition>",
    "",
    "## Ta réponse",
    "",
    "Un seul objet JSON, et rien après lui :",
    "",
    "```json",
    '{"accepte_tout_l_ancien": true, "change_ce_que_voit_l_utilisateur": false, "raison": "…", "remplacer": "…", "par": "…", "changement": "…"}',
    "```",
    "",
    'ou `{"accepte_tout_l_ancien": false, "change_ce_que_voit_l_utilisateur": false, "raison": "…"}`.',
    "",
    ...issueEnDonnee(issue, commentaires),
  ].join("\n");
}

// La règle est ici, pas dans le jugement du manager : seule une proposition
// qui accepte tout l'ancien et ne change rien pour l'utilisateur s'applique.
// Une réponse qui ne dit pas l'un des deux n'est pas lue comme petite.
export function lireLeClassement(message: string | null): Classement {
  if (message === null || message.trim() === "") return { illisible: "no answer" };
  const lu = objet(message);
  if (!lu) return { illisible: "no JSON object in the answer" };
  const raison = phrase(lu.raison);
  if (raison === null) return { illisible: "an answer with no `raison`" };
  if (typeof lu.accepte_tout_l_ancien !== "boolean") return { illisible: "an answer that does not say whether every old accepted behaviour is still accepted (`accepte_tout_l_ancien`)" };
  if (typeof lu.change_ce_que_voit_l_utilisateur !== "boolean") return { illisible: "an answer that does not say whether what the user sees changes (`change_ce_que_voit_l_utilisateur`)" };
  if (!lu.accepte_tout_l_ancien) return { classe: "affaiblit", raison };
  if (lu.change_ce_que_voit_l_utilisateur) return { classe: "produit", raison };
  const changement = phrase(lu.changement);
  if (typeof lu.remplacer !== "string" || lu.remplacer === "") return { illisible: "a small amendment with no `remplacer`" };
  if (typeof lu.par !== "string") return { illisible: "a small amendment with no `par`" };
  if (changement === null) return { illisible: "a small amendment with no `changement`" };
  return { classe: "petit", raison, remplacer: lu.remplacer, par: lu.par, changement: changement.replace(/\s+/g, " ") };
}

const bloc = (signe: "-" | "+", texte: string) => {
  const cloture = "`".repeat(Math.max(3, ...[...texte.matchAll(/`+/g)].map((m) => m[0].length + 1)));
  return [`${cloture}diff`, ...texte.split("\n").map((l) => `${signe} ${l}`), cloture];
};

// L'amendement appliqué, sur l'issue : le commit, le test, ce qui a changé.
export function corpsDeLApplication({ issue, station, branche, sha, proposition, classement }: { issue: number; station: string; branche: string; sha: string; proposition: Proposition; classement: Extract<Classement, { classe: "petit" }> }): string {
  const [avant, apres] = [bloc("-", classement.remplacer), bloc("+", classement.par)];
  return [
    `${MARQUE_D_APPLICATION} sha=${sha} -->`,
    "**Manager — amendment applied without the chef: every behaviour the old criterion accepted is still accepted, and what the user sees does not change.**",
    "",
    `Commit \`${sha.slice(0, 7)}\` on \`${branche}\`, by the manager, with the trailer \`${PIED(issue)}\`, changes \`${proposition.test}\`: ${classement.changement}`,
    "",
    `**Manager's reading.** ${classement.raison}`,
    "",
    "**Before:**",
    "",
    ...avant,
    "",
    "**After:**",
    "",
    ...apres,
    "",
    ...laProposition(proposition),
    "",
    `Station \`${station}\`: the ticket goes back to a cook from its branch, with the amended test; this stop is not counted among its tries.`,
  ].join("\n");
}

// La carte du chef : la question sur une ligne, puis le changement proposé.
// Aucun test n'est changé avant sa réponse.
export function corpsDeLaCarte({ issue, station, proposition, classement }: { issue: number; station: string; proposition: Proposition; classement: Extract<Classement, { classe: "produit" | "affaiblit" }> }): string {
  const pourquoi =
    classement.classe === "affaiblit"
      ? "it weakens the criterion: a behaviour the old criterion accepted would no longer be accepted, which is treated as a product change"
      : "it changes what the user sees or does";
  return [
    `**Question for the chef (product):** Amend the acceptance criterion of #${issue} as the cook proposes below?`,
    "",
    `Station \`${station}\`: a cook proposes an amendment, and the manager did not apply it — ${pourquoi}. No test was changed.`,
    "",
    `**Manager's reading.** ${classement.raison}`,
    "",
    ...laProposition(proposition),
    "",
    "Answer on this issue, then remove `blocked-on-human`: a cook resumes the ticket from its branch.",
  ].join("\n");
}
