// Une carte de TODO sans question est déposée comme défaut sur la brigade, par
// la station, sans geste du chef (#3134) : le module seul, puis de bout en bout
// par le tour de la station (guérison).
import assert from "node:assert/strict";
import { test } from "node:test";
import { cartesDesIssues, type CarteDeTodoGitHub } from "../src/attente-github/attente-github.ts";
import { stationGitHub } from "../src/brigade-github.ts";
import type { GitHubDeLaBrigade } from "../src/routage-temps-perdu.ts";
import { marqueDuSignalement, ouvrirSignalement, type GitHubDuSignalement } from "../src/signalement-carte-sans-question.ts";
import { CALIBRE, FauxGitHub } from "./faux-github.ts";

const SERVI = "zeta/lab";
const MAINTENANT = new Date("2026-11-10T10:00:00Z");

// La brigade : les issues qu'on y dépose, et celles qui y étaient déjà.
function fausseBrigade(avant: { number: number; body: string; association: string; author?: string; state?: "open" | "closed" }[] = [], { login }: { login?: string } = {}) {
  const panne = { illisible: false };
  const deposees: { titre: string; corps: string; labels: string[] }[] = [];
  const lectures: string[] = [];
  const brigade: GitHubDuSignalement & Pick<GitHubDeLaBrigade, "fermerIssue"> = {
    issuesDepuis: async (instant) => {
      lectures.push(instant);
      if (panne.illisible) throw new Error("gh: HTTP 502");
      return [...avant, ...deposees.map((d, rang) => ({ number: 800 + rang, body: d.corps, association: "OWNER", state: "open" as const }))];
    },
    creerIssue: async (issue) => {
      deposees.push(issue);
      return 800 + deposees.length - 1;
    },
    fermerIssue: async () => {},
    ...(login === undefined ? {} : { droits: async () => ({ login, ecriture: false }) }),
  };
  return { brigade, deposees, lectures, panne };
}

const carte = (numero: number, manque: string | null): CarteDeTodoGitHub => ({ numero, titre: `ticket ${numero}`, ligne: "", manque });

test("a question-less card: exactly one defect on the brigade, naming the project, #N and what is missing", async () => {
  const { brigade, deposees, lectures } = fausseBrigade();
  const { signaler } = ouvrirSignalement({ servi: SERVI, brigade, maintenant: () => MAINTENANT });
  assert.deepEqual(await signaler([carte(42, "no comment marked says what it asks")]), [{ carte: 42, defaut: 800 }]);
  assert.equal(deposees.length, 1);
  const [defaut] = deposees;
  assert.match(defaut?.titre ?? "", /zeta\/lab#42/);
  assert.ok(defaut?.corps.includes(marqueDuSignalement(SERVI, 42)));
  assert.ok(defaut?.corps.includes("<!-- brigade:projet=zeta/lab -->"));
  assert.match(defaut?.corps ?? "", /\*\*zeta\/lab#42\*\* \(“ticket 42”\) awaits the chef but asks no question: no comment marked says what it asks\./);
  assert.deepEqual(defaut?.labels, ["fix"]);
  // Cherché sur les trente derniers jours.
  assert.deepEqual(lectures, ["2026-10-11T10:00:00.000Z"]);
});

test("a second pass on the same card files no duplicate — in the same process, or after a restart that finds it on the brigade", async () => {
  const { brigade, deposees, lectures } = fausseBrigade();
  const premier = ouvrirSignalement({ servi: SERVI, brigade, maintenant: () => MAINTENANT });
  await premier.signaler([carte(42, "no question")]);
  assert.deepEqual(await premier.signaler([carte(42, "no question")]), []);
  // Déjà vue : la brigade n'est pas relue.
  assert.equal(lectures.length, 1);
  // Une autre station, ou la même redémarrée : le défaut est sur la brigade.
  const apres = ouvrirSignalement({ servi: SERVI, brigade, maintenant: () => MAINTENANT });
  assert.deepEqual(await apres.signaler([carte(42, "no question")]), []);
  assert.equal(deposees.length, 1);
});

test("a defect already filed — closed, or by this station's own account — covers the card; another project's, or a stranger's, does not", async () => {
  const marque = marqueDuSignalement(SERVI, 42);
  const couvert = fausseBrigade([{ number: 700, body: marque, association: "OWNER", state: "closed" }]);
  assert.deepEqual(await ouvrirSignalement({ servi: SERVI, brigade: couvert.brigade }).signaler([carte(42, "no question")]), []);
  const parMoi = fausseBrigade([{ number: 701, body: marque, association: "NONE", author: "Station-Bot" }], { login: "station-bot" });
  assert.deepEqual(await ouvrirSignalement({ servi: SERVI, brigade: parMoi.brigade }).signaler([carte(42, "no question")]), []);
  const ailleurs = fausseBrigade([
    { number: 702, body: marqueDuSignalement("other/lab", 42), association: "OWNER" },
    { number: 703, body: marque, association: "NONE", author: "stranger" },
  ]);
  assert.deepEqual(await ouvrirSignalement({ servi: SERVI, brigade: ailleurs.brigade }).signaler([carte(42, "no question")]), [{ carte: 42, defaut: 800 }]);
});

test("a card with its question files nothing and reads nothing", async () => {
  const { brigade, deposees, lectures } = fausseBrigade();
  assert.deepEqual(await ouvrirSignalement({ servi: SERVI, brigade }).signaler([carte(43, null)]), []);
  assert.deepEqual([deposees.length, lectures.length], [0, 0]);
});

test("the brigade unreadable: nothing is filed, the failure goes up, and the next pass files it once", async () => {
  const { brigade, deposees, panne } = fausseBrigade();
  panne.illisible = true;
  const { signaler } = ouvrirSignalement({ servi: SERVI, brigade });
  await assert.rejects(signaler([carte(42, "no question")]), /HTTP 502/);
  assert.equal(deposees.length, 0);
  panne.illisible = false;
  assert.deepEqual(await signaler([carte(42, "no question")]), [{ carte: 42, defaut: 800 }]);
  assert.deepEqual(await signaler([carte(42, "no question")]), []);
  assert.equal(deposees.length, 1);
});

test("the TODO built from GitHub says what a card is missing: no marked comment, or a marked comment with no text", async () => {
  const commentaires = new Map<number, { body: string; association: string }[]>([
    [1, [{ body: "<!-- brigade:todo kind=product-question -->\nWhich payment provider?", association: "OWNER" }]],
    [2, []],
    [3, [{ body: "<!-- brigade:todo kind=blocked -->\n  ", association: "MEMBER" }]],
    // Un inconnu ne pose pas de carte.
    [4, [{ body: "<!-- brigade:todo kind=blocked -->\nWhat now?", association: "NONE" }]],
    [5, []],
  ]);
  const { todo } = await cartesDesIssues({ commentaires: async (n) => commentaires.get(n) ?? [] }, [
    { number: 1, title: "one", labels: ["chef-todo"] },
    { number: 2, title: "two", labels: ["chef-todo"] },
    { number: 3, title: "three", labels: ["chef-todo"] },
    { number: 4, title: "four", labels: ["chef-todo"] },
    { number: 5, title: "five", labels: ["blocked-on-human"] },
  ]);
  assert.deepEqual(
    todo.map(({ numero, manque }) => [numero, manque === null ? null : manque.includes("no text") ? "no text" : "no marked comment"]),
    [
      [1, null],
      [2, "no marked comment"],
      [3, "no text"],
      [4, "no marked comment"],
      [5, null],
    ],
  );
});

// De bout en bout : le tour de la station lit ses tickets, et la guérison dépose
// le défaut sur la brigade — sans invite, sans bouton, sans geste du chef.
test("the station's turn files the defect of a question-less card on the brigade, once over two turns, and none for a card with its question", async () => {
  const faux = new FauxGitHub();
  const station = "mac/claude";
  const { brigade, deposees } = fausseBrigade();
  const avertis: string[] = [];
  const tour = stationGitHub({
    nom: station,
    places: 1,
    base: "develop",
    github: faux.pour(station),
    prise: faux.prise(faux.pour(station), station),
    cuisiner: async () => ({ echec: "nothing to cook here" }),
    juger: async () => ({ verdict: "approve", motif: "" }),
    jugerEnSecond: async () => ({ verdict: "approve", motif: "" }),
    avertir: (texte) => avertis.push(texte),
    maintenant: () => MAINTENANT,
    depotServi: SERVI,
    githubDeLaBrigade: brigade as GitHubDeLaBrigade,
  });
  faux.feu(30, [...CALIBRE, "chef-todo"]);
  faux.feu(31, [...CALIBRE, "chef-todo"]);
  faux.poster(31, station, "<!-- brigade:todo kind=product-question -->\nWhich payment provider?");
  for (let i = 0; i < 2; i++) {
    await tour.tour();
    await tour.calme();
    await tour.relu();
  }
  assert.equal(deposees.length, 1, avertis.join("\n"));
  assert.match(deposees[0]?.titre ?? "", /zeta\/lab#30$/);
  assert.equal(faux.creations.length, 0, "nothing is filed on the served project");
  assert.ok(avertis.some((ligne) => /TODO card of #30 asks no question — defect #800 filed on benomite\/brigade/.test(ligne)), avertis.join("\n"));
});
