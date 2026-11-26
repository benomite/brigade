// Le bloc « Projects » de l'accueil (#2639, épique #2497) : une ligne par projet, son état parmi les quatre et ses
// stations ; un clic ouvre le projet ; « Add a project » lance le parcours d'ajout. Joué devant un faux document.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { AJOUTER, AWAITING, STATES, SANS_STATION, stateDeLaLine, buttonDAddition, linesDeProjects, maintenantDeLaLine, type ProjectDuBloc } from "../../src/vue/home/projects/projects.js";
import { Faux } from "../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const texte = (noeud: Faux): string => noeud.textContent.replace(/\s+/g, " ");
const actions = () => {
  const calls: string[] = [];
  return { appels: calls, ouvrir: (name: string) => calls.push(`ouvrir ${name}`), ajouter: () => calls.push("ajouter") };
};
const poserLesProjects = (d: typeof doc, projects: ProjectDuBloc[], g: ReturnType<typeof actions>) => {
  const bloc = new Faux("section");
  bloc.append(...linesDeProjects(d, projects, g), buttonDAddition(d, g, projects.length === 0));
  return bloc;
};
const lines = (bloc: Faux) => bloc.children.filter(({ className }) => className === "ligne");
const PROJECTS: ProjectDuBloc[] = [
  { nom: "brigade", etat: "cooking", stations: ["parade-box", "this computer"], maintenant: "#12 cooking" },
  { nom: "espace", etat: "waiting", stations: ["parade-box"], maintenant: "1 decision awaits you", attend: 1 },
  { nom: "calculus", etat: "held", stations: [], maintenant: "kitchen held" },
  { nom: "cantine", etat: "idle", stations: ["this computer"], maintenant: "nothing cooking, nothing waits for you" },
];

describe("le bloc Projects de l'accueil", () => {
  test("une ligne par projet, avec son état parmi les quatre et ses stations", () => {
    const bloc = poserLesProjects(doc, PROJECTS, actions());
    assert.deepEqual(lines(bloc).map((l) => l.children.map(texte).filter((t) => t !== "")), [
      ["brigade", "cooking", "#12 cooking", "›"],
      ["espace", "waiting for the chef", "1 decision awaits you", `1 ${AWAITING}`, "›"],
      ["calculus", "held", "kitchen held", "›"],
      ["cantine", "idle", "nothing cooking, nothing waits for you", "›"],
    ]);
    assert.deepEqual(lines(bloc).map((l) => l.ariaLabel?.split(" — ").at(-1)), ["parade-box, this computer", "parade-box", SANS_STATION, "this computer"], "les stations restent dites, dans le nom de la ligne");
    // `stuck` : le rail bloqué (ticket 3358, test/rail-bloque/accueil.test.ts) ; `paused` : la pause de quota GitHub du compte
    // (ticket 3482, test/vue/pause-quota/).
    assert.deepEqual(Object.values(STATES).map(({ dit }) => dit), ["cooking", "waiting for the chef", "held", "stuck", "paused", "idle", "held: breaker open"]);
  });

  test("un clic sur une ligne ouvre ce projet, une seule fois", () => {
    const g = actions();
    const bloc = poserLesProjects(doc, PROJECTS, g);
    assert.deepEqual(lines(bloc)[1]?.dessous("button"), [], "la ligne est un seul bouton");
    lines(bloc)[1]?.click();
    assert.deepEqual(g.appels, ["ouvrir espace"]);
  });

  test("« Add a project » lance le parcours d'ajout", () => {
    const g = actions();
    const bloc = poserLesProjects(doc, PROJECTS, g);
    const addition = bloc.dessous("button").find(({ className }) => className !== "ligne");
    assert.equal(addition?.textContent, AJOUTER);
    addition?.click();
    assert.deepEqual(g.appels, ["ajouter"]);
  });

  test("une liste vide se pose sans erreur, et garde le bouton d'ajout", () => {
    const bloc = poserLesProjects(doc, [], actions());
    assert.equal(lines(bloc).length, 0);
    assert.match(texte(bloc), new RegExp(AJOUTER));
  });
});

test("l'état d'une ligne de l'accueil : retenu, attend le chef, cuit, au repos", () => {
  const state = (ton: string, dit: string) => stateDeLaLine({ ton, dit });
  assert.equal(state("rouge", "kitchen held"), "held");
  assert.equal(state("jaune", "1 decision awaits you"), "waiting");
  assert.equal(state("vert", "#12 cooking"), "cooking");
  assert.equal(state("vert", "nothing cooking, nothing waits for you"), "idle");
  assert.equal(state("gris", "first read in progress…"), "idle");
});

describe("un projet dont le disjoncteur est ouvert (#3602)", () => {
  const BLOCKED = "8 tickets no manager takes, for 14 h";
  const dit = (...parties: string[]) => ({ ton: "rouge", dit: parties.join(" · ") });
  const lineDe = (line: { ton: string; dit: string }) => {
    const [first] = linesDeProjects(doc, [{ nom: "parade", etat: stateDeLaLine(line), stations: [], maintenant: maintenantDeLaLine(line) }], actions());
    return first as Faux;
  };

  test("« held: breaker open » en place du rail bloqué — jamais « no manager takes »", () => {
    for (const line of [dit(BLOCKED, "breaker open"), dit("breaker open"), dit("breaker open", BLOCKED)]) {
      assert.equal(stateDeLaLine(line), "breaker");
      const rendue = lineDe(line);
      assert.deepEqual(rendue.children.map(texte).filter((t) => t !== "").slice(0, 2), ["parade", "held: breaker open"]);
      assert.doesNotMatch(rendue.textContent, /no manager takes|stuck/);
      assert.match(rendue.ariaLabel ?? "", /^parade — held: breaker open — /);
    }
    assert.equal(STATES.breaker.ton, "rouge");
  });

  test("ce que la ligne dit d'autre reste dit", () => {
    assert.equal(maintenantDeLaLine(dit(BLOCKED, "breaker open", "Max connection down")), "Max connection down");
    assert.equal(maintenantDeLaLine(dit("breaker open")), "no cook goes any more");
  });

  test("une autre cause, ou pas de retenue : les mots d'avant — held, stuck, idle", () => {
    assert.equal(stateDeLaLine(dit(BLOCKED, "kitchen stopped")), "stuck");
    assert.equal(maintenantDeLaLine(dit(BLOCKED, "kitchen stopped")), `${BLOCKED} · kitchen stopped`);
    assert.equal(stateDeLaLine(dit("kitchen stopped")), "held");
    assert.equal(stateDeLaLine(dit("kitchen held")), "held");
    assert.equal(maintenantDeLaLine(dit("kitchen held")), "kitchen held");
    assert.equal(stateDeLaLine({ ton: "gris", dit: "nothing cooking, nothing waits for you" }), "idle");
  });
});
