// Test d'acceptation gelé (#4425). Critère 1 : un item retenu paraît une fois dans le TODO du chef, avec son auteur et un bouton accept ; recharger ou relire ne crée pas de seconde entrée.
import assert from "node:assert/strict";
import { test } from "node:test";
import { comprendre, tableau as tableauDe, type Carte, type Faits } from "../../src/faits.ts";
import { avecCeQuiAttendLeChef } from "../../src/tableau/attente-du-chef.ts";
import type { ReponseGitHub } from "../../src/tableau/client.ts";
import { lireLeTableauDuDepot } from "../../src/tableau/lecture.ts";
import { statusDuTableau } from "../../src/tableau/rail.ts";
import { poserCarteDeTodo, REPOS } from "../../src/vue/carte-todo.js";
import { Faux } from "../aides/fausse-vue.ts";

const DEPOT = "acme/brigade";
const LU = "2026-11-26T09:00:00.000Z";
// La carte que la cuisine pose sur l'issue retenue d'un auteur sans l'écriture (runtime/src/trust/retenue.ts).
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

const ok = (data: unknown): ReponseGitHub => ({ status: 200, data });
const appeler = async (chemin: string): Promise<ReponseGitHub> => {
  const label = /[?&]labels=([^&]+)/.exec(chemin)?.[1];
  if (chemin.includes("/issues?") && label !== undefined) {
    return ok(label === "chef-todo" ? [{ number: 77, title: "Please add dark mode", html_url: `https://github.com/${DEPOT}/issues/77`, created_at: "2026-11-25T00:00:00Z", labels: [{ name: "chef-todo" }] }] : []);
  }
  if (chemin.includes("/pulls?")) return ok([]);
  if (/\/issues\/77\/comments/.test(chemin)) return ok([{ id: 1, body: CARTE_RETENUE, author_association: "OWNER", created_at: "2026-11-25T01:00:00Z" }]);
  if (/\/issues\/\d+\/(comments|events)/.test(chemin)) return ok([]);
  return { status: 404, data: { message: "Not Found" } };
};

async function todo(): Promise<Carte[]> {
  const lu = await avecCeQuiAttendLeChef(await lireLeTableauDuDepot({ depot: DEPOT, appeler, maintenant: () => new Date(LU) }), appeler);
  assert.ok(lu.lu, "the board is read");
  const faits = comprendre(JSON.stringify(lu.faits));
  assert.ok(!("informe" in faits), "facts are in shape");
  return tableauDe(faits as Faits, undefined, { texte: statusDuTableau(lu), a: lu.luLe }).rail.colonnes.find(({ nom }) => nom === "Awaiting you")?.cartes ?? [];
}

test("a held item shows once in the chef's TODO with its author and an accept button, even after a new poll", async () => {
  await todo();
  const cartes = (await todo()).filter(({ ticket }) => ticket === 77);
  assert.equal(cartes.length, 1, "one entry for the held item after two polls");
  const doc = { createElement: (balise: string) => new Faux(balise) };
  const [racine] = poserCarteDeTodo(doc, 77, cartes[0]?.todo ?? assert.fail("the card asks its question"), REPOS, { captures: [], brouillon: "", cle: "brigade#77" }, { repondre: () => {}, ecrire: () => {}, demander: () => {} }) as Faux[];
  const carte = racine ?? assert.fail("the card is drawn");
  assert.match(`${cartes[0]?.ligne ?? ""} ${carte.textContent}`, /@?mallory/, "the author is named");
  const boutons = carte.dessous("button").filter(({ className }) => className === "choix");
  assert.ok(boutons.some(({ textContent }) => textContent === "Accept it"), "an accept button");
});
