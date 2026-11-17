// L'étape « tests written » du rail (#3725, épique #3724) : entre `queued` et
// `taken`, le manager écrit un test d'acceptation par critère du ticket et les
// commite, eux seuls, en premier commit de la branche du ticket, avec le
// trailer `Acceptance-Tests: frozen`. Le cook part de ce commit : les tests qui
// jugent son code ne sont plus les siens.
//
// GitHub porte l'étape, comme les autres états du rail (`github-etat/etats.ts`) :
// le label `tests-written` sur l'issue. Aucun cook ne prend un ticket qui ne
// l'a pas.
import { LABEL_TAKEN } from "../github-etat/etats.ts";

// Le label que la station pose quand les tests du ticket sont commités et poussés.
export const LABEL_TESTS_ECRITS = "tests-written";

// Les étapes du rail jusqu'au cook, dans leur ordre.
const ETAPES_DU_RAIL = ["queued", "tests written", "taken"] as const;
export type EtapeDuRail = (typeof ETAPES_DU_RAIL)[number];

// L'étape d'un ticket du rail, d'après ses labels.
export function etapeDuRail(labels: readonly string[]): EtapeDuRail {
  if (labels.includes(LABEL_TAKEN)) return "taken";
  return labels.includes(LABEL_TESTS_ECRITS) ? "tests written" : "queued";
}

// Le trailer du premier commit de la branche : ces tests sont gelés.
export const TRAILER = "Acceptance-Tests: frozen";

// Le sujet du commit des tests : la station le reconnaît en tête d'une branche
// sans PR — ce n'est pas une livraison coupée, aucun cook n'y a encore écrit.
export const sujetDuCommitDesTests = (ticket: number) => `test(#${ticket}): frozen acceptance tests`;
export const estLeCommitDesTests = (sujet: string | undefined): boolean => sujet !== undefined && /^test\(#\d+\): frozen acceptance tests$/.test(sujet);
