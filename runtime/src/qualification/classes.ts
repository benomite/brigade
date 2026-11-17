// La classe de chaque critère d'acceptation (#3740, épique #3739) : avant
// l'étape « tests written » (#3725), le manager classe chaque critère du ticket
// `testable` — un comportement que l'utilisateur observe, qui reçoit un test
// gelé — ou `not-testable` — rien d'écrit avant la livraison ne le juge —, et
// nomme pour ce dernier la preuve que la livraison doit à la place (une
// capture, le diff, un cas d'évaluation, une valeur mesurée…). La règle est
// dans `agents/manager.md`.
//
// Un ticket qui a un critère testable part à l'écriture de ses tests, pour ses
// seuls critères testables. Un ticket qui n'en a aucun ne la lance pas : la
// station poste sa fiche, qui dit `no testable criterion: proof by <kind>`, et
// il se prend sans tests gelés — les mutations ne se jouent pas sur lui.
import type { ClasseDuCritere, Ecriture } from "../tests-acceptation/ecriture.ts";
import { corpsDesFiches, criteresDuTicket, ficheSansTest, lireLesFiches } from "../tests-acceptation/fiche.ts";

export const MARQUE_DU_CLASSEMENT = "<!-- brigade:classes-consigne -->";

export function consigneDesClasses(mission: { depot: string; ticket: number; titre: string; corps: string; criteres: readonly string[] }): string {
  const { depot, ticket, titre, corps, criteres } = mission;
  return [
    MARQUE_DU_CLASSEMENT,
    `Tu es le manager du dépôt ${depot}. Le ticket #${ticket} — « ${titre} » — est qualifié ; avant que ses tests d'acceptation ne s'écrivent, tu classes chacun de ses critères, selon la règle de ton rôle (« Chaque critère : testable, ou non testable à l'avance avec sa preuve »).`,
    "",
    "- `testable` : le critère décrit un comportement que l'utilisateur final observe ; il recevra un test gelé.",
    "- `not-testable` : aucun test écrit avant la livraison ne peut le juger ; tu nommes, non vide, la preuve que la livraison doit à sa place (un changement visuel → une capture avant/après ; une documentation ou une formulation → le diff ; le texte d'un rôle → le cas d'évaluation qu'il change ; une configuration ou une mesure → la valeur mesurée).",
    "",
    "Un critère qui décrit un comportement n'est jamais `not-testable`. Dans le doute, il est `testable`. Tu n'écris ni ne modifies aucun fichier.",
    "",
    "## Le ticket",
    "",
    corps.trim(),
    "",
    "## Les critères",
    "",
    ...criteres.map((critere, rang) => `${rang + 1}. ${critere}`),
    "",
    "## Ta réponse",
    "",
    `Termine par un seul objet JSON, rien autour, avec les ${criteres.length} critère${criteres.length === 1 ? "" : "s"} dans l'ordre : {"criteria": [{"id": 1, "class": "testable", "proof": ""}, {"id": 2, "class": "not-testable", "proof": "la preuve due"}]} — \`proof\` vide pour un critère \`testable\`, jamais vide pour un critère \`not-testable\`.`,
  ].join("\n");
}

// Les classes que le manager a rendues, une par critère dans leur ordre, ou
// pourquoi elles ne se lisent pas — sans classe inventée : un critère sans
// classe lisible n'est ni testé ni dispensé de l'être.
export function lireLesClasses(message: string, attendus: number): { classes: ClasseDuCritere[] } | { illisible: string } {
  const json = /\{[\s\S]*\}/.exec(message)?.[0];
  if (json === undefined) return { illisible: "the manager's classes carry no JSON object" };
  let lu: unknown;
  try {
    lu = JSON.parse(json);
  } catch (erreur) {
    return { illisible: `the manager's classes are not JSON: ${erreur instanceof Error ? erreur.message : String(erreur)}` };
  }
  const criteres = (lu as { criteria?: unknown }).criteria;
  if (!Array.isArray(criteres)) return { illisible: "the manager's answer has no `criteria` list" };
  if (criteres.length !== attendus) return { illisible: `the manager classed ${criteres.length} criteria of ${attendus}` };
  const classes: ClasseDuCritere[] = [];
  for (const [rang, entree] of criteres.entries()) {
    const { class: classe, proof } = (typeof entree === "object" && entree !== null ? entree : {}) as Record<string, unknown>;
    if (classe === "testable") classes.push({ class: "testable" });
    else if (classe !== "not-testable") return { illisible: `criterion ${rang + 1} has no class 'testable' or 'not-testable'` };
    else if (typeof proof !== "string" || proof.trim() === "") return { illisible: `criterion ${rang + 1} is not testable and names no proof` };
    else classes.push({ class: "not-testable", proof: proof.trim() });
  }
  return { classes };
}

export const aDesCriteresTestables = (classes: readonly ClasseDuCritere[]): boolean => classes.some((classe) => classe.class === "testable");

// Les mutations ne se jouent que contre des tests gelés.
export const doitMuter = (testsGeles: number): boolean => testsGeles > 0;

// La ligne du verdict de la pass quand la livraison n'a aucun test gelé.
export const LIGNE_SANS_MUTATION = "Mutation check: not run — the ticket has no frozen acceptance test (no testable criterion), so there is nothing to run mutants against.";

export type OutilsDuClassement = {
  issue(numero: number): Promise<{ title: string; body?: string | null } | null>;
  commentaires(numero: number): Promise<{ body: string; association: string }[]>;
  commenter(numero: number, corps: string): Promise<void>;
  // Le manager lancé sur la consigne, sans rien écrire : son dernier message,
  // ou pourquoi il n'en a pas.
  classer(numero: number, consigne: string): Promise<{ message: string } | { illisible: string }>;
  depot: string;
};

// Classe les critères du ticket, puis lance l'écriture de ses tests s'il en a
// un testable. Sinon, poste sa fiche — chaque critère, sa classe et sa preuve —
// sans lancer l'étape. Une fiche déjà postée pour les mêmes critères, tous non
// testables, n'est pas refaite : la station a redémarré depuis.
export async function classerPuisEcrire(ticket: number, outils: OutilsDuClassement, ecrire: (classes: readonly ClasseDuCritere[]) => Promise<Ecriture>): Promise<Ecriture> {
  const issue = await outils.issue(ticket);
  if (issue === null) return { echec: "the issue no longer exists" };
  const criteres = criteresDuTicket(issue.body ?? "");
  if (criteres.length === 0) return { sansCriteres: true };
  const postees = lireLesFiches(await outils.commentaires(ticket));
  if (postees !== null && "fiches" in postees && postees.fiches.every((fiche) => fiche.class === "not-testable") && postees.fiches.map(({ criterion }) => criterion).join("\n") === criteres.join("\n")) return { sansTestable: postees.fiches };
  const repondu = await outils.classer(ticket, consigneDesClasses({ depot: outils.depot, ticket, titre: issue.title, corps: issue.body ?? "", criteres }));
  if ("illisible" in repondu) return { echec: repondu.illisible };
  const lu = lireLesClasses(repondu.message, criteres.length);
  if ("illisible" in lu) return { echec: lu.illisible };
  if (aDesCriteresTestables(lu.classes)) return ecrire(lu.classes);
  const fiches = criteres.map((critere, rang) => ficheSansTest(critere, (lu.classes[rang] as { proof: string }).proof));
  await outils.commenter(ticket, corpsDesFiches(ticket, "", fiches));
  return { sansTestable: fiches };
}
