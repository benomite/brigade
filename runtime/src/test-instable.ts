// Le ticket `fix` d'un test instable (#1820) : ce que la pass ouvre sur GitHub
// quand la CI d'une livraison reste rouge, après la relance de ses jobs en
// échec, sur le même test que la livraison ne touche pas (`relance-de-ci.ts`).
// Ce rouge n'est pas celui du ticket, et le chef n'a rien à y décider : il part
// à la cuisine, et la livraison est jugée sans lui. Il porte `fire` et son
// calibrage : il part sans geste du chef, comme un autre ticket du rail.
import type { Check } from "./events/pass.ts";
import { LABEL } from "./github.ts";

// Le calibrage d'une correction de test instable : un `fix` qui n'est pas
// mécanique — la cause est à trouver avant d'y toucher.
export const CALIBRAGE_TEST_INSTABLE = { model: "sonnet", effort: "medium" } as const;
export const PRIO_TEST_INSTABLE = "prio:1";
export const LABELS_TEST_INSTABLE = [LABEL, "fix", PRIO_TEST_INSTABLE, `model:${CALIBRAGE_TEST_INSTABLE.model}`, `effort:${CALIBRAGE_TEST_INSTABLE.effort}`];

// La marque d'une issue de test instable, avec le test qu'elle corrige : c'est
// elle qui retrouve l'issue d'une création dont la réponse s'est perdue.
const MARQUE = /^\s*<!--\s*brigade:test-instable (\S+)\s*-->\s*$/m;
export const marqueDeTestInstable = (test: string) => `<!-- brigade:test-instable ${test} -->`;
export function testDuTicket(corps: string): string | null {
  return MARQUE.exec(corps)?.[1] ?? null;
}

const court = (sha: string) => sha.slice(0, 7);

export type TestInstable = {
  // Le test, en chemin du dépôt.
  test: string;
  // La branche d'intégration, verte, sur laquelle la livraison était jugée.
  base: string;
  // La livraison sur laquelle il a été rouge deux fois : son ticket, sa PR, son commit.
  ticket: number;
  pr: string;
  sha: string;
  // Les jobs rouges : avant la relance, puis après.
  avant: Check[];
  apres: Check[];
};

export function titreDeTestInstable({ test }: TestInstable): string {
  return `Fix the unstable test \`${test}\``;
}

const job = (check: Check) => `- ${check.name}: ${check.conclusion}${check.url ? ` — ${check.url}` : ""}`;

export function corpsDeTestInstable(instable: TestInstable): string {
  const { test, base, ticket, pr, sha, avant, apres } = instable;
  return [
    marqueDeTestInstable(test),
    "",
    "## Context",
    "",
    `The CI of the delivery of #${ticket} (${pr}, \`${court(sha)}\`) is red on \`${test}\`, a test that delivery does not touch, while \`${base}\` is green. The pass reran the failed jobs once, and the test stayed red. This red is not that ticket's: the pass judged its delivery without it, and opened this ticket so that the test is fixed where it lives.`,
    "",
    "## What fails",
    "",
    `- \`${test}\``,
    "",
    "Before the rerun:",
    ...avant.map(job),
    "",
    "After the rerun:",
    ...apres.map(job),
    "",
    "## Acceptance criteria",
    "",
    `- The cause of the red of \`${test}\` is found and fixed: a race against the clock, a shared resource, a missing wait for a fact.`,
    "- The test still checks what it checked: it is not removed, skipped nor weakened to turn green.",
    "",
    "---",
    "",
    `_Opened by the pass, with no gesture from the chef. Calibrated \`${CALIBRAGE_TEST_INSTABLE.model}\` / \`${CALIBRAGE_TEST_INSTABLE.effort}\`, \`${PRIO_TEST_INSTABLE}\`._`,
  ].join("\n");
}
