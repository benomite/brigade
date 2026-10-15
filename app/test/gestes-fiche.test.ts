// Les gestes de la fiche d'un ticket (#639) : ceux qu'il est possible de faire sur lui à cet instant,
// et seulement ceux-là, chacun avec son prix. Pour chaque état de la table du chef, l'ensemble exact
// des gestes proposés — aujourd'hui, et une fois branchées les actions qui ne le sont pas encore :
// celles du runtime (#637), qu'aucune commande de box n'expose, WAITING (#588) et le navigateur (#620).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Projet } from "../src/config.ts";
import { demandeSurLeTicket, REFUS_CONTROLE_TICKET } from "../src/demande.ts";
import { tenirFaits, type Faits } from "../src/faits.ts";
import { ACTIONS, type Actions, type CarteDeFiche, commandesDeLaFile, gestesDeCarte, gestesDeLaFiche, jouerGesteDeFiche, PRIORITES, PRIX } from "../src/gestes-fiche.ts";
import type { Terminal } from "../src/terminaux.ts";

const PARADE: Projet = { nom: "parade", dossier: "/projets/parade", box: { hote: "box" } };
const SECOND: Terminal = { id: 1, projet: "parade", genre: "second", titre: "second · claude", note: "", arrete: false };

// Les actions qui attendent leur branchement, branchées pour l'essai. Les commandes de box sont
// d'essai : le runtime n'en expose aucune pour #637 aujourd'hui — c'est le branchement qui les nommera.
const DU_RUNTIME: Actions = { ...ACTIONS, priorite: { box: (ticket, valeur) => `essai-priorite ${ticket} ${valeur ?? ""}`.trim() }, retirer: { box: (ticket) => `essai-retirer ${ticket}` } };
const TOUT: Actions = { ...DU_RUNTIME, waiting: { app: true }, navigateur: { app: true, si: (carte) => carte.ticket !== 99 } };

const carte = (etat: string | undefined, plus: Partial<CarteDeFiche> = {}): CarteDeFiche => ({ ticket: 21, ...(etat === undefined ? {} : { etat }), ouvrable: true, attendu: false, attend: [], ...plus });
const ids = (carteDuTicket: CarteDeFiche, actions?: Actions) => gestesDeLaFiche(carteDuTicket, actions).map(({ id }) => id);

describe("la table du chef : pour chaque état, l'ensemble exact des gestes proposés", () => {
  test("en attente ou BLOQUÉ : ouvrir l'issue, demander au second, changer la priorité, retirer du rail — et rien d'autre tant que #588 n'est pas branchée", () => {
    for (const etat of ["en attente", "BLOQUÉ"]) {
      // Aujourd'hui : les deux actions de #637 n'ont pas de commande de box, elles ne sont pas proposées.
      assert.deepEqual(ids(carte(etat)), ["issue", "second"], etat);
      assert.deepEqual(ids(carte(etat), DU_RUNTIME), ["issue", "second", "priorite", "retirer"], etat);
      // #588 branchée : WAITING s'y ajoute.
      assert.deepEqual(ids(carte(etat), TOUT), ["issue", "second", "priorite", "retirer", "waiting"], etat);
    }
  });

  test("pris ou en pass : ouvrir l'issue, ouvrir la PR s'il y en a une, demander au second, changer la priorité — jamais le retirer ni le mettre en WAITING", () => {
    for (const etat of ["pris", "en pass"]) {
      assert.deepEqual(ids(carte(etat)), ["issue", "second"], etat);
      assert.deepEqual(ids(carte(etat), TOUT), ["issue", "second", "priorite"], etat);
      assert.deepEqual(ids(carte(etat, { pr: true }), TOUT), ["issue", "pr", "second", "priorite"], etat);
    }
  });

  test("servi : en plus, voir dans le navigateur — seulement une fois #620 branchée, et seulement s'il y a un écran", () => {
    const servi = carte("servi", { pr: true });
    assert.deepEqual(ids(servi), ["issue", "pr", "second"]);
    assert.deepEqual(ids(servi, DU_RUNTIME), ["issue", "pr", "second", "priorite"]);
    assert.deepEqual(ids(servi, TOUT), ["issue", "pr", "second", "priorite", "navigateur"]);
    // Ce que l'action demande de plus à la carte — un écran — manque : le geste n'est pas proposé.
    assert.deepEqual(ids({ ...servi, ticket: 99 }, TOUT), ["issue", "pr", "second", "priorite"]);
  });

  test("« ouvrir la PR » n'apparaît que si le ticket en a une qui s'ouvre ; « ouvrir l'issue », que si la sienne s'ouvre", () => {
    assert.ok(!ids(carte("servi"), TOUT).includes("pr"));
    assert.ok(!ids(carte("servi", { pr: false }), TOUT).includes("pr"), "une PR dont l'adresse n'est pas en https ne s'ouvre pas");
    assert.ok(!ids(carte("en attente", { ouvrable: false }), TOUT).includes("issue"));
  });

  test("qui t'attend : en plus, le geste que la file nomme — et la demande au second reste, en un clic", () => {
    const ligne = "depuis 3 h  revenu de WAITING, repris par le chef — à trancher : `brigade parade waiting arrived 21` le renvoie en cuisine ; `brigade parade waiting set 21 --what <ce qu'il attend> --from <qui>` le remet en attente ; ou retirer `fire`";
    const attendu = carte("en attente", { attendu: true, attend: [ligne] });
    const proposes = gestesDeLaFiche(attendu);
    assert.deepEqual(
      proposes.map(({ id, libelle }) => [id, libelle]),
      [
        ["issue", "open the issue"],
        ["second", "ask the second"],
        // La commande qui attend des mots du chef n'est pas reprise : elle se lit dans la ligne.
        ["file", "waiting arrived 21"],
      ],
    );
    assert.deepEqual(proposes.find(({ id }) => id === "file"), { id: "file", libelle: "waiting arrived 21", prix: PRIX.file, suite: "waiting arrived 21", rang: 0 });
    assert.deepEqual(ids(attendu, TOUT), ["issue", "second", "file", "priorite", "retirer", "waiting"]);
    // Un ticket qui t'attend sans être sur le rail : ni priorité, ni retrait — il n'y a pas de mot d'état.
    assert.deepEqual(ids(carte(undefined, { attendu: true, attend: [ligne] }), TOUT), ["issue", "second", "file"]);
    // La file ne nomme aucune commande : la demande au second, seule.
    assert.deepEqual(ids(carte("en pass", { attendu: true, attend: ["depuis 2 j  livraison verte, non mergée faute de grant `merge` — à merger à la main"] })), ["issue", "second"]);
  });

  test("un mot que la table ne nomme pas — 86, WAITING, un mot inconnu — n'ajoute rien aux gestes de tous", () => {
    for (const etat of ["86", "WAITING", "un mot inconnu"]) assert.deepEqual(ids(carte(etat), TOUT), ["issue", "second", "priorite"], etat);
  });

  test("chaque geste dit son prix, en clair — et la priorité se choisit parmi celles que le runtime prend", () => {
    const tous = gestesDeLaFiche(carte("servi", { pr: true, attendu: true, attend: ["`brigade parade pass 21`"] }), TOUT).concat(gestesDeLaFiche(carte("en attente"), TOUT));
    for (const { id, prix } of tous) assert.match(prix, /^(none|the )/, id);
    assert.equal(tous.find(({ id }) => id === "retirer")?.prix, "the ticket leaves the rail and is not cooked; its issue stays open and loses its `fire` label — put it back to bring the ticket back on the rail. Nothing is lost, nothing is spent");
    assert.deepEqual(tous.find(({ id }) => id === "priorite")?.valeurs, PRIORITES);
    assert.deepEqual(PRIORITES, ["1", "2", "3", "4", "5", "6", "7", "8", "9", "none"]);
  });

  test("d'une carte venue de la vue : ce qui n'a pas la forme d'une carte n'a pas de geste", () => {
    for (const brut of [undefined, null, "carte", { ticket: "21" }, { ticket: 21 }]) assert.deepEqual(gestesDeCarte(brut), [], JSON.stringify(brut));
    assert.deepEqual(gestesDeCarte({ ticket: 21, etat: "en attente", ouvrable: true, attendu: false, attend: [] }).map(({ id }) => id), ["issue", "second"]);
  });
});

describe("le geste que la file nomme", () => {
  test("les commandes entre backticks, sous leur forme de box, dans l'ordre, une fois chacune — rien de ce qui attend des mots du chef", () => {
    assert.deepEqual(commandesDeLaFile(["a `brigade parade pass 8` puis `brigade parade grant enable merge`", "encore `brigade parade pass 8`"]), ["pass 8", "grant enable merge"]);
    assert.deepEqual(commandesDeLaFile(["`brigade parade waiting set 8 --what <quoi> --from <qui>`", "retirer `fire`", "`gh pr merge 31`", "`brigade parade pass 8; rm -rf /`"]), []);
  });
});

describe("jouer un geste de la fiche", () => {
  const registre = () => {
    const envoyes: string[] = [];
    const inscrits: string[] = [];
    return {
      envoyes,
      inscrits,
      terminaux: { envoyer: async (_: Projet, commande: string) => (envoyes.push(commande), SECOND), inscrire: (_: Projet, commande: string) => (inscrits.push(commande), SECOND) },
    };
  };
  const ATTEND = ["depuis 3 h  à trancher : `brigade parade waiting arrived 21` le renvoie en cuisine"];

  test("la commande de la file s'écrit dans le second, sans Entrée, dans sa forme de poste — relue dans le bloc, jamais venue de la vue", async () => {
    const { terminaux, inscrits, envoyes } = registre();
    assert.equal(jouerGesteDeFiche(terminaux, PARADE, "file", 21, 0, ATTEND), SECOND);
    assert.deepEqual(inscrits, ["!ssh box brigade parade waiting arrived 21"]);
    assert.deepEqual(envoyes, []);
    assert.deepEqual(jouerGesteDeFiche(terminaux, PARADE, "file", 21, 1, ATTEND), { refus: "nothing is written: the `attend` block no longer names this command for #21" });
    assert.deepEqual(jouerGesteDeFiche(terminaux, PARADE, "file", 21, "waiting arrived 21", ATTEND), { refus: "nothing is written: the `attend` block no longer names this command for #21" });
    assert.deepEqual(jouerGesteDeFiche(terminaux, PARADE, "file", 21, 0, undefined), { refus: "nothing is written: the `attend` block no longer names #21" });
  });

  test("une action de box branchée part dans le second ; une priorité hors de la liste ne part pas", async () => {
    const { terminaux, envoyes } = registre();
    assert.equal(await jouerGesteDeFiche(terminaux, PARADE, "priorite", 21, "2", undefined, DU_RUNTIME), SECOND);
    assert.equal(await jouerGesteDeFiche(terminaux, PARADE, "retirer", 21, undefined, undefined, DU_RUNTIME), SECOND);
    assert.deepEqual(envoyes, ["!ssh box brigade parade essai-priorite 21 2", "!ssh box brigade parade essai-retirer 21"]);
    for (const mauvaise of ["0", "10", "1.5", "", 3, undefined]) {
      assert.match((jouerGesteDeFiche(terminaux, PARADE, "priorite", 21, mauvaise, undefined, DU_RUNTIME) as { refus: string }).refus, /^nothing is sent: the priority .* is not one of 1, 2, 3, 4, 5, 6, 7, 8, 9, none$/, String(mauvaise));
    }
    assert.equal(envoyes.length, 2);
  });

  test("une action qui n'est pas branchée ne part pas — ni un projet sans box, ni un ticket qui n'en est pas un", () => {
    const { terminaux, envoyes, inscrits } = registre();
    for (const id of ["priorite", "retirer", "waiting", "navigateur", "issue", "inconnu"]) {
      assert.deepEqual(jouerGesteDeFiche(terminaux, PARADE, id, 21, "2", ATTEND), { refus: `nothing is sent: “${id}” is not an action of the box that this app can run` }, id);
    }
    assert.deepEqual(jouerGesteDeFiche(terminaux, { nom: "parade", dossier: "/p" }, "file", 21, 0, ATTEND), { refus: "nothing is sent: “parade” has no box — there is no command to run" });
    assert.deepEqual(jouerGesteDeFiche(terminaux, PARADE, "file", "21", 0, ATTEND), { refus: "nothing is sent: the action names no ticket" });
    assert.deepEqual(jouerGesteDeFiche(terminaux, { ...PARADE, refus: "illisible" }, "file", 21, 0, ATTEND), { refus: "nothing is sent: “parade” does not open — illisible" });
    assert.deepEqual([envoyes, inscrits], [[], []]);
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
