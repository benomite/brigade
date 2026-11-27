// The project know-how in Settings (#4239, vue/know-how/know-how.js): the entries grouped by section, each with its source
// ticket; the empty state when the file is missing or has no entry; an entry edited — no Save button, the field applies
// on its `change` — or removed, sent to the main process, which proposes it by a pull request. The block is played with the
// app's fake element (helpers/false-vue.ts), then the whole view, as it is.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { forTheBar } from "../../../src/bar.ts";
import { EXAMPLE } from "../../../src/config.ts";
import { PALETTE } from "../../../src/colors.ts";
import { BANNER, holdFacts, type Facts } from "../../../src/facts.ts";
import { TABS, HEADINGS } from "../../../src/tabs.ts";
import { EFFORTS, MODELS } from "../../../src/projects/projects.ts";
import { PROPOSES } from "../../../src/settings-of-project.ts";
import type { ChangeOfKnowledge, ReadOfKnowledge, RenderedOfKnowledge } from "../../../src/vue/know-how/know-how-github.ts";
import { holdTheKnowledge } from "../../../src/vue/know-how/know-how.js";
import { Fake, playTheVue, openTab, openRead, repos, type Played } from "../../helpers/false-vue.ts";

const doc = { createElement: (balise: string) => new Fake(balise) };
const PR = "https://github.com/chef/parade/pull/77";

const READING: Extract<ReadOfKnowledge, { entries: unknown }> = {
  depot: "chef/parade",
  branche: "main",
  vide: false,
  entries: [
    { section: "Conventions", text: "Tests live next to the code", ticket: 101, line: 3, file: ".brigade/know-how.md" },
    { section: "Conventions", text: "Identifiers are in French", ticket: 102, line: 4, file: ".brigade/know-how.md" },
    { section: "Pitfalls", text: "Never run the pass with a dirty tree", ticket: 205, line: 7, file: ".brigade/know-how.md" },
    { section: "Tools", text: "Use `gh api` for rate limits", ticket: 310, line: 10, file: ".brigade/know-how.md" },
    { section: "Tools", text: "A tool nobody ticketed", ticket: null, line: 11, file: ".brigade/know-how.md" },
  ],
};
const EMPTY_READ: ReadOfKnowledge = { depot: "chef/parade", branche: "main", vide: true, entries: [] };

const sections = (block: Fake) => block.dessous("div").filter(({ className }) => className === "section-du-savoir");
const entries = (block: Fake) => block.dessous("li").filter(({ className }) => className === "entree-du-savoir");
const entry = (block: Fake, line: number) => entries(block).find(({ dataset }) => dataset.ligne === String(line)) ?? assert.fail(`no entry at line ${line}`);
const buttonOf = (root: Fake, wording: string) => root.dessous("button").find(({ textContent }) => textContent === wording) ?? assert.fail(`no ${wording}`);
const fieldOf = (root: Fake) => root.dessous("input")[0] ?? assert.fail("no field");
// What each entry shows: its text — or its field —, then its ticket.
const readOne = (block: Fake) => sections(block).map((part) => [part.dataset.section, part.dessous("h4")[0]?.textContent, entries(part).map((li) => li.children.slice(0, 2).map((pose) => pose.textContent))]);

const IN_PROGRESS = "opening the pull request…";
// The block as Settings draws it: held by `tenirLeSavoir`, the reading done; `changer` answers each change sent.
async function hold(reading: ReadOfKnowledge | undefined, change: (c: ChangeOfKnowledge) => Promise<RenderedOfKnowledge | undefined> = async () => undefined) {
  const sent: ChangeOfKnowledge[] = [];
  const openEntries: string[] = [];
  const held = holdTheKnowledge(doc, { lire: async () => reading, changer: (c) => (sent.push(c), change(c)), ouvrir: (url) => void openEntries.push(url), reposer: () => {}, maintenant: () => 0 });
  held.poser();
  await repos();
  return { poser: (): Fake => held.poser(), envoyes: sent, ouvertes: openEntries };
}
const never = () => new Promise<never>(() => {});

describe("the know-how block", () => {
  test("every entry, grouped by section, with its source ticket — `no source ticket` for a line without one", async () => {
    const block = (await hold(READING)).poser();
    assert.equal(block.dataset.bloc, "know-how");
    assert.match(block.dessous("h3")[0]?.textContent ?? "", /^Project know-how/);
    assert.deepEqual(readOne(block), [
      [
        "Conventions",
        "Conventions2",
        [
          ["Tests live next to the code", "#101"],
          ["Identifiers are in French", "#102"],
        ],
      ],
      ["Pitfalls", "Pitfalls1", [["Never run the pass with a dirty tree", "#205"]]],
      [
        "Tools",
        "Tools2",
        [
          ["Use `gh api` for rate limits", "#310"],
          ["A tool nobody ticketed", "no source ticket"],
        ],
      ],
    ]);
    assert.deepEqual(
      entries(block).map((li) => li.dessous("button").map(({ textContent }) => textContent)),
      Array.from({ length: 5 }, () => ["Edit", "Remove"]),
    );
    assert.equal(block.dessous("p").filter(({ dataset }) => dataset.ligne === "vide").length, 0);
    assert.deepEqual(
      entries(block).map((li) => li.children[1]?.className),
      ["ticket mono", "ticket mono", "ticket mono", "ticket mono", "ticket sans"],
    );
  });

  test("the file's three sections first, whatever their order in it; then any other, and the entries outside any section", async () => {
    const block = (
      await hold({
        ...READING,
        entries: [
          { section: "", text: "Loose", ticket: 1, line: 0, file: ".brigade/know-how.md" },
          { section: "Tools", text: "A tool", ticket: 2, line: 2, file: ".brigade/know-how.md" },
          { section: "Extra", text: "Other", ticket: 3, line: 4, file: ".brigade/know-how.md" },
          { section: "Pitfalls", text: "A pitfall", ticket: 4, line: 6, file: ".brigade/know-how.md" },
          { section: "Conventions", text: "A convention", ticket: 5, line: 8, file: ".brigade/know-how.md" },
        ],
      })
    ).poser();
    assert.deepEqual(
      sections(block).map((part) => part.dessous("h4")[0]?.textContent),
      ["Conventions1", "Pitfalls1", "Tools1", "Outside any section1", "Extra1"],
    );
  });

  test("a missing or empty file is one empty line, not an error and not a list", async () => {
    const block = (await hold(EMPTY_READ)).poser();
    const empty = block.dessous("p").filter(({ dataset }) => dataset.ligne === "vide");
    assert.equal(empty.length, 1);
    assert.match(empty[0]?.textContent ?? "", /^No project know-how yet\. \.brigade\/know-how\.md is missing or has no entry\./);
    assert.deepEqual(sections(block), []);
    assert.deepEqual(block.dessous("button").filter(({ textContent }) => /^(Edit|Remove)$/.test(textContent)), []);
    assert.equal([...block.descendants()].filter(({ className }) => /erreur/.test(className)).length, 0);
  });

  test("unread, a line says it reads; unreadable, the error line says why", async () => {
    const reading = holdTheKnowledge(doc, { lire: never, changer: never, ouvrir: () => {}, reposer: () => {} });
    assert.match((reading.poser() as Fake).textContent, /Reading the project know-how…/);
    const without = (await hold({ sans: "The project know-how not reached.", detail: "HTTP 500" })).poser();
    assert.match(without.textContent, /The project know-how not reached\./);
    assert.deepEqual(sections(without), []);
  });

  test("Edit opens the field with the entry's text; its `change` proposes the new text, with the line and the text it replaces", async () => {
    const { poser: set, envoyes: sent } = await hold(READING, never);
    buttonOf(entry(set(), 7), "Edit").click();
    const block = set();
    const line = entry(block, 7);
    const field = fieldOf(line);
    assert.equal(field.value, "Never run the pass with a dirty tree");
    assert.equal((field as Fake & { spellcheck?: boolean }).spellcheck, false);
    assert.equal(line.dessous("button").length, 0, "no Save, no Edit while the field is open");
    assert.equal(fieldOf(block), field, "one field: the other entries stay as they are");
    field.value = "  Never run the pass on a dirty worktree ";
    field.declencher("input");
    assert.equal(fieldOf(set()).value, "  Never run the pass on a dirty worktree ");
    fieldOf(set()).declencher("change");
    assert.deepEqual(sent, [{ kind: "edit", line: 7, text: "Never run the pass on a dirty worktree", avant: "Never run the pass with a dirty tree" }]);
  });

  test("the field left as it was, emptied, or Escape closes it and proposes nothing; Enter alone does not", async () => {
    for (const [value, event, key] of [
      [" Identifiers are in French", "change", undefined],
      ["   ", "change", undefined],
      ["Changed", "keydown", "Escape"],
    ] as const) {
      const { poser: set, envoyes: sent } = await hold(READING);
      buttonOf(entry(set(), 4), "Edit").click();
      const field = fieldOf(entry(set(), 4));
      field.value = value;
      field.declencher(event, key === undefined ? {} : ({ key: key } as object));
      assert.equal(entry(set(), 4).dessous("input").length, 0, JSON.stringify(value));
      assert.deepEqual(sent, []);
    }
    const { poser: set } = await hold(READING);
    buttonOf(entry(set(), 4), "Edit").click();
    fieldOf(entry(set(), 4)).declencher("keydown", { key: "Enter" } as object);
    assert.equal(entry(set(), 4).dessous("input").length, 1);
  });

  test("Remove proposes the removal of that line; while a change is on its way, its row waits and sends nothing", async () => {
    const { poser: set, envoyes: sent } = await hold(READING, never);
    buttonOf(entry(set(), 11), "Remove").click();
    assert.deepEqual(sent, [{ kind: "remove", line: 11, avant: "A tool nobody ticketed" }]);
    const line = entry(set(), 11);
    assert.match(line.textContent, new RegExp(IN_PROGRESS));
    for (const wording of ["Edit", "Remove"]) {
      const click = buttonOf(line, wording);
      assert.equal(click.disabled, true, wording);
      click.declencher("click");
    }
    assert.equal(sent.length, 1);
    assert.equal(buttonOf(entry(set(), 10), "Remove").disabled, false, "the other rows stay free");
    buttonOf(entry(set(), 10), "Edit").click();
    const field = fieldOf(entry(set(), 10));
    field.value = "Use the rate limit API";
    field.declencher("change");
    assert.equal(fieldOf(entry(set(), 10)).disabled, true);
    assert.equal(sent.length, 2);
  });

  test("the pull request opened is said under its row, and opens; a refusal is said there", async () => {
    const { poser: set, ouvertes: openEntries } = await hold(READING, async (c) =>
      c.line === 7 ? { refus: "nothing was proposed: the entry already says so", detail: "" } : { propose: PROPOSES, kind: c.kind, pr: PR, numero: c.line === 3 ? 77 : 78 },
    );
    buttonOf(entry(set(), 3), "Edit").click();
    const field = fieldOf(entry(set(), 3));
    field.value = "Tests live beside the code";
    field.declencher("change");
    buttonOf(entry(set(), 4), "Remove").click();
    buttonOf(entry(set(), 7), "Remove").click();
    await repos();
    const block = set();
    assert.match(entry(block, 3).textContent, /the new text proposed in/);
    assert.match(entry(block, 4).textContent, /the removal proposed in/);
    buttonOf(entry(block, 3), "pull request #77").click();
    assert.deepEqual(openEntries, [PR]);
    assert.match(entry(block, 7).textContent, /nothing was proposed: the entry already says so/);
  });
});

describe("the know-how held between two drawings", () => {
  test("read when shown, at most once a minute; a reading that fails or gives nothing says so", async () => {
    let now = 1_000_000;
    const readings: number[] = [];
    let answer: () => Promise<ReadOfKnowledge | undefined> = async () => READING;
    const guards: unknown[] = [];
    const held = holdTheKnowledge(doc, { lire: () => (readings.push(now), answer()), changer: async () => undefined, ouvrir: () => {}, reposer: (keep) => guards.push(keep), maintenant: () => now });
    assert.match(held.poser().textContent, /Reading the project know-how…/);
    await repos();
    assert.deepEqual(guards, [true], "a reading does not draw over a field being typed in");
    assert.equal(entries(held.poser()).length, 5);
    now += 60_000;
    held.poser();
    assert.equal(readings.length, 1);
    now += 1;
    answer = async () => {
      throw new Error("the bridge broke");
    };
    held.poser();
    await repos();
    assert.equal(readings.length, 2);
    assert.match(held.poser().textContent, /The project know-how not reached\./);
    now += 60_001;
    answer = async () => undefined;
    held.poser();
    await repos();
    assert.match(held.poser().textContent, /The project know-how not reached\./);
    assert.equal(readings.length, 3);
  });

  test("a reading still on its way is not asked again", async () => {
    let now = 0;
    const readings: number[] = [];
    const held = holdTheKnowledge(doc, { lire: () => (readings.push(now), new Promise(() => {})), changer: async () => undefined, ouvrir: () => {}, reposer: () => {}, maintenant: () => now });
    held.poser();
    now += 120_000;
    held.poser();
    await repos();
    assert.equal(readings.length, 1);
  });

  test("an edit: opened, typed, sent; the row waits, then says the pull request; a refusal keeps what was typed", async () => {
    const sent: ChangeOfKnowledge[] = [];
    let rendered: RenderedOfKnowledge | undefined = { propose: PROPOSES, kind: "edit", pr: PR, numero: 77 };
    let rested = 0;
    const held = holdTheKnowledge(doc, { lire: async () => READING, changer: async (c) => (sent.push(c), rendered), ouvrir: () => {}, reposer: () => void (rested += 1), maintenant: () => 0 });
    held.poser();
    await repos();
    buttonOf(entry(held.poser(), 7), "Edit").click();
    let field = fieldOf(entry(held.poser(), 7));
    assert.equal(field.value, "Never run the pass with a dirty tree");
    field.value = "Never run the pass on a dirty worktree";
    field.declencher("input");
    assert.equal(fieldOf(entry(held.poser(), 7)).value, "Never run the pass on a dirty worktree", "what is typed is kept from one drawing to the next");
    fieldOf(entry(held.poser(), 7)).declencher("change");
    assert.match(entry(held.poser(), 7).textContent, new RegExp(IN_PROGRESS));
    await repos();
    assert.deepEqual(sent, [{ kind: "edit", line: 7, text: "Never run the pass on a dirty worktree", avant: "Never run the pass with a dirty tree" }]);
    const after = entry(held.poser(), 7);
    assert.match(after.textContent, /^Never run the pass with a dirty tree#205/, "the text in force stays until the merge");
    assert.match(after.textContent, /pull request #77/);

    rendered = { refus: "nothing was proposed: GitHub refused", detail: "HTTP 422" };
    buttonOf(entry(held.poser(), 4), "Edit").click();
    field = fieldOf(entry(held.poser(), 4));
    field.value = "Identifiers are in English";
    field.declencher("input");
    field.declencher("change");
    await repos();
    const refuses = entry(held.poser(), 4);
    assert.equal(fieldOf(refuses).value, "Identifiers are in English");
    assert.match(refuses.textContent, /nothing was proposed: GitHub refused/);

    rendered = undefined;
    buttonOf(entry(held.poser(), 11), "Remove").click();
    await repos();
    assert.match(entry(held.poser(), 11).textContent, /nothing was proposed: nothing was sent/);
    assert.ok(rested > 0);
  });

  test("a change the bridge throws on is said under its row; Escape closes an edit", async () => {
    const held = holdTheKnowledge(doc, {
      lire: async () => READING,
      changer: async () => {
        throw new Error("no bridge");
      },
      ouvrir: () => {},
      reposer: () => {},
      maintenant: () => 0,
    });
    held.poser();
    await repos();
    buttonOf(entry(held.poser(), 3), "Remove").click();
    await repos();
    assert.match(entry(held.poser(), 3).textContent, /nothing was proposed: nothing was sent/);
    buttonOf(entry(held.poser(), 4), "Edit").click();
    fieldOf(entry(held.poser(), 4)).declencher("keydown", { key: "Escape" } as object);
    assert.equal(entry(held.poser(), 4).dessous("input").length, 0);
  });

  test("a new reading forgets what was said of the old lines, but not of a change on its way", async () => {
    let reading: ReadOfKnowledge = READING;
    let now = 0;
    const held = holdTheKnowledge(doc, { lire: async () => reading, changer: async () => ({ refus: "nothing was proposed: x" }), ouvrir: () => {}, reposer: () => {}, maintenant: () => now });
    held.poser();
    await repos();
    buttonOf(entry(held.poser(), 3), "Remove").click();
    await repos();
    assert.match(entry(held.poser(), 3).textContent, /nothing was proposed: x/);
    now += 60_001;
    held.poser();
    await repos();
    assert.match(entry(held.poser(), 3).textContent, /nothing was proposed: x/, "the same reading keeps it");
    reading = { ...READING, entries: READING.entries.slice(1).map((e) => ({ ...e, line: e.line - 1 })) };
    now += 60_001;
    held.poser();
    await repos();
    assert.doesNotMatch(held.poser().textContent, /nothing was proposed/);
  });
});

const startup = () => ({
  configuration: forTheBar({ chemin: "/tmp/app.json", projets: [{ nom: "parade", dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE,
  exemple: EXAMPLE,
  onglets: TABS,
  rubriques: HEADINGS,
  gestes: {},
  banniere: BANNER,
  calibrage: { modeles: MODELS, efforts: EFFORTS },
  code: undefined,
});

async function play(reading: ReadOfKnowledge): Promise<{ vue: Played; envoyes: unknown[][] }> {
  const sent: unknown[][] = [];
  const vue = await playTheVue({
    demarrage: startup,
    espace: () => [],
    machines: () => [],
    savoirDuProjet: async () => reading,
    changerLeSavoir: async (project, change): Promise<RenderedOfKnowledge> => {
      sent.push([project, change]);
      return { propose: PROPOSES, kind: change.kind, pr: PR, numero: 77 };
    },
  });
  (vue.element("projets").children.at(1) ?? assert.fail("no tile for parade")).click();
  await repos();
  await openTab(vue, "Know-how");
  return { vue, envoyes: sent };
}
// A reading of the rail arriving from outside (the 15 s timer, a hover, a read): it redraws the rail.
const FACTS_OF_RAIL = holdFacts(() => new Map()).recevoir({
  projet: "parade",
  demande: 0,
  a: "2026-11-27T10:00:00.000Z",
  sorties: [{ commande: "facts", texte: JSON.stringify({ etat: "ouverte", lu: "2026-11-27T10:00:00.000Z", dernierTick: "2026-11-27T10:00:00.000Z", compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 }, dernierEvenement: null, rail: [], cooks: [], attend: [] } satisfies Facts) }],
});
const blockOf = (vue: Played) => vue.element("rail").dessous("section").find(({ dataset }) => dataset.bloc === "know-how") ?? assert.fail("no know-how block in the Know-how tab");

describe("the know-how, in the view", () => {
  test("Settings no longer shows the know-how block", async () => {
    const { vue } = await play(READING);
    await openRead(vue, "Settings");
    assert.equal(vue.element("bandeau-sante").dessous("section").some(({ dataset }) => dataset.bloc === "know-how"), false);
  });

  test("the Know-how tab reads the project's know-how from the main process and lists every entry with its section and ticket", async () => {
    const { vue } = await play(READING);
    assert.deepEqual(vue.dernier("savoirDuProjet"), ["parade"]);
    assert.equal(vue.element("rail").dataset.onglet, "know-how");
    assert.deepEqual(readOne(blockOf(vue)).map(([section]) => section), ["Conventions", "Pitfalls", "Tools"]);
    assert.equal(entries(blockOf(vue)).length, 5);
    assert.match(entry(blockOf(vue), 11).textContent, /A tool nobody ticketedno source ticket/);
  });

  test("an empty file shows the empty line in the Know-how tab", async () => {
    const { vue } = await play(EMPTY_READ);
    assert.match(blockOf(vue).textContent, /No project know-how yet\. \.brigade\/know-how\.md is missing or has no entry\./);
    assert.equal(entries(blockOf(vue)).length, 0);
  });

  test("Remove and an edit go to the main process, and the row says the pull request; no Save button anywhere", async () => {
    const { vue, envoyes: sent } = await play(READING);
    buttonOf(entry(blockOf(vue), 4), "Remove").click();
    await repos();
    assert.deepEqual(sent, [["parade", { kind: "remove", line: 4, avant: "Identifiers are in French" }]]);
    assert.match(entry(blockOf(vue), 4).textContent, /pull request #77/);
    buttonOf(entry(blockOf(vue), 7), "Edit").click();
    const field = fieldOf(entry(blockOf(vue), 7));
    field.value = "Never run the pass on a dirty worktree";
    field.declencher("change");
    await repos();
    assert.deepEqual(sent[1], ["parade", { kind: "edit", line: 7, text: "Never run the pass on a dirty worktree", avant: "Never run the pass with a dirty tree" }]);
    assert.deepEqual(blockOf(vue).dessous("button").filter(({ textContent }) => /^(save|saving…)$/i.test(textContent)), []);
  });

  test("a redraw of the rail from outside leaves the field being typed in where it is; the block's own gestures still redraw it", async () => {
    const { vue } = await play(READING);
    buttonOf(entry(blockOf(vue), 7), "Edit").click();
    const field = fieldOf(entry(blockOf(vue), 7));
    field.value = "Never run the pass on a dirty worktree";
    field.declencher("input");
    const active = document as unknown as { activeElement: unknown };
    const outside = async () => {
      vue.dire("surFaits", { ...FACTS_OF_RAIL, demande: vue.appels.filter(({ geste }) => geste === "faits" || geste === "relireBox").at(-1)?.args[0] as number });
      await repos();
    };
    active.activeElement = undefined;
    await outside();
    assert.notEqual(fieldOf(entry(blockOf(vue), 7)), field, "control: with no field in hand, an outside redraw does replace the block");
    const again = fieldOf(entry(blockOf(vue), 7));
    active.activeElement = again;
    try {
      await outside();
      assert.equal(fieldOf(entry(blockOf(vue), 7)), again, "the field the chef is typing in stays in the rail");
      assert.equal(blockOf(vue).dessous("input").length, 1);
      again.declencher("keydown", { key: "Escape" } as object);
      assert.equal(entry(blockOf(vue), 7).dessous("input").length, 0, "its own gesture redraws it");
    } finally {
      active.activeElement = undefined;
    }
  });
});
