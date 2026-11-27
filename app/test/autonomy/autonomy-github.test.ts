// La lecture des chiffres d'autonomie sur GitHub (#3222) : les PR fermées, puis les événements et les commentaires de
// l'issue de chaque ticket servi sur 30 jours — rien d'autre, aucun fichier de ce poste. Un dépôt lu se garde dix minutes
// et sert aux deux périodes ; un dépôt qui ne se lit pas est nommé ; aucun lu, la lecture le dit sans chiffre.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { CallGitHub } from "../../src/board/client.ts";
import { readTheAutonomyOfRepository, WITHOUT_READ, holdTheAutonomy } from "../../src/vue/autonomy/autonomy-github.ts";

const NOW = new Date("2026-11-11T12:00:00.000Z");
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
const it = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

// Le dépôt « chef/parade » tel que GitHub le rend : #12 servi il y a 2 jours, bloqué sur le chef ; #13 servi il y a 20 jours,
// renvoyé une fois ; une PR mergée il y a 40 jours, hors de toute période ; une PR fermée sans merge.
const PULLS = [
  { number: 40, title: "#12 — Badge colours", merged_at: it(2 * DAY), updated_at: it(2 * DAY), head: { ref: "cook/12-github" }, body: "Closes #12", html_url: "https://github.com/chef/parade/pull/40" },
  { number: 41, title: "#13 — Faster rail", merged_at: it(20 * DAY), updated_at: it(20 * DAY), head: { ref: "cook/13-github" }, body: "Closes #13", html_url: "https://github.com/chef/parade/pull/41" },
  { number: 42, title: "#14 — Not merged", merged_at: null, updated_at: it(20 * DAY), head: { ref: "cook/14-github" }, body: "Closes #14", html_url: "https://github.com/chef/parade/pull/42" },
  { number: 9, title: "#5 — Old", merged_at: it(40 * DAY), updated_at: it(40 * DAY), head: { ref: "cook/5-github" }, body: "Closes #5", html_url: "https://github.com/chef/parade/pull/9" },
];
const EVENTS: Record<number, object[]> = {
  12: [
    { event: "labeled", label: { name: "fire" }, created_at: it(2 * DAY + 5 * HOUR) },
    { event: "labeled", label: { name: "blocked-on-human" }, created_at: it(2 * DAY + 3 * HOUR) },
  ],
  13: [{ event: "labeled", label: { name: "fire" }, created_at: it(20 * DAY + HOUR) }],
};
const COMMENTS: Record<number, object[]> = {
  12: [{ body: "**Question for the chef (design):** which badge colour?", created_at: it(2 * DAY + 3 * HOUR + 1000), author_association: "OWNER" }],
  13: [{ body: "<!-- brigade:renvoi n=1 sha=a -->\nsent back", created_at: it(20 * DAY + HOUR / 2), author_association: "OWNER" }],
};

// Ses défauts échappés (#3515), vides par défaut : ses issues `bug`, les commits que trouve la recherche, les PR de chaque
// commit reverté — un commit absent, GitHub répond 422.
type DefaultsOfFake = { bugs?: object[]; reverts?: object[]; prs?: Record<string, object[]> };
function github(repository = "chef/parade", defaults: DefaultsOfFake = {}) {
  const paths: string[] = [];
  const call: CallGitHub = async (path) => {
    paths.push(path);
    const ok = (data: unknown) => ({ status: 200, data });
    if (path.startsWith(`/repos/${repository}/pulls?state=closed`)) return ok(path.includes("page=1") ? PULLS : []);
    if (path.startsWith(`/repos/${repository}/issues?state=all&labels=bug&`)) return ok(path.includes("&page=1") ? (defaults.bugs ?? []) : []);
    if (path.startsWith("/search/commits?")) return ok({ total_count: 0, incomplete_results: false, items: path.includes("&page=1") ? (defaults.reverts ?? []) : [] });
    const pullsOfCommit = new RegExp(`^/repos/${repository}/commits/([0-9a-f]+)/pulls$`).exec(path);
    if (pullsOfCommit !== null) return defaults.prs?.[pullsOfCommit[1]!] === undefined ? { status: 422, data: { message: "No commit found for SHA" } } : ok(defaults.prs[pullsOfCommit[1]!]);
    const issue = /\/issues\/(\d+)\/(events|comments)\?/.exec(path);
    if (issue !== null) return ok(path.includes("page=1") ? ((issue[2] === "events" ? EVENTS : COMMENTS)[Number(issue[1])] ?? []) : []);
    return { status: 404, data: {} };
  };
  return { chemins: paths, appeler: call };
}

describe("les chiffres d'autonomie lus de GitHub (#3222)", () => {
  test("un dépôt se lit de ses PR fermées et des issues de ses tickets servis sur 30 jours, rien d'autre", async () => {
    const { chemins: paths, appeler: call } = github();
    const data = await readTheAutonomyOfRepository({ depot: "chef/parade", appeler: call, maintenant: NOW });
    assert.deepEqual(data.servis.map(({ ticket }) => ticket), [12, 13]);
    assert.deepEqual(Object.keys(data.issues).sort(), ["12", "13"]);
    assert.deepEqual(paths.filter((path) => !path.includes("/pulls?") && !path.includes("labels=bug") && !path.startsWith("/search/commits?")).sort(), [
      "/repos/chef/parade/issues/12/comments?per_page=100&page=1",
      "/repos/chef/parade/issues/12/events?per_page=100&page=1",
      "/repos/chef/parade/issues/13/comments?per_page=100&page=1",
      "/repos/chef/parade/issues/13/events?per_page=100&page=1",
    ]);
  });

  test("les deux périodes, du projet et de tous, se calculent d'une seule lecture, gardée dix minutes", async () => {
    const { chemins: paths, appeler: call } = github();
    let instant = NOW;
    const autonomy = holdTheAutonomy({ lire: (repository) => readTheAutonomyOfRepository({ depot: repository, appeler: call, maintenant: instant }), fraicheurMs: 10 * 60_000, maintenant: () => instant });
    const projects = [{ nom: "parade", depot: "chef/parade" }];
    const week = await autonomy.chiffres(projects, 7);
    const month = await autonomy.chiffres(projects, 30);
    assert.ok("chiffres" in week && "chiffres" in month);
    assert.deepEqual([week.chiffres.tickets, week.chiffres.partSansHumain, week.chiffres.delaiMedianMs, week.chiffres.partRenvoyee], [1, 0, 5 * HOUR, 0]);
    assert.deepEqual([month.chiffres.tickets, month.chiffres.partSansHumain, month.chiffres.delaiMedianMs, month.chiffres.partRenvoyee], [2, 0.5, 3 * HOUR, 0.5]);
    assert.deepEqual(month.chiffres.avecHumain.map(({ projet: project, ticket, titre: title, questions }) => ({ projet: project, ticket, titre: title, questions })), [{ projet: "parade", ticket: 12, titre: "Badge colours", questions: ["Question for the chef (design): which badge colour?"] }]);
    const readOnes = paths.length;
    instant = new Date(NOW.getTime() + 9 * 60_000);
    await autonomy.chiffres(projects, 7);
    assert.equal(paths.length, readOnes);
    instant = new Date(NOW.getTime() + 10 * 60_000);
    await autonomy.chiffres(projects, 7);
    assert.ok(paths.length > readOnes);
  });

  test("un dépôt qui ne se lit pas est nommé, les autres comptent ; aucun lu, pas de chiffre ; l'échec ne se garde pas", async () => {
    const calls: Record<string, CallGitHub> = { "chef/parade": github().appeler, "chef/cantine": github("chef/cantine").appeler };
    let enOutage = true;
    const autonomy = holdTheAutonomy({
      lire: (repository) => (repository === "chef/cantine" && enOutage ? Promise.reject(new Error("GitHub answered HTTP 502")) : readTheAutonomyOfRepository({ depot: repository, appeler: calls[repository]!, maintenant: NOW })),
      fraicheurMs: 10 * 60_000,
      maintenant: () => NOW,
    });
    const all = await autonomy.chiffres([{ nom: "parade", depot: "chef/parade" }, { nom: "cantine", depot: "chef/cantine" }], 30);
    assert.ok("chiffres" in all);
    assert.deepEqual(all.manquants, [{ projet: "cantine", raison: "GitHub answered HTTP 502" }]);
    assert.equal(all.chiffres.tickets, 2);
    const only = await autonomy.chiffres([{ nom: "cantine", depot: "chef/cantine" }], 7);
    assert.deepEqual(only, { jours: 7, sans: WITHOUT_READ, detail: "cantine: GitHub answered HTTP 502" });
    enOutage = false;
    const resumption = await autonomy.chiffres([{ nom: "cantine", depot: "chef/cantine" }], 7);
    assert.ok("chiffres" in resumption);
  });

  test("une réponse de GitHub qui n'est pas 200 fait échouer la lecture du dépôt quand rien n'a pu se lire, jamais des chiffres sans ses tickets", async () => {
    const { appeler: call } = github();
    const enOutage: CallGitHub = (path) => (path.includes("/issues/") ? Promise.resolve({ status: 403, data: {} }) : call(path));
    await assert.rejects(readTheAutonomyOfRepository({ depot: "chef/parade", appeler: enOutage, maintenant: NOW }), /HTTP 403/);
  });

  test("une période qui n'est pas offerte n'est pas calculée", async () => {
    const autonomy = holdTheAutonomy({ lire: () => Promise.reject(new Error("not read")), fraicheurMs: 1 });
    assert.deepEqual(await autonomy.chiffres([], 3), { jours: 3, sans: WITHOUT_READ, detail: "no such period: 3 days" });
    assert.deepEqual(await autonomy.chiffres([], 7), { jours: 7, sans: WITHOUT_READ, detail: "no project to read" });
  });

  // Un dépôt de 1 334 PR mergées en 30 jours (#3379), une par ticket, servies 100 par page, la plus récemment mise à jour d'abord.
  const MERGEES = 1334;
  const bigRepository = (options: { panneAPartirDeLaPage?: number; ticketEnPanne?: number } = {}) => {
    const prs = Array.from({ length: MERGEES }, (_, i) => {
      const when = it(((i + 1) * 30 * DAY) / (MERGEES + 1));
      return { number: 1000 + i, title: `#${i + 1} — Ticket ${i + 1}`, merged_at: when, updated_at: when, head: { ref: `cook/${i + 1}-github` }, body: `Closes #${i + 1}`, html_url: `https://github.com/chef/gros/pull/${1000 + i}` };
    });
    const paths: string[] = [];
    const call: CallGitHub = async (path) => {
      paths.push(path);
      const ok = (data: unknown) => ({ status: 200, data });
      if (path.startsWith("/repos/chef/gros/pulls?state=closed")) {
        const page = Number(/&page=(\d+)/.exec(path)![1]);
        if (options.panneAPartirDeLaPage !== undefined && page >= options.panneAPartirDeLaPage) return { status: 403, data: {} };
        return ok(prs.slice((page - 1) * 100, page * 100));
      }
      const issue = /\/issues\/(\d+)\/(events|comments)\?/.exec(path);
      if (issue !== null) {
        if (Number(issue[1]) === options.ticketEnPanne) return { status: 403, data: {} };
        const ticket = Number(issue[1]);
        const early = Date.parse(prs[ticket - 1]!.merged_at) - 2 * HOUR;
        return ok(path.includes("page=1") && issue[2] === "events" ? [{ event: "labeled", label: { name: "fire" }, created_at: new Date(early).toISOString() }] : []);
      }
      return { status: 404, data: {} };
    };
    return { chemins: paths, appeler: call };
  };

  test("plus de 1 000 PR mergées sur la période : chaque ticket des 30 jours est compté, la période est entière", async () => {
    const { appeler: call } = bigRepository();
    const autonomy = holdTheAutonomy({ lire: (repository, readEntries) => readTheAutonomyOfRepository({ depot: repository, appeler: call, maintenant: NOW, lues: readEntries }), fraicheurMs: 10 * 60_000, maintenant: () => NOW });
    const month = await autonomy.chiffres([{ nom: "gros", depot: "chef/gros" }], 30);
    assert.ok("chiffres" in month);
    assert.equal(month.chiffres.tickets, MERGEES);
    assert.deepEqual(month.partiels, []);
    assert.equal(month.chiffres.delaiMedianMs, 2 * HOUR);
  });

  test("une page de PR qui ne se lit pas : les chiffres ne portent que sur ce qui est lu, et la lecture dit depuis quand", async () => {
    const { appeler: call } = bigRepository({ panneAPartirDeLaPage: 8 });
    const autonomy = holdTheAutonomy({ lire: (repository, readEntries) => readTheAutonomyOfRepository({ depot: repository, appeler: call, maintenant: NOW, lues: readEntries }), fraicheurMs: 10 * 60_000, maintenant: () => NOW });
    const month = await autonomy.chiffres([{ nom: "gros", depot: "chef/gros" }], 30);
    assert.ok("chiffres" in month);
    assert.equal(month.chiffres.tickets, 699);
    assert.equal(month.partiels.length, 1);
    assert.equal(month.partiels[0]!.projet, "gros");
    assert.match(month.partiels[0]!.raison, /HTTP 403/);
    assert.equal(month.partiels[0]!.depuis, new Date(NOW.getTime() - (700 * 30 * DAY) / (MERGEES + 1)).toISOString());
    // La semaine est entière dans ce qui est lu : aucune mention.
    const week = await autonomy.chiffres([{ nom: "gros", depot: "chef/gros" }], 7);
    assert.ok("chiffres" in week);
    assert.deepEqual(week.partiels, []);
  });

  test("une première page de PR qui ne se lit pas fait échouer la lecture : rien n'est lu", async () => {
    const { appeler: call } = bigRepository({ panneAPartirDeLaPage: 1 });
    await assert.rejects(readTheAutonomyOfRepository({ depot: "chef/gros", appeler: call, maintenant: NOW }), /HTTP 403/);
  });

  test("un ticket dont l'issue ne se lit pas borne la période lue : les plus anciens sont laissés de côté, dits, jamais comptés sans leur issue", async () => {
    const { appeler: call } = bigRepository({ ticketEnPanne: 600 });
    const data = await readTheAutonomyOfRepository({ depot: "chef/gros", appeler: call, maintenant: NOW });
    assert.ok(data.partiel !== null);
    assert.match(data.partiel.raison, /HTTP 403/);
    assert.ok(data.servis.length < MERGEES);
    assert.ok(data.servis.every(({ livre: delivers }) => Date.parse(delivers) > Date.parse(data.partiel!.depuis)));
    assert.ok(data.servis.every(({ ticket }) => data.issues[ticket] !== undefined));
    assert.ok(!data.servis.some(({ ticket }) => ticket === 600));
  });

  test("rouvrir le bloc ne relit aucune issue déjà lue, même après la fraîcheur du dépôt", async () => {
    const { chemins: paths, appeler: call } = github();
    let instant = NOW;
    const autonomy = holdTheAutonomy({ lire: (repository, readEntries) => readTheAutonomyOfRepository({ depot: repository, appeler: call, maintenant: instant, lues: readEntries }), fraicheurMs: 10 * 60_000, maintenant: () => instant });
    const projects = [{ nom: "parade", depot: "chef/parade" }];
    await autonomy.chiffres(projects, 30);
    const issues = () => paths.filter((path) => path.includes("/issues/")).length;
    assert.equal(issues(), 4);
    instant = new Date(NOW.getTime() + 11 * 60_000);
    const rereadOne = await autonomy.chiffres(projects, 30);
    assert.ok("chiffres" in rereadOne);
    assert.equal(rereadOne.chiffres.tickets, 2);
    assert.equal(issues(), 4);
    assert.equal(paths.filter((path) => path.includes("/pulls?")).length, 2);
  });

  // Les défauts échappés de « chef/parade » (#3515) : #50 cite #12 après son merge, #51 cite #13 ; a1… revert un commit de la
  // PR de #12, c4… un de #13 ; b2… un commit que GitHub ne connaît pas, d3… celui d'une PR jamais mergée.
  const sha = (sign: string) => sign.repeat(20);
  const revert = (of: string, target: string, hours: number) => ({ sha: sha(of), commit: { message: `Revert "x"\n\nThis reverts commit ${sha(target)}.`, committer: { date: it(hours * HOUR) } } });
  const DEFAULTS: DefaultsOfFake = {
    bugs: [
      { number: 50, title: "Grey badges", body: "Since #12 the badges are grey.", created_at: it(DAY), labels: [{ name: "bug" }], html_url: "https://github.com/chef/parade/issues/50" },
      { number: 51, title: "Rail slower", body: "Since #13.", created_at: it(10 * DAY), labels: [{ name: "bug" }], html_url: "https://github.com/chef/parade/issues/51" },
    ],
    reverts: [revert("a1", "c1", 1), revert("b2", "c2", 2), revert("d3", "c3", 3), revert("e4", "c4", 4)],
    prs: {
      [sha("c1")]: [{ number: 40, merged_at: it(2 * DAY), head: { ref: "cook/12-github" }, body: "Closes #12" }],
      [sha("c3")]: [{ number: 42, merged_at: null, head: { ref: "cook/14-github" }, body: "Closes #14" }],
      [sha("c4")]: [{ number: 41, merged_at: it(20 * DAY), head: { ref: "cook/13-github" }, body: "Closes #13" }],
    },
  };
  const parade = [{ nom: "parade", depot: "chef/parade" }];
  const autonomyOf = (call: CallGitHub, instant = () => NOW) =>
    holdTheAutonomy({ lire: (repository, readEntries) => readTheAutonomyOfRepository({ depot: repository, appeler: call, maintenant: instant(), lues: readEntries }), fraicheurMs: 10 * 60_000, maintenant: instant });
  const defaultsSaid = async (autonomy: ReturnType<typeof holdTheAutonomy>, days: number) => {
    const readEntry = await autonomy.chiffres(parade, days);
    assert.ok("chiffres" in readEntry);
    const { bugsEchappes: bugsEscaped, reverts, defautsNonLus: defaultsNotRead } = readEntry.chiffres;
    return { bugs: bugsEscaped?.map(({ projet: project, bug, tickets }) => ({ projet: project, bug, tickets })) ?? null, reverts: reverts?.map(({ projet: project, sha, tickets }) => ({ projet: project, sha, tickets })) ?? null, defautsNonLus: defaultsNotRead };
  };

  test("les défauts échappés se lisent des issues `bug` et des commits qui revertent de la branche par défaut, et des PR des commits revertés (#3515)", async () => {
    const { chemins: paths, appeler: call } = github("chef/parade", DEFAULTS);
    const autonomy = autonomyOf(call);
    assert.deepEqual(await defaultsSaid(autonomy, 7), { bugs: [{ projet: "parade", bug: 50, tickets: [12] }], reverts: [{ projet: "parade", sha: sha("a1"), tickets: [12] }], defautsNonLus: [] });
    assert.deepEqual(await defaultsSaid(autonomy, 30), {
      bugs: [{ projet: "parade", bug: 50, tickets: [12] }, { projet: "parade", bug: 51, tickets: [13] }],
      reverts: [{ projet: "parade", sha: sha("a1"), tickets: [12] }, { projet: "parade", sha: sha("e4"), tickets: [13] }],
      defautsNonLus: [],
    });
    const since = it(30 * DAY);
    assert.ok(paths.includes(`/repos/chef/parade/issues?state=all&labels=bug&since=${since}&per_page=100&page=1`));
    assert.ok(paths.includes(`/search/commits?q=${encodeURIComponent(`repo:chef/parade "This reverts commit" committer-date:>=${since.slice(0, 10)}`)}&per_page=100&page=1`));
    assert.deepEqual(paths.filter((path) => path.includes("/commits/")).sort(), [sha("c1"), sha("c2"), sha("c3"), sha("c4")].map((oneOf) => `/repos/chef/parade/commits/${oneOf}/pulls`));
  });

  test("des défauts qui ne se lisent pas : les autres chiffres comptent, aucun des deux nombres, la raison dite, et la lecture ne se garde pas (#3515)", async () => {
    const { chemins: paths, appeler: call } = github("chef/parade", DEFAULTS);
    let outage: "recherche" | "incomplete" | "pulls" | null = "recherche";
    const enOutage: CallGitHub = async (path) => {
      if (outage === "recherche" && path.startsWith("/search/commits?")) return { status: 403, data: {} };
      if (outage === "incomplete" && path.startsWith("/search/commits?")) return { status: 200, data: { incomplete_results: true, items: [] } };
      if (outage === "pulls" && path.endsWith("/pulls")) return { status: 500, data: {} };
      return call(path);
    };
    let instant = NOW;
    const autonomy = autonomyOf(enOutage, () => instant);
    const readEntry = await autonomy.chiffres(parade, 7);
    assert.ok("chiffres" in readEntry);
    assert.equal(readEntry.chiffres.tickets, 1);
    assert.equal(readEntry.chiffres.bugsEchappes, null);
    assert.equal(readEntry.chiffres.reverts, null);
    assert.equal(readEntry.chiffres.defautsNonLus.length, 1);
    assert.equal(readEntry.chiffres.defautsNonLus[0]!.projet, "parade");
    assert.match(readEntry.chiffres.defautsNonLus[0]!.raison, /HTTP 403/);
    outage = "incomplete";
    assert.deepEqual((await defaultsSaid(autonomy, 7)).defautsNonLus, [{ projet: "parade", raison: "GitHub's commit search gave incomplete results" }]);
    outage = "pulls";
    assert.match((await defaultsSaid(autonomy, 7)).defautsNonLus[0]?.raison ?? "", /HTTP 500 on \/repos\/chef\/parade\/commits\//);
    // Chaque lecture en panne s'est refaite ; lue entière, elle se garde dix minutes.
    outage = null;
    assert.deepEqual((await defaultsSaid(autonomy, 7)).bugs, [{ projet: "parade", bug: 50, tickets: [12] }]);
    const readOnes = paths.length;
    instant = new Date(NOW.getTime() + 9 * 60_000);
    await autonomy.chiffres(parade, 7);
    assert.equal(paths.length, readOnes);
  });

  test("un commit reverté que GitHub ne connaît pas (404) n'est d'aucun ticket ; une recherche sans liste n'est pas lue (#3515)", async () => {
    const { appeler: call } = github("chef/parade", DEFAULTS);
    let withoutList = false;
    const read: CallGitHub = async (path) => {
      if (path === `/repos/chef/parade/commits/${sha("c2")}/pulls`) return { status: 404, data: { message: "Not Found" } };
      if (withoutList && path.startsWith("/search/commits?")) return { status: 200, data: { incomplete_results: false } };
      return call(path);
    };
    assert.deepEqual((await defaultsSaid(autonomyOf(read), 7)).reverts, [{ projet: "parade", sha: sha("a1"), tickets: [12] }]);
    withoutList = true;
    assert.deepEqual((await defaultsSaid(autonomyOf(read), 7)).defautsNonLus, [{ projet: "parade", raison: "GitHub's commit search gave no list" }]);
  });

  test("la recherche des commits qui revertent se lit page après page ; au-delà de 1 000, la lecture le dit, sans nombre (#3515)", async () => {
    const commits = (n: number) => Array.from({ length: n }, (_, i) => ({ sha: `${i}`.padStart(40, "f"), commit: { message: "Revert nothing a trailer names", committer: { date: it(HOUR) } } }));
    const search = (total: number) => {
      const { appeler: call } = github();
      const all = commits(total);
      const pages: number[] = [];
      const read: CallGitHub = async (path) => {
        if (!path.startsWith("/search/commits?")) return call(path);
        const page = Number(/&page=(\d+)/.exec(path)![1]);
        pages.push(page);
        return { status: 200, data: { incomplete_results: false, items: all.slice((page - 1) * 100, page * 100) } };
      };
      return { lire: read, pages };
    };
    const readEntries = search(250);
    assert.deepEqual((await defaultsSaid(autonomyOf(readEntries.lire), 7)).reverts, []);
    assert.deepEqual(readEntries.pages, [1, 2, 3]);
    const too = search(1200);
    assert.deepEqual((await defaultsSaid(autonomyOf(too.lire), 7)).defautsNonLus, [{ projet: "parade", raison: "more than 1000 reverting commits in the period" }]);
    assert.equal(too.pages.length, 10);
  });
});
