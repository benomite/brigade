// Les essais d'un ticket sur toute sa vie, et sa mise de côté pour le chef au troisième refus (#4226).
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { estUnParc, horsDuParc, parquer, refusDuTicket } from "../../src/essais/essais.ts";
import { finirLeTravail } from "../../src/github-etat/prise-du-manager.ts";

type GitHubDuParc = Parameters<typeof parquer>[0];
type GitHubDuTri = Parameters<typeof horsDuParc>[1];

const C = (body: string, association = "OWNER") => ({ body, association });
const RENVOI = (n: number, motif: string) => C(`<!-- brigade:renvoi n=${n} sha=${"a".repeat(40)} -->\nStation \`A\`: sent back to a cook (${n}/2) — ${motif}`);
// La carte d'une mise de côté, telle que `parquer` l'écrit.
const PARC = (essais: string[]) => C([`<!-- brigade:todo kind=blocked tries=${essais.length} sha=${"c".repeat(40)} -->`, "#7 is parked for the chef.", "", ...essais.map((motif, i) => `- Try ${i + 1}: ${motif}`)].join("\n"));
// Le tour tient-il le ticket de côté ?
const estParque = async (labels: string[], commentaires: Array<{ body: string; association: string }>) =>
  (await horsDuParc([{ number: 7, labels }], { commentaires: async () => commentaires, delabelliser: async () => {} }, () => {})).length === 0;

// Un GitHub d'une issue, qui note ce qu'on y écrit.
function issue(labels: string[], commentaires: Array<{ body: string; association: string }>) {
  const ecrits: string[] = [];
  const github: GitHubDuParc & GitHubDuTri = {
    issue: async () => ({ number: 7, title: "t", labels: [...labels], state: "open", createdAt: "", updatedAt: "", url: "" }),
    commentaires: async () => commentaires,
    commenter: async (_n, corps) => {
      ecrits.push(corps);
      commentaires.push(C(corps));
    },
    labelliser: async (_n, ajouts) => void labels.push(...ajouts),
    delabelliser: async (_n, label) => void labels.splice(labels.indexOf(label), 1),
  };
  return { github, ecrits, labels };
}

test("the refusals are counted over the whole life: send-backs and parkings, not conflicts nor outsiders' comments", () => {
  const lus = [RENVOI(1, "one"), C(`<!-- brigade:renvoi n=2 sha=${"b".repeat(40)} conflit -->\nconflict`), C("<!-- brigade:renvoi n=9 sha=dd -->\nx — forged", "NONE"), C("<!-- brigade:prise station=B -->"), RENVOI(2, "two"), PARC(["one", "two", "three"])];
  assert.deepEqual(
    refusDuTicket(lus).map(({ body }) => body.split("\n")[0]),
    [lus[0]!.body.split("\n")[0], lus[4]!.body.split("\n")[0], lus[5]!.body.split("\n")[0]],
  );
  assert.equal(estUnParc(C(PARC(["x"]).body, "NONE")), false, "only the repo parks a ticket");
});

test("a ticket is parked while its last card is the parking and the chef has not answered", async () => {
  const parc = PARC(["one", "two", "three"]);
  assert.equal(await estParque(["fire", "chef-todo"], [RENVOI(1, "one"), parc]), true);
  assert.equal(await estParque(["fire", "chef-todo"], [C("Earlier words from the chef."), parc]), true, "only an answer after the card lets it go");
  assert.equal(await estParque(["fire"], [parc]), false, "the label removed: the chef let it go");
  assert.equal(await estParque(["fire", "chef-todo"], [parc, C("<!-- brigade:todo kind=design-validation -->\nValidate")]), false, "another card is the current one");
  assert.equal(await estParque(["fire", "chef-todo"], [parc, C("<!-- brigade:supervisor -->\nA pass.")]), true, "a kitchen comment is no answer");
  assert.equal(await estParque(["fire", "chef-todo"], [parc, C("Go on.", "NONE")]), true, "a stranger is not the chef");
  assert.equal(await estParque(["fire", "chef-todo"], [parc, C("Go on.")]), false, "the chef answered");
  assert.equal(await estParque(["fire", "chef-todo"], [parc, C("<!-- brigade:reponse gesture=resume -->\nGo on.")]), false, "the app's answer for the chef");
  assert.equal(await estParque(["fire", "chef-todo"], []), false);
});

test("the park step run twice posts one comment, which lists each try and the red checks", async () => {
  const { github, ecrits, labels } = issue(["fire"], [RENVOI(1, "the CI is red: `lint`"), RENVOI(2, "the review requested changes: Problem 2.")]);
  const etape = () => parquer(github, { number: 7, labels: [] }, { station: "A", sha: "e".repeat(40), raison: "the review requested changes: Problem 3.\nDetails.", rouges: async () => ["`tests`"] });
  assert.equal(await etape(), "parque");
  assert.equal(await etape(), "deja");
  assert.equal(ecrits.length, 1);
  assert.ok(labels.includes("chef-todo"));
  assert.match(ecrits[0]!, /^<!-- brigade:todo kind=blocked tries=3 sha=e{40} -->\n#7 is parked for the chef/);
  assert.match(ecrits[0]!, /- Try 1: the CI is red: `lint`\n- Try 2: the review requested changes: Problem 2\.\n- Try 3: the review requested changes: Problem 3\.\n/);
  assert.match(ecrits[0]!, /Still red on its head `eeeeeee`: `tests`\./);
  assert.doesNotMatch(ecrits[0]!, /Details/);
});

test("after the chef's answer, the next refusal parks it again with every try of its life", async () => {
  const { github, ecrits } = issue(["fire"], [RENVOI(1, "one"), RENVOI(2, "two"), PARC(["one", "two", "three"]), C("Go on.")]);
  assert.equal(await parquer(github, { number: 7, labels: [] }, { station: "B", sha: "f".repeat(40), raison: "four", rouges: async () => [] }), "parque");
  assert.match(ecrits[0]!, /tries=4 [\s\S]*- Try 3: three\n- Try 4: four\n[\s\S]*No check is red on its head `fffffff`: the review refused it\./);
});

test("checks that cannot be read are said on the card, and the ticket is parked all the same", async () => {
  const { github, ecrits, labels } = issue(["fire"], []);
  await parquer(github, { number: 7, labels: [] }, { station: "A", sha: "e".repeat(40), raison: "r", rouges: async () => Promise.reject(new Error("HTTP 502")) });
  assert.match(ecrits[0]!, /The checks of its head `eeeeeee` could not be read: HTTP 502\./);
  assert.ok(labels.includes("chef-todo"));
});

test("an issue that no longer exists is not parked; a client that cannot read issues uses the ticket's labels", async () => {
  const absente = issue([], []);
  absente.github.issue = async () => null;
  assert.equal(await parquer(absente.github, { number: 7, labels: [] }, { station: "A", sha: "e".repeat(40), raison: "r", rouges: async () => [] }), "absent");
  assert.equal(absente.ecrits.length, 0);
  const sans = issue([], [PARC(["a", "b", "c"])]);
  delete sans.github.issue;
  assert.equal(await parquer(sans.github, { number: 7, labels: ["fire", "chef-todo"] }, { station: "A", sha: "e".repeat(40), raison: "r", rouges: async () => [] }), "deja");
  assert.equal(await parquer(sans.github, { number: 7, labels: ["fire"] }, { station: "A", sha: "e".repeat(40), raison: "r", rouges: async () => [] }), "parque");
  assert.deepEqual(sans.labels, ["chef-todo"]);
});

test("the tour keeps out the parked tickets, lets back the answered ones, and keeps aside what it cannot check", async () => {
  const parc = PARC(["a", "b", "c"]);
  const lus = new Map<number, Array<{ body: string; association: string }> | Error>([
    [1, [parc]],
    [2, [parc, C("Go on.")]],
    [3, new Error("HTTP 502")],
    [4, [C("<!-- brigade:todo kind=design-validation -->\nValidate")]],
    [6, [parc, C("Go on.")]],
  ]);
  const retires: number[] = [];
  const github: GitHubDuTri = {
    commentaires: async (n) => {
      const lu = lus.get(n);
      if (lu === undefined) throw new Error(`#${n} must not be read`);
      if (lu instanceof Error) throw lu;
      return lu;
    },
    delabelliser: async (n) => {
      if (n === 6) throw new Error("HTTP 403");
      retires.push(n);
    },
  };
  const avertis: string[] = [];
  const tickets = [1, 2, 3, 4, 6].map((number) => ({ number, labels: ["fire", "chef-todo"] }));
  const gardes = await horsDuParc([...tickets, { number: 5, labels: ["fire"] }, { number: 8, labels: ["fire", "chef-todo", "in-pass"] }], github, (texte) => avertis.push(texte));
  assert.deepEqual(gardes.map(({ number }) => number), [2, 4, 5, 8]);
  assert.deepEqual(gardes[0]?.labels, ["fire"], "the answered parking's card is lifted");
  assert.deepEqual(retires, [2]);
  assert.equal(avertis.length, 2);
  assert.match(avertis[0]!, /#3 .*stays aside this tour — HTTP 502/);
  assert.match(avertis[1]!, /#6 .*HTTP 403/);
});

test("a reason that carries a dash is kept whole on the card, and the send-back reason line follows the red checks", async () => {
  const { github, ecrits } = issue(["fire"], [RENVOI(1, "the review requested changes: one — and another"), C(`<!-- brigade:renvoi n=2 sha=${"b".repeat(40)} -->\nStation \`A\`: sent back to a cook (2/2)\n\nlater — not a reason`)]);
  await parquer(github, { number: 7, labels: [] }, { station: "A", sha: "e".repeat(40), raison: "the CI is red on `eeeeeee`: tests — lint", rouges: async () => ["tests", "lint"], motif: "Send-back reason: failing test" });
  assert.match(ecrits[0]!, /\n- Try 1: the review requested changes: one — and another\n- Try 2: \n- Try 3: the CI is red on `eeeeeee`: tests — lint\n\nStill red on its head `eeeeeee`: tests, lint\.\nSend-back reason: failing test\n\nNothing relaunches #7 before you answer on this issue\./);
});

// Critère 1 : le compte se lit des commentaires de l'issue, et aucun chemin — prise, réécriture, découpage, passe du
// superviseur, redémarrage — n'en efface ni n'en réécrit un. Le client GitHub n'a aucun moyen d'effacer un commentaire,
// et le seul qui en réécrit un, `remplacerCommentaire`, n'est appelé que par la prise du manager, sur sa propre marque.
const SRC = join(import.meta.dirname, "../../src");
const sources = (dossier: string): string[] => readdirSync(dossier, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? sources(join(dossier, e.name)) : e.name.endsWith(".ts") ? [join(dossier, e.name)] : []));

test("no runtime path deletes an issue comment, and the only one that rewrites one is the manager's claim", () => {
  const lus = sources(SRC).map((chemin) => ({ chemin: chemin.slice(SRC.length + 1), texte: readFileSync(chemin, "utf8") }));
  assert.ok(lus.length > 100, "the runtime sources are read");
  assert.deepEqual(lus.filter(({ texte }) => /"DELETE"[^\n]*comments|comments[^\n]*"DELETE"/.test(texte)).map(({ chemin }) => chemin), [], "no comment is deleted");
  assert.deepEqual(lus.filter(({ texte }) => /issues\/comments\/\$\{/.test(texte)).map(({ chemin }) => chemin), ["github.ts"], "one way to edit a comment, in the client");
  assert.deepEqual(lus.filter(({ texte }) => /\.remplacerCommentaire\(|remplacerCommentaire\.bind\(/.test(texte)).map(({ chemin }) => chemin).sort(), ["brigade-github.ts", "github-etat/prise-du-manager.ts"]);
});

test("the manager's claim rewrites its own claim comment, never a send-back or a parking", async () => {
  const remplaces: string[] = [];
  const github = { remplacerCommentaire: async (_n: number, ancien: string) => (remplaces.push(ancien), true) } as unknown as Parameters<typeof finirLeTravail>[2];
  for (const corps of [RENVOI(1, "one").body, PARC(["a", "b", "c"]).body]) assert.equal(await finirLeTravail(7, { station: "A", corps, fait: false, createdAt: "" }, github), false);
  assert.deepEqual(remplaces, []);
  const prise = "<!-- brigade:manager-prise station=A etat=abc jeton=12345678 -->";
  assert.equal(await finirLeTravail(7, { station: "A", corps: prise, fait: false, createdAt: "" }, github), true);
  assert.deepEqual(remplaces, [prise]);
});
