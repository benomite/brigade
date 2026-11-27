// Les gestes de la fiche d'un ticket (#639) : ceux qu'il est possible de faire sur lui à cet instant,
// et seulement ceux-là, chacun avec son prix — nul quand il ne coûte rien. Pour chaque état de la
// table du chef, l'ensemble exact des gestes proposés — avec les actions telles qu'elles sont
// branchées (`ACTIONS`), et une fois branchées celles qui ne le sont pas encore : WAITING (#588) et
// le navigateur (#620). Un ticket qui t'attend n'en a pas d'autres : sa carte se tranche sur elle-même.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { requestOnTheTicket, REFUSAL_CONTROL_TICKET } from "../src/request.ts";
import { holdFacts, type Facts } from "../src/facts.ts";
import { ACTIONS, type Actions, type CardTile, actionsOfCard, cardActions, PRICE } from "../src/card-actions.ts";
import { PRIORITIES } from "../src/priority.ts";

// Les actions qui attendent leur épique, branchées pour l'essai.
const ALL: Actions = { ...ACTIONS, waiting: { app: true }, navigateur: { app: true, si: (card) => card.ticket !== 99 } };

const card = (state: string | undefined, more: Partial<CardTile> = {}): CardTile => ({ ticket: 21, ...(state === undefined ? {} : { etat: state }), ouvrable: true, attendu: false, ...more });
const ids = (cardOfTicket: CardTile, actions?: Actions) => cardActions(cardOfTicket, actions).map(({ id }) => id);

describe("la table du chef : pour chaque état, l'ensemble exact des gestes proposés", () => {
  test("en attente ou BLOQUÉ : ouvrir l'issue, demander au second, changer la priorité, retirer du rail — et rien d'autre tant que #588 n'est pas branchée", () => {
    for (const state of ["en attente", "BLOQUÉ"]) {
      assert.deepEqual(ids(card(state)), ["issue", "second", "priorite", "retirer"], state);
      // #588 branchée : WAITING s'y ajoute.
      assert.deepEqual(ids(card(state), ALL), ["issue", "second", "priorite", "retirer", "waiting"], state);
    }
  });

  test("pris ou en pass : ouvrir l'issue, ouvrir la PR s'il y en a une, demander au second, changer la priorité — jamais le retirer ni le mettre en WAITING", () => {
    for (const state of ["pris", "en pass"]) {
      assert.deepEqual(ids(card(state)), ["issue", "second", "priorite"], state);
      assert.deepEqual(ids(card(state, { pr: true })), ["issue", "pr", "second", "priorite"], state);
      // #588 et #620 branchées : rien de plus.
      assert.deepEqual(ids(card(state, { pr: true }), ALL), ["issue", "pr", "second", "priorite"], state);
    }
  });

  test("servi : en plus, voir dans le navigateur — seulement une fois #620 branchée, et seulement s'il y a un écran", () => {
    const served = card("servi", { pr: true });
    assert.deepEqual(ids(served), ["issue", "pr", "second", "priorite"]);
    assert.deepEqual(ids(served, ALL), ["issue", "pr", "second", "priorite", "navigateur"]);
    // Ce que l'action demande de plus à la carte — un écran — manque : le geste n'est pas proposé.
    assert.deepEqual(ids({ ...served, ticket: 99 }, ALL), ["issue", "pr", "second", "priorite"]);
  });

  test("« ouvrir la PR » n'apparaît que si le ticket en a une qui s'ouvre ; « ouvrir l'issue », que si la sienne s'ouvre", () => {
    assert.ok(!ids(card("servi"), ALL).includes("pr"));
    assert.ok(!ids(card("servi", { pr: false }), ALL).includes("pr"), "une PR dont l'adresse n'est pas en https ne s'ouvre pas");
    assert.ok(!ids(card("en attente", { ouvrable: false }), ALL).includes("issue"));
  });

  test("qui t'attend : les gestes de tous, rien de plus — et sans mot d'état, ni priorité ni retrait", () => {
    assert.deepEqual(ids(card("en pass", { attendu: true })), ["issue", "second", "priorite"]);
    assert.deepEqual(ids(card("86", { attendu: true, ouvrable: false })), ["second", "priorite"]);
    assert.deepEqual(ids(card(undefined, { attendu: true })), ["issue", "second"]);
  });

  test("un mot que la table ne nomme pas — 86, WAITING, un mot inconnu — n'ajoute rien aux gestes de tous", () => {
    for (const state of ["86", "WAITING", "un mot inconnu"]) {
      assert.deepEqual(ids(card(state)), ["issue", "second", "priorite"], state);
      assert.deepEqual(ids(card(state), ALL), ["issue", "second", "priorite"], state);
    }
  });

  test("un geste qui ne coûte rien n'a pas de prix ; un geste qui coûte le dit en clair — et la priorité se choisit parmi les labels `prio:` que la box lit", () => {
    const all = [...cardActions(card("servi", { pr: true }), ALL), ...cardActions(card("en attente"), ALL)];
    const price = Object.fromEntries(all.map(({ id, prix: cost }) => [id, cost]));
    assert.deepEqual(price, { issue: null, pr: null, second: null, priorite: null, navigateur: null, waiting: null, retirer: PRICE.retirer });
    assert.equal(PRICE.retirer, "the ticket leaves the rail and is not cooked; its issue stays open and loses its `fire` label — put it back to bring the ticket back on the rail. Nothing is lost, nothing is spent");
    assert.deepEqual(all.find(({ id }) => id === "priorite")?.valeurs, PRIORITIES);
    assert.deepEqual(PRIORITIES, ["1", "2", "3", "4", "5", "6", "7", "8", "9", "none"]);
  });

  test("d'une carte venue de la vue : ce qui n'a pas la forme d'une carte n'a pas de geste", () => {
    for (const raw of [undefined, null, "carte", { ticket: "21" }, { ticket: 2.5 }]) assert.deepEqual(actionsOfCard(raw), [], JSON.stringify(raw));
    // Un numéro seul : ni issue qui s'ouvre, ni mot d'état — la demande au second, seule.
    assert.deepEqual(actionsOfCard({ ticket: 21 }).map(({ id }) => id), ["second"]);
    assert.deepEqual(actionsOfCard({ ticket: 21, etat: "en attente", ouvrable: true, attendu: false, attend: [] }).map(({ id }) => id), ["issue", "second", "priorite", "retirer"]);
    // Une décision que la vue enverrait encore n'ajoute rien : la carte garde les gestes de tous.
    const decision = { quoi: "remontee", motif: "still-red", cause: null, pr: "https://github.com/o/r/pull/8" };
    assert.deepEqual(actionsOfCard({ ticket: 21, etat: "86", ouvrable: true, attendu: true, decision }).map(({ id }) => id), ["issue", "second", "priorite"]);
  });
});

describe("les gestes que l'app ne joue pas : aucun bouton n'est proposé puis refusé", () => {
  test("merger la livraison se fait sur sa PR, sur GitHub : le geste n'est branché nulle part, donc jamais proposé", () => {
    assert.ok(!ids(card("86", { attendu: true, pr: true }), ALL).includes("merger" as never));
  });

  test("chaque action branchée se joue dans l'app : aucune ne part en commande de la box", () => {
    for (const [id, action] of Object.entries(ACTIONS)) assert.deepEqual(Object.keys(action), ["app"], id);
    assert.deepEqual(ACTIONS.cuisine, { app: true });
    assert.deepEqual(ACTIONS.priorite, { app: true });
    assert.deepEqual(ACTIONS.retirer, { app: true });
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
      dernierTick: null,
      compteurs: { rail: 1, auTravail: 1, aLaPass: 0, attend: 1, livres24h: 1 },
      dernierEvenement: null,
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
