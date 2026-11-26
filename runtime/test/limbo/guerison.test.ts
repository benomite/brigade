// La réparation des limbes jouée par la guérison de chaque tour (#4215), sur un faux GitHub : la carte `chef-todo` du
// jugement de décision, le ticket parqué (`parked`) avec la raison du manager, et rien de plus au tour suivant.
import assert from "node:assert/strict";
import { test } from "node:test";
import { attenteDeLIssue } from "../../src/attente-github/marque.ts";
import { carteEnCours } from "../../src/github-seul/carte-todo/carte-todo.ts";
import { ouvrirGuerison, type GitHubDuProjet } from "../../src/guerison/index.ts";

const M = "<!-- brigade:manager -->";
const DECISION = [M, "**Manager — not a workable ticket: a decision issue.** Nothing is set, no cook will start.", "", "Which mail provider sends the newsletter?", "- [wait] Wait for the client", "- [resume] Create a Brevo account and send the DNS records", "- [resume] Keep the current mail provider"].join("\n");
const ATTENTE = `${M}\nJudgment: on hold\nReason: waits for the client DNS records\n`;

type Issue = { number: number; title: string; labels: string[]; state: "open" | "closed"; commentaires: { id: number; body: string; association: string; createdAt: string }[] };

function faux(issues: Issue[], casse: { commentaires?: boolean } = {}) {
  let id = 0;
  const trouver = (n: number) => issues.find((i) => i.number === n) ?? assert.fail(`#${n} unknown`);
  const github: GitHubDuProjet = {
    commentaires: async (n) => {
      if (casse.commentaires) throw new Error("comments unreadable");
      return trouver(n).commentaires.map((c) => ({ ...c }));
    },
    commenter: async (n, body) => void trouver(n).commentaires.push({ id: ++id, body, association: "OWNER", createdAt: "2026-11-26T10:00:00Z" }),
    labelliser: async (n, labels) => void labels.forEach((l) => trouver(n).labels.includes(l) || trouver(n).labels.push(l)),
    delabelliser: async (n, label) => void (trouver(n).labels = trouver(n).labels.filter((l) => l !== label)),
    prDuTicket: async () => null,
    ci: async () => [],
    fermerIssue: async () => {},
    retraitsDeLabels: async () => [],
    issue: async (n) => {
      const i = trouver(n);
      return { number: i.number, title: i.title, labels: [...i.labels], state: i.state, createdAt: "", updatedAt: "", url: "" } as never;
    },
  };
  const avertis: string[] = [];
  const { guerir } = ouvrirGuerison({ github, station: "A", base: "main", avertir: (m) => avertis.push(m), maintenant: () => Date.parse("2026-11-26T10:00:00Z") });
  const tour = () => guerir(issues.map(({ number, title, labels, state }) => ({ number, title, labels: [...labels], state })), new Set());
  return { issues, tour, avertis };
}
const commentaire = (body: string, association = "OWNER") => ({ id: 0, body, association, createdAt: "2026-11-23T10:00:00Z" });

test("each turn's healing puts the decision card back in TODO and parks the on-hold ticket, then a second turn writes nothing", async () => {
  const f = faux([
    { number: 221, title: "Newsletter", labels: ["fire"], state: "open", commentaires: [commentaire(DECISION)] },
    { number: 300, title: "DNS", labels: ["fire"], state: "open", commentaires: [commentaire(ATTENTE)] },
    { number: 301, title: "Calibrated", labels: ["fire", "model:opus", "effort:medium"], state: "open", commentaires: [commentaire(ATTENTE)] },
  ]);
  const bilan = await f.tour();
  assert.deepEqual(bilan.echecs, []);
  const [decision, attente, calibre] = f.issues as [Issue, Issue, Issue];
  assert.ok(decision.labels.includes("chef-todo"));
  const carte = carteEnCours(decision.labels, decision.commentaires);
  assert.equal(carte?.sorte, "product-question");
  assert.match(carte?.texte ?? "", /^Which mail provider sends the newsletter\?\n\n- \[wait\] Wait for the client\n- \[resume\] Create a Brevo account and send the DNS records\n- \[resume\] Keep the current mail provider$/);
  assert.ok(decision.commentaires.some((c) => c.body.startsWith("<!-- brigade:limbo -->")));
  assert.ok(attente.labels.includes("parked"));
  assert.equal(attenteDeLIssue(attente.commentaires)?.what, "waits for the client DNS records");
  assert.deepEqual([calibre.labels, calibre.commentaires.length], [["fire", "model:opus", "effort:medium"], 1]);

  const avant = JSON.stringify(f.issues);
  await f.tour();
  assert.equal(JSON.stringify(f.issues), avant);
});

test("a judgment written by someone outside the repository is not the manager's: nothing is repaired", async () => {
  const f = faux([{ number: 5, title: "t", labels: ["fire"], state: "open", commentaires: [commentaire(ATTENTE, "NONE")] }]);
  await f.tour();
  assert.deepEqual([f.issues[0]?.labels, f.issues[0]?.commentaires.length], [["fire"], 1]);
});

test("comments that cannot be read leave the ticket as it is, and the healing says it and goes on", async () => {
  const f = faux([{ number: 5, title: "t", labels: ["fire"], state: "open", commentaires: [commentaire(ATTENTE)] }], { commentaires: true });
  const bilan = await f.tour();
  assert.deepEqual(bilan.echecs, [{ geste: "limbes", message: "comments unreadable" }]);
  assert.deepEqual(f.issues[0]?.labels, ["fire"]);
});
