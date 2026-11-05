// Le TODO du chef lu de GitHub (#2221, #2061) : une carte par issue au label `chef-todo`, sa sorte et son texte tirés du
// commentaire marqué ; la carte part avec le label. C'est tout TODO : aucune box ne publie plus de file.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { rail, type Faits } from "../../src/faits.ts";
import type { AppelGitHub, ReponseGitHub } from "../../src/tableau/client.ts";
import type { TableauLu } from "../../src/tableau/lecture.ts";
import { avecLeTodoGithub, carteDuCommentaire, lesCartesDuChef } from "../../src/tableau/todo-github.ts";

const ok = (data: unknown): ReponseGitHub => ({ status: 200, data });
const issue = (number: number, extra: object = {}) => ({ number, title: `Ticket ${number}`, html_url: `https://github.com/acme/kitchen/issues/${number}`, ...extra });
const marque = (kind: string, texte: string) => ({ body: `<!-- brigade:todo kind=${kind} -->\n${texte}` });

// Un faux GitHub : les issues au label, leurs commentaires.
function github(options: { issues: object[]; commentaires: Record<number, object[]> }): AppelGitHub {
  return async (chemin) => {
    if (chemin.includes("/issues?") && chemin.includes("labels=chef-todo")) return ok(options.issues);
    const lu = /\/issues\/(\d+)\/comments/.exec(chemin);
    if (lu !== null) return ok(options.commentaires[Number(lu[1])] ?? []);
    return { status: 404, data: {} };
  };
}
const tableau = (): TableauLu => ({ lu: true, depot: "acme/kitchen", faits: { rail: [], compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 } } }) as unknown as TableauLu;
const todoDe = (lu: TableauLu) => rail({ ...lu.faits, rail: lu.faits?.rail } as unknown as Faits).colonnes.find(({ nom }) => nom === "Todo");

describe("le commentaire marqué", () => {
  test("la sorte et le texte, en clair", () => {
    assert.deepEqual(carteDuCommentaire("<!-- brigade:todo kind=merge-by-hand -->\nMerge PR 12 yourself.\n"), { sorte: "merge-by-hand", texte: "Merge PR 12 yourself." });
    assert.equal(carteDuCommentaire("a comment like another"), null);
  });
});

describe("le TODO lu de GitHub", () => {
  const issues = [issue(5), issue(9), issue(11, { pull_request: {} })];
  const commentaires = { 5: [{ body: "chatter" }, marque("blocked", "Needs a token."), marque("blocked", "Needs a token and a key.")], 9: [marque("product-question", "Which plan?")] };

  test("une carte par issue au label, avec sa sorte, son texte et le lien de son issue", async () => {
    const cartes = await lesCartesDuChef({ depot: "acme/kitchen", appeler: github({ issues, commentaires }) });
    assert.deepEqual(cartes, [
      { ticket: 5, titre: "Ticket 5", url: "https://github.com/acme/kitchen/issues/5", sorte: "blocked", texte: "Needs a token and a key." },
      { ticket: 9, titre: "Ticket 9", url: "https://github.com/acme/kitchen/issues/9", sorte: "product-question", texte: "Which plan?" },
    ]);
    const todo = todoDe(await avecLeTodoGithub(tableau(), github({ issues, commentaires })));
    assert.deepEqual(todo?.cartes.map(({ ticket, ouvrable, chef, ligne }) => [ticket, ouvrable, chef?.texte, ligne]), [
      [5, true, "Needs a token and a key.", "Blocked: a ticket cannot go on without you."],
      [9, true, "Which plan?", "A product question waits for your answer."],
    ]);
  });

  test("le label retiré, la carte part à la lecture suivante", async () => {
    const apres = await avecLeTodoGithub(tableau(), github({ issues: [issue(9)], commentaires }));
    assert.deepEqual(todoDe(apres)?.cartes.map(({ ticket }) => ticket), [9]);
    const aucune = await avecLeTodoGithub(tableau(), github({ issues: [], commentaires }));
    assert.deepEqual(todoDe(aucune)?.cartes ?? [], []);
  });

  test("une issue au label sans commentaire marqué reste une carte, qui le dit", async () => {
    const cartes = await lesCartesDuChef({ depot: "acme/kitchen", appeler: github({ issues: [issue(5)], commentaires: {} }) });
    assert.equal(cartes?.[0]?.sorte, "todo");
    assert.match(cartes?.[0]?.texte ?? "", /marked comment is missing/);
  });

  test("les cartes sont tout `attend`, et son compte : ce que la lecture y portait est remplacé", async () => {
    const lu = tableau();
    (lu.faits as Record<string, unknown>).attend = [{ ticket: 99, titre: "old" }];
    const avec = await avecLeTodoGithub(lu, github({ issues, commentaires }));
    assert.deepEqual(avec.faits.attend, [
      { ticket: 5, titre: "Ticket 5", url: "https://github.com/acme/kitchen/issues/5", chef: { sorte: "blocked", texte: "Needs a token and a key." } },
      { ticket: 9, titre: "Ticket 9", url: "https://github.com/acme/kitchen/issues/9", chef: { sorte: "product-question", texte: "Which plan?" } },
    ]);
    assert.deepEqual(avec.faits.compteurs, { rail: 0, auTravail: 0, aLaPass: 0, attend: 2, livres24h: 0 });
    const aucune = await avecLeTodoGithub(lu, github({ issues: [], commentaires }));
    assert.deepEqual(aucune.faits.attend, []);
    assert.equal((aucune.faits.compteurs as { attend: number }).attend, 0);
  });

  test("GitHub qui refuse ou ne répond pas : la lecture telle quelle, sans `attend` — jamais « aucune carte »", async () => {
    const lu = tableau();
    assert.equal(await avecLeTodoGithub(lu, async () => ({ status: 403, data: {} })), lu);
    assert.equal(await avecLeTodoGithub(lu, async () => Promise.reject(new Error("offline"))), lu);
    // Les commentaires d'une carte qui ne se lisent pas : rien n'est lu, pas une carte vide.
    const sansCommentaires: AppelGitHub = async (chemin) => (chemin.includes("/comments") ? { status: 502, data: {} } : ok([issue(5)]));
    assert.equal(await avecLeTodoGithub(lu, sansCommentaires), lu);
    assert.equal(lu.faits.attend, undefined);
  });
});
