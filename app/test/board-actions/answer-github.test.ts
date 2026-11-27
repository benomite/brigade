// La réponse du chef à une carte du chef lue de GitHub (#2434) : le commentaire marqué porte ses
// choix (`- [<geste>] <libellé>`), la carte de Todo les montre en boutons avec un champ libre, et un clic poste la réponse
// sur l'issue puis joue son geste sur GitHub — `resume`, `merge`, `drop`, `close`. Joué sur un faux GitHub qui tient ses
// issues, leurs labels, leurs commentaires et ses PR : la carte lue, posée par la vue, cliquée, et l'issue relue après.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { cardOfChefOfTodo, type CardOfTodo, type Answer } from "../../src/card-todo.ts";
import { understand, board as boardOf, type Card, type Facts } from "../../src/facts.ts";
import { situation } from "../../src/story.ts";
import { withWhatAwaitingTheChef } from "../../src/board/wait-of-chef.ts";
import { LABELS_D_AVANT_PARKED, LABELS_D_AVANT_PARKED_POUR_LE_CHEF } from "../../../runtime/src/github-etat/etats.ts";
import type { AnswerGitHub } from "../../src/board/client.ts";
import { readTheBoardOfRepository, type ReadOfBoardOfRepository } from "../../src/board/read.ts";
import { statusOfBoard } from "../../src/board/rail.ts";
import { shapeOfChef } from "../../src/board/todo-github.ts";
import { thirdOfComments } from "../../src/vue/wait/wait-github.ts";
import { commentOfAnswer, answerOnGithub, type ClientOfTheAnswer } from "../../src/board-actions/answer-github.ts";
import { FIELD, SEND, setCardOfTodo, REPOS } from "../../src/vue/card-todo.js";
import { Fake } from "../helpers/false-vue.ts";

const REPOSITORY = "acme/brigade";
const READ = "2026-11-05T09:00:00.000Z";

// Les deux questions du 2026-11-05, réécrites avec leurs choix : #2061 et #1554, chacune `served-elsewhere` sous sa question
// de produit. #1554 a une PR ouverte, #1560.
const QUESTION_2061 = [
  "<!-- brigade:todo kind=product-question -->",
  "Is every project on GitHub-only now, so the old path can go?",
  "- [resume] Yes, every project is on GitHub-only: remove the old path",
  "- [drop] No, keep it waiting",
  "",
  "The old path still runs the Kitchen board of two projects.",
].join("\n");
const QUESTION_1554 = [
  "<!-- brigade:todo kind=product-question -->",
  "Does the export keep the old column order?",
  "- [merge] Yes, merge PR #1560 as delivered",
  "- [close] No, we drop the export",
].join("\n");

type Issue = { pr?: true; labels: Set<string>; state: "open" | "closed"; commentaires: { id: number; body: string; author_association: string; created_at: string }[] };
type PR = { state: "open" | "closed"; merged: boolean; ref: string; body: string };

// Un faux GitHub qui tient son monde : les lectures du rail (vue/rail/github.ts) et les écritures de la réponse.
function world() {
  let next = 100;
  const comment = (body: string) => ({ id: next++, body, author_association: "OWNER", created_at: "2026-11-05T02:00:00Z" });
  const issues = new Map<number, Issue>([
    [2061, { labels: new Set(["fire", "served-elsewhere"]), state: "open", commentaires: [comment(QUESTION_2061)] }],
    [1554, { labels: new Set(["fire", "served-elsewhere"]), state: "open", commentaires: [comment(QUESTION_1554)] }],
  ]);
  const prs = new Map<number, PR>([[1560, { state: "open", merged: false, ref: "cook/1554-export", body: "Closes #1554" }]]);
  const writtenOnes: { methode: string; chemin: string; corps?: unknown }[] = [];
  const ok = (data: unknown, status = 200): AnswerGitHub => ({ status, data });
  const issueJson = (number: number, issue: Issue) => ({ number: number, title: `Ticket ${number}`, html_url: `https://github.com/${REPOSITORY}/issues/${number}`, created_at: "2026-11-01T00:00:00Z", labels: [...issue.labels].map((name) => ({ name })), ...(issue.pr === true ? { pull_request: {} } : {}) });
  const refused = new Set<number>();
  const prJson = (number: number, pr: PR) => ({ number: number, state: pr.state, merged: pr.merged, html_url: `https://github.com/${REPOSITORY}/pull/${number}`, created_at: "2026-11-04T00:00:00Z", head: { ref: pr.ref }, body: pr.body });
  const read = async (path: string): Promise<AnswerGitHub> => {
    // Les issues ouvertes au label demandé : le rail (`fire`) comme ce qui attend le chef (wait-of-chef.ts).
    const label = /[?&]labels=([^&]+)/.exec(path)?.[1];
    if (path.includes("/issues?") && label !== undefined) return ok([...issues].filter(([, issue]) => issue.state === "open" && issue.labels.has(label)).map(([number, issue]) => issueJson(number, issue)));
    if (path.includes("/pulls?")) return ok([...prs].filter(([, pr]) => pr.state === "open").map(([number, pr]) => prJson(number, pr)));
    const pr = /\/pulls\/(\d+)$/.exec(path)?.[1];
    if (pr !== undefined) return prs.has(Number(pr)) ? ok(prJson(Number(pr), prs.get(Number(pr)) as PR)) : ok({ message: "Not Found" }, 404);
    const commented = /\/issues\/(\d+)\/comments/.exec(path)?.[1];
    if (commented !== undefined) return ok(issues.get(Number(commented))?.commentaires ?? []);
    if (/\/issues\/\d+\/events/.test(path)) return ok([]);
    return ok({ message: "Not Found" }, 404);
  };
  const write: ClientOfTheAnswer["ecrire"] = async (methode, path, body) => {
    writtenOnes.push({ methode, chemin: path, ...(body === undefined ? {} : { corps: body }) });
    const [, number, remains] = /^\/repos\/[^/]+\/[^/]+\/(?:issues|pulls)\/(\d+)(.*)$/.exec(path) ?? [];
    const issue = issues.get(Number(number));
    if (methode === "POST" && remains === "/comments" && issue !== undefined) {
      const pose = comment((body as { body: string }).body);
      issue.commentaires.push(pose);
      return ok({ id: pose.id, html_url: `https://github.com/${REPOSITORY}/issues/${number}#issuecomment-${pose.id}` }, 201);
    }
    if (methode === "POST" && remains === "/labels" && issue !== undefined) {
      for (const pose of (body as { labels: string[] }).labels) issue.labels.add(pose);
      return ok([]);
    }
    const label = /^\/labels\/(.+)$/.exec(remains ?? "")?.[1];
    if (methode === "DELETE" && label !== undefined && issue !== undefined) return issue.labels.delete(decodeURIComponent(label)) ? ok([]) : ok({ message: "Label does not exist" }, 404);
    if (methode === "PATCH" && remains === "" && issue !== undefined) {
      issue.state = (body as { state: "open" | "closed" }).state;
      return ok({});
    }
    const pr = prs.get(Number(number));
    if (methode === "PUT" && remains === "/merge" && refused.has(Number(number))) return ok({ message: "Pull Request is not mergeable" }, 405);
    if (methode === "PUT" && remains === "/merge" && pr !== undefined) {
      Object.assign(pr, { state: "closed", merged: true });
      // Le mot-clé de la PR ferme son issue, comme GitHub le fait.
      const closedOne = /closes #(\d+)/i.exec(pr.body)?.[1];
      if (closedOne !== undefined) (issues.get(Number(closedOne)) as Issue).state = "closed";
      return ok({ merged: true });
    }
    return ok({ message: "Not Found" }, 404);
  };
  return { issues, prs, ecrits: writtenOnes, refusees: refused, client: { lire: read, ecrire: write } satisfies ClientOfTheAnswer };
}

// Le Todo que la vue dessine de la lecture de ce monde.
async function todo(client: ClientOfTheAnswer): Promise<Card[]> {
  const readOne: ReadOfBoardOfRepository = await withWhatAwaitingTheChef(await readTheBoardOfRepository({ depot: REPOSITORY, appeler: client.lire, maintenant: () => new Date(READ) }), client.lire);
  assert.ok(readOne.lu, "the board is read");
  const facts = understand(JSON.stringify(readOne.faits));
  assert.ok(!("informe" in facts), `facts are in shape: ${"informe" in facts ? facts.informe : ""}`);
  return boardOf(facts as Facts, undefined, { texte: statusOfBoard(readOne), a: readOne.luLe }).rail.colonnes.find(({ nom: name }) => name === "Awaiting you")?.cartes ?? [];
}
const cardOf = (cards: Card[], ticket: number) => cards.find((card) => card.ticket === ticket) ?? assert.fail(`#${ticket} is in Todo`);

// La carte posée par la vue (vue/card-todo.js), sur un faux document ; un clic rend la réponse que la vue envoie.
const doc = { createElement: (balise: string) => new Fake(balise) };
function setOne(ticket: number, card: CardOfTodo): { racine: Fake; reponses: Answer[] } {
  const answers: Answer[] = [];
  const [root] = setCardOfTodo(doc, ticket, card, REPOS, { captures: [], brouillon: "", cle: `brigade#${ticket}` }, { repondre: (answer) => void answers.push(answer), ecrire: () => {}, demander: () => {} }) as Fake[];
  return { racine: root ?? assert.fail("the card is drawn"), reponses: answers };
}
const buttons = (root: Fake) => root.dessous("button").filter((button) => button.className === "choix");

// Un clic sur le choix `libelle` de la carte de `ticket`, lue de ce monde, joué sur GitHub.
async function click(theWorld: ReturnType<typeof world>, ticket: number, wording: string) {
  const card = cardOf(await todo(theWorld.client), ticket);
  const { racine: root, reponses: answers } = setOne(ticket, card.todo ?? assert.fail("the card asks its question"));
  (buttons(root).find((button) => button.textContent === wording) ?? assert.fail(`a button “${wording}”`)).click();
  assert.equal(answers.length, 1);
  return answerOnGithub({ depot: REPOSITORY, ticket, chef: card.chef, reponse: answers[0], client: theWorld.client });
}
const lastComment = (theWorld: ReturnType<typeof world>, ticket: number) => theWorld.issues.get(ticket)?.commentaires.at(-1)?.body;

describe("le commentaire marqué porte ses choix", () => {
  test("la question, puis un choix par ligne `- [<geste>] <libellé>`, et le reste qui la précise", () => {
    assert.deepEqual(shapeOfChef(QUESTION_2061.split("\n").slice(1).join("\n")), {
      question: "Is every project on GitHub-only now, so the old path can go?",
      choix: [
        { texte: "Yes, every project is on GitHub-only: remove the old path", suite: "resume" },
        { texte: "No, keep it waiting", suite: "drop" },
      ],
      contexte: "The old path still runs the Kitchen board of two projects.",
    });
  });

  test("sans choix, il se lit comme avant : la question et son texte ; une case à cocher ou un geste inconnu n'est pas un choix", () => {
    assert.deepEqual(shapeOfChef("Which plan?\n\n- [ ] read the pricing\n- [x] ask legal\n- [ship] ship it"), { question: "Which plan?", choix: [], contexte: "- [ ] read the pricing\n- [x] ask legal\n- [ship] ship it" });
    assert.deepEqual(shapeOfChef(""), { question: null, choix: [], contexte: "" });
    // Sans choix, la carte garde son champ, dont la réponse joue `resume`.
    const card = cardOfChefOfTodo({ sorte: "product-question", texte: "Which plan?" });
    assert.deepEqual(card?.choix, []);
    assert.match(card?.prixDuTexte ?? "", /removes what holds the ticket \(`chef-todo`, `parked`, `served-elsewhere`, and any waiting label of before parked\): it resumes exactly where it was/);
    // Un commentaire marqué sans texte n'a rien à quoi répondre.
    assert.equal(cardOfChefOfTodo({ sorte: "blocked", texte: "  " }), undefined);
  });
});

describe("les cartes de #2061 et #1554 : un bouton par choix et un champ, la question dite une fois", () => {
  test("chaque carte montre ses boutons, dans l'ordre du commentaire, et un champ libre avec « send »", async () => {
    const cards = await todo(world().client);
    assert.deepEqual(cards.map(({ ticket }) => ticket).sort(), [1554, 2061]);
    for (const [ticket, wordings] of [
      [2061, ["Yes, every project is on GitHub-only: remove the old path", "No, keep it waiting"]],
      [1554, ["Yes, merge PR #1560 as delivered", "No, we drop the export"]],
    ] as const) {
      const { racine: root } = setOne(ticket, cardOf(cards, ticket).todo ?? assert.fail(`#${ticket} asks its question`));
      assert.deepEqual(buttons(root).map(({ textContent }) => textContent), wordings);
      assert.equal(root.dessous("textarea")[0]?.placeholder, FIELD);
      assert.ok(root.dessous("button").some(({ textContent }) => textContent === SEND));
    }
  });

  test("la question est dite une fois : la ligne dit ce que la carte attend, la carte pose la question et ce qui la précise", async () => {
    const card = cardOf(await todo(world().client), 2061);
    assert.equal(card.ligne, "A product question waits for your answer.");
    const { racine: root } = setOne(2061, card.todo ?? assert.fail("the card asks its question"));
    const saidOnes = [card.ligne, ...root.dessous("p").map(({ textContent }) => textContent)];
    assert.equal(saidOnes.filter((said) => said?.includes("Is every project on GitHub-only now")).length, 1);
    assert.ok(saidOnes.includes("The old path still runs the Kitchen board of two projects."));
    assert.ok(!saidOnes.some((said) => said?.includes("- [")), "the choice lines are buttons, not text");
  });

  test("la fiche dit la question, plutôt que « what blocks it: not communicated »", async () => {
    const card = cardOf(await todo(world().client), 1554);
    assert.deepEqual(situation({ etat: card.etat as string, attend: card.attend, dit: card.dit, question: card.todo?.question ?? "" }), { libelle: "question", lignes: ["Does the export keep the old column order?"] });
    // Une seule fois sur la fiche aussi : sa tête dit ce que la sorte attend.
    assert.equal(card.fiche.attendu, "A product question waits for your answer.");
  });
});

// La carte d'une issue d'un inconnu, telle que le tri la pose (runtime/src/issue-etrangere/issue-etrangere.ts, `carteDuTriage`).
const CARD_FOREIGN = [
  "<!-- brigade:todo kind=product-question -->",
  "Stranger's issue #40: put it on the rail, or close it?",
  "",
  "- [rail] Put it on the rail with `prio:2`",
  "- [close] Close it",
  "",
  "Asks: Ticket 40 — Please add dark mode.",
  "Opened by @mallory, a stranger.",
  "Recommended: rail, `prio:2` — the manager's triage: ticket, with `prio:2`. A real need.",
].join("\n");

describe("la carte d'une issue d'un inconnu : un clic sur chaque bouton, en un seul pas", () => {
  const withTheCard = () => {
    const theWorld = world();
    theWorld.issues.set(40, { labels: new Set(["chef-todo"]), state: "open", commentaires: [{ id: 900, body: CARD_FOREIGN, author_association: "OWNER", created_at: "2026-11-05T02:00:00Z" }] });
    return theWorld;
  };

  test("la recommandation est le premier bouton, l'autre choix le second, puis le champ libre", async () => {
    const card = cardOf(await todo(withTheCard().client), 40);
    const { racine: root } = setOne(40, card.todo ?? assert.fail("the card asks its question"));
    assert.deepEqual(buttons(root).map(({ textContent }) => textContent), ["Put it on the rail with `prio:2`", "Close it"]);
    assert.equal(root.dessous("textarea")[0]?.placeholder, FIELD);
    assert.ok(root.dessous("p").some(({ textContent }) => textContent?.includes("Opened by @mallory, a stranger.")));
  });

  test("rail : le `prio:` du bouton est posé sur l'issue, la carte levée, rien d'autre n'est demandé", async () => {
    const theWorld = withTheCard();
    const rendered = await click(theWorld, 40, "Put it on the rail with `prio:2`");
    assert.ok("repondue" in rendered, JSON.stringify(rendered));
    assert.equal(lastComment(theWorld, 40), "<!-- brigade:reponse gesture=rail -->\nPut it on the rail with `prio:2`");
    assert.deepEqual([...(theWorld.issues.get(40)?.labels ?? [])], ["prio:2"]);
    assert.equal(theWorld.issues.get(40)?.state, "open");
    assert.ok(!(await todo(theWorld.client)).some(({ ticket }) => ticket === 40));
  });

  // La carte d'une PR de fork (runtime/src/pr-externe/pr-externe.ts) est posée sur la PR elle-même.
  const CARD_OF_FORK = ["<!-- brigade:todo kind=merge-by-hand -->", "merge #77?", "- [merge] Merge #77", "", "Recommended answer: **yes**"].join("\n");
  const withThePROfFork = () => {
    const theWorld = world();
    theWorld.issues.set(77, { pr: true, labels: new Set(["chef-todo"]), state: "open", commentaires: [{ id: 7, body: CARD_OF_FORK, author_association: "OWNER", created_at: "2026-11-05T03:00:00Z" }] });
    theWorld.prs.set(77, { state: "open", merged: false, ref: "patch-1", body: "A fix from a fork" });
    return theWorld;
  };

  test("merge d'une PR de fork : sa carte est dans Todo avec le bouton `Merge #77` ; un clic merge la PR, et la carte part", async () => {
    const theWorld = withThePROfFork();
    assert.deepEqual(cardOf(await todo(theWorld.client), 77).todo?.choix.map(({ texte: text }) => text), ["Merge #77"]);
    const rendered = await click(theWorld, 77, "Merge #77");
    assert.ok("repondue" in rendered, JSON.stringify(rendered));
    assert.equal(theWorld.prs.get(77)?.merged, true);
    assert.ok(!(await todo(theWorld.client)).some(({ ticket }) => ticket === 77));
  });

  test("merge d'une PR de fork refusé par GitHub : la raison est dite, la carte reste", async () => {
    const theWorld = withThePROfFork();
    theWorld.refusees.add(77);
    const rendered = await click(theWorld, 77, "Merge #77");
    assert.ok("refus" in rendered, JSON.stringify(rendered));
    assert.match(rendered.detail ?? "", /Pull Request is not mergeable/);
    assert.equal(theWorld.prs.get(77)?.merged, false);
    assert.ok((await todo(theWorld.client)).some(({ ticket }) => ticket === 77));
  });

  test("close : l'issue est fermée", async () => {
    const theWorld = withTheCard();
    const rendered = await click(theWorld, 40, "Close it");
    assert.ok("repondue" in rendered, JSON.stringify(rendered));
    assert.equal(theWorld.issues.get(40)?.state, "closed");
    assert.deepEqual([...(theWorld.issues.get(40)?.labels ?? [])], []);
  });

  test("GitHub qui refuse le label : la réponse est écrite, le geste se dit non joué", async () => {
    const theWorld = withTheCard();
    const write = theWorld.client.ecrire;
    const client: ClientOfTheAnswer = { lire: theWorld.client.lire, ecrire: async (methode, path, body) => (path.endsWith("/labels") ? { status: 403, data: { message: "no" } } : write(methode, path, body)) };
    const rendered = await click({ ...theWorld, client }, 40, "Put it on the rail with `prio:2`");
    assert.ok("refus" in rendered && /gesture \(rail\) was not played/.test(rendered.refus), JSON.stringify(rendered));
  });
});

describe("un clic joue son geste sur GitHub, après le commentaire de la réponse ; la carte quitte Todo à la lecture suivante", () => {
  test("resume : la réponse dans l'issue, `served-elsewhere` retiré — le ticket revient sur le rail", async () => {
    const theWorld = world();
    const rendered = await click(theWorld, 2061, "Yes, every project is on GitHub-only: remove the old path");
    assert.ok("repondue" in rendered, JSON.stringify(rendered));
    assert.equal(lastComment(theWorld, 2061), "<!-- brigade:reponse gesture=resume -->\nYes, every project is on GitHub-only: remove the old path");
    assert.deepEqual([...(theWorld.issues.get(2061)?.labels ?? [])], ["fire"]);
    assert.equal(theWorld.issues.get(2061)?.state, "open");
    assert.ok(!(await todo(theWorld.client)).some(({ ticket }) => ticket === 2061));
  });

  // Une carte du chef garde `chef-todo` ; « waiting for… » y ajoute `parked` (ticket 4129) et elle quitte Todo. Une réponse à
  // la carte, lue avant, retire les deux : le ticket reprend où il était.
  test("resume sur une carte que `parked` a rejointe depuis sa lecture : `chef-todo` et `parked` retirés — il reprend où il était, la carte quitte Todo", async () => {
    const theWorld = world();
    const parked = theWorld.issues.get(2061) ?? assert.fail("#2061");
    parked.labels.add("chef-todo");
    const card = cardOf(await todo(theWorld.client), 2061);
    const { racine: root, reponses: answers } = setOne(2061, card.todo ?? assert.fail("the card asks its question"));
    (buttons(root).find((button) => button.textContent === "Yes, every project is on GitHub-only: remove the old path") ?? assert.fail("the button")).click();
    parked.labels.add("parked");
    const rendered = await answerOnGithub({ depot: REPOSITORY, ticket: 2061, chef: card.chef, reponse: answers[0], client: theWorld.client });
    assert.ok("repondue" in rendered, JSON.stringify(rendered));
    assert.match(rendered.dit, /`served-elsewhere` and `chef-todo` and `parked` removed/);
    const removed = theWorld.ecrits.filter(({ methode }) => methode === "DELETE").map(({ chemin: path }) => path.split("/labels/")[1]);
    assert.deepEqual(removed, ["served-elsewhere", "chef-todo", "parked", ...LABELS_D_AVANT_PARKED.map(encodeURIComponent)]);
    assert.deepEqual([...(theWorld.issues.get(2061)?.labels ?? [])], ["fire"]);
    assert.ok(!(await todo(theWorld.client)).some(({ ticket }) => ticket === 2061));
  });

  // Un ticket parqué pour le chef par un label d'attente d'avant parked (#4260, `LABELS_D_AVANT_PARKED_POUR_LE_CHEF`), sans
  // question sur l'issue : sa carte demande ce que son label attend, avec `Back to the kitchen` et `Close it`.
  const [OLD] = LABELS_D_AVANT_PARKED_POUR_LE_CHEF;
  const retained = (theWorld: ReturnType<typeof world>) => theWorld.issues.set(3369, { labels: new Set([OLD as string]), state: "open", commentaires: [] });

  test("parqué pour le chef par un label d'avant parked, sans question — Back to the kitchen : le label retiré, il reprend où il était, la carte quitte Todo", async () => {
    const theWorld = world();
    retained(theWorld);
    assert.equal(cardOf(await todo(theWorld.client), 3369).todo?.question, `It carries \`${OLD}\`, a waiting label of before parked: what do you decide?`);
    const rendered = await click(theWorld, 3369, "Back to the kitchen");
    assert.ok("repondue" in rendered, JSON.stringify(rendered));
    assert.equal(lastComment(theWorld, 3369), "<!-- brigade:reponse gesture=resume -->\nBack to the kitchen");
    assert.deepEqual([...(theWorld.issues.get(3369)?.labels ?? [])], []);
    assert.equal(theWorld.issues.get(3369)?.state, "open");
    assert.ok(!(await todo(theWorld.client)).some(({ ticket }) => ticket === 3369));
  });

  test("parqué pour le chef par un label d'avant parked, sans question — Close it : l'issue est fermée, la carte quitte Todo", async () => {
    const theWorld = world();
    retained(theWorld);
    assert.equal(cardOf(await todo(theWorld.client), 3369).todo?.question, `It carries \`${OLD}\`, a waiting label of before parked: what do you decide?`);
    const rendered = await click(theWorld, 3369, "Close it");
    assert.ok("repondue" in rendered, JSON.stringify(rendered));
    assert.equal(theWorld.issues.get(3369)?.state, "closed");
    assert.ok(!(await todo(theWorld.client)).some(({ ticket }) => ticket === 3369));
  });

  // Un ticket que le manager a écarté avec `question` (#3370) : hors du rail, son commentaire pose la question et ses choix.
  const ecarte = (theWorld: ReturnType<typeof world>) => {
    const question = "<!-- brigade:manager -->\n**Manager — a question before this ticket goes on the rail.**\n\nShould the export keep the old column order?\n- [resume] Yes, keep the old order\n- [close] No, drop the export";
    theWorld.issues.set(3370, { labels: new Set(["question"]), state: "open", commentaires: [{ id: 9, body: question, author_association: "OWNER", created_at: "2026-11-05T01:00:00Z" }] });
  };

  test("écart du manager — sa carte pose sa question, un bouton par choix et le champ libre ; un clic poste la réponse, retire `question`, et la carte quitte Todo", async () => {
    const theWorld = world();
    ecarte(theWorld);
    const card = cardOf(await todo(theWorld.client), 3370);
    assert.equal(card.todo?.question, "Should the export keep the old column order?");
    const { racine: root } = setOne(3370, card.todo ?? assert.fail("the card asks its question"));
    assert.deepEqual(buttons(root).map(({ textContent }) => textContent), ["Yes, keep the old order", "No, drop the export"]);
    assert.ok(root.dessous("textarea").length === 1, "the card has its free answer field");
    const rendered = await click(theWorld, 3370, "Yes, keep the old order");
    assert.ok("repondue" in rendered, JSON.stringify(rendered));
    assert.equal(lastComment(theWorld, 3370), "<!-- brigade:reponse gesture=resume -->\nYes, keep the old order");
    assert.deepEqual([...(theWorld.issues.get(3370)?.labels ?? [])], []);
    assert.equal(theWorld.issues.get(3370)?.state, "open");
    assert.ok(!(await todo(theWorld.client)).some(({ ticket }) => ticket === 3370));
  });

  test("écart du manager — le texte libre : la réponse du chef dans l'issue, `question` retiré, la carte quitte Todo", async () => {
    const theWorld = world();
    ecarte(theWorld);
    const card = cardOf(await todo(theWorld.client), 3370);
    const rendered = await answerOnGithub({ depot: REPOSITORY, ticket: 3370, chef: card.chef, reponse: { question: card.todo?.question ?? null, texte: "Keep it, but add a header row." }, client: theWorld.client });
    assert.ok("repondue" in rendered, JSON.stringify(rendered));
    assert.equal(lastComment(theWorld, 3370), commentOfAnswer("resume", "Keep it, but add a header row."));
    assert.ok(!theWorld.issues.get(3370)?.labels.has("question"));
    assert.ok(!(await todo(theWorld.client)).some(({ ticket }) => ticket === 3370));
  });

  test("drop : `fire` retiré — le ticket sort du rail, son issue reste ouverte", async () => {
    const theWorld = world();
    const rendered = await click(theWorld, 2061, "No, keep it waiting");
    assert.ok("repondue" in rendered, JSON.stringify(rendered));
    assert.equal(lastComment(theWorld, 2061), "<!-- brigade:reponse gesture=drop -->\nNo, keep it waiting");
    assert.deepEqual([...(theWorld.issues.get(2061)?.labels ?? [])], ["served-elsewhere"]);
    assert.equal(theWorld.issues.get(2061)?.state, "open");
    assert.ok(!(await todo(theWorld.client)).some(({ ticket }) => ticket === 2061));
  });

  test("merge : la PR que la carte nomme est mergée — après le commentaire", async () => {
    const theWorld = world();
    const rendered = await click(theWorld, 1554, "Yes, merge PR #1560 as delivered");
    assert.ok("repondue" in rendered, JSON.stringify(rendered));
    assert.equal(lastComment(theWorld, 1554), "<!-- brigade:reponse gesture=merge -->\nYes, merge PR #1560 as delivered");
    assert.deepEqual(theWorld.ecrits.map(({ methode, chemin: path }) => `${methode} ${path}`).slice(0, 2), [`POST /repos/${REPOSITORY}/issues/1554/comments`, `PUT /repos/${REPOSITORY}/pulls/1560/merge`]);
    assert.equal(theWorld.prs.get(1560)?.merged, true);
    assert.equal(theWorld.issues.get(1554)?.state, "closed");
    assert.ok(!(await todo(theWorld.client)).some(({ ticket }) => ticket === 1554));
  });

  test("close : l'issue est fermée, le ticket n'est pas cuisiné", async () => {
    const theWorld = world();
    const rendered = await click(theWorld, 1554, "No, we drop the export");
    assert.ok("repondue" in rendered, JSON.stringify(rendered));
    assert.equal(lastComment(theWorld, 1554), "<!-- brigade:reponse gesture=close -->\nNo, we drop the export");
    assert.equal(theWorld.issues.get(1554)?.state, "closed");
    assert.equal(theWorld.prs.get(1560)?.merged, false);
    assert.ok(!(await todo(theWorld.client)).some(({ ticket }) => ticket === 1554));
  });

  test("le texte libre joue `resume`, avec le texte du chef dans l'issue", async () => {
    const theWorld = world();
    const card = cardOf(await todo(theWorld.client), 2061);
    const answer = { question: card.todo?.question ?? null, texte: "Not yet: the phone app still reads the old board." };
    const rendered = await answerOnGithub({ depot: REPOSITORY, ticket: 2061, chef: card.chef, reponse: answer, client: theWorld.client });
    assert.ok("repondue" in rendered, JSON.stringify(rendered));
    assert.equal(lastComment(theWorld, 2061), commentOfAnswer("resume", "Not yet: the phone app still reads the old board."));
    assert.deepEqual([...(theWorld.issues.get(2061)?.labels ?? [])], ["fire"]);
  });

  test("rien ne part pour une question changée, une réponse vide, ni un merge sans PR ouverte", async () => {
    const theWorld = world();
    const card = cardOf(await todo(theWorld.client), 1554);
    const before = theWorld.ecrits.length;
    assert.ok("refus" in (await answerOnGithub({ depot: REPOSITORY, ticket: 1554, chef: card.chef, reponse: { question: "Another question?", choix: 1 }, client: theWorld.client })));
    assert.ok("refus" in (await answerOnGithub({ depot: REPOSITORY, ticket: 1554, chef: card.chef, reponse: { question: card.todo?.question ?? null, texte: "  " }, client: theWorld.client })));
    (theWorld.prs.get(1560) as PR).state = "closed";
    const withoutPR = await answerOnGithub({ depot: REPOSITORY, ticket: 1554, chef: card.chef, reponse: { question: card.todo?.question ?? null, choix: 1 }, client: theWorld.client });
    assert.deepEqual(withoutPR, { refus: "nothing was sent: no open PR names #1554 — the card has nothing to merge", detail: "" });
    assert.equal(theWorld.ecrits.length, before, "nothing is written");
  });
});

// Le refus `decision` du manager tel que runtime/src/manager.ts l'écrit depuis #3434 : sa question, une ligne par réponse, puis
// celle qu'il recommande et pourquoi — `Wait for <qui>` d'abord quand la question attend un tiers.
const refusalOfManager = (...card: string[]) =>
  [
    "<!-- brigade:manager -->",
    "**Manager — not a workable ticket: a decision issue.** Nothing is set, no cook will start.",
    "",
    "The issue asks how the respondent is recontacted after the beta.",
    "",
    "**Yours to settle.** The manager sets `decision` on this issue: it is a card in your TODO. Answer it there — one of its answers or your own words — and the manager judges the issue again with your answer; or close the issue.",
    "",
    ...card,
    "",
    "_Judged by the manager in `sonnet` / `medium` · 1 turn · 3,390 tokens · 7.6 s._",
  ].join("\n");
const DECISION = refusalOfManager(
  "Which recontact does the beta keep?",
  "- [resume] Option A suffices",
  "- [resume] Option B: generate them",
  "- [close] Close it: out of scope",
  "",
  "**Recommended:** Option B: generate them — the client asked for them twice.",
);
const WITHOUT_OPINION = refusalOfManager("Which recontact does the beta keep?", "- [resume] Option A suffices", "- [resume] Option B: generate them");
const THIRD = refusalOfManager(
  "Does AF want direct automatic recontact of the Respondent after the beta?",
  "- [wait] Wait for AF, the client",
  "- [resume] Yes: recontact automatically",
  "",
  "**Recommended:** Wait for AF, the client — the answer is theirs to give, not yours",
);

describe("la carte d'une décision du manager : ses réponses en boutons, celle qu'il recommande, WAITING pour un tiers (#3434)", () => {
  const withIt = (body: string) => {
    const theWorld = world();
    theWorld.issues.set(35, { labels: new Set(["decision"]), state: "open", commentaires: [{ id: 90, body: body, author_association: "OWNER", created_at: "2026-11-05T02:00:00Z" }] });
    return theWorld;
  };
  const vue = async (theWorld: ReturnType<typeof world>) => {
    const { racine: root } = setOne(35, cardOf(await todo(theWorld.client), 35).todo ?? assert.fail("the card asks its question"));
    return { libelles: buttons(root).map(({ textContent }) => textContent), recommandes: buttons(root).filter(({ dataset }) => dataset.bouton === "recommande").map(({ textContent }) => textContent), dits: root.dessous("p").map(({ textContent }) => textContent ?? "") };
  };

  test("un bouton par réponse, dans ses mots ; la recommandée pleine d'accent, sa raison en une ligne — jamais « Back to the kitchen »", async () => {
    const { libelles: wordings, recommandes, dits: saidOnes } = await vue(withIt(DECISION));
    assert.deepEqual(wordings, ["Option A suffices", "Option B: generate them", "Close it: out of scope"]);
    assert.deepEqual(recommandes, ["Option B: generate them"]);
    assert.ok(saidOnes.includes("Recommended: Option B: generate them — the client asked for them twice."), JSON.stringify(saidOnes));
    assert.ok(!saidOnes.some((said) => /Back to the kitchen/.test(said)));
  });

  test("un clic sur une réponse la poste sur l'issue et rend l'issue au manager : `decision` retiré, aucun autre pas", async () => {
    const theWorld = withIt(DECISION);
    const rendered = await click(theWorld, 35, "Option A suffices");
    assert.ok("repondue" in rendered, JSON.stringify(rendered));
    assert.equal(lastComment(theWorld, 35), "<!-- brigade:reponse gesture=resume -->\nOption A suffices");
    assert.deepEqual([...(theWorld.issues.get(35)?.labels ?? [])], []);
    assert.equal(theWorld.issues.get(35)?.state, "open");
  });

  test("sans fondement pour en recommander une : aucune recommandation, aucun bouton mis en avant", async () => {
    const { libelles: wordings, recommandes, dits: saidOnes } = await vue(withIt(WITHOUT_OPINION));
    assert.deepEqual(wordings, ["Option A suffices", "Option B: generate them"]);
    assert.deepEqual(recommandes, []);
    assert.ok(!saidOnes.some((said) => said.startsWith("Recommended")), JSON.stringify(saidOnes));
  });

  test("un écart d'avant #3434, sans réponses : ses deux gestes, et aucun « Recommended: Back to the kitchen »", async () => {
    const { libelles: wordings, recommandes, dits: saidOnes } = await vue(withIt(refusalOfManager("Which recontact does the beta keep?")));
    assert.deepEqual(wordings, ["Back to the kitchen", "Close it"]);
    assert.deepEqual(recommandes, []);
    assert.ok(!saidOnes.some((said) => said.startsWith("Recommended")));
  });

  test("une question qui attend le client : « Wait for … » recommandé ; un clic met l'issue en WAITING, en disant qui elle attend", async () => {
    const theWorld = withIt(THIRD);
    const { libelles: wordings, recommandes } = await vue(theWorld);
    assert.deepEqual(wordings, ["Wait for AF, the client", "Yes: recontact automatically"]);
    assert.deepEqual(recommandes, ["Wait for AF, the client"]);

    const card = cardOf(await todo(theWorld.client), 35);
    const rendered = await answerOnGithub({ depot: REPOSITORY, ticket: 35, chef: card.chef, reponse: { question: card.todo?.question ?? null, choix: 1 }, client: theWorld.client, maintenant: new Date(2026, 10, 13, 12) });
    assert.ok("repondue" in rendered, JSON.stringify(rendered));
    assert.match(rendered.dit, /in WAITING on GitHub: #35 awaits AF, the client, follow-up on 2026-11-20/);
    const issue = theWorld.issues.get(35);
    assert.deepEqual([...(issue?.labels ?? [])], ["parked"]);
    const [answer, wait] = issue?.commentaires.slice(-2) ?? [];
    assert.equal(answer?.body, "<!-- brigade:reponse gesture=wait -->\nWait for AF, the client");
    // Le commentaire de parking (#4129), dans la forme que la carte de WAITING relit (vue/wait/wait-github.ts).
    assert.deepEqual(thirdOfComments(wait === undefined ? [] : [wait])?.qui, "AF, the client");
    assert.match(wait?.body ?? "", /^<!-- brigade:parked \{.*\} -->\n\*\*PARKED: waits for AF, the client\.\*\* Does AF want direct automatic recontact of the Respondent after the beta\?/);
  });

  test("le label `parked` refusé : la réponse est postée, et le refus dit que le ticket n'est pas parqué", async () => {
    const theWorld = withIt(THIRD);
    const card = cardOf(await todo(theWorld.client), 35);
    const write = theWorld.client.ecrire;
    // Seule la pose de `parked` est refusée : « Wait for … » parque le ticket (#4129), il ne pose aucun autre label.
    const parked = (body: unknown) => JSON.stringify(body) === JSON.stringify({ labels: ["parked"] });
    const client: ClientOfTheAnswer = { lire: theWorld.client.lire, ecrire: async (methode, path, body) => (path.endsWith("/labels") && methode === "POST" && parked(body) ? { status: 500, data: { message: "boom" } } : write(methode, path, body)) };
    const rendered = await answerOnGithub({ depot: REPOSITORY, ticket: 35, chef: card.chef, reponse: { question: card.todo?.question ?? null, choix: 1 }, client, maintenant: new Date(2026, 10, 13, 12) });
    assert.ok("refus" in rendered, JSON.stringify(rendered));
    assert.match(rendered.refus, /its gesture \(wait\) was not played/);
    assert.match(rendered.detail, /#35 is not parked: its comment is posted, but GitHub did not set `parked`/);
    assert.ok(theWorld.issues.get(35)?.labels.has("decision"), "the card stays: nothing else was removed");
  });
});
