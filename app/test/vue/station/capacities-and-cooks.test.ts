// La section « capacités et cooks » de la page d'une station (ticket 2645) : les capacités détectées et déclarées avec un
// moyen d'en déclarer une, le plafond de cooks qui se change, les projets servis avec leur part — et rien d'autre du
// projet ; sur une autre station, tout en lecture seule. Chaque réglage est une rangée de réglage (ticket 2920) : un champ
// s'applique dès qu'il change, sans « Save », et un refus se dit sous sa rangée.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { levelOf } from "../../../src/vue/levels.js";
import { IN_PROGRESS } from "../../../src/vue/station/page/apply.js";
import { CAP_WHOLE, setSection } from "../../../src/vue/station/page/sections/capacities-and-cooks.js";
import { Fake, repos } from "../../helpers/false-vue.ts";

const doc = { createElement: (balise: string) => new Fake(balise) };
const context = (here: boolean, capacitiesAndCooks: object) => ({ station: { id: "gist-mac", nom: "mac/claude" }, ici: here, lectureSeule: !here, niveau: (key: string) => levelOf(doc, key), capacitesEtCooks: capacitiesAndCooks });
const parName = (root: Fake, name: string) => root.children.flatMap((c) => (c.dataset.cle === name ? [c] : c.children.filter((l) => l.dataset.cle === name))).find(Boolean) as Fake;
// Une rangée : son nom et la marque de son niveau, sa valeur, son contrôle, puis ce que le dernier changement a rendu.
const level = (line: Fake) => line.children[0]?.children[0]?.dataset.niveau;
const value = (line: Fake) => line.children[1]?.textContent;
const below = (line: Fake) => line.children.slice(3);
const change = (entry: Fake, typed: string) => {
  entry.value = typed;
  entry.declencher("change");
};
const entries = (root: Fake): Fake[] => root.children.flatMap((c) => [...(c.balise === "input" ? [c] : []), ...entries(c)]);
const buttons = (root: Fake): Fake[] => root.children.flatMap((c) => [...(c.balise === "button" ? [c] : []), ...buttons(c)]);

const DATA = (extra: object = {}) => ({
  capacites: { detectees: ["macos", "chrome"], declarees: ["gpu"] },
  plafond: { valeur: 4 },
  projets: [{ nom: "brigade", part: 60 }, { nom: "site", part: 40 }],
  ...extra,
});

describe("la section capacités et cooks de la page d'une station", () => {
  test("cet ordinateur : capacités détectées et déclarées, et une capacité se déclare d'ici", () => {
    const declaredEntries: string[] = [];
    const root = setSection(doc, context(true, DATA({ capacites: { detectees: ["macos", "chrome"], declarees: ["gpu"], declarer: (name: string) => declaredEntries.push(name) } }))) as Fake;
    const line = parName(root, "capabilities");
    assert.equal(level(line), "machine");
    assert.deepEqual(line.children[1]?.children.map((c) => c.textContent), ["macos (detected)", "chrome (detected)", "gpu (declared)"]);
    const [entry] = entries(line);
    assert.equal(buttons(line).length, 0, "pas de bouton : le champ s'applique dès qu'il change");
    change(entry!, "chrome");
    change(entry!, "  ");
    assert.deepEqual(declaredEntries, []);
    change(entry!, " docker ");
    assert.deepEqual(declaredEntries, ["docker"]);
  });

  test("cet ordinateur : le plafond de cooks est montré et se change d'ici", () => {
    const wantedOnes: number[] = [];
    const root = setSection(doc, context(true, DATA({ plafond: { valeur: 4, regler: (v: number) => wantedOnes.push(v) } }))) as Fake;
    const line = parName(root, "cook cap");
    assert.equal(level(line), "machine");
    assert.equal(value(line), "4");
    const [entry] = entries(line);
    assert.equal(entry?.value, "4");
    change(entry!, "4");
    change(entry!, "0");
    assert.deepEqual(wantedOnes, [], "ni la même valeur ni un plafond nul ne s'envoient");
    change(entry!, "6");
    assert.deepEqual(wantedOnes, [6]);
  });

  test("aucun bouton « Save » : rien ne s'envoie avant que le champ change, et un changement s'applique aussitôt", async () => {
    const wantedOnes: number[] = [];
    let finished: (rendered: unknown) => void = () => {};
    const root = setSection(doc, context(true, DATA({ plafond: { valeur: 4, regler: (v: number) => (wantedOnes.push(v), new Promise((r) => (finished = r))) } }))) as Fake;
    assert.equal([...root.descendants()].filter((n) => n.balise === "button").length, 0);
    const line = parName(root, "cook cap");
    const [entry] = entries(line);
    entry!.value = "6";
    assert.deepEqual(wantedOnes, [], "saisir n'envoie rien");
    entry!.declencher("change");
    assert.deepEqual(wantedOnes, [6]);
    assert.equal(entry!.disabled, true, "le champ attend que le changement soit fait");
    assert.equal(below(line).map((n) => n.textContent).join(), IN_PROGRESS);
    finished(undefined);
    await repos();
    assert.equal(entry!.disabled, false);
    assert.deepEqual(below(line), []);
  });

  test("un refus se dit sous la rangée — celui de la station comme une saisie qui ne se règle pas", async () => {
    const root = setSection(doc, context(true, DATA({ plafond: { valeur: 4, regler: async () => ({ refus: "the station refused the cap", detail: "it is busy" }) } }))) as Fake;
    const line = parName(root, "cook cap");
    const [entry] = entries(line);
    change(entry!, "0");
    assert.equal(below(line)[0]?.dataset.ligne, "erreur");
    assert.ok([...below(line)[0]!.descendants()].some((n) => n.ariaLabel === CAP_WHOLE));
    change(entry!, "8");
    await repos();
    const [refusal] = below(line);
    assert.equal(refusal?.dataset.ligne, "erreur");
    assert.match(refusal!.textContent, /the station refused the cap/);
    assert.ok([...refusal!.descendants()].some((n) => n.ariaLabel === "it is busy"), "le détail au survol");
    assert.equal(entry!.disabled, false);
  });

  test("chaque projet servi est listé avec sa part de cooks, et aucun autre réglage du projet", () => {
    const root = setSection(doc, context(true, DATA())) as Fake;
    const servedOnes = root.children.find((c) => c.className === "projets-servis")!;
    assert.deepEqual(servedOnes.children.map((l) => [l.dataset.projet, level(l), value(l)]), [
      ["brigade", "machine", "60% of cooks"],
      ["site", "machine", "40% of cooks"],
    ]);
    assert.equal(buttons(servedOnes).length + entries(servedOnes).length, 0);
    assert.ok([...root.descendants()].every((n) => n.dataset.niveau !== "project"));
    assert.ok([...root.descendants()].every((n) => n.className !== "par-pr"), "rien n'est gardé dans le dépôt : aucune ligne de PR");
  });

  test("une autre station : les mêmes lignes en lecture seule — ni champ ni bouton, même avec les gestes", () => {
    const root = setSection(doc, context(false, DATA({ capacites: { detectees: ["macos"], declarer: () => assert.fail("rien ne se règle d'ici") }, plafond: { valeur: 4, regler: () => assert.fail("rien ne se règle d'ici") } }))) as Fake;
    assert.equal(buttons(root).length, 0);
    assert.equal(entries(root).length, 0);
    assert.equal(value(parName(root, "cook cap")), "4");
    assert.equal(root.children.find((c) => c.className === "projets-servis")!.children.length, 2);
  });

  test("ce que la station n'a pas dit se dit en une ligne, jamais une case vide", () => {
    const root = setSection(doc, context(false, {})) as Fake;
    assert.equal(value(parName(root, "capabilities")), "none");
    assert.equal(value(parName(root, "cook cap")), "unknown");
    assert.equal(root.children.find((c) => c.className === "projets-servis")!.textContent, "none");
  });
});
