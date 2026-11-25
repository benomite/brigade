// La fiche du projet sous Settings (#4240) : les huit articles de `.brigade/fiche-projet.json`, chacun dans son champ — un
// texte sur une ligne, une liste une entrée par ligne —, changés et écrits par « Save ». Un article requis laissé vide est
// refusé en le nommant, rien n'est écrit ; une fiche absente le dit sans rien créer ; une fiche qui ne se lit pas le dit
// et n'offre aucun champ. L'écran est joué devant un faux document (aides/fausse-vue.ts), sur des fichiers en mémoire.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ARTICLES, FICHE, MOTS, ouvrirFicheProjet } from "../../src/vue/fiche-projet/fiche-projet.js";
import { Faux, repos } from "../aides/fausse-vue.ts";

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
function projet(texte: string | null | Error, { tenir = false } = {}) {
  let contenu = texte;
  const lectures: string[] = [];
  const ecritures: { chemin: string; texte: string }[] = [];
  const tenues: { lacher(): void; rejeter(erreur: Error): void }[] = [];
  const lire = async (chemin: string) => {
    lectures.push(chemin);
    if (contenu instanceof Error) throw contenu;
    return contenu;
  };
  const ecrire = async (chemin: string, ecrit: string) => {
    if (tenir) await new Promise<void>((lacher, rejeter) => tenues.push({ lacher, rejeter }));
    ecritures.push({ chemin, texte: ecrit });
    contenu = ecrit;
  };
  return { lectures, ecritures, tenues, ouvrir: () => ouvrirFicheProjet(doc, { lire, ecrire }) as unknown as Promise<Faux>, contenu: () => contenu };
}
const fiche = (valeur: unknown = PLEINE) => projet(JSON.stringify(valeur));

const champ = (ecran: Faux, cle: string) => [...ecran.descendants()].find((pose) => pose.dataset.item === cle) ?? assert.fail(`pas de champ ${cle}`);
const enregistrer = (ecran: Faux) => [...ecran.descendants()].find((pose) => pose.dataset.geste === "enregistrer");
const classe = (ecran: Faux, nom: string) => [...ecran.descendants()].filter((pose) => pose.className === nom);
const dit = (ecran: Faux) => classe(ecran, "dit")[0]?.textContent ?? assert.fail("pas de ligne sous « Save »");
const ecrit = (p: ReturnType<typeof projet>) => JSON.parse(p.ecritures.at(-1)?.texte ?? assert.fail("rien d'écrit"));
async function sauver(ecran: Faux) {
  (enregistrer(ecran) ?? assert.fail("pas de « Save »")).click();
  await repos();
  await repos();
}

describe("la fiche du projet : lue", () => {
  test("les huit articles, dans l'ordre de la spec, chacun avec son nom ; un texte dans une ligne, une liste une entrée par ligne", async () => {
    const p = fiche();
    const ecran = await p.ouvrir();
    assert.deepEqual(p.lectures, [FICHE]);
    assert.equal(FICHE, ".brigade/fiche-projet.json");
    assert.deepEqual(
      classe(ecran, "article").map((rangee) => rangee.children[0]?.textContent.replace("?", "")),
      ["The cook's work", "Stages", "Tools", "House rules", "Risks", "Served", "Recurring", "Humans in the kitchen"],
    );
    assert.deepEqual(
      ARTICLES.map(({ cle }) => [cle, champ(ecran, cle).balise, champ(ecran, cle).type, champ(ecran, cle).value]),
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
    assert.equal(classe(ecran, "par-ligne").length, 6, "« one per line » sous chaque liste, et sous elles seules");
    assert.equal(enregistrer(ecran)?.textContent, MOTS.enregistrer);
  });

  test("un article écrit en texte là où la spec attend une liste garde sa forme : une ligne", async () => {
    const ecran = await fiche({ ...PLEINE, stages: "one", recurring: "—" }).ouvrir();
    assert.equal(champ(ecran, "stages").balise, "input");
    assert.equal(champ(ecran, "recurring").value, "—");
  });

  test("pas de fichier — `null`, ou ENOENT — : la ligne vide, sans champ ni « Save »", async () => {
    for (const lu of [null, Object.assign(new Error("ENOENT: no such file"), { code: "ENOENT" })]) {
      const p = projet(lu);
      const ecran = await p.ouvrir();
      const vide = classe(ecran, "aucune")[0] ?? assert.fail("pas de ligne vide");
      assert.equal(vide.children[0]?.textContent, "No project sheet yet.");
      assert.equal(vide.dessous("button").at(-1)?.ariaLabel, MOTS.sansFichier);
      assert.equal(enregistrer(ecran), undefined);
      assert.equal(classe(ecran, "indisponible").length, 0);
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
      const p = projet(lu);
      const ecran = await p.ouvrir();
      const ligne = classe(ecran, "indisponible")[0] ?? assert.fail("pas de ligne d'erreur");
      assert.equal(ligne.children[0]?.textContent, MOTS.illisible);
      assert.match(ligne.dessous("button").at(-1)?.ariaLabel ?? "", raison);
      assert.equal(classe(ecran, "article").length, 0);
      assert.equal(enregistrer(ecran), undefined);
      assert.equal(classe(ecran, "aucune").length, 0);
    });
  }
});

describe("la fiche du projet : écrite", () => {
  test("une liste changée s'écrit en liste, une entrée par ligne non vide, sans ses blancs ; un texte sans ses blancs ; « Saved. »", async () => {
    const p = fiche();
    const ecran = await p.ouvrir();
    champ(ecran, "stages").value = "script\n\n  storyboard \nrender\n";
    champ(ecran, "work").value = "  an episode ";
    await sauver(ecran);
    assert.deepEqual(p.ecritures.map(({ chemin }) => chemin), [FICHE]);
    assert.deepEqual(ecrit(p), { ...PLEINE, work: "an episode", stages: ["script", "storyboard", "render"] });
    assert.equal(p.ecritures[0]?.texte, `${JSON.stringify(ecrit(p), null, 2)}\n`);
    assert.equal(dit(ecran), MOTS.enregistre);
    assert.equal(champ(ecran, "stages").value, "script\nstoryboard\nrender", "le champ montre ce qui est écrit");
    assert.equal(champ(ecran, "work").value, "an episode");
  });

  test("les clés que l'écran ne montre pas restent dans le fichier", async () => {
    const p = fiche({ ...PLEINE, version: 2 });
    const ecran = await p.ouvrir();
    await sauver(ecran);
    assert.equal(ecrit(p).version, 2);
  });

  test("les articles qui ne sont pas requis s'écrivent vides", async () => {
    const p = fiche();
    const ecran = await p.ouvrir();
    for (const cle of ["tools", "rules", "risks", "recurring", "humans"]) champ(ecran, cle).value = "";
    await sauver(ecran);
    assert.deepEqual(ecrit(p), { ...PLEINE, tools: [], rules: [], risks: [], recurring: [], humans: [] });
    assert.equal(dit(ecran), MOTS.enregistre);
  });

  for (const [cle, nom] of [
    ["work", "The cook's work"],
    ["stages", "Stages"],
    ["served", "Served"],
  ] as const) {
    test(`${nom} vide — ou que des blancs — : refusé en le nommant, son champ signalé, rien d'écrit`, async () => {
      const p = fiche();
      const ecran = await p.ouvrir();
      champ(ecran, cle).value = "  \n ";
      await sauver(ecran);
      assert.deepEqual(p.ecritures, []);
      assert.equal(dit(ecran), MOTS.requis(nom));
      assert.equal(dit(ecran), `${nom} cannot be empty: nothing was saved.`);
      assert.deepEqual(
        ARTICLES.filter(({ cle: autre }) => champ(ecran, autre).ariaInvalid === "true").map(({ cle: autre }) => autre),
        [cle],
      );
    });
  }

  test("deux articles requis vides : une ligne pour chacun ; corrigés, la fiche s'écrit et plus rien n'est signalé", async () => {
    const p = fiche();
    const ecran = await p.ouvrir();
    champ(ecran, "work").value = "";
    champ(ecran, "served").value = "";
    await sauver(ecran);
    assert.deepEqual(classe(ecran, "refus").map((ligne) => ligne.textContent), [MOTS.requis("The cook's work"), MOTS.requis("Served")]);
    assert.deepEqual(p.ecritures, []);
    champ(ecran, "work").value = "a page";
    champ(ecran, "served").value = "the live site";
    await sauver(ecran);
    assert.equal(ecrit(p).served, "the live site");
    assert.ok(ARTICLES.every(({ cle }) => champ(ecran, cle).ariaInvalid === ""));
    assert.equal(classe(ecran, "refus").length, 0);
  });

  test("l'écriture en route : « Save » ne se rejoue pas ; arrivée, il se rejoue", async () => {
    const p = projet(JSON.stringify(PLEINE), { tenir: true });
    const ecran = await p.ouvrir();
    await sauver(ecran);
    assert.equal(enregistrer(ecran)?.disabled, true);
    assert.equal(dit(ecran), MOTS.enCours);
    assert.equal(p.tenues.length, 1);
    p.tenues[0]?.lacher();
    await repos();
    assert.equal(enregistrer(ecran)?.disabled, false);
    assert.equal(dit(ecran), MOTS.enregistre);
  });

  test("une écriture qui échoue : « Project sheet not saved. », sa raison au survol ; les champs gardent la saisie, « Save » se rejoue", async () => {
    const p = projet(JSON.stringify(PLEINE), { tenir: true });
    const ecran = await p.ouvrir();
    champ(ecran, "work").value = "an entry";
    await sauver(ecran);
    p.tenues[0]?.rejeter(new Error("EROFS: read-only file system"));
    await repos();
    await repos();
    const refus = classe(ecran, "refus")[0] ?? assert.fail("pas de refus");
    assert.equal(refus.children[0]?.textContent, MOTS.nonEnregistre);
    assert.match(refus.dessous("button").at(-1)?.ariaLabel ?? "", /EROFS/);
    assert.equal(enregistrer(ecran)?.disabled, false);
    assert.equal(champ(ecran, "work").value, "an entry");
    assert.equal(p.contenu(), JSON.stringify(PLEINE), "le fichier n'a pas changé");
  });
});
