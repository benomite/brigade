// Les gestes du chef écrits sur GitHub même (#2061) : « remove from the rail » retire le label `fire` de l'issue,
// « back to the kitchen » et « it arrived » retirent `parked` (#4129, d'abord `waiting`), et le commentaire de la fiche est posté sur l'issue du
// ticket, par l'accès GitHub de l'app. Rien ne part sans lecture du rail, ni pour un ticket qu'elle ne porte pas. Joué
// contre un GitHub en mémoire, qui note chaque demande.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { comment, PRICE } from "../src/discussion.ts";
import { commentTheIssue, removeTheLabel, WITHOUT_DONE, onGithub, ticketsRead } from "../src/actions-github.ts";
import type { ClientOfThePriority } from "../src/priority.ts";
import type { AnswerGitHub } from "../src/board/client.ts";
import type { BoardRead } from "../src/board/read.ts";

// Les labels d'avant parked que la cuisine lit encore comme parqués (runtime/src/kitchen/decide.ts).
const LABELS_BEFORE_PARKED = ["waiting", "blocked-on-human"];
const REPOSITORY = "chef/parade";
const PROJECT = { nom: "parade", dossier: "/tmp/parade" };

// La dernière lecture du rail de parade : #22 sur son rail, #31 dans TODO.
const READ: BoardRead = {
  lu: true,
  depot: REPOSITORY,
  luLe: "2026-11-05T10:00:00.000Z",
  cuisine: { rubriques: [] },
  faits: { rail: [{ ticket: 22, etat: "pris" }], attend: [{ ticket: 31 }] },
  file: [],
  bilans: [],
  lignesDuRail: [],
  activites: [],
};

// Un GitHub en mémoire : chaque écriture notée, et la réponse que `repondre` rend — ou ce qu'il lève.
function github(reply: (method: string, path: string) => AnswerGitHub = () => ({ status: 200, data: [] })) {
  const requests: string[] = [];
  const client: ClientOfThePriority = {
    lire: async () => assert.fail("rien ne se lit"),
    ecrire: async (method, path, body) => (requests.push(`${method} ${path}${body === undefined ? "" : ` ${JSON.stringify(body)}`}`), reply(method, path)),
  };
  return { client, demandes: requests };
}
const REFUSES = { status: 403, data: { message: "Resource not accessible by integration. See the docs." } };

describe("retirer le label du geste de l'issue du ticket", () => {
  test("« remove from the rail » : `fire` retiré de l'issue, une seule demande, et l'issue au survol", async () => {
    const { client, demandes: requests } = github();
    assert.deepEqual(await removeTheLabel(READ, "retirer", 22, client), {
      fait: "taken off the rail on GitHub: #22 no longer carries `fire` — no station takes it",
      detail: "https://github.com/chef/parade/issues/22",
    });
    assert.deepEqual(requests, ["DELETE /repos/chef/parade/issues/22/labels/fire"]);
  });

  test("« back to the kitchen » sur un ticket de TODO : `parked` retiré", async () => {
    const { client, demandes: requests } = github();
    assert.deepEqual(await removeTheLabel(READ, "cuisine", 31, client), {
      fait: "back to the kitchen on GitHub: #31 no longer carries `parked` — it resumes exactly where it was",
      detail: "https://github.com/chef/parade/issues/31",
    });
    assert.deepEqual(requests, ["parked", ...LABELS_BEFORE_PARKED].map((label) => `DELETE /repos/chef/parade/issues/31/labels/${encodeURIComponent(label)}`));
  });

  // #4260 : un ticket qu'un label d'attente d'avant parked parque (`blocked-on-human`) est parqué pour la
  // cuisine (runtime/src/kitchen/decide.ts) : « back to the kitchen » le lui retire aussi, ou il ne reprendrait jamais.
  test("« back to the kitchen » sur un ticket parqué par un label d'avant parked : ce label retiré aussi — il reprend ; refusé, la phrase dit que `parked` est retiré, pas lui", async () => {
    const [old] = LABELS_BEFORE_PARKED.filter((label) => label !== "waiting");
    const door = new Set(["fire", old as string]);
    const { client, demandes: requests } = github((method, path) => {
      const label = decodeURIComponent(path.split("/labels/")[1] ?? "");
      return method === "DELETE" && door.delete(label) ? { status: 200, data: [] } : { status: 404, data: { message: "Label does not exist" } };
    });
    assert.ok("fait" in (await removeTheLabel(READ, "cuisine", 31, client)));
    assert.deepEqual([...door], ["fire"]);
    assert.ok(requests.includes(`DELETE /repos/chef/parade/issues/31/labels/${encodeURIComponent(old as string)}`), requests.join("\n"));
    const refuses = github((_, path) => (path.endsWith(`/labels/${encodeURIComponent(old as string)}`) ? REFUSES : { status: 200, data: [] }));
    const said = await removeTheLabel(READ, "cuisine", 31, refuses.client);
    assert.ok("refus" in said, JSON.stringify(said));
    assert.equal(said.refus, `\`parked\` is removed, but GitHub did not remove \`${old}\` from #31`);
  });

  test("une issue qui ne porte déjà plus le label (404) : c'est fait", async () => {
    const { client } = github(() => ({ status: 404, data: { message: "Label does not exist" } }));
    assert.ok("fait" in (await removeTheLabel(READ, "retirer", 22, client)));
  });

  test("GitHub qui refuse, ou qui ne répond pas : rien n'est changé, la phrase le dit, et ce que GitHub a dit est au survol", async () => {
    assert.deepEqual(await removeTheLabel(READ, "retirer", 22, github(() => REFUSES).client), {
      refus: "nothing was changed: GitHub did not remove `fire` from #22",
      detail: "GitHub refused the removal of `fire` (HTTP 403): Resource not accessible by integration",
    });
    const connection = await removeTheLabel(READ, "cuisine", 31, github(() => ({ status: 401, data: {} })).client);
    assert.ok("refus" in connection && connection.detail.includes("sign in to GitHub again"), JSON.stringify(connection));
    const silent = await removeTheLabel(READ, "retirer", 22, github(() => assert.fail(new Error("GitHub gave no answer within 30 s"))).client);
    assert.deepEqual(silent, { refus: "nothing was changed: GitHub did not remove `fire` from #22", detail: "GitHub gave no answer within 30 s" });
  });

  test("ni lecture du rail, ni ticket qu'elle porte, ni ticket nommé : rien n'est écrit, et pourquoi est dit", async () => {
    const { client, demandes: requests } = github();
    assert.deepEqual(await removeTheLabel(undefined, "retirer", 22, client), { refus: "nothing was written: the rail of this project has not been read yet — read it again", detail: "" });
    assert.deepEqual(await removeTheLabel(READ, "retirer", 99, client), { refus: "nothing was written: #99 is not on the latest rail read — read it again", detail: "" });
    for (const ticket of ["22", 0, 1.5, -22, undefined]) {
      assert.deepEqual(await removeTheLabel(READ, "retirer", ticket, client), { refus: "nothing was written: the action names no ticket", detail: "" }, String(ticket));
    }
    assert.deepEqual(requests, []);
  });

  test("les tickets lus sont ceux du rail et de TODO ; une entrée sans numéro, ou un champ qui n'est pas une liste, n'en donne aucun", () => {
    assert.deepEqual([...ticketsRead(READ)], [22, 31]);
    assert.deepEqual([...ticketsRead({ faits: { rail: [{ ticket: "22" }, null, 7, { ticket: 5 }], attend: "rien" } })], [5]);
    assert.deepEqual([...ticketsRead({ faits: {} })], []);
  });

  test("une carte qui attend un autre humain est lue aussi : l'assignation ne retient personne (#3071)", () => {
    assert.deepEqual([...ticketsRead({ faits: { rail: [{ ticket: 22 }], attend: [{ ticket: 31 }], attendAutres: [{ ticket: 40, qui: ["bob"] }] } })], [22, 31, 40]);
  });

  test("seuls `retirer` et `cuisine` s'écrivent sur GitHub ; le reste a sa phrase, qui dit que rien n'est parti", () => {
    assert.ok(onGithub("retirer") && onGithub("cuisine"));
    for (const id of ["merger", "toString", "", undefined, 1]) assert.equal(onGithub(id), false, String(id));
    for (const sentence of Object.values(WITHOUT_DONE)) assert.match(sentence, /^nothing was (done|posted|changed|sent): /);
  });
});

describe("poster le commentaire du chef sur l'issue du ticket", () => {
  test("le texte part tel quel, dans `body`, sur l'issue du ticket ; posté (201), son adresse est rendue", async () => {
    const { client, demandes: requests } = github(() => ({ status: 201, data: { html_url: "https://github.com/chef/parade/issues/21#issuecomment-7001" } }));
    assert.deepEqual(await commentTheIssue(REPOSITORY, 21, "du \"contexte\"\n- $(whoami)", client), { url: "https://github.com/chef/parade/issues/21#issuecomment-7001" });
    assert.deepEqual(requests, [`POST /repos/chef/parade/issues/21/comments ${JSON.stringify({ body: "du \"contexte\"\n- $(whoami)" })}`]);
  });

  test("posté sans adresse rendue : posté quand même, sans adresse", async () => {
    assert.deepEqual(await commentTheIssue(REPOSITORY, 21, "x", github(() => ({ status: 201, data: null })).client), { url: null });
  });

  test("un autre statut que 201, ou GitHub qui ne répond pas : pas posté, et pourquoi, en une phrase", async () => {
    assert.deepEqual(await commentTheIssue(REPOSITORY, 21, "x", github(() => REFUSES).client), {
      raison: "The comment could not be posted on #21 of chef/parade: GitHub refused the comment (HTTP 403): Resource not accessible by integration.",
    });
    assert.deepEqual(await commentTheIssue(REPOSITORY, 21, "x", github(() => ({ status: 200, data: {} })).client), { raison: "The comment could not be posted on #21 of chef/parade: GitHub refused the comment (HTTP 200)." });
    assert.deepEqual(await commentTheIssue(REPOSITORY, 21, "x", github(() => assert.fail(new Error("GitHub gave no answer within 30 s."))).client), {
      raison: "The comment could not be posted on #21 of chef/parade: GitHub gave no answer within 30 s.",
    });
  });

  test("joué par la fiche, comme main.ts le branche : posté, la fiche dit son prix ; refusé, la phrase de GitHub sans majuscule ni point", async () => {
    const workstation = github(() => ({ status: 201, data: { html_url: "https://github.com/chef/parade/issues/21#issuecomment-7001" } }));
    assert.deepEqual(await comment((ticket, text) => commentTheIssue(REPOSITORY, ticket, text, workstation.client), PROJECT, 21, "  du contexte\r\nfin  "), { poste: true, prix: PRICE });
    assert.deepEqual(workstation.demandes, [`POST /repos/chef/parade/issues/21/comments ${JSON.stringify({ body: "du contexte\nfin" })}`]);
    const refuses = github(() => REFUSES);
    assert.deepEqual(await comment((ticket, text) => commentTheIssue(REPOSITORY, ticket, text, refuses.client), PROJECT, 21, "du contexte"), {
      poste: false,
      refus: "nothing was posted: the comment could not be posted on #21 of chef/parade: GitHub refused the comment (HTTP 403): Resource not accessible by integration",
    });
  });
});
