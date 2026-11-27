// La fiche du projet sous Settings (#4240) : les huit articles de `.brigade/fiche-projet.json`, chacun dans son champ — un
// texte sur une ligne, une liste une entrée par ligne —, changés et écrits par « Save ». Un article requis laissé vide est
// refusé en le nommant, rien n'est écrit ; une fiche absente le dit sans rien créer ; une fiche qui ne se lit pas le dit
// et n'offre aucun champ. L'écran est joué devant un faux document (helpers/false-vue.ts), sur des fichiers en mémoire.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { openCardProject } from "../../src/vue/card-project/card-project.js";
import { Fake, repos } from "../helpers/false-vue.ts";

const CARD = ".brigade/fiche-projet.json";
// Les mots de l'écran, tels que le chef les lit.
const WORDS = {
  enregistrer: "Save",
  enCours: "Saving…",
  enregistre: "Saved.",
  nonEnregistre: "Project sheet not saved.",
  illisible: "Project sheet not reached.",
  sansFichier: "This project has no .brigade/fiche-projet.json: the kitchen writes it with its defaults.",
  requis: (name: string) => `${name} cannot be empty: nothing was saved.`,
};
const ARTICLES = ["work", "stages", "tools", "rules", "risks", "served", "recurring", "humans"].map((key) => ({ cle: key }));
const doc = { createElement: (balise: string) => new Fake(balise) };
const FULL = {
  work: "code and its tests",
  stages: ["one"],
  tools: ["git", "screenshots"],
  rules: ["tests", "types"],
  risks: ["an interface"],
  served: "the main branch",
  recurring: ["the closer, daily"],
  humans: ["the chef"],
};

// Un dossier en mémoire : ce que `lire` rend, ce que `ecrire` reçoit — une écriture que le test tient, s'il le demande.
function project(text: string | null | Error, { tenir: hold = false } = {}) {
  let content = text;
  const readings: string[] = [];
  const writes: { chemin: string; texte: string }[] = [];
  const heldEntries: { lacher(): void; rejeter(error: Error): void }[] = [];
  const read = async (path: string) => {
    readings.push(path);
    if (content instanceof Error) throw content;
    return content;
  };
  const write = async (path: string, written: string) => {
    if (hold) await new Promise<void>((release, rejeter) => heldEntries.push({ lacher: release, rejeter }));
    writes.push({ chemin: path, texte: written });
    content = written;
  };
  return { lectures: readings, ecritures: writes, tenues: heldEntries, ouvrir: () => openCardProject(doc, { lire: read, ecrire: write }) as unknown as Promise<Fake>, contenu: () => content };
}
const card = (value: unknown = FULL) => project(JSON.stringify(value));

const field = (screen: Fake, key: string) => [...screen.descendants()].find((pose) => pose.dataset.item === key) ?? assert.fail(`pas de champ ${key}`);
const record = (screen: Fake) => [...screen.descendants()].find((pose) => pose.dataset.geste === "enregistrer");
const classe = (screen: Fake, name: string) => [...screen.descendants()].filter((pose) => pose.className === name);
const said = (screen: Fake) => classe(screen, "dit")[0]?.textContent ?? assert.fail("pas de ligne sous « Save »");
const written = (p: ReturnType<typeof project>) => JSON.parse(p.ecritures.at(-1)?.texte ?? assert.fail("rien d'écrit"));
async function save(screen: Fake) {
  (record(screen) ?? assert.fail("pas de « Save »")).click();
  await repos();
  await repos();
}

describe("la fiche du projet : lue", () => {
  test("les huit articles, dans l'ordre de la spec, chacun avec son nom ; un texte dans une ligne, une liste une entrée par ligne", async () => {
    const p = card();
    const screen = await p.ouvrir();
    assert.deepEqual(p.lectures, [CARD]);
    assert.equal(CARD, ".brigade/fiche-projet.json");
    assert.deepEqual(
      classe(screen, "article").map((row) => row.children[0]?.textContent.replace("?", "")),
      ["The cook's work", "Stages", "Tools", "House rules", "Risks", "Served", "Recurring", "Humans in the kitchen"],
    );
    assert.deepEqual(
      ARTICLES.map(({ cle: key }) => [key, field(screen, key).balise, field(screen, key).type, field(screen, key).value]),
      [
        ["work", "input", "text", "code and its tests"],
        ["stages", "textarea", "", "one"],
        ["tools", "textarea", "", "git\nscreenshots"],
        ["rules", "textarea", "", "tests\ntypes"],
        ["risks", "textarea", "", "an interface"],
        ["served", "input", "text", "the main branch"],
        ["recurring", "textarea", "", "the closer, daily"],
        ["humans", "textarea", "", "the chef"],
      ],
    );
    assert.equal(classe(screen, "par-ligne").length, 6, "« one per line » sous chaque liste, et sous elles seules");
    assert.equal(record(screen)?.textContent, WORDS.enregistrer);
  });

  test("un article écrit en texte là où la spec attend une liste garde sa forme : une ligne", async () => {
    const screen = await card({ ...FULL, stages: "one", recurring: "—" }).ouvrir();
    assert.equal(field(screen, "stages").balise, "input");
    assert.equal(field(screen, "recurring").value, "—");
  });

  test("pas de fichier — `null`, ou ENOENT — : la ligne vide, sans champ ni « Save »", async () => {
    for (const readOne of [null, Object.assign(new Error("ENOENT: no such file"), { code: "ENOENT" })]) {
      const p = project(readOne);
      const screen = await p.ouvrir();
      const empty = classe(screen, "aucune")[0] ?? assert.fail("pas de ligne vide");
      assert.equal(empty.children[0]?.textContent, "No project sheet yet.");
      assert.equal(empty.dessous("button").at(-1)?.ariaLabel, WORDS.sansFichier);
      assert.equal(record(screen), undefined);
      assert.equal(classe(screen, "indisponible").length, 0);
      assert.deepEqual(p.ecritures, []);
    }
  });

  for (const [theCase, readOne, reason] of [
    ["une lecture qui échoue", new Error("EACCES: permission denied"), /EACCES/],
    ["un fichier qui n'est pas du JSON", "{ work: ", /not JSON/],
    ["un JSON qui n'est pas un objet", "42", /not a JSON object/],
    ["un tableau", "[]", /not a JSON object/],
    ["null", "null", /not a JSON object/],
    ["un article absent", JSON.stringify({ ...FULL, humans: undefined }), /Humans in the kitchen \(humans\)/],
    ["un article qui n'est ni texte ni liste", JSON.stringify({ ...FULL, served: 3 }), /Served \(served\)/],
    ["une liste qui ne tient pas que des textes", JSON.stringify({ ...FULL, tools: ["git", 2] }), /Tools \(tools\)/],
  ] as const) {
    test(`${theCase} : une ligne d'erreur, le détail au survol, aucun champ — rien ne l'écrase`, async () => {
      const p = project(readOne);
      const screen = await p.ouvrir();
      const line = classe(screen, "indisponible")[0] ?? assert.fail("pas de ligne d'erreur");
      assert.equal(line.children[0]?.textContent, WORDS.illisible);
      assert.match(line.dessous("button").at(-1)?.ariaLabel ?? "", reason);
      assert.equal(classe(screen, "article").length, 0);
      assert.equal(record(screen), undefined);
      assert.equal(classe(screen, "aucune").length, 0);
    });
  }
});

describe("la fiche du projet : écrite", () => {
  test("une liste changée s'écrit en liste, une entrée par ligne non vide, sans ses blancs ; un texte sans ses blancs ; « Saved. »", async () => {
    const p = card();
    const screen = await p.ouvrir();
    field(screen, "stages").value = "script\n\n  storyboard \nrender\n";
    field(screen, "work").value = "  an episode ";
    await save(screen);
    assert.deepEqual(p.ecritures.map(({ chemin: path }) => path), [CARD]);
    assert.deepEqual(written(p), { ...FULL, work: "an episode", stages: ["script", "storyboard", "render"] });
    assert.equal(p.ecritures[0]?.texte, `${JSON.stringify(written(p), null, 2)}\n`);
    assert.equal(said(screen), WORDS.enregistre);
    assert.equal(field(screen, "stages").value, "script\nstoryboard\nrender", "le champ montre ce qui est écrit");
    assert.equal(field(screen, "work").value, "an episode");
  });

  test("les clés que l'écran ne montre pas restent dans le fichier", async () => {
    const p = card({ ...FULL, version: 2 });
    const screen = await p.ouvrir();
    await save(screen);
    assert.equal(written(p).version, 2);
  });

  test("les articles qui ne sont pas requis s'écrivent vides", async () => {
    const p = card();
    const screen = await p.ouvrir();
    for (const key of ["tools", "rules", "risks", "recurring", "humans"]) field(screen, key).value = "";
    await save(screen);
    assert.deepEqual(written(p), { ...FULL, tools: [], rules: [], risks: [], recurring: [], humans: [] });
    assert.equal(said(screen), WORDS.enregistre);
  });

  for (const [key, name] of [
    ["work", "The cook's work"],
    ["stages", "Stages"],
    ["served", "Served"],
  ] as const) {
    test(`${name} vide — ou que des blancs — : refusé en le nommant, son champ signalé, rien d'écrit`, async () => {
      const p = card();
      const screen = await p.ouvrir();
      field(screen, key).value = "  \n ";
      await save(screen);
      assert.deepEqual(p.ecritures, []);
      assert.equal(said(screen), WORDS.requis(name));
      assert.equal(said(screen), `${name} cannot be empty: nothing was saved.`);
      assert.deepEqual(
        ARTICLES.filter(({ cle: other }) => field(screen, other).ariaInvalid === "true").map(({ cle: other }) => other),
        [key],
      );
    });
  }

  test("Stages vidé — sa liste sans une entrée — : refusé en le nommant, rien d'écrit", async () => {
    const p = card();
    const screen = await p.ouvrir();
    field(screen, "stages").value = "\n\n";
    await save(screen);
    assert.deepEqual(p.ecritures, []);
    assert.equal(said(screen), "Stages cannot be empty: nothing was saved.");
    assert.equal(field(screen, "stages").ariaInvalid, "true");
  });

  test("deux articles requis vides : une ligne pour chacun ; corrigés, la fiche s'écrit et plus rien n'est signalé", async () => {
    const p = card();
    const screen = await p.ouvrir();
    field(screen, "work").value = "";
    field(screen, "served").value = "";
    await save(screen);
    assert.deepEqual(classe(screen, "refus").map((line) => line.textContent), [WORDS.requis("The cook's work"), WORDS.requis("Served")]);
    assert.deepEqual(classe(screen, "refus").map((line) => line.role), ["alert", "alert"], "chaque refus se lit d'office");
    assert.deepEqual(p.ecritures, []);
    field(screen, "work").value = "a page";
    field(screen, "served").value = "the live site";
    await save(screen);
    assert.equal(written(p).served, "the live site");
    assert.ok(ARTICLES.every(({ cle: key }) => field(screen, key).ariaInvalid === ""));
    assert.equal(classe(screen, "refus").length, 0);
  });

  test("l'écriture en route : « Save » ne se rejoue pas ; arrivée, il se rejoue", async () => {
    const p = project(JSON.stringify(FULL), { tenir: true });
    const screen = await p.ouvrir();
    await save(screen);
    assert.equal(record(screen)?.disabled, true);
    assert.equal(said(screen), WORDS.enCours);
    assert.equal(p.tenues.length, 1);
    p.tenues[0]?.lacher();
    await repos();
    assert.equal(record(screen)?.disabled, false);
    assert.equal(said(screen), WORDS.enregistre);
  });

  test("une écriture qui échoue : « Project sheet not saved. », sa raison au survol ; les champs gardent la saisie, « Save » se rejoue", async () => {
    const p = project(JSON.stringify(FULL), { tenir: true });
    const screen = await p.ouvrir();
    field(screen, "work").value = "an entry";
    await save(screen);
    p.tenues[0]?.rejeter(new Error("EROFS: read-only file system"));
    await repos();
    await repos();
    const refusal = classe(screen, "refus")[0] ?? assert.fail("pas de refus");
    assert.equal(refusal.children[0]?.textContent, WORDS.nonEnregistre);
    assert.equal(refusal.role, "alert");
    assert.match(refusal.dessous("button").at(-1)?.ariaLabel ?? "", /EROFS/);
    assert.equal(record(screen)?.disabled, false);
    assert.equal(field(screen, "work").value, "an entry");
    assert.equal(p.contenu(), JSON.stringify(FULL), "le fichier n'a pas changé");
  });
});
