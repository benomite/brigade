// Les gestes retenus dans la vue de l'app (#4273), jouée telle qu'elle est (aides/fausse-vue.ts) : à chaque lecture du rail
// du projet affiché, la vue demande ses gestes retenus au pont ; elle pose une carte par geste à côté du TODO, et le rail
// vide dit « N splits wait for your OK ». Approve passe par le pont, avec le projet et l'id : la carte approuvée part et
// ne revient pas au dessin suivant ; un refus se dit sur la carte.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBarre } from "../../src/barre.ts";
import { EXEMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../src/cuisine.ts";
import { BANNIERE, tenirFaits, type Faits } from "../../src/faits.ts";
import { CONFIRMES, DIRECTS } from "../../src/gestes.ts";
import type { Approbation, LectureDesRetenus } from "../../src/held/contrat.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../src/projets/projets.ts";
import type { Terminal } from "../../src/terminaux.ts";
import { type Faux, type Jouee, jouerLaVue, repos } from "../aides/fausse-vue.ts";

const PARADE = "parade";
const A = "2026-11-25T09:00:00.000Z";
const SECOND: Terminal = { id: 1, projet: PARADE, genre: "second", titre: "second · claude", note: "session neuve", arrete: false };
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
const RAIL_VIDE: Faits = { etat: "ouverte", lu: A, dernierTick: A, compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 }, dernierEvenement: null, rail: [], cooks: [], attend: [] };
const geste = (id: string, epique: number) => ({ id, kind: "manager", summary: `split #${epique} into 3 tickets`, reason: "an epic split is held for the chef", approveCommand: `brigade parade manager approve ${id}`, heldAt: A });

async function ouvrir(retenus: () => LectureDesRetenus | undefined, approuver: (projet: string, id: string) => Approbation): Promise<Jouee> {
  const vue = await jouerLaVue({ demarrage, espace: () => [SECOND], gestesRetenus: retenus, approuverGeste: approuver });
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  return vue;
}
async function recevoirFaits(vue: Jouee): Promise<void> {
  const recue = tenirFaits().recevoir({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(RAIL_VIDE) }] });
  vue.dire("surFaits", { ...recue, demande: vue.dernier("faits")[0] as number });
  await repos();
}
const leRail = (vue: Jouee): Faux => vue.element("rail");
const cadre = (vue: Jouee): Faux | undefined => leRail(vue).dessous("div").find(({ ariaLabel }) => ariaLabel === "Held for your OK");
const cartes = (vue: Jouee): Faux[] => cadre(vue)?.dessous("li") ?? [];
const phrase = (vue: Jouee) => leRail(vue).dessous("div").find(({ className }) => className === "du-rail")?.children.find((pose) => pose.balise === "p")?.textContent;

describe("les gestes retenus dans la vue du projet (#4273)", () => {
  test("lus à chaque lecture du rail : une carte par geste à côté du TODO, et le rail vide dit « N splits wait for your OK »", async () => {
    const vue = await ouvrir(() => ({ gestes: [geste("3", 4129), geste("4", 4130)] }), () => ({ fait: "approved" }));
    await recevoirFaits(vue);
    assert.deepEqual(vue.dernier("gestesRetenus"), [PARADE]);
    assert.deepEqual(cartes(vue).map((carte) => carte.dessous("p")[0]?.textContent), ["split #4129 into 3 tickets", "split #4130 into 3 tickets"]);
    assert.ok(cartes(vue).every((carte) => carte.textContent.includes("an epic split is held for the chef") && carte.dessous("button")[0]?.textContent === "Approve"));
    assert.equal(phrase(vue), "2 splits wait for your OK");
    assert.doesNotMatch(leRail(vue).textContent, /STOPPED — cause unknown|waits for a place in the kitchen/);
  });

  test("Approve passe par le pont avec le projet et l'id : la carte part, et ne revient pas au dessin suivant", async () => {
    const vue = await ouvrir(() => ({ gestes: [geste("3", 4129), geste("4", 4130)] }), () => ({ fait: "approved" }));
    await recevoirFaits(vue);
    cartes(vue)[0]?.dessous("button")[0]?.click();
    await repos();
    assert.deepEqual(vue.dernier("approuverGeste"), [PARADE, "3"]);
    assert.deepEqual(cartes(vue).map((carte) => carte.dataset.geste), ["4"]);
    assert.equal(phrase(vue), "1 splits wait for your OK");
  });

  test("un refus se dit sur la carte, qui reste", async () => {
    const vue = await ouvrir(() => ({ gestes: [geste("3", 4129)] }), () => ({ refus: "no pending gesture 3 — nothing is approved", detail: "" }));
    await recevoirFaits(vue);
    const carte = cartes(vue)[0] ?? assert.fail("pas de carte");
    carte.dessous("button")[0]?.click();
    await repos();
    assert.ok(carte.textContent.includes("no pending gesture 3 — nothing is approved"));
    assert.deepEqual(cartes(vue).map((une) => une.dataset.geste), ["3"]);
  });
});
