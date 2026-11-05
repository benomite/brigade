// « It is a human's job » (#1958) : un ticket en WAITING faute de capacité quitte le rail et entre dans TODO comme
// une tâche — pour le chef, ou pour qui il nomme —, avec le titre, le contexte et les critères d'acceptation de sa
// carte, et la capacité qu'aucune station ne fournit. Il ne revient pas en WAITING. Bâti d'un vrai journal, du
// rail tel que les journaux d'avant le portent et du GitHub de test de la cuisine.
import assert from "node:assert/strict";
import { describe, test, type TestContext } from "node:test";
import { cartesEnTodo } from "../../src/carte-todo.ts";
import { faits, lireEtat } from "../../src/etat.ts";
import type { Fait } from "../../src/evenements.ts";
import { HORS_CUISINE } from "../../src/github.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { principal as montrerRail } from "../../src/montrer-rail.ts";
import { ticketDuRail } from "../../src/projections/rail.ts";
import { ouvrirRail } from "../aides/rail-du-journal.ts";
import { repondreALaCarte } from "../../src/reponse-carte.ts";
import { assigneeLu, confierAUnHumain, lireLaCarte } from "../../src/sortie-attente-capacite/sortie.ts";
import { fauxGitHub, issue, montre } from "../aides/cuisine.ts";
import { aArreter, appeler, repertoireTemporaire } from "../outils.ts";

const PROJET = "brigade";

// Le corps d'un ticket né d'un découpage, tel que le manager l'écrit.
const CORPS = [
  "Épique : #1950",
  "<!-- brigade:decoupage #1950.1 -->",
  "",
  "## Cook design",
  "",
  "Lis `agents/cook-design.md`.",
  "",
  "## Contexte",
  "",
  "Capture the signed-in form in Chrome.",
  "It needs the chef's session.",
  "",
  "## Critères d'acceptation",
  "",
  "- the capture shows the form signed in",
  "- [ ] it is attached to the issue",
  "",
  "---",
  "",
  "_Né du découpage de l'épique #1950 par le manager._",
].join("\n");

function atelier(t: TestContext) {
  const heure = montre();
  const repertoire = repertoireTemporaire(t);
  const journal = ouvrirJournal(repertoire, { maintenant: heure.maintenant });
  aArreter(t, () => journal.fermer());
  const rail = ouvrirRail(journal, { projet: PROJET, dureeBailMs: 600_000, maintenant: heure.maintenant });
  const gh = fauxGitHub(issue(22, ["fire"], { title: "Capture the signed-in form" }), issue(23, ["fire"]));
  gh.decrire(22, { body: CORPS });
  const noter = (ticket: number, fait: Fait, author = "runtime") => journal.ajouter({ project: PROJET, ticket, author, ...fait });
  const arriver = (ticket: number, requires: string[] = []) =>
    noter(
      ticket,
      {
        type: "ticket.arrived",
        payload: { title: ticket === 22 ? "Capture the signed-in form" : `Ticket ${ticket}`, priority: null, createdAt: `2026-10-01T00:00:${ticket}Z`, url: `https://github.com/acme/brigade/issues/${ticket}`, card: { waitsFor: [], zone: [`zone/${ticket}/`], problems: [], ...(requires.length === 0 ? {} : { requires }) } },
      },
      "github",
    );
  // #22 demande `chrome-connecté` et `code` ; aucune station ne fournit le premier : la station le met en WAITING, et le
  // manager, qui n'a pas pu le réécrire, l'a dit sur l'issue.
  arriver(22, ["chrome-connecté", "code"]);
  rail.quatreVingtSix(22, { motif: "no-station: chrome-connecté" });
  noter(22, { type: "manager.capability-gestured", payload: { missing: ["chrome-connecté"], reason: "the work needs the chef's session" } }, "manager");
  // #23 attend sur le rail, comme tout ticket : il n'attend aucune capacité.
  arriver(23);
  const confier = (ticket: number, qui?: string) => confierAUnHumain(journal, gh.github, PROJET, ticket, qui);
  const lire = () => faits(lireEtat(journal, heure.maintenant()), heure.maintenant());
  return { repertoire, journal, rail, gh, heure, confier, lire };
}

describe("« It is a human's job » : le ticket quitte le rail pour TODO", () => {
  test("le ticket sort du rail, son issue perd `fire` et prend `hors-cuisine`, et sa tâche est dans TODO, pour le chef, avec le titre, le contexte et les critères de sa carte", async (t) => {
    const c = atelier(t);
    assert.equal(c.lire().rail.find(({ ticket }) => ticket === 22)?.etat, "WAITING");

    const resultat = await c.confier(22);

    assert.equal(resultat.done, true);
    assert.match(resultat.price, /^the ticket leaves the rail and is not cooked — its issue loses `fire` and carries `hors-cuisine`, so no kitchen takes it again; it waits in TODO as the chef's task/);
    // Hors du rail, et pour de bon : GitHub ne le rendrait pas.
    assert.equal(ticketDuRail(c.journal.base, 22), null);
    assert.deepEqual(c.gh.lire(22)?.labels, [HORS_CUISINE]);
    assert.equal(c.journal.duTicket(22).findLast((e) => e.type === "ticket.left")?.payload.reason, "hors-cuisine");
    // Dans TODO : une carte de la forme unique, et la tâche que `facts` donne avec elle.
    const [carte] = cartesEnTodo(c.journal.base);
    assert.equal(carte?.ticket, 22);
    assert.equal(carte?.resume, "No station can provide chrome-connecté: this ticket left the rail and is a human's job, for the chef.");
    const entree = c.lire().attend?.find(({ ticket }) => ticket === 22);
    assert.deepEqual(entree?.tache, {
      assignee: "chef",
      missing: ["chrome-connecté"],
      title: "Capture the signed-in form",
      context: "Capture the signed-in form in Chrome.\nIt needs the chef's session.",
      criteria: ["the capture shows the form signed in", "it is attached to the issue"],
    });
    assert.deepEqual(entree?.carte.choix.map(({ texte }) => texte), ["It is done", "It will not be done"]);
    assert.equal(c.lire().rail.some(({ ticket }) => ticket === 22), false);
    // L'issue le dit, en une fois.
    assert.deepEqual(c.gh.commentaires.map(([ticket]) => ticket), [22]);
    assert.match(c.gh.commentaires[0]?.[1] ?? "", /^\*\*Human's job — no station provides `chrome-connecté`: this ticket left the rail, for the chef\.\*\*/);
  });

  test("la tâche peut revenir à quelqu'un d'autre : le même geste la nomme, la carte reste dans TODO, et le ticket ne revient pas sur le rail", async (t) => {
    const c = atelier(t);
    await c.confier(22);

    const resultat = await c.confier(22, "@alice");

    assert.deepEqual(resultat, { done: true, price: "the task stays in TODO, now for alice; nothing is spent" });
    assert.equal(c.lire().attend?.find(({ ticket }) => ticket === 22)?.tache?.assignee, "alice");
    assert.equal(cartesEnTodo(c.journal.base)[0]?.resume, "No station can provide chrome-connecté: this ticket left the rail and is a human's job, for alice.");
    assert.equal(ticketDuRail(c.journal.base, 22), null);
    assert.equal(c.gh.commentaires.at(-1)?.[1], "**Human's job — now for alice.**");
    // La même personne, une seconde fois : rien ne change.
    assert.deepEqual(await c.confier(22, "alice"), { done: false, reason: "#22 is already alice's job", price: "none: nothing was changed" });
  });

  test("la tâche répondue sort de TODO, et le ticket ne revient ni sur le rail ni en WAITING", async (t) => {
    const c = atelier(t);
    await c.confier(22);

    const reponse = await repondreALaCarte(c.journal, c.gh.github, PROJET, 22, { choix: 1 });

    assert.equal(reponse.done, true);
    assert.deepEqual(cartesEnTodo(c.journal.base), []);
    assert.equal(c.lire().attend?.some(({ ticket }) => ticket === 22), false);
    assert.equal(ticketDuRail(c.journal.base, 22), null);
    assert.equal(c.lire().rail.some(({ ticket }) => ticket === 22), false);
  });

  test("un ticket qui n'attend pas de capacité, ou qui n'est pas sur le rail, est refusé, et rien n'est touché", async (t) => {
    const c = atelier(t);

    assert.deepEqual(await c.confier(23), { done: false, reason: "#23 does not wait for a capability no station provides: only such a WAITING card becomes a human's job", price: "none: nothing was changed" });
    assert.deepEqual(await c.confier(99), { done: false, reason: "#99 is not on the rail, and no human's job of it is in TODO", price: "none: nothing was changed" });
    assert.equal((await c.confier(22, "deux\nlignes")).done, false);
    assert.deepEqual([c.gh.labellisations, c.gh.delabellisations, c.gh.commentaires], [[], [], []]);
    assert.deepEqual(cartesEnTodo(c.journal.base), []);
    assert.equal(ticketDuRail(c.journal.base, 22)?.state, "86");
  });

  test("`rail human` est un geste du rail : il dit son usage, et refuse en 1 un ticket qui n'attend pas de capacité, sans rien appeler", async (t) => {
    const c = atelier(t);
    const jouer = (args: string[]) => appeler(montrerRail, args, { BRIGADE_STATE_DIR: c.repertoire, BRIGADE_GITHUB_REPO: "acme/brigade", BRIGADE_GH_BIN: "/nonexistent/gh" });

    const inconnu = jouer(["humain", "22"]);
    assert.equal(await inconnu.fin, 2);
    assert.match(inconnu.sortie(), /^ {2}human <ticket> \[who…\]$/m);
    const refuse = jouer(["human", "23", "alice"]);
    assert.equal(await refuse.fin, 1);
    assert.match(refuse.sortie(), /#23 is not touched: #23 does not wait for a capability no station provides/);
  });
});

describe("ce que la tâche reprend de la carte", () => {
  test("le contexte et les critères se lisent de leurs sections, en français ou en anglais ; le pied du découpage n'en est pas", () => {
    assert.deepEqual(lireLaCarte(CORPS), { context: "Capture the signed-in form in Chrome.\nIt needs the chef's session.", criteria: ["the capture shows the form signed in", "it is attached to the issue"] });
    assert.deepEqual(lireLaCarte("## Context\n\nDo it by hand.\n\n## Acceptance criteria\n\n* done"), { context: "Do it by hand.", criteria: ["done"] });
  });

  test("sans section, le texte de l'issue tient lieu de contexte, et il n'y a pas de critère", () => {
    assert.deepEqual(lireLaCarte("Just a line.\n\n---\nfooter"), { context: "Just a line.", criteria: [] });
    assert.deepEqual(lireLaCarte(""), { context: "", criteria: [] });
  });

  test("qui la tâche revient : le chef sans nom, un nom sur une ligne sinon", () => {
    assert.equal(assigneeLu(""), "chef");
    assert.equal(assigneeLu("  @bob "), "bob");
    assert.equal(typeof assigneeLu("x".repeat(61)), "object");
  });
});
