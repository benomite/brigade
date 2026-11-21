// #3932, critère 3 : une épique (corps avec au moins une ligne `- [ ] #N` ou `- [x] #N`) ne tient jamais une zone de
// fichiers. Scénario de #831 / PR 835 : l'épique a une livraison ouverte sur la zone Z, ses sous-tickets touchent Z.
import assert from "node:assert/strict";
import { test } from "node:test";
import { FauxGitHub } from "../faux-github.ts";

const CALIBRE = ["fire", "model:sonnet", "effort:medium"];
const ZONE = "runtime/src/rail.ts";
const corpsDeSousTicket = (epique: number) => `Epic: #${epique}\n\n## Context\n\nwhatever\n\n## Zone\n\n- \`${ZONE}\`\n\n## Acceptance\n\n- done\n`;

for (const case_ of ["- [ ] #875", "- [x] #875"]) {
  test(`an epic with an open PR on a zone does not hold it (${case_}): its sub-tickets are claimed, not skipped`, async () => {
    const faux = new FauxGitHub();
    faux.feu(831, CALIBRE.filter((label) => label !== "fire"), `## Context\n\nSplit.\n\n## Tasks\n\n${case_}\n- [ ] #876\n`);
    const pr = faux.prOuverte([ZONE], "cook/831-abcdef01");
    pr.issue = 831;
    faux.feu(875, CALIBRE, corpsDeSousTicket(831));
    faux.feu(876, CALIBRE, corpsDeSousTicket(831));
    const sauts: string[] = [];
    const a = faux.station("A", { places: 2, sauter: (_numero, ligne) => sauts.push(ligne), cuisiner: async () => ({ echec: "not the point" }), avertir: () => {} });
    await a.tour();
    await a.calme();
    assert.deepEqual(sauts.filter((ligne) => ligne.includes("zone held by #831")), []);
    assert.ok(faux.cuissons.some((c) => c.issue === 875), "a sub-ticket on the epic's zone is claimable");
  });
}
