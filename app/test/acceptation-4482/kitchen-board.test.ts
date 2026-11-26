// #4482 — the project view's kanban reads the new kitchen's labels. Wired as main.ts wires it (`lireLeTableau`): the token is
// the one the workstation's `gh` gives (`gh auth token`), here a fake `gh`; GitHub, a fake that holds the issues, their labels
// and the pull requests, and refuses any request without that token. The reading, `facts` as the main process holds it, then
// the view played in front of a fake document: one issue in each of the six columns, its try count, its issue and its PR.
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBarre } from "../../src/barre.ts";
import { EXEMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../src/cuisine.ts";
import { BANNIERE, tenirFaits } from "../../src/faits.ts";
import { gestesDeCarte } from "../../src/gestes-fiche.ts";
import { CONFIRMES, DIRECTS } from "../../src/gestes.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../src/projets/projets.ts";
import { avecCeQuiAttendLeChef } from "../../src/tableau/attente-du-chef.ts";
import { clientGitHub, type Envoi, type ReponseGitHub } from "../../src/tableau/client.ts";
import { jetonDeGh } from "../../src/tableau/jeton-gh.ts";
import { lireLeTableauDuDepot, type TableauLu } from "../../src/tableau/lecture.ts";
import type { Terminal } from "../../src/terminaux.ts";
import { type Faux, jouerLaVue, repos } from "../aides/fausse-vue.ts";

const DEPOT = "acme/parade";
const PROJET = "parade";
const NOW = "2026-11-26T12:00:00.000Z";
const JETON = "gho_chef4482";
const SANS_SH = process.platform === "win32" ? "the fake `gh` is an sh script, which Windows does not run" : false;
const issueUrl = (n: number) => `https://github.com/${DEPOT}/issues/${n}`;
const prUrl = (n: number) => `https://github.com/${DEPOT}/pull/${n}`;

// The workstation's `gh`: `gh auth token` says the chef's token; nothing else is asked of it.
function fakeGh(t: TestContext): string {
  const dir = mkdtempSync(join(tmpdir(), "brigade-4482-gh-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const gh = join(dir, "gh");
  writeFileSync(gh, `#!/bin/sh\n[ "$1 $2" = "auth token" ] || exit 9\nprintf '%s\\n' '${JETON}'\n`);
  chmodSync(gh, 0o755);
  return gh;
}

// The kitchen's state, in its labels (runtime/src/kitchen/kitchen.ts): #1 in the backlog, #2 ready, #3 taken by a cook, #4
// delivered by PR #40 after one refusal, #5 parked for the chef after three, #6 served by PR #38 an hour ago.
function world(t: TestContext) {
  const ok = (data: unknown, status = 200): ReponseGitHub => ({ status, data });
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
  const read: Envoi = async (address, headers) => {
    if (headers.Authorization !== `Bearer ${JETON}`) return ok({ message: "Requires authentication" }, 401);
    const path = address.replace("https://api.github.com", "");
    reads.push(path);
    if (path === `/repos/${DEPOT}/contents/.brigade/kitchen.json`) return ok({ type: "file", content: Buffer.from('{"risk": ["runtime/"]}').toString("base64") });
    if (path.startsWith(`/repos/${DEPOT}/issues?state=open`)) return ok(open);
    if (path.startsWith(`/repos/${DEPOT}/pulls?state=open`)) return ok([pr(40, 4, {})]);
    if (path.startsWith(`/repos/${DEPOT}/pulls?state=closed`)) return ok([pr(38, 6, { title: "#6 — The append-only journal", merged_at: "2026-11-26T11:00:00Z" })]);
    if (path === `/repos/${DEPOT}`) return ok({ default_branch: "main", permissions: { push: true } });
    if (/\/issues\/5\/comments/.test(path)) return ok([{ id: 9, body: "Parked for the chef: three refusals.", author_association: "OWNER", created_at: "2026-11-26T10:00:00Z" }]);
    if (/\/issues\?/.test(path) || /\/issues\/\d+\/comments/.test(path)) return ok([]);
    return ok({ message: "Not Found" }, 404);
  };
  return { appeler: clientGitHub({ jeton: jetonDeGh({ gh: fakeGh(t), delaiMs: 60_000 }), envoyer: read }), reads };
}

const SECOND: Terminal = { id: 1, projet: PROJET, genre: "second", titre: "second · claude", note: "session neuve", arrete: false };
const start = () => ({
  configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [{ nom: PROJET, dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE, exemple: EXEMPLE, onglets: ONGLETS, rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE, calibrage: { modeles: MODELES, efforts: EFFORTS }, code: undefined,
});

describe("#4482 — the kanban of a project on the new kitchen reads its labels", { skip: SANS_SH }, () => {
  test("one issue in each column — Backlog, Ready, Cooking, Pass, Parked, Served —, its try count, its issue and its PR", async (t) => {
    const { appeler, reads } = world(t);
    const lu = (await avecCeQuiAttendLeChef(await lireLeTableauDuDepot({ depot: DEPOT, appeler, maintenant: () => new Date(NOW) }), appeler)) as TableauLu;
    assert.ok(lu.lu, JSON.stringify(lu));
    // Nothing of the old runtime: no claim comment, no event, no check run of the base, no station's gist.
    assert.ok(!reads.some((path) => /\/events|check-runs|gists|labels=fire/.test(path)), reads.join("\n"));

    // `facts` as the main process holds it, then the view.
    const faits = tenirFaits();
    const recue = faits.recevoir({ projet: PROJET, demande: 0, a: NOW, sorties: [{ commande: "facts", texte: JSON.stringify(lu.faits) }] });
    const vue = await jouerLaVue({ demarrage: start, espace: () => [SECOND], ouvrirIssue: () => true, ouvrirPr: () => true, gestesDeFiche: (carte) => gestesDeCarte(carte) });
    (vue.element("projets").children.at(1) ?? assert.fail("no project entry")).click();
    await repos();
    vue.dire("surFaits", { ...recue, demande: vue.dernier("faits")[0] as number });
    await repos();
    const rail = vue.element("rail");
    const columns = rail.dessous("section").filter(({ className }) => className === "colonne");
    const vouchers = (column: Faux) => column.dessous("li").filter(({ className }) => className.split(" ").includes("bon"));
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

    // Its number opens its issue, its PR opens on GitHub: the address is the one the reading gave (faits.ts).
    const button = (ticket: number, label: string) => card(ticket).dessous("button").find(({ textContent }) => textContent === label) ?? assert.fail(`no “${label}” on #${ticket}`);
    button(4, "#4").click();
    button(4, "PR #40").click();
    button(6, "PR #38").click();
    await repos();
    assert.deepEqual(vue.appels.filter(({ geste }) => geste === "ouvrirIssue" || geste === "ouvrirPr").map(({ geste, args }) => [geste, ...args]), [["ouvrirIssue", PROJET, 4], ["ouvrirPr", PROJET, 4], ["ouvrirPr", PROJET, 6]]);
    assert.equal(faits.adresse(PROJET, 4), issueUrl(4));
    assert.equal(faits.adresse(PROJET, 6), issueUrl(6));
    assert.equal(faits.pr(PROJET, 4), prUrl(40));
    assert.equal(faits.pr(PROJET, 6), prUrl(38));
    // The chef's TODO stays the line above the columns: the `parked:chef` issue, read from the list the reading made (#4474),
    // and no list of the old runtime's labels.
    const todo = rail.children.find(({ className }) => className === "avis-du-todo") ?? assert.fail("no TODO line");
    assert.match(todo.textContent, /1 waits for you/);
    assert.ok(!reads.some((path) => /labels=(chef-todo|question|decision|blocked-on-human)/.test(path)), reads.join("\n"));
    // The old plan is not drawn: no Manager column, no "Rail — ready to cook".
    assert.ok(!rail.dessous("h5").some(({ textContent }) => textContent === "Rail — ready to cook"));
  });
});
