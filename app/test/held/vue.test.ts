// Les gestes retenus dans la vue de l'app (#4273), jouée telle qu'elle est (aides/fausse-vue.ts) : à chaque lecture du rail
// du projet affiché, la vue demande ses gestes retenus au pont ; elle pose une carte par geste à côté du TODO, et le rail
// vide dit « N splits wait for your OK ». Approve passe par le pont, avec le projet et l'id : la carte approuvée part et
// ne revient pas au dessin suivant ; un refus se dit sur la carte.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBar } from "../../src/bar.ts";
import { EXEMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { KITCHEN_ACTIONS } from "../../src/kitchen.ts";
import { BANNIERE, holdFacts, type Facts } from "../../src/facts.ts";
import { CONFIRMES, DIRECTS } from "../../src/actions.ts";
import type { Approbation, ReadDesRetenus } from "../../src/held/contract.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../src/projects/projects.ts";
import type { Terminal } from "../../src/terminaux.ts";
import { type Faux, type Jouee, jouerLaVue, repos } from "../aides/fausse-vue.ts";

const PARADE = "parade";
const A = "2026-11-25T09:00:00.000Z";
const SECOND: Terminal = { id: 1, projet: PARADE, genre: "second", titre: "second · claude", note: "session neuve", arrete: false };
const demarrage = () => ({
  configuration: pourLaBar({ chemin: "/tmp/app.json", projets: [{ nom: PARADE, dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: KITCHEN_ACTIONS, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
});
const RAIL_EMPTY: Facts = { etat: "ouverte", lu: A, dernierTick: A, compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 }, dernierEvenement: null, rail: [], cooks: [], attend: [] };
const action = (id: string, epic: number) => ({ id, kind: "manager", summary: `split #${epic} into 3 tickets`, reason: "an epic split is held for the chef", approveCommand: `brigade parade manager approve ${id}`, heldAt: A });

async function ouvrir(retenus: () => ReadDesRetenus | undefined, approuver: (project: string, id: string) => Approbation): Promise<Jouee> {
  const vue = await jouerLaVue({ demarrage, espace: () => [SECOND], gestesRetenus: retenus, approuverGeste: approuver });
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  return vue;
}
async function receiveFacts(vue: Jouee): Promise<void> {
  const recue = holdFacts().recevoir({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(RAIL_EMPTY) }] });
  vue.dire("surFaits", { ...recue, demande: vue.dernier("faits")[0] as number });
  await repos();
}
const leRail = (vue: Jouee): Faux => vue.element("rail");
const cadre = (vue: Jouee): Faux | undefined => leRail(vue).dessous("div").find(({ ariaLabel }) => ariaLabel === "Held for your OK");
const cards = (vue: Jouee): Faux[] => cadre(vue)?.dessous("li") ?? [];
const phrase = (vue: Jouee) => leRail(vue).dessous("div").find(({ className }) => className === "du-rail")?.children.find((pose) => pose.balise === "p")?.textContent;

describe("les gestes retenus dans la vue du projet (#4273)", () => {
  test("lus à chaque lecture du rail : une carte par geste à côté du TODO, et le rail vide dit « N splits wait for your OK »", async () => {
    const vue = await ouvrir(() => ({ gestes: [action("3", 4129), action("4", 4130)] }), () => ({ fait: "approved" }));
    await receiveFacts(vue);
    assert.deepEqual(vue.dernier("gestesRetenus"), [PARADE]);
    assert.deepEqual(cards(vue).map((card) => card.dessous("p")[0]?.textContent), ["split #4129 into 3 tickets", "split #4130 into 3 tickets"]);
    assert.ok(cards(vue).every((card) => card.textContent.includes("an epic split is held for the chef") && card.dessous("button")[0]?.textContent === "Approve"));
    assert.equal(phrase(vue), "2 splits wait for your OK");
    assert.doesNotMatch(leRail(vue).textContent, /STOPPED — cause unknown|waits for a place in the kitchen/);
  });

  test("Approve passe par le pont avec le projet et l'id : la carte part, et ne revient pas au dessin suivant", async () => {
    const vue = await ouvrir(() => ({ gestes: [action("3", 4129), action("4", 4130)] }), () => ({ fait: "approved" }));
    await receiveFacts(vue);
    cards(vue)[0]?.dessous("button")[0]?.click();
    await repos();
    assert.deepEqual(vue.dernier("approuverGeste"), [PARADE, "3"]);
    assert.deepEqual(cards(vue).map((card) => card.dataset.geste), ["4"]);
    assert.equal(phrase(vue), "1 splits wait for your OK");
  });

  test("un refus se dit sur la carte, qui reste", async () => {
    const vue = await ouvrir(() => ({ gestes: [action("3", 4129)] }), () => ({ refus: "no pending gesture 3 — nothing is approved", detail: "" }));
    await receiveFacts(vue);
    const card = cards(vue)[0] ?? assert.fail("pas de carte");
    card.dessous("button")[0]?.click();
    await repos();
    assert.ok(card.textContent.includes("no pending gesture 3 — nothing is approved"));
    assert.deepEqual(cards(vue).map((une) => une.dataset.geste), ["3"]);
  });
});
