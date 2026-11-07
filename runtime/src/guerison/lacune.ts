// Une lacune du ticket, classée puis routée. Le manager juge un ticket
// incomplet pour une lacune : technique (un seuil, un nom de fichier, un essai
// à la main au lieu d'un test), il la complète lui-même, et écrit sur le
// ticket la décision et sa raison ; produit ou design, il pose une carte TODO
// qui porte une seule question (CLAUDE.md, « Brigade's goal: autonomy »).
//
// Sans E/S, et pas branché sur la pass ici : `classerLacune` et
// `routerLacune` sont les deux fonctions que la pass appellera.
import type { Proposition } from "../carte-todo.ts";

// Les lacunes techniques, que le manager complète seul.
export const LACUNES_TECHNIQUES = ["threshold", "file-name", "manual-trial"] as const;
// Les lacunes qu'un humain tranche : un choix de produit, un écran à valider.
export const LACUNES_PRODUIT_DESIGN = ["product", "design"] as const;

export type LacuneTechnique = (typeof LACUNES_TECHNIQUES)[number];
export type SorteDeLacune = LacuneTechnique | (typeof LACUNES_PRODUIT_DESIGN)[number];
export type Nature = "technical" | "product-design";

// `sorte` : ce qui manque. `detail` : ce que le ticket dit à ce sujet.
// `decision` : pour une lacune technique, ce que le manager retient (la valeur
// du seuil, le nom du fichier, le test à écrire) et `raison`, pourquoi.
// `question` et `choix` : pour une lacune produit ou design, ce qu'on demande au chef.
export type Lacune = {
  sorte: SorteDeLacune;
  detail: string;
  decision?: string;
  raison?: string;
  question?: string;
  choix?: readonly string[];
};

export type Route =
  | { voie: "completer"; commentaire: string }
  | { voie: "todo"; carte: Proposition }
  | { voie: "incomplete"; manque: string };

export const classerLacune = (lacune: Pick<Lacune, "sorte">): Nature =>
  (LACUNES_TECHNIQUES as readonly string[]).includes(lacune.sorte) ? "technical" : "product-design";

// Technique : le manager complète, le commentaire du ticket dit la décision et
// sa raison. Produit ou design : une carte TODO avec une seule question.
export function routerLacune(lacune: Lacune): Route {
  if (classerLacune(lacune) === "technical") {
    const decision = lacune.decision?.trim();
    const raison = lacune.raison?.trim();
    if (!decision || !raison) return { voie: "incomplete", manque: "a technical gap is completed with its decision and its reason" };
    return { voie: "completer", commentaire: `Completed by the manager (${lacune.sorte}): ${decision}\nReason: ${raison}` };
  }
  const question = lacune.question?.trim();
  const choix = (lacune.choix ?? []).map((texte) => texte.trim()).filter((texte) => texte !== "");
  if (!question || !question.endsWith("?") || question.indexOf("?") !== question.length - 1) {
    return { voie: "incomplete", manque: "a product or design gap asks exactly one question" };
  }
  if (choix.length === 0) return { voie: "incomplete", manque: "a product or design gap lists at least one choice" };
  return {
    voie: "todo",
    carte: {
      type: lacune.sorte === "design" ? "design" : "product",
      resume: lacune.detail,
      enonce: question,
      choix: choix.map((texte) => ({ texte })),
    },
  };
}
