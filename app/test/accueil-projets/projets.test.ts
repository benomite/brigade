// Le bloc « Projects » de l'accueil (#2639, épique #2497) : une ligne par projet, son état parmi les quatre et ses
// stations ; un clic ouvre le projet ; « Add a project » lance le parcours d'ajout. Joué devant un faux document.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { AJOUTER, ATTEND, ETATS, SANS_STATION, etatDeLaLigne, boutonDAjout, lignesDeProjets, type ProjetDuBloc } from "../../src/vue/accueil/projets/projets.js";
import { Faux } from "../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const texte = (noeud: Faux): string => noeud.textContent.replace(/\s+/g, " ");
const gestes = () => {
  const appels: string[] = [];
  return { appels, ouvrir: (nom: string) => appels.push(`ouvrir ${nom}`), ajouter: () => appels.push("ajouter") };
};
const poserLesProjets = (d: typeof doc, projets: ProjetDuBloc[], g: ReturnType<typeof gestes>) => {
  const bloc = new Faux("section");
  bloc.append(...lignesDeProjets(d, projets, g), boutonDAjout(d, g, projets.length === 0));
  return bloc;
};
const lignes = (bloc: Faux) => bloc.children.filter(({ className }) => className === "ligne");
const PROJETS: ProjetDuBloc[] = [
  { nom: "brigade", etat: "cooking", stations: ["parade-box", "this computer"], maintenant: "#12 cooking" },
  { nom: "espace", etat: "waiting", stations: ["parade-box"], maintenant: "1 decision awaits you", attend: 1 },
  { nom: "calculus", etat: "held", stations: [], maintenant: "kitchen held" },
  { nom: "cantine", etat: "idle", stations: ["this computer"], maintenant: "nothing cooking, nothing waits for you" },
];

describe("le bloc Projects de l'accueil", () => {
  test("une ligne par projet, avec son état parmi les quatre et ses stations", () => {
    const bloc = poserLesProjets(doc, PROJETS, gestes());
    assert.deepEqual(lignes(bloc).map((l) => l.children.map(texte).filter((t) => t !== "")), [
      ["brigade", "cooking", "#12 cooking", "›"],
      ["espace", "waiting for the chef", "1 decision awaits you", `1 ${ATTEND}`, "›"],
      ["calculus", "held", "kitchen held", "›"],
      ["cantine", "idle", "nothing cooking, nothing waits for you", "›"],
    ]);
    assert.deepEqual(lignes(bloc).map((l) => l.ariaLabel?.split(" — ").at(-1)), ["parade-box, this computer", "parade-box", SANS_STATION, "this computer"], "les stations restent dites, dans le nom de la ligne");
    assert.deepEqual(Object.values(ETATS).map(({ dit }) => dit), ["cooking", "waiting for the chef", "held", "idle"]);
  });

  test("un clic sur une ligne ouvre ce projet, une seule fois", () => {
    const g = gestes();
    const bloc = poserLesProjets(doc, PROJETS, g);
    assert.deepEqual(lignes(bloc)[1]?.dessous("button"), [], "la ligne est un seul bouton");
    lignes(bloc)[1]?.click();
    assert.deepEqual(g.appels, ["ouvrir espace"]);
  });

  test("« Add a project » lance le parcours d'ajout", () => {
    const g = gestes();
    const bloc = poserLesProjets(doc, PROJETS, g);
    const ajout = bloc.dessous("button").find(({ className }) => className !== "ligne");
    assert.equal(ajout?.textContent, AJOUTER);
    ajout?.click();
    assert.deepEqual(g.appels, ["ajouter"]);
  });

  test("une liste vide se pose sans erreur, et garde le bouton d'ajout", () => {
    const bloc = poserLesProjets(doc, [], gestes());
    assert.equal(lignes(bloc).length, 0);
    assert.match(texte(bloc), new RegExp(AJOUTER));
  });
});

test("l'état d'une ligne de l'accueil : retenu, attend le chef, cuit, au repos", () => {
  const etat = (ton: string, dit: string) => etatDeLaLigne({ ton, dit });
  assert.equal(etat("rouge", "kitchen held"), "held");
  assert.equal(etat("jaune", "1 decision awaits you"), "waiting");
  assert.equal(etat("vert", "#12 cooking"), "cooking");
  assert.equal(etat("vert", "nothing cooking, nothing waits for you"), "idle");
  assert.equal(etat("gris", "first read in progress…"), "idle");
});
