// L'étape « projet » du parcours d'ajout (ticket 2476) : la liste des dépôts du compte et de ses
// organisations, la recherche, le collage d'`owner/repo` ou d'une URL — d'un dépôt qui n'est pas au
// chef —, et ce qui n'est pas un dépôt, qui se dit sans rien ajouter.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { NO, NOT_ONE_REPOSITORY, repositoryPastesPar, filter, setStepProject } from "../../src/vue/journey-project/step-project.js";
import { Fake } from "../helpers/false-vue.ts";

const doc = { createElement: (balise: string) => new Fake(balise) };
const REPOSITORIES = [
  { depot: "chef/brigade", base: "main" },
  { depot: "chef/site", base: "trunk" },
  { depot: "acme-corp/api", base: "main" },
];

function mount(options: { depots?: typeof REPOSITORIES | { refus: string }; resoudre?: (repository: string) => Promise<{ depot: string; base: string } | { refus: string }> } = {}) {
  const added: Array<{ depot: string; base: string }> = [];
  let suites = 0;
  const root = setStepProject(doc, {
    depots: options.depots ?? REPOSITORIES,
    resoudre: options.resoudre ?? (async (repository) => ({ depot: repository, base: "main" })),
    ajouter: async (repository) => void added.push(repository),
    suivante: () => void suites++,
    // Le dépôt choisi est prêt pour brigade (#2627) : il s'ajoute sans geste de plus.
    verifier: async () => ({ ready: true, missingBindings: false, missingLabels: [] }),
    installer: async () => ({ ready: true, missingBindings: false, missingLabels: [] }),
  }) as Fake;
  const oneOf = (classe: string) => [...root.descendants()].find((element) => element.className.split(" ").includes(classe))!;
  const lines = () => [...root.descendants()].filter((element) => element.className === "depot").map((line) => line.dataset.depot);
  const paste = async (text: string) => {
    const field = oneOf("colle");
    field.value = text;
    await Promise.all(field.declencher("keydown", { key: "Enter" }));
    await new Promise((resolve) => setImmediate(resolve));
  };
  return { racine: root, un: oneOf, lignes: lines, coller: paste, ajoutes: added, suites: () => suites };
}

describe("depotCollePar", () => {
  test("owner/repo et URL de GitHub se lisent de même", () => {
    for (const text of ["torvalds/linux", " torvalds/linux ", "https://github.com/torvalds/linux", "https://www.github.com/torvalds/linux/", "https://github.com/torvalds/linux.git", "github.com/torvalds/linux/issues/12?x=1#y"]) assert.equal(repositoryPastesPar(text), "torvalds/linux", text);
  });
  test("ce qui n'est pas un dépôt ne se lit pas", () => {
    for (const text of ["", "linux", "https://example.com/a/b", "https://github.com/torvalds", "a/b/c", "not a repo", "-x/y", "a/.."]) assert.equal(repositoryPastesPar(text), null, text);
  });
});

describe("la liste et la recherche", () => {
  test("la liste montre les dépôts du compte et de son organisation", () => {
    assert.deepEqual(mount().lignes(), ["chef/brigade", "chef/site", "acme-corp/api"]);
  });
  test("filtrer garde les dépôts qui correspondent, sans égard à la casse", () => {
    assert.deepEqual(filter(REPOSITORIES, "ACME").map(({ depot: repository }) => repository), ["acme-corp/api"]);
    assert.equal(filter(REPOSITORIES, "").length, 3);
  });
  test("taper dans le champ filtre la liste ; rien ne correspond, elle le dit", () => {
    const step = mount();
    const field = step.un("recherche");
    field.value = "chef/";
    field.declencher("input");
    assert.deepEqual(step.lignes(), ["chef/brigade", "chef/site"]);
    field.value = "zzz";
    field.declencher("input");
    assert.deepEqual(step.lignes(), []);
    assert.equal(step.un("aucun").textContent, NO);
  });
  test("choisir un dépôt l'ajoute avec sa branche, puis le parcours passe à la suite", async () => {
    const step = mount();
    const line = [...step.racine.descendants()].find((element) => element.dataset.depot === "chef/site")!;
    await Promise.all(line.dessous("button")[0]!.declencher("click"));
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(step.ajoutes, [{ depot: "chef/site", base: "trunk" }]);
    assert.equal(step.suites(), 1);
  });
  test("la lecture des dépôts échoue : une ligne, le détail au survol, et le collage reste", () => {
    const step = mount({ depots: { refus: "gh: HTTP 401" } });
    assert.equal(step.lignes().length, 0);
    assert.equal(step.racine.textContent.includes("HTTP 401"), false);
    assert.ok(step.un("colle"));
  });
});

describe("le collage", () => {
  test("owner/repo d'un dépôt public qui n'est pas au chef : résolu, ajouté, la suite", async () => {
    const readOnes: string[] = [];
    const step = mount({ resoudre: async (repository) => (readOnes.push(repository), { depot: repository, base: "master" }) });
    await step.coller("torvalds/linux");
    assert.deepEqual(readOnes, ["torvalds/linux"]);
    assert.deepEqual(step.ajoutes, [{ depot: "torvalds/linux", base: "master" }]);
    assert.equal(step.suites(), 1);
  });
  test("une URL complète se résout de même", async () => {
    const step = mount();
    await step.coller("https://github.com/torvalds/linux.git");
    assert.deepEqual(step.ajoutes.map(({ depot: repository }) => repository), ["torvalds/linux"]);
  });
  test("ce qui n'est pas un dépôt : une phrase lisible, rien n'est lu ni ajouté", async () => {
    let readOne = 0;
    const step = mount({ resoudre: async (repository) => (readOne++, { depot: repository, base: "main" }) });
    await step.coller("hello world");
    assert.equal(step.un("erreur").textContent, NOT_ONE_REPOSITORY);
    assert.equal(readOne, 0);
    assert.deepEqual(step.ajoutes, []);
    assert.equal(step.suites(), 0);
  });
  test("un dépôt que GitHub ne connaît pas : sa phrase, rien n'est ajouté", async () => {
    const step = mount({ resoudre: async (repository) => ({ refus: `${repository} does not exist or is private.` }) });
    await step.coller("nobody/nothing");
    assert.equal(step.un("erreur").textContent, "nobody/nothing does not exist or is private.");
    assert.deepEqual(step.ajoutes, []);
    assert.equal(step.suites(), 0);
  });
  test("une lecture qui plante se dit en une phrase, sans le détail", async () => {
    const step = mount({ resoudre: async () => { throw new Error("spawn gh ENOENT /usr/bin/gh"); } });
    await step.coller("a/b");
    assert.equal(step.un("erreur").textContent, "a/b could not be read on GitHub.");
    assert.deepEqual(step.ajoutes, []);
  });
});
