// La réponse du chef à une carte du chef lue de GitHub (#2434) : le commentaire marqué porte ses
// choix (`- [<geste>] <libellé>`), la carte de Todo les montre en boutons avec un champ libre, et un clic poste la réponse
// sur l'issue puis joue son geste sur GitHub — `resume`, `merge`, `drop`, `close`. Joué sur un faux GitHub qui tient ses
// issues, leurs labels, leurs commentaires et ses PR : la carte lue, posée par la vue, cliquée, et l'issue relue après.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { cardDuChefDeTodo, type CardDeTodo, type Answer } from "../../src/card-todo.ts";
import { comprendre, tableau as tableauDe, type Card, type Facts } from "../../src/facts.ts";
import { situation } from "../../src/histoire.ts";
import { avecCeQuiAwaitingLeChef } from "../../src/tableau/wait-du-chef.ts";
import { LABELS_D_AVANT_PARKED, LABELS_D_AVANT_PARKED_POUR_LE_CHEF } from "../../../runtime/src/github-etat/etats.ts";
import type { AnswerGitHub } from "../../src/tableau/client.ts";
import { lireLeTableauDuRepository, type ReadDuTableauDuRepository } from "../../src/tableau/read.ts";
import { statusDuTableau } from "../../src/tableau/rail.ts";
import { formeDuChef } from "../../src/tableau/todo-github.ts";
import { tiersDesCommentaires } from "../../src/vue/wait/wait-github.ts";
import { commentDeAnswer, repondreSurGithub, type ClientDeLaAnswer } from "../../src/tableau-actions/answer-github.ts";
import { CHAMP, ENVOYER, poserCardDeTodo, REPOS } from "../../src/vue/card-todo.js";
import { Faux } from "../aides/fausse-vue.ts";

const REPOSITORY = "acme/brigade";
const LU = "2026-11-05T09:00:00.000Z";

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
function monde() {
  let suivant = 100;
  const comment = (body: string) => ({ id: suivant++, body, author_association: "OWNER", created_at: "2026-11-05T02:00:00Z" });
  const issues = new Map<number, Issue>([
    [2061, { labels: new Set(["fire", "served-elsewhere"]), state: "open", commentaires: [comment(QUESTION_2061)] }],
    [1554, { labels: new Set(["fire", "served-elsewhere"]), state: "open", commentaires: [comment(QUESTION_1554)] }],
  ]);
  const prs = new Map<number, PR>([[1560, { state: "open", merged: false, ref: "cook/1554-export", body: "Closes #1554" }]]);
  const ecrits: { methode: string; chemin: string; corps?: unknown }[] = [];
  const ok = (data: unknown, status = 200): AnswerGitHub => ({ status, data });
  const issueJson = (numero: number, issue: Issue) => ({ number: numero, title: `Ticket ${numero}`, html_url: `https://github.com/${REPOSITORY}/issues/${numero}`, created_at: "2026-11-01T00:00:00Z", labels: [...issue.labels].map((name) => ({ name })), ...(issue.pr === true ? { pull_request: {} } : {}) });
  const refusees = new Set<number>();
  const prJson = (numero: number, pr: PR) => ({ number: numero, state: pr.state, merged: pr.merged, html_url: `https://github.com/${REPOSITORY}/pull/${numero}`, created_at: "2026-11-04T00:00:00Z", head: { ref: pr.ref }, body: pr.body });
  const lire = async (chemin: string): Promise<AnswerGitHub> => {
    // Les issues ouvertes au label demandé : le rail (`fire`) comme ce qui attend le chef (wait-du-chef.ts).
    const label = /[?&]labels=([^&]+)/.exec(chemin)?.[1];
    if (chemin.includes("/issues?") && label !== undefined) return ok([...issues].filter(([, issue]) => issue.state === "open" && issue.labels.has(label)).map(([numero, issue]) => issueJson(numero, issue)));
    if (chemin.includes("/pulls?")) return ok([...prs].filter(([, pr]) => pr.state === "open").map(([numero, pr]) => prJson(numero, pr)));
    const pr = /\/pulls\/(\d+)$/.exec(chemin)?.[1];
    if (pr !== undefined) return prs.has(Number(pr)) ? ok(prJson(Number(pr), prs.get(Number(pr)) as PR)) : ok({ message: "Not Found" }, 404);
    const commentees = /\/issues\/(\d+)\/comments/.exec(chemin)?.[1];
    if (commentees !== undefined) return ok(issues.get(Number(commentees))?.commentaires ?? []);
    if (/\/issues\/\d+\/events/.test(chemin)) return ok([]);
    return ok({ message: "Not Found" }, 404);
  };
  const ecrire: ClientDeLaAnswer["ecrire"] = async (methode, chemin, corps) => {
    ecrits.push({ methode, chemin, ...(corps === undefined ? {} : { corps }) });
    const [, numero, reste] = /^\/repos\/[^/]+\/[^/]+\/(?:issues|pulls)\/(\d+)(.*)$/.exec(chemin) ?? [];
    const issue = issues.get(Number(numero));
    if (methode === "POST" && reste === "/comments" && issue !== undefined) {
      const pose = comment((corps as { body: string }).body);
      issue.commentaires.push(pose);
      return ok({ id: pose.id, html_url: `https://github.com/${REPOSITORY}/issues/${numero}#issuecomment-${pose.id}` }, 201);
    }
    if (methode === "POST" && reste === "/labels" && issue !== undefined) {
      for (const pose of (corps as { labels: string[] }).labels) issue.labels.add(pose);
      return ok([]);
    }
    const label = /^\/labels\/(.+)$/.exec(reste ?? "")?.[1];
    if (methode === "DELETE" && label !== undefined && issue !== undefined) return issue.labels.delete(decodeURIComponent(label)) ? ok([]) : ok({ message: "Label does not exist" }, 404);
    if (methode === "PATCH" && reste === "" && issue !== undefined) {
      issue.state = (corps as { state: "open" | "closed" }).state;
      return ok({});
    }
    const pr = prs.get(Number(numero));
    if (methode === "PUT" && reste === "/merge" && refusees.has(Number(numero))) return ok({ message: "Pull Request is not mergeable" }, 405);
    if (methode === "PUT" && reste === "/merge" && pr !== undefined) {
      Object.assign(pr, { state: "closed", merged: true });
      // Le mot-clé de la PR ferme son issue, comme GitHub le fait.
      const fermee = /closes #(\d+)/i.exec(pr.body)?.[1];
      if (fermee !== undefined) (issues.get(Number(fermee)) as Issue).state = "closed";
      return ok({ merged: true });
    }
    return ok({ message: "Not Found" }, 404);
  };
  return { issues, prs, ecrits, refusees, client: { lire, ecrire } satisfies ClientDeLaAnswer };
}

// Le Todo que la vue dessine de la lecture de ce monde.
async function todo(client: ClientDeLaAnswer): Promise<Card[]> {
  const lu: ReadDuTableauDuRepository = await avecCeQuiAwaitingLeChef(await lireLeTableauDuRepository({ depot: REPOSITORY, appeler: client.lire, maintenant: () => new Date(LU) }), client.lire);
  assert.ok(lu.lu, "the board is read");
  const facts = comprendre(JSON.stringify(lu.faits));
  assert.ok(!("informe" in facts), `facts are in shape: ${"informe" in facts ? facts.informe : ""}`);
  return tableauDe(facts as Facts, undefined, { texte: statusDuTableau(lu), a: lu.luLe }).rail.colonnes.find(({ nom: name }) => name === "Awaiting you")?.cartes ?? [];
}
const cardDe = (cards: Card[], ticket: number) => cards.find((card) => card.ticket === ticket) ?? assert.fail(`#${ticket} is in Todo`);

// La carte posée par la vue (vue/card-todo.js), sur un faux document ; un clic rend la réponse que la vue envoie.
const doc = { createElement: (balise: string) => new Faux(balise) };
function posee(ticket: number, card: CardDeTodo): { racine: Faux; reponses: Answer[] } {
  const answers: Answer[] = [];
  const [racine] = poserCardDeTodo(doc, ticket, card, REPOS, { captures: [], brouillon: "", cle: `brigade#${ticket}` }, { repondre: (answer) => void answers.push(answer), ecrire: () => {}, demander: () => {} }) as Faux[];
  return { racine: racine ?? assert.fail("the card is drawn"), reponses: answers };
}
const boutons = (racine: Faux) => racine.dessous("button").filter((button) => button.className === "choix");

// Un clic sur le choix `libelle` de la carte de `ticket`, lue de ce monde, joué sur GitHub.
async function cliquer(leMonde: ReturnType<typeof monde>, ticket: number, libelle: string) {
  const card = cardDe(await todo(leMonde.client), ticket);
  const { racine, reponses: answers } = posee(ticket, card.todo ?? assert.fail("the card asks its question"));
  (boutons(racine).find((button) => button.textContent === libelle) ?? assert.fail(`a button “${libelle}”`)).click();
  assert.equal(answers.length, 1);
  return repondreSurGithub({ depot: REPOSITORY, ticket, chef: card.chef, reponse: answers[0], client: leMonde.client });
}
const dernierComment = (leMonde: ReturnType<typeof monde>, ticket: number) => leMonde.issues.get(ticket)?.commentaires.at(-1)?.body;

describe("le commentaire marqué porte ses choix", () => {
  test("la question, puis un choix par ligne `- [<geste>] <libellé>`, et le reste qui la précise", () => {
    assert.deepEqual(formeDuChef(QUESTION_2061.split("\n").slice(1).join("\n")), {
      question: "Is every project on GitHub-only now, so the old path can go?",
      choix: [
        { texte: "Yes, every project is on GitHub-only: remove the old path", suite: "resume" },
        { texte: "No, keep it waiting", suite: "drop" },
      ],
      contexte: "The old path still runs the Kitchen board of two projects.",
    });
  });

  test("sans choix, il se lit comme avant : la question et son texte ; une case à cocher ou un geste inconnu n'est pas un choix", () => {
    assert.deepEqual(formeDuChef("Which plan?\n\n- [ ] read the pricing\n- [x] ask legal\n- [ship] ship it"), { question: "Which plan?", choix: [], contexte: "- [ ] read the pricing\n- [x] ask legal\n- [ship] ship it" });
    assert.deepEqual(formeDuChef(""), { question: null, choix: [], contexte: "" });
    // Sans choix, la carte garde son champ, dont la réponse joue `resume`.
    const card = cardDuChefDeTodo({ sorte: "product-question", texte: "Which plan?" });
    assert.deepEqual(card?.choix, []);
    assert.match(card?.prixDuTexte ?? "", /removes what holds the ticket \(`chef-todo`, `parked`, `served-elsewhere`, and any waiting label of before parked\): it resumes exactly where it was/);
    // Un commentaire marqué sans texte n'a rien à quoi répondre.
    assert.equal(cardDuChefDeTodo({ sorte: "blocked", texte: "  " }), undefined);
  });
});

describe("les cartes de #2061 et #1554 : un bouton par choix et un champ, la question dite une fois", () => {
  test("chaque carte montre ses boutons, dans l'ordre du commentaire, et un champ libre avec « send »", async () => {
    const cards = await todo(monde().client);
    assert.deepEqual(cards.map(({ ticket }) => ticket).sort(), [1554, 2061]);
    for (const [ticket, libelles] of [
      [2061, ["Yes, every project is on GitHub-only: remove the old path", "No, keep it waiting"]],
      [1554, ["Yes, merge PR #1560 as delivered", "No, we drop the export"]],
    ] as const) {
      const { racine } = posee(ticket, cardDe(cards, ticket).todo ?? assert.fail(`#${ticket} asks its question`));
      assert.deepEqual(boutons(racine).map(({ textContent }) => textContent), libelles);
      assert.equal(racine.dessous("textarea")[0]?.placeholder, CHAMP);
      assert.ok(racine.dessous("button").some(({ textContent }) => textContent === ENVOYER));
    }
  });

  test("la question est dite une fois : la ligne dit ce que la carte attend, la carte pose la question et ce qui la précise", async () => {
    const card = cardDe(await todo(monde().client), 2061);
    assert.equal(card.ligne, "A product question waits for your answer.");
    const { racine } = posee(2061, card.todo ?? assert.fail("the card asks its question"));
    const dits = [card.ligne, ...racine.dessous("p").map(({ textContent }) => textContent)];
    assert.equal(dits.filter((dit) => dit?.includes("Is every project on GitHub-only now")).length, 1);
    assert.ok(dits.includes("The old path still runs the Kitchen board of two projects."));
    assert.ok(!dits.some((dit) => dit?.includes("- [")), "the choice lines are buttons, not text");
  });

  test("la fiche dit la question, plutôt que « what blocks it: not communicated »", async () => {
    const card = cardDe(await todo(monde().client), 1554);
    assert.deepEqual(situation({ etat: card.etat as string, attend: card.attend, dit: card.dit, question: card.todo?.question ?? "" }), { libelle: "question", lignes: ["Does the export keep the old column order?"] });
    // Une seule fois sur la fiche aussi : sa tête dit ce que la sorte attend.
    assert.equal(card.fiche.attendu, "A product question waits for your answer.");
  });
});

// La carte d'une issue d'un inconnu, telle que le tri la pose (runtime/src/issue-etrangere/issue-etrangere.ts, `carteDuTriage`).
const CARD_ETRANGERE = [
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
  const avecLaCard = () => {
    const leMonde = monde();
    leMonde.issues.set(40, { labels: new Set(["chef-todo"]), state: "open", commentaires: [{ id: 900, body: CARD_ETRANGERE, author_association: "OWNER", created_at: "2026-11-05T02:00:00Z" }] });
    return leMonde;
  };

  test("la recommandation est le premier bouton, l'autre choix le second, puis le champ libre", async () => {
    const card = cardDe(await todo(avecLaCard().client), 40);
    const { racine } = posee(40, card.todo ?? assert.fail("the card asks its question"));
    assert.deepEqual(boutons(racine).map(({ textContent }) => textContent), ["Put it on the rail with `prio:2`", "Close it"]);
    assert.equal(racine.dessous("textarea")[0]?.placeholder, CHAMP);
    assert.ok(racine.dessous("p").some(({ textContent }) => textContent?.includes("Opened by @mallory, a stranger.")));
  });

  test("rail : le `prio:` du bouton est posé sur l'issue, la carte levée, rien d'autre n'est demandé", async () => {
    const leMonde = avecLaCard();
    const rendu = await cliquer(leMonde, 40, "Put it on the rail with `prio:2`");
    assert.ok("repondue" in rendu, JSON.stringify(rendu));
    assert.equal(dernierComment(leMonde, 40), "<!-- brigade:reponse gesture=rail -->\nPut it on the rail with `prio:2`");
    assert.deepEqual([...(leMonde.issues.get(40)?.labels ?? [])], ["prio:2"]);
    assert.equal(leMonde.issues.get(40)?.state, "open");
    assert.ok(!(await todo(leMonde.client)).some(({ ticket }) => ticket === 40));
  });

  // La carte d'une PR de fork (runtime/src/pr-externe/pr-externe.ts) est posée sur la PR elle-même.
  const CARD_DE_FORK = ["<!-- brigade:todo kind=merge-by-hand -->", "merge #77?", "- [merge] Merge #77", "", "Recommended answer: **yes**"].join("\n");
  const avecLaPRDeFork = () => {
    const leMonde = monde();
    leMonde.issues.set(77, { pr: true, labels: new Set(["chef-todo"]), state: "open", commentaires: [{ id: 7, body: CARD_DE_FORK, author_association: "OWNER", created_at: "2026-11-05T03:00:00Z" }] });
    leMonde.prs.set(77, { state: "open", merged: false, ref: "patch-1", body: "A fix from a fork" });
    return leMonde;
  };

  test("merge d'une PR de fork : sa carte est dans Todo avec le bouton `Merge #77` ; un clic merge la PR, et la carte part", async () => {
    const leMonde = avecLaPRDeFork();
    assert.deepEqual(cardDe(await todo(leMonde.client), 77).todo?.choix.map(({ texte }) => texte), ["Merge #77"]);
    const rendu = await cliquer(leMonde, 77, "Merge #77");
    assert.ok("repondue" in rendu, JSON.stringify(rendu));
    assert.equal(leMonde.prs.get(77)?.merged, true);
    assert.ok(!(await todo(leMonde.client)).some(({ ticket }) => ticket === 77));
  });

  test("merge d'une PR de fork refusé par GitHub : la raison est dite, la carte reste", async () => {
    const leMonde = avecLaPRDeFork();
    leMonde.refusees.add(77);
    const rendu = await cliquer(leMonde, 77, "Merge #77");
    assert.ok("refus" in rendu, JSON.stringify(rendu));
    assert.match(rendu.detail ?? "", /Pull Request is not mergeable/);
    assert.equal(leMonde.prs.get(77)?.merged, false);
    assert.ok((await todo(leMonde.client)).some(({ ticket }) => ticket === 77));
  });

  test("close : l'issue est fermée", async () => {
    const leMonde = avecLaCard();
    const rendu = await cliquer(leMonde, 40, "Close it");
    assert.ok("repondue" in rendu, JSON.stringify(rendu));
    assert.equal(leMonde.issues.get(40)?.state, "closed");
    assert.deepEqual([...(leMonde.issues.get(40)?.labels ?? [])], []);
  });

  test("GitHub qui refuse le label : la réponse est écrite, le geste se dit non joué", async () => {
    const leMonde = avecLaCard();
    const ecrire = leMonde.client.ecrire;
    const client: ClientDeLaAnswer = { lire: leMonde.client.lire, ecrire: async (methode, chemin, corps) => (chemin.endsWith("/labels") ? { status: 403, data: { message: "no" } } : ecrire(methode, chemin, corps)) };
    const rendu = await cliquer({ ...leMonde, client }, 40, "Put it on the rail with `prio:2`");
    assert.ok("refus" in rendu && /gesture \(rail\) was not played/.test(rendu.refus), JSON.stringify(rendu));
  });
});

describe("un clic joue son geste sur GitHub, après le commentaire de la réponse ; la carte quitte Todo à la lecture suivante", () => {
  test("resume : la réponse dans l'issue, `served-elsewhere` retiré — le ticket revient sur le rail", async () => {
    const leMonde = monde();
    const rendu = await cliquer(leMonde, 2061, "Yes, every project is on GitHub-only: remove the old path");
    assert.ok("repondue" in rendu, JSON.stringify(rendu));
    assert.equal(dernierComment(leMonde, 2061), "<!-- brigade:reponse gesture=resume -->\nYes, every project is on GitHub-only: remove the old path");
    assert.deepEqual([...(leMonde.issues.get(2061)?.labels ?? [])], ["fire"]);
    assert.equal(leMonde.issues.get(2061)?.state, "open");
    assert.ok(!(await todo(leMonde.client)).some(({ ticket }) => ticket === 2061));
  });

  // Une carte du chef garde `chef-todo` ; « waiting for… » y ajoute `parked` (ticket 4129) et elle quitte Todo. Une réponse à
  // la carte, lue avant, retire les deux : le ticket reprend où il était.
  test("resume sur une carte que `parked` a rejointe depuis sa lecture : `chef-todo` et `parked` retirés — il reprend où il était, la carte quitte Todo", async () => {
    const leMonde = monde();
    const parque = leMonde.issues.get(2061) ?? assert.fail("#2061");
    parque.labels.add("chef-todo");
    const card = cardDe(await todo(leMonde.client), 2061);
    const { racine, reponses: answers } = posee(2061, card.todo ?? assert.fail("the card asks its question"));
    (boutons(racine).find((button) => button.textContent === "Yes, every project is on GitHub-only: remove the old path") ?? assert.fail("the button")).click();
    parque.labels.add("parked");
    const rendu = await repondreSurGithub({ depot: REPOSITORY, ticket: 2061, chef: card.chef, reponse: answers[0], client: leMonde.client });
    assert.ok("repondue" in rendu, JSON.stringify(rendu));
    assert.match(rendu.dit, /`served-elsewhere` and `chef-todo` and `parked` removed/);
    const retires = leMonde.ecrits.filter(({ methode }) => methode === "DELETE").map(({ chemin }) => chemin.split("/labels/")[1]);
    assert.deepEqual(retires, ["served-elsewhere", "chef-todo", "parked", ...LABELS_D_AVANT_PARKED.map(encodeURIComponent)]);
    assert.deepEqual([...(leMonde.issues.get(2061)?.labels ?? [])], ["fire"]);
    assert.ok(!(await todo(leMonde.client)).some(({ ticket }) => ticket === 2061));
  });

  // Un ticket parqué pour le chef par un label d'attente d'avant parked (#4260, `LABELS_D_AVANT_PARKED_POUR_LE_CHEF`), sans
  // question sur l'issue : sa carte demande ce que son label attend, avec `Back to the kitchen` et `Close it`.
  const [ANCIEN] = LABELS_D_AVANT_PARKED_POUR_LE_CHEF;
  const retenu = (leMonde: ReturnType<typeof monde>) => leMonde.issues.set(3369, { labels: new Set([ANCIEN as string]), state: "open", commentaires: [] });

  test("parqué pour le chef par un label d'avant parked, sans question — Back to the kitchen : le label retiré, il reprend où il était, la carte quitte Todo", async () => {
    const leMonde = monde();
    retenu(leMonde);
    assert.equal(cardDe(await todo(leMonde.client), 3369).todo?.question, `It carries \`${ANCIEN}\`, a waiting label of before parked: what do you decide?`);
    const rendu = await cliquer(leMonde, 3369, "Back to the kitchen");
    assert.ok("repondue" in rendu, JSON.stringify(rendu));
    assert.equal(dernierComment(leMonde, 3369), "<!-- brigade:reponse gesture=resume -->\nBack to the kitchen");
    assert.deepEqual([...(leMonde.issues.get(3369)?.labels ?? [])], []);
    assert.equal(leMonde.issues.get(3369)?.state, "open");
    assert.ok(!(await todo(leMonde.client)).some(({ ticket }) => ticket === 3369));
  });

  test("parqué pour le chef par un label d'avant parked, sans question — Close it : l'issue est fermée, la carte quitte Todo", async () => {
    const leMonde = monde();
    retenu(leMonde);
    assert.equal(cardDe(await todo(leMonde.client), 3369).todo?.question, `It carries \`${ANCIEN}\`, a waiting label of before parked: what do you decide?`);
    const rendu = await cliquer(leMonde, 3369, "Close it");
    assert.ok("repondue" in rendu, JSON.stringify(rendu));
    assert.equal(leMonde.issues.get(3369)?.state, "closed");
    assert.ok(!(await todo(leMonde.client)).some(({ ticket }) => ticket === 3369));
  });

  // Un ticket que le manager a écarté avec `question` (#3370) : hors du rail, son commentaire pose la question et ses choix.
  const ecarte = (leMonde: ReturnType<typeof monde>) => {
    const question = "<!-- brigade:manager -->\n**Manager — a question before this ticket goes on the rail.**\n\nShould the export keep the old column order?\n- [resume] Yes, keep the old order\n- [close] No, drop the export";
    leMonde.issues.set(3370, { labels: new Set(["question"]), state: "open", commentaires: [{ id: 9, body: question, author_association: "OWNER", created_at: "2026-11-05T01:00:00Z" }] });
  };

  test("écart du manager — sa carte pose sa question, un bouton par choix et le champ libre ; un clic poste la réponse, retire `question`, et la carte quitte Todo", async () => {
    const leMonde = monde();
    ecarte(leMonde);
    const card = cardDe(await todo(leMonde.client), 3370);
    assert.equal(card.todo?.question, "Should the export keep the old column order?");
    const { racine } = posee(3370, card.todo ?? assert.fail("the card asks its question"));
    assert.deepEqual(boutons(racine).map(({ textContent }) => textContent), ["Yes, keep the old order", "No, drop the export"]);
    assert.ok(racine.dessous("textarea").length === 1, "the card has its free answer field");
    const rendu = await cliquer(leMonde, 3370, "Yes, keep the old order");
    assert.ok("repondue" in rendu, JSON.stringify(rendu));
    assert.equal(dernierComment(leMonde, 3370), "<!-- brigade:reponse gesture=resume -->\nYes, keep the old order");
    assert.deepEqual([...(leMonde.issues.get(3370)?.labels ?? [])], []);
    assert.equal(leMonde.issues.get(3370)?.state, "open");
    assert.ok(!(await todo(leMonde.client)).some(({ ticket }) => ticket === 3370));
  });

  test("écart du manager — le texte libre : la réponse du chef dans l'issue, `question` retiré, la carte quitte Todo", async () => {
    const leMonde = monde();
    ecarte(leMonde);
    const card = cardDe(await todo(leMonde.client), 3370);
    const rendu = await repondreSurGithub({ depot: REPOSITORY, ticket: 3370, chef: card.chef, reponse: { question: card.todo?.question ?? null, texte: "Keep it, but add a header row." }, client: leMonde.client });
    assert.ok("repondue" in rendu, JSON.stringify(rendu));
    assert.equal(dernierComment(leMonde, 3370), commentDeAnswer("resume", "Keep it, but add a header row."));
    assert.ok(!leMonde.issues.get(3370)?.labels.has("question"));
    assert.ok(!(await todo(leMonde.client)).some(({ ticket }) => ticket === 3370));
  });

  test("drop : `fire` retiré — le ticket sort du rail, son issue reste ouverte", async () => {
    const leMonde = monde();
    const rendu = await cliquer(leMonde, 2061, "No, keep it waiting");
    assert.ok("repondue" in rendu, JSON.stringify(rendu));
    assert.equal(dernierComment(leMonde, 2061), "<!-- brigade:reponse gesture=drop -->\nNo, keep it waiting");
    assert.deepEqual([...(leMonde.issues.get(2061)?.labels ?? [])], ["served-elsewhere"]);
    assert.equal(leMonde.issues.get(2061)?.state, "open");
    assert.ok(!(await todo(leMonde.client)).some(({ ticket }) => ticket === 2061));
  });

  test("merge : la PR que la carte nomme est mergée — après le commentaire", async () => {
    const leMonde = monde();
    const rendu = await cliquer(leMonde, 1554, "Yes, merge PR #1560 as delivered");
    assert.ok("repondue" in rendu, JSON.stringify(rendu));
    assert.equal(dernierComment(leMonde, 1554), "<!-- brigade:reponse gesture=merge -->\nYes, merge PR #1560 as delivered");
    assert.deepEqual(leMonde.ecrits.map(({ methode, chemin }) => `${methode} ${chemin}`).slice(0, 2), [`POST /repos/${REPOSITORY}/issues/1554/comments`, `PUT /repos/${REPOSITORY}/pulls/1560/merge`]);
    assert.equal(leMonde.prs.get(1560)?.merged, true);
    assert.equal(leMonde.issues.get(1554)?.state, "closed");
    assert.ok(!(await todo(leMonde.client)).some(({ ticket }) => ticket === 1554));
  });

  test("close : l'issue est fermée, le ticket n'est pas cuisiné", async () => {
    const leMonde = monde();
    const rendu = await cliquer(leMonde, 1554, "No, we drop the export");
    assert.ok("repondue" in rendu, JSON.stringify(rendu));
    assert.equal(dernierComment(leMonde, 1554), "<!-- brigade:reponse gesture=close -->\nNo, we drop the export");
    assert.equal(leMonde.issues.get(1554)?.state, "closed");
    assert.equal(leMonde.prs.get(1560)?.merged, false);
    assert.ok(!(await todo(leMonde.client)).some(({ ticket }) => ticket === 1554));
  });

  test("le texte libre joue `resume`, avec le texte du chef dans l'issue", async () => {
    const leMonde = monde();
    const card = cardDe(await todo(leMonde.client), 2061);
    const answer = { question: card.todo?.question ?? null, texte: "Not yet: the phone app still reads the old board." };
    const rendu = await repondreSurGithub({ depot: REPOSITORY, ticket: 2061, chef: card.chef, reponse: answer, client: leMonde.client });
    assert.ok("repondue" in rendu, JSON.stringify(rendu));
    assert.equal(dernierComment(leMonde, 2061), commentDeAnswer("resume", "Not yet: the phone app still reads the old board."));
    assert.deepEqual([...(leMonde.issues.get(2061)?.labels ?? [])], ["fire"]);
  });

  test("rien ne part pour une question changée, une réponse vide, ni un merge sans PR ouverte", async () => {
    const leMonde = monde();
    const card = cardDe(await todo(leMonde.client), 1554);
    const avant = leMonde.ecrits.length;
    assert.ok("refus" in (await repondreSurGithub({ depot: REPOSITORY, ticket: 1554, chef: card.chef, reponse: { question: "Another question?", choix: 1 }, client: leMonde.client })));
    assert.ok("refus" in (await repondreSurGithub({ depot: REPOSITORY, ticket: 1554, chef: card.chef, reponse: { question: card.todo?.question ?? null, texte: "  " }, client: leMonde.client })));
    (leMonde.prs.get(1560) as PR).state = "closed";
    const sansPR = await repondreSurGithub({ depot: REPOSITORY, ticket: 1554, chef: card.chef, reponse: { question: card.todo?.question ?? null, choix: 1 }, client: leMonde.client });
    assert.deepEqual(sansPR, { refus: "nothing was sent: no open PR names #1554 — the card has nothing to merge", detail: "" });
    assert.equal(leMonde.ecrits.length, avant, "nothing is written");
  });
});

// Le refus `decision` du manager tel que runtime/src/manager.ts l'écrit depuis #3434 : sa question, une ligne par réponse, puis
// celle qu'il recommande et pourquoi — `Wait for <qui>` d'abord quand la question attend un tiers.
const refusalDuManager = (...card: string[]) =>
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
const DECISION = refusalDuManager(
  "Which recontact does the beta keep?",
  "- [resume] Option A suffices",
  "- [resume] Option B: generate them",
  "- [close] Close it: out of scope",
  "",
  "**Recommended:** Option B: generate them — the client asked for them twice.",
);
const SANS_OPINION = refusalDuManager("Which recontact does the beta keep?", "- [resume] Option A suffices", "- [resume] Option B: generate them");
const TIERS = refusalDuManager(
  "Does AF want direct automatic recontact of the Respondent after the beta?",
  "- [wait] Wait for AF, the client",
  "- [resume] Yes: recontact automatically",
  "",
  "**Recommended:** Wait for AF, the client — the answer is theirs to give, not yours",
);

describe("la carte d'une décision du manager : ses réponses en boutons, celle qu'il recommande, WAITING pour un tiers (#3434)", () => {
  const avec = (corps: string) => {
    const leMonde = monde();
    leMonde.issues.set(35, { labels: new Set(["decision"]), state: "open", commentaires: [{ id: 90, body: corps, author_association: "OWNER", created_at: "2026-11-05T02:00:00Z" }] });
    return leMonde;
  };
  const vue = async (leMonde: ReturnType<typeof monde>) => {
    const { racine } = posee(35, cardDe(await todo(leMonde.client), 35).todo ?? assert.fail("the card asks its question"));
    return { libelles: boutons(racine).map(({ textContent }) => textContent), recommandes: boutons(racine).filter(({ dataset }) => dataset.bouton === "recommande").map(({ textContent }) => textContent), dits: racine.dessous("p").map(({ textContent }) => textContent ?? "") };
  };

  test("un bouton par réponse, dans ses mots ; la recommandée pleine d'accent, sa raison en une ligne — jamais « Back to the kitchen »", async () => {
    const { libelles, recommandes, dits } = await vue(avec(DECISION));
    assert.deepEqual(libelles, ["Option A suffices", "Option B: generate them", "Close it: out of scope"]);
    assert.deepEqual(recommandes, ["Option B: generate them"]);
    assert.ok(dits.includes("Recommended: Option B: generate them — the client asked for them twice."), JSON.stringify(dits));
    assert.ok(!dits.some((dit) => /Back to the kitchen/.test(dit)));
  });

  test("un clic sur une réponse la poste sur l'issue et rend l'issue au manager : `decision` retiré, aucun autre pas", async () => {
    const leMonde = avec(DECISION);
    const rendu = await cliquer(leMonde, 35, "Option A suffices");
    assert.ok("repondue" in rendu, JSON.stringify(rendu));
    assert.equal(dernierComment(leMonde, 35), "<!-- brigade:reponse gesture=resume -->\nOption A suffices");
    assert.deepEqual([...(leMonde.issues.get(35)?.labels ?? [])], []);
    assert.equal(leMonde.issues.get(35)?.state, "open");
  });

  test("sans fondement pour en recommander une : aucune recommandation, aucun bouton mis en avant", async () => {
    const { libelles, recommandes, dits } = await vue(avec(SANS_OPINION));
    assert.deepEqual(libelles, ["Option A suffices", "Option B: generate them"]);
    assert.deepEqual(recommandes, []);
    assert.ok(!dits.some((dit) => dit.startsWith("Recommended")), JSON.stringify(dits));
  });

  test("un écart d'avant #3434, sans réponses : ses deux gestes, et aucun « Recommended: Back to the kitchen »", async () => {
    const { libelles, recommandes, dits } = await vue(avec(refusalDuManager("Which recontact does the beta keep?")));
    assert.deepEqual(libelles, ["Back to the kitchen", "Close it"]);
    assert.deepEqual(recommandes, []);
    assert.ok(!dits.some((dit) => dit.startsWith("Recommended")));
  });

  test("une question qui attend le client : « Wait for … » recommandé ; un clic met l'issue en WAITING, en disant qui elle attend", async () => {
    const leMonde = avec(TIERS);
    const { libelles, recommandes } = await vue(leMonde);
    assert.deepEqual(libelles, ["Wait for AF, the client", "Yes: recontact automatically"]);
    assert.deepEqual(recommandes, ["Wait for AF, the client"]);

    const card = cardDe(await todo(leMonde.client), 35);
    const rendu = await repondreSurGithub({ depot: REPOSITORY, ticket: 35, chef: card.chef, reponse: { question: card.todo?.question ?? null, choix: 1 }, client: leMonde.client, maintenant: new Date(2026, 10, 13, 12) });
    assert.ok("repondue" in rendu, JSON.stringify(rendu));
    assert.match(rendu.dit, /in WAITING on GitHub: #35 awaits AF, the client, follow-up on 2026-11-20/);
    const issue = leMonde.issues.get(35);
    assert.deepEqual([...(issue?.labels ?? [])], ["parked"]);
    const [answer, wait] = issue?.commentaires.slice(-2) ?? [];
    assert.equal(answer?.body, "<!-- brigade:reponse gesture=wait -->\nWait for AF, the client");
    // Le commentaire de parking (#4129), dans la forme que la carte de WAITING relit (vue/wait/wait-github.ts).
    assert.deepEqual(tiersDesCommentaires(wait === undefined ? [] : [wait])?.qui, "AF, the client");
    assert.match(wait?.body ?? "", /^<!-- brigade:parked \{.*\} -->\n\*\*PARKED: waits for AF, the client\.\*\* Does AF want direct automatic recontact of the Respondent after the beta\?/);
  });

  test("le label `parked` refusé : la réponse est postée, et le refus dit que le ticket n'est pas parqué", async () => {
    const leMonde = avec(TIERS);
    const card = cardDe(await todo(leMonde.client), 35);
    const ecrire = leMonde.client.ecrire;
    // Seule la pose de `parked` est refusée : « Wait for … » parque le ticket (#4129), il ne pose aucun autre label.
    const parque = (corps: unknown) => JSON.stringify(corps) === JSON.stringify({ labels: ["parked"] });
    const client: ClientDeLaAnswer = { lire: leMonde.client.lire, ecrire: async (methode, chemin, corps) => (chemin.endsWith("/labels") && methode === "POST" && parque(corps) ? { status: 500, data: { message: "boom" } } : ecrire(methode, chemin, corps)) };
    const rendu = await repondreSurGithub({ depot: REPOSITORY, ticket: 35, chef: card.chef, reponse: { question: card.todo?.question ?? null, choix: 1 }, client, maintenant: new Date(2026, 10, 13, 12) });
    assert.ok("refus" in rendu, JSON.stringify(rendu));
    assert.match(rendu.refus, /its gesture \(wait\) was not played/);
    assert.match(rendu.detail, /#35 is not parked: its comment is posted, but GitHub did not set `parked`/);
    assert.ok(leMonde.issues.get(35)?.labels.has("decision"), "the card stays: nothing else was removed");
  });
});
