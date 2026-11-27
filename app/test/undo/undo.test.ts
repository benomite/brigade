// « undo » sur la carte d'un ticket servi (ticket 3274, épique 3267). On vérifie :
//   - la vue : le bouton est sur la carte d'un ticket servi dont la PR est mergée, et sur nulle autre — ni un ticket servi
//     sans PR, ni une carte du rail, de Taken, de Pass ; le clic part par le pont, le bouton dit qu'il est en route ; fait,
//     la carte dit en une ligne ce qui s'est passé — le revert en pass, ou le conflit et le ticket déposé pour la cuisine — ;
//     refusé, le bouton revient et la carte dit pourquoi ;
//   - le process principal : la commande `undo` du runtime, jouée telle qu'elle est (runtime/src/undo/commande.ts) sur un
//     faux GitHub — le revert propre ouvre sa PR, le revert en conflit n'en laisse aucune —, et un ticket que la dernière
//     lecture ne porte pas servi ne part pas.
// La vue est jouée telle qu'elle est, devant un faux document et un faux pont (helpers/false-vue.ts).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { Sortie } from "../../../runtime/src/appel.ts";
import type { IssueOuverte } from "../../../runtime/src/github.ts";
import { principal } from "../../../runtime/src/undo/commande.ts";
import type { GitHubDeLAnnulation } from "../../../runtime/src/undo/undo.ts";
import { POWER_UP } from "../../src/power-up.ts";
import { forTheBar } from "../../src/bar.ts";
import { EXAMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/colors.ts";
import { KITCHEN_ACTIONS } from "../../src/kitchen.ts";
import { BANNER, holdFacts, type Drawable, type Facts } from "../../src/facts.ts";
import { CONFIRMED, DIRECT } from "../../src/actions.ts";
import { TABS, HEADINGS } from "../../src/tabs.ts";
import { EFFORTS, MODELS } from "../../src/projects/projects.ts";
import type { Terminal } from "../../src/terminals.ts";
import { playTheCancellation, NOT_SERVED } from "../../src/vue/undo/undo-github.ts";
import { CANCEL, IN_CANCELLATION, PRICE } from "../../src/vue/undo/undo.js";
import { cardOfTicket, type Fake, type Played, playTheVue, type Answers, repos } from "../helpers/false-vue.ts";

const A = "2026-11-13T10:04:12.000Z";
const REPOSITORY = "chef/parade";
const SECOND: Terminal = { id: 1, projet: "parade", genre: "second", titre: "second · claude", note: "", arrete: false };
const issue = (ticket: number) => `https://github.com/${REPOSITORY}/issues/${ticket}`;

const CONFLICT = "#9 cannot be undone in one click: later work builds on it — ticket #44 asks the kitchen to undo it by hand";
const OWN = "#9 undone: the delivery of #44 (PR 45) goes through the pass as ticket #44, and #9 is reopened";

const startup = () => ({
  configuration: forTheBar({ chemin: "/tmp/app.json", projets: [{ nom: "parade", dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE,
  exemple: EXAMPLE,
  onglets: TABS,
  rubriques: HEADINGS,
  gestes: { allumage: POWER_UP, cuisine: KITCHEN_ACTIONS, directs: DIRECT, confirmes: CONFIRMED },
  banniere: BANNER,
  calibrage: { modeles: MODELS, efforts: EFFORTS },
  code: undefined,
});

// « parade » : un ticket dans chaque colonne qui bouge, #9 servi par sa PR mergée, #7 servi sans PR.
const facts = {
  etat: "ouverte",
  lu: "2026-11-13T10:04:11.000Z",
  dernierTick: "2026-11-13T10:04:11.000Z",
  compteurs: { rail: 3, auTravail: 1, aLaPass: 1, attend: 0, livres24h: 2 },
  dernierEvenement: null,
  rail: [
    { ticket: 21, etat: "en attente", titre: "L'export du journal", url: issue(21), activite: null, attente: null },
    { ticket: 14, etat: "pris", titre: "Le journal en ajout seul", url: issue(14), activite: null, attente: null },
    { ticket: 30, etat: "en pass", titre: "La pass verte", url: issue(30), activite: null, attente: null },
  ],
  cooks: [],
  attend: [],
  livres: [
    { ticket: 9, titre: "Le relevé des mesures", url: issue(9), livre: "2026-11-13T10:03:58.000Z", station: "box/claude", pr: `https://github.com/${REPOSITORY}/pull/19`, relecture: null },
    { ticket: 7, titre: "Les accès sous plafond", url: issue(7), livre: "2026-11-13T07:12:40.000Z", station: "box/claude", pr: null, relecture: null },
  ],
  urgence: null,
} as unknown as Facts;
const drawable = (): Drawable => holdFacts(() => new Map()).recevoir({ projet: "parade", demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(facts) }] });

async function open(answers: Answers = {}): Promise<Played> {
  const vue = await playTheVue({ demarrage: startup, espace: () => [SECOND], machines: () => [{ id: "poste", titre: "this computer" }], ...answers } as never);
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  const requests = vue.appels.filter(({ geste: action }) => action === "faits" || action === "relireBox");
  vue.dire("surFaits", { ...drawable(), demande: requests.at(-1)?.args[0] as number });
  await repos();
  return vue;
}

const card = (vue: Played, ticket: number) => cardOfTicket(vue, ticket) ?? assert.fail(`pas de carte #${ticket}`);
const buttons = (or: Fake, wording: string) => or.dessous("button").filter(({ textContent }) => textContent === wording);
const cancel = (or: Fake) => buttons(or, CANCEL)[0] ?? assert.fail("pas de bouton « undo »");

describe("le bouton « undo » sur la carte", () => {
  test("seule la carte d'un ticket servi, sa PR mergée, le porte — son prix au survol ; aucune autre carte", async () => {
    const vue = await open();
    const served = cancel(card(vue, 9));
    assert.ok(served.className.includes("annuler-servi"));
    assert.ok(card(vue, 9).dessous("button").some(({ className, ariaLabel }) => className === "aide" && String(ariaLabel).includes(PRICE(9))), "le prix est au survol");
    for (const ticket of [7, 21, 14, 30]) assert.deepEqual(buttons(card(vue, ticket), CANCEL), [], `#${ticket} n'est pas servi par une PR mergée`);
  });

  test("le clic part par le pont ; en route, le bouton le dit et ne se clique plus", async () => {
    let render: (rendered: unknown) => void = () => {};
    const vue = await open({ annulerServi: () => new Promise((finished) => (render = finished)) as never });
    cancel(card(vue, 9)).click();
    await repos();
    assert.deepEqual(vue.dernier("annulerServi"), ["parade", 9]);
    const inRoute = buttons(card(vue, 9), IN_CANCELLATION)[0] ?? assert.fail("le bouton ne dit pas qu'il est en route");
    assert.equal(inRoute.disabled, true);
    inRoute.click();
    await repos();
    assert.equal(vue.appels.filter(({ geste: action }) => action === "annulerServi").length, 1, "un seul geste part");
    render({ fait: OWN });
    await repos();
  });

  test("le revert propre : la carte dit en une ligne que la PR passe la pass et que le ticket est rouvert, et les faits sont relus", async () => {
    const vue = await open({ annulerServi: () => ({ fait: OWN }) });
    const before = vue.appels.filter(({ geste: action }) => action === "relireBox" || action === "faits").length;
    cancel(card(vue, 9)).click();
    await repos();
    assert.ok(card(vue, 9).dessous("p").some(({ textContent }) => textContent === OWN));
    assert.deepEqual(buttons(card(vue, 9), CANCEL), [], "fait, le bouton s'en va");
    assert.ok(vue.appels.filter(({ geste: action }) => action === "relireBox" || action === "faits").length > before, "les faits sont relus");
  });

  test("le revert en conflit : la carte reste dans Served et le dit en une ligne, sans bouton", async () => {
    const vue = await open({ annulerServi: () => ({ fait: CONFLICT }) });
    cancel(card(vue, 9)).click();
    await repos();
    const line = card(vue, 9).dessous("p").find(({ textContent }) => textContent === CONFLICT) ?? assert.fail("pas de ligne du conflit");
    assert.equal(line.className, "annule");
    assert.equal(CONFLICT.includes("\n"), false);
    assert.deepEqual(buttons(card(vue, 9), CANCEL), []);
    // Relue, la carte toujours servie garde sa ligne.
    const requests = vue.appels.filter(({ geste: action }) => action === "faits" || action === "relireBox");
    vue.dire("surFaits", { ...drawable(), demande: requests.at(-1)?.args[0] as number });
    await repos();
    assert.ok(card(vue, 9).dessous("p").some(({ textContent }) => textContent === CONFLICT));
  });

  test("refusé, le bouton revient et la carte dit pourquoi en une ligne", async () => {
    const vue = await open({ annulerServi: () => ({ refus: "nothing was done: #9 is not served: it is open", detail: "brigade : #9 is not served: it is open" }) });
    cancel(card(vue, 9)).click();
    await repos();
    assert.equal(cancel(card(vue, 9)).disabled, false);
    assert.ok(card(vue, 9).dessous("span").some(({ textContent }) => textContent === "nothing was done: #9 is not served: it is open"));
  });
});

// ── Le process principal : la commande `undo` du runtime, telle qu'elle est ──

// Le dépôt de « parade » : #9 servi par la PR #19, son merge fils de la base d'avant. `conflit` : le revert ne se fusionne
// pas sur la base.
function repository({ conflit: conflict }: { conflit: boolean }) {
  const issues = new Map<number, { titre: string; corps: string; labels: string[]; state: "open" | "closed" }>([[9, { titre: "Le relevé des mesures", corps: "", labels: ["fire"], state: "closed" }]]);
  const prs: Array<{ numero: number; branche: string; corps: string }> = [];
  const comments: Array<{ numero: number; corps: string }> = [];
  const branches = new Set<string>();
  let next = 44;
  const github: GitHubDeLAnnulation & { fermer(): void } = {
    issue: async (number) => {
      const readEntry = issues.get(number);
      return readEntry === undefined ? null : { number: number, title: readEntry.titre, labels: readEntry.labels, state: readEntry.state, createdAt: "", updatedAt: "", url: "", body: readEntry.corps };
    },
    ouvertes: async () => ({ inchange: false, issues: [...issues].filter(([, readEntry]) => readEntry.state === "open").map(([number, readEntry]): IssueOuverte => ({ number, title: readEntry.titre, labels: readEntry.labels, state: "open", createdAt: "", updatedAt: "", url: "", body: readEntry.corps, association: "OWNER" })), confirmer: () => {} }),
    prQuiFerme: async (number) => (number === 9 ? { number: 19, url: "", base: "main", sha: "tete", state: "closed", merged: true, enRetard: false, mergeePar: "box", commitDeMerge: "merge" } : null),
    commenter: async (number, body) => void comments.push({ numero: number, corps: body }),
    labelliser: async (number, labels) => void (issues.get(number) ?? assert.fail()).labels.push(...labels),
    delabelliser: async (number, label) => {
      const readEntry = issues.get(number) ?? assert.fail();
      readEntry.labels = readEntry.labels.filter((l) => l !== label);
    },
    creerIssue: async ({ titre: title, corps: body, labels }) => {
      const number = next++;
      issues.set(number, { titre: title, corps: body, labels: [...labels], state: "open" });
      return number;
    },
    ouvrirPR: async ({ branche: branch, corps: body }) => {
      const number = next++;
      prs.push({ numero: number, branche: branch, corps: body });
      return `https://github.com/${REPOSITORY}/pull/${number}`;
    },
    fermerIssue: async (number) => void ((issues.get(number) ?? assert.fail()).state = "closed"),
    teteDeLaBase: async () => "base",
    rouvrirIssue: async (number) => void ((issues.get(number) ?? assert.fail()).state = "open"),
    commitGit: async (sha) => (sha === "merge" ? { arbre: "arbre-du-merge", parents: ["avant", "tete"] } : sha === "avant" ? { arbre: "arbre-d-avant", parents: [] } : null),
    creerCommit: async () => "revert",
    creerBranche: async (branch) => void branches.add(branch),
    fusionnerDansLaBranche: async () => (conflict ? { conflit: true } : { sha: "fusion" }),
    supprimerBranche: async (branch) => void branches.delete(branch),
    droits: async () => ({ login: "chef" }),
    fermer: () => {},
  };
  return { github, issues, prs, commentaires: comments, branches };
}

const command = (github: GitHubDeLAnnulation & { fermer(): void }) => async () => ({
  principal: (call: Parameters<typeof principal>[0]) => principal(call, () => github),
  estUneSortie: (error: unknown): error is Sortie => error instanceof Sortie,
});

describe("le process principal joue la commande `undo` du runtime", () => {
  test("le revert propre : sa PR est ouverte sur la branche du ticket qui le porte, en pass, et #9 est rouvert par le chef", async () => {
    const readOne = repository({ conflit: false });
    const rendered = await playTheCancellation({ depot: REPOSITORY, ticket: 9, servi: true, commande: command(readOne.github), env: {} });
    assert.deepEqual(rendered, { fait: OWN });
    assert.deepEqual(readOne.prs, [{ numero: 45, branche: "cook/44-github", corps: "Closes #44\n\nReverts the merge of #9 (PR #19), asked by @chef from its card." }]);
    assert.ok(readOne.issues.get(44)?.labels.includes("in-pass"));
    assert.equal(readOne.issues.get(9)?.state, "open");
    assert.match(readOne.commentaires.find(({ numero: number }) => number === 9)?.corps ?? "", /^Undone by @chef from its card/);
  });

  test("le revert en conflit : aucune PR, un ticket pour la cuisine qui nomme #9, et la ligne le dit", async () => {
    const readOne = repository({ conflit: true });
    const rendered = await playTheCancellation({ depot: REPOSITORY, ticket: 9, servi: true, commande: command(readOne.github), env: {} });
    assert.deepEqual(rendered, { fait: CONFLICT });
    assert.deepEqual(readOne.prs, []);
    assert.deepEqual([...readOne.branches], []);
    assert.match(readOne.issues.get(44)?.corps ?? "", /^<!-- brigade:undo ticket=9 pr=19 -->\nUndo #9 by hand/);
    assert.equal(readOne.issues.get(9)?.state, "closed");
  });

  test("un ticket que la dernière lecture ne porte pas servi ne part pas : la commande n'est même pas chargée", async () => {
    let loaded = false;
    const rendered = await playTheCancellation({ depot: REPOSITORY, ticket: 9, servi: false, commande: async () => ((loaded = true), assert.fail("chargée")), env: {} });
    assert.deepEqual(rendered, { refus: NOT_SERVED, detail: "" });
    assert.equal(loaded, false);
    assert.deepEqual(await playTheCancellation({ depot: REPOSITORY, ticket: "9", servi: true, commande: async () => assert.fail("chargée"), env: {} }), { refus: NOT_SERVED, detail: "" });
  });

  test("un refus du runtime dit pourquoi, sans le préfixe de la commande", async () => {
    const readOne = repository({ conflit: false });
    (readOne.issues.get(9) ?? assert.fail()).state = "open";
    const rendered = await playTheCancellation({ depot: REPOSITORY, ticket: 9, servi: true, commande: command(readOne.github), env: {} });
    assert.deepEqual(rendered, { refus: "nothing was done: #9 is not served: it is open", detail: "brigade : #9 is not served: it is open" });
  });
});
