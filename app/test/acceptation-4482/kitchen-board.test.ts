// #4482 — the project view's kanban reads the new kitchen's labels. Wired as main.ts wires it (`lireLeTableau`): the token is
// the one the workstation's `gh` gives (`gh auth token`), here a fake `gh`; GitHub, a fake that holds the issues, their labels
// and the pull requests, and refuses any request without that token. The reading, `facts` as the main process holds it, then
// the view played in front of a fake document: one issue in each of the six columns, its try count, its issue and its PR.
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { forTheBar } from "../../src/bar.ts";
import { EXAMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/colors.ts";
import { holdFacts } from "../../src/facts.ts";
import { actionsOfCard } from "../../src/card-actions.ts";
import { TABS, HEADINGS } from "../../src/tabs.ts";
import { EFFORTS, MODELS } from "../../src/projects/projects.ts";
import { withWhatAwaitingTheChef } from "../../src/board/wait-of-chef.ts";
import { clientGitHub, type Send, type AnswerGitHub } from "../../src/board/client.ts";
import { tokenOfGh } from "../../src/board/token-gh.ts";
import { readTheBoardOfRepository, type BoardRead } from "../../src/board/read.ts";
import type { Terminal } from "../../src/terminals.ts";
import { type Fake, playTheVue, repos } from "../helpers/false-vue.ts";

const REPOSITORY = "acme/parade";
const PROJECT = "parade";
const NOW = "2026-11-26T12:00:00.000Z";
const TOKEN = "gho_chef4482";
const WITHOUT_SH = process.platform === "win32" ? "the fake `gh` is an sh script, which Windows does not run" : false;
const issueUrl = (n: number) => `https://github.com/${REPOSITORY}/issues/${n}`;
const prUrl = (n: number) => `https://github.com/${REPOSITORY}/pull/${n}`;

// The workstation's `gh`: `gh auth token` says the chef's token; nothing else is asked of it.
function fakeGh(t: TestContext): string {
  const dir = mkdtempSync(join(tmpdir(), "brigade-4482-gh-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const gh = join(dir, "gh");
  writeFileSync(gh, `#!/bin/sh\n[ "$1 $2" = "auth token" ] || exit 9\nprintf '%s\\n' '${TOKEN}'\n`);
  chmodSync(gh, 0o755);
  return gh;
}

// The kitchen's state, in its labels (runtime/src/kitchen/kitchen.ts): #1 in the backlog, #2 ready, #3 taken by a cook, #4
// delivered by PR #40 after one refusal, #5 parked for the chef after three, #6 served by PR #38 an hour ago.
function world(t: TestContext) {
  const ok = (data: unknown, status = 200): AnswerGitHub => ({ status, data });
  const issue = (number: number, title: string, labels: string[]) => ({ number, title, html_url: issueUrl(number), created_at: "2026-11-25T09:00:00Z", labels: labels.map((name) => ({ name })), body: "" });
  const pr = (number: number, ticket: number, extra: object) => ({ number, title: `#${ticket} — ticket ${ticket}`, html_url: prUrl(number), head: { ref: `cook/${ticket}-github` }, body: `Closes #${ticket}`, updated_at: NOW, ...extra });
  const open = [
    issue(1, "Export the journal as CSV", []),
    issue(2, "Login by magic link", ["fire", "model:sonnet", "effort:medium"]),
    issue(3, "PDF export of the invoices", ["fire", "taken"]),
    issue(4, "SIRET validation", ["fire", "in-pass", "try:1"]),
    issue(5, "Free tier: keep the CSV export?", ["fire", "parked:chef", "try:1", "try:2", "try:3"]),
  ];
  const reads: string[] = [];
  const read: Send = async (address, headers) => {
    if (headers.Authorization !== `Bearer ${TOKEN}`) return ok({ message: "Requires authentication" }, 401);
    const path = address.replace("https://api.github.com", "");
    reads.push(path);
    if (path === `/repos/${REPOSITORY}/contents/.brigade/kitchen.json`) return ok({ type: "file", content: Buffer.from('{"risk": ["runtime/"]}').toString("base64") });
    if (path.startsWith(`/repos/${REPOSITORY}/issues?state=open`)) return ok(open);
    if (path.startsWith(`/repos/${REPOSITORY}/pulls?state=open`)) return ok([pr(40, 4, {})]);
    if (path.startsWith(`/repos/${REPOSITORY}/pulls?state=closed`)) return ok([pr(38, 6, { title: "#6 — The append-only journal", merged_at: "2026-11-26T11:00:00Z" })]);
    if (path === `/repos/${REPOSITORY}`) return ok({ default_branch: "main", permissions: { push: true } });
    if (/\/issues\/5\/comments/.test(path)) return ok([{ id: 9, body: "Parked for the chef: three refusals.", author_association: "OWNER", created_at: "2026-11-26T10:00:00Z" }]);
    if (/\/issues\?/.test(path) || /\/issues\/\d+\/comments/.test(path)) return ok([]);
    return ok({ message: "Not Found" }, 404);
  };
  return { appeler: clientGitHub({ jeton: tokenOfGh({ gh: fakeGh(t), delaiMs: 60_000 }), envoyer: read }), reads };
}

const SECOND: Terminal = { id: 1, projet: PROJECT, genre: "second", titre: "second · claude", note: "session neuve", arrete: false };
const start = () => ({
  configuration: forTheBar({ chemin: "/tmp/app.json", projets: [{ nom: PROJECT, dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE, exemple: EXAMPLE, onglets: TABS, rubriques: HEADINGS,
  gestes: {},
  calibrage: { modeles: MODELS, efforts: EFFORTS }, });

describe("#4482 — the kanban of a project on the new kitchen reads its labels", { skip: WITHOUT_SH }, () => {
  test("one issue in each column — Backlog, Ready, Cooking, Pass, Parked, Served —, its try count, its issue and its PR", async (t) => {
    const { appeler: call, reads } = world(t);
    const readOne = (await withWhatAwaitingTheChef(await readTheBoardOfRepository({ depot: REPOSITORY, appeler: call, maintenant: () => new Date(NOW) }), call)) as BoardRead;
    assert.ok(readOne.lu, JSON.stringify(readOne));
    // Nothing of the old runtime: no claim comment, no event, no check run of the base, no station's gist.
    assert.ok(!reads.some((path) => /\/events|check-runs|gists|labels=fire/.test(path)), reads.join("\n"));

    // `facts` as the main process holds it, then the view.
    const facts = holdFacts();
    const receivedOne = facts.recevoir({ projet: PROJECT, demande: 0, a: NOW, sorties: [{ commande: "facts", texte: JSON.stringify(readOne.faits) }] });
    const vue = await playTheVue({ demarrage: start, espace: () => [SECOND], ouvrirIssue: () => true, ouvrirPr: () => true, gestesDeFiche: (cardItem) => actionsOfCard(cardItem) });
    (vue.element("projets").children.at(1) ?? assert.fail("no project entry")).click();
    await repos();
    vue.dire("surFaits", { ...receivedOne, demande: vue.dernier("faits")[0] as number });
    await repos();
    const rail = vue.element("rail");
    const columns = rail.dessous("section").filter(({ className }) => className === "colonne");
    const vouchers = (column: Fake) => column.dessous("li").filter(({ className }) => className.split(" ").includes("bon"));
    assert.deepEqual(
      columns.map((column) => [column.dataset.colonne, vouchers(column).map(({ dataset }) => Number(dataset.ticket))]),
      [["Backlog", [1]], ["Ready", [2]], ["Cooking", [3]], ["Pass", [4]], ["Parked", [5]], ["Served", [6]]],
    );
    // Each column says its count.
    assert.deepEqual(columns.map((column) => column.dessous("h4")[0]?.dessous("span").at(-1)?.textContent), ["1", "1", "1", "1", "1", "1"]);

    const card = (ticket: number) => rail.dessous("li").find(({ dataset }) => dataset.ticket === String(ticket)) ?? assert.fail(`no card #${ticket}`);
    const line = (ticket: number) => card(ticket).dessous("p").find(({ className }) => className === "ligne-carte")?.textContent;
    assert.equal(card(4).dessous("strong")[0]?.textContent, "SIRET validation");
    assert.equal(line(1), undefined);
    assert.equal(line(3), undefined);
    assert.equal(line(4), "try 1/3 · PR #40");
    assert.equal(line(5), "parked for the chef · try 3/3");
    assert.equal(line(6), "PR #38");
    assert.equal(card(6).dessous("strong")[0]?.textContent, "The append-only journal");

    // Its number opens its issue, its PR opens on GitHub: the address is the one the reading gave (facts.ts).
    const button = (ticket: number, label: string) => card(ticket).dessous("button").find(({ textContent }) => textContent === label) ?? assert.fail(`no “${label}” on #${ticket}`);
    button(4, "#4").click();
    button(4, "PR #40").click();
    button(6, "PR #38").click();
    await repos();
    assert.deepEqual(vue.appels.filter(({ geste: action }) => action === "ouvrirIssue" || action === "ouvrirPr").map(({ geste: action, args }) => [action, ...args]), [["ouvrirIssue", PROJECT, 4], ["ouvrirPr", PROJECT, 4], ["ouvrirPr", PROJECT, 6]]);
    assert.equal(facts.adresse(PROJECT, 4), issueUrl(4));
    assert.equal(facts.adresse(PROJECT, 6), issueUrl(6));
    assert.equal(facts.pr(PROJECT, 4), prUrl(40));
    assert.equal(facts.pr(PROJECT, 6), prUrl(38));
    // The chef's TODO stays the line above the columns: the `parked:chef` issue, read from the list the reading made (#4474),
    // and no list of the old runtime's labels.
    const todo = rail.children.find(({ className }) => className === "avis-du-todo") ?? assert.fail("no TODO line");
    assert.match(todo.textContent, /1 waits for you/);
    assert.ok(!reads.some((path) => /labels=(chef-todo|question|decision|blocked-on-human)/.test(path)), reads.join("\n"));
    // The old plan is not drawn: no Manager column, no "Rail — ready to cook".
    assert.ok(!rail.dessous("h5").some(({ textContent }) => textContent === "Rail — ready to cook"));
  });
});
