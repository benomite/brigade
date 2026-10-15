// Une base rouge que son ticket de réparation travaille : `status` l'écrit en tête, d'une seule
// ligne, hors du bloc `attend` — rien n'y attend le chef —, et la carte du projet la pose
// telle quelle. Verte, ou réparation échouée, elle n'est plus lue nulle part : c'est la ligne
// `base` du bloc `attend` qui prend le relais (base-rouge.test.ts).
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import type { Fait } from "../../runtime/src/evenements.ts";
import { ouvrirJournal } from "../../runtime/src/journal.ts";
import { principal as status } from "../../runtime/src/status.ts";
import { ALLUMAGE } from "../src/allumage.ts";
import { mettreAPart } from "../src/attend.ts";
import { pourLaBarre } from "../src/barre.ts";
import { BOUTONS } from "../src/boutons.ts";
import type { Lecture } from "../src/box.ts";
import { EXEMPLE } from "../src/config.ts";
import { PALETTE } from "../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../src/cuisine.ts";
import { BANNIERE, tenirFaits, type Dessinable, type Faits } from "../src/faits.ts";
import { CONFIRMES, DIRECTS, GRANTS } from "../src/gestes.ts";
import { GESTES_DES_GRANTS } from "../src/grants.ts";
import { EFFORTS, MODELES } from "../src/installation.ts";
import { GESTES_DU_MANAGER } from "../src/manager.ts";
import { ONGLETS, RUBRIQUES } from "../src/onglets.ts";
import type { Terminal } from "../src/terminaux.ts";
import { jouerLaVue, repos } from "./aides/fausse-vue.ts";

const PARADE = "parade";
const HEURE_MS = 3_600_000;
const LIGNE = "rien ne cuit : base rouge depuis 3 h 00, réparation #501 en cours";

// Une base rouge depuis trois heures, dont le ticket de réparation #501 est ouvert.
// `echouee` : il a quitté le rail sans être servi. `verte` : la base a été revue au vert.
function cuisine(t: TestContext, { echouee = false, verte = false } = {}) {
  const repertoire = mkdtempSync(join(tmpdir(), "brigade-app-rien-ne-cuit-"));
  t.after(() => rmSync(repertoire, { recursive: true, force: true }));
  const journal = ouvrirJournal(repertoire, { maintenant: () => new Date(Date.now() - 3 * HEURE_MS) });
  const noter = (fait: Fait, ticket: number | null = null, author = "pass") => journal.ajouter({ project: PARADE, ticket, author, ...fait });
  const gates = { outcome: "red" as const, code: 1, failures: ["FAIL  tests du runtime en échec"], tail: "" };
  noter({ type: "base.checked", payload: { sha: "ba5e0001ffff", outcome: "red", gates, tickets: [] } });
  noter({ type: "base.recheck-requested", payload: {} });
  noter({ type: "base.checked", payload: { sha: "ba5e0001ffff", outcome: "red", gates, tickets: [] } });
  noter({ type: "base.repair-opening", payload: { sha: "ba5e0001ffff" } });
  noter({ type: "base.repair-opened", payload: { sha: "ba5e0001ffff", failures: ["tests du runtime en échec"], reconciled: false } }, 501);
  noter({ type: "ticket.arrived", payload: { title: "Réparer la base `v2`", priority: 0, createdAt: "2026-10-01T00:00:00Z", url: "https://exemple.test/501" } }, 501, "github");
  if (echouee) noter({ type: "ticket.left", payload: { reason: "closed" } }, 501, "github");
  if (verte) noter({ type: "base.checked", payload: { sha: "ba5e0002ffff", outcome: "green", gates: { outcome: "green", code: 0, failures: [], tail: "" }, tickets: [] } });
  journal.fermer();
  let texte = "";
  const ecrire = (ligne: string) => void (texte += `${ligne}\n`);
  status({ args: [], env: { BRIGADE_STATE_DIR: repertoire }, dire: ecrire, redire: ecrire });
  return texte;
}

const lue = (texte: string): Lecture => ({ projet: PARADE, demande: 1, a: "2026-10-14T10:00:00.000Z", sorties: [{ commande: "status", texte }] });
const FAITS: Faits = {
  etat: "retenue",
  lu: "2026-10-14T10:00:00.000Z",
  dernierTick: null,
  compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 },
  dernierEvenement: null,
  rail: [],
};
// La carte telle que l'app la reçoit : les faits d'abord, puis le `status` de la même box.
function dessinee(texte: string): Dessinable {
  const faits = tenirFaits();
  faits.recevoir({ projet: PARADE, demande: 1, a: "2026-10-14T10:00:00.000Z", sorties: [{ commande: "facts", texte: JSON.stringify(FAITS) }] });
  return faits.attendre(mettreAPart(lue(texte))) ?? assert.fail("rien n'est redessiné");
}
const tableauDe = (dessinable: Dessinable) => ("tableau" in dessinable ? dessinable.tableau : assert.fail("pas de tableau"));

const SECOND: Terminal = { id: 1, projet: PARADE, genre: "second", titre: "second · claude", note: "session neuve", arrete: false };
const REPONSES = {
  demarrage: () => ({
    configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [{ nom: PARADE, dossier: "/tmp/parade", box: { hote: "box" } }], hotes: ["box"] }),
    palette: PALETTE,
    exemple: EXEMPLE,
    onglets: ONGLETS, rubriques: RUBRIQUES,
    boutons: BOUTONS,
    gestes: { manager: GESTES_DU_MANAGER, allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, grants: { gestes: GESTES_DES_GRANTS, nommes: GRANTS }, directs: DIRECTS, confirmes: CONFIRMES },
    banniere: BANNIERE,
    calibrage: { modeles: MODELES, efforts: EFFORTS },
    code: undefined,
  }),
  espace: () => [SECOND],
};

describe("rien ne cuit : base rouge, réparation en cours", () => {
  test("`status` écrit la ligne en première ligne, avec la durée et le numéro de la réparation", (t) => {
    assert.equal(cuisine(t).split("\n")[0], LIGNE);
  });

  test("la carte la pose en une seule ligne, et le bloc `attend` ne la contient pas", async (t) => {
    const texte = cuisine(t);
    const montree = mettreAPart(lue(texte));
    assert.ok("attend" in montree && montree.attend !== undefined);
    assert.ok(!montree.attend.includes("rien ne cuit"));
    assert.deepEqual(montree.sorties.flatMap(({ texte }) => texte.split("\n").filter((ligne) => ligne.startsWith("rien ne cuit"))), [LIGNE]);

    const dessinable = dessinee(texte);
    assert.equal(tableauDe(dessinable).rienNeCuit, LIGNE);

    const vue = await jouerLaVue(REPONSES);
    (vue.element("projets").children.at(1) ?? assert.fail("pas de case pour parade")).click();
    await repos();
    vue.dire("surFaits", { ...dessinable, demande: vue.dernier("faits")[0] as number });
    const posees = vue.element("carte").dessous("p").filter((p) => p.textContent === LIGNE);
    assert.equal(posees.length, 1);
    assert.ok(!posees[0]?.textContent.includes("\n"));
  });

  test("la base verte, ni `status` ni la carte ne la portent", (t) => {
    const texte = cuisine(t, { verte: true });
    assert.ok(!texte.includes("rien ne cuit"));
    assert.equal(tableauDe(dessinee(texte)).rienNeCuit, undefined);
  });

  test("la réparation échouée, la ligne ne dit plus « réparation en cours » : la ligne `base` du bloc `attend` prend le relais", (t) => {
    const texte = cuisine(t, { echouee: true });
    assert.ok(!texte.includes("rien ne cuit"));
    assert.ok(!/réparation #501 en cours/.test(texte));
    assert.match(texte, /^ {2}base {2}/m);
    assert.equal(tableauDe(dessinee(texte)).rienNeCuit, undefined);
  });
});
