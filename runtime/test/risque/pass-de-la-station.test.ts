// #4230: the pass of a station submits the merge of a ticket that says its kind of action (`action:<kind>`) to the
// risk ranking of the project sheet, read as the station reads it at the integration branch (`reglagesDuTexte`). Ranked `chef`, the merge is parked for the chef at
// the gesture gate, whatever the pass's level, and done once the chef approves it; ranked `safe`, it is merged with
// nothing held. The cook and the review are fakes; the clock is given; no `claude` is launched.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { gestesDe, OUTCOME } from "../../src/autonomie/agents/gestes.ts";
import { magasinDeNiveaux, type Niveau } from "../../src/autonomie/agents/niveaux.ts";
import { gestesEnAttente, porteDesGestes } from "../../src/autonomie/agents/porte.ts";
import { brancheDuTicket, stationDuDepot } from "../../src/brigade-github.ts";
import { LABEL_IN_PASS } from "../../src/github-etat/etats.ts";
import { reglagesDuTexte, texteDuFichier } from "../../src/reglages-projet/reglages.ts";
import { CALIBRE, FauxGitHub, STATION_DU_DEPOT, fauxClient } from "../faux-github.ts";
import { repertoireTemporaire } from "../outils.ts";

const PROJET = "risque-station";
const TICKET = 41;
const A9 = () => new Date("2026-11-23T09:00:00.000Z");

// A station of a fake GitHub with ticket #1 on the rail, labelled with its kind of action, and a project sheet that
// holds `fiche` at the integration branch (a string: written as is), which `poser` changes.
function station(t: TestContext, genre: string, fiche: unknown, pass?: Niveau) {
  const repertoire = repertoireTemporaire(t);
  if (pass !== undefined) magasinDeNiveaux(repertoire).poser(PROJET, "pass", pass);
  let texte = "";
  const poser = (contenu: unknown) => void (texte = typeof contenu === "string" ? contenu : JSON.stringify({ version: 1, integrationBranch: "main", ...(contenu as object) }));
  poser(fiche);
  const porte = porteDesGestes({ repertoire, projet: PROJET, horloge: A9 });
  const faux = new FauxGitHub();
  faux.feu(1, [...CALIBRE, `action:${genre}`]);
  faux.nonFermees.add(1);
  const avertissements: string[] = [];
  const box = faux.station("A", { porte, ficheDuProjet: () => reglagesDuTexte(texte), avertir: (texte) => void avertissements.push(texte) });
  const tours = async (n: number) => {
    for (let i = 0; i < n; i++) {
      await box.tour();
      await box.calme();
    }
  };
  return { repertoire, porte, faux, poser, avertissements, tours };
}

test("a merge whose kind the sheet does not rank as safe is parked for the chef with what it will do, and merged once the chef approves it", async (t) => {
  const { repertoire, porte, faux, avertissements, tours } = station(t, "publish", {});
  await tours(3);
  assert.equal(faux.mergee(1), undefined, "the merge did not run");
  assert.deepEqual(faux.prs.filter((pr) => pr.issue === 1).map(({ state }) => state), ["open"], "not taken as merged");
  // Held as a delivery the chef answers: never said refused by GitHub.
  assert.deepEqual(avertissements.filter((texte) => /refused by GitHub/.test(texte)), []);
  const [attente] = gestesEnAttente(repertoire);
  assert.equal(attente?.agent, "pass");
  assert.match(attente?.line ?? "", /^#1 will publish by merging PR #\d+ \(`[0-9a-f]{7}`\) — its kind `publish` is ranked 'chef' in the project sheet/);

  await porte.approuver(attente?.id ?? 0);
  assert.notEqual(faux.mergee(1), undefined, "the merge ran after the chef's answer");
  assert.deepEqual(gestesEnAttente(repertoire), []);
  // The chef's answer is the only one: the merge it starts does not ask the chef again.
  assert.deepEqual(gestesDe(repertoire, "pass").map(({ outcome }) => outcome), [OUTCOME.HANDED_TO_CHEF]);
});

test("on propose, a merge ranked 'chef' waits for one answer of the chef, not two", async (t) => {
  const { repertoire, porte, faux, tours } = station(t, "pay", {}, "propose");
  await tours(3);
  const [attente] = gestesEnAttente(repertoire);
  assert.match(attente?.line ?? "", /^#1 will pay by merging PR/);
  await porte.approuver(attente?.id ?? 0);
  assert.notEqual(faux.mergee(1), undefined);
  assert.deepEqual(gestesEnAttente(repertoire), []);
});

test("a merge the chef answered that GitHub then refuses is said, not dropped", async (t) => {
  const { repertoire, porte, faux, avertissements, tours } = station(t, "publish", {});
  await tours(3);
  const pr = faux.prs.find((une) => une.issue === 1);
  assert.ok(pr);
  pr.sha = "f".repeat(40);
  await porte.approuver(gestesEnAttente(repertoire)[0]?.id ?? 0);
  assert.equal(faux.mergee(1), undefined);
  assert.deepEqual(avertissements.filter((texte) => /the chef answered/.test(texte)), [`brigade : #1 on A — the chef answered, but the merge of PR #${pr.number} did not go through: HTTP 409 — Head branch was modified`]);
});

test("the station the kitchen opens reads the risk ranking in the project sheet it is given", async (t) => {
  const repertoire = repertoireTemporaire(t);
  const faux = new FauxGitHub();
  faux.feu(TICKET, [...CALIBRE, "action:publish", LABEL_IN_PASS]);
  const sha = faux.sha();
  faux.prs.push({ number: 1000 + TICKET, issue: TICKET, branche: brancheDuTicket(TICKET), sha, state: "open", merged: false, enRetard: false, mergeePar: null, fichiers: ["runtime/src/x.ts"] });
  faux.poster(1000 + TICKET, "A", `<!-- brigade:verdict station=A verdict=approve sha=${sha} -->\nApproved by station \`A\`.`);
  const box = stationDuDepot({
    ...STATION_DU_DEPOT,
    github: { ...fauxClient(faux), creerIssue: faux.pour("box").creerIssue },
    depot: { connait: () => false, preparer: async () => assert.fail("nothing is cooked"), reprendre: async () => assert.fail("nothing is cooked"), retirer: () => {}, ranger: async () => null, pousser: () => {}, commits: () => 0, changes: () => [], diff: () => "" },
    flux: repertoire,
    lancer: () => assert.fail("the PR is already approved: no review"),
    porte: porteDesGestes({ repertoire, projet: PROJET, horloge: A9 }),
    projet: () => ({ integrationBranch: "main" }),
  });
  if ("refus" in box) throw new Error(box.refus);
  for (let i = 0; i < 3; i += 1) {
    await box.tour();
    await box.calme();
    await box.relu();
  }
  assert.equal(faux.mergee(TICKET), undefined);
  assert.match(gestesEnAttente(repertoire)[0]?.line ?? "", new RegExp(`^#${TICKET} will publish by merging PR #${1000 + TICKET}`));
});

test("a rank changed in the sheet applies to the next ticket: ranked 'safe', its merge goes through with nothing parked", async (t) => {
  const { repertoire, faux, poser, tours } = station(t, "publish", {});
  await tours(3);
  assert.equal(faux.mergee(1), undefined);
  poser({ risk: { publish: "safe" } });
  faux.feu(2, [...CALIBRE, "action:publish"]);
  faux.nonFermees.add(2);
  await tours(3);
  assert.notEqual(faux.mergee(2), undefined);
  // Merged through the gate, the delivery is served: its ticket closed.
  assert.equal(faux.ticket(2).state, "closed");
  assert.equal(faux.mergee(1), undefined);
  assert.deepEqual(gestesEnAttente(repertoire).map(({ line }) => line.slice(0, 3)), ["#1 "], "only the first ticket's merge is parked");
});

test("a sheet that cannot be read parks the merge for the chef and says why", async (t) => {
  const { repertoire, faux, tours } = station(t, "fix-typo", "{not json");
  await tours(3);
  assert.equal(faux.mergee(1), undefined);
  assert.match(gestesEnAttente(repertoire)[0]?.line ?? "", /the project sheet cannot be read, so its kind `fix-typo` is taken as ranked 'chef' — `.claude\/brigade\/projet.json` is not valid JSON/);
});

// brigade:guard
test("a kind ranked 'safe' still goes through the pass's level, as before: on propose, the merge waits for the chef's OK", async (t) => {
  const { repertoire, porte, faux, avertissements, tours } = station(t, "fix-typo", {}, "propose");
  await tours(3);
  assert.equal(faux.mergee(1), undefined);
  assert.deepEqual(avertissements.filter((texte) => /refused by GitHub/.test(texte)), []);
  assert.deepEqual(faux.prs.filter((pr) => pr.issue === 1).map(({ state }) => state), ["open"], "not taken as merged");
  const [attente] = gestesEnAttente(repertoire);
  assert.match(attente?.line ?? "", /^merge PR #\d+ of #1$/);
  await porte.approuver(attente?.id ?? 0);
  assert.notEqual(faux.mergee(1), undefined);
});

test("the gate holds a gesture said for the chef whatever its level but observe, and does the others as before", async (t) => {
  const repertoire = repertoireTemporaire(t);
  const porte = porteDesGestes({ repertoire, projet: PROJET, horloge: A9 });
  const dit = { line: "pay the invoice", reason: "ranked chef", outcome: OUTCOME.HANDED_TO_CHEF };
  let faits = 0;
  const faire = () => void (faits += 1);
  assert.equal((await porte.passer({ agent: "pass", reglable: "pass", auChef: true }, dit, faire)).etat, "held");
  assert.equal(faits, 0);
  assert.equal((await porte.passer({ agent: "pass", reglable: "pass" }, { ...dit, line: "merge" }, faire)).etat, "done");
  assert.equal(faits, 1);
  magasinDeNiveaux(repertoire).poser(PROJET, "pass", "observe");
  assert.equal((await porte.passer({ agent: "pass", reglable: "pass", auChef: true }, { ...dit, line: "publish" }, faire)).etat, "observed");
  assert.equal(faits, 1);
});

test("the project sheet's `risk` field is a setting of the project: read, kept when the sheet is written again, and refused when a rank is no rank", () => {
  const fiche = reglagesDuTexte(JSON.stringify({ version: 1, integrationBranch: "main", risk: { publish: "safe", "fix-typo": "chef" } }));
  assert.deepEqual(fiche.risk, { publish: "safe", "fix-typo": "chef" });
  assert.deepEqual(reglagesDuTexte(texteDuFichier(fiche)).risk, { publish: "safe", "fix-typo": "chef" });
  assert.throws(() => reglagesDuTexte(JSON.stringify({ version: 1, integrationBranch: "main", risk: { pay: "maybe" } })), /`risk\.pay` .*must be a rank: `chef` or `safe`/);
  assert.throws(() => reglagesDuTexte(JSON.stringify({ version: 1, integrationBranch: "main", risk: ["pay"] })), /risk.*must be an object of kinds of actions/);
});
