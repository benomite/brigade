// La carte « Validate its screen » (ticket 3185), de bout en bout sur une carte d'essai : le runtime la pose comme la pass
// la pose (runtime/src/validation-design/, `retenirLeDesign`) sur un faux GitHub ; l'app la lit comme son TODO la lit
// (board/wait-of-chef.ts) — la question, la PR, les captures avant et après — ; puis ce que `playTheValidation` fait
// d'une commande qui refuse, ne se charge pas ou lève. Les gestes joués par la commande de l'ancien runtime
// (runtime/src/validation-design/commande.ts) sont supprimés avec lui (#4499). Aucun runtime ne tourne, aucun `gh` n'est lancé.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
const corpsDeCeQuiEstFait = (points: readonly string[]) => ["<!-- brigade:a-l-ecran -->", "**What was done on the screen**, by the cook:", "", ...points.map((point) => `- ${point}`)].join("\n");
import { postTheCard } from "./card-posted.ts";
import { cardOfChefOfTodo } from "../../src/card-todo.ts";
import { holdFacts } from "../../src/facts.ts";
import { readWhatAwaitingTheChef } from "../../src/board/wait-of-chef.ts";
import type { CallGitHub } from "../../src/board/client.ts";
import { briefOfBody, UNKNOWN, playTheValidation, KIND_OF_VALIDATION, validationOfBody, EMPTY, type CommandLoaded, type CommandOfRuntime } from "../../src/vue/validation-design/validation-design-github.ts";

const REPOSITORY = "chef/parade";
const SHA = "3f9c2a1b7d4e5f60718293a4b5c6d7e8f9012345";
const TICKET = 58;
const PR = 60;

type IssueFalse = { title: string; body: string; labels: Set<string>; state: "open" | "closed"; comments: Array<{ body: string; author: string; association: string; createdAt: string }> };

// Un faux GitHub qui tient le ticket, sa PR verte, et ce que le runtime y écrit.
function fakeGitHub() {
  const issues = new Map<number, IssueFalse>([[TICKET, { title: "Export the journal as CSV", body: "", labels: new Set(["fire", "in-pass"]), state: "open", comments: [] }]]);
  // Les commentaires de la PR : ce que la station y a posté, dont ce que le cook a changé à l'écran (ticket 3330).
  const onThePR: IssueFalse["comments"] = [];
  let nextOne = 61;
  const pr = { number: PR, url: `https://github.com/${REPOSITORY}/pull/${PR}`, base: "main", sha: SHA, state: "open" as "open" | "closed", merged: false, enRetard: false, mergeePar: null };
  const merges: Array<[number, string]> = [];
  const itsOwnOne = (number: number) => issues.get(number) ?? assert.fail(`pas d'issue #${number}`);
  const github = {
    creerIssue: async ({ titre: title, corps: body, labels }: { titre: string; corps: string; labels: string[] }) => {
      const number = nextOne++;
      issues.set(number, { title: title, body: body, labels: new Set(labels), state: "open", comments: [] });
      return number;
    },
    // Sur la PR, la copie de la validation demandée sur le ticket (ticket 3615).
    commenter: async (number: number, body: string) => void (number === PR ? onThePR : itsOwnOne(number).comments).push({ body: body, author: "brigade", association: "OWNER", createdAt: "2026-11-11T12:00:00Z" }),
    labelliser: async (number: number, labels: string[]) => labels.forEach((label) => itsOwnOne(number).labels.add(label)),
    delabelliser: async (number: number, label: string) => void itsOwnOne(number).labels.delete(label),
    fermerIssue: async (number: number) => void (itsOwnOne(number).state = "closed"),
    commentaires: async (number: number) => (number === PR ? onThePR : itsOwnOne(number).comments),
    issue: async (number: number) => {
      const readEntry = issues.get(number);
      return readEntry === undefined ? null : { number: number, title: readEntry.title, labels: [...readEntry.labels], state: readEntry.state, createdAt: "2026-11-11T12:00:00Z", updatedAt: "2026-11-11T12:00:00Z", url: `https://github.com/${REPOSITORY}/issues/${number}`, body: readEntry.body };
    },
    ouvertes: async () => ({
      inchange: false as const,
      issues: [...issues].filter(([, { state }]) => state === "open").map(([number, { title, body, labels }]) => ({ number, title, labels: [...labels], body, association: "OWNER" })),
      confirmer: () => {},
    }),
    prDeBranche: async (branch: string) => (branch === `cook/${TICKET}-github` ? { ...pr } : null),
    merger: async (number: number, sha: string) => {
      merges.push([number, sha]);
      pr.state = "closed";
      pr.merged = true;
      return { fait: true as const };
    },
    fermer: () => {},
  };
  // L'API de GitHub telle que l'app la lit pour son TODO : les issues ouvertes au label demandé, et leurs commentaires.
  const call: CallGitHub = async (path) => {
    const [route, request = ""] = path.split("?");
    const page = new URLSearchParams(request).get("page");
    if (page !== null && page !== "1") return { status: 200, data: [] };
    if (route === `/repos/${REPOSITORY}/issues`) {
      const label = new URLSearchParams(request).get("labels") ?? "";
      const data = [...issues]
        .filter(([, { state, labels }]) => state === "open" && labels.has(label))
        .map(([number, { title, body, labels }]) => ({ number, title, body, labels: [...labels].map((name) => ({ name })), html_url: `https://github.com/${REPOSITORY}/issues/${number}`, created_at: "2026-11-11T12:00:00Z" }));
      return { status: 200, data };
    }
    const comments = /^\/repos\/chef\/parade\/issues\/(\d+)\/comments$/.exec(route ?? "");
    if (comments !== null) return { status: 200, data: itsOwnOne(Number(comments[1])).comments.map(({ body, createdAt }) => ({ body, created_at: createdAt })) };
    return { status: 404, data: null };
  };
  return { github, appeler: call, issues, merges, pr, surLaPR: onThePR };
}

// La carte posée comme l'ancien runtime la posait (card-posted.ts), comme la pass la posait sur une livraison design verte qui porte ses captures : sur le ticket
// même, qui devient la carte (ticket 3615). `avant` : ce qui se passe sur le faux avant que la pass ne la pose.
async function cardOfTrial(before: (fake: ReturnType<typeof fakeGitHub>) => void = () => {}) {
  const fake = fakeGitHub();
  before(fake);
  // What the ticket asked and what the cook said it changed, as the old runtime read them for the card's brief (#3330).
  const ticketBody = fake.issues.get(TICKET)?.body ?? "";
  const asked = ticketBody.includes("The chef copies") ? "Export the journal as CSV — The chef copies the journal by hand every week." : "Export the journal as CSV";
  const done = fake.surLaPR.length > 0 ? ["the rail shows an Export as CSV button", "an empty journal greys it out"] : null;
  await postTheCard(fake.github, { asked, done });
  assert.equal(fake.issues.size, 1, "no issue apart");
  return fake;
}

// Ce que l'app lit de la carte, et ce que les faits en gardent.
async function readEntry(call: CallGitHub) {
  const wait = await readWhatAwaitingTheChef({ depot: REPOSITORY, appeler: call });
  assert.equal(wait.lue, true);
  return wait.lue ? wait.attentes : [];
}

// Une commande chargée, et la `Sortie` qui dit son refus (la classe du runtime a été supprimée avec l'ancien runtime).
class Sortie {
  readonly code: number;
  constructor(code: number) {
    this.code = code;
  }
}
const isOneOutput = (error: unknown): error is Sortie => error instanceof Sortie;
const loaded = (principal: CommandOfRuntime) => async (): Promise<CommandLoaded> => ({ principal, estUneSortie: isOneOutput });

describe("l'app lit la carte que le runtime pose", () => {
  test("sa question, sa PR, son ticket et les captures avant et après de chaque écran, au commit jugé vert", async () => {
    const fake = await cardOfTrial();
    const [card, ...others] = await readEntry(fake.appeler);
    assert.deepEqual(others, []);
    assert.equal(card?.ticket, TICKET);
    assert.equal(card?.chef?.sorte, KIND_OF_VALIDATION);
    const design = card?.chef?.design ?? assert.fail("la carte ne dit pas ce qu'elle valide");
    assert.equal(design.pr, PR);
    assert.equal(design.ticket, TICKET);
    assert.equal(design.url, `https://github.com/${REPOSITORY}/pull/${PR}`);
    assert.equal(design.captures.complet, true);
    assert.deepEqual(
      design.captures.ecrans.map(({ ecran: screen, avant: before, apres: after }) => [screen, before?.includes(`/blob/${SHA}/docs/captures/${TICKET}/rail-avant.png`), after?.includes(`/blob/${SHA}/docs/captures/${TICKET}/rail-apres.png`)]),
      [["rail", true, true]],
    );
    // Sa ligne, au second : les deux gestes de la carte.
    assert.match(card?.ligne ?? "", /Does the screen of #58 look right\? .* — on its Todo card: Validate, or Send back to the kitchen with a comment$/);
  });

  test("la carte de TODO : sa question, ses captures, sa PR — ni choix ni réponse libre", async () => {
    const fake = await cardOfTrial();
    const [card] = await readEntry(fake.appeler);
    const todo = cardOfChefOfTodo(card?.chef ?? assert.fail("pas de carte")) ?? assert.fail("pas de carte de TODO");
    assert.match(todo.question ?? "", /^Does the screen of #58 look right\?/);
    assert.deepEqual(todo.validation, { pr: PR, ticket: TICKET });
    assert.deepEqual(todo.choix, []);
    assert.equal(todo.contexte, undefined, "le lien de la PR est sur la carte, pas en contexte");
    assert.deepEqual(
      todo.captures?.ecrans.map(({ ecran: screen, avant: before, apres: after }) => [screen, before.livree, after.livree, before.legende, after.legende]),
      [["rail", true, true, "rail — before", "rail — after"]],
    );
    assert.equal(todo.captures?.incomplete, undefined);
  });

  test("les faits de l'app gardent ce que la carte valide : sa PR s'ouvre, ses captures se lisent", async () => {
    const fake = await cardOfTrial();
    const [card] = await readEntry(fake.appeler);
    const heldOnes = holdFacts(() => new Map());
    const facts = { etat: "ouverte", lu: "2026-11-11T12:00:00Z", dernierTick: "2026-11-11T12:00:00Z", compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 1, livres24h: 0 }, dernierEvenement: null, rail: [], cooks: [], attend: [{ ticket: TICKET, titre: card?.titre, url: card?.url, chef: card?.chef }] };
    heldOnes.recevoir({ projet: "parade", demande: 0, a: "2026-11-11T12:00:00Z", sorties: [{ commande: "facts", texte: JSON.stringify(facts) }] });
    assert.equal(heldOnes.chef("parade", TICKET)?.design?.pr, PR);
    assert.equal(heldOnes.pr("parade", TICKET), `https://github.com/${REPOSITORY}/pull/${PR}`);
    assert.match(heldOnes.capture("parade", TICKET, "rail", "apres") ?? "", new RegExp(`/blob/${SHA}/docs/captures/58/rail-apres\\.png\\?raw=true$`));
    // Ce qui n'a pas la forme d'une carte n'est pas gardé.
    heldOnes.recevoir({ projet: "parade", demande: 1, a: "2026-11-11T12:01:00Z", sorties: [{ commande: "facts", texte: JSON.stringify({ ...facts, attend: [{ ticket: TICKET, titre: "x", url: card?.url, chef: { ...card?.chef, design: { pr: "60" } } }] }) }] });
    assert.equal(heldOnes.chef("parade", TICKET)?.design, undefined);
  });

  test("son brief (ticket 3330) : ce que le ticket demandait et ce que le cook a changé à l'écran, posté sur la PR — sur la carte de TODO et dans les faits", async () => {
    const fake = await cardOfTrial((before) => {
      (before.issues.get(TICKET) ?? assert.fail("pas de ticket")).body = "## Context\n\nThe chef copies the journal by hand every week.\n\n## Acceptance criteria\n\n- a CSV button";
      before.surLaPR.push({ body: corpsDeCeQuiEstFait(["the rail shows an Export as CSV button", "an empty journal greys it out"]), author: "brigade", association: "OWNER", createdAt: "2026-11-11T11:00:00Z" });
    });
    const [card] = await readEntry(fake.appeler);
    const expected = { demande: "Export the journal as CSV — The chef copies the journal by hand every week.", fait: ["the rail shows an Export as CSV button", "an empty journal greys it out"] };
    assert.deepEqual(card?.chef?.design?.brief, expected);
    assert.deepEqual(cardOfChefOfTodo(card?.chef ?? assert.fail("pas de carte"))?.brief, expected);
    const heldOnes = holdFacts(() => new Map());
    const facts = { etat: "ouverte", lu: "2026-11-11T12:00:00Z", dernierTick: "2026-11-11T12:00:00Z", compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 1, livres24h: 0 }, dernierEvenement: null, rail: [], cooks: [], attend: [{ ticket: TICKET, titre: card?.titre, url: card?.url, chef: card?.chef }] };
    heldOnes.recevoir({ projet: "parade", demande: 0, a: "2026-11-11T12:00:00Z", sorties: [{ commande: "facts", texte: JSON.stringify(facts) }] });
    assert.deepEqual(heldOnes.chef("parade", TICKET)?.design?.brief, expected);
  });

  test("sans résumé posté sur la PR, le brief n'a rien de fait et garde ce qui était demandé ; une carte d'avant le ticket 3330 garde le titre de son ticket", async () => {
    const fake = await cardOfTrial();
    const [card] = await readEntry(fake.appeler);
    assert.deepEqual(card?.chef?.design?.brief, { demande: "Export the journal as CSV", fait: null });
    const oldOne = [`<!-- brigade:validation-design pr=${PR} ticket=${TICKET} sha=${SHA} -->`, "**Does the screen of #58 look right?**", "", "Ticket: #58 — Export the journal as CSV", `Pull request: https://github.com/${REPOSITORY}/pull/${PR}`].join("\n");
    assert.deepEqual(briefOfBody(oldOne), { demande: "Export the journal as CSV", fait: null });
    assert.deepEqual(briefOfBody("nothing"), { demande: "", fait: null });
  });

  test("une image d'un autre dépôt, d'un autre commit ou hors du dossier du ticket n'est pas une capture de la carte", () => {
    const elsewhere = (repository: string, sha: string, path: string) => `![x](https://github.com/${repository}/blob/${sha}/${path}?raw=true)`;
    const body = [
      `<!-- brigade:validation-design pr=${PR} ticket=${TICKET} sha=${SHA} -->`,
      elsewhere("intrus/autre", SHA, "docs/captures/58/rail-avant.png"),
      elsewhere(REPOSITORY, "aaaaaaa", "docs/captures/58/rail-avant.png"),
      elsewhere(REPOSITORY, SHA, "docs/captures/59/rail-avant.png"),
      elsewhere(REPOSITORY, SHA, "docs/captures/58/fiche-avant.png"),
    ].join("\n");
    assert.deepEqual(validationOfBody(REPOSITORY, body)?.captures, { complet: false, ecrans: [{ ecran: "fiche", avant: `https://github.com/${REPOSITORY}/blob/${SHA}/docs/captures/58/fiche-avant.png?raw=true`, apres: null }] });
  });

  test("une issue dont le corps ne dit pas sa PR : la carte le dit, sans geste à jouer", async () => {
    const fake = await cardOfTrial();
    // Son commentaire de carte réécrit sans ce qu'il valide.
    const comments = (fake.issues.get(TICKET) ?? assert.fail("pas de carte")).comments;
    for (const comment of comments) comment.body = comment.body.replace(/^<!-- brigade:todo kind=design-validation [^>]*-->/, "<!-- brigade:todo kind=design-validation -->");
    const [card] = await readEntry(fake.appeler);
    assert.equal(card?.chef?.design, undefined);
    const todo = cardOfChefOfTodo(card?.chef ?? assert.fail("pas de carte")) ?? assert.fail("pas de carte de TODO");
    assert.deepEqual(todo.validation, { illisible: "its issue does not say which pull request it validates: validate it on GitHub" });
    assert.equal(todo.captures, undefined);
  });
});

describe("les gestes de la carte, sans la commande du runtime", () => {
  test("un renvoi sans commentaire, ou une carte que la lecture ne porte plus : rien ne part", async () => {
    const fake = await cardOfTrial();
    const [card] = await readEntry(fake.appeler);
    let launchedOne = false;
    const command = loaded(async () => void (launchedOne = true));
    assert.deepEqual(await playTheValidation({ depot: REPOSITORY, design: card?.chef?.design, geste: { geste: "renvoyer", commentaire: "  \n " }, env: {}, commande: command }), { refus: EMPTY, detail: "" });
    assert.deepEqual(await playTheValidation({ depot: REPOSITORY, design: undefined, geste: { geste: "valider" }, env: {}, commande: command }), { refus: UNKNOWN, detail: "" });
    assert.equal(launchedOne, false);
    assert.equal(fake.issues.get(TICKET)?.labels.has("chef-todo"), true);
  });

  test("une commande qui ne se charge pas, ou qui lève, se dit : rien n'est fait", async () => {
    const fake = await cardOfTrial();
    const [card] = await readEntry(fake.appeler);
    const rendered = await playTheValidation({ depot: REPOSITORY, design: card?.chef?.design, geste: { geste: "valider" }, env: {}, commande: async () => assert.fail("the runtime is not there") });
    assert.equal("refus" in rendered && rendered.refus, "nothing was done: the kitchen's command could not run");
    assert.match("refus" in rendered ? rendered.detail : "", /the runtime is not there/);
  });

  test("une erreur qui porte un `code` sans être la `Sortie` du runtime — une erreur système — n'est pas lue comme son refus", async () => {
    const fake = await cardOfTrial();
    const [card] = await readEntry(fake.appeler);
    const system = Object.assign(new Error("spawn gh ENOENT"), { code: -2 });
    const rendered = await playTheValidation({ depot: REPOSITORY, design: card?.chef?.design, geste: { geste: "valider" }, env: {}, commande: loaded(async ({ redire }) => (redire("brigade : not this line"), Promise.reject(system))) });
    assert.deepEqual(rendered, { refus: "nothing was done: the kitchen's command could not run", detail: "spawn gh ENOENT" });
    assert.equal(fake.issues.get(TICKET)?.labels.has("chef-todo"), true);
  });
});
