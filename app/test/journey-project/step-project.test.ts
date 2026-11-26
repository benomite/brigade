// L'étape « projet » du parcours d'ajout (ticket 2476) : la liste des dépôts du compte et de ses
// organisations, la recherche, le collage d'`owner/repo` ou d'une URL — d'un dépôt qui n'est pas au
// chef —, et ce qui n'est pas un dépôt, qui se dit sans rien ajouter.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { AUCUN, PAS_UN_REPOSITORY, repositoryCollePar, filtrer, poserStepProject } from "../../src/vue/journey-project/step-project.js";
import { Faux } from "../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const DEPOTS = [
  { depot: "chef/brigade", base: "main" },
  { depot: "chef/site", base: "trunk" },
  { depot: "acme-corp/api", base: "main" },
];

function monter(options: { depots?: typeof DEPOTS | { refus: string }; resoudre?: (repository: string) => Promise<{ depot: string; base: string } | { refus: string }> } = {}) {
  const ajoutes: Array<{ depot: string; base: string }> = [];
  let suites = 0;
  const racine = poserStepProject(doc, {
    depots: options.depots ?? DEPOTS,
    resoudre: options.resoudre ?? (async (repository) => ({ depot: repository, base: "main" })),
    ajouter: async (repository) => void ajoutes.push(repository),
    suivante: () => void suites++,
    // Le dépôt choisi est prêt pour brigade (#2627) : il s'ajoute sans geste de plus.
    verifier: async () => ({ ready: true, missingBindings: false, missingLabels: [] }),
    installer: async () => ({ ready: true, missingBindings: false, missingLabels: [] }),
  }) as Faux;
  const un = (classe: string) => [...racine.descendants()].find((element) => element.className.split(" ").includes(classe))!;
  const lines = () => [...racine.descendants()].filter((element) => element.className === "depot").map((line) => line.dataset.depot);
  const coller = async (texte: string) => {
    const champ = un("colle");
    champ.value = texte;
    await Promise.all(champ.declencher("keydown", { key: "Enter" }));
    await new Promise((resoudre) => setImmediate(resoudre));
  };
  return { racine, un, lignes: lines, coller, ajoutes, suites: () => suites };
}

describe("depotCollePar", () => {
  test("owner/repo et URL de GitHub se lisent de même", () => {
    for (const texte of ["torvalds/linux", " torvalds/linux ", "https://github.com/torvalds/linux", "https://www.github.com/torvalds/linux/", "https://github.com/torvalds/linux.git", "github.com/torvalds/linux/issues/12?x=1#y"]) assert.equal(repositoryCollePar(texte), "torvalds/linux", texte);
  });
  test("ce qui n'est pas un dépôt ne se lit pas", () => {
    for (const texte of ["", "linux", "https://example.com/a/b", "https://github.com/torvalds", "a/b/c", "not a repo", "-x/y", "a/.."]) assert.equal(repositoryCollePar(texte), null, texte);
  });
});

describe("la liste et la recherche", () => {
  test("la liste montre les dépôts du compte et de son organisation", () => {
    assert.deepEqual(monter().lignes(), ["chef/brigade", "chef/site", "acme-corp/api"]);
  });
  test("filtrer garde les dépôts qui correspondent, sans égard à la casse", () => {
    assert.deepEqual(filtrer(DEPOTS, "ACME").map(({ depot: repository }) => repository), ["acme-corp/api"]);
    assert.equal(filtrer(DEPOTS, "").length, 3);
  });
  test("taper dans le champ filtre la liste ; rien ne correspond, elle le dit", () => {
    const step = monter();
    const champ = step.un("recherche");
    champ.value = "chef/";
    champ.declencher("input");
    assert.deepEqual(step.lignes(), ["chef/brigade", "chef/site"]);
    champ.value = "zzz";
    champ.declencher("input");
    assert.deepEqual(step.lignes(), []);
    assert.equal(step.un("aucun").textContent, AUCUN);
  });
  test("choisir un dépôt l'ajoute avec sa branche, puis le parcours passe à la suite", async () => {
    const step = monter();
    const line = [...step.racine.descendants()].find((element) => element.dataset.depot === "chef/site")!;
    await Promise.all(line.dessous("button")[0]!.declencher("click"));
    await new Promise((resoudre) => setImmediate(resoudre));
    assert.deepEqual(step.ajoutes, [{ depot: "chef/site", base: "trunk" }]);
    assert.equal(step.suites(), 1);
  });
  test("la lecture des dépôts échoue : une ligne, le détail au survol, et le collage reste", () => {
    const step = monter({ depots: { refus: "gh: HTTP 401" } });
    assert.equal(step.lignes().length, 0);
    assert.equal(step.racine.textContent.includes("HTTP 401"), false);
    assert.ok(step.un("colle"));
  });
});

describe("le collage", () => {
  test("owner/repo d'un dépôt public qui n'est pas au chef : résolu, ajouté, la suite", async () => {
    const lus: string[] = [];
    const step = monter({ resoudre: async (repository) => (lus.push(repository), { depot: repository, base: "master" }) });
    await step.coller("torvalds/linux");
    assert.deepEqual(lus, ["torvalds/linux"]);
    assert.deepEqual(step.ajoutes, [{ depot: "torvalds/linux", base: "master" }]);
    assert.equal(step.suites(), 1);
  });
  test("une URL complète se résout de même", async () => {
    const step = monter();
    await step.coller("https://github.com/torvalds/linux.git");
    assert.deepEqual(step.ajoutes.map(({ depot: repository }) => repository), ["torvalds/linux"]);
  });
  test("ce qui n'est pas un dépôt : une phrase lisible, rien n'est lu ni ajouté", async () => {
    let lu = 0;
    const step = monter({ resoudre: async (repository) => (lu++, { depot: repository, base: "main" }) });
    await step.coller("hello world");
    assert.equal(step.un("erreur").textContent, PAS_UN_REPOSITORY);
    assert.equal(lu, 0);
    assert.deepEqual(step.ajoutes, []);
    assert.equal(step.suites(), 0);
  });
  test("un dépôt que GitHub ne connaît pas : sa phrase, rien n'est ajouté", async () => {
    const step = monter({ resoudre: async (repository) => ({ refus: `${repository} does not exist or is private.` }) });
    await step.coller("nobody/nothing");
    assert.equal(step.un("erreur").textContent, "nobody/nothing does not exist or is private.");
    assert.deepEqual(step.ajoutes, []);
    assert.equal(step.suites(), 0);
  });
  test("une lecture qui plante se dit en une phrase, sans le détail", async () => {
    const step = monter({ resoudre: async () => { throw new Error("spawn gh ENOENT /usr/bin/gh"); } });
    await step.coller("a/b");
    assert.equal(step.un("erreur").textContent, "a/b could not be read on GitHub.");
    assert.deepEqual(step.ajoutes, []);
  });
});
