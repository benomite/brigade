// Ce que le bandeau Backlog lit de GitHub (#3460, tableau/read.ts) : chaque besoin hors du rail, et pour un besoin
// découpé, ses tickets — la liste que le runtime écrit dans son corps, et les issues ouvertes qui se réclament de lui —,
// ceux d'entre eux qui sont fermés, son contexte ; les tickets d'un découpage ne sont pas des besoins ; une épique
// découpée fermée depuis moins de 24 h, tous ses tickets servis, est encore lue. Une lecture des fermées qui rate n'en
// montre aucune et laisse le reste se lire. Puis ce que amont.ts en garde, champ pour champ. Rien ne passe par le
// réseau : GitHub est une doublure, qui répond selon le chemin demandé.
import assert from "node:assert/strict";
import { test } from "node:test";
import { comprendre, COMMAND, voir } from "../../src/amont.ts";
import type { CallGitHub } from "../../src/tableau/client.ts";
import { contextDe, lireLeTableauDuRepository, type TableauLu } from "../../src/tableau/read.ts";
import { readDuTableau } from "../../src/tableau/rail.ts";

const REPOSITORY = "chef/parade";
const LU_LE = new Date("2026-11-13T12:00:00.000Z");
const LISTE = (tickets: number[]) => ["<!-- brigade:tickets -->", "| # | Title |", "|---|---|", ...tickets.map((t) => `| #${t} | Ticket ${t} |`), "<!-- /brigade:tickets -->"].join("\n");

type Brute = { number: number; title: string; labels: { name: string }[]; created_at: string; html_url: string; body?: string; state?: string; closed_at?: string };
const issue = (number: number, labels: string[], body = "", autres: Partial<Brute> = {}): Brute => ({
  number,
  title: `Issue ${number}`,
  labels: labels.map((name) => ({ name })),
  created_at: "2026-11-01T00:00:00Z",
  html_url: `https://github.com/${REPOSITORY}/issues/${number}`,
  body,
  ...autres,
});

// #7, une épique découpée en #20, #21, #22 (fermé) et #23 (fermé) — #20 au feu, #21 sans `fire` ; #24 se réclame de #7 sans
// être dans sa liste. #8, une épique pas découpée, avec son contexte. #9, une issue non lue.
const OUVERTES = [
  issue(7, ["epic", "prio:1"], `## Context\n\nGroups book in one gesture.\n\n${LISTE([20, 21, 22, 23])}`),
  issue(8, ["epic", "prio:2"], "Epic: #99\n\n## Context\nThe evening menu changes every night.\n\n## Acceptance criteria\n- a"),
  issue(9, []),
  issue(20, ["fire", "model:sonnet", "effort:low"], "Epic: #7\n\n<!-- brigade:decoupage #7.1 -->\n\n## Context\n\nOne ticket."),
  issue(21, ["model:sonnet", "effort:low"], "Epic: #7"),
  issue(24, [], "Epic: #7\n\nAdded by hand."),
];
// Les fermées depuis 24 h : #40, une épique découpée fermée il y a 23 h 59 — ses tickets #41 et #42 fermés ; #43, fermée
// il y a 2 h, dont le ticket #9 est encore ouvert ; #44, une issue fermée sans liste ; #45, fermée il y a 25 h.
const FERMEES = [
  issue(40, ["epic", "prio:2"], LISTE([41, 42]), { state: "closed", closed_at: "2026-11-12T12:01:00Z" }),
  issue(43, ["epic"], LISTE([9]), { state: "closed", closed_at: "2026-11-13T10:00:00Z" }),
  issue(44, [], "", { state: "closed", closed_at: "2026-11-13T10:00:00Z" }),
  issue(45, ["epic"], LISTE([46]), { state: "closed", closed_at: "2026-11-12T11:00:00Z" }),
];

function github(fermees: () => { status: number; data: unknown } = () => ({ status: 200, data: FERMEES })): { appeler: CallGitHub; chemins: string[] } {
  const chemins: string[] = [];
  return {
    chemins,
    appeler: async (chemin) => {
      chemins.push(chemin);
      if (chemin.includes("/issues?") && chemin.includes("labels=fire")) return { status: 200, data: OUVERTES.filter(({ labels }) => labels.some(({ name }) => name === "fire")) };
      if (chemin.includes("/issues?state=closed")) return fermees();
      if (chemin.includes("/issues?")) return { status: 200, data: OUVERTES };
      if (chemin.includes("/pulls?")) return { status: 200, data: [] };
      if (/\/issues\/\d+\/(comments|events)/.test(chemin)) return { status: 200, data: [] };
      return { status: 404, data: {} };
    },
  };
}

async function lire(appeler: CallGitHub): Promise<TableauLu> {
  const lu = await lireLeTableauDuRepository({ depot: REPOSITORY, appeler, maintenant: () => LU_LE });
  assert.ok(lu.lu, lu.lu ? "" : lu.raison);
  return lu;
}

test("un besoin découpé : ses tickets — sa liste et ceux qui se réclament de lui —, les fermés comptés servis ; ses tickets ne sont pas des besoins", async () => {
  const { appeler, chemins } = github();
  const lu = await lire(appeler);
  const issues = lu.avantLeRail?.issues ?? assert.fail("rien avant le rail");
  assert.deepEqual(issues.map(({ ticket, etat: state }) => [ticket, state]), [
    [7, "decoupee"],
    [8, "epique"],
    [40, "servie"],
    [9, "non-lue"],
  ]);
  const sept = issues.find(({ ticket }) => ticket === 7) ?? assert.fail("pas de #7");
  assert.deepEqual(sept.tickets, [20, 21, 22, 23, 24]);
  assert.deepEqual(sept.servis, [22, 23]);
  assert.equal(sept.dit, "split into 5 tickets, 2 served");
  assert.equal(sept.contexte, "Groups book in one gesture.");
  // Pas découpé : ni tickets ni servis ; son contexte, sous son titre.
  const huit = issues.find(({ ticket }) => ticket === 8) ?? assert.fail("pas de #8");
  assert.equal(huit.tickets, undefined);
  assert.equal(huit.contexte, "The evening menu changes every night.");
  // La lecture des fermées : depuis 24 h, une page.
  assert.ok(chemins.includes(`/repos/${REPOSITORY}/issues?state=closed&sort=updated&direction=desc&since=2026-11-12T12:00:00.000Z&per_page=100`), chemins.join("\n"));
});

test("une épique découpée fermée depuis moins de 24 h, tous ses tickets servis, est lue avec l'heure de sa fermeture ; ni une autre fermée, ni une plus vieille", async () => {
  const lu = await lire(github().appeler);
  const quarante = lu.avantLeRail?.issues.find(({ ticket }) => ticket === 40) ?? assert.fail("pas de #40");
  assert.deepEqual(quarante, { ticket: 40, titre: "Issue 40", priorite: 2, etat: "servie", dit: "split, all 2 tickets served", tickets: [41, 42], servis: [41, 42], servieLe: "2026-11-12T12:01:00Z" });
  assert.deepEqual(lu.avantLeRail?.issues.filter(({ ticket }) => [43, 44, 45].includes(ticket)), []);
});

test("une épique ouverte dont tous les tickets sont servis : marquée servie, sans heure — elle reste jusqu'à sa fermeture", async () => {
  const toutes = [issue(7, ["epic"], LISTE([22, 23]))];
  const lu = await lire(async (chemin) => (chemin.includes("/issues?state=closed") ? { status: 200, data: [] } : chemin.includes("/issues?") && !chemin.includes("labels=fire") ? { status: 200, data: toutes } : github().appeler(chemin)));
  assert.deepEqual(lu.avantLeRail?.issues.map(({ ticket, etat: state, servieLe: servedLe }) => [ticket, state, servedLe]), [[7, "servie", undefined]]);
});

test("la lecture des fermées rate : aucune n'est montrée, et les besoins ouverts se lisent", async () => {
  for (const fermees of [() => ({ status: 403, data: { message: "Forbidden" } }), () => ({ status: 200, data: { message: "odd" } })]) {
    const lu = await lire(github(fermees).appeler);
    assert.deepEqual(lu.avantLeRail?.issues.map(({ ticket }) => ticket), [7, 8, 9]);
  }
  const rate = await lire(async (chemin) => {
    if (chemin.includes("/issues?state=closed")) throw new Error("socket hang up");
    return github().appeler(chemin);
  });
  assert.deepEqual(rate.avantLeRail?.issues.map(({ ticket }) => ticket), [7, 8, 9]);
});

test("ce que amont.ts garde d'un besoin : ses tickets, ses servis, son contexte, sa fermeture — un champ qui n'a pas sa forme refuse tout", async () => {
  const lu = await lire(github().appeler);
  const vu = voir(readDuTableau(lu, "parade", 3, [COMMAND]));
  assert.ok("groupes" in vu, JSON.stringify(vu));
  const tous = vu.groupes.flatMap(({ issues }) => issues);
  const sept = tous.find(({ ticket }) => ticket === 7) ?? assert.fail("pas de #7");
  assert.deepEqual([sept.priorite, sept.tickets, sept.servis, sept.contexte], [1, [20, 21, 22, 23, 24], [22, 23], "Groups book in one gesture."]);
  assert.equal(tous.find(({ ticket }) => ticket === 40)?.servieLe, "2026-11-12T12:01:00Z");
  assert.deepEqual(vu.groupes.map(({ etat: state, nom: name }) => [state, name]), [["non-lue", "not read yet"], ["epique", "epic, not split yet"], ["decoupee", "split into tickets"], ["servie", "served"]]);

  const une = { ticket: 3, titre: "t", url: "https://github.com/x/y/issues/3", priorite: 2, etat: "decoupee", dit: "d" };
  assert.deepEqual(comprendre(JSON.stringify({ lu: "x", depot: REPOSITORY, issues: [{ ...une, tickets: [4], servis: [], contexte: "c", servieLe: "s" }] })), { lu: "x", depot: REPOSITORY, issues: [{ ...une, tickets: [4], servis: [], contexte: "c", servieLe: "s" }] });
  assert.deepEqual(comprendre(JSON.stringify({ lu: "x", depot: REPOSITORY, issues: [{ ...une, tickets: ["4"] }] })), { informe: "“issues[0].tickets[0]” is not a non-negative integer" });
  assert.deepEqual(comprendre(JSON.stringify({ lu: "x", depot: REPOSITORY, issues: [{ ...une, servis: 4 }] })), { informe: "“issues[0].servis” is not a list" });
  assert.deepEqual(comprendre(JSON.stringify({ lu: "x", depot: REPOSITORY, issues: [{ ...une, contexte: 1 }] })), { informe: "“issues[0].contexte” is not a string" });
});

test("le contexte d'un besoin : le paragraphe sous `Context`, sinon le premier du corps — jamais un titre, une ligne `Epic:`, un commentaire, la liste ou du code", () => {
  assert.equal(contextDe("## Context\n\nWhy it matters.\n\n## Done when\n\n- x"), "Why it matters.");
  assert.equal(contextDe("## Context\nOn the next line.\n\nOther."), "On the next line.");
  assert.equal(contextDe("Epic: #3\n\n<!-- brigade:decoupage #3.1 -->\n\n# Title\n\n```sh\nnpm test\n```\n\nThe first   real\nparagraph."), "The first real paragraph.");
  assert.equal(contextDe(`${LISTE([1, 2])}\n\nAfter the list.`), "After the list.");
  assert.equal(contextDe(""), undefined);
  assert.equal(contextDe("## Context\n\n## Next"), undefined);
  const long = contextDe(`${"word ".repeat(100)}end`) ?? assert.fail("pas de contexte");
  assert.ok(long.length <= 401 && long.endsWith("word…"), long);
});

test("les fermées ne se relisent que quand les ouvertes changent de numéros — une épique ou un ticket qui se ferme quitte la liste ; un échec ne se garde pas", async () => {
  const memoire = new Map();
  let ouvertes = OUVERTES;
  let fermeesLues = 0;
  let rate = false;
  const appeler: CallGitHub = async (chemin) => {
    if (chemin.includes("/issues?state=closed")) {
      fermeesLues++;
      return rate ? { status: 500, data: {} } : { status: 200, data: FERMEES };
    }
    if (chemin.includes("/issues?") && !chemin.includes("labels=fire")) return { status: 200, data: ouvertes };
    return github().appeler(chemin);
  };
  const lire = () => lireLeTableauDuRepository({ depot: REPOSITORY, appeler, memoire, maintenant: () => LU_LE });
  const first = await lire();
  assert.ok(first.lu);
  assert.equal(fermeesLues, 1);
  // Les mêmes numéros ouverts — un label a changé : les fermées gardées, et #40 toujours là.
  ouvertes = OUVERTES.map((issue) => (issue.number === 9 ? { ...issue, labels: [{ name: "prio:3" }] } : issue));
  const seconde = await lire();
  assert.equal(fermeesLues, 1);
  assert.ok(seconde.lu && seconde.avantLeRail?.issues.some(({ ticket }) => ticket === 40));
  // #9 se ferme : la liste change, les fermées se relisent — et l'échec ne se garde pas : la lecture suivante réessaie.
  ouvertes = OUVERTES.filter(({ number }) => number !== 9);
  rate = true;
  const troisieme = await lire();
  assert.equal(fermeesLues, 2);
  assert.ok(troisieme.lu && !troisieme.avantLeRail?.issues.some(({ ticket }) => ticket === 40));
  rate = false;
  const quatrieme = await lire();
  assert.equal(fermeesLues, 3);
  assert.ok(quatrieme.lu && quatrieme.avantLeRail?.issues.some(({ ticket }) => ticket === 40));
});

// Le Backlog du chef (#3589) : une idée en réserve a son propre état ; la roadmap n'est jamais une ligne.
const avecOuvertes = (ouvertes: Brute[], contenu?: () => Promise<{ status: number; data: unknown }>): CallGitHub => async (chemin) => {
  if (chemin === `/repos/${REPOSITORY}/contents/CLAUDE.md` && contenu !== undefined) return contenu();
  if (chemin.includes("/issues?state=closed")) return { status: 200, data: [] };
  if (chemin.includes("/issues?") && !chemin.includes("labels=fire")) return { status: 200, data: ouvertes };
  return github().appeler(chemin);
};
const claudeMd = (texte: string) => async () => ({ status: 200, data: { content: Buffer.from(texte).toString("base64") } });

test("une issue au label `idea` est une idée en réserve, quels que soient ses autres labels ; une liste dans son corps ne la découpe pas", async () => {
  const lu = await lire(avecOuvertes([issue(30, ["idea", "model:opus", "effort:low", "epic"], "## Context\n\nA loyalty card."), issue(31, ["idea"], LISTE([9])), issue(9, [])]));
  assert.deepEqual(lu.avantLeRail?.issues.map(({ ticket, etat: state, tickets }) => [ticket, state, tickets]), [
    [9, "non-lue", undefined],
    [30, "idee", undefined],
    [31, "idee", undefined],
  ]);
  assert.equal(lu.avantLeRail?.issues.find(({ ticket }) => ticket === 30)?.contexte, "A loyalty card.");
  const vu = voir(readDuTableau(lu, "parade", 3, [COMMAND]));
  assert.ok("groupes" in vu, JSON.stringify(vu));
  assert.deepEqual(vu.groupes.map(({ etat: state, nom: name }) => [state, name]), [["non-lue", "not read yet"], ["idee", "ideas in reserve"]]);
});

test("la roadmap n'est pas un besoin : l'issue au label `roadmap`, ou celle que la ligne « Roadmap » du CLAUDE.md nomme — ce qu'elle liste reste chacun son besoin", async () => {
  const ouvertes = [issue(1, [], LISTE([9])), issue(2, ["roadmap"], LISTE([21])), issue(9, []), issue(21, ["model:sonnet", "effort:low"])];
  const lu = await lire(avecOuvertes(ouvertes, claudeMd("## Équipe\n\n- **Roadmap** : issue #1 (writer unique = Manager)\n")));
  assert.deepEqual(lu.avantLeRail?.issues.map(({ ticket, etat: state }) => [ticket, state]), [
    [9, "non-lue"],
    [21, "prete"],
  ]);
});

test("un CLAUDE.md sans ligne « Roadmap », absent ou illisible ne nomme aucune roadmap : rien n'est écarté sur une supposition — le label `roadmap` écarte toujours —, et le reste se lit", async () => {
  const ouvertes = [issue(1, [], LISTE([9])), issue(2, ["roadmap"]), issue(9, [])];
  for (const contenu of [claudeMd("- **Doc vivante** : `docs/` — see issue #1"), async () => ({ status: 404, data: { message: "Not Found" } }), async () => ({ status: 200, data: { content: 7 } }), async () => Promise.reject(new Error("socket hang up"))]) {
    let request = false;
    const lu = await lire(avecOuvertes(ouvertes, async () => {
      request = true;
      return contenu();
    }));
    assert.ok(request, "le CLAUDE.md est demandé à GitHub");
    assert.deepEqual(lu.avantLeRail?.issues.map(({ ticket, etat: state }) => [ticket, state]), [[1, "decoupee"]]);
  }
});
