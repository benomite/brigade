// La lecture des chiffres d'autonomie sur GitHub (#3222) : les PR fermées, puis les événements et les commentaires de
// l'issue de chaque ticket servi sur 30 jours — rien d'autre, aucun fichier de ce poste. Un dépôt lu se garde dix minutes
// et sert aux deux périodes ; un dépôt qui ne se lit pas est nommé ; aucun lu, la lecture le dit sans chiffre.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { CallGitHub } from "../../src/tableau/client.ts";
import { lireLAutonomyDuRepository, SANS_READ, holdLAutonomy } from "../../src/vue/autonomy/autonomy-github.ts";

const MAINTENANT = new Date("2026-11-11T12:00:00.000Z");
const HEURE = 3600 * 1000;
const DAY = 24 * HEURE;
const il = (ms: number) => new Date(MAINTENANT.getTime() - ms).toISOString();

// Le dépôt « chef/parade » tel que GitHub le rend : #12 servi il y a 2 jours, bloqué sur le chef ; #13 servi il y a 20 jours,
// renvoyé une fois ; une PR mergée il y a 40 jours, hors de toute période ; une PR fermée sans merge.
const PULLS = [
  { number: 40, title: "#12 — Badge colours", merged_at: il(2 * DAY), updated_at: il(2 * DAY), head: { ref: "cook/12-github" }, body: "Closes #12", html_url: "https://github.com/chef/parade/pull/40" },
  { number: 41, title: "#13 — Faster rail", merged_at: il(20 * DAY), updated_at: il(20 * DAY), head: { ref: "cook/13-github" }, body: "Closes #13", html_url: "https://github.com/chef/parade/pull/41" },
  { number: 42, title: "#14 — Not merged", merged_at: null, updated_at: il(20 * DAY), head: { ref: "cook/14-github" }, body: "Closes #14", html_url: "https://github.com/chef/parade/pull/42" },
  { number: 9, title: "#5 — Old", merged_at: il(40 * DAY), updated_at: il(40 * DAY), head: { ref: "cook/5-github" }, body: "Closes #5", html_url: "https://github.com/chef/parade/pull/9" },
];
const EVENTS: Record<number, object[]> = {
  12: [
    { event: "labeled", label: { name: "fire" }, created_at: il(2 * DAY + 5 * HEURE) },
    { event: "labeled", label: { name: "blocked-on-human" }, created_at: il(2 * DAY + 3 * HEURE) },
  ],
  13: [{ event: "labeled", label: { name: "fire" }, created_at: il(20 * DAY + HEURE) }],
};
const COMMENTAIRES: Record<number, object[]> = {
  12: [{ body: "**Question for the chef (design):** which badge colour?", created_at: il(2 * DAY + 3 * HEURE + 1000), author_association: "OWNER" }],
  13: [{ body: "<!-- brigade:renvoi n=1 sha=a -->\nsent back", created_at: il(20 * DAY + HEURE / 2), author_association: "OWNER" }],
};

// Ses défauts échappés (#3515), vides par défaut : ses issues `bug`, les commits que trouve la recherche, les PR de chaque
// commit reverté — un commit absent, GitHub répond 422.
type DefautsDuFaux = { bugs?: object[]; reverts?: object[]; prs?: Record<string, object[]> };
function github(repository = "chef/parade", defauts: DefautsDuFaux = {}) {
  const chemins: string[] = [];
  const appeler: CallGitHub = async (chemin) => {
    chemins.push(chemin);
    const ok = (data: unknown) => ({ status: 200, data });
    if (chemin.startsWith(`/repos/${repository}/pulls?state=closed`)) return ok(chemin.includes("page=1") ? PULLS : []);
    if (chemin.startsWith(`/repos/${repository}/issues?state=all&labels=bug&`)) return ok(chemin.includes("&page=1") ? (defauts.bugs ?? []) : []);
    if (chemin.startsWith("/search/commits?")) return ok({ total_count: 0, incomplete_results: false, items: chemin.includes("&page=1") ? (defauts.reverts ?? []) : [] });
    const pullsDuCommit = new RegExp(`^/repos/${repository}/commits/([0-9a-f]+)/pulls$`).exec(chemin);
    if (pullsDuCommit !== null) return defauts.prs?.[pullsDuCommit[1]!] === undefined ? { status: 422, data: { message: "No commit found for SHA" } } : ok(defauts.prs[pullsDuCommit[1]!]);
    const issue = /\/issues\/(\d+)\/(events|comments)\?/.exec(chemin);
    if (issue !== null) return ok(chemin.includes("page=1") ? ((issue[2] === "events" ? EVENTS : COMMENTAIRES)[Number(issue[1])] ?? []) : []);
    return { status: 404, data: {} };
  };
  return { chemins, appeler };
}

describe("les chiffres d'autonomie lus de GitHub (#3222)", () => {
  test("un dépôt se lit de ses PR fermées et des issues de ses tickets servis sur 30 jours, rien d'autre", async () => {
    const { chemins, appeler } = github();
    const donnees = await lireLAutonomyDuRepository({ depot: "chef/parade", appeler, maintenant: MAINTENANT });
    assert.deepEqual(donnees.servis.map(({ ticket }) => ticket), [12, 13]);
    assert.deepEqual(Object.keys(donnees.issues).sort(), ["12", "13"]);
    assert.deepEqual(chemins.filter((chemin) => !chemin.includes("/pulls?") && !chemin.includes("labels=bug") && !chemin.startsWith("/search/commits?")).sort(), [
      "/repos/chef/parade/issues/12/comments?per_page=100&page=1",
      "/repos/chef/parade/issues/12/events?per_page=100&page=1",
      "/repos/chef/parade/issues/13/comments?per_page=100&page=1",
      "/repos/chef/parade/issues/13/events?per_page=100&page=1",
    ]);
  });

  test("les deux périodes, du projet et de tous, se calculent d'une seule lecture, gardée dix minutes", async () => {
    const { chemins, appeler } = github();
    let instant = MAINTENANT;
    const autonomy = holdLAutonomy({ lire: (repository) => lireLAutonomyDuRepository({ depot: repository, appeler, maintenant: instant }), fraicheurMs: 10 * 60_000, maintenant: () => instant });
    const projects = [{ nom: "parade", depot: "chef/parade" }];
    const semaine = await autonomy.chiffres(projects, 7);
    const mois = await autonomy.chiffres(projects, 30);
    assert.ok("chiffres" in semaine && "chiffres" in mois);
    assert.deepEqual([semaine.chiffres.tickets, semaine.chiffres.partSansHumain, semaine.chiffres.delaiMedianMs, semaine.chiffres.partRenvoyee], [1, 0, 5 * HEURE, 0]);
    assert.deepEqual([mois.chiffres.tickets, mois.chiffres.partSansHumain, mois.chiffres.delaiMedianMs, mois.chiffres.partRenvoyee], [2, 0.5, 3 * HEURE, 0.5]);
    assert.deepEqual(mois.chiffres.avecHumain.map(({ projet: project, ticket, titre, questions }) => ({ projet: project, ticket, titre, questions })), [{ projet: "parade", ticket: 12, titre: "Badge colours", questions: ["Question for the chef (design): which badge colour?"] }]);
    const lus = chemins.length;
    instant = new Date(MAINTENANT.getTime() + 9 * 60_000);
    await autonomy.chiffres(projects, 7);
    assert.equal(chemins.length, lus);
    instant = new Date(MAINTENANT.getTime() + 10 * 60_000);
    await autonomy.chiffres(projects, 7);
    assert.ok(chemins.length > lus);
  });

  test("un dépôt qui ne se lit pas est nommé, les autres comptent ; aucun lu, pas de chiffre ; l'échec ne se garde pas", async () => {
    const calls: Record<string, CallGitHub> = { "chef/parade": github().appeler, "chef/cantine": github("chef/cantine").appeler };
    let enOutage = true;
    const autonomy = holdLAutonomy({
      lire: (repository) => (repository === "chef/cantine" && enOutage ? Promise.reject(new Error("GitHub answered HTTP 502")) : lireLAutonomyDuRepository({ depot: repository, appeler: calls[repository]!, maintenant: MAINTENANT })),
      fraicheurMs: 10 * 60_000,
      maintenant: () => MAINTENANT,
    });
    const tous = await autonomy.chiffres([{ nom: "parade", depot: "chef/parade" }, { nom: "cantine", depot: "chef/cantine" }], 30);
    assert.ok("chiffres" in tous);
    assert.deepEqual(tous.manquants, [{ projet: "cantine", raison: "GitHub answered HTTP 502" }]);
    assert.equal(tous.chiffres.tickets, 2);
    const only = await autonomy.chiffres([{ nom: "cantine", depot: "chef/cantine" }], 7);
    assert.deepEqual(only, { jours: 7, sans: SANS_READ, detail: "cantine: GitHub answered HTTP 502" });
    enOutage = false;
    const resumption = await autonomy.chiffres([{ nom: "cantine", depot: "chef/cantine" }], 7);
    assert.ok("chiffres" in resumption);
  });

  test("une réponse de GitHub qui n'est pas 200 fait échouer la lecture du dépôt quand rien n'a pu se lire, jamais des chiffres sans ses tickets", async () => {
    const { appeler } = github();
    const enOutage: CallGitHub = (chemin) => (chemin.includes("/issues/") ? Promise.resolve({ status: 403, data: {} }) : appeler(chemin));
    await assert.rejects(lireLAutonomyDuRepository({ depot: "chef/parade", appeler: enOutage, maintenant: MAINTENANT }), /HTTP 403/);
  });

  test("une période qui n'est pas offerte n'est pas calculée", async () => {
    const autonomy = holdLAutonomy({ lire: () => Promise.reject(new Error("not read")), fraicheurMs: 1 });
    assert.deepEqual(await autonomy.chiffres([], 3), { jours: 3, sans: SANS_READ, detail: "no such period: 3 days" });
    assert.deepEqual(await autonomy.chiffres([], 7), { jours: 7, sans: SANS_READ, detail: "no project to read" });
  });

  // Un dépôt de 1 334 PR mergées en 30 jours (#3379), une par ticket, servies 100 par page, la plus récemment mise à jour d'abord.
  const MERGEES = 1334;
  const grosRepository = (options: { panneAPartirDeLaPage?: number; ticketEnPanne?: number } = {}) => {
    const prs = Array.from({ length: MERGEES }, (_, i) => {
      const quand = il(((i + 1) * 30 * DAY) / (MERGEES + 1));
      return { number: 1000 + i, title: `#${i + 1} — Ticket ${i + 1}`, merged_at: quand, updated_at: quand, head: { ref: `cook/${i + 1}-github` }, body: `Closes #${i + 1}`, html_url: `https://github.com/chef/gros/pull/${1000 + i}` };
    });
    const chemins: string[] = [];
    const appeler: CallGitHub = async (chemin) => {
      chemins.push(chemin);
      const ok = (data: unknown) => ({ status: 200, data });
      if (chemin.startsWith("/repos/chef/gros/pulls?state=closed")) {
        const page = Number(/&page=(\d+)/.exec(chemin)![1]);
        if (options.panneAPartirDeLaPage !== undefined && page >= options.panneAPartirDeLaPage) return { status: 403, data: {} };
        return ok(prs.slice((page - 1) * 100, page * 100));
      }
      const issue = /\/issues\/(\d+)\/(events|comments)\?/.exec(chemin);
      if (issue !== null) {
        if (Number(issue[1]) === options.ticketEnPanne) return { status: 403, data: {} };
        const ticket = Number(issue[1]);
        const tot = Date.parse(prs[ticket - 1]!.merged_at) - 2 * HEURE;
        return ok(chemin.includes("page=1") && issue[2] === "events" ? [{ event: "labeled", label: { name: "fire" }, created_at: new Date(tot).toISOString() }] : []);
      }
      return { status: 404, data: {} };
    };
    return { chemins, appeler };
  };

  test("plus de 1 000 PR mergées sur la période : chaque ticket des 30 jours est compté, la période est entière", async () => {
    const { appeler } = grosRepository();
    const autonomy = holdLAutonomy({ lire: (repository, lues) => lireLAutonomyDuRepository({ depot: repository, appeler, maintenant: MAINTENANT, lues }), fraicheurMs: 10 * 60_000, maintenant: () => MAINTENANT });
    const mois = await autonomy.chiffres([{ nom: "gros", depot: "chef/gros" }], 30);
    assert.ok("chiffres" in mois);
    assert.equal(mois.chiffres.tickets, MERGEES);
    assert.deepEqual(mois.partiels, []);
    assert.equal(mois.chiffres.delaiMedianMs, 2 * HEURE);
  });

  test("une page de PR qui ne se lit pas : les chiffres ne portent que sur ce qui est lu, et la lecture dit depuis quand", async () => {
    const { appeler } = grosRepository({ panneAPartirDeLaPage: 8 });
    const autonomy = holdLAutonomy({ lire: (repository, lues) => lireLAutonomyDuRepository({ depot: repository, appeler, maintenant: MAINTENANT, lues }), fraicheurMs: 10 * 60_000, maintenant: () => MAINTENANT });
    const mois = await autonomy.chiffres([{ nom: "gros", depot: "chef/gros" }], 30);
    assert.ok("chiffres" in mois);
    assert.equal(mois.chiffres.tickets, 699);
    assert.equal(mois.partiels.length, 1);
    assert.equal(mois.partiels[0]!.projet, "gros");
    assert.match(mois.partiels[0]!.raison, /HTTP 403/);
    assert.equal(mois.partiels[0]!.depuis, new Date(MAINTENANT.getTime() - (700 * 30 * DAY) / (MERGEES + 1)).toISOString());
    // La semaine est entière dans ce qui est lu : aucune mention.
    const semaine = await autonomy.chiffres([{ nom: "gros", depot: "chef/gros" }], 7);
    assert.ok("chiffres" in semaine);
    assert.deepEqual(semaine.partiels, []);
  });

  test("une première page de PR qui ne se lit pas fait échouer la lecture : rien n'est lu", async () => {
    const { appeler } = grosRepository({ panneAPartirDeLaPage: 1 });
    await assert.rejects(lireLAutonomyDuRepository({ depot: "chef/gros", appeler, maintenant: MAINTENANT }), /HTTP 403/);
  });

  test("un ticket dont l'issue ne se lit pas borne la période lue : les plus anciens sont laissés de côté, dits, jamais comptés sans leur issue", async () => {
    const { appeler } = grosRepository({ ticketEnPanne: 600 });
    const donnees = await lireLAutonomyDuRepository({ depot: "chef/gros", appeler, maintenant: MAINTENANT });
    assert.ok(donnees.partiel !== null);
    assert.match(donnees.partiel.raison, /HTTP 403/);
    assert.ok(donnees.servis.length < MERGEES);
    assert.ok(donnees.servis.every(({ livre }) => Date.parse(livre) > Date.parse(donnees.partiel!.depuis)));
    assert.ok(donnees.servis.every(({ ticket }) => donnees.issues[ticket] !== undefined));
    assert.ok(!donnees.servis.some(({ ticket }) => ticket === 600));
  });

  test("rouvrir le bloc ne relit aucune issue déjà lue, même après la fraîcheur du dépôt", async () => {
    const { chemins, appeler } = github();
    let instant = MAINTENANT;
    const autonomy = holdLAutonomy({ lire: (repository, lues) => lireLAutonomyDuRepository({ depot: repository, appeler, maintenant: instant, lues }), fraicheurMs: 10 * 60_000, maintenant: () => instant });
    const projects = [{ nom: "parade", depot: "chef/parade" }];
    await autonomy.chiffres(projects, 30);
    const issues = () => chemins.filter((chemin) => chemin.includes("/issues/")).length;
    assert.equal(issues(), 4);
    instant = new Date(MAINTENANT.getTime() + 11 * 60_000);
    const relue = await autonomy.chiffres(projects, 30);
    assert.ok("chiffres" in relue);
    assert.equal(relue.chiffres.tickets, 2);
    assert.equal(issues(), 4);
    assert.equal(chemins.filter((chemin) => chemin.includes("/pulls?")).length, 2);
  });

  // Les défauts échappés de « chef/parade » (#3515) : #50 cite #12 après son merge, #51 cite #13 ; a1… revert un commit de la
  // PR de #12, c4… un de #13 ; b2… un commit que GitHub ne connaît pas, d3… celui d'une PR jamais mergée.
  const sha = (signe: string) => signe.repeat(20);
  const revert = (de: string, cible: string, heures: number) => ({ sha: sha(de), commit: { message: `Revert "x"\n\nThis reverts commit ${sha(cible)}.`, committer: { date: il(heures * HEURE) } } });
  const DEFAUTS: DefautsDuFaux = {
    bugs: [
      { number: 50, title: "Grey badges", body: "Since #12 the badges are grey.", created_at: il(DAY), labels: [{ name: "bug" }], html_url: "https://github.com/chef/parade/issues/50" },
      { number: 51, title: "Rail slower", body: "Since #13.", created_at: il(10 * DAY), labels: [{ name: "bug" }], html_url: "https://github.com/chef/parade/issues/51" },
    ],
    reverts: [revert("a1", "c1", 1), revert("b2", "c2", 2), revert("d3", "c3", 3), revert("e4", "c4", 4)],
    prs: {
      [sha("c1")]: [{ number: 40, merged_at: il(2 * DAY), head: { ref: "cook/12-github" }, body: "Closes #12" }],
      [sha("c3")]: [{ number: 42, merged_at: null, head: { ref: "cook/14-github" }, body: "Closes #14" }],
      [sha("c4")]: [{ number: 41, merged_at: il(20 * DAY), head: { ref: "cook/13-github" }, body: "Closes #13" }],
    },
  };
  const parade = [{ nom: "parade", depot: "chef/parade" }];
  const autonomyDe = (appeler: CallGitHub, instant = () => MAINTENANT) =>
    holdLAutonomy({ lire: (repository, lues) => lireLAutonomyDuRepository({ depot: repository, appeler, maintenant: instant(), lues }), fraicheurMs: 10 * 60_000, maintenant: instant });
  const defautsDits = async (autonomy: ReturnType<typeof holdLAutonomy>, jours: number) => {
    const lue = await autonomy.chiffres(parade, jours);
    assert.ok("chiffres" in lue);
    const { bugsEchappes, reverts, defautsNonLus } = lue.chiffres;
    return { bugs: bugsEchappes?.map(({ projet: project, bug, tickets }) => ({ projet: project, bug, tickets })) ?? null, reverts: reverts?.map(({ projet: project, sha, tickets }) => ({ projet: project, sha, tickets })) ?? null, defautsNonLus };
  };

  test("les défauts échappés se lisent des issues `bug` et des commits qui revertent de la branche par défaut, et des PR des commits revertés (#3515)", async () => {
    const { chemins, appeler } = github("chef/parade", DEFAUTS);
    const autonomy = autonomyDe(appeler);
    assert.deepEqual(await defautsDits(autonomy, 7), { bugs: [{ projet: "parade", bug: 50, tickets: [12] }], reverts: [{ projet: "parade", sha: sha("a1"), tickets: [12] }], defautsNonLus: [] });
    assert.deepEqual(await defautsDits(autonomy, 30), {
      bugs: [{ projet: "parade", bug: 50, tickets: [12] }, { projet: "parade", bug: 51, tickets: [13] }],
      reverts: [{ projet: "parade", sha: sha("a1"), tickets: [12] }, { projet: "parade", sha: sha("e4"), tickets: [13] }],
      defautsNonLus: [],
    });
    const depuis = il(30 * DAY);
    assert.ok(chemins.includes(`/repos/chef/parade/issues?state=all&labels=bug&since=${depuis}&per_page=100&page=1`));
    assert.ok(chemins.includes(`/search/commits?q=${encodeURIComponent(`repo:chef/parade "This reverts commit" committer-date:>=${depuis.slice(0, 10)}`)}&per_page=100&page=1`));
    assert.deepEqual(chemins.filter((chemin) => chemin.includes("/commits/")).sort(), [sha("c1"), sha("c2"), sha("c3"), sha("c4")].map((un) => `/repos/chef/parade/commits/${un}/pulls`));
  });

  test("des défauts qui ne se lisent pas : les autres chiffres comptent, aucun des deux nombres, la raison dite, et la lecture ne se garde pas (#3515)", async () => {
    const { chemins, appeler } = github("chef/parade", DEFAUTS);
    let outage: "recherche" | "incomplete" | "pulls" | null = "recherche";
    const enOutage: CallGitHub = async (chemin) => {
      if (outage === "recherche" && chemin.startsWith("/search/commits?")) return { status: 403, data: {} };
      if (outage === "incomplete" && chemin.startsWith("/search/commits?")) return { status: 200, data: { incomplete_results: true, items: [] } };
      if (outage === "pulls" && chemin.endsWith("/pulls")) return { status: 500, data: {} };
      return appeler(chemin);
    };
    let instant = MAINTENANT;
    const autonomy = autonomyDe(enOutage, () => instant);
    const lue = await autonomy.chiffres(parade, 7);
    assert.ok("chiffres" in lue);
    assert.equal(lue.chiffres.tickets, 1);
    assert.equal(lue.chiffres.bugsEchappes, null);
    assert.equal(lue.chiffres.reverts, null);
    assert.equal(lue.chiffres.defautsNonLus.length, 1);
    assert.equal(lue.chiffres.defautsNonLus[0]!.projet, "parade");
    assert.match(lue.chiffres.defautsNonLus[0]!.raison, /HTTP 403/);
    outage = "incomplete";
    assert.deepEqual((await defautsDits(autonomy, 7)).defautsNonLus, [{ projet: "parade", raison: "GitHub's commit search gave incomplete results" }]);
    outage = "pulls";
    assert.match((await defautsDits(autonomy, 7)).defautsNonLus[0]?.raison ?? "", /HTTP 500 on \/repos\/chef\/parade\/commits\//);
    // Chaque lecture en panne s'est refaite ; lue entière, elle se garde dix minutes.
    outage = null;
    assert.deepEqual((await defautsDits(autonomy, 7)).bugs, [{ projet: "parade", bug: 50, tickets: [12] }]);
    const lus = chemins.length;
    instant = new Date(MAINTENANT.getTime() + 9 * 60_000);
    await autonomy.chiffres(parade, 7);
    assert.equal(chemins.length, lus);
  });

  test("un commit reverté que GitHub ne connaît pas (404) n'est d'aucun ticket ; une recherche sans liste n'est pas lue (#3515)", async () => {
    const { appeler } = github("chef/parade", DEFAUTS);
    let sansListe = false;
    const lire: CallGitHub = async (chemin) => {
      if (chemin === `/repos/chef/parade/commits/${sha("c2")}/pulls`) return { status: 404, data: { message: "Not Found" } };
      if (sansListe && chemin.startsWith("/search/commits?")) return { status: 200, data: { incomplete_results: false } };
      return appeler(chemin);
    };
    assert.deepEqual((await defautsDits(autonomyDe(lire), 7)).reverts, [{ projet: "parade", sha: sha("a1"), tickets: [12] }]);
    sansListe = true;
    assert.deepEqual((await defautsDits(autonomyDe(lire), 7)).defautsNonLus, [{ projet: "parade", raison: "GitHub's commit search gave no list" }]);
  });

  test("la recherche des commits qui revertent se lit page après page ; au-delà de 1 000, la lecture le dit, sans nombre (#3515)", async () => {
    const commits = (n: number) => Array.from({ length: n }, (_, i) => ({ sha: `${i}`.padStart(40, "f"), commit: { message: "Revert nothing a trailer names", committer: { date: il(HEURE) } } }));
    const recherche = (total: number) => {
      const { appeler } = github();
      const tous = commits(total);
      const pages: number[] = [];
      const lire: CallGitHub = async (chemin) => {
        if (!chemin.startsWith("/search/commits?")) return appeler(chemin);
        const page = Number(/&page=(\d+)/.exec(chemin)![1]);
        pages.push(page);
        return { status: 200, data: { incomplete_results: false, items: tous.slice((page - 1) * 100, page * 100) } };
      };
      return { lire, pages };
    };
    const lues = recherche(250);
    assert.deepEqual((await defautsDits(autonomyDe(lues.lire), 7)).reverts, []);
    assert.deepEqual(lues.pages, [1, 2, 3]);
    const trop = recherche(1200);
    assert.deepEqual((await defautsDits(autonomyDe(trop.lire), 7)).defautsNonLus, [{ projet: "parade", raison: "more than 1000 reverting commits in the period" }]);
    assert.equal(trop.pages.length, 10);
  });
});
