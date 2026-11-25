// La mise de côté du troisième refus, vue de la station (#4226) : ce qui n'est pas un essai, et la tête déjà refusée.
import assert from "node:assert/strict";
import { test } from "node:test";
import { brancheDuTicket } from "../../src/brigade-github.ts";
import { LABEL_IN_PASS } from "../../src/github-etat/etats.ts";
import { CALIBRE, FauxGitHub } from "../faux-github.ts";

const parcs = (faux: FauxGitHub) => (faux.commentaires.get(7) ?? []).filter(({ body }) => body.startsWith("<!-- brigade:todo kind=blocked tries="));

// Le ticket #7 en pass, déjà refusé deux fois, et sa PR ouverte.
function enPass(pr: { enConflit?: boolean; conflitDeContenu?: boolean } = {}) {
  const faux = new FauxGitHub();
  faux.feu(7, [...CALIBRE, LABEL_IN_PASS]);
  faux.poster(7, "A", `<!-- brigade:renvoi n=1 sha=${"1".repeat(40)} -->\nStation \`A\`: sent back to a cook (1/2) — one`);
  faux.poster(7, "A", `<!-- brigade:renvoi n=2 sha=${"2".repeat(40)} -->\nStation \`A\`: sent back to a cook (2/2) — two`);
  const ouverte = { number: 1000, issue: 7, branche: brancheDuTicket(7), sha: "3".repeat(40), state: "open" as const, merged: false, enRetard: false, mergeePar: null, fichiers: [], ...pr };
  faux.prs.push(ouverte);
  return { faux, ouverte };
}

test("a send-back for a conflict with the base is no try: two refusals, then a conflict, and the ticket is not parked", async () => {
  const { faux } = enPass({ enConflit: true, conflitDeContenu: true });
  const a = faux.station("A", { avertir: () => {} });
  await a.tour();
  await a.calme();
  const dits = (faux.commentaires.get(7) ?? []).map(({ body }) => body);
  assert.ok(dits.some((body) => /^<!-- brigade:renvoi n=3 sha=3{40} conflit -->/.test(body)), dits.join("\n---\n"));
  assert.equal(parcs(faux).length, 0);
  assert.equal(faux.ticket(7).labels.has("chef-todo"), false);
});

test("the head the parking refused is not parked again once the chef answered, though it is still in pass", async () => {
  const { faux, ouverte } = enPass();
  faux.ciRouge.add(ouverte.number);
  faux.poster(7, "A", `<!-- brigade:todo kind=blocked tries=3 sha=${ouverte.sha} -->\n#7 is parked for the chef.\n\n- Try 1: one\n- Try 2: two\n- Try 3: three`);
  faux.ticket(7).labels.add("chef-todo");
  faux.poster(7, "chef", "Go on.");
  const a = faux.station("A", { avertir: () => {} });
  await a.tour();
  await a.calme();
  assert.equal(parcs(faux).length, 1, "no second card for the same head");
  assert.equal(faux.ticket(7).labels.has(LABEL_IN_PASS), false, "it leaves the pass");
});
