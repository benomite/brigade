// #4593 : un ticket `parked:chef` lu de GitHub atteint le TODO que la vue dessine, avec sa question et son bouton Answer —
// la lecture du rail, la lecture du chef, les faits que main.ts dit à la vue (`recevoir`, puis `attendre` du `status`), la vue
// jouée. Le jour où l'un de ces maillons retire la carte, ce test le dit.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { forTheBar } from "../../../src/bar.ts";
import { EXAMPLE } from "../../../src/config.ts";
import { PALETTE } from "../../../src/colors.ts";
import { holdFacts } from "../../../src/facts.ts";
import { TABS, HEADINGS } from "../../../src/tabs.ts";
import { EFFORTS, MODELS } from "../../../src/projects/projects.ts";
import { putAside } from "../../../src/awaiting.ts";
import type { CallGitHub, AnswerGitHub } from "../../../src/board/client.ts";
import { readTheBoardOfRepository } from "../../../src/board/read.ts";
import { withWhatAwaitingTheChef } from "../../../src/board/wait-of-chef.ts";
import { readOfBoard, FACTS, STATUS } from "../../../src/board/rail.ts";
import { shareOfCardsAssigned } from "../../../src/vue/cards-assigned/cards-assigned.ts";
import { FakeScreen, type Played, type Fake, playTheVue, repos } from "../../helpers/false-vue.ts";

const PARADE = "parade";
const REPOSITORY = "acme/parade";
const READ = "2026-11-27T09:00:00.000Z";
const WHY = "Parked for the chef by its cook: keep the CSV export in the free tier, or reserve it to paid plans?";

// GitHub : #41 parqué pour le chef (le label et le commentaire de la cuisine), #42 sur le rail.
const ok = (data: unknown, status = 200): AnswerGitHub => ({ status, data });
const issue = (number: number, labels: string[], assignees: string[] = []) => ({ number, title: `Ticket ${number}`, html_url: `https://github.com/${REPOSITORY}/issues/${number}`, created_at: "2026-11-20T00:00:00Z", labels: labels.map((name) => ({ name })), assignees: assignees.map((login) => ({ login })), body: "" });
const github = (assignees: string[]): CallGitHub => async (address) => {
  const path = address.replace("https://api.github.com", "");
  if (/\/issues\?state=closed/.test(path)) return ok([]);
  if (/\/issues\?/.test(path)) return ok([issue(41, ["fire", "parked:chef"], assignees), issue(42, ["fire"])]);
  if (/\/issues\/41\/comments/.test(path)) return ok([{ id: 1, body: WHY, author_association: "OWNER", created_at: "2026-11-27T08:00:00Z" }]);
  if (/\/issues\/\d+\/(comments|events|timeline)/.test(path) || path.includes("/pulls")) return ok([]);
  if (path === `/repos/${REPOSITORY}`) return ok({ default_branch: "main", owner: { login: "chef", type: "User" }, permissions: { push: true } });
  if (path.includes("/contents/")) return ok({ message: "Not Found" }, 404);
  if (path.includes("/check-runs")) return ok({ check_runs: [] });
  return ok({ message: "Not Found" }, 404);
};

const startup = () => ({
  configuration: forTheBar({ chemin: "/tmp/app.json", projets: [{ nom: PARADE, dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE, exemple: EXAMPLE, onglets: TABS, rubriques: HEADINGS,
  calibrage: { modeles: MODELS, efforts: EFFORTS }, telephone: { github: { compte: "chef" } },
});

// Comme main.ts : la lecture du rail, ce qui attend le chef partagé pour le compte connecté, les faits, puis le `status`.
async function show(assignees: string[], narrow = false): Promise<Played> {
  const call = github(assignees);
  const readOne = await withWhatAwaitingTheChef(await readTheBoardOfRepository({ depot: REPOSITORY, appeler: call, maintenant: () => new Date(READ) }), call, shareOfCardsAssigned({ appeler: call, depot: REPOSITORY, login: async () => "chef" }));
  assert.ok(readOne.lu, JSON.stringify(readOne));
  const vue = await playTheVue({ demarrage: startup, espace: () => [], machines: () => [], ouvrirIssue: () => true, repondreCarte: () => ({ repondue: true, dit: "posted", commentaire: 7 }) } as never, { ecran: new FakeScreen(narrow) });
  // Large : la page du projet. Étroit : l'accueil, la liste des cartes du chef.
  if (!narrow) (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  const facts = holdFacts();
  vue.dire("surFaits", { ...facts.recevoir(readOfBoard(readOne, PARADE, 0, [FACTS])), demande: vue.dernier("faits")[0] as number });
  const redraws = facts.attendre(putAside(readOfBoard(readOne, PARADE, 0, [STATUS])));
  if (redraws !== undefined) vue.dire("surFaits", { ...redraws, demande: vue.dernier("faits")[0] as number });
  await repos();
  return vue;
}
const theTodo = (vue: Played): Fake => {
  const opinion = vue.element("rail").children.find(({ className }) => className === "avis-du-todo") ?? assert.fail("pas de TODO");
  const [line] = opinion.dessous("button");
  if (line?.ariaExpanded !== "true") line?.click();
  return opinion.children.find(({ className }) => className === "todo-du-rail") ?? assert.fail("TODO pas déplié");
};

describe("#4593 : une issue `parked:chef` lue de GitHub est dans le TODO de la vue", () => {
  for (const [name, assignees] of [["sans assigné", []], ["assignée au chef", ["chef"]]] as const) {
    test(`${name} : sa question et Answer — et la liste « Awaiting you » dit le même ticket`, async () => {
      const vue = await show([...assignees]);
      const [entry, ...others] = theTodo(vue).dessous("li");
      assert.deepEqual(others, []);
      assert.equal(entry?.dataset.ticket, "41");
      assert.ok(entry?.dessous("p").some(({ textContent }) => textContent === WHY), "la question de la cuisine");
      const answer = entry?.dessous("button").find(({ textContent }) => textContent === "Answer") ?? assert.fail("Answer");
      // Answer ouvre la carte du ticket, où le chef écrit sa réponse (son bouton Answer poste, answer-github.ts) ; l'entrée reste.
      answer.click();
      await repos();
      assert.ok(theTodo(vue).dessous("li").some(({ dataset }) => dataset.ticket === "41"), "l'entrée reste dans le TODO");
      assert.ok(vue.element("fiche").dessous("button").some(({ textContent }) => textContent === "Answer"), "la carte ouverte porte son Answer");
    });
  }

  test("la liste « Awaiting you » du téléphone dit le même ticket, sa question, et sa carte ouverte porte Answer", async () => {
    const vue = await show([], true);
    const list = vue.element("cartes-du-chef");
    assert.equal(list.hidden, false);
    assert.match(list.textContent, /1 card/);
    assert.match(list.textContent, new RegExp(`#41 · ${PARADE}`));
    assert.ok(list.textContent.includes(WHY));
    (list.dessous("button").find(({ className }) => className === "carte-a-ouvrir") ?? assert.fail("la carte à ouvrir")).click();
    await repos();
    assert.ok(list.dessous("button").some(({ textContent }) => textContent === "Answer"), "Answer sur la carte ouverte");
  });
});
