// L'onglet Know-how, posé seul devant un faux document (#4241) : ce que les tests gelés ne disent pas — une lecture qui
// échoue se dit et se relance, une lecture dépassée ne dit plus rien, un geste en route grise les siens, un refus se dit
// sous son entrée et garde le texte tapé, « Cancel » ne change rien, et un geste qui répond après une relecture est oublié.
import assert from "node:assert/strict";
import { test } from "node:test";
import { Fake, repos } from "../../helpers/false-vue.ts";
import { setTheKnowHow, rereadTheKnowHow } from "../../../src/vue/know-how-tab/know-how.js";
import { source } from "../../../src/vue/know-how-tab/source.js";

const doc = { createElement: (balise: string) => new Fake(balise) };
type Entry = { id: string; text: string; ticket: number };
const ENTRIES: Entry[] = [
  { id: "L1", text: "Run the typecheck before pushing.", ticket: 4001 },
  { id: "L2", text: "Never kill a process by name.", ticket: 4002 },
];

// Une fausse source : chaque appel est noté, et ne répond que quand le test le dit.
function falseSource() {
  const calls: unknown[][] = [];
  const waits: { resoudre: (value?: unknown) => void; rejeter: (error: unknown) => void }[] = [];
  const wait = (...args: unknown[]) => {
    calls.push(args);
    return new Promise((resolve, rejeter) => waits.push({ resoudre: resolve, rejeter }));
  };
  Object.assign(source, { lire: (project: string) => wait("lire", project), modifier: (id: string, text: string, project: string) => wait("modifier", id, text, project), retirer: (id: string, project: string) => wait("retirer", id, project) });
  const nextOne = () => waits.shift() ?? assert.fail("aucun appel en attente");
  return {
    appels: calls,
    reussir: async (value?: unknown) => (nextOne().resoudre(value), await repos()),
    echouer: async (message: string, detail = "") => (nextOne().rejeter(Object.assign(new Error(message), { detail })), await repos()),
  };
}

let rank = 0;
// Un projet neuf à chaque test, et l'onglet qu'il pose — reposé à chaque `reposer`, comme la vue le fait.
function tab() {
  const project = `p${++rank}`;
  const seenOne = { section: undefined as Fake | undefined, reposes: 0 };
  const rest = () => {
    seenOne.reposes++;
    seenOne.section = setTheKnowHow(doc, project, rest) as Fake;
  };
  return { projet: project, vu: seenOne, reposer: rest };
}
const all = (section: Fake | undefined) => [...(section?.descendants() ?? [])];
const texts = (section: Fake | undefined) => all(section).filter((n) => n.children.length === 0 && n.textContent !== "").map((n) => n.textContent);
const entries = (section: Fake | undefined) => all(section).filter((n) => n.className === "entree");
const button = (line: Fake | undefined, wording: string) => line?.dessous("button").find((b) => b.textContent === wording) ?? assert.fail(`pas de bouton « ${wording} »`);
const wordings = (line: Fake | undefined) => line?.dessous("button").map((b) => b.textContent) ?? [];

test("never read: posing the tab reads it once, says so meanwhile, then lists each entry with its ticket", async () => {
  const { appels: calls, reussir } = falseSource();
  const { projet: project, vu: seenOne, reposer: rest } = tab();
  rest();
  assert.ok(texts(seenOne.section).includes("Reading the know-how…"));
  rest();
  assert.deepEqual(calls, [["lire", project]], "une seule lecture part");
  await reussir(ENTRIES);
  assert.deepEqual(entries(seenOne.section).map((line) => texts(line)), [
    ["Run the typecheck before pushing.", "from #4001", "edit", "remove"],
    ["Never kill a process by name.", "from #4002", "edit", "remove"],
  ]);
});

test("a reading that fails says so on one line, the detail on hover, and Try again reads again", async () => {
  const { appels: calls, echouer: fail, reussir } = falseSource();
  const { projet: project, vu: seenOne, reposer: rest } = tab();
  rest();
  await fail("know-how unavailable", "$ know-how\nboom");
  const line = all(seenOne.section).find((n) => n.dataset.ligne === "erreur") ?? assert.fail("pas de ligne d'erreur");
  assert.equal(line.dessous("span")[0]?.textContent, "know-how unavailable");
  assert.ok(all(line).some((n) => n.ariaLabel === "$ know-how\nboom" || n.title === "$ know-how\nboom" || n.textContent.includes("boom")), "le détail est au survol");
  button(seenOne.section, "Try again").click();
  await reussir([]);
  assert.deepEqual(calls, [["lire", project], ["lire", project]]);
  assert.ok(texts(seenOne.section).includes("No know-how yet. The project has no entry."));
  assert.deepEqual(seenOne.section?.dessous("button"), []);
});

test("an older reading that answers after a newer one says nothing", async () => {
  const calls: unknown[] = [];
  const answers: ((entries: Entry[]) => void)[] = [];
  Object.assign(source, { lire: (project: string) => (calls.push(project), new Promise<Entry[]>((resolve) => answers.push(resolve))) });
  const { projet: project, vu: seenOne, reposer: rest } = tab();
  rereadTheKnowHow(project, rest);
  rereadTheKnowHow(project, rest);
  answers[1]?.([ENTRIES[1] as Entry]);
  await repos();
  answers[0]?.(ENTRIES);
  await repos();
  assert.deepEqual(calls, [project, project]);
  assert.deepEqual(entries(seenOne.section).map((line) => texts(line)[0]), ["Never kill a process by name."]);
});

test("edit: the text in a field, typed text kept across redraws, save sends it once and greys the gestures meanwhile", async () => {
  const { appels: calls, reussir } = falseSource();
  const { projet: project, vu: seenOne, reposer: rest } = tab();
  rest();
  await reussir(ENTRIES);
  button(entries(seenOne.section)[1], "edit").click();
  const [first, second] = entries(seenOne.section);
  assert.deepEqual(wordings(first), ["edit", "remove"], "l'autre entrée reste fermée");
  assert.deepEqual(wordings(second), ["save", "Cancel"]);
  assert.equal(button(second, "save").className, "recommande", "« save » est le geste recommandé");
  const field = second?.dessous("textarea")[0] ?? assert.fail("pas de champ");
  assert.equal(field.value, "Never kill a process by name.");
  field.value = "Never kill a process by name,\n use its pid.";
  field.declencher("input");
  rest();
  const rests = entries(seenOne.section)[1]?.dessous("textarea")[0] ?? assert.fail("pas de champ reposé");
  assert.equal(rests.value, "Never kill a process by name,\n use its pid.", "le texte tapé tient au rendu suivant");
  assert.equal(rests.dataset.champ, "savoir-faire");
  button(entries(seenOne.section)[1], "save").click();
  assert.deepEqual(calls.at(-1), ["modifier", "L2", "Never kill a process by name,\n use its pid.", project]);
  const inRoute = entries(seenOne.section)[1];
  assert.deepEqual(wordings(inRoute), ["Saving…", "Cancel"]);
  assert.ok(inRoute?.dessous("button").every((b) => b.disabled), "ses gestes sont gris");
  assert.equal(inRoute?.dessous("textarea")[0]?.readOnly, true);
  assert.ok(entries(seenOne.section)[0]?.dessous("button").every((b) => !b.disabled), "ceux de l'autre entrée, non");
  await reussir();
  assert.deepEqual(entries(seenOne.section).map((line) => texts(line)[0]), ["Run the typecheck before pushing.", "Never kill a process by name, use its pid."]);
  assert.deepEqual(wordings(entries(seenOne.section)[1]), ["edit", "remove"]);
});

test("a refused save says its reason under its entry only, and keeps the typed text in the field; Cancel leaves the entry as it was", async () => {
  const { appels: calls, reussir, echouer: fail } = falseSource();
  const { vu: seenOne, reposer: rest } = tab();
  rest();
  await reussir(ENTRIES);
  button(entries(seenOne.section)[0], "edit").click();
  const field = entries(seenOne.section)[0]?.dessous("textarea")[0] ?? assert.fail("pas de champ");
  field.value = "Typed.";
  field.declencher("input");
  button(entries(seenOne.section)[0], "save").click();
  await fail("“L1” is not an entry of the project's know-how", "$ know-how edit L1 Typed.");
  const [first, second] = entries(seenOne.section);
  assert.equal(first?.dessous("textarea")[0]?.value, "Typed.");
  assert.ok(first?.dessous("button").every((b) => !b.disabled));
  assert.ok(all(first).some((n) => n.role === "alert" && n.textContent.includes("“L1” is not an entry of the project's know-how")));
  assert.ok(!all(second).some((n) => n.role === "alert"), "rien sous l'autre entrée");
  button(first, "Cancel").click();
  assert.deepEqual(texts(entries(seenOne.section)[0]), ["Run the typecheck before pushing.", "from #4001", "edit", "remove"]);
  assert.equal(calls.filter(([action]) => action === "modifier").length, 1);
});

test("remove asks first; Cancel keeps the entry, Yes removes it and only it; a refusal keeps it and says why", async () => {
  const { appels: calls, reussir, echouer: fail } = falseSource();
  const { projet: project, vu: seenOne, reposer: rest } = tab();
  rest();
  await reussir(ENTRIES);
  button(entries(seenOne.section)[0], "remove").click();
  assert.ok(texts(entries(seenOne.section)[0]).includes("Remove this entry? No cook will receive it any more."));
  assert.deepEqual(wordings(entries(seenOne.section)[0]), ["Yes, remove", "Cancel"]);
  assert.deepEqual(wordings(entries(seenOne.section)[1]), ["edit", "remove"]);
  button(entries(seenOne.section)[0], "Cancel").click();
  assert.deepEqual(wordings(entries(seenOne.section)[0]), ["edit", "remove"]);
  // Une confirmation ouverte se referme quand une autre entrée s'ouvre.
  button(entries(seenOne.section)[0], "remove").click();
  button(entries(seenOne.section)[1], "edit").click();
  assert.deepEqual(wordings(entries(seenOne.section)[0]), ["edit", "remove"]);
  button(entries(seenOne.section)[0], "remove").click();
  assert.deepEqual(wordings(entries(seenOne.section)[1]), ["edit", "remove"], "et l'entrée ouverte se referme");
  button(entries(seenOne.section)[0], "Yes, remove").click();
  assert.deepEqual(calls.at(-1), ["retirer", "L1", project]);
  await fail("nothing was changed: the runtime's answer could not be read");
  assert.equal(entries(seenOne.section).length, 2);
  assert.ok(all(entries(seenOne.section)[0]).some((n) => n.role === "alert" && n.textContent.includes("could not be read")));
  button(entries(seenOne.section)[0], "Yes, remove").click();
  await reussir();
  assert.deepEqual(entries(seenOne.section).map((line) => texts(line)[0]), ["Never kill a process by name."]);
});

test("a gesture that answers after the tab was read again is forgotten, success or refusal", async () => {
  const { reussir, echouer: fail } = falseSource();
  const { projet: project, vu: seenOne, reposer: rest } = tab();
  rest();
  await reussir(ENTRIES);
  button(entries(seenOne.section)[0], "remove").click();
  button(entries(seenOne.section)[0], "Yes, remove").click();
  button(entries(seenOne.section)[1], "edit").click();
  button(entries(seenOne.section)[1], "save").click();
  rereadTheKnowHow(project, rest);
  await reussir();
  await fail("refused");
  await reussir(ENTRIES);
  assert.deepEqual(entries(seenOne.section).map((line) => texts(line)), [
    ["Run the typecheck before pushing.", "from #4001", "edit", "remove"],
    ["Never kill a process by name.", "from #4002", "edit", "remove"],
  ]);
});
