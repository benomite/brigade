// Une PR de cook rouge, sans cook dessus, repart à un cook — jamais au chef
// (#2970) : le module seul, puis le tour de la station qui le joue.
import assert from "node:assert/strict";
import { test } from "node:test";
import { brancheDuTicket, stationGitHub, type GitHubDuTour } from "../../src/brigade-github.ts";
import { renvoyerLesCiRouges, ticketDeLaBranche, type GitHubDeLaCiRouge, type PROuverte } from "../../src/ci-rouge/ci-rouge.ts";
import { CALIBRE, FauxGitHub } from "../faux-github.ts";

const SHA = "a".repeat(40);
const CARTE = "<!-- brigade:todo kind=merge-by-hand -->";

// Un GitHub en mémoire : la CI de chaque tête, les commentaires et les labels retirés.
function github(ci: Record<string, "red" | "green" | "pending" | Error>, commentaires: Record<number, string[]> = {}) {
  const ecrits: Array<[number, string]> = [];
  const retires: Array<[number, string]> = [];
  const client: GitHubDeLaCiRouge & { echecDuCommentaire?: Error } = {
    ci: async (sha) => {
      const lu = ci[sha];
      if (lu instanceof Error) throw lu;
      return lu === undefined ? [] : [{ name: "tests", outcome: lu }, { name: "types", outcome: "green" }];
    },
    commentaires: async (numero) => [...(commentaires[numero] ?? []), ...ecrits.filter(([n]) => n === numero).map(([, body]) => body)].map((body) => ({ body, association: "OWNER" })),
    commenter: async (numero, corps) => {
      if (client.echecDuCommentaire !== undefined) throw client.echecDuCommentaire;
      ecrits.push([numero, corps]);
    },
    delabelliser: async (numero, label) => {
      retires.push([numero, label]);
    },
  };
  return { client, ecrits, retires };
}

const pr = (ticket: number, sha = SHA, branche = brancheDuTicket(ticket)): PROuverte => ({ number: 100 + ticket, branche, sha });

test("only a cook/<n>-github branch names a ticket", () => {
  assert.equal(ticketDeLaBranche("cook/2908-github"), 2908);
  for (const branche of ["cook/2908-local", "cook/autre", "feature/2908-github", "cook/2908-github-bis", "cook/-github"]) assert.equal(ticketDeLaBranche(branche), null, branche);
});

test("a red CI on a cook/<n>-github PR with no cook on it and held for the chef goes back to a cook: a send-back on the issue, the chef's hold lifted", async () => {
  const { client, ecrits, retires } = github({ [SHA]: "red" });
  const bilan = await renvoyerLesCiRouges({ github: client, station: "box/claude", prs: [pr(30)], tickets: [{ number: 30, labels: [...CALIBRE, "blocked-on-human", "chef-todo"] }], enCuisine: new Set() });
  assert.deepEqual(bilan, { renvoyes: [{ ticket: 30, pr: 130, leves: ["blocked-on-human", "chef-todo"] }], echecs: [] });
  assert.deepEqual(retires, [[30, "blocked-on-human"], [30, "chef-todo"]]);
  assert.equal(ecrits.length, 1);
  const [[numero, corps]] = ecrits as [[number, string]];
  assert.equal(numero, 30);
  // Un renvoi comme ceux du pass : sa marque, sa tête, sa cause, les checks rouges — et aucune carte du chef.
  assert.match(corps, new RegExp(`^<!-- brigade:renvoi n=1 sha=${SHA} ci-rouge -->\\nStation \`box/claude\`: sent back to a cook — the CI is red on \`aaaaaaa\`: tests\\n`));
  assert.doesNotMatch(corps, /tests, types/);
  assert.doesNotMatch(corps, /brigade:todo/);
});

test("a red CI on a free ticket is left to the cook who takes it: nothing holds it for the chef", async () => {
  const { client, ecrits, retires } = github({ [SHA]: "red" });
  const bilan = await renvoyerLesCiRouges({ github: client, station: "box/claude", prs: [pr(31)], tickets: [{ number: 31, labels: CALIBRE }], enCuisine: new Set() });
  assert.deepEqual(bilan, { renvoyes: [], echecs: [] });
  assert.deepEqual([ecrits, retires], [[], []]);
});

test("a red CI with a cook on it — cooking here, taken, in the pass — is not sent back", async () => {
  const { client, ecrits, retires } = github({ [SHA]: "red" });
  const bilan = await renvoyerLesCiRouges({
    github: client,
    station: "box/claude",
    prs: [pr(40), pr(41), pr(42)],
    tickets: [
      { number: 40, labels: [...CALIBRE, "blocked-on-human"] },
      { number: 41, labels: [...CALIBRE, "taken"] },
      { number: 42, labels: [...CALIBRE, "in-pass"] },
    ],
    enCuisine: new Set([40]),
  });
  assert.deepEqual(bilan, { renvoyes: [], echecs: [] });
  assert.deepEqual([ecrits, retires], [[], []]);
});

test("a head already sent back by this path is not sent back a second time", async () => {
  const { client, ecrits } = github({ [SHA]: "red" });
  const options = { github: client, station: "box/claude", prs: [pr(30)], tickets: [{ number: 30, labels: [...CALIBRE, "blocked-on-human"] }], enCuisine: new Set<number>() };
  assert.equal((await renvoyerLesCiRouges(options)).renvoyes.length, 1);
  // Le ticket est retenu de nouveau sur la même tête : il ne repart pas.
  assert.equal((await renvoyerLesCiRouges(options)).renvoyes.length, 0);
  assert.equal(ecrits.length, 1);
});

test("a held ticket sent back by the pass on that head, then held again for the chef, still goes back to a cook once", async () => {
  const { client, ecrits } = github({ [SHA]: "red" }, { 30: [`<!-- brigade:renvoi n=1 sha=${SHA} -->\nStation \`box/claude\`: sent back to a cook (1/2) — the CI is red`] });
  const bilan = await renvoyerLesCiRouges({ github: client, station: "box/claude", prs: [pr(30)], tickets: [{ number: 30, labels: [...CALIBRE, "blocked-on-human"] }], enCuisine: new Set() });
  assert.deepEqual(bilan.renvoyes, [{ ticket: 30, pr: 130, leves: ["blocked-on-human"] }]);
  assert.match(ecrits[0]?.[1] ?? "", /^<!-- brigade:renvoi n=2 /);
});

test("a green, pending or check-less CI is left alone", async () => {
  const [vert, enCours, sans] = ["b", "c", "d"].map((c) => c.repeat(40)) as [string, string, string];
  const { client, ecrits, retires } = github({ [vert]: "green", [enCours]: "pending" });
  const bilan = await renvoyerLesCiRouges({
    github: client,
    station: "box/claude",
    prs: [pr(30, vert), pr(31, enCours), pr(32, sans)],
    tickets: [30, 31, 32].map((number) => ({ number, labels: [...CALIBRE, "blocked-on-human"] })),
    enCuisine: new Set(),
  });
  assert.deepEqual(bilan, { renvoyes: [], echecs: [] });
  assert.deepEqual([ecrits, retires], [[], []]);
});

test("a PR on a branch that is not cook/<n>-github, or whose ticket is off the rail, set aside or waiting, is left alone", async () => {
  const { client, ecrits, retires } = github({ [SHA]: "red" });
  const bilan = await renvoyerLesCiRouges({
    github: client,
    station: "box/claude",
    prs: [pr(30, SHA, "feature/30"), pr(30, SHA, "cook/30-local"), pr(50), pr(51), pr(52), pr(53)],
    tickets: [
      { number: 30, labels: [...CALIBRE, "blocked-on-human"] },
      { number: 51, labels: [...CALIBRE, "served-elsewhere"] },
      { number: 52, labels: [...CALIBRE, "waiting"] },
      { number: 53, labels: ["fire"], epique: true },
    ],
    enCuisine: new Set(),
  });
  assert.deepEqual(bilan, { renvoyes: [], echecs: [] });
  assert.deepEqual([ecrits, retires], [[], []]);
});

test("a CI that cannot be read, or a head the client does not give, sends nothing back and says so; the other PRs are still examined", async () => {
  const autre = "e".repeat(40);
  const { client, ecrits } = github({ [SHA]: new Error("HTTP 502"), [autre]: "red" });
  const bilan = await renvoyerLesCiRouges({
    github: client,
    station: "box/claude",
    prs: [pr(30), { branche: brancheDuTicket(31), number: 131 }, pr(32, autre)],
    tickets: [30, 31, 32].map((number) => ({ number, labels: [...CALIBRE, "blocked-on-human"] })),
    enCuisine: new Set(),
  });
  assert.deepEqual(bilan.echecs, [
    { ticket: 30, pr: 130, message: "HTTP 502" },
    { ticket: 31, pr: 131, message: "the head of the open PR on `cook/31-github` is not known: its CI is not read" },
  ]);
  assert.deepEqual(bilan.renvoyes, [{ ticket: 32, pr: 132, leves: ["blocked-on-human"] }]);
  assert.equal(ecrits.length, 1);
});

test("a send-back whose comment is lost still frees the ticket for a cook, and says the failure", async () => {
  const { client, ecrits, retires } = github({ [SHA]: "red" });
  client.echecDuCommentaire = new Error("HTTP 403 rate limit");
  const bilan = await renvoyerLesCiRouges({ github: client, station: "box/claude", prs: [pr(30)], tickets: [{ number: 30, labels: [...CALIBRE, "blocked-on-human", "chef-todo"] }], enCuisine: new Set() });
  assert.deepEqual(bilan, { renvoyes: [], echecs: [{ ticket: 30, pr: 130, message: "HTTP 403 rate limit" }] });
  assert.deepEqual(retires, [[30, "blocked-on-human"], [30, "chef-todo"]]);
  assert.deepEqual(ecrits, []);
});

// Le tour de la station, de bout en bout : la guérison renvoie la PR rouge,
// et le même tour la donne à un cook.
function station(casser: Partial<GitHubDuTour> = {}) {
  const faux = new FauxGitHub();
  const bas = faux.pour("box/claude");
  const avertis: string[] = [];
  const github: GitHubDuTour = {
    ...bas,
    // Le vrai client dit le numéro et la tête de chaque PR ouverte.
    prsOuvertes: async () => faux.prs.filter((p) => p.state === "open").map((p) => ({ number: p.number, branche: p.branche, fichiers: [...p.fichiers], sha: p.sha })),
    ...casser,
  };
  const tour = stationGitHub({
    nom: "box/claude",
    places: 1,
    base: "main",
    github,
    prise: faux.prise(github, "box/claude"),
    cuisiner: async (ticket) => {
      faux.cuissons.push({ station: "box/claude", issue: ticket.number });
      return { reste: "still at work" };
    },
    juger: async () => ({ verdict: "approve", motif: "" }),
    avertir: (texte) => avertis.push(texte),
  });
  const passer = async () => {
    await tour.tour();
    await tour.calme();
    await tour.relu();
  };
  return { faux, avertis, passer };
}

// Le cas de #2908 : la livraison rouge, son ticket tenu pour le chef par une carte « merge it ».
function rougeTenueParLeChef(faux: FauxGitHub, ticket: number) {
  faux.feu(ticket, [...CALIBRE, "blocked-on-human", "chef-todo"]);
  faux.poster(ticket, "box/claude", `${CARTE}\nThe delivery of #${ticket} is green, but the kitchen does not merge it: a gesture only the chef can make.`);
  const pr = { number: 100 + ticket, issue: ticket, branche: brancheDuTicket(ticket), sha: faux.sha(), state: "open" as const, merged: false, enRetard: false, mergeePar: null, fichiers: [] };
  faux.prs.push(pr);
  faux.ciRouge.add(pr.number);
  return pr;
}

test("one turn of the station sends a red cook PR with no cook on it back to a cook, and puts no chef TODO card on it", async () => {
  const { faux, avertis, passer } = station();
  const pr = rougeTenueParLeChef(faux, 30);
  // Sur une autre branche, la même CI rouge ne bouge rien.
  const etrangere = faux.prOuverte([], "feature/rouge");
  faux.ciRouge.add(etrangere.number);
  await passer();
  const dits = (faux.commentaires.get(30) ?? []).map((c) => c.body);
  assert.ok(dits.some((c) => c.startsWith(`<!-- brigade:renvoi n=1 sha=${pr.sha} ci-rouge -->`)), avertis.join("\n"));
  // Aucune carte du chef : le label est tombé, et la seule carte est celle d'avant.
  assert.ok(!faux.ticket(30).labels.has("chef-todo"));
  assert.ok(!faux.ticket(30).labels.has("blocked-on-human"));
  assert.equal(dits.filter((c) => c.startsWith("<!-- brigade:todo")).length, 1);
  // Un cook l'a pris, au même tour.
  assert.deepEqual(faux.cuissons, [{ station: "box/claude", issue: 30 }]);
});

test("a station whose open PRs cannot be read says so, and its turn goes on", async () => {
  const { faux, avertis, passer } = station({
    prsOuvertes: async () => {
      throw new Error("HTTP 502");
    },
  });
  rougeTenueParLeChef(faux, 30);
  await passer();
  assert.ok(avertis.some((ligne) => /healing \(ci-rouge\) on box\/claude — HTTP 502/.test(ligne)), avertis.join("\n"));
  assert.ok(faux.ticket(30).labels.has("blocked-on-human"));
});
