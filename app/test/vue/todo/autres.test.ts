// « Awaiting others » au pied de TODO (#2985) : les cartes qui attendent un autre humain du projet ferment la colonne,
// repliées sous leur nombre ; dépliées, chacune dit sa question et qui elle attend, sans rien pour y répondre. Rien
// n'attend un autre humain : la section n'est pas là. Le même bloc ferme TODO sur un écran étroit — le téléphone.
// La vue est jouée telle qu'elle est (aides/fausse-vue.ts), sur les faits que le process principal range (faits.ts).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ALLUMAGE } from "../../../src/allumage.ts";
import { pourLaBarre } from "../../../src/barre.ts";
import { EXEMPLE } from "../../../src/config.ts";
import { PALETTE } from "../../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../../src/cuisine.ts";
import { BANNIERE, tenirFaits, type Faits } from "../../../src/faits.ts";
import { CONFIRMES, DIRECTS } from "../../../src/gestes.ts";
import { ONGLETS, RUBRIQUES } from "../../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../../src/projets/projets.ts";
import { FauxEcran, type Faux, type Jouee, jouerLaVue, repos } from "../../aides/fausse-vue.ts";

const A = "2026-11-09T10:04:12.000Z";
const PARADE = "parade";
const issue = (ticket: number) => `https://github.com/chef/parade/issues/${ticket}`;
const demarrage = () => ({
  configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [{ nom: PARADE, dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
});

// #12 attend le compte connecté ; #22, mis de côté sur le rail, attend bob ; #23 attend le chef et carol.
const FAITS: Faits = {
  etat: "ouverte",
  lu: "2026-11-09T10:04:11.000Z",
  dernierTick: null,
  compteurs: { rail: 2, auTravail: 0, aLaPass: 0, attend: 1, livres24h: 0 },
  dernierEvenement: null,
  rail: [
    { ticket: 21, etat: "en attente", titre: "L'export du journal", url: issue(21), activite: null },
    { ticket: 22, etat: "86", titre: "Drop the importer", url: issue(22), activite: null },
  ],
  attend: [{ ticket: 12, titre: "Validation SIRET", url: issue(12) }],
  attendAutres: [
    { ticket: 22, titre: "Drop the importer", url: issue(22), question: "Drop the legacy importer?", qui: ["bob"] },
    { ticket: 23, titre: "Open the beta", url: issue(23), question: "Open the beta to everyone?", qui: ["benomite", "carol"] },
  ],
};

async function ouvrir({ etroit, faits = FAITS }: { etroit: boolean; faits?: Faits }): Promise<Jouee> {
  const vue = await jouerLaVue({ demarrage, espace: () => [], machines: () => [] }, { ecran: new FauxEcran(etroit) });
  (vue.element("projets").children.at(1) ?? assert.fail("pas de case pour parade")).click();
  await repos();
  recevoir(vue, faits);
  return vue;
}
function recevoir(vue: Jouee, faits: Faits) {
  const recue = tenirFaits(() => new Map()).recevoir({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(faits) }] });
  vue.dire("surFaits", { ...recue, demande: vue.dernier("faits")[0] as number });
}

const todo = (vue: Jouee) => vue.element("rail").dessous("section").find((colonne) => colonne.className === "colonne" && "attend" in colonne.dataset) ?? assert.fail("pas de TODO");
const pliDe = (colonne: Faux) => colonne.children.find((enfant) => enfant.balise === "details");
const ouvert = (pli: Faux) => (pli as unknown as { open?: boolean }).open === true;
function deplier(pli: Faux) {
  (pli as unknown as { open: boolean }).open = true;
  pli.declencher("toggle");
}

describe("« Awaiting others » ferme TODO (#2985)", () => {
  for (const etroit of [false, true]) {
    test(`${etroit ? "écran étroit" : "écran large"} : les siennes d'abord, puis « Awaiting others (2) », replié, en dernier`, async () => {
      const colonne = todo(await ouvrir({ etroit }));
      const cartes = colonne.dessous("li").filter((li) => li.className.split(" ").includes("bon"));
      assert.deepEqual(cartes.map((li) => li.children[0]?.children[0]?.textContent), ["#12"]);
      assert.equal(colonne.children[0]?.children[1]?.textContent, "1");
      const pli = pliDe(colonne) ?? assert.fail("pas de « Awaiting others »");
      assert.equal(colonne.children.at(-1), pli);
      assert.equal(pli.children[0]?.textContent, "Awaiting others (2)");
      assert.equal(ouvert(pli), false);
    });
  }

  test("déplié : chaque carte dit sa question et qui elle attend, et rien ne s'y répond", async () => {
    const pli = pliDe(todo(await ouvrir({ etroit: false }))) ?? assert.fail("pas de « Awaiting others »");
    deplier(pli);
    assert.deepEqual(
      pli.dessous("li").map((li) => li.children.map((enfant) => enfant.textContent)),
      [
        ["#22", "Drop the legacy importer?", "awaits bob"],
        ["#23", "Open the beta to everyone?", "awaits benomite, carol"],
      ],
    );
    assert.deepEqual([...pli.dessous("button"), ...pli.dessous("input"), ...pli.dessous("textarea")], []);
  });

  test("aucune carte sous le rail : #22, mise de côté, n'est que dans « Awaiting others »", async () => {
    const vue = await ouvrir({ etroit: false });
    assert.equal(vue.element("rail").textContent.includes("outside the columns"), false);
    const bons = vue.element("rail").dessous("li").filter((li) => li.className.split(" ").includes("bon")).map((li) => li.children[0]?.children[0]?.textContent);
    assert.equal(bons.includes("#22"), false);
  });

  test("déplié, il le reste à la lecture suivante", async () => {
    const vue = await ouvrir({ etroit: false });
    deplier(pliDe(todo(vue)) ?? assert.fail("pas de « Awaiting others »"));
    recevoir(vue, FAITS);
    assert.equal(ouvert(pliDe(todo(vue)) ?? assert.fail("pas de « Awaiting others »")), true);
  });

  test("rien n'attend un autre humain : pas de « Awaiting others », TODO vide compris", async () => {
    const { attendAutres: _, ...sans } = FAITS;
    assert.equal(pliDe(todo(await ouvrir({ etroit: false, faits: sans }))), undefined);
    const seuls = await ouvrir({ etroit: true, faits: { ...FAITS, attend: [], compteurs: { ...FAITS.compteurs, attend: 0 } } });
    assert.equal(pliDe(todo(seuls))?.children[0]?.textContent, "Awaiting others (2)");
    assert.equal(pliDe(todo(await ouvrir({ etroit: true, faits: { ...sans, attend: [] } }))), undefined);
  });
});
