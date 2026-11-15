// Les marqueurs de la validation posée sur le ticket lui-même (#3612) : la
// question que la cuisine y pose, et la réponse du chef qu'elle y garde
// (#3616). Rien d'autre ici : `validation-design/` les lit sans tirer la
// lecture des réponses (`reponse-validation.ts`).
//
// - La question : un commentaire de la cuisine dont la première ligne est
//   `<!-- brigade:validation-question pr=<PR> sha=<commit> -->` (`commit=` vaut
//   `sha=`, dans n'importe quel ordre). Le ticket qui la pose la documente ;
//   elle se lit ici, sans importer son code.
// - La réponse gardée, clé PR et commit de la question :
//   `<!-- brigade:validation-answer pr=<PR> sha=<commit> answer=validated|sent-back -->`.
//   La pass la lit pour merger (`validation-design.ts`, `validationQuiTient`),
//   et le côté qui pose la question pour savoir le chef répondu.
export const MOT_DE_QUESTION = "validation-question";
export const MOT_DE_REPONSE = "validation-answer";

export type Reponse = "validated" | "sent-back";

// Les attributs `nom=valeur` de la première ligne si elle est le marqueur `mot`.
function attributs(mot: string, corps: string): Map<string, string> | null {
  const lu = new RegExp(`^<!-- brigade:${mot}((?: [a-z]+=[^\\s>]+)+) -->`).exec(corps.split(/\r?\n/, 1)[0] ?? "");
  if (lu === null) return null;
  return new Map((lu[1] ?? "").trim().split(" ").map((paire) => paire.split("=", 2) as [string, string]));
}

const numero = (texte: string | undefined) => (texte !== undefined && /^[1-9][0-9]*$/.test(texte) ? Number(texte) : null);
const commit = (texte: string | undefined) => (texte !== undefined && /^[0-9a-f]{7,40}$/.test(texte) ? texte : null);

// La PR et le commit qu'une question de validation nomme ; null si ce n'en est pas une.
export function questionDuCorps(corps: string): { pr: number; sha: string } | null {
  const lus = attributs(MOT_DE_QUESTION, corps);
  if (lus === null) return null;
  const pr = numero(lus.get("pr"));
  const sha = commit(lus.get("sha") ?? lus.get("commit"));
  return pr === null || sha === null ? null : { pr, sha };
}

// La réponse gardée qu'un commentaire porte ; null si ce n'en est pas une.
export function reponseDuCorps(corps: string): { pr: number; sha: string; reponse: Reponse } | null {
  const lus = attributs(MOT_DE_REPONSE, corps);
  if (lus === null) return null;
  const pr = numero(lus.get("pr"));
  const sha = commit(lus.get("sha"));
  const reponse = lus.get("answer");
  if (pr === null || sha === null || (reponse !== "validated" && reponse !== "sent-back")) return null;
  return { pr, sha, reponse };
}

export const marqueDeReponse = (pr: number, sha: string, reponse: Reponse) => `<!-- brigade:${MOT_DE_REPONSE} pr=${pr} sha=${sha} answer=${reponse} -->`;
