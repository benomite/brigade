// The project know-how in Settings (#4239, vue/know-how/know-how.js): the entries grouped by section, each with its source
// ticket; the empty state when the file is missing or has no entry; an entry edited — no Save button, the field applies
// on its `change` — or removed, sent to the main process, which proposes it by a pull request. The block is played with the
// app's fake element (aides/fausse-vue.ts), then the whole view, as it is.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ALLUMAGE } from "../../../src/allumage.ts";
import { pourLaBar } from "../../../src/bar.ts";
import { EXEMPLE } from "../../../src/config.ts";
import { PALETTE } from "../../../src/couleurs.ts";
import { KITCHEN_ACTIONS } from "../../../src/kitchen.ts";
import { BANNIERE } from "../../../src/facts.ts";
import { CONFIRMES, DIRECTS } from "../../../src/actions.ts";
import { ONGLETS, RUBRIQUES } from "../../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../../src/projects/projects.ts";
import { PROPOSE } from "../../../src/settings-du-project.ts";
import type { ChangementDuSavoir, ReadDuSavoir, RenduDuSavoir } from "../../../src/vue/know-how/know-how-github.ts";
import { holdLeSavoir } from "../../../src/vue/know-how/know-how.js";
import { Faux, jouerLaVue, ouvrirRead, repos, type Jouee } from "../../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const PR = "https://github.com/chef/parade/pull/77";

const READ: ReadDuSavoir = {
  depot: "chef/parade",
  branche: "main",
  vide: false,
  entries: [
    { section: "Conventions", text: "Tests live next to the code", ticket: 101, line: 3 },
    { section: "Conventions", text: "Identifiers are in French", ticket: 102, line: 4 },
    { section: "Pitfalls", text: "Never run the pass with a dirty tree", ticket: 205, line: 7 },
    { section: "Tools", text: "Use `gh api` for rate limits", ticket: 310, line: 10 },
    { section: "Tools", text: "A tool nobody ticketed", ticket: null, line: 11 },
  ],
};
const EMPTY_LU: ReadDuSavoir = { depot: "chef/parade", branche: "main", vide: true, entries: [] };

const sections = (bloc: Faux) => bloc.dessous("div").filter(({ className }) => className === "section-du-savoir");
const entrees = (bloc: Faux) => bloc.dessous("li").filter(({ className }) => className === "entree-du-savoir");
const entree = (bloc: Faux, line: number) => entrees(bloc).find(({ dataset }) => dataset.ligne === String(line)) ?? assert.fail(`no entry at line ${line}`);
const buttonDe = (racine: Faux, libelle: string) => racine.dessous("button").find(({ textContent }) => textContent === libelle) ?? assert.fail(`no ${libelle}`);
const champDe = (racine: Faux) => racine.dessous("input")[0] ?? assert.fail("no field");
// What each entry shows: its text — or its field —, then its ticket.
const lu = (bloc: Faux) => sections(bloc).map((partie) => [partie.dataset.section, partie.dessous("h4")[0]?.textContent, entrees(partie).map((li) => li.children.slice(0, 2).map((pose) => pose.textContent))]);

const EN_COURS = "opening the pull request…";
// The block as Settings draws it: held by `tenirLeSavoir`, the reading done; `changer` answers each change sent.
async function hold(read: ReadDuSavoir | undefined, changer: (c: ChangementDuSavoir) => Promise<RenduDuSavoir | undefined> = async () => undefined) {
  const envoyes: ChangementDuSavoir[] = [];
  const ouvertes: string[] = [];
  const tenu = holdLeSavoir(doc, { lire: async () => read, changer: (c) => (envoyes.push(c), changer(c)), ouvrir: (url) => void ouvertes.push(url), reposer: () => {}, maintenant: () => 0 });
  tenu.poser();
  await repos();
  return { poser: (): Faux => tenu.poser(), envoyes, ouvertes };
}
const jamais = () => new Promise<never>(() => {});

describe("the know-how block", () => {
  test("every entry, grouped by section, with its source ticket — `no source ticket` for a line without one", async () => {
    const bloc = (await hold(READ)).poser();
    assert.equal(bloc.dataset.bloc, "know-how");
    assert.match(bloc.dessous("h3")[0]?.textContent ?? "", /^Project know-how/);
    assert.deepEqual(lu(bloc), [
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
      entrees(bloc).map((li) => li.dessous("button").map(({ textContent }) => textContent)),
      Array.from({ length: 5 }, () => ["Edit", "Remove"]),
    );
    assert.equal(bloc.dessous("p").filter(({ dataset }) => dataset.ligne === "vide").length, 0);
    assert.deepEqual(
      entrees(bloc).map((li) => li.children[1]?.className),
      ["ticket mono", "ticket mono", "ticket mono", "ticket mono", "ticket sans"],
    );
  });

  test("the file's three sections first, whatever their order in it; then any other, and the entries outside any section", async () => {
    const bloc = (
      await hold({
        ...READ,
        entries: [
          { section: "", text: "Loose", ticket: 1, line: 0 },
          { section: "Tools", text: "A tool", ticket: 2, line: 2 },
          { section: "Extra", text: "Other", ticket: 3, line: 4 },
          { section: "Pitfalls", text: "A pitfall", ticket: 4, line: 6 },
          { section: "Conventions", text: "A convention", ticket: 5, line: 8 },
        ],
      })
    ).poser();
    assert.deepEqual(
      sections(bloc).map((partie) => partie.dessous("h4")[0]?.textContent),
      ["Conventions1", "Pitfalls1", "Tools1", "Outside any section1", "Extra1"],
    );
  });

  test("a missing or empty file is one empty line, not an error and not a list", async () => {
    const bloc = (await hold(EMPTY_LU)).poser();
    const empty = bloc.dessous("p").filter(({ dataset }) => dataset.ligne === "vide");
    assert.equal(empty.length, 1);
    assert.match(empty[0]?.textContent ?? "", /^No project know-how yet\. \.brigade\/know-how\.md is missing or has no entry\./);
    assert.deepEqual(sections(bloc), []);
    assert.deepEqual(bloc.dessous("button").filter(({ textContent }) => /^(Edit|Remove)$/.test(textContent)), []);
    assert.equal([...bloc.descendants()].filter(({ className }) => /erreur/.test(className)).length, 0);
  });

  test("unread, a line says it reads; unreadable, the error line says why", async () => {
    const read = holdLeSavoir(doc, { lire: jamais, changer: jamais, ouvrir: () => {}, reposer: () => {} });
    assert.match((read.poser() as Faux).textContent, /Reading the project know-how…/);
    const sans = (await hold({ sans: "The project know-how not reached.", detail: "HTTP 500" })).poser();
    assert.match(sans.textContent, /The project know-how not reached\./);
    assert.deepEqual(sections(sans), []);
  });

  test("Edit opens the field with the entry's text; its `change` proposes the new text, with the line and the text it replaces", async () => {
    const { poser, envoyes } = await hold(READ, jamais);
    buttonDe(entree(poser(), 7), "Edit").click();
    const bloc = poser();
    const line = entree(bloc, 7);
    const champ = champDe(line);
    assert.equal(champ.value, "Never run the pass with a dirty tree");
    assert.equal((champ as Faux & { spellcheck?: boolean }).spellcheck, false);
    assert.equal(line.dessous("button").length, 0, "no Save, no Edit while the field is open");
    assert.equal(champDe(bloc), champ, "one field: the other entries stay as they are");
    champ.value = "  Never run the pass on a dirty worktree ";
    champ.declencher("input");
    assert.equal(champDe(poser()).value, "  Never run the pass on a dirty worktree ");
    champDe(poser()).declencher("change");
    assert.deepEqual(envoyes, [{ kind: "edit", line: 7, text: "Never run the pass on a dirty worktree", avant: "Never run the pass with a dirty tree" }]);
  });

  test("the field left as it was, emptied, or Escape closes it and proposes nothing; Enter alone does not", async () => {
    for (const [valeur, event, cle] of [
      [" Identifiers are in French", "change", undefined],
      ["   ", "change", undefined],
      ["Changed", "keydown", "Escape"],
    ] as const) {
      const { poser, envoyes } = await hold(READ);
      buttonDe(entree(poser(), 4), "Edit").click();
      const champ = champDe(entree(poser(), 4));
      champ.value = valeur;
      champ.declencher(event, cle === undefined ? {} : ({ key: cle } as object));
      assert.equal(entree(poser(), 4).dessous("input").length, 0, JSON.stringify(valeur));
      assert.deepEqual(envoyes, []);
    }
    const { poser } = await hold(READ);
    buttonDe(entree(poser(), 4), "Edit").click();
    champDe(entree(poser(), 4)).declencher("keydown", { key: "Enter" } as object);
    assert.equal(entree(poser(), 4).dessous("input").length, 1);
  });

  test("Remove proposes the removal of that line; while a change is on its way, its row waits and sends nothing", async () => {
    const { poser, envoyes } = await hold(READ, jamais);
    buttonDe(entree(poser(), 11), "Remove").click();
    assert.deepEqual(envoyes, [{ kind: "remove", line: 11, avant: "A tool nobody ticketed" }]);
    const line = entree(poser(), 11);
    assert.match(line.textContent, new RegExp(EN_COURS));
    for (const libelle of ["Edit", "Remove"]) {
      const clic = buttonDe(line, libelle);
      assert.equal(clic.disabled, true, libelle);
      clic.declencher("click");
    }
    assert.equal(envoyes.length, 1);
    assert.equal(buttonDe(entree(poser(), 10), "Remove").disabled, false, "the other rows stay free");
    buttonDe(entree(poser(), 10), "Edit").click();
    const champ = champDe(entree(poser(), 10));
    champ.value = "Use the rate limit API";
    champ.declencher("change");
    assert.equal(champDe(entree(poser(), 10)).disabled, true);
    assert.equal(envoyes.length, 2);
  });

  test("the pull request opened is said under its row, and opens; a refusal is said there", async () => {
    const { poser, ouvertes } = await hold(READ, async (c) =>
      c.line === 7 ? { refus: "nothing was proposed: the entry already says so", detail: "" } : { propose: PROPOSE, kind: c.kind, pr: PR, numero: c.line === 3 ? 77 : 78 },
    );
    buttonDe(entree(poser(), 3), "Edit").click();
    const champ = champDe(entree(poser(), 3));
    champ.value = "Tests live beside the code";
    champ.declencher("change");
    buttonDe(entree(poser(), 4), "Remove").click();
    buttonDe(entree(poser(), 7), "Remove").click();
    await repos();
    const bloc = poser();
    assert.match(entree(bloc, 3).textContent, /the new text proposed in/);
    assert.match(entree(bloc, 4).textContent, /the removal proposed in/);
    buttonDe(entree(bloc, 3), "pull request #77").click();
    assert.deepEqual(ouvertes, [PR]);
    assert.match(entree(bloc, 7).textContent, /nothing was proposed: the entry already says so/);
  });
});

describe("the know-how held between two drawings", () => {
  test("read when shown, at most once a minute; a reading that fails or gives nothing says so", async () => {
    let maintenant = 1_000_000;
    const lectures: number[] = [];
    let answer: () => Promise<ReadDuSavoir | undefined> = async () => READ;
    const gardes: unknown[] = [];
    const tenu = holdLeSavoir(doc, { lire: () => (lectures.push(maintenant), answer()), changer: async () => undefined, ouvrir: () => {}, reposer: (garder) => gardes.push(garder), maintenant: () => maintenant });
    assert.match(tenu.poser().textContent, /Reading the project know-how…/);
    await repos();
    assert.deepEqual(gardes, [true], "a reading does not draw over a field being typed in");
    assert.equal(entrees(tenu.poser()).length, 5);
    maintenant += 60_000;
    tenu.poser();
    assert.equal(lectures.length, 1);
    maintenant += 1;
    answer = async () => {
      throw new Error("the bridge broke");
    };
    tenu.poser();
    await repos();
    assert.equal(lectures.length, 2);
    assert.match(tenu.poser().textContent, /The project know-how not reached\./);
    maintenant += 60_001;
    answer = async () => undefined;
    tenu.poser();
    await repos();
    assert.match(tenu.poser().textContent, /The project know-how not reached\./);
    assert.equal(lectures.length, 3);
  });

  test("a reading still on its way is not asked again", async () => {
    let maintenant = 0;
    const lectures: number[] = [];
    const tenu = holdLeSavoir(doc, { lire: () => (lectures.push(maintenant), new Promise(() => {})), changer: async () => undefined, ouvrir: () => {}, reposer: () => {}, maintenant: () => maintenant });
    tenu.poser();
    maintenant += 120_000;
    tenu.poser();
    await repos();
    assert.equal(lectures.length, 1);
  });

  test("an edit: opened, typed, sent; the row waits, then says the pull request; a refusal keeps what was typed", async () => {
    const envoyes: ChangementDuSavoir[] = [];
    let rendu: RenduDuSavoir | undefined = { propose: PROPOSE, kind: "edit", pr: PR, numero: 77 };
    let reposes = 0;
    const tenu = holdLeSavoir(doc, { lire: async () => READ, changer: async (c) => (envoyes.push(c), rendu), ouvrir: () => {}, reposer: () => void (reposes += 1), maintenant: () => 0 });
    tenu.poser();
    await repos();
    buttonDe(entree(tenu.poser(), 7), "Edit").click();
    let champ = champDe(entree(tenu.poser(), 7));
    assert.equal(champ.value, "Never run the pass with a dirty tree");
    champ.value = "Never run the pass on a dirty worktree";
    champ.declencher("input");
    assert.equal(champDe(entree(tenu.poser(), 7)).value, "Never run the pass on a dirty worktree", "what is typed is kept from one drawing to the next");
    champDe(entree(tenu.poser(), 7)).declencher("change");
    assert.match(entree(tenu.poser(), 7).textContent, new RegExp(EN_COURS));
    await repos();
    assert.deepEqual(envoyes, [{ kind: "edit", line: 7, text: "Never run the pass on a dirty worktree", avant: "Never run the pass with a dirty tree" }]);
    const apres = entree(tenu.poser(), 7);
    assert.match(apres.textContent, /^Never run the pass with a dirty tree#205/, "the text in force stays until the merge");
    assert.match(apres.textContent, /pull request #77/);

    rendu = { refus: "nothing was proposed: GitHub refused", detail: "HTTP 422" };
    buttonDe(entree(tenu.poser(), 4), "Edit").click();
    champ = champDe(entree(tenu.poser(), 4));
    champ.value = "Identifiers are in English";
    champ.declencher("input");
    champ.declencher("change");
    await repos();
    const refuse = entree(tenu.poser(), 4);
    assert.equal(champDe(refuse).value, "Identifiers are in English");
    assert.match(refuse.textContent, /nothing was proposed: GitHub refused/);

    rendu = undefined;
    buttonDe(entree(tenu.poser(), 11), "Remove").click();
    await repos();
    assert.match(entree(tenu.poser(), 11).textContent, /nothing was proposed: nothing was sent/);
    assert.ok(reposes > 0);
  });

  test("a change the bridge throws on is said under its row; Escape closes an edit", async () => {
    const tenu = holdLeSavoir(doc, {
      lire: async () => READ,
      changer: async () => {
        throw new Error("no bridge");
      },
      ouvrir: () => {},
      reposer: () => {},
      maintenant: () => 0,
    });
    tenu.poser();
    await repos();
    buttonDe(entree(tenu.poser(), 3), "Remove").click();
    await repos();
    assert.match(entree(tenu.poser(), 3).textContent, /nothing was proposed: nothing was sent/);
    buttonDe(entree(tenu.poser(), 4), "Edit").click();
    champDe(entree(tenu.poser(), 4)).declencher("keydown", { key: "Escape" } as object);
    assert.equal(entree(tenu.poser(), 4).dessous("input").length, 0);
  });

  test("a new reading forgets what was said of the old lines, but not of a change on its way", async () => {
    let read: ReadDuSavoir = READ;
    let maintenant = 0;
    const tenu = holdLeSavoir(doc, { lire: async () => read, changer: async () => ({ refus: "nothing was proposed: x" }), ouvrir: () => {}, reposer: () => {}, maintenant: () => maintenant });
    tenu.poser();
    await repos();
    buttonDe(entree(tenu.poser(), 3), "Remove").click();
    await repos();
    assert.match(entree(tenu.poser(), 3).textContent, /nothing was proposed: x/);
    maintenant += 60_001;
    tenu.poser();
    await repos();
    assert.match(entree(tenu.poser(), 3).textContent, /nothing was proposed: x/, "the same reading keeps it");
    read = { ...READ, entries: READ.entries.slice(1).map((e) => ({ ...e, line: e.line - 1 })) };
    maintenant += 60_001;
    tenu.poser();
    await repos();
    assert.doesNotMatch(tenu.poser().textContent, /nothing was proposed/);
  });
});

const demarrage = () => ({
  configuration: pourLaBar({ chemin: "/tmp/app.json", projets: [{ nom: "parade", dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: KITCHEN_ACTIONS, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
});

async function jouer(read: ReadDuSavoir): Promise<{ vue: Jouee; envoyes: unknown[][] }> {
  const envoyes: unknown[][] = [];
  const vue = await jouerLaVue({
    demarrage,
    espace: () => [],
    machines: () => [],
    savoirDuProjet: async () => read,
    changerLeSavoir: async (project, changement): Promise<RenduDuSavoir> => {
      envoyes.push([project, changement]);
      return { propose: PROPOSE, kind: changement.kind, pr: PR, numero: 77 };
    },
  });
  (vue.element("projets").children.at(1) ?? assert.fail("no tile for parade")).click();
  await repos();
  await ouvrirRead(vue, "Settings");
  await repos();
  return { vue, envoyes };
}
const blocDe = (vue: Jouee) => vue.element("bandeau-sante").dessous("section").find(({ dataset }) => dataset.bloc === "know-how") ?? assert.fail("no know-how in Settings");

describe("the know-how, in the view", () => {
  test("Settings reads the project's know-how from the main process and lists every entry with its section and ticket", async () => {
    const { vue } = await jouer(READ);
    assert.deepEqual(vue.dernier("savoirDuProjet"), ["parade"]);
    assert.deepEqual(lu(blocDe(vue)).map(([section]) => section), ["Conventions", "Pitfalls", "Tools"]);
    assert.equal(entrees(blocDe(vue)).length, 5);
    assert.match(entree(blocDe(vue), 11).textContent, /A tool nobody ticketedno source ticket/);
  });

  test("an empty file shows the empty line in Settings", async () => {
    const { vue } = await jouer(EMPTY_LU);
    assert.match(blocDe(vue).textContent, /No project know-how yet\. \.brigade\/know-how\.md is missing or has no entry\./);
    assert.equal(entrees(blocDe(vue)).length, 0);
  });

  test("Remove and an edit go to the main process, and the row says the pull request; no Save button anywhere", async () => {
    const { vue, envoyes } = await jouer(READ);
    buttonDe(entree(blocDe(vue), 4), "Remove").click();
    await repos();
    assert.deepEqual(envoyes, [["parade", { kind: "remove", line: 4, avant: "Identifiers are in French" }]]);
    assert.match(entree(blocDe(vue), 4).textContent, /pull request #77/);
    buttonDe(entree(blocDe(vue), 7), "Edit").click();
    const champ = champDe(entree(blocDe(vue), 7));
    champ.value = "Never run the pass on a dirty worktree";
    champ.declencher("change");
    await repos();
    assert.deepEqual(envoyes[1], ["parade", { kind: "edit", line: 7, text: "Never run the pass on a dirty worktree", avant: "Never run the pass with a dirty tree" }]);
    assert.deepEqual(blocDe(vue).dessous("button").filter(({ textContent }) => /^(save|saving…)$/i.test(textContent)), []);
  });
});
