// Le bloc « Projects » de l'accueil (#2639, épique #2497) : une ligne par projet, son état parmi les quatre et ses
// stations ; un clic ouvre le projet ; « Add a project » lance le parcours d'ajout. Joué devant un faux document.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ADD, AWAITING, STATES, WITHOUT_STATION, stateOfTheLine, buttonOfAddition, linesOfProjects, nowOfTheLine, type ProjectOfBlock } from "../../src/vue/home/projects/projects.js";
import { Fake } from "../helpers/false-vue.ts";

const doc = { createElement: (balise: string) => new Fake(balise) };
const text = (node: Fake): string => node.textContent.replace(/\s+/g, " ");
const actions = () => {
  const calls: string[] = [];
  return { appels: calls, ouvrir: (name: string) => calls.push(`ouvrir ${name}`), ajouter: () => calls.push("ajouter") };
};
const setTheProjects = (d: typeof doc, projects: ProjectOfBlock[], g: ReturnType<typeof actions>) => {
  const block = new Fake("section");
  block.append(...linesOfProjects(d, projects, g), buttonOfAddition(d, g, projects.length === 0));
  return block;
};
const lines = (block: Fake) => block.children.filter(({ className }) => className === "ligne");
const PROJECTS: ProjectOfBlock[] = [
  { nom: "brigade", etat: "cooking", stations: ["parade-box", "this computer"], maintenant: "#12 cooking" },
  { nom: "espace", etat: "waiting", stations: ["parade-box"], maintenant: "1 decision awaits you", attend: 1 },
  { nom: "calculus", etat: "held", stations: [], maintenant: "kitchen held" },
  { nom: "cantine", etat: "idle", stations: ["this computer"], maintenant: "nothing cooking, nothing waits for you" },
];

describe("le bloc Projects de l'accueil", () => {
  test("une ligne par projet, avec son état parmi les quatre et ses stations", () => {
    const block = setTheProjects(doc, PROJECTS, actions());
    assert.deepEqual(lines(block).map((l) => l.children.map(text).filter((t) => t !== "")), [
      ["brigade", "cooking", "#12 cooking", "›"],
      ["espace", "waiting for the chef", "1 decision awaits you", `1 ${AWAITING}`, "›"],
      ["calculus", "held", "kitchen held", "›"],
      ["cantine", "idle", "nothing cooking, nothing waits for you", "›"],
    ]);
    assert.deepEqual(lines(block).map((l) => l.ariaLabel?.split(" — ").at(-1)), ["parade-box, this computer", "parade-box", WITHOUT_STATION, "this computer"], "les stations restent dites, dans le nom de la ligne");
    // `stuck` : le rail bloqué (ticket 3358, test/rail-bloque/accueil.test.ts) ; `paused` : la pause de quota GitHub du compte
    // (ticket 3482).
    assert.deepEqual(Object.values(STATES).map(({ dit: said }) => said), ["cooking", "waiting for the chef", "held", "stuck", "paused", "idle", "held: breaker open"]);
  });

  test("un clic sur une ligne ouvre ce projet, une seule fois", () => {
    const g = actions();
    const block = setTheProjects(doc, PROJECTS, g);
    assert.deepEqual(lines(block)[1]?.dessous("button"), [], "la ligne est un seul bouton");
    lines(block)[1]?.click();
    assert.deepEqual(g.appels, ["ouvrir espace"]);
  });

  test("« Add a project » lance le parcours d'ajout", () => {
    const g = actions();
    const block = setTheProjects(doc, PROJECTS, g);
    const addition = block.dessous("button").find(({ className }) => className !== "ligne");
    assert.equal(addition?.textContent, ADD);
    addition?.click();
    assert.deepEqual(g.appels, ["ajouter"]);
  });

  test("une liste vide se pose sans erreur, et garde le bouton d'ajout", () => {
    const block = setTheProjects(doc, [], actions());
    assert.equal(lines(block).length, 0);
    assert.match(text(block), new RegExp(ADD));
  });
});

test("l'état d'une ligne de l'accueil : retenu, attend le chef, cuit, au repos", () => {
  const state = (your: string, said: string) => stateOfTheLine({ ton: your, dit: said });
  assert.equal(state("rouge", "kitchen held"), "held");
  assert.equal(state("jaune", "1 decision awaits you"), "waiting");
  assert.equal(state("vert", "#12 cooking"), "cooking");
  assert.equal(state("vert", "nothing cooking, nothing waits for you"), "idle");
  assert.equal(state("gris", "first read in progress…"), "idle");
});

describe("un projet dont le disjoncteur est ouvert (#3602)", () => {
  const BLOCKED = "8 tickets no manager takes, for 14 h";
  const said = (...parties: string[]) => ({ ton: "rouge", dit: parties.join(" · ") });
  const lineOf = (line: { ton: string; dit: string }) => {
    const [first] = linesOfProjects(doc, [{ nom: "parade", etat: stateOfTheLine(line), stations: [], maintenant: nowOfTheLine(line) }], actions());
    return first as Fake;
  };

  test("« held: breaker open » en place du rail bloqué — jamais « no manager takes »", () => {
    for (const line of [said(BLOCKED, "breaker open"), said("breaker open"), said("breaker open", BLOCKED)]) {
      assert.equal(stateOfTheLine(line), "breaker");
      const renderedOne = lineOf(line);
      assert.deepEqual(renderedOne.children.map(text).filter((t) => t !== "").slice(0, 2), ["parade", "held: breaker open"]);
      assert.doesNotMatch(renderedOne.textContent, /no manager takes|stuck/);
      assert.match(renderedOne.ariaLabel ?? "", /^parade — held: breaker open — /);
    }
    assert.equal(STATES.breaker.ton, "rouge");
  });

  test("ce que la ligne dit d'autre reste dit", () => {
    assert.equal(nowOfTheLine(said(BLOCKED, "breaker open", "Max connection down")), "Max connection down");
    assert.equal(nowOfTheLine(said("breaker open")), "no cook goes any more");
  });

  test("une autre cause, ou pas de retenue : les mots d'avant — held, stuck, idle", () => {
    assert.equal(stateOfTheLine(said(BLOCKED, "kitchen stopped")), "stuck");
    assert.equal(nowOfTheLine(said(BLOCKED, "kitchen stopped")), `${BLOCKED} · kitchen stopped`);
    assert.equal(stateOfTheLine(said("kitchen stopped")), "held");
    assert.equal(stateOfTheLine(said("kitchen held")), "held");
    assert.equal(nowOfTheLine(said("kitchen held")), "kitchen held");
    assert.equal(stateOfTheLine({ ton: "gris", dit: "nothing cooking, nothing waits for you" }), "idle");
  });
});
