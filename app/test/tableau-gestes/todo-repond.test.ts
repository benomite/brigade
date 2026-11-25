// Répondre depuis le TODO du chef envoie le ticket plus loin (#4261) : un bouton d'une entrée du TODO poste la réponse sur
// l'issue, lève ce qui le gardait parked pour le chef, et le ticket reprend à l'étape où il était — sans rien recopier. Joué
// sur un faux GitHub qui tient ses issues, leurs labels, leurs commentaires et ses PR : le TODO lu, posé, cliqué, et relu.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Reponse } from "../../src/carte-todo.ts";
import { comprendre, tableau as tableauDe, type Carte, type Faits } from "../../src/faits.ts";
import { avecCeQuiAttendLeChef } from "../../src/tableau/attente-du-chef.ts";
import type { ReponseGitHub } from "../../src/tableau/client.ts";
import { lireLeTableauDuDepot } from "../../src/tableau/lecture.ts";
import { statusDuTableau } from "../../src/tableau/rail.ts";
import { repondreSurGithub, type ClientDeLaReponse } from "../../src/tableau-gestes/reponse-github.ts";
import { REPOS } from "../../src/vue/carte-todo.js";
import { ceQuiTAttend, planDeLaCuisine, poserLeTodo } from "../../src/vue/cuisine/cuisine.js";
import { rangerLeRail } from "../../src/vue/todo/todo.js";
import { Faux } from "../aides/fausse-vue.ts";

const DEPOT = "acme/parade";
const LU = "2026-11-25T09:00:00.000Z";
// #5 est en pass — sa PR #6 est ouverte — et sa carte pose une question au chef ; #7, sur le rail, est mis de côté par la
// station sans PR.
const QUESTION_5 = "<!-- brigade:todo kind=product-question -->\nDoes the export keep the old column order?\n- [resume] Yes, keep the old order\n- [close] No, drop the export";

type Issue = { labels: Set<string>; state: "open" | "closed"; commentaires: { id: number; body: string; author_association: string; created_at: string }[] };

function monde() {
  let suivant = 100;
  const commentaire = (body: string) => ({ id: suivant++, body, author_association: "OWNER", created_at: "2026-11-24T02:00:00Z" });
  const issues = new Map<number, Issue>([
    [5, { labels: new Set(["fire", "in-pass", "chef-todo"]), state: "open", commentaires: [commentaire(QUESTION_5)] }],
    [7, { labels: new Set(["fire", "blocked-on-human"]), state: "open", commentaires: [] }],
  ]);
  const ok = (data: unknown, status = 200): ReponseGitHub => ({ status, data });
  const issueJson = (numero: number, issue: Issue) => ({ number: numero, title: `Ticket ${numero}`, html_url: `https://github.com/${DEPOT}/issues/${numero}`, created_at: "2026-11-20T00:00:00Z", labels: [...issue.labels].map((name) => ({ name })) });
  const pr6 = { number: 6, state: "open", merged: false, html_url: `https://github.com/${DEPOT}/pull/6`, created_at: "2026-11-24T00:00:00Z", head: { ref: "cook/5-export" }, body: "Closes #5" };
  const lire = async (chemin: string): Promise<ReponseGitHub> => {
    const label = /[?&]labels=([^&]+)/.exec(chemin)?.[1];
    if (chemin.includes("/issues?") && label !== undefined) return ok([...issues].filter(([, issue]) => issue.state === "open" && issue.labels.has(label)).map(([numero, issue]) => issueJson(numero, issue)));
    if (chemin.includes("/pulls?")) return ok([pr6]);
    if (/\/pulls\/6$/.test(chemin)) return ok(pr6);
    const commentees = /\/issues\/(\d+)\/comments/.exec(chemin)?.[1];
    if (commentees !== undefined) return ok(issues.get(Number(commentees))?.commentaires ?? []);
    if (/\/issues\/\d+\/events/.test(chemin)) return ok([]);
    // La base, verte : #5 en pass n'est pas « base rouge ».
    if (chemin === `/repos/${DEPOT}`) return ok({ default_branch: "main" });
    if (chemin.includes("/commits/main/check-runs")) return ok({ check_runs: [{ conclusion: "success" }] });
    return ok({ message: "Not Found" }, 404);
  };
  const ecrire: ClientDeLaReponse["ecrire"] = async (methode, chemin, corps) => {
    const [, numero, reste] = /^\/repos\/[^/]+\/[^/]+\/issues\/(\d+)(.*)$/.exec(chemin) ?? [];
    const issue = issues.get(Number(numero));
    if (issue === undefined) return ok({ message: "Not Found" }, 404);
    if (methode === "POST" && reste === "/comments") {
      const pose = commentaire((corps as { body: string }).body);
      issue.commentaires.push(pose);
      return ok({ id: pose.id }, 201);
    }
    const label = /^\/labels\/(.+)$/.exec(reste ?? "")?.[1];
    if (methode === "DELETE" && label !== undefined) return issue.labels.delete(decodeURIComponent(label)) ? ok([]) : ok({ message: "Label does not exist" }, 404);
    if (methode === "PATCH" && reste === "") {
      issue.state = (corps as { state: "open" | "closed" }).state;
      return ok({});
    }
    return ok({ message: "Not Found" }, 404);
  };
  return { issues, client: { lire, ecrire } satisfies ClientDeLaReponse };
}

// Le plan que la vue dessine de la lecture de ce monde : ses colonnes, et le TODO.
async function plan(client: ClientDeLaReponse) {
  const lu = await avecCeQuiAttendLeChef(await lireLeTableauDuDepot({ depot: DEPOT, appeler: client.lire, maintenant: () => new Date(LU) }), client.lire);
  assert.ok(lu.lu, "the board is read");
  const faits = comprendre(JSON.stringify(lu.faits));
  assert.ok(!("informe" in faits));
  return planDeLaCuisine(rangerLeRail(tableauDe(faits as Faits, undefined, { texte: statusDuTableau(lu), a: lu.luLe }).rail.colonnes).colonnes);
}
const colonneDe = (lePlan: Awaited<ReturnType<typeof plan>>, ticket: number) => lePlan.find(({ cartes }) => cartes.some((carte) => carte.ticket === ticket))?.nom;

// Un clic sur le bouton `libelle` de l'entrée du TODO de `ticket`, joué sur GitHub comme la vue le joue (repondreSurGithub).
async function cliquer(leMonde: ReturnType<typeof monde>, ticket: number, libelle: string) {
  const todo = ceQuiTAttend(await plan(leMonde.client));
  const joues: { carte: Carte; reponse: Reponse }[] = [];
  const pose = poserLeTodo({ createElement: (balise: string) => new Faux(balise) }, { cartes: todo, ouvrir: () => {}, gestes: { etat: () => REPOS, attente: [], jouer: (numero, _sorte, reponse) => void joues.push({ carte: todo.find((une) => une.ticket === numero) as Carte, reponse: reponse as Reponse }) } }) as unknown as Faux;
  const entree = pose.dessous("li").find(({ dataset }) => dataset.ticket === String(ticket)) ?? assert.fail(`#${ticket} is in the TODO`);
  (entree.dessous("button").find(({ textContent }) => textContent === libelle) ?? assert.fail(`a button “${libelle}”`)).click();
  const [joue] = joues;
  assert.ok(joue !== undefined && joues.length === 1);
  return repondreSurGithub({ depot: DEPOT, ticket, chef: joue.carte.chef, reponse: joue.reponse, client: leMonde.client });
}

describe("un bouton du TODO répond, lève ce qui gardait le ticket, et le ticket reprend où il était", () => {
  test("#5, en pass : « Yes, keep the old order » — la réponse sur l'issue, `chef-todo` levé, #5 quitte le TODO et reste dans Pass", async () => {
    const leMonde = monde();
    const avant = await plan(leMonde.client);
    assert.deepEqual(ceQuiTAttend(avant).map(({ ticket }) => ticket).sort(), [5, 7]);
    assert.equal(colonneDe(avant, 5), "Pass");
    const rendu = await cliquer(leMonde, 5, "Yes, keep the old order");
    assert.ok("repondue" in rendu, JSON.stringify(rendu));
    assert.equal(leMonde.issues.get(5)?.commentaires.at(-1)?.body, "<!-- brigade:reponse gesture=resume -->\nYes, keep the old order");
    assert.deepEqual([...(leMonde.issues.get(5)?.labels ?? [])], ["fire", "in-pass"]);
    const apres = await plan(leMonde.client);
    assert.deepEqual(ceQuiTAttend(apres).map(({ ticket }) => ticket), [7]);
    assert.equal(colonneDe(apres, 5), "Pass");
    assert.equal(apres.flatMap(({ cartes }) => cartes).find(({ ticket }) => ticket === 5)?.parque, undefined);
  });

  test("#7, mis de côté sur le rail : « Back to the kitchen » — `blocked-on-human` levé, #7 revient prêt sur le rail", async () => {
    const leMonde = monde();
    assert.equal(colonneDe(await plan(leMonde.client), 7), "Backlog");
    const rendu = await cliquer(leMonde, 7, "Back to the kitchen");
    assert.ok("repondue" in rendu, JSON.stringify(rendu));
    assert.deepEqual([...(leMonde.issues.get(7)?.labels ?? [])], ["fire"]);
    const apres = await plan(leMonde.client);
    assert.deepEqual(ceQuiTAttend(apres).map(({ ticket }) => ticket), [5]);
    assert.deepEqual(apres.find(({ nom }) => nom === "Backlog")?.pretes?.map(({ ticket }) => ticket), [7]);
  });

  test("#7 : « Close it » — l'issue fermée, elle quitte le TODO", async () => {
    const leMonde = monde();
    const rendu = await cliquer(leMonde, 7, "Close it");
    assert.ok("repondue" in rendu, JSON.stringify(rendu));
    assert.equal(leMonde.issues.get(7)?.state, "closed");
    assert.deepEqual(ceQuiTAttend(await plan(leMonde.client)).map(({ ticket }) => ticket), [5]);
  });
});
