// « Awaiting others » (#2985) : les cartes qui attendent un autre humain du projet, repliées sous leur nombre à côté de
// l'entrée « TODO (N) », hors des colonnes — TODO n'est pas une colonne (#3458) ; dépliées, chacune dit qui elle attend, et
// s'ouvre et se répond comme une carte de TODO (#3071 : l'assignation ne retient personne). Rien n'attend un autre humain :
// la section n'est pas là. Le même bloc est sur un écran étroit — le téléphone.
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

const CARTE = (question: string) => ({ type: "product", question, choix: [{ texte: "Yes.", suite: "resume" }, { texte: "No.", suite: "resume" }], captures: null });

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
    { ticket: 22, titre: "Drop the importer", url: issue(22), carte: CARTE("Drop the legacy importer?"), qui: ["bob"] },
    { ticket: 23, titre: "Open the beta", url: issue(23), carte: CARTE("Open the beta to everyone?"), qui: ["benomite", "carol"] },
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

const todo = (vue: Jouee) => vue.element("rail").dessous("div").find(({ className }) => className === "todo-du-rail") ?? assert.fail("pas de TODO");
const entree = (zone: Faux) => zone.children.find(({ className }) => className === "entree-todo")?.textContent;
const pliDe = (colonne: Faux) => colonne.children.find((enfant) => enfant.balise === "details");
const ouvert = (pli: Faux) => (pli as unknown as { open?: boolean }).open === true;
function deplier(pli: Faux) {
  (pli as unknown as { open: boolean }).open = true;
  pli.declencher("toggle");
}

describe("« Awaiting others » à côté de l'entrée TODO, hors des colonnes (#2985, #3458)", () => {
  for (const etroit of [false, true]) {
    test(`${etroit ? "écran étroit" : "écran large"} : les siennes rouges dans leur colonne, puis « Awaiting others (2) », replié, en dernier`, async () => {
      const vue = await ouvrir({ etroit });
      const colonne = todo(vue);
      const pli = pliDe(colonne) ?? assert.fail("pas de « Awaiting others »");
      const rouges = vue.element("rail").dessous("li").filter((li) => li.dataset.carte === "attente" && !pli.dessous("li").includes(li));
      assert.deepEqual(rouges.map((li) => li.children[0]?.children[0]?.textContent), ["#12"]);
      assert.equal(entree(colonne), "TODO (1)");
      assert.equal(colonne.children.at(-1), pli);
      assert.equal(pli.children[0]?.textContent, "Awaiting others (2)");
      assert.equal(ouvert(pli), false);
    });
  }

  test("déplié : chaque carte dit qui elle attend, et reste sous « Awaiting others », hors du compte de TODO", async () => {
    const colonne = todo(await ouvrir({ etroit: false }));
    const pli = pliDe(colonne) ?? assert.fail("pas de « Awaiting others »");
    deplier(pli);
    assert.deepEqual(
      pli.dessous("p").filter((p) => p.className === "qui").map((p) => p.textContent),
      ["awaits bob", "awaits benomite, carol"],
    );
    assert.deepEqual(
      pli.dessous("li").filter((li) => li.className.split(" ").includes("bon")).map((li) => li.children[0]?.children[0]?.textContent),
      ["#22", "#23"],
    );
    assert.equal(entree(colonne), "TODO (1)");
    assert.equal(pli.dessous("*").some((e) => e.textContent === "awaiting you"), false, "elles n'attendent pas le compte connecté");
  });

  for (const etroit of [false, true]) {
    test(`${etroit ? "écran étroit" : "écran large"} : une carte d'autrui porte sa question, ses choix et le champ de réponse de TODO, et s'ouvre d'un clic (#3071)`, async () => {
      const vue = await ouvrir({ etroit });
      const pli = pliDe(todo(vue)) ?? assert.fail("pas de « Awaiting others »");
      deplier(pli);
      const bon = pli.dessous("li").find((li) => li.className.split(" ").includes("bon") && li.children[0]?.children[0]?.textContent === "#22") ?? assert.fail("pas de #22");
      const carte = bon.dessous("section").find((c) => c.className === "carte-todo") ?? assert.fail("pas de carte de TODO sur #22");
      assert.deepEqual(carte.dessous("button").filter((b) => b.className === "choix").map((b) => b.textContent), ["Yes.", "No."]);
      assert.equal(carte.dessous("textarea").length, 1);
      assert.equal(vue.element("fiche").hidden, true);
      bon.click();
      assert.equal(vue.element("fiche").hidden, false);
    });
  }

  test("aucune carte sous le rail : #22, mise de côté, n'est que dans « Awaiting others »", async () => {
    const vue = await ouvrir({ etroit: false });
    assert.equal(vue.element("rail").textContent.includes("outside the columns"), false);
    const pli = pliDe(todo(vue)) ?? assert.fail("pas de « Awaiting others »");
    const bons = vue.element("rail").dessous("li").filter((li) => li.className.split(" ").includes("bon") && !pli.dessous("li").includes(li)).map((li) => li.children[0]?.children[0]?.textContent);
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
