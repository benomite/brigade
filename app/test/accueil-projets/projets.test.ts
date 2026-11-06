// Le bloc « Projects » de l'accueil (#2639, épique #2497) : une ligne par projet, son état parmi les quatre et ses
// stations ; un clic ouvre le projet ; « Add a project » lance le parcours d'ajout. Joué devant un faux document.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { AJOUTER, AUCUN_PROJET, ETATS, SANS_STATION, etatDeLaLigne, poserLesProjets, type ProjetDuBloc } from "../../src/vue/accueil/projets/projets.js";
import { Faux } from "../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const texte = (noeud: Faux): string => noeud.textContent.replace(/\s+/g, " ");
const gestes = () => {
  const appels: string[] = [];
  return { appels, ouvrir: (nom: string) => appels.push(`ouvrir ${nom}`), ajouter: () => appels.push("ajouter") };
};
const lignes = (bloc: Faux) => bloc.children.filter(({ className }) => className === "ligne");
const PROJETS: ProjetDuBloc[] = [
  { nom: "brigade", etat: "cooking", stations: ["parade-box", "this Mac"] },
  { nom: "espace", etat: "waiting", stations: ["parade-box"] },
  { nom: "calculus", etat: "held", stations: [] },
  { nom: "cantine", etat: "idle", stations: ["this Mac"] },
];

describe("le bloc Projects de l'accueil", () => {
  test("une ligne par projet, avec son état parmi les quatre et ses stations", () => {
    const bloc = poserLesProjets(doc, PROJETS, gestes());
    assert.deepEqual(lignes(bloc).map((l) => l.children.map(texte).filter((t) => t !== "")), [
      ["brigade", "cooking", "parade-box, this Mac", "›"],
      ["espace", "waiting for the chef", "parade-box", "›"],
      ["calculus", "held", SANS_STATION, "›"],
      ["cantine", "idle", "this Mac", "›"],
    ]);
    assert.deepEqual(Object.values(ETATS).map(({ dit }) => dit), ["cooking", "waiting for the chef", "held", "idle"]);
  });

  test("un clic sur une ligne ouvre ce projet, une seule fois", () => {
    const g = gestes();
    const bloc = poserLesProjets(doc, PROJETS, g);
    lignes(bloc)[1]?.click();
    assert.deepEqual(g.appels, ["ouvrir espace"]);
  });

  test("« Add a project » lance le parcours d'ajout", () => {
    const g = gestes();
    const bloc = poserLesProjets(doc, PROJETS, g);
    const ajout = bloc.children.at(-1)?.children[0];
    assert.equal(ajout?.textContent, AJOUTER);
    ajout?.click();
    assert.deepEqual(g.appels, ["ajouter"]);
  });

  test("une liste vide se pose sans erreur, et garde le bouton d'ajout", () => {
    const bloc = poserLesProjets(doc, [], gestes());
    assert.equal(lignes(bloc).length, 0);
    assert.match(texte(bloc), new RegExp(AUCUN_PROJET));
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
