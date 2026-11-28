// L'étape « projet » du parcours d'ajout (ticket 2476) : la liste des dépôts du compte et de ses
// organisations, la recherche, le collage d'`owner/repo` ou d'une URL — d'un dépôt qui n'est pas au
// chef —, et ce qui n'est pas un dépôt, qui se dit sans rien ajouter.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { repositoryPastesBy, filter } from "../../src/vue/addition-project/step-project.js";
import { Fake } from "../helpers/false-vue.ts";

const doc = { createElement: (balise: string) => new Fake(balise) };
const REPOSITORIES = [
  { depot: "chef/brigade", base: "main" },
  { depot: "chef/site", base: "trunk" },
  { depot: "acme-corp/api", base: "main" },
];


describe("depotCollePar", () => {
  test("owner/repo et URL de GitHub se lisent de même", () => {
    for (const text of ["torvalds/linux", " torvalds/linux ", "https://github.com/torvalds/linux", "https://www.github.com/torvalds/linux/", "https://github.com/torvalds/linux.git", "github.com/torvalds/linux/issues/12?x=1#y"]) assert.equal(repositoryPastesBy(text), "torvalds/linux", text);
  });
  test("ce qui n'est pas un dépôt ne se lit pas", () => {
    for (const text of ["", "linux", "https://example.com/a/b", "https://github.com/torvalds", "a/b/c", "not a repo", "-x/y", "a/.."]) assert.equal(repositoryPastesBy(text), null, text);
  });
});

describe("la liste et la recherche", () => {
  test("filtrer garde les dépôts qui correspondent, sans égard à la casse", () => {
    assert.deepEqual(filter(REPOSITORIES, "ACME").map(({ depot: repository }) => repository), ["acme-corp/api"]);
    assert.equal(filter(REPOSITORIES, "").length, 3);
  });
});

describe("le collage", () => {
});
