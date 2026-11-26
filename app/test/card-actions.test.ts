// Les gestes de la fiche d'un ticket (#639) : ceux qu'il est possible de faire sur lui à cet instant,
// et seulement ceux-là, chacun avec son prix — nul quand il ne coûte rien. Pour chaque état de la
// table du chef, l'ensemble exact des gestes proposés — avec les actions telles qu'elles sont
// branchées (`ACTIONS`), et une fois branchées celles qui ne le sont pas encore : WAITING (#588) et
// le navigateur (#620). Et, sur un ticket qui t'attend, ceux qui tranchent la décision (#832).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { requestSurLeTicket, REFUSAL_CONTROLE_TICKET } from "../src/request.ts";
import { holdFacts, type Facts } from "../src/facts.ts";
import type { Decision } from "../src/decision.ts";
import { ACTIONS, type Actions, type CardTile, actionsDeCard, cardActions, PRIX } from "../src/card-actions.ts";
import { PRIORITES } from "../src/priority.ts";

// Les actions qui attendent leur épique, branchées pour l'essai.
const TOUT: Actions = { ...ACTIONS, waiting: { app: true }, navigateur: { app: true, si: (card) => card.ticket !== 99 } };

const card = (state: string | undefined, plus: Partial<CardTile> = {}): CardTile => ({ ticket: 21, ...(state === undefined ? {} : { etat: state }), ouvrable: true, attendu: false, ...plus });
const ids = (cardDuTicket: CardTile, actions?: Actions) => cardActions(cardDuTicket, actions).map(({ id }) => id);

describe("la table du chef : pour chaque état, l'ensemble exact des gestes proposés", () => {
  test("en attente ou BLOQUÉ : ouvrir l'issue, demander au second, changer la priorité, retirer du rail — et rien d'autre tant que #588 n'est pas branchée", () => {
    for (const state of ["en attente", "BLOQUÉ"]) {
      assert.deepEqual(ids(card(state)), ["issue", "second", "priorite", "retirer"], state);
      // #588 branchée : WAITING s'y ajoute.
      assert.deepEqual(ids(card(state), TOUT), ["issue", "second", "priorite", "retirer", "waiting"], state);
    }
  });

  test("pris ou en pass : ouvrir l'issue, ouvrir la PR s'il y en a une, demander au second, changer la priorité — jamais le retirer ni le mettre en WAITING", () => {
    for (const state of ["pris", "en pass"]) {
      assert.deepEqual(ids(card(state)), ["issue", "second", "priorite"], state);
      assert.deepEqual(ids(card(state, { pr: true })), ["issue", "pr", "second", "priorite"], state);
      // #588 et #620 branchées : rien de plus.
      assert.deepEqual(ids(card(state, { pr: true }), TOUT), ["issue", "pr", "second", "priorite"], state);
    }
  });

  test("servi : en plus, voir dans le navigateur — seulement une fois #620 branchée, et seulement s'il y a un écran", () => {
    const served = card("servi", { pr: true });
    assert.deepEqual(ids(served), ["issue", "pr", "second", "priorite"]);
    assert.deepEqual(ids(served, TOUT), ["issue", "pr", "second", "priorite", "navigateur"]);
    // Ce que l'action demande de plus à la carte — un écran — manque : le geste n'est pas proposé.
    assert.deepEqual(ids({ ...served, ticket: 99 }, TOUT), ["issue", "pr", "second", "priorite"]);
  });

  test("« ouvrir la PR » n'apparaît que si le ticket en a une qui s'ouvre ; « ouvrir l'issue », que si la sienne s'ouvre", () => {
    assert.ok(!ids(card("servi"), TOUT).includes("pr"));
    assert.ok(!ids(card("servi", { pr: false }), TOUT).includes("pr"), "une PR dont l'adresse n'est pas en https ne s'ouvre pas");
    assert.ok(!ids(card("en attente", { ouvrable: false }), TOUT).includes("issue"));
  });

  test("qui t'attend : d'abord les gestes qui tranchent la décision, le premier recommandé — puis ceux de tous, chacun une fois", () => {
    const renonce: Decision = { quoi: "remontee", motif: "still-red", cause: "manager-escalated", pr: "https://github.com/o/r/pull/8" };
    const proposes = cardActions(card("86", { attendu: true, decision: renonce }));
    assert.deepEqual(
      proposes.map(({ id, libelle, recommande }) => [id, libelle, recommande === true]),
      [
        ["retirer", "remove from the rail", true],
        ["issue", "open the issue", false],
        ["second", "ask the second", false],
        ["priorite", "change the priority", false],
      ],
    );
    // En attente, le retrait que la table donne déjà n'est posé qu'une fois, à la place de la décision.
    assert.deepEqual(ids(card("en attente", { attendu: true, decision: { ...renonce, pr: null } })), ["retirer", "issue", "second", "priorite"]);
    // Revenu de WAITING : le renvoyer en cuisine, recommandé.
    const repris = cardActions(card("86", { attendu: true, decision: { quoi: "repris", motif: null, cause: null, pr: null } }));
    assert.deepEqual(repris.map(({ id }) => id), ["cuisine", "retirer", "issue", "second", "priorite"]);
    assert.equal(repris[0]?.recommande, true);
    // L'issue recommandée ne se propose que si elle s'ouvre.
    assert.deepEqual(ids(card("86", { attendu: true, ouvrable: false, decision: { quoi: "86", motif: "no-calibration", cause: null, pr: null } })), ["second", "priorite"]);
    // Un ticket qui t'attend sans être sur le rail : ni priorité, ni retrait — il n'y a pas de mot d'état.
    assert.deepEqual(ids(card(undefined, { attendu: true, decision: { quoi: "ecartee", motif: "question", cause: null, pr: null } })), ["issue", "second"]);
    // Sans décision — une box d'avant ce champ —, rien de plus que les gestes de tous.
    assert.deepEqual(ids(card("en pass", { attendu: true })), ["issue", "second", "priorite"]);
    // Une décision sur une carte qui ne t'attend pas n'ajoute rien.
    assert.deepEqual(ids(card("en pass", { decision: renonce })), ["issue", "second", "priorite"]);
  });

  test("un mot que la table ne nomme pas — 86, WAITING, un mot inconnu — n'ajoute rien aux gestes de tous", () => {
    for (const state of ["86", "WAITING", "un mot inconnu"]) {
      assert.deepEqual(ids(card(state)), ["issue", "second", "priorite"], state);
      assert.deepEqual(ids(card(state), TOUT), ["issue", "second", "priorite"], state);
    }
  });

  test("un geste qui ne coûte rien n'a pas de prix ; un geste qui coûte le dit en clair — et la priorité se choisit parmi les labels `prio:` que la box lit", () => {
    const renonce: Decision = { quoi: "remontee", motif: "still-red", cause: null, pr: "https://github.com/o/r/pull/8" };
    const tous = [
      ...cardActions(card("servi", { pr: true }), TOUT),
      ...cardActions(card("en attente"), TOUT),
      ...cardActions(card("86", { attendu: true, decision: renonce })),
      ...cardActions(card("86", { attendu: true, decision: { quoi: "repris", motif: null, cause: null, pr: null } })),
    ];
    const prix = Object.fromEntries(tous.map(({ id, prix: cost }) => [id, cost]));
    assert.deepEqual(prix, { issue: null, pr: null, second: null, priorite: null, navigateur: null, waiting: null, retirer: PRIX.retirer, cuisine: PRIX.cuisine });
    assert.equal(PRIX.retirer, "the ticket leaves the rail and is not cooked; its issue stays open and loses its `fire` label — put it back to bring the ticket back on the rail. Nothing is lost, nothing is spent");
    assert.deepEqual(tous.find(({ id }) => id === "priorite")?.valeurs, PRIORITES);
    assert.deepEqual(PRIORITES, ["1", "2", "3", "4", "5", "6", "7", "8", "9", "none"]);
  });

  test("d'une carte venue de la vue : ce qui n'a pas la forme d'une carte n'a pas de geste", () => {
    for (const brut of [undefined, null, "carte", { ticket: "21" }, { ticket: 2.5 }]) assert.deepEqual(actionsDeCard(brut), [], JSON.stringify(brut));
    // Un numéro seul : ni issue qui s'ouvre, ni mot d'état — la demande au second, seule.
    assert.deepEqual(actionsDeCard({ ticket: 21 }).map(({ id }) => id), ["second"]);
    assert.deepEqual(actionsDeCard({ ticket: 21, etat: "en attente", ouvrable: true, attendu: false, attend: [] }).map(({ id }) => id), ["issue", "second", "priorite", "retirer"]);
    // Une décision qui n'en a pas la forme est ignorée : la carte garde les gestes de tous.
    const decision = { quoi: "remontee", motif: "still-red", cause: null, pr: "https://github.com/o/r/pull/8" };
    assert.deepEqual(actionsDeCard({ ticket: 21, etat: "86", ouvrable: true, attendu: true, decision }).map(({ id }) => id), ["retirer", "issue", "second", "priorite"]);
    assert.deepEqual(actionsDeCard({ ticket: 21, etat: "86", ouvrable: true, attendu: true, decision: { ...decision, pr: 8 } }).map(({ id }) => id), ["issue", "second", "priorite"]);
  });
});

describe("les gestes que l'app ne joue pas : aucun bouton n'est proposé puis refusé", () => {
  test("merger la livraison se fait sur sa PR, sur GitHub : le geste n'est branché nulle part, donc jamais proposé", () => {
    const renonce: Decision = { quoi: "remontee", motif: "still-red", cause: null, pr: "https://github.com/o/r/pull/8" };
    assert.ok(!ids(card("86", { attendu: true, decision: renonce })).includes("merger" as never));
    assert.ok(!ids(card("86", { attendu: true, decision: { quoi: "verte", motif: null, cause: null, pr: "https://github.com/o/r/pull/8" } })).includes("merger" as never));
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
    const ecrit = requestSurLeTicket("parade", 14, "pris", "Le journal en ajout seul");
    assert.ok("demande" in ecrit);
    assert.match(ecrit.demande, /^Le ticket #14 de parade \(« Le journal en ajout seul »\) : il est « pris » sur le rail\. Lis l'issue #14/);
    assert.match(ecrit.demande, /n'agis pas avant mon accord\.$/);
    const sansState = requestSurLeTicket("parade", 14);
    assert.ok("demande" in sansState);
    assert.match(sansState.demande, /^Le ticket #14 de parade : il n'est pas sur le rail que la station donne\./);
    assert.deepEqual(requestSurLeTicket("parade", 14, "pris", "un\ntitre"), { refus: REFUSAL_CONTROLE_TICKET });
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
    const tenus = holdFacts();
    tenus.recevoir({ projet: "parade", demande: 0, a: "2026-10-13T10:04:12.000Z", sorties: [{ commande: "facts", texte: JSON.stringify(facts) }] });
    assert.deepEqual(tenus.ticket("parade", 14), { etat: "pris", titre: "Le journal" });
    assert.deepEqual(tenus.ticket("parade", 216), { etat: "servi", titre: "Les mesures" });
    assert.deepEqual(tenus.ticket("parade", 40), {});
    assert.equal(tenus.ticket("parade", 7), undefined);
    assert.equal(tenus.ticket("ailleurs", 14), undefined);
  });
});
