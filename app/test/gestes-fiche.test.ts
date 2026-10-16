// Les gestes de la fiche d'un ticket (#639) : ceux qu'il est possible de faire sur lui à cet instant,
// et seulement ceux-là, chacun avec son prix — nul quand il ne coûte rien. Pour chaque état de la
// table du chef, l'ensemble exact des gestes proposés — avec les actions telles qu'elles sont
// branchées (`ACTIONS`), et une fois branchées celles qui ne le sont pas encore : WAITING (#588) et
// le navigateur (#620). Et, sur un ticket qui t'attend, ceux qui tranchent la décision (#832).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Projet } from "../src/config.ts";
import { demandeSurLeTicket, REFUS_CONTROLE_TICKET } from "../src/demande.ts";
import { tenirFaits, type Faits } from "../src/faits.ts";
import type { Decision } from "../src/decision.ts";
import { ACTIONS, type Actions, type CarteDeFiche, gestesDeCarte, gestesDeLaFiche, jouerGesteDeFiche, PRIORITES, PRIX } from "../src/gestes-fiche.ts";
import type { Terminal } from "../src/terminaux.ts";

const PARADE: Projet = { nom: "parade", dossier: "/projets/parade", box: { hote: "box" } };
const SECOND: Terminal = { id: 1, projet: "parade", genre: "second", titre: "second · claude", note: "", arrete: false };

// Les actions qui attendent leur épique, branchées pour l'essai.
const TOUT: Actions = { ...ACTIONS, waiting: { app: true }, navigateur: { app: true, si: (carte) => carte.ticket !== 99 } };

const carte = (etat: string | undefined, plus: Partial<CarteDeFiche> = {}): CarteDeFiche => ({ ticket: 21, ...(etat === undefined ? {} : { etat }), ouvrable: true, attendu: false, ...plus });
const ids = (carteDuTicket: CarteDeFiche, actions?: Actions) => gestesDeLaFiche(carteDuTicket, actions).map(({ id }) => id);

describe("la table du chef : pour chaque état, l'ensemble exact des gestes proposés", () => {
  test("en attente ou BLOQUÉ : ouvrir l'issue, demander au second, changer la priorité, retirer du rail — et rien d'autre tant que #588 n'est pas branchée", () => {
    for (const etat of ["en attente", "BLOQUÉ"]) {
      assert.deepEqual(ids(carte(etat)), ["issue", "second", "priorite", "retirer"], etat);
      // #588 branchée : WAITING s'y ajoute.
      assert.deepEqual(ids(carte(etat), TOUT), ["issue", "second", "priorite", "retirer", "waiting"], etat);
    }
  });

  test("pris ou en pass : ouvrir l'issue, ouvrir la PR s'il y en a une, demander au second, changer la priorité — jamais le retirer ni le mettre en WAITING", () => {
    for (const etat of ["pris", "en pass"]) {
      assert.deepEqual(ids(carte(etat)), ["issue", "second", "priorite"], etat);
      assert.deepEqual(ids(carte(etat, { pr: true })), ["issue", "pr", "second", "priorite"], etat);
      // #588 et #620 branchées : rien de plus.
      assert.deepEqual(ids(carte(etat, { pr: true }), TOUT), ["issue", "pr", "second", "priorite"], etat);
    }
  });

  test("servi : en plus, voir dans le navigateur — seulement une fois #620 branchée, et seulement s'il y a un écran", () => {
    const servi = carte("servi", { pr: true });
    assert.deepEqual(ids(servi), ["issue", "pr", "second", "priorite"]);
    assert.deepEqual(ids(servi, TOUT), ["issue", "pr", "second", "priorite", "navigateur"]);
    // Ce que l'action demande de plus à la carte — un écran — manque : le geste n'est pas proposé.
    assert.deepEqual(ids({ ...servi, ticket: 99 }, TOUT), ["issue", "pr", "second", "priorite"]);
  });

  test("« ouvrir la PR » n'apparaît que si le ticket en a une qui s'ouvre ; « ouvrir l'issue », que si la sienne s'ouvre", () => {
    assert.ok(!ids(carte("servi"), TOUT).includes("pr"));
    assert.ok(!ids(carte("servi", { pr: false }), TOUT).includes("pr"), "une PR dont l'adresse n'est pas en https ne s'ouvre pas");
    assert.ok(!ids(carte("en attente", { ouvrable: false }), TOUT).includes("issue"));
  });

  test("qui t'attend : d'abord les gestes qui tranchent la décision, le premier recommandé — puis ceux de tous, chacun une fois", () => {
    const renonce: Decision = { quoi: "remontee", motif: "still-red", cause: "manager-escalated", pr: "https://github.com/o/r/pull/8" };
    const proposes = gestesDeLaFiche(carte("86", { attendu: true, decision: renonce }));
    assert.deepEqual(
      proposes.map(({ id, libelle, recommande }) => [id, libelle, recommande === true]),
      [
        ["merger", "merge the PR", true],
        ["retirer", "remove from the rail", false],
        ["issue", "open the issue", false],
        ["second", "ask the second", false],
        ["priorite", "change the priority", false],
      ],
    );
    // En attente, le retrait que la table donne déjà n'est posé qu'une fois, à la place de la décision.
    assert.deepEqual(ids(carte("en attente", { attendu: true, decision: { ...renonce, pr: null } })), ["retirer", "issue", "second", "priorite"]);
    // Revenu de WAITING : le renvoyer en cuisine, recommandé.
    const repris = gestesDeLaFiche(carte("86", { attendu: true, decision: { quoi: "repris", motif: null, cause: null, pr: null } }));
    assert.deepEqual(repris.map(({ id }) => id), ["cuisine", "retirer", "issue", "second", "priorite"]);
    assert.equal(repris[0]?.recommande, true);
    // L'issue recommandée ne se propose que si elle s'ouvre.
    assert.deepEqual(ids(carte("86", { attendu: true, ouvrable: false, decision: { quoi: "86", motif: "no-calibration", cause: null, pr: null } })), ["second", "priorite"]);
    // Un ticket qui t'attend sans être sur le rail : ni priorité, ni retrait — il n'y a pas de mot d'état.
    assert.deepEqual(ids(carte(undefined, { attendu: true, decision: { quoi: "ecartee", motif: "question", cause: null, pr: null } })), ["issue", "second"]);
    // Sans décision — une box d'avant ce champ —, rien de plus que les gestes de tous.
    assert.deepEqual(ids(carte("en pass", { attendu: true })), ["issue", "second", "priorite"]);
    // Une décision sur une carte qui ne t'attend pas n'ajoute rien.
    assert.deepEqual(ids(carte("en pass", { decision: renonce })), ["issue", "second", "priorite"]);
  });

  test("un mot que la table ne nomme pas — 86, WAITING, un mot inconnu — n'ajoute rien aux gestes de tous", () => {
    for (const etat of ["86", "WAITING", "un mot inconnu"]) {
      assert.deepEqual(ids(carte(etat)), ["issue", "second", "priorite"], etat);
      assert.deepEqual(ids(carte(etat), TOUT), ["issue", "second", "priorite"], etat);
    }
  });

  test("un geste qui ne coûte rien n'a pas de prix ; un geste qui coûte le dit en clair — et la priorité se choisit parmi celles que le runtime prend", () => {
    const renonce: Decision = { quoi: "remontee", motif: "still-red", cause: null, pr: "https://github.com/o/r/pull/8" };
    const tous = [
      ...gestesDeLaFiche(carte("servi", { pr: true }), TOUT),
      ...gestesDeLaFiche(carte("en attente"), TOUT),
      ...gestesDeLaFiche(carte("86", { attendu: true, decision: renonce })),
      ...gestesDeLaFiche(carte("86", { attendu: true, decision: { quoi: "repris", motif: null, cause: null, pr: null } })),
    ];
    const prix = Object.fromEntries(tous.map(({ id, prix: cout }) => [id, cout]));
    assert.deepEqual(prix, { issue: null, pr: null, second: null, priorite: null, navigateur: null, waiting: null, merger: PRIX.merger, retirer: PRIX.retirer, cuisine: PRIX.cuisine });
    assert.equal(PRIX.retirer, "the ticket leaves the rail and is not cooked; its issue stays open and loses its `fire` label — put it back to bring the ticket back on the rail. Nothing is lost, nothing is spent");
    assert.match(PRIX.merger, /merged into the integration branch/);
    assert.deepEqual(tous.find(({ id }) => id === "priorite")?.valeurs, PRIORITES);
    assert.deepEqual(PRIORITES, ["1", "2", "3", "4", "5", "6", "7", "8", "9", "none"]);
  });

  test("d'une carte venue de la vue : ce qui n'a pas la forme d'une carte n'a pas de geste", () => {
    for (const brut of [undefined, null, "carte", { ticket: "21" }, { ticket: 2.5 }]) assert.deepEqual(gestesDeCarte(brut), [], JSON.stringify(brut));
    // Un numéro seul : ni issue qui s'ouvre, ni mot d'état — la demande au second, seule.
    assert.deepEqual(gestesDeCarte({ ticket: 21 }).map(({ id }) => id), ["second"]);
    assert.deepEqual(gestesDeCarte({ ticket: 21, etat: "en attente", ouvrable: true, attendu: false, attend: [] }).map(({ id }) => id), ["issue", "second", "priorite", "retirer"]);
    // Une décision qui n'en a pas la forme est ignorée : la carte garde les gestes de tous.
    const decision = { quoi: "remontee", motif: "still-red", cause: null, pr: "https://github.com/o/r/pull/8" };
    assert.deepEqual(gestesDeCarte({ ticket: 21, etat: "86", ouvrable: true, attendu: true, decision }).map(({ id }) => id), ["merger", "retirer", "issue", "second", "priorite"]);
    assert.deepEqual(gestesDeCarte({ ticket: 21, etat: "86", ouvrable: true, attendu: true, decision: { ...decision, pr: 8 } }).map(({ id }) => id), ["issue", "second", "priorite"]);
  });
});

describe("jouer un geste de la fiche", () => {
  const registre = () => {
    const envoyes: string[] = [];
    return { envoyes, terminaux: { envoyer: async (_: Projet, commande: string) => (envoyes.push(commande), SECOND) } };
  };

  test("changer la priorité, retirer du rail, merger, renvoyer en cuisine partent dans le second, sous les commandes de la box (#637) ; une priorité hors de la liste ne part pas", async () => {
    const { terminaux, envoyes } = registre();
    assert.equal(await jouerGesteDeFiche(terminaux, PARADE, "priorite", 21, "2"), SECOND);
    assert.equal(await jouerGesteDeFiche(terminaux, PARADE, "priorite", 21, "none"), SECOND);
    assert.equal(await jouerGesteDeFiche(terminaux, PARADE, "retirer", 21, undefined), SECOND);
    assert.equal(await jouerGesteDeFiche(terminaux, PARADE, "merger", 21, undefined), SECOND);
    assert.equal(await jouerGesteDeFiche(terminaux, PARADE, "cuisine", 21, undefined), SECOND);
    assert.deepEqual(envoyes, [
      "!ssh box brigade parade rail priority 21 2",
      "!ssh box brigade parade rail priority 21 none",
      "!ssh box brigade parade rail remove 21",
      "!ssh box brigade parade rail merge 21",
      "!ssh box brigade parade waiting arrived 21",
    ]);
    for (const mauvaise of ["0", "10", "1.5", "", 3, undefined]) {
      assert.match((jouerGesteDeFiche(terminaux, PARADE, "priorite", 21, mauvaise) as { refus: string }).refus, /^nothing is sent: the priority .* is not one of 1, 2, 3, 4, 5, 6, 7, 8, 9, none$/, String(mauvaise));
    }
    assert.equal(envoyes.length, 5);
  });

  test("une action qui n'est pas branchée ne part pas — ni la commande d'une file, ni un projet sans box, ni un ticket qui n'en est pas un", () => {
    const { terminaux, envoyes } = registre();
    for (const id of ["waiting", "navigateur", "issue", "file", "inconnu", "toString"]) {
      assert.deepEqual(jouerGesteDeFiche(terminaux, PARADE, id, 21, "2"), { refus: `nothing is sent: “${id}” is not an action of the box that this app can run` }, id);
    }
    assert.deepEqual(jouerGesteDeFiche(terminaux, { nom: "parade", dossier: "/p" }, "retirer", 21, undefined), { refus: "nothing is sent: “parade” has no box — there is no command to run" });
    assert.deepEqual(jouerGesteDeFiche(terminaux, PARADE, "retirer", "21", undefined), { refus: "nothing is sent: the action names no ticket" });
    assert.deepEqual(jouerGesteDeFiche(terminaux, { ...PARADE, refus: "illisible" }, "retirer", 21, undefined), { refus: "nothing is sent: “parade” does not open — illisible" });
    assert.deepEqual(envoyes, []);
  });
});

describe("la demande au second, depuis la fiche d'un ticket qui ne t'attend pas", () => {
  test("elle nomme le ticket, le projet, son mot d'état et son titre — et rien qu'elle ne sache", () => {
    const ecrit = demandeSurLeTicket("parade", 14, "pris", "Le journal en ajout seul");
    assert.ok("demande" in ecrit);
    assert.match(ecrit.demande, /^Le ticket #14 de parade \(« Le journal en ajout seul »\) : il est « pris » sur le rail\. Lis l'issue #14/);
    assert.match(ecrit.demande, /n'agis pas avant mon accord\.$/);
    const sansEtat = demandeSurLeTicket("parade", 14);
    assert.ok("demande" in sansEtat);
    assert.match(sansEtat.demande, /^Le ticket #14 de parade : il n'est pas sur le rail que la box donne\./);
    assert.deepEqual(demandeSurLeTicket("parade", 14, "pris", "un\ntitre"), { refus: REFUS_CONTROLE_TICKET });
  });

  test("ce qu'elle sait du ticket vient des derniers faits lus : le rail, sinon Livré, sinon ce qui attend", () => {
    const faits: Faits = {
      etat: "ouverte",
      lu: "2026-10-13T10:04:11.000Z",
      dernierTick: null,
      compteurs: { rail: 1, auTravail: 1, aLaPass: 0, attend: 1, livres24h: 1 },
      dernierEvenement: null,
      rail: [{ ticket: 14, etat: "pris", titre: "Le journal", url: "https://github.com/o/r/issues/14" }],
      attend: [{ ticket: 40, titre: "", url: null }],
      livres: [{ ticket: 216, titre: "Les mesures", url: "https://github.com/o/r/issues/216", livre: "2026-10-13T10:03:58.000Z", station: "box/claude", pr: null }],
    };
    const tenus = tenirFaits();
    tenus.recevoir({ projet: "parade", demande: 0, a: "2026-10-13T10:04:12.000Z", sorties: [{ commande: "facts", texte: JSON.stringify(faits) }] });
    assert.deepEqual(tenus.ticket("parade", 14), { etat: "pris", titre: "Le journal" });
    assert.deepEqual(tenus.ticket("parade", 216), { etat: "servi", titre: "Les mesures" });
    assert.deepEqual(tenus.ticket("parade", 40), {});
    assert.equal(tenus.ticket("parade", 7), undefined);
    assert.equal(tenus.ticket("ailleurs", 14), undefined);
  });
});
