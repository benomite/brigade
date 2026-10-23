// La même conversation (#1426), le second qui a échoué en répondant au dernier message : une ligne sous la conversation,
// ce que la station en a dit au survol ; le champ reste.
import { MESSAGES, secondAuGuichet } from "./telephone-projets-second-commun.ts";

export const ecran = await secondAuGuichet("La conversation de « parade » sur le téléphone appairé, le second qui a échoué en répondant, en 412 × 915", {
  status: 200,
  data: {
    project: "parade",
    session: "0b6c1c2e-4f5a-4b7c-9d8e-1f2a3b4c5d6e",
    messages: [...MESSAGES, { from: "chef", at: "2026-10-13T10:04:00.000Z", text: "Merge #12, I grant it for this one." }],
    failed: { said: "the second of parade failed — You've hit your limit · resets 2pm", detail: "$ claude --continue -p   (in /home/chef/parade)\nYou've hit your limit · resets 2pm\n→ exit code 1" },
  },
});
