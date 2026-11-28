// Les gestes de la fiche d'un ticket (#639) : ceux qu'il est possible de faire sur lui, et seulement ceux-là, chacun avec son
// prix — nul quand il ne coûte rien. Trois restent : ouvrir l'issue, ouvrir la PR mergée, demander au second.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { requestOnTheTicket, REFUSAL_CONTROL_TICKET } from "../src/request.ts";
import { holdFacts, type Facts } from "../src/facts.ts";
import { ACTIONS, type CardTile, actionsOfCard, cardActions, PRICE } from "../src/card-actions.ts";

const card = (state: string | undefined, more: Partial<CardTile> = {}): CardTile => ({ ticket: 21, ...(state === undefined ? {} : { etat: state }), ouvrable: true, attendu: false, ...more });
const ids = (cardOfTicket: CardTile) => cardActions(cardOfTicket).map(({ id }) => id);

describe("les gestes proposés sur une carte, quel que soit son état", () => {
  test("ouvrir l'issue, ouvrir la PR s'il y en a une, demander au second — dans cet ordre, pour tout mot d'état", () => {
    for (const state of ["en attente", "BLOQUÉ", "pris", "en pass", "86", "WAITING", "un mot inconnu"]) {
      assert.deepEqual(ids(card(state)), ["issue", "second"], state);
      assert.deepEqual(ids(card(state, { pr: true })), ["issue", "pr", "second"], state);
    }
    assert.deepEqual(ids(card("servi", { pr: true })), ["issue", "pr", "second"]);
  });

  test("« ouvrir la PR » n'apparaît que si le ticket en a une qui s'ouvre ; « ouvrir l'issue », que si la sienne s'ouvre", () => {
    assert.ok(!ids(card("servi")).includes("pr"));
    assert.ok(!ids(card("servi", { pr: false })).includes("pr"), "une PR dont l'adresse n'est pas en https ne s'ouvre pas");
    assert.ok(!ids(card("en attente", { ouvrable: false })).includes("issue"));
  });

  test("qui t'attend : les mêmes gestes", () => {
    assert.deepEqual(ids(card("en pass", { attendu: true })), ["issue", "second"]);
    assert.deepEqual(ids(card("86", { attendu: true, ouvrable: false })), ["second"]);
  });

  test("aucun geste ne coûte : pas de prix", () => {
    const all = cardActions(card("servi", { pr: true }));
    assert.deepEqual(Object.fromEntries(all.map(({ id, prix: cost }) => [id, cost])), { issue: null, pr: null, second: null });
    assert.deepEqual(PRICE, { issue: null, pr: null, second: null });
  });

  test("d'une carte venue de la vue : ce qui n'a pas la forme d'une carte n'a pas de geste", () => {
    for (const raw of [undefined, null, "carte", { ticket: "21" }, { ticket: 2.5 }]) assert.deepEqual(actionsOfCard(raw), [], JSON.stringify(raw));
    // Un numéro seul : ni issue qui s'ouvre, ni mot d'état — la demande au second, seule.
    assert.deepEqual(actionsOfCard({ ticket: 21 }).map(({ id }) => id), ["second"]);
    assert.deepEqual(actionsOfCard({ ticket: 21, etat: "en attente", ouvrable: true, attendu: false, attend: [] }).map(({ id }) => id), ["issue", "second"]);
  });
});

describe("les gestes que l'app ne joue pas : aucun bouton n'est proposé puis refusé", () => {
  test("chaque action branchée se joue dans l'app : aucune ne part en commande de la box", () => {
    for (const [id, action] of Object.entries(ACTIONS)) assert.deepEqual(Object.keys(action), ["app"], id);
    assert.deepEqual(Object.keys(ACTIONS), ["issue", "pr", "second"]);
  });
});

describe("la demande au second, depuis la fiche d'un ticket qui ne t'attend pas", () => {
  test("elle nomme le ticket, le projet, son mot d'état et son titre — et rien qu'elle ne sache", () => {
    const written = requestOnTheTicket("parade", 14, "pris", "Le journal en ajout seul");
    assert.ok("demande" in written);
    assert.match(written.demande, /^Le ticket #14 de parade \(« Le journal en ajout seul »\) : il est « pris » sur le rail\. Lis l'issue #14/);
    assert.match(written.demande, /n'agis pas avant mon accord\.$/);
    const withoutState = requestOnTheTicket("parade", 14);
    assert.ok("demande" in withoutState);
    assert.match(withoutState.demande, /^Le ticket #14 de parade : il n'est pas sur le rail que la station donne\./);
    assert.deepEqual(requestOnTheTicket("parade", 14, "pris", "un\ntitre"), { refus: REFUSAL_CONTROL_TICKET });
  });

  test("ce qu'elle sait du ticket vient des derniers faits lus : le rail, sinon Livré, sinon ce qui attend", () => {
    const facts: Facts = {
      etat: "ouverte",
      lu: "2026-10-13T10:04:11.000Z",
      compteurs: { rail: 1, auTravail: 1, aLaPass: 0, attend: 1, livres24h: 1 },
      rail: [{ ticket: 14, etat: "pris", titre: "Le journal", url: "https://github.com/o/r/issues/14" }],
      attend: [{ ticket: 40, titre: "", url: null }],
      livres: [{ ticket: 216, titre: "Les mesures", url: "https://github.com/o/r/issues/216", livre: "2026-10-13T10:03:58.000Z", station: "box/claude", pr: null }],
    };
    const heldOnes = holdFacts();
    heldOnes.recevoir({ projet: "parade", demande: 0, a: "2026-10-13T10:04:12.000Z", sorties: [{ commande: "facts", texte: JSON.stringify(facts) }] });
    assert.deepEqual(heldOnes.ticket("parade", 14), { etat: "pris", titre: "Le journal" });
    assert.deepEqual(heldOnes.ticket("parade", 216), { etat: "servi", titre: "Les mesures" });
    assert.deepEqual(heldOnes.ticket("parade", 40), {});
    assert.equal(heldOnes.ticket("parade", 7), undefined);
    assert.equal(heldOnes.ticket("ailleurs", 14), undefined);
  });
});
