// La fiche du projet sous Settings (#4240) : les huit articles de `.brigade/fiche-projet.json`, chacun dans son champ — un
// texte sur une ligne, une liste une entrée par ligne —, changés et écrits par « Save ». Un article requis laissé vide est
// refusé en le nommant, rien n'est écrit ; une fiche absente le dit sans rien créer ; une fiche qui ne se lit pas le dit
// et n'offre aucun champ. L'écran est joué devant un faux document (aides/fausse-vue.ts), sur des fichiers en mémoire.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ouvrirCardProject } from "../../src/vue/card-project/card-project.js";
import { Faux, repos } from "../aides/fausse-vue.ts";

const CARD = ".brigade/fiche-projet.json";
// Les mots de l'écran, tels que le chef les lit.
const MOTS = {
  enregistrer: "Save",
  enCours: "Saving…",
  enregistre: "Saved.",
  nonEnregistre: "Project sheet not saved.",
  illisible: "Project sheet not reached.",
  sansFichier: "This project has no .brigade/fiche-projet.json: the kitchen writes it with its defaults.",
  requis: (name: string) => `${name} cannot be empty: nothing was saved.`,
};
const ARTICLES = ["work", "stages", "tools", "rules", "risks", "served", "recurring", "humans"].map((cle) => ({ cle }));
const doc = { createElement: (balise: string) => new Faux(balise) };
const PLEINE = {
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
function project(texte: string | null | Error, { tenir: hold = false } = {}) {
  let contenu = texte;
  const lectures: string[] = [];
  const ecritures: { chemin: string; texte: string }[] = [];
  const tenues: { lacher(): void; rejeter(error: Error): void }[] = [];
  const lire = async (chemin: string) => {
    lectures.push(chemin);
    if (contenu instanceof Error) throw contenu;
    return contenu;
  };
  const ecrire = async (chemin: string, ecrit: string) => {
    if (hold) await new Promise<void>((lacher, rejeter) => tenues.push({ lacher, rejeter }));
    ecritures.push({ chemin, texte: ecrit });
    contenu = ecrit;
  };
  return { lectures, ecritures, tenues, ouvrir: () => ouvrirCardProject(doc, { lire, ecrire }) as unknown as Promise<Faux>, contenu: () => contenu };
}
const card = (valeur: unknown = PLEINE) => project(JSON.stringify(valeur));

const champ = (screen: Faux, cle: string) => [...screen.descendants()].find((pose) => pose.dataset.item === cle) ?? assert.fail(`pas de champ ${cle}`);
const enregistrer = (screen: Faux) => [...screen.descendants()].find((pose) => pose.dataset.geste === "enregistrer");
const classe = (screen: Faux, name: string) => [...screen.descendants()].filter((pose) => pose.className === name);
const dit = (screen: Faux) => classe(screen, "dit")[0]?.textContent ?? assert.fail("pas de ligne sous « Save »");
const ecrit = (p: ReturnType<typeof project>) => JSON.parse(p.ecritures.at(-1)?.texte ?? assert.fail("rien d'écrit"));
async function sauver(screen: Faux) {
  (enregistrer(screen) ?? assert.fail("pas de « Save »")).click();
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
      classe(screen, "article").map((rangee) => rangee.children[0]?.textContent.replace("?", "")),
      ["The cook's work", "Stages", "Tools", "House rules", "Risks", "Served", "Recurring", "Humans in the kitchen"],
    );
    assert.deepEqual(
      ARTICLES.map(({ cle }) => [cle, champ(screen, cle).balise, champ(screen, cle).type, champ(screen, cle).value]),
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
    assert.equal(enregistrer(screen)?.textContent, MOTS.enregistrer);
  });

  test("un article écrit en texte là où la spec attend une liste garde sa forme : une ligne", async () => {
    const screen = await card({ ...PLEINE, stages: "one", recurring: "—" }).ouvrir();
    assert.equal(champ(screen, "stages").balise, "input");
    assert.equal(champ(screen, "recurring").value, "—");
  });

  test("pas de fichier — `null`, ou ENOENT — : la ligne vide, sans champ ni « Save »", async () => {
    for (const lu of [null, Object.assign(new Error("ENOENT: no such file"), { code: "ENOENT" })]) {
      const p = project(lu);
      const screen = await p.ouvrir();
      const empty = classe(screen, "aucune")[0] ?? assert.fail("pas de ligne vide");
      assert.equal(empty.children[0]?.textContent, "No project sheet yet.");
      assert.equal(empty.dessous("button").at(-1)?.ariaLabel, MOTS.sansFichier);
      assert.equal(enregistrer(screen), undefined);
      assert.equal(classe(screen, "indisponible").length, 0);
      assert.deepEqual(p.ecritures, []);
    }
  });

  for (const [cas, lu, raison] of [
    ["une lecture qui échoue", new Error("EACCES: permission denied"), /EACCES/],
    ["un fichier qui n'est pas du JSON", "{ work: ", /not JSON/],
    ["un JSON qui n'est pas un objet", "42", /not a JSON object/],
    ["un tableau", "[]", /not a JSON object/],
    ["null", "null", /not a JSON object/],
    ["un article absent", JSON.stringify({ ...PLEINE, humans: undefined }), /Humans in the kitchen \(humans\)/],
    ["un article qui n'est ni texte ni liste", JSON.stringify({ ...PLEINE, served: 3 }), /Served \(served\)/],
    ["une liste qui ne tient pas que des textes", JSON.stringify({ ...PLEINE, tools: ["git", 2] }), /Tools \(tools\)/],
  ] as const) {
    test(`${cas} : une ligne d'erreur, le détail au survol, aucun champ — rien ne l'écrase`, async () => {
      const p = project(lu);
      const screen = await p.ouvrir();
      const line = classe(screen, "indisponible")[0] ?? assert.fail("pas de ligne d'erreur");
      assert.equal(line.children[0]?.textContent, MOTS.illisible);
      assert.match(line.dessous("button").at(-1)?.ariaLabel ?? "", raison);
      assert.equal(classe(screen, "article").length, 0);
      assert.equal(enregistrer(screen), undefined);
      assert.equal(classe(screen, "aucune").length, 0);
    });
  }
});

describe("la fiche du projet : écrite", () => {
  test("une liste changée s'écrit en liste, une entrée par ligne non vide, sans ses blancs ; un texte sans ses blancs ; « Saved. »", async () => {
    const p = card();
    const screen = await p.ouvrir();
    champ(screen, "stages").value = "script\n\n  storyboard \nrender\n";
    champ(screen, "work").value = "  an episode ";
    await sauver(screen);
    assert.deepEqual(p.ecritures.map(({ chemin }) => chemin), [CARD]);
    assert.deepEqual(ecrit(p), { ...PLEINE, work: "an episode", stages: ["script", "storyboard", "render"] });
    assert.equal(p.ecritures[0]?.texte, `${JSON.stringify(ecrit(p), null, 2)}\n`);
    assert.equal(dit(screen), MOTS.enregistre);
    assert.equal(champ(screen, "stages").value, "script\nstoryboard\nrender", "le champ montre ce qui est écrit");
    assert.equal(champ(screen, "work").value, "an episode");
  });

  test("les clés que l'écran ne montre pas restent dans le fichier", async () => {
    const p = card({ ...PLEINE, version: 2 });
    const screen = await p.ouvrir();
    await sauver(screen);
    assert.equal(ecrit(p).version, 2);
  });

  test("les articles qui ne sont pas requis s'écrivent vides", async () => {
    const p = card();
    const screen = await p.ouvrir();
    for (const cle of ["tools", "rules", "risks", "recurring", "humans"]) champ(screen, cle).value = "";
    await sauver(screen);
    assert.deepEqual(ecrit(p), { ...PLEINE, tools: [], rules: [], risks: [], recurring: [], humans: [] });
    assert.equal(dit(screen), MOTS.enregistre);
  });

  for (const [cle, name] of [
    ["work", "The cook's work"],
    ["stages", "Stages"],
    ["served", "Served"],
  ] as const) {
    test(`${name} vide — ou que des blancs — : refusé en le nommant, son champ signalé, rien d'écrit`, async () => {
      const p = card();
      const screen = await p.ouvrir();
      champ(screen, cle).value = "  \n ";
      await sauver(screen);
      assert.deepEqual(p.ecritures, []);
      assert.equal(dit(screen), MOTS.requis(name));
      assert.equal(dit(screen), `${name} cannot be empty: nothing was saved.`);
      assert.deepEqual(
        ARTICLES.filter(({ cle: autre }) => champ(screen, autre).ariaInvalid === "true").map(({ cle: autre }) => autre),
        [cle],
      );
    });
  }

  test("Stages vidé — sa liste sans une entrée — : refusé en le nommant, rien d'écrit", async () => {
    const p = card();
    const screen = await p.ouvrir();
    champ(screen, "stages").value = "\n\n";
    await sauver(screen);
    assert.deepEqual(p.ecritures, []);
    assert.equal(dit(screen), "Stages cannot be empty: nothing was saved.");
    assert.equal(champ(screen, "stages").ariaInvalid, "true");
  });

  test("deux articles requis vides : une ligne pour chacun ; corrigés, la fiche s'écrit et plus rien n'est signalé", async () => {
    const p = card();
    const screen = await p.ouvrir();
    champ(screen, "work").value = "";
    champ(screen, "served").value = "";
    await sauver(screen);
    assert.deepEqual(classe(screen, "refus").map((line) => line.textContent), [MOTS.requis("The cook's work"), MOTS.requis("Served")]);
    assert.deepEqual(classe(screen, "refus").map((line) => line.role), ["alert", "alert"], "chaque refus se lit d'office");
    assert.deepEqual(p.ecritures, []);
    champ(screen, "work").value = "a page";
    champ(screen, "served").value = "the live site";
    await sauver(screen);
    assert.equal(ecrit(p).served, "the live site");
    assert.ok(ARTICLES.every(({ cle }) => champ(screen, cle).ariaInvalid === ""));
    assert.equal(classe(screen, "refus").length, 0);
  });

  test("l'écriture en route : « Save » ne se rejoue pas ; arrivée, il se rejoue", async () => {
    const p = project(JSON.stringify(PLEINE), { tenir: true });
    const screen = await p.ouvrir();
    await sauver(screen);
    assert.equal(enregistrer(screen)?.disabled, true);
    assert.equal(dit(screen), MOTS.enCours);
    assert.equal(p.tenues.length, 1);
    p.tenues[0]?.lacher();
    await repos();
    assert.equal(enregistrer(screen)?.disabled, false);
    assert.equal(dit(screen), MOTS.enregistre);
  });

  test("une écriture qui échoue : « Project sheet not saved. », sa raison au survol ; les champs gardent la saisie, « Save » se rejoue", async () => {
    const p = project(JSON.stringify(PLEINE), { tenir: true });
    const screen = await p.ouvrir();
    champ(screen, "work").value = "an entry";
    await sauver(screen);
    p.tenues[0]?.rejeter(new Error("EROFS: read-only file system"));
    await repos();
    await repos();
    const refusal = classe(screen, "refus")[0] ?? assert.fail("pas de refus");
    assert.equal(refusal.children[0]?.textContent, MOTS.nonEnregistre);
    assert.equal(refusal.role, "alert");
    assert.match(refusal.dessous("button").at(-1)?.ariaLabel ?? "", /EROFS/);
    assert.equal(enregistrer(screen)?.disabled, false);
    assert.equal(champ(screen, "work").value, "an entry");
    assert.equal(p.contenu(), JSON.stringify(PLEINE), "le fichier n'a pas changé");
  });
});
