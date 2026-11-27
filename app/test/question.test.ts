// La question qui t'attend, posée telle quelle (#681) : l'issue lue par le `gh` du poste, la
// question du manager prise mot pour mot, ses choix lus, et la réponse du chef postée sur l'issue —
// seulement s'il l'a choisie ou écrite, et seulement sur la question qu'il a lue. Contre un faux
// `gh` écrit par chaque test : ni réseau, ni GitHub.
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { choiceOf, type Comment, readQuestion, MARKER_MANAGER, MARKER_QUESTION, questionOf, reply, resumeOf, titleOf } from "../src/question.ts";
import { WITHOUT_POSIX } from "./helpers/posix.ts";

const ISSUE = "https://github.com/benomite/brigade/issues/676";
const A = "2026-10-15T08:00:00Z";

// La question telle que le runtime l'écrit sur une épique (runtime/src/decoupage.ts, `asked`).
const QUESTION = [
  MARKER_MANAGER,
  MARKER_QUESTION,
  "**Manager — épique non découpée : une question.**",
  "",
  "Le popup remplace-t-il la fiche du ticket, ou s'ouvre-t-il par-dessus ? (a) il la remplace, (b) il s'ouvre par-dessus, ou (c) les deux selon la carte ?",
  "",
  "Réponds ici, ou édite l'épique : elle sera relue, et découpée si la réponse suffit.",
  "",
  "_Lu par le manager en `sonnet` / `medium` · 1 tour._",
].join("\n");
const TEXT = QUESTION.split("\n").slice(2).join("\n");

const comment = (body: string, fields: Partial<Comment> = {}): Comment => ({ auteur: "benomite", association: "OWNER", a: A, url: `${ISSUE}#issuecomment-1`, corps: body, ...fields });
// Un commentaire tel que `gh issue view --json comments` le rend.
const ofGh = ({ auteur: author, association, a, url, corps: body }: Comment) => ({ author: { login: author }, authorAssociation: association, createdAt: a, url, body: body });

describe("la question du manager, prise sur l'issue telle qu'elle est écrite", () => {
  test("c'est son dernier commentaire marqué question, sans ses marqueurs — rien d'autre n'en est retiré ni reformulé", () => {
    const question = questionOf([
      comment("une première remarque du chef", { url: `${ISSUE}#issuecomment-0` }),
      comment(`${MARKER_MANAGER}\n**Manager — ticket mis sur le rail.**`, { url: `${ISSUE}#issuecomment-1` }),
      comment(QUESTION, { url: `${ISSUE}#issuecomment-2` }),
    ]);
    assert.equal(question?.url, `${ISSUE}#issuecomment-2`);
    assert.equal(question?.texte, TEXT);
    assert.equal(question?.auteur, "benomite");
    assert.deepEqual(question?.depuis, []);
  });

  test("ce qui a été écrit sur l'issue depuis la question la suit : le chef voit qu'on y a déjà répondu", () => {
    const question = questionOf([comment(QUESTION), comment("b, sans hésiter", { auteur: "chef", a: "2026-10-15T09:00:00Z", url: `${ISSUE}#issuecomment-3` })]);
    const written = { auteur: "chef", a: "2026-10-15T09:00:00Z", url: `${ISSUE}#issuecomment-3`, corps: "b, sans hésiter" };
    assert.deepEqual(question?.depuis, [written]);
    assert.deepEqual(question?.repondue, written);
  });

  test("répondue : le premier commentaire écrit dessous que le manager lira comme une réponse — ni un des siens, ni celui de quelqu'un qui n'a pas la main sur le dépôt (#503)", () => {
    const passing = comment("je passais", { auteur: "passant", association: "NONE", url: `${ISSUE}#issuecomment-3` });
    const ofManager = comment(`${MARKER_MANAGER}\n**Manager — lu.**`, { auteur: "brigade-manager", url: `${ISSUE}#issuecomment-4` });
    assert.equal(questionOf([comment(QUESTION), passing, ofManager])?.repondue, undefined);
    const answer = comment("b", { auteur: "chef", a: "2026-10-15T09:30:00Z", url: `${ISSUE}#issuecomment-5` });
    assert.deepEqual(questionOf([comment(QUESTION), passing, ofManager, answer])?.repondue, { auteur: "chef", a: "2026-10-15T09:30:00Z", url: `${ISSUE}#issuecomment-5`, corps: "b" });
  });

  test("sans question du manager — un autre commentaire, ou le marqueur recopié par quelqu'un qui n'a pas la main sur le dépôt —, il n'y en a pas", () => {
    assert.equal(questionOf([]), undefined);
    assert.equal(questionOf([comment(`${MARKER_MANAGER}\n**Manager — pas un ticket exécutable : une question.**`)]), undefined);
    assert.equal(questionOf([comment(QUESTION, { association: "NONE" })]), undefined);
    assert.equal(questionOf([comment(QUESTION, { association: "CONTRIBUTOR" })]), undefined);
  });
});

describe("les choix qu'elle propose", () => {
  test("dans la phrase : (a), (b), (c) — chacun avec son texte, sans le « ou » qui le lie au suivant ni le point d'interrogation", () => {
    assert.deepEqual(choiceOf(TEXT), [
      { lettre: "a", texte: "il la remplace" },
      { lettre: "b", texte: "il s'ouvre par-dessus" },
      { lettre: "c", texte: "les deux selon la carte" },
    ]);
    assert.deepEqual(choiceOf("On garde a) le rail seul ou b) le rail et la fiche ?"), [
      { lettre: "a", texte: "le rail seul" },
      { lettre: "b", texte: "le rail et la fiche" },
    ]);
  });

  test("en liste : a), (b), c., d : — avec ou sans puce, avec ou sans gras", () => {
    const text = ["Lequel ?", "", "- **a)** découper en deux tickets", "- (b) un seul ticket, plus gros", "c. attendre #452", "d : fermer l'épique", "", "Une remarque après la liste."].join("\n");
    assert.deepEqual(choiceOf(text), [
      { lettre: "a", texte: "découper en deux tickets" },
      { lettre: "b", texte: "un seul ticket, plus gros" },
      { lettre: "c", texte: "attendre #452" },
      { lettre: "d", texte: "fermer l'épique" },
    ]);
    assert.deepEqual(choiceOf("A) oui\nB) non"), [
      { lettre: "A", texte: "oui" },
      { lettre: "B", texte: "non" },
    ]);
  });

  test("sans choix lisibles — une question ouverte, une lettre seule, des lettres qui ne se suivent pas —, aucun : elle se répond par une phrase", () => {
    assert.deepEqual(choiceOf("Quel périmètre pour le premier ticket ?"), []);
    assert.deepEqual(choiceOf("Voir le point (a) de la spec : faut-il le garder ?"), []);
    assert.deepEqual(choiceOf("(a) un, (c) trois"), []);
    assert.deepEqual(choiceOf("(b) deux, (c) trois"), []);
    assert.deepEqual(choiceOf("Un mot (a) collé"), []);
  });
});

// Un faux `gh` : un script sh, dans le répertoire du test. Il note ses arguments et ce qu'il lit
// sur son entrée ; `vue` est ce qu'il rend à `issue view`, `poste` ce qu'il rend à `issue comment`,
// et `corps` se joue avant de répondre — une panne s'y écrit.
function trial(t: TestContext, { vue, poste: workstation = `${ISSUE}#issuecomment-9`, corps: body = "" }: { vue: string; poste?: string; corps?: string }) {
  const root = mkdtempSync(join(tmpdir(), "brigade-app-question-"));
  const gh = join(root, "gh");
  writeFileSync(join(root, "vue"), vue);
  writeFileSync(
    gh,
    [
      "#!/bin/sh",
      `D='${root}'`,
      'echo "$*" >> "$D/appels"',
      body,
      'case "$2" in',
      '  view) cat "$D/vue" ;;',
      `  comment) cat > "$D/poste"; echo '${workstation}' ;;`,
      "esac",
    ].join("\n"),
  );
  chmodSync(gh, 0o755);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const readOne = (name: string) => (existsSync(join(root, name)) ? readFileSync(join(root, name), "utf8") : undefined);
  return { reglages: { gh, delaiMs: 60_000 }, racine: root, lu: readOne, appels: () => (readOne("appels") ?? "").split("\n").filter(Boolean) };
}
const vueOf = (...comments: Comment[]) => JSON.stringify({ comments: comments.map(ofGh) });
const now = () => new Date("2026-10-15T10:00:00Z");

describe("l'issue lue par le `gh` du poste", () => {
  test("`gh issue view <adresse> --json comments` : la question, ses choix, l'heure de la lecture", { skip: WITHOUT_POSIX }, async (t) => {
    const { reglages: settings, appels: calls } = trial(t, { vue: vueOf(comment(QUESTION)) });
    const readEntry = await readQuestion(settings, ISSUE, now);
    assert.deepEqual(calls(), [`issue view ${ISSUE} --json comments`]);
    assert.equal(readEntry.a, "2026-10-15T10:00:00.000Z");
    assert.ok("question" in readEntry);
    assert.equal(readEntry.question.texte, TEXT);
    assert.deepEqual(readEntry.question.choix.map(({ lettre: letter }) => letter), ["a", "b", "c"]);
  });

  test("une issue sans question du manager : lue, et rien à poser — l'entrée garde son geste", { skip: WITHOUT_POSIX }, async (t) => {
    const { reglages: settings } = trial(t, { vue: vueOf(comment("rien à voir")) });
    assert.deepEqual(await readQuestion(settings, ISSUE, now), { a: "2026-10-15T10:00:00.000Z", aucune: true });
  });

  test("un `gh` en échec, absent, ou une sortie sans la forme : l'issue n'est pas lue, et l'app dit pourquoi — ce n'est pas « aucune question »", { skip: WITHOUT_POSIX }, async (t) => {
    const enFailure = trial(t, { vue: "", corps: 'echo "gh: not logged in" >&2; exit 4' });
    const fails = await readQuestion(enFailure.reglages, ISSUE, now);
    assert.ok("sans" in fails);
    assert.match(fails.sans, /issue view .*\ngh: not logged in\n→ exit code 4$/);

    const absent = await readQuestion({ gh: join(enFailure.racine, "pas-de-gh"), delaiMs: 60_000 }, ISSUE, now);
    assert.ok("sans" in absent);
    assert.match(absent.sans, /is not on this computer/);

    const informs = await readQuestion(trial(t, { vue: "{}" }).reglages, ISSUE, now);
    assert.ok("sans" in informs);
    assert.match(informs.sans, /no `comments` list/);
  });
});

describe("la réponse du chef, postée sur l'issue", () => {
  const URL_QUESTION = `${ISSUE}#issuecomment-1`;

  test("un choix : la lettre et le texte que la question écrit partent par `gh issue comment … --body-file -` — le texte vient de l'issue, pas de la vue", { skip: WITHOUT_POSIX }, async (t) => {
    const { reglages: settings, appels: calls, lu: readOne } = trial(t, { vue: vueOf(comment(QUESTION)) });
    const renderedOne = await reply(settings, ISSUE, { question: URL_QUESTION, choix: "b" });
    assert.deepEqual(renderedOne, { poste: true, corps: "b) il s'ouvre par-dessus", adresse: `${ISSUE}#issuecomment-9` });
    // Relue d'abord, puis écrite.
    assert.deepEqual(calls(), [`issue view ${ISSUE} --json comments`, `issue comment ${ISSUE} --body-file -`]);
    assert.equal(readOne("poste"), "b) il s'ouvre par-dessus");
  });

  test("une phrase : telle que le chef l'a écrite, ses blancs de bord retirés", { skip: WITHOUT_POSIX }, async (t) => {
    const { reglages: settings, lu: readOne } = trial(t, { vue: vueOf(comment(QUESTION)) });
    const renderedOne = await reply(settings, ISSUE, { question: URL_QUESTION, texte: "  Par-dessus, et la fiche reste dessous.\nMerci.  " });
    assert.equal(renderedOne.poste, true);
    assert.equal(readOne("poste"), "Par-dessus, et la fiche reste dessous.\nMerci.");
  });

  test("rien ne part sans réponse : ni phrase vide, ni choix que la question n'offre pas, ni réponse qui ne dit pas à quelle question elle répond", async (t) => {
    const { reglages: settings, appels: calls, lu: readOne } = trial(t, { vue: vueOf(comment(QUESTION)) });
    for (const sent of [undefined, {}, { question: URL_QUESTION }, { question: URL_QUESTION, texte: "   " }, { choix: "a" }, { question: URL_QUESTION, choix: "z" }]) {
      const renderedOne = await reply(settings, ISSUE, sent);
      assert.equal(renderedOne.poste, false, JSON.stringify(sent));
      assert.ok(!renderedOne.poste && renderedOne.refus.startsWith("nothing was posted"));
    }
    assert.ok(!calls().some((call) => call.startsWith("issue comment")));
    assert.equal(readOne("poste"), undefined);
  });

  test("une question qui n'est plus celle que le chef a lue — le manager en a posé une autre — : rien ne part, et la nouvelle revient", { skip: WITHOUT_POSIX }, async (t) => {
    const newEntry = comment(QUESTION.replace("(c) les deux", "(c) aucun des deux"), { url: `${ISSUE}#issuecomment-5` });
    const { reglages: settings, appels: calls } = trial(t, { vue: vueOf(comment(QUESTION), newEntry) });
    const renderedOne = await reply(settings, ISSUE, { question: URL_QUESTION, choix: "a" });
    assert.equal(renderedOne.poste, false);
    assert.ok(!renderedOne.poste && renderedOne.lue !== undefined && "question" in renderedOne.lue);
    assert.equal(!renderedOne.poste && renderedOne.lue !== undefined && "question" in renderedOne.lue ? renderedOne.lue.question.url : "", `${ISSUE}#issuecomment-5`);
    assert.ok(!calls().some((call) => call.startsWith("issue comment")));
  });

  test("répondue ailleurs pendant que le chef lisait — sur GitHub, par le second — : rien ne part, la fiche le dit et montre la réponse (#503)", { skip: WITHOUT_POSIX }, async (t) => {
    const elsewhere = comment("a, sans hésiter", { auteur: "second", url: `${ISSUE}#issuecomment-3` });
    const { reglages: settings, appels: calls } = trial(t, { vue: vueOf(comment(QUESTION), elsewhere) });
    const renderedOne = await reply(settings, ISSUE, { question: URL_QUESTION, choix: "b" });
    assert.equal(renderedOne.poste, false);
    assert.match(!renderedOne.poste ? renderedOne.refus : "", /^nothing was posted: second answered the question on the issue since you read it/);
    assert.ok(!renderedOne.poste && renderedOne.lue !== undefined && "question" in renderedOne.lue && renderedOne.lue.question.repondue?.url === `${ISSUE}#issuecomment-3`);
    assert.ok(!calls().some((call) => call.startsWith("issue comment")));

    // Ce qui était déjà écrit sous la question quand il l'a lue ne retient rien : il l'a vu.
    const seenOne = await reply(settings, ISSUE, { question: URL_QUESTION, vu: `${ISSUE}#issuecomment-3`, choix: "b" });
    assert.equal(seenOne.poste, true);
  });

  test("écrit dessous sans y répondre — un mot d'un passant — depuis la lecture : rien ne part non plus, il le lit d'abord", { skip: WITHOUT_POSIX }, async (t) => {
    const passing = comment("je passais", { auteur: "passant", association: "NONE", url: `${ISSUE}#issuecomment-3` });
    const { reglages: settings, appels: calls } = trial(t, { vue: vueOf(comment(QUESTION), passing) });
    const renderedOne = await reply(settings, ISSUE, { question: URL_QUESTION, texte: "b" });
    assert.match(!renderedOne.poste ? renderedOne.refus : "", /^nothing was posted: something was written under the question on the issue since you read it/);
    assert.ok(!calls().some((call) => call.startsWith("issue comment")));
  });

  test("un `gh` qui échoue à écrire : rien n'est dit posté, et ce qu'il a dit est rendu", { skip: WITHOUT_POSIX }, async (t) => {
    const { reglages: settings } = trial(t, { vue: vueOf(comment(QUESTION)), corps: '[ "$2" = comment ] && { echo "GraphQL: Could not resolve" >&2; exit 1; }' });
    const renderedOne = await reply(settings, ISSUE, { question: URL_QUESTION, choix: "a" });
    assert.equal(renderedOne.poste, false);
    assert.match(!renderedOne.poste ? renderedOne.refus : "", /issue comment .*--body-file -\nGraphQL: Could not resolve\n→ exit code 1$/);
  });
});

describe("ce que la carte dit de la question", () => {
  test("une ligne qui pose la question, sans la mise en forme ni les lignes d'étiquette — ou les deux premières lignes", () => {
    assert.equal(resumeOf(`${MARKER_MANAGER}\n**Manager — question.**\n\nFaut-il découper l'epic ?\n- a) oui\n- b) non\n_Lu par le manager_`), "Faut-il découper l'epic ?");
    assert.equal(resumeOf("Une décision de produit.\nElle porte sur le rail.\nEt la suite."), "Une décision de produit.\nElle porte sur le rail.");
    assert.equal(resumeOf(`${"x".repeat(300)}?`).length, 160);
  });

  test("la question lue porte son résumé", () => {
    assert.equal(questionOf([comment(QUESTION)])?.resume, resumeOf(TEXT));
  });
});

describe("le titre, par le `gh` du poste", () => {
  test("`gh issue view <adresse> --json title` rend le titre ; une issue sans titre n'en invente pas", { skip: WITHOUT_POSIX }, async (t) => {
    const { reglages: settings, appels: calls } = trial(t, { vue: JSON.stringify({ title: " Un ticket " }) });
    assert.deepEqual(await titleOf(settings, ISSUE), { titre: "Un ticket" });
    assert.deepEqual(calls(), [`issue view ${ISSUE} --json title`]);
    const empty = trial(t, { vue: JSON.stringify({ title: "" }) });
    assert.ok("sans" in (await titleOf(empty.reglages, ISSUE)));
  });
});
