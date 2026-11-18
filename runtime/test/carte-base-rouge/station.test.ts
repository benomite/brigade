// La carte de la base rouge (#3816) par le tour de la station, sur le client de
// GitHub qu'elle lui donne : la carte est une issue `chef-todo` dont le
// commentaire de TODO porte le texte, et ce qui ne se lit pas est dit sur la carte.
import assert from "node:assert/strict";
import { test } from "node:test";
import { marqueDeBaseRouge } from "../../src/base-rouge/ouvre-reparation.ts";
import { stationGitHub } from "../../src/brigade-github.ts";
import { carteBaseRouge, githubDeLaCarte } from "../../src/carte-base-rouge/carte-base-rouge.ts";
import { FauxGitHub } from "../faux-github.ts";

const miseDeCote = (n: number, motif: string) =>
  `<!-- brigade:echec n=${n} -->\nStation \`A\`: the cook stopped without a delivery — ${motif}\n\nSet aside by its failure count (\`set-aside:failures\`) after 3 failed cook runs: not served elsewhere, nobody serves it.`;

test("the station's turn puts the card in the chef's TODO after 3 set-aside repairs, and closes it once main is green", async () => {
  const faux = new FauxGitHub();
  faux.base = "red";
  faux.corpsEcrivables = true;
  const motifs = ["claude ended in error (exit code 143)", "the delivery stayed red", "no delivery after three runs"];
  motifs.forEach((motif, i) => {
    faux.feu(700 + i, ["repair-main", "set-aside:failures"], marqueDeBaseRouge(faux.teteDeLaBase));
    faux.ticket(700 + i).title = `Repair main: tests red on ${faux.teteDeLaBase.slice(0, 7)}`;
    faux.poster(700 + i, "A", miseDeCote(3, motif));
  });
  const github = faux.pour("A");
  github.issuesDepuis = async () => [...faux.tickets.values()].map((t) => ({ number: t.number, title: t.title, body: t.corps, labels: [...t.labels], state: t.state, association: "OWNER" }));
  github.instantDuCommit = async () => "2026-11-03T08:05:00Z";
  const dits: string[] = [];
  const station = stationGitHub({ nom: "A", places: 0, base: "main", github, prise: faux.prise(github, "A"), cuisiner: async () => assert.fail("no cook"), juger: async () => assert.fail("no review"), avertir: (texte) => dits.push(texte) });
  await station.tour();
  await station.tour();
  const cartes = () => [...faux.tickets.values()].filter((t) => t.corps.includes("brigade:carte-base-rouge"));
  assert.equal(cartes().length, 1, dits.join("\n"));
  const [carte] = cartes();
  assert.ok(carte?.labels.has("chef-todo"));
  assert.equal(carte?.state, "open");
  const todo = (faux.commentaires.get(carte?.number ?? 0) ?? []).filter((c) => c.body.startsWith("<!-- brigade:todo kind=blocked -->"));
  assert.equal(todo.length, 1, "one TODO comment, not one per turn");
  assert.match(todo[0]?.body ?? "", /2026-11-03 08:05 UTC/);
  motifs.forEach((motif, i) => assert.match(todo[0]?.body ?? "", new RegExp(`^- #${700 + i} — set aside: the cook stopped without a delivery — ${motif.replace(/[()]/g, "\\$&")}$`, "m")));
  assert.doesNotMatch(todo[0]?.body ?? "", /brigade:carte-base-rouge/, "the hidden mark stays out of what the chef reads");
  faux.base = "green";
  await station.tour();
  assert.equal(carte?.state, "closed");
});

function client() {
  type Lue = { number: number; title: string; body: string; labels: string[]; state: "open" | "closed"; association: string };
  const issues: Lue[] = [];
  const commentaires = new Map<number, { body: string; association: string }[]>();
  const github: Parameters<typeof githubDeLaCarte>[0] = {
    teteDeLaBase: async () => "a".repeat(40),
    journalDuCheck: async () => {
      throw new Error("HTTP 410");
    },
    issuesDepuis: async () => issues.map((i) => ({ ...i, labels: [...i.labels] })),
    commentaires: async (n) => commentaires.get(n) ?? [],
    commenter: async (n, body) => void commentaires.set(n, [...(commentaires.get(n) ?? []), { body, association: "OWNER" }]),
    labelliser: async (n, labels) => void issues.find((i) => i.number === n)?.labels.push(...labels),
    creerIssue: async ({ titre, corps, labels }) => {
      issues.push({ number: 900 + issues.length, title: titre, body: corps, labels: [...labels], state: "open", association: "OWNER" });
      return 900 + issues.length - 1;
    },
    ecrireCorps: async (n, corps) => void (issues.find((i) => i.number === n)!.body = corps),
    fermerIssue: async (n) => void (issues.find((i) => i.number === n)!.state = "closed"),
    rouvrirIssue: async (n) => void (issues.find((i) => i.number === n)!.state = "open"),
  };
  const reparation = (association = "OWNER") => issues.push({ number: 100 + issues.length, title: "Repair main: tests red on aaaaaaa", body: marqueDeBaseRouge("a".repeat(40)), labels: ["repair-main", "set-aside:failures"], state: "closed", association });
  return { issues, commentaires, github, reparation };
}

const ROUGE = [{ name: "tests", outcome: "red" as const, url: "https://github.com/o/r/actions/runs/1/job/1" }];

test("a repair filed by someone outside the repository does not count", async () => {
  const c = client();
  c.reparation();
  c.reparation();
  c.reparation("NONE");
  await carteBaseRouge({ github: githubDeLaCarte(c.github), base: "main" })(ROUGE);
  assert.equal(c.issues.filter((i) => i.labels.includes("chef-todo")).length, 0);
});

test("what GitHub does not give is said on the card, never made up", async () => {
  const c = client();
  for (let i = 0; i < 3; i++) c.reparation();
  await carteBaseRouge({ github: githubDeLaCarte(c.github), base: "main" })(ROUGE);
  const carte = c.issues.find((i) => i.labels.includes("chef-todo"));
  assert.ok(carte);
  assert.match(carte.body, /Red since: unknown — GitHub did not give the date of commit `aaaaaaa`/);
  assert.match(carte.body, /its log could not be read: HTTP 410/);
  assert.match(carte.body, /^- #100 — set aside: no reason found on the ticket$/m);
});

test("a card the chef took off the TODO while main is red comes back, label and text", async () => {
  const c = client();
  for (let i = 0; i < 3; i++) c.reparation();
  const passer = carteBaseRouge({ github: githubDeLaCarte(c.github), base: "main" });
  await passer(ROUGE);
  const carte = c.issues.find((i) => i.labels.includes("chef-todo"))!;
  carte.labels = [];
  await passer(ROUGE);
  assert.deepEqual(carte.labels, ["chef-todo"]);
  assert.equal(c.issues.filter((i) => i.body.includes("brigade:carte-base-rouge")).length, 1);
  assert.equal((c.commentaires.get(carte.number) ?? []).filter((m) => m.body.startsWith("<!-- brigade:todo kind=blocked -->")).length, 2);
});
