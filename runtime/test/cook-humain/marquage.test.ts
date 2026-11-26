// `rail human <ticket> [qui]` sur un ticket ordinaire du rail (#4276) : il est marqué pour l'humain sur GitHub — le
// label `human-cook`, son assignee, un commentaire —, garde `fire` et reste sur le rail ; sa tâche entre dans TODO.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { cartesEnTodo } from "../../src/carte-todo.ts";
import { noterLeChef, type ChefLu } from "../../src/chef/chef.ts";
import { faits, lireEtat } from "../../src/etat.ts";
import type { GitHub } from "../../src/github.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { principal as montrerRail } from "../../src/montrer-rail.ts";
import { ticketDuRail } from "../../src/projections/rail.ts";
import { confierAUnHumain } from "../../src/sortie-attente-capacite/sortie.ts";
import { ouvrirRail } from "../aides/rail-du-journal.ts";
import { fauxGitHub, issue, montre } from "../aides/cuisine.ts";
import { aArreter, appeler, DEPOT, fauxGh, issueGitHub, repertoireTemporaire } from "../outils.ts";

const PROJET = "brigade";

// `chef` : le chef que la cuisine a résolu (chef.json).
function atelier(t: TestContext, chef: ChefLu = { login: "benoit", source: "repo owner" }) {
  const heure = montre();
  const repertoire = repertoireTemporaire(t);
  const journal = ouvrirJournal(repertoire, { maintenant: heure.maintenant });
  aArreter(t, () => journal.fermer());
  ouvrirRail(journal, { projet: PROJET, dureeBailMs: 600_000, maintenant: heure.maintenant });
  const gh = fauxGitHub(issue(23, ["fire"], { title: "Sign the contract" }));
  gh.decrire(23, { body: "## Context\n\nSign it.\n\n## Acceptance criteria\n\n- the contract is signed\n" });
  journal.ajouter({ project: PROJET, ticket: 23, author: "github", type: "ticket.arrived", payload: { title: "Sign the contract", priority: null, createdAt: "2026-10-01T00:00:23Z", url: "https://github.com/acme/brigade/issues/23", card: { waitsFor: [], zone: ["zone/23/"], problems: [] } } });
  const assignes: Array<[number, string[]]> = [];
  const desassignes: Array<[number, string[]]> = [];
  const github: GitHub = {
    ...gh.github,
    assigner: async (numero, logins) => void assignes.push([numero, logins]),
    desassigner: async (numero, logins) => void desassignes.push([numero, logins]),
  };
  return {
    journal, repertoire, gh, assignes, desassignes,
    confier: (qui?: string) => confierAUnHumain(journal, github, PROJET, 23, qui, chef),
    tache: () => faits(lireEtat(journal, heure.maintenant()), heure.maintenant()).attend?.find(({ ticket }) => ticket === 23),
  };
}

test("an ordinary ticket marked for alice: the label, alice assigned, one comment, and it stays on the rail with fire", async (t) => {
  const c = atelier(t);

  const resultat = await c.confier("alice");

  assert.equal(resultat.done, true, JSON.stringify(resultat));
  assert.match(resultat.price, /carries `human-cook`, assigned to alice: no station takes it/);
  assert.deepEqual(c.gh.labellisations, [[23, ["human-cook"]]]);
  assert.deepEqual(c.gh.delabellisations, []);
  assert.deepEqual(c.assignes, [[23, ["alice"]]]);
  assert.deepEqual(c.desassignes, []);
  assert.equal(c.gh.commentaires.length, 1);
  const [numero, corps] = c.gh.commentaires[0] ?? [];
  assert.equal(numero, 23);
  assert.match(corps ?? "", /^\*\*@alice, this ticket is yours\.\*\*/);
  assert.match(corps ?? "", /`cook\/23-github`, with `Closes #23`\. It goes through the same pass as a cook's: review, then gates, then CI, then merge\./);
  assert.notEqual(ticketDuRail(c.journal.base, 23), null);
  assert.equal(c.tache()?.tache?.assignee, "alice");
  assert.equal(cartesEnTodo(c.journal.base)[0]?.resume, "This ticket is alice's work: only a human can do it. It stays on the rail, and its pull request goes through the same pass as a cook's.");
});

test("for the chef, with no name, the ticket is assigned to the chef the kitchen resolved", async (t) => {
  const c = atelier(t);

  assert.equal((await c.confier()).done, true);
  assert.deepEqual(c.assignes, [[23, ["benoit"]]]);
  assert.match(c.gh.commentaires[0]?.[1] ?? "", /^\*\*@benoit, this ticket is yours/);
  assert.equal(c.tache()?.tache?.assignee, "chef");
});

test("no chef resolved yet: no one is assigned, the comment speaks to the chef, and the task stays the chef's", async (t) => {
  const c = atelier(t, { absent: true });

  const resultat = await c.confier();
  assert.equal(resultat.done, true);
  assert.match(resultat.price, /carries `human-cook`, for the chef, assigned to no one: no chef is resolved yet: no station takes it/);
  assert.deepEqual(c.assignes, []);
  assert.deepEqual(c.gh.labellisations, [[23, ["human-cook"]]]);
  assert.match(c.gh.commentaires[0]?.[1] ?? "", /^\*\*the chef, this ticket is yours/);
  assert.equal(c.tache()?.tache?.assignee, "chef");
});

test("marked again for bob: bob is assigned, alice is removed, and the task is bob's", async (t) => {
  const c = atelier(t);
  await c.confier("alice");

  const resultat = await c.confier("bob");

  assert.equal(resultat.done, true, JSON.stringify(resultat));
  assert.deepEqual(c.assignes, [[23, ["alice"]], [23, ["bob"]]]);
  assert.deepEqual(c.desassignes, [[23, ["alice"]]]);
  assert.equal(c.gh.commentaires.length, 2);
  assert.match(c.gh.commentaires[1]?.[1] ?? "", /^\*\*@bob, this ticket is yours/);
  assert.equal(c.tache()?.tache?.assignee, "bob");
  assert.equal((await c.confier("bob")).done, false);
});

test("marked again for the chef when the chef already holds it: no one is removed", async (t) => {
  const c = atelier(t);
  await c.confier("benoit");

  assert.equal((await c.confier()).done, true);
  assert.deepEqual(c.desassignes, []);
  assert.equal(c.tache()?.tache?.assignee, "chef");
});

test("`rail human 23` with no name assigns the chef of chef.json, on GitHub", async (t) => {
  const c = atelier(t);
  noterLeChef(c.repertoire, { login: "benoit", source: "declared" });
  const gh = fauxGh(t);
  gh.issues([issueGitHub(23, { title: "Sign the contract" })]);
  for (const fin of ["labels", "assignees", "comments"]) gh.repondre(`repos/${DEPOT}/issues/23/${fin}`, { statut: fin === "labels" ? 200 : 201, corps: {} });

  const geste = appeler(montrerRail, ["human", "23"], { BRIGADE_STATE_DIR: c.repertoire, BRIGADE_GITHUB_REPO: DEPOT, BRIGADE_GH_BIN: gh.bin });

  assert.equal(await geste.fin, 0, geste.sortie());
  const ecrits = gh.appels().filter((args) => args.includes("POST")).map((args) => args.slice(args.indexOf("POST") + 1));
  assert.deepEqual(ecrits.map((args) => args.at(-1)), [`repos/${DEPOT}/issues/23/labels`, `repos/${DEPOT}/issues/23/assignees`, `repos/${DEPOT}/issues/23/comments`]);
  assert.ok(ecrits[0]?.includes("labels[]=human-cook"));
  assert.ok(ecrits[1]?.includes("assignees[]=benoit"));
});
