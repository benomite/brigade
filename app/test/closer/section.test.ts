// La partie « closer » de la page d'un projet (vue/closer/section.js, #990) : les quatre chiffres de la
// dernière observation, la liste de ce qu'elle a repéré derrière un bouton, et — sans closer réglé — le
// message et le geste qui en règle un, un bouton, sans aucun chiffre. Le module est lu seul, sur un faux document :
// la vue ne le pose plus (#2921, la page Cooks est supprimée).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Lecture } from "../../src/box.ts";
import { commandeDe, commandesDe, ONGLETS, PARAMETRES, RUBRIQUES } from "../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../src/projets/projets.ts";
import {
  AUCUNE,
  BRANCHE_ILLISIBLE,
  CHOISIR_EFFORT,
  CHOISIR_MODELE,
  COMMANDE,
  DOUBLONS,
  ILLISIBLE,
  LECTURE,
  lireFermeture,
  MERGES,
  MORTS,
  NON_COMMUNIQUE,
  poserCloser,
  RATIO,
  REGLER,
  SANS_CLOSER,
} from "../../src/vue/closer/section.js";
import { Faux } from "../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const A = "2026-10-19T12:00:00.000Z";
const CALIBRAGE = { modeles: MODELES, efforts: EFFORTS };

// Ce que `closing --json` écrit, sur une ligne (runtime/src/fermeture-lecture/lecture.ts) : le closer réglé,
// la branche lue, deux doublons et un export mort.
const OBSERVEE = {
  configured: true,
  closer: { model: "sonnet", effort: "medium", cooksBelow: 1, tokens: 500_000, removedLines: 500 },
  observation: {
    readable: true,
    ref: "origin/v2",
    sha: "48638df",
    lastMerge: "2026-10-19T11:48:13.000Z",
    mergesSinceCleanup: 261,
    ratio: [
      { window: 20, merges: 20, added: 4_210, removed: 980, ratio: 4.29, reads: "4.3:1" },
      { window: 50, merges: 50, added: 9_800, removed: 3_100, ratio: 3.16, reads: "3.2:1" },
      { window: 100, merges: 100, added: 18_340, removed: 7_336, ratio: 2.5, reads: "2.5:1" },
    ],
    duplicates: 2,
    deadExports: 1,
    codeFiles: 412,
    modules: 380,
    skippedFiles: 3,
  },
  findings: [
    { id: "D1", kind: "duplicate", file: "app/src/vue/vue.js", start: 1405, end: 1418, lines: 14, copy: { file: "app/src/vue/fiabilite.js", start: 40, end: 53 } },
    { id: "D2", kind: "duplicate", file: "runtime/src/rail.ts", start: 88, end: 96, lines: 9, copy: { file: "runtime/src/rail.ts", start: 140, end: 148 } },
    { id: "M1", kind: "dead-export", file: "runtime/src/mesures.ts", start: 212, end: 212, name: "ancienneJauge", onlyTests: ["runtime/test/mesures.test.ts"] },
  ],
  request: { state: "none" },
  drift: { declared: false, crossed: false, crossings: [] },
};
const SANS = { configured: false, text: "the closer is not set on this project: no closing pass writes, there is nothing to observe for it" };
const lecture = (objet: unknown, demande = 0): Lecture => ({ projet: "parade", demande, a: A, sorties: [{ commande: COMMANDE, texte: `${JSON.stringify(objet)}\n` }] });
const lu = (objet: unknown) => lireFermeture(lecture(objet));
const poser = (objet: unknown, options: Partial<Parameters<typeof poserCloser>[2]> = {}) => {
  const racine = new Faux("section");
  racine.append(...poserCloser(doc, lu(objet), options));
  return racine;
};
const chiffres = (racine: Faux) =>
  racine
    .dessous("div")
    .filter(({ className }) => className === "chiffre")
    .map((chiffre) => chiffre.children.map(({ textContent }) => textContent));

describe("la lecture de `closing --json`", () => {
  test("l'objet de la dernière ligne qui en est un : réglé ou non", () => {
    assert.deepEqual(lu(OBSERVEE), { fermeture: OBSERVEE });
    assert.deepEqual(lireFermeture({ ...lecture(SANS), sorties: [{ commande: COMMANDE, texte: `une ligne d'avant\n${JSON.stringify(SANS)}\n` }] }), { fermeture: SANS });
  });

  test("rien de lisible, ou une lecture ratée : pourquoi, pour le survol — jamais un objet deviné", () => {
    const vide = lireFermeture({ ...lecture(SANS), sorties: [{ commande: COMMANDE, texte: "" }] });
    assert.ok("erreur" in vide && /returned nothing/.test(vide.erreur));
    const autre = lireFermeture({ ...lecture(SANS), sorties: [{ commande: COMMANDE, texte: '{"etapes":[]}\nusage: closing' }] });
    assert.ok("erreur" in autre && /usage: closing/.test(autre.erreur));
    assert.deepEqual(lireFermeture({ projet: "parade", demande: 0, a: A, erreur: "brigade : no log in /srv/etat", atteinte: true, cas: null }), { erreur: "brigade : no log in /srv/etat" });
  });
});

describe("la partie closer, observée", () => {
  test("quatre chiffres : merges depuis le dernier nettoyage, ajouté / retiré, doublons, exports morts", () => {
    const racine = poser(OBSERVEE);
    assert.deepEqual(chiffres(racine), [
      [MERGES, "261"],
      [RATIO, "2.5:1", "+18,340 / −7,336 · last 100 merges"],
      [DOUBLONS, "2"],
      [MORTS, "1"],
    ]);
    // Le calibrage du closer est dit à côté du titre.
    assert.match(racine.dessous("h2")[0]?.textContent ?? "", /sonnet \/ medium/);
  });

  test("le rapport dit ce que `closing` dit quand rien n'est retiré", () => {
    const rien = structuredClone(OBSERVEE);
    rien.observation.ratio = [{ window: 20, merges: 3, added: 120, removed: 0, ratio: null as unknown as number, reads: "nothing removed" }];
    assert.deepEqual(chiffres(poser(rien))[1], [RATIO, "nothing removed", "+120 / −0 · last 3 merges"]);
  });

  test("la liste est repliée derrière un bouton ; dépliée, chaque trouvaille dit son fichier et ses lignes", () => {
    const replie = poser(OBSERVEE);
    const bouton = replie.dessous("button").find(({ className }) => className === "deplier") ?? assert.fail("pas de bouton");
    assert.equal(bouton.textContent, "show what was found (3)");
    assert.equal(bouton.ariaExpanded, "false");
    assert.deepEqual(replie.dessous("li"), []);

    let bascule = 0;
    const ouverte = poser(OBSERVEE, { ouvert: true, basculer: () => void bascule++ });
    const lignes = ouverte.dessous("li").map((li) => li.children.map(({ textContent }) => textContent));
    assert.deepEqual(lignes, [
      ["D1", "app/src/vue/vue.js:1405-1418", "14 lines also at app/src/vue/fiabilite.js:40-53"],
      ["D2", "runtime/src/rail.ts:88-96", "9 lines also at runtime/src/rail.ts:140-148"],
      ["M1", "runtime/src/mesures.ts:212", "export ancienneJauge named by tests only"],
    ]);
    const replier = ouverte.dessous("button").find(({ className }) => className === "deplier") ?? assert.fail("pas de bouton");
    assert.equal(replier.textContent, "hide what was found (3)");
    assert.equal(replier.ariaExpanded, "true");
    replier.click();
    assert.equal(bascule, 1);
  });

  test("rien de repéré : une ligne le dit, et il n'y a rien à déplier", () => {
    const propre = structuredClone(OBSERVEE);
    Object.assign(propre.observation, { duplicates: 0, deadExports: 0 });
    propre.findings = [];
    const racine = poser(propre, { ouvert: true });
    assert.deepEqual(racine.dessous("button"), []);
    assert.ok(racine.dessous("p").some(({ textContent }) => textContent === AUCUNE));
  });

  test("deux places séparées et vides attendent le lancement, puis le bilan ; ce qu'on leur donne s'y pose", () => {
    const places = (racine: Faux) => racine.children.filter(({ className }) => /^closer-(lancement|bilan)$/.test(className));
    const vides = places(poser(OBSERVEE));
    assert.deepEqual(vides.map(({ className, children }) => [className, children.length]), [["closer-lancement", 0], ["closer-bilan", 0]]);
    const lance = new Faux("button");
    const bilan = new Faux("p");
    const remplies = places(poser(OBSERVEE, { lancement: [lance], bilan: [bilan] }));
    assert.deepEqual(remplies.map(({ children }) => children), [[lance], [bilan]]);
  });

  test("une branche illisible : les merges restent, les trois autres « not communicated », la raison au survol", () => {
    const illisible = { ...OBSERVEE, observation: { readable: false, error: "origin/v2 is not in /srv/parade: fetch it", mergesSinceCleanup: 261 }, findings: [] };
    const racine = poser(illisible);
    assert.deepEqual(chiffres(racine), [
      [MERGES, "261"],
      [RATIO, NON_COMMUNIQUE],
      [DOUBLONS, NON_COMMUNIQUE],
      [MORTS, NON_COMMUNIQUE],
    ]);
    const ligne = racine.dessous("p").find(({ className }) => className === "indisponible") ?? assert.fail("pas de ligne");
    assert.equal(ligne.children[0]?.textContent, BRANCHE_ILLISIBLE);
    assert.doesNotMatch(racine.textContent, /fetch it/);
    assert.ok(ligne.dessous("button").some(({ ariaLabel }) => /fetch it/.test(ariaLabel)));
    // Rien n'a été repéré sur une branche qui ne se lit pas : ni liste, ni « nothing found ».
    assert.doesNotMatch(racine.textContent, new RegExp(AUCUNE));
  });
});

// Ce que la partie sans closer pose pour le régler : les deux listes, et le bouton.
const reglage = (racine: Faux) => {
  const [modele, effort] = racine.dessous("select");
  const bouton = racine.dessous("button").find(({ textContent }) => textContent === REGLER);
  assert.ok(modele !== undefined && effort !== undefined && bouton !== undefined, "pas de réglage");
  return { modele, effort, bouton };
};
const choisir = (liste: Faux, valeur: string) => {
  liste.value = valeur;
  liste.declencher("change");
};

describe("la partie closer, sans closer réglé", () => {
  test("elle le dit, propose le modèle et l'effort ensemble devant un bouton recommandé, et ne montre aucun chiffre", () => {
    const racine = poser(SANS, { valeurs: CALIBRAGE });
    assert.ok(racine.dessous("p").some(({ textContent }) => textContent === SANS_CLOSER));
    const { modele, effort, bouton } = reglage(racine);
    assert.deepEqual(modele.children.map(({ textContent, value }) => [textContent, value]), [[CHOISIR_MODELE, ""], ...MODELES.map((valeur) => [valeur, valeur])]);
    assert.deepEqual(effort.children.map(({ textContent, value }) => [textContent, value]), [[CHOISIR_EFFORT, ""], ...EFFORTS.map((valeur) => [valeur, valeur])]);
    assert.equal(bouton.className, "recommande");
    assert.deepEqual(chiffres(racine), []);
    for (const absent of [MERGES, RATIO, DOUBLONS, MORTS]) assert.doesNotMatch(racine.textContent, new RegExp(absent));
    // Aucune commande à recopier : ni `station`, ni bloc de code.
    assert.deepEqual(racine.dessous("code"), []);
    assert.doesNotMatch(racine.textContent, /brigade|station|closer-/);
    // Ni liste, ni places pour le lancement ou le bilan : il n'y a pas de closer à lancer.
    assert.deepEqual(racine.dessous("button").filter(({ className }) => className === "deplier"), []);
    assert.deepEqual(racine.dessous("div").filter(({ className }) => /^closer-(lancement|bilan)$/.test(className)), []);
    // Ce que le bouton fait, et les valeurs acceptées, sont au survol, pas à plat.
    const aide = racine.dessous("button").find(({ className }) => className === "aide") ?? assert.fail("pas d'aide");
    assert.match(aide.ariaLabel, /without sending them/);
    for (const valeur of [...MODELES, ...EFFORTS]) assert.match(aide.ariaLabel, new RegExp(valeur));
  });

  test("le bouton n'agit qu'avec le modèle et l'effort choisis, et les donne ensemble", () => {
    const reglages: [string, string][] = [];
    const choix: { modele: string; effort: string }[] = [];
    const racine = poser(SANS, { valeurs: CALIBRAGE, regler: (modele, effort) => void reglages.push([modele, effort]), choisir: (pris) => void choix.push(pris) });
    const { modele, effort, bouton } = reglage(racine);
    assert.equal(bouton.disabled, true);
    bouton.declencher("click");
    choisir(modele, "sonnet");
    assert.equal(bouton.disabled, true, "un modèle sans effort ne règle rien");
    bouton.declencher("click");
    assert.deepEqual(reglages, []);
    choisir(effort, "medium");
    assert.equal(bouton.disabled, false);
    bouton.click();
    assert.deepEqual(reglages, [["sonnet", "medium"]]);
    assert.deepEqual(choix.at(-1), { modele: "sonnet", effort: "medium" });
  });

  test("ce que le chef a choisi est reposé tel quel ; une valeur que la station n'accepte pas ne l'est pas", () => {
    const repris = reglage(poser(SANS, { valeurs: CALIBRAGE, choix: { modele: "opus", effort: "high" } }));
    assert.deepEqual([repris.modele.value, repris.effort.value, repris.bouton.disabled], ["opus", "high", false]);
    const inconnu = reglage(poser(SANS, { valeurs: CALIBRAGE, choix: { modele: "gpt", effort: "high" } }));
    assert.deepEqual([inconnu.modele.value, inconnu.bouton.disabled], ["", true]);
  });
});

describe("la partie closer, pas encore lue ou ratée", () => {
  test("en route : une ligne ; ratée : une ligne, le détail au survol", () => {
    const enRoute = new Faux("section");
    enRoute.append(...poserCloser(doc, undefined));
    assert.match(enRoute.textContent, new RegExp(LECTURE));
    const ratee = new Faux("section");
    ratee.append(...poserCloser(doc, { erreur: "brigade : no log in /srv/etat" }));
    assert.match(ratee.textContent, new RegExp(ILLISIBLE));
    assert.doesNotMatch(ratee.textContent, /no log/);
  });
});

describe("la partie closer, ses lectures (#1699)", () => {
  test("elle n'est plus une page de Settings : ni onglet ni lecture du closer ne subsiste", () => {
    assert.equal(commandeDe("closer"), undefined);
    assert.deepEqual(commandesDe("closer"), []);
    assert.ok(!ONGLETS.some(({ id, titre }) => id === "closer" || titre === "Closer"));
    assert.ok(!RUBRIQUES.find(({ id }) => id === PARAMETRES)?.lectures.includes("closer"));
    assert.deepEqual(RUBRIQUES.map(({ id }) => id), [PARAMETRES]);
    assert.deepEqual(commandesDe("cooks"), []);
  });
});
