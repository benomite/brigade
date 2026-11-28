// The « Validate its screen » card as the old runtime's `retenirLeDesign` (runtime/src/validation-design/validation-design.ts,
// deleted in #4775) posted it on a green design delivery that carries its captures: a comment on the ticket itself (#3615),
// its copy on the PR, and the `chef-todo` label. The text was captured once from that code; the app reads it back.
export const CARD_REPOSITORY = "chef/parade";
export const CARD_TICKET = 58;
export const CARD_PR = 60;
export const CARD_SHA = "3f9c2a1b7d4e5f60718293a4b5c6d7e8f9012345";

type Poster = {
  commenter(number: number, body: string): Promise<void>;
  labelliser(number: number, labels: string[]): Promise<void>;
};

// `asked`: the « What was asked » line; `done`: what the cook said it changed on the screen (null: it wrote nothing).
export function cardBody({ asked = "Export the journal as CSV", done = null }: { asked?: string; done?: readonly string[] | null } = {}): string {
  const base = `https://github.com/${CARD_REPOSITORY}/blob/${CARD_SHA}/docs/captures/${CARD_TICKET}`;
  return [
    `<!-- brigade:todo kind=design-validation pr=${CARD_PR} ticket=${CARD_TICKET} sha=${CARD_SHA} -->`,
    `**Does the screen of #${CARD_TICKET} look right? Validate it and the delivery of #${CARD_TICKET} (PR ${CARD_PR}) is merged; send it back with what to change and a cook takes it up again.**`,
    "",
    "Station `box/claude`: the delivery is green, and a human validates the designs of this project — held for the chef's validation of its screen.",
    `Pull request: https://github.com/${CARD_REPOSITORY}/pull/${CARD_PR}`,
    "",
    "**Design choice:** the layout of the rail",
    "",
    "### What was asked",
    "",
    asked,
    "",
    "### What was done",
    "",
    ...(done === null ? ["_No summary of what was done is available: the cook wrote none for this delivery._"] : done.map((line) => `- ${line}`)),
    "",
    "### Captures",
    "",
    "**Écran `rail`**",
    "",
    "| Avant | Après |",
    "| --- | --- |",
    `| ![rail — avant](${base}/rail-avant.png?raw=true)<br>rail — avant | ![rail — après](${base}/rail-apres.png?raw=true)<br>rail — après |`,
    "",
  ].join("\n");
}

export async function postTheCard(github: Poster, options?: Parameters<typeof cardBody>[0]): Promise<void> {
  const body = cardBody(options);
  await github.commenter(CARD_TICKET, body);
  await github.commenter(CARD_PR, body);
  await github.labelliser(CARD_TICKET, ["chef-todo"]);
}
