// L'étape « récap » du parcours d'ajout (ticket 2478) : le projet avec sa station, et ce qui se passe ensuite — la cuisine
// prend le premier ticket labellisé `fire`. Jamais un projet sans station et sans suite.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { CHOISIR_UNE_STATION, etapeDuRecap, poserEtapeRecap, SANS_STATION } from "../../src/vue/parcours-projet/etape-recap.js";
import { Faux } from "../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };

function monter(station?: string) {
  let retours = 0;
  const racine = poserEtapeRecap(doc, { projet: "chef/parade", ...(station === undefined ? {} : { station }), retour: () => void retours++ }) as Faux;
  const tous = [...racine.descendants()];
  const ligne = (cle: string) => tous.find((element) => element.dataset?.recap === cle);
  return { racine, tous, ligne, retours: () => retours };
}

describe("l'étape récap", () => {
  test("elle montre le nom du projet et sa station", () => {
    const { ligne } = monter("this computer");
    assert.match(ligne("projet")?.textContent ?? "", /chef\/parade/);
    assert.match(ligne("station")?.textContent ?? "", /this computer/);
  });

  test("elle dit que la cuisine prend le premier ticket labellisé fire, le label en code", () => {
    const { tous } = monter("this computer");
    const code = tous.find((element) => element.balise === "code");
    assert.equal(code?.textContent, "fire");
    assert.equal(tous.some((element) => element.className.includes("erreur")), false);
  });

  test("sans station, le projet n'est pas montré seul : la ligne le dit et un bouton revient à la station", () => {
    const { tous, ligne, retours } = monter();
    assert.equal(ligne("station"), undefined);
    assert.ok(tous.some((element) => element.textContent === SANS_STATION));
    const bouton = tous.find((element) => element.balise === "button" && element.textContent === CHOISIR_UNE_STATION);
    assert.ok(bouton);
    bouton.click?.();
    assert.equal(retours(), 1);
  });

  test("une station vide vaut une station absente", () => {
    const { ligne } = monter("  ");
    assert.equal(ligne("station"), undefined);
  });
});

describe("le descripteur du registre", () => {
  test("il pose l'étape du dépôt retenu avec sa station, et ne la dit jamais faite", () => {
    const [racine] = etapeDuRecap.poser(doc, { depot: "chef/parade", station: "this computer" }, { retour: () => {} }) as Faux[];
    const texte = [...racine!.descendants()].map((element) => element.textContent).join(" ");
    assert.match(texte, /chef\/parade/);
    assert.match(texte, /this computer/);
    assert.equal(etapeDuRecap.faite(), false);
  });

  test("sans dépôt retenu il ne pose jamais rien : il le dit, et sans station il pose le chemin de retour", () => {
    const [vide] = etapeDuRecap.poser(doc, {}, { retour: () => {} }) as Faux[];
    assert.equal([...vide!.descendants()].some((element) => element.textContent === SANS_STATION), true);
    const [racine] = etapeDuRecap.poser(doc, { depot: "chef/parade" }, { retour: () => {} }) as Faux[];
    assert.equal([...racine!.descendants()].some((element) => element.textContent === SANS_STATION), true);
  });
});
