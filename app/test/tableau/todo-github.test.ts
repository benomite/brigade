// Le TODO du chef lu de GitHub pour un projet GitHub seul (#2221) : une carte par issue au label `chef-todo`, sa sorte et son
// texte tirés du commentaire marqué ; la carte part avec le label ; un projet du vieux chemin garde son TODO.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { rail, type Faits } from "../../src/faits.ts";
import type { AppelGitHub, ReponseGitHub } from "../../src/tableau/client.ts";
import type { TableauLu } from "../../src/tableau/lecture.ts";
import { avecLeTodoGithub, carteDuCommentaire, lesCartesDuChef, projetGithubSeul } from "../../src/tableau/todo-github.ts";

const ok = (data: unknown): ReponseGitHub => ({ status: 200, data });
const issue = (number: number, extra: object = {}) => ({ number, title: `Ticket ${number}`, html_url: `https://github.com/acme/kitchen/issues/${number}`, ...extra });
const marque = (kind: string, texte: string) => ({ body: `<!-- brigade:todo kind=${kind} -->\n${texte}` });
const reglages = (json: object) => ok({ content: Buffer.from(JSON.stringify(json)).toString("base64"), encoding: "base64" });

// Un faux GitHub : les issues au label, leurs commentaires, le fichier de réglages du projet.
function github(options: { seul: boolean | "absent"; issues: object[]; commentaires: Record<number, object[]> }): AppelGitHub {
  return async (chemin) => {
    if (chemin.includes("/contents/.claude/brigade/projet.json")) return options.seul === "absent" ? { status: 404, data: {} } : reglages({ version: 1, integrationBranch: "main", githubOnlyState: options.seul });
    if (chemin.includes("/issues?")) return ok(options.issues);
    const lu = /\/issues\/(\d+)\/comments/.exec(chemin);
    if (lu !== null) return ok(options.commentaires[Number(lu[1])] ?? []);
    return { status: 404, data: {} };
  };
}
const tableau = (): TableauLu => ({ lu: true, depot: "acme/kitchen", faits: { rail: [] } }) as unknown as TableauLu;
const todoDe = (lu: TableauLu) => rail({ ...lu.faits, rail: lu.faits?.rail } as unknown as Faits).colonnes.find(({ nom }) => nom === "Todo");

describe("le commentaire marqué", () => {
  test("la sorte et le texte, en clair", () => {
    assert.deepEqual(carteDuCommentaire("<!-- brigade:todo kind=merge-by-hand -->\nMerge PR 12 yourself.\n"), { sorte: "merge-by-hand", texte: "Merge PR 12 yourself." });
    assert.equal(carteDuCommentaire("a comment like another"), null);
  });
});

describe("le TODO d'un projet GitHub seul", () => {
  const issues = [issue(5), issue(9), issue(11, { pull_request: {} })];
  const commentaires = { 5: [{ body: "chatter" }, marque("blocked", "Needs a token."), marque("blocked", "Needs a token and a key.")], 9: [marque("product-question", "Which plan?")] };

  test("une carte par issue au label, avec sa sorte, son texte et le lien de son issue", async () => {
    const cartes = await lesCartesDuChef({ depot: "acme/kitchen", appeler: github({ seul: true, issues, commentaires }) });
    assert.deepEqual(cartes, [
      { ticket: 5, titre: "Ticket 5", url: "https://github.com/acme/kitchen/issues/5", sorte: "blocked", texte: "Needs a token and a key." },
      { ticket: 9, titre: "Ticket 9", url: "https://github.com/acme/kitchen/issues/9", sorte: "product-question", texte: "Which plan?" },
    ]);
    const todo = todoDe(await avecLeTodoGithub(tableau(), github({ seul: true, issues, commentaires })));
    assert.deepEqual(todo?.cartes.map(({ ticket, ouvrable, chef, ligne }) => [ticket, ouvrable, chef?.texte, ligne]), [
      [5, true, "Needs a token and a key.", "Blocked: a ticket cannot go on without you."],
      [9, true, "Which plan?", "A product question waits for your answer."],
    ]);
  });

  test("le label retiré, la carte part à la lecture suivante", async () => {
    const apres = await avecLeTodoGithub(tableau(), github({ seul: true, issues: [issue(9)], commentaires }));
    assert.deepEqual(todoDe(apres)?.cartes.map(({ ticket }) => ticket), [9]);
    const aucune = await avecLeTodoGithub(tableau(), github({ seul: true, issues: [], commentaires }));
    assert.deepEqual(todoDe(aucune)?.cartes ?? [], []);
  });

  test("une issue au label sans commentaire marqué reste une carte, qui le dit", async () => {
    const cartes = await lesCartesDuChef({ depot: "acme/kitchen", appeler: github({ seul: true, issues: [issue(5)], commentaires: {} }) });
    assert.equal(cartes?.[0]?.sorte, "todo");
    assert.match(cartes?.[0]?.texte ?? "", /marked comment is missing/);
  });

  test("GitHub qui refuse : le tableau tel quel, jamais « aucune carte »", async () => {
    const lu = tableau();
    const refus: AppelGitHub = async (chemin) => (chemin.includes("/contents/") ? reglages({ githubOnlyState: true }) : { status: 403, data: {} });
    assert.equal(await avecLeTodoGithub(lu, refus), lu);
  });
});

describe("un projet du vieux chemin", () => {
  for (const seul of [false, "absent"] as const) {
    test(`githubOnlyState ${seul} : le TODO est celui du tableau, GitHub n'est pas lu pour lui`, async () => {
      const lu = tableau();
      const appeler = github({ seul, issues: [issue(5)], commentaires: { 5: [marque("blocked", "x")] } });
      assert.equal(await projetGithubSeul({ depot: "acme/kitchen", appeler }), false);
      assert.equal(await avecLeTodoGithub(lu, appeler), lu);
    });
  }
});
