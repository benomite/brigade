// Les gestes du chef écrits sur GitHub même (#2061) : « remove from the rail » retire le label `fire` de l'issue,
// « back to the kitchen » et « it arrived » retirent `parked` (#4129, d'abord `waiting`), et le commentaire de la fiche est posté sur l'issue du
// ticket, par l'accès GitHub de l'app. Rien ne part sans lecture du rail, ni pour un ticket qu'elle ne porte pas. Joué
// contre un GitHub en mémoire, qui note chaque demande.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { commenter, PRIX } from "../src/discussion.ts";
import { commenterLIssue, retirerLeLabel, SANS_FAIT, surGithub, ticketsLus } from "../src/actions-github.ts";
import type { ClientDeLaPriority } from "../src/priority.ts";
import { LABELS_D_AVANT_PARKED } from "../../runtime/src/github-etat/etats.ts";
import type { AnswerGitHub } from "../src/tableau/client.ts";
import type { TableauLu } from "../src/tableau/read.ts";

const REPOSITORY = "chef/parade";
const PROJECT = { nom: "parade", dossier: "/tmp/parade" };

// La dernière lecture du rail de parade : #22 sur son rail, #31 dans TODO.
const LU: TableauLu = {
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
function github(repondre: (methode: string, chemin: string) => AnswerGitHub = () => ({ status: 200, data: [] })) {
  const demandes: string[] = [];
  const client: ClientDeLaPriority = {
    lire: async () => assert.fail("rien ne se lit"),
    ecrire: async (methode, chemin, corps) => (demandes.push(`${methode} ${chemin}${corps === undefined ? "" : ` ${JSON.stringify(corps)}`}`), repondre(methode, chemin)),
  };
  return { client, demandes };
}
const REFUSE = { status: 403, data: { message: "Resource not accessible by integration. See the docs." } };

describe("retirer le label du geste de l'issue du ticket", () => {
  test("« remove from the rail » : `fire` retiré de l'issue, une seule demande, et l'issue au survol", async () => {
    const { client, demandes } = github();
    assert.deepEqual(await retirerLeLabel(LU, "retirer", 22, client), {
      fait: "taken off the rail on GitHub: #22 no longer carries `fire` — no station takes it",
      detail: "https://github.com/chef/parade/issues/22",
    });
    assert.deepEqual(demandes, ["DELETE /repos/chef/parade/issues/22/labels/fire"]);
  });

  test("« back to the kitchen » sur un ticket de TODO : `parked` retiré", async () => {
    const { client, demandes } = github();
    assert.deepEqual(await retirerLeLabel(LU, "cuisine", 31, client), {
      fait: "back to the kitchen on GitHub: #31 no longer carries `parked` — it resumes exactly where it was",
      detail: "https://github.com/chef/parade/issues/31",
    });
    assert.deepEqual(demandes, ["parked", ...LABELS_D_AVANT_PARKED].map((label) => `DELETE /repos/chef/parade/issues/31/labels/${encodeURIComponent(label)}`));
  });

  // #4260 : un ticket qu'un label d'attente d'avant parked parque (`blocked-on-human`, `set-aside:failures`…) est parqué pour la
  // cuisine (runtime/src/github-etat/etats.ts, `estParque`) : « back to the kitchen » le lui retire aussi, ou il ne reprendrait jamais.
  test("« back to the kitchen » sur un ticket parqué par un label d'avant parked : ce label retiré aussi — il reprend ; refusé, la phrase dit que `parked` est retiré, pas lui", async () => {
    const [ancien] = LABELS_D_AVANT_PARKED.filter((label) => label !== "waiting");
    const door = new Set(["fire", ancien as string]);
    const { client, demandes } = github((methode, chemin) => {
      const label = decodeURIComponent(chemin.split("/labels/")[1] ?? "");
      return methode === "DELETE" && door.delete(label) ? { status: 200, data: [] } : { status: 404, data: { message: "Label does not exist" } };
    });
    assert.ok("fait" in (await retirerLeLabel(LU, "cuisine", 31, client)));
    assert.deepEqual([...door], ["fire"]);
    assert.ok(demandes.includes(`DELETE /repos/chef/parade/issues/31/labels/${encodeURIComponent(ancien as string)}`), demandes.join("\n"));
    const refuse = github((_, chemin) => (chemin.endsWith(`/labels/${encodeURIComponent(ancien as string)}`) ? REFUSE : { status: 200, data: [] }));
    const dit = await retirerLeLabel(LU, "cuisine", 31, refuse.client);
    assert.ok("refus" in dit, JSON.stringify(dit));
    assert.equal(dit.refus, `\`parked\` is removed, but GitHub did not remove \`${ancien}\` from #31`);
  });

  test("une issue qui ne porte déjà plus le label (404) : c'est fait", async () => {
    const { client } = github(() => ({ status: 404, data: { message: "Label does not exist" } }));
    assert.ok("fait" in (await retirerLeLabel(LU, "retirer", 22, client)));
  });

  test("GitHub qui refuse, ou qui ne répond pas : rien n'est changé, la phrase le dit, et ce que GitHub a dit est au survol", async () => {
    assert.deepEqual(await retirerLeLabel(LU, "retirer", 22, github(() => REFUSE).client), {
      refus: "nothing was changed: GitHub did not remove `fire` from #22",
      detail: "GitHub refused the removal of `fire` (HTTP 403): Resource not accessible by integration",
    });
    const connection = await retirerLeLabel(LU, "cuisine", 31, github(() => ({ status: 401, data: {} })).client);
    assert.ok("refus" in connection && connection.detail.includes("sign in to GitHub again"), JSON.stringify(connection));
    const muet = await retirerLeLabel(LU, "retirer", 22, github(() => assert.fail(new Error("GitHub gave no answer within 30 s"))).client);
    assert.deepEqual(muet, { refus: "nothing was changed: GitHub did not remove `fire` from #22", detail: "GitHub gave no answer within 30 s" });
  });

  test("ni lecture du rail, ni ticket qu'elle porte, ni ticket nommé : rien n'est écrit, et pourquoi est dit", async () => {
    const { client, demandes } = github();
    assert.deepEqual(await retirerLeLabel(undefined, "retirer", 22, client), { refus: "nothing was written: the rail of this project has not been read yet — read it again", detail: "" });
    assert.deepEqual(await retirerLeLabel(LU, "retirer", 99, client), { refus: "nothing was written: #99 is not on the latest rail read — read it again", detail: "" });
    for (const ticket of ["22", 0, 1.5, -22, undefined]) {
      assert.deepEqual(await retirerLeLabel(LU, "retirer", ticket, client), { refus: "nothing was written: the action names no ticket", detail: "" }, String(ticket));
    }
    assert.deepEqual(demandes, []);
  });

  test("les tickets lus sont ceux du rail et de TODO ; une entrée sans numéro, ou un champ qui n'est pas une liste, n'en donne aucun", () => {
    assert.deepEqual([...ticketsLus(LU)], [22, 31]);
    assert.deepEqual([...ticketsLus({ faits: { rail: [{ ticket: "22" }, null, 7, { ticket: 5 }], attend: "rien" } })], [5]);
    assert.deepEqual([...ticketsLus({ faits: {} })], []);
  });

  test("une carte qui attend un autre humain est lue aussi : l'assignation ne retient personne (#3071)", () => {
    assert.deepEqual([...ticketsLus({ faits: { rail: [{ ticket: 22 }], attend: [{ ticket: 31 }], attendAutres: [{ ticket: 40, qui: ["bob"] }] } })], [22, 31, 40]);
  });

  test("seuls `retirer` et `cuisine` s'écrivent sur GitHub ; le reste a sa phrase, qui dit que rien n'est parti", () => {
    assert.ok(surGithub("retirer") && surGithub("cuisine"));
    for (const id of ["merger", "toString", "", undefined, 1]) assert.equal(surGithub(id), false, String(id));
    for (const phrase of Object.values(SANS_FAIT)) assert.match(phrase, /^nothing was (done|posted|changed|sent): /);
  });
});

describe("poster le commentaire du chef sur l'issue du ticket", () => {
  test("le texte part tel quel, dans `body`, sur l'issue du ticket ; posté (201), son adresse est rendue", async () => {
    const { client, demandes } = github(() => ({ status: 201, data: { html_url: "https://github.com/chef/parade/issues/21#issuecomment-7001" } }));
    assert.deepEqual(await commenterLIssue(REPOSITORY, 21, "du \"contexte\"\n- $(whoami)", client), { url: "https://github.com/chef/parade/issues/21#issuecomment-7001" });
    assert.deepEqual(demandes, [`POST /repos/chef/parade/issues/21/comments ${JSON.stringify({ body: "du \"contexte\"\n- $(whoami)" })}`]);
  });

  test("posté sans adresse rendue : posté quand même, sans adresse", async () => {
    assert.deepEqual(await commenterLIssue(REPOSITORY, 21, "x", github(() => ({ status: 201, data: null })).client), { url: null });
  });

  test("un autre statut que 201, ou GitHub qui ne répond pas : pas posté, et pourquoi, en une phrase", async () => {
    assert.deepEqual(await commenterLIssue(REPOSITORY, 21, "x", github(() => REFUSE).client), {
      raison: "The comment could not be posted on #21 of chef/parade: GitHub refused the comment (HTTP 403): Resource not accessible by integration.",
    });
    assert.deepEqual(await commenterLIssue(REPOSITORY, 21, "x", github(() => ({ status: 200, data: {} })).client), { raison: "The comment could not be posted on #21 of chef/parade: GitHub refused the comment (HTTP 200)." });
    assert.deepEqual(await commenterLIssue(REPOSITORY, 21, "x", github(() => assert.fail(new Error("GitHub gave no answer within 30 s."))).client), {
      raison: "The comment could not be posted on #21 of chef/parade: GitHub gave no answer within 30 s.",
    });
  });

  test("joué par la fiche, comme main.ts le branche : posté, la fiche dit son prix ; refusé, la phrase de GitHub sans majuscule ni point", async () => {
    const workstation = github(() => ({ status: 201, data: { html_url: "https://github.com/chef/parade/issues/21#issuecomment-7001" } }));
    assert.deepEqual(await commenter((ticket, texte) => commenterLIssue(REPOSITORY, ticket, texte, workstation.client), PROJECT, 21, "  du contexte\r\nfin  "), { poste: true, prix: PRIX });
    assert.deepEqual(workstation.demandes, [`POST /repos/chef/parade/issues/21/comments ${JSON.stringify({ body: "du contexte\nfin" })}`]);
    const refuse = github(() => REFUSE);
    assert.deepEqual(await commenter((ticket, texte) => commenterLIssue(REPOSITORY, ticket, texte, refuse.client), PROJECT, 21, "du contexte"), {
      poste: false,
      refus: "nothing was posted: the comment could not be posted on #21 of chef/parade: GitHub refused the comment (HTTP 403): Resource not accessible by integration",
    });
  });
});
