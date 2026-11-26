// La mise de côté du troisième refus, vue de la station (#4226) : ce qui n'est pas un essai, et la tête déjà refusée.
import assert from "node:assert/strict";
import { test } from "node:test";
import { brancheDuTicket } from "../../src/brigade-github.ts";
import { LABEL_IN_PASS, LABEL_PARKED } from "../../src/github-etat/etats.ts";
import { CALIBRE, FauxGitHub } from "../faux-github.ts";

const parcs = (faux: FauxGitHub) => (faux.commentaires.get(7) ?? []).filter(({ body }) => body.startsWith("<!-- brigade:todo kind=blocked tries="));
const renvoisDe = (faux: FauxGitHub) => (faux.commentaires.get(7) ?? []).filter(({ body }) => body.startsWith("<!-- brigade:renvoi"));

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

test("the third refusal parks the ticket with one card that lists each try and the red checks, and no cook is started after it", async () => {
  const { faux, ouverte } = enPass();
  faux.ciRouge.add(ouverte.number);
  const a = faux.station("A", { avertir: () => {} });
  for (let tour = 0; tour < 4; tour += 1) {
    await a.tour();
    await a.calme();
  }
  assert.deepEqual(
    parcs(faux).map(({ body }) => body),
    [
      [
        `<!-- brigade:todo kind=blocked tries=3 sha=${"3".repeat(40)} -->`,
        "#7 is parked for the chef: its delivery was refused 3 times, and a ticket gets 3 tries in total.",
        "",
        "What was tried (station `A` refused the last one):",
        "- Try 1: one",
        "- Try 2: two",
        "- Try 3: the CI is red on `3333333`: tests",
        "",
        "Still red on its head `3333333`: tests.",
        "Send-back reason: failing test",
        "",
        "Nothing relaunches #7 before you answer on this issue. Answer here, and a cook takes it up again with your answer.",
      ].join("\n"),
    ],
  );
  assert.equal(renvoisDe(faux).length, 2, "the third refusal is the card, not a send-back");
  assert.deepEqual([...faux.ticket(7).labels].sort(), [...CALIBRE, "chef-todo"].sort(), "out of the pass, parked for the chef, not for the supervisor");
  assert.deepEqual(faux.cuissons, [], "no fourth cook");
});

test("a send-back for a conflict with the base is no try: two refusals, then a conflict, and the next refusal is the third", async () => {
  const { faux, ouverte } = enPass({ enConflit: true, conflitDeContenu: true });
  const a = faux.station("A", { avertir: () => {} });
  await a.tour();
  await a.calme();
  const dits = renvoisDe(faux).map(({ body }) => body);
  assert.ok(dits.some((body) => /^<!-- brigade:renvoi n=3 sha=3{40} conflit -->/.test(body)), dits.join("\n---\n"));
  assert.equal(parcs(faux).length, 0);
  assert.equal(faux.ticket(7).labels.has("chef-todo"), false);
  // La synchro faite par le cook suivant, sa CI est rouge : c'est le troisième refus, pas le quatrième.
  ouverte.enConflit = false;
  ouverte.conflitDeContenu = false;
  faux.ciRouge.add(ouverte.number);
  for (let tour = 0; tour < 8 && !faux.ticket(7).labels.has("chef-todo"); tour += 1) {
    await a.tour();
    await a.calme();
  }
  assert.equal(faux.cuissons.length, 1, "one cook after the conflict");
  assert.equal(parcs(faux).length, 1);
  assert.match(parcs(faux)[0]!.body, /^<!-- brigade:todo kind=blocked tries=3 sha=[0-9a-f]{40} -->\n[\s\S]*\n- Try 1: one\n- Try 2: two\n- Try 3: the CI is red on `[0-9a-f]{7}`: tests\n\nStill red on its head `[0-9a-f]{7}`: tests\.\n/);
  assert.doesNotMatch(parcs(faux)[0]!.body, /conflicts with the base/, "the conflict is not listed as a try");
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
  assert.equal(renvoisDe(faux).length, 2, "the head the card refused is not sent back again");
  assert.equal(faux.ticket(7).labels.has(LABEL_PARKED), false, "nor sent to the supervisor");
  assert.equal(faux.ticket(7).labels.has(LABEL_IN_PASS), false, "it leaves the pass");
});

test("a manager rewrite, through the station's own path, leaves the count as it was: the next refusal is the third", async () => {
  const faux = new FauxGitHub();
  faux.feu(7);
  faux.corpsEcrivables = true;
  // Deux fois le même résultat : la station le donne au manager, qui réécrit le ticket (#3814).
  const a = faux.station("A", { juger: async () => ({ verdict: "request-changes", motif: "Remark: the page is wrong." }), avertir: () => {}, reprendre: async () => ({ reprise: { choix: "reecrire", motif: "The page is still wrong.", corps: "Fix the page." } }) });
  // Chaque renvoi, tel qu'il a été posté : la réécriture, qui suit le second dans le même tour, n'en touche aucun.
  const vus = new Map<string, string>();
  for (let tour = 0; tour < 20 && !faux.ticket(7).labels.has("chef-todo"); tour += 1) {
    await a.tour();
    await a.calme();
    for (const { body } of renvoisDe(faux)) if (!vus.has(body.split("\n")[0]!)) vus.set(body.split("\n")[0]!, body);
  }
  for (let tour = 0; tour < 4; tour += 1) {
    await a.tour();
    await a.calme();
  }
  assert.match(faux.ticket(7).corps, /Ticket rewritten by the manager[\s\S]*Fix the page\./);
  assert.ok((faux.commentaires.get(7) ?? []).some(({ body }) => body.startsWith("<!-- brigade:reprise-du-manager choix=reecrire -->")));
  const renvois = renvoisDe(faux).map(({ body }) => body);
  assert.deepEqual(renvois, [...vus.values()], "the rewrite neither deletes nor rewrites a send-back");
  assert.equal(renvois.length, 2);
  assert.match(renvois[0]!, /^<!-- brigade:renvoi n=1 sha=[0-9a-f]{40} -->\nStation `A`: sent back to a cook \(1\/2\) — the review requested changes: Remark: the page is wrong\./);
  assert.match(renvois[1]!, /^<!-- brigade:renvoi n=2 sha=[0-9a-f]{40} -->\nStation `A`: still not mergeable after 1 sends back — [\s\S]*the ticket went to the manager/);
  assert.equal(parcs(faux).length, 1);
  assert.match(parcs(faux)[0]!.body, /^<!-- brigade:todo kind=blocked tries=3 [\s\S]*- Try 1: the review requested changes: Remark: the page is wrong\.\n- Try 2: the review requested changes: Remark: the page is wrong\.\n- Try 3: the review requested changes: Remark: the page is wrong\.\n\nNo check is red on its head `[0-9a-f]{7}`: the review refused it\.\nSend-back reason: wrong behaviour\n/);
  assert.equal(faux.cuissons.length, 3, "three cooks in its life, no fourth");
});
