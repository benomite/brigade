// Le bloc « Projects » de l'accueil (#2639, épique #2497) : une ligne par projet, son état parmi les quatre et ses
// stations ; un clic ouvre le projet ; « Add a project » lance le parcours d'ajout. Joué devant un faux document.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { AJOUTER, ATTEND, ETATS, SANS_STATION, etatDeLaLigne, boutonDAjout, lignesDeProjets, maintenantDeLaLigne, type ProjetDuBloc } from "../../src/vue/accueil/projets/projets.js";
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
    // `paused` : la pause de quota GitHub du compte (ticket 3482, test/vue/pause-quota/).
    assert.deepEqual(Object.values(ETATS).map(({ dit }) => dit), ["cooking", "waiting for the chef", "held", "paused", "idle", "held: breaker open"]);
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

describe("un projet dont le disjoncteur est ouvert (#3602)", () => {
  // La ligne que le rail bloqué écrivait : ce n'est plus qu'un texte, ni un état ni une cause que la ligne retire.
  const BLOQUE = "8 tickets no manager takes, for 14 h";
  const dit = (...parties: string[]) => ({ ton: "rouge", dit: parties.join(" · ") });
  const ligneDe = (ligne: { ton: string; dit: string }) => {
    const [premiere] = lignesDeProjets(doc, [{ nom: "parade", etat: etatDeLaLigne(ligne), stations: [], maintenant: maintenantDeLaLigne(ligne) }], gestes());
    return premiere as Faux;
  };

  test("« held: breaker open », en tête de ce que la ligne dit d'autre", () => {
    for (const ligne of [dit(BLOQUE, "breaker open"), dit("breaker open"), dit("breaker open", BLOQUE)]) {
      assert.equal(etatDeLaLigne(ligne), "breaker");
      const rendue = ligneDe(ligne);
      assert.deepEqual(rendue.children.map(texte).filter((t) => t !== "").slice(0, 2), ["parade", "held: breaker open"]);
      assert.match(rendue.ariaLabel ?? "", /^parade — held: breaker open — /);
    }
    assert.equal(maintenantDeLaLigne(dit(BLOQUE, "breaker open")), BLOQUE);
    assert.equal(ETATS.breaker.ton, "rouge");
  });

  test("ce que la ligne dit d'autre reste dit", () => {
    assert.equal(maintenantDeLaLigne(dit(BLOQUE, "breaker open")), BLOQUE);
    assert.equal(maintenantDeLaLigne(dit("breaker open")), "no cook goes any more");
  });

  test("une autre cause, ou pas de retenue : les mots d'avant — held, idle", () => {
    assert.equal(etatDeLaLigne(dit(BLOQUE, "kitchen stopped")), "held");
    assert.equal(maintenantDeLaLigne(dit(BLOQUE, "kitchen stopped")), `${BLOQUE} · kitchen stopped`);
    assert.equal(etatDeLaLigne(dit("kitchen stopped")), "held");
    assert.equal(etatDeLaLigne(dit("kitchen held")), "held");
    assert.equal(maintenantDeLaLigne(dit("kitchen held")), "kitchen held");
    assert.equal(etatDeLaLigne({ ton: "gris", dit: "nothing cooking, nothing waits for you" }), "idle");
  });
});
