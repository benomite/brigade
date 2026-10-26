// Le bilan d'une passe finie (vue/closer/bilan/bilan.js, ticket 992) : la place reste vide tant que la
// dernière demande n'est pas finie ; finie, elle liste ce que la passe a retiré et montre la PR
// ouverte, en lien vers l'adresse que `closing --json` a rendue. Le module est lu seul, sur un faux
// document, puis la vue jouée telle qu'elle est (aides/fausse-vue.ts), sur l'onglet Cooks (#1699 : elle était sous Settings → Closer).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { PR, poserBilan, RIEN_RETIRE, RETIRE, SANS_PR, TITRE } from "../../../src/vue/closer/bilan/bilan.js";
import { Faux } from "../../aides/fausse-vue.ts";
import { DEMANDES } from "../lancement/donnees.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const URL = "https://github.com/benomite/parade/pull/77";
const FINIE = {
  ...DEMANDES.done,
  pr: URL,
  removed: [
    { id: "M1", what: "export `inutile` of `src/libre/outils.ts:2` — named nowhere else" },
    { id: "D1", what: "8 identical lines of code: `src/libre/a.ts:1-8`" },
  ],
};

const trouve = (racine: Faux, test: (noeud: Faux) => boolean): Faux[] => [racine, ...racine.children.flatMap((enfant) => trouve(enfant, test))].filter(test);

describe("le bilan d'une passe finie", () => {
  for (const [nom, demande] of Object.entries(DEMANDES)) {
    if (nom === "done") continue;
    test(`une demande « ${nom} » n'a pas de bilan`, () => {
      assert.deepEqual(poserBilan(doc, demande), []);
    });
  }

  test("finie, il liste ce que la passe a retiré", () => {
    const [bloc] = poserBilan(doc, FINIE) as [Faux];
    assert.equal(trouve(bloc, (n) => n.balise === "h3")[0]?.textContent, TITRE);
    assert.match(trouve(bloc, (n) => n.balise === "h4")[0]?.textContent ?? "", new RegExp(`^${RETIRE} \\(2\\)`));
    const lignes = trouve(bloc, (n) => n.balise === "li");
    assert.deepEqual(
      lignes.map((ligne) => ligne.textContent),
      FINIE.removed.map(({ id, what }) => `${id}${what}`),
    );
  });

  test("il montre la PR ouverte, par un lien vers l'adresse rendue", () => {
    const ouvertes: string[] = [];
    const [bloc] = poserBilan(doc, FINIE, (url) => void ouvertes.push(url)) as [Faux];
    const [lien] = trouve(bloc, (n) => n.balise === "a") as Array<Faux & { href: string }>;
    assert.equal(lien?.href, URL);
    assert.match(bloc.textContent, new RegExp(PR));
    let empeche = false;
    lien?.declencher("click", { preventDefault: () => (empeche = true) });
    assert.equal(empeche, true);
    assert.deepEqual(ouvertes, [URL]);
  });

  test("finie sans rien retirer, il le dit", () => {
    const [bloc] = poserBilan(doc, { ...FINIE, removed: [] }) as [Faux];
    assert.match(bloc.textContent, new RegExp(RIEN_RETIRE));
  });

  test("finie sans PR, aucun lien n'est montré", () => {
    for (const pr of [null, "javascript:alert(1)", "http://insecure.example/pull/1"]) {
      const [bloc] = poserBilan(doc, { ...FINIE, pr }) as [Faux];
      assert.deepEqual(trouve(bloc, (n) => n.balise === "a"), []);
      assert.match(bloc.textContent, new RegExp(SANS_PR));
    }
  });
});
