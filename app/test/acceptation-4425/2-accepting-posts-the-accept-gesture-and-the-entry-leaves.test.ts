// Test d'acceptation gelé (#4425). Critère 2 : une fois accepté par le chef, l'item est jugé et lu comme tout autre (la cuisine en reçoit le geste `accept`, rien d'autre n'est joué par l'app), et son entrée quitte le TODO.
import assert from "node:assert/strict";
import { test } from "node:test";
import { comprendre, tableau as tableauDe, type Carte, type Faits } from "../../src/faits.ts";
import { avecCeQuiAttendLeChef } from "../../src/tableau/attente-du-chef.ts";
import type { ReponseGitHub } from "../../src/tableau/client.ts";
import { lireLeTableauDuDepot } from "../../src/tableau/lecture.ts";
import { statusDuTableau } from "../../src/tableau/rail.ts";
import { repondreSurGithub, type ClientDeLaReponse } from "../../src/tableau-gestes/reponse-github.ts";
import { poserCarteDeTodo, REPOS } from "../../src/vue/carte-todo.js";
import type { Reponse } from "../../src/carte-todo.ts";
import { Faux } from "../aides/fausse-vue.ts";

const DEPOT = "acme/brigade";
const LU = "2026-11-26T09:00:00.000Z";
const CARTE_RETENUE = [
  "<!-- brigade:todo kind=product-question -->",
  "Held issue #77: accept it, so the kitchen reads it?",
  "",
  "- [accept] Accept it",
  "- [close] Close it",
  "",
  "Asks: Please add dark mode.",
  "Opened by @mallory, who has no write access to the repository.",
].join("\n");

const ok = (data: unknown, status = 200): ReponseGitHub => ({ status, data });
const labels = new Set(["chef-todo"]);
const commentaires = [{ id: 1, body: CARTE_RETENUE, author_association: "OWNER", created_at: "2026-11-25T01:00:00Z" }];
const ecrits: { methode: string; chemin: string; corps?: unknown }[] = [];
const lire = async (chemin: string): Promise<ReponseGitHub> => {
  const label = /[?&]labels=([^&]+)/.exec(chemin)?.[1];
  if (chemin.includes("/issues?") && label !== undefined) {
    return ok(labels.has(label) ? [{ number: 77, title: "Please add dark mode", html_url: `https://github.com/${DEPOT}/issues/77`, created_at: "2026-11-25T00:00:00Z", labels: [...labels].map((name) => ({ name })) }] : []);
  }
  if (chemin.includes("/pulls?")) return ok([]);
  if (/\/issues\/77\/comments/.test(chemin)) return ok(commentaires);
  if (/\/issues\/\d+\/(comments|events)/.test(chemin)) return ok([]);
  return ok({ message: "Not Found" }, 404);
};
const client: ClientDeLaReponse = {
  lire,
  ecrire: async (methode, chemin, corps) => {
    ecrits.push({ methode, chemin, ...(corps === undefined ? {} : { corps }) });
    if (methode === "POST" && chemin.endsWith("/issues/77/comments")) {
      commentaires.push({ id: 2, body: (corps as { body: string }).body, author_association: "OWNER", created_at: "2026-11-26T09:01:00Z" });
      return ok({ id: 2 }, 201);
    }
    const label = /\/issues\/77\/labels\/(.+)$/.exec(chemin)?.[1];
    if (methode === "DELETE" && label !== undefined) return labels.delete(decodeURIComponent(label)) ? ok([]) : ok({ message: "Label does not exist" }, 404);
    return ok({ message: "Not Found" }, 404);
  },
};

async function todo(): Promise<Carte[]> {
  const lu = await avecCeQuiAttendLeChef(await lireLeTableauDuDepot({ depot: DEPOT, appeler: lire, maintenant: () => new Date(LU) }), lire);
  assert.ok(lu.lu, "the board is read");
  const faits = comprendre(JSON.stringify(lu.faits));
  assert.ok(!("informe" in faits), "facts are in shape");
  return tableauDe(faits as Faits, undefined, { texte: statusDuTableau(lu), a: lu.luLe }).rail.colonnes.find(({ nom }) => nom === "Awaiting you")?.cartes ?? [];
}

test("pressing accept posts the accept gesture, plays nothing else, and the entry leaves the TODO", async () => {
  const carte = (await todo()).find(({ ticket }) => ticket === 77) ?? assert.fail("the held item is in the TODO");
  const doc = { createElement: (balise: string) => new Faux(balise) };
  const reponses: Reponse[] = [];
  const [racine] = poserCarteDeTodo(doc, 77, carte.todo ?? assert.fail("the card asks its question"), REPOS, { captures: [], brouillon: "", cle: "brigade#77" }, { repondre: (r) => void reponses.push(r), ecrire: () => {}, demander: () => {} }) as Faux[];
  const bouton = (racine ?? assert.fail("the card is drawn")).dessous("button").find(({ className, textContent }) => className === "choix" && textContent === "Accept it");
  (bouton ?? assert.fail("an accept button")).click();
  assert.equal(reponses.length, 1);
  const rendu = await repondreSurGithub({ depot: DEPOT, ticket: 77, chef: carte.chef, reponse: reponses[0], client });
  assert.ok("repondue" in rendu, JSON.stringify(rendu));
  assert.match(commentaires.at(-1)?.body ?? "", /^<!-- brigade:reponse gesture=accept -->/, "the kitchen reads the accept gesture");
  assert.ok(!ecrits.some(({ methode, chemin }) => methode === "PATCH" || (methode === "POST" && chemin.endsWith("/labels"))), "the app neither closes the issue nor puts a label: the kitchen judges it as normal");
  assert.ok(!(await todo()).some(({ ticket }) => ticket === 77), "the entry leaves the TODO");
});
