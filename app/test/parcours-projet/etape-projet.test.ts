// L'étape « projet » du parcours d'ajout (ticket 2476) : la liste des dépôts du compte et de ses
// organisations, la recherche, le collage d'`owner/repo` ou d'une URL — d'un dépôt qui n'est pas au
// chef —, et ce qui n'est pas un dépôt, qui se dit sans rien ajouter.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { AUCUN, PAS_UN_DEPOT, depotCollePar, filtrer, poserEtapeProjet } from "../../src/vue/parcours-projet/etape-projet.js";
import { Faux } from "../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const DEPOTS = [
  { depot: "chef/brigade", base: "main" },
  { depot: "chef/site", base: "trunk" },
  { depot: "acme-corp/api", base: "main" },
];

function monter(options: { depots?: typeof DEPOTS | { refus: string }; resoudre?: (depot: string) => Promise<{ depot: string; base: string } | { refus: string }> } = {}) {
  const ajoutes: Array<{ depot: string; base: string }> = [];
  let suites = 0;
  const racine = poserEtapeProjet(doc, {
    depots: options.depots ?? DEPOTS,
    resoudre: options.resoudre ?? (async (depot) => ({ depot, base: "main" })),
    ajouter: async (depot) => void ajoutes.push(depot),
    suivante: () => void suites++,
    // Le dépôt choisi est prêt pour brigade (#2627) : il s'ajoute sans geste de plus.
    verifier: async () => ({ ready: true, missingBindings: false, missingLabels: [] }),
    installer: async () => ({ ready: true, missingBindings: false, missingLabels: [] }),
  }) as Faux;
  const un = (classe: string) => [...racine.descendants()].find((element) => element.className.split(" ").includes(classe))!;
  const lignes = () => [...racine.descendants()].filter((element) => element.className === "depot").map((ligne) => ligne.dataset.depot);
  const coller = async (texte: string) => {
    const champ = un("colle");
    champ.value = texte;
    await Promise.all(champ.declencher("keydown", { key: "Enter" }));
    await new Promise((resoudre) => setImmediate(resoudre));
  };
  return { racine, un, lignes, coller, ajoutes, suites: () => suites };
}

describe("depotCollePar", () => {
  test("owner/repo et URL de GitHub se lisent de même", () => {
    for (const texte of ["torvalds/linux", " torvalds/linux ", "https://github.com/torvalds/linux", "https://www.github.com/torvalds/linux/", "https://github.com/torvalds/linux.git", "github.com/torvalds/linux/issues/12?x=1#y"]) assert.equal(depotCollePar(texte), "torvalds/linux", texte);
  });
  test("ce qui n'est pas un dépôt ne se lit pas", () => {
    for (const texte of ["", "linux", "https://example.com/a/b", "https://github.com/torvalds", "a/b/c", "not a repo", "-x/y", "a/.."]) assert.equal(depotCollePar(texte), null, texte);
  });
});

describe("la liste et la recherche", () => {
  test("la liste montre les dépôts du compte et de son organisation", () => {
    assert.deepEqual(monter().lignes(), ["chef/brigade", "chef/site", "acme-corp/api"]);
  });
  test("filtrer garde les dépôts qui correspondent, sans égard à la casse", () => {
    assert.deepEqual(filtrer(DEPOTS, "ACME").map(({ depot }) => depot), ["acme-corp/api"]);
    assert.equal(filtrer(DEPOTS, "").length, 3);
  });
  test("taper dans le champ filtre la liste ; rien ne correspond, elle le dit", () => {
    const etape = monter();
    const champ = etape.un("recherche");
    champ.value = "chef/";
    champ.declencher("input");
    assert.deepEqual(etape.lignes(), ["chef/brigade", "chef/site"]);
    champ.value = "zzz";
    champ.declencher("input");
    assert.deepEqual(etape.lignes(), []);
    assert.equal(etape.un("aucun").textContent, AUCUN);
  });
  test("choisir un dépôt l'ajoute avec sa branche, puis le parcours passe à la suite", async () => {
    const etape = monter();
    const ligne = [...etape.racine.descendants()].find((element) => element.dataset.depot === "chef/site")!;
    await Promise.all(ligne.dessous("button")[0]!.declencher("click"));
    await new Promise((resoudre) => setImmediate(resoudre));
    assert.deepEqual(etape.ajoutes, [{ depot: "chef/site", base: "trunk" }]);
    assert.equal(etape.suites(), 1);
  });
  test("la lecture des dépôts échoue : une ligne, le détail au survol, et le collage reste", () => {
    const etape = monter({ depots: { refus: "gh: HTTP 401" } });
    assert.equal(etape.lignes().length, 0);
    assert.equal(etape.racine.textContent.includes("HTTP 401"), false);
    assert.ok(etape.un("colle"));
  });
});

describe("le collage", () => {
  test("owner/repo d'un dépôt public qui n'est pas au chef : résolu, ajouté, la suite", async () => {
    const lus: string[] = [];
    const etape = monter({ resoudre: async (depot) => (lus.push(depot), { depot, base: "master" }) });
    await etape.coller("torvalds/linux");
    assert.deepEqual(lus, ["torvalds/linux"]);
    assert.deepEqual(etape.ajoutes, [{ depot: "torvalds/linux", base: "master" }]);
    assert.equal(etape.suites(), 1);
  });
  test("une URL complète se résout de même", async () => {
    const etape = monter();
    await etape.coller("https://github.com/torvalds/linux.git");
    assert.deepEqual(etape.ajoutes.map(({ depot }) => depot), ["torvalds/linux"]);
  });
  test("ce qui n'est pas un dépôt : une phrase lisible, rien n'est lu ni ajouté", async () => {
    let lu = 0;
    const etape = monter({ resoudre: async (depot) => (lu++, { depot, base: "main" }) });
    await etape.coller("hello world");
    assert.equal(etape.un("erreur").textContent, PAS_UN_DEPOT);
    assert.equal(lu, 0);
    assert.deepEqual(etape.ajoutes, []);
    assert.equal(etape.suites(), 0);
  });
  test("un dépôt que GitHub ne connaît pas : sa phrase, rien n'est ajouté", async () => {
    const etape = monter({ resoudre: async (depot) => ({ refus: `${depot} does not exist or is private.` }) });
    await etape.coller("nobody/nothing");
    assert.equal(etape.un("erreur").textContent, "nobody/nothing does not exist or is private.");
    assert.deepEqual(etape.ajoutes, []);
    assert.equal(etape.suites(), 0);
  });
  test("une lecture qui plante se dit en une phrase, sans le détail", async () => {
    const etape = monter({ resoudre: async () => { throw new Error("spawn gh ENOENT /usr/bin/gh"); } });
    await etape.coller("a/b");
    assert.equal(etape.un("erreur").textContent, "a/b could not be read on GitHub.");
    assert.deepEqual(etape.ajoutes, []);
  });
});
