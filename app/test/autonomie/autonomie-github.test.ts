// La lecture des chiffres d'autonomie sur GitHub (#3222) : les PR fermées, puis les événements et les commentaires de
// l'issue de chaque ticket servi sur 30 jours — rien d'autre, aucun fichier de ce poste. Un dépôt lu se garde dix minutes
// et sert aux deux périodes ; un dépôt qui ne se lit pas est nommé ; aucun lu, la lecture le dit sans chiffre.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { AppelGitHub } from "../../src/tableau/client.ts";
import { lireLAutonomieDuDepot, SANS_LECTURE, tenirLAutonomie } from "../../src/vue/autonomie/autonomie-github.ts";

const MAINTENANT = new Date("2026-11-11T12:00:00.000Z");
const HEURE = 3600 * 1000;
const JOUR = 24 * HEURE;
const il = (ms: number) => new Date(MAINTENANT.getTime() - ms).toISOString();

// Le dépôt « chef/parade » tel que GitHub le rend : #12 servi il y a 2 jours, bloqué sur le chef ; #13 servi il y a 20 jours,
// renvoyé une fois ; une PR mergée il y a 40 jours, hors de toute période ; une PR fermée sans merge.
const PULLS = [
  { number: 40, title: "#12 — Badge colours", merged_at: il(2 * JOUR), updated_at: il(2 * JOUR), head: { ref: "cook/12-github" }, body: "Closes #12", html_url: "https://github.com/chef/parade/pull/40" },
  { number: 41, title: "#13 — Faster rail", merged_at: il(20 * JOUR), updated_at: il(20 * JOUR), head: { ref: "cook/13-github" }, body: "Closes #13", html_url: "https://github.com/chef/parade/pull/41" },
  { number: 42, title: "#14 — Not merged", merged_at: null, updated_at: il(20 * JOUR), head: { ref: "cook/14-github" }, body: "Closes #14", html_url: "https://github.com/chef/parade/pull/42" },
  { number: 9, title: "#5 — Old", merged_at: il(40 * JOUR), updated_at: il(40 * JOUR), head: { ref: "cook/5-github" }, body: "Closes #5", html_url: "https://github.com/chef/parade/pull/9" },
];
const EVENEMENTS: Record<number, object[]> = {
  12: [
    { event: "labeled", label: { name: "fire" }, created_at: il(2 * JOUR + 5 * HEURE) },
    { event: "labeled", label: { name: "blocked-on-human" }, created_at: il(2 * JOUR + 3 * HEURE) },
  ],
  13: [{ event: "labeled", label: { name: "fire" }, created_at: il(20 * JOUR + HEURE) }],
};
const COMMENTAIRES: Record<number, object[]> = {
  12: [{ body: "**Question for the chef (design):** which badge colour?", created_at: il(2 * JOUR + 3 * HEURE + 1000), author_association: "OWNER" }],
  13: [{ body: "<!-- brigade:renvoi n=1 sha=a -->\nsent back", created_at: il(20 * JOUR + HEURE / 2), author_association: "OWNER" }],
};

function github(depot = "chef/parade") {
  const chemins: string[] = [];
  const appeler: AppelGitHub = async (chemin) => {
    chemins.push(chemin);
    const ok = (data: unknown) => ({ status: 200, data });
    if (chemin.startsWith(`/repos/${depot}/pulls?state=closed`)) return ok(chemin.includes("page=1") ? PULLS : []);
    const issue = /\/issues\/(\d+)\/(events|comments)\?/.exec(chemin);
    if (issue !== null) return ok(chemin.includes("page=1") ? ((issue[2] === "events" ? EVENEMENTS : COMMENTAIRES)[Number(issue[1])] ?? []) : []);
    return { status: 404, data: {} };
  };
  return { chemins, appeler };
}

describe("les chiffres d'autonomie lus de GitHub (#3222)", () => {
  test("un dépôt se lit de ses PR fermées et des issues de ses tickets servis sur 30 jours, rien d'autre", async () => {
    const { chemins, appeler } = github();
    const donnees = await lireLAutonomieDuDepot({ depot: "chef/parade", appeler, maintenant: MAINTENANT });
    assert.deepEqual(donnees.servis.map(({ ticket }) => ticket), [12, 13]);
    assert.deepEqual(Object.keys(donnees.issues).sort(), ["12", "13"]);
    assert.deepEqual(chemins.filter((chemin) => !chemin.includes("/pulls?")).sort(), [
      "/repos/chef/parade/issues/12/comments?per_page=100&page=1",
      "/repos/chef/parade/issues/12/events?per_page=100&page=1",
      "/repos/chef/parade/issues/13/comments?per_page=100&page=1",
      "/repos/chef/parade/issues/13/events?per_page=100&page=1",
    ]);
  });

  test("les deux périodes, du projet et de tous, se calculent d'une seule lecture, gardée dix minutes", async () => {
    const { chemins, appeler } = github();
    let instant = MAINTENANT;
    const autonomie = tenirLAutonomie({ lire: (depot) => lireLAutonomieDuDepot({ depot, appeler, maintenant: instant }), fraicheurMs: 10 * 60_000, maintenant: () => instant });
    const projets = [{ nom: "parade", depot: "chef/parade" }];
    const semaine = await autonomie.chiffres(projets, 7);
    const mois = await autonomie.chiffres(projets, 30);
    assert.ok("chiffres" in semaine && "chiffres" in mois);
    assert.deepEqual([semaine.chiffres.tickets, semaine.chiffres.partSansHumain, semaine.chiffres.delaiMedianMs, semaine.chiffres.partRenvoyee], [1, 0, 5 * HEURE, 0]);
    assert.deepEqual([mois.chiffres.tickets, mois.chiffres.partSansHumain, mois.chiffres.delaiMedianMs, mois.chiffres.partRenvoyee], [2, 0.5, 3 * HEURE, 0.5]);
    assert.deepEqual(mois.chiffres.avecHumain.map(({ projet, ticket, titre, questions }) => ({ projet, ticket, titre, questions })), [{ projet: "parade", ticket: 12, titre: "Badge colours", questions: ["Question for the chef (design): which badge colour?"] }]);
    const lus = chemins.length;
    instant = new Date(MAINTENANT.getTime() + 9 * 60_000);
    await autonomie.chiffres(projets, 7);
    assert.equal(chemins.length, lus);
    instant = new Date(MAINTENANT.getTime() + 10 * 60_000);
    await autonomie.chiffres(projets, 7);
    assert.ok(chemins.length > lus);
  });

  test("un dépôt qui ne se lit pas est nommé, les autres comptent ; aucun lu, pas de chiffre ; l'échec ne se garde pas", async () => {
    const appels: Record<string, AppelGitHub> = { "chef/parade": github().appeler, "chef/cantine": github("chef/cantine").appeler };
    let enPanne = true;
    const autonomie = tenirLAutonomie({
      lire: (depot) => (depot === "chef/cantine" && enPanne ? Promise.reject(new Error("GitHub answered HTTP 502")) : lireLAutonomieDuDepot({ depot, appeler: appels[depot]!, maintenant: MAINTENANT })),
      fraicheurMs: 10 * 60_000,
      maintenant: () => MAINTENANT,
    });
    const tous = await autonomie.chiffres([{ nom: "parade", depot: "chef/parade" }, { nom: "cantine", depot: "chef/cantine" }], 30);
    assert.ok("chiffres" in tous);
    assert.deepEqual(tous.manquants, [{ projet: "cantine", raison: "GitHub answered HTTP 502" }]);
    assert.equal(tous.chiffres.tickets, 2);
    const seule = await autonomie.chiffres([{ nom: "cantine", depot: "chef/cantine" }], 7);
    assert.deepEqual(seule, { jours: 7, sans: SANS_LECTURE, detail: "cantine: GitHub answered HTTP 502" });
    enPanne = false;
    const reprise = await autonomie.chiffres([{ nom: "cantine", depot: "chef/cantine" }], 7);
    assert.ok("chiffres" in reprise);
  });

  test("une réponse de GitHub qui n'est pas 200 fait échouer la lecture du dépôt quand rien n'a pu se lire, jamais des chiffres sans ses tickets", async () => {
    const { appeler } = github();
    const enPanne: AppelGitHub = (chemin) => (chemin.includes("/issues/") ? Promise.resolve({ status: 403, data: {} }) : appeler(chemin));
    await assert.rejects(lireLAutonomieDuDepot({ depot: "chef/parade", appeler: enPanne, maintenant: MAINTENANT }), /HTTP 403/);
  });

  test("une période qui n'est pas offerte n'est pas calculée", async () => {
    const autonomie = tenirLAutonomie({ lire: () => Promise.reject(new Error("not read")), fraicheurMs: 1 });
    assert.deepEqual(await autonomie.chiffres([], 3), { jours: 3, sans: SANS_LECTURE, detail: "no such period: 3 days" });
    assert.deepEqual(await autonomie.chiffres([], 7), { jours: 7, sans: SANS_LECTURE, detail: "no project to read" });
  });

  // Un dépôt de 1 334 PR mergées en 30 jours (#3379), une par ticket, servies 100 par page, la plus récemment mise à jour d'abord.
  const MERGEES = 1334;
  const grosDepot = (options: { panneAPartirDeLaPage?: number; ticketEnPanne?: number } = {}) => {
    const prs = Array.from({ length: MERGEES }, (_, i) => {
      const quand = il(((i + 1) * 30 * JOUR) / (MERGEES + 1));
      return { number: 1000 + i, title: `#${i + 1} — Ticket ${i + 1}`, merged_at: quand, updated_at: quand, head: { ref: `cook/${i + 1}-github` }, body: `Closes #${i + 1}`, html_url: `https://github.com/chef/gros/pull/${1000 + i}` };
    });
    const chemins: string[] = [];
    const appeler: AppelGitHub = async (chemin) => {
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
    const { appeler } = grosDepot();
    const autonomie = tenirLAutonomie({ lire: (depot, lues) => lireLAutonomieDuDepot({ depot, appeler, maintenant: MAINTENANT, lues }), fraicheurMs: 10 * 60_000, maintenant: () => MAINTENANT });
    const mois = await autonomie.chiffres([{ nom: "gros", depot: "chef/gros" }], 30);
    assert.ok("chiffres" in mois);
    assert.equal(mois.chiffres.tickets, MERGEES);
    assert.deepEqual(mois.partiels, []);
    assert.equal(mois.chiffres.delaiMedianMs, 2 * HEURE);
  });

  test("une page de PR qui ne se lit pas : les chiffres ne portent que sur ce qui est lu, et la lecture dit depuis quand", async () => {
    const { appeler } = grosDepot({ panneAPartirDeLaPage: 8 });
    const autonomie = tenirLAutonomie({ lire: (depot, lues) => lireLAutonomieDuDepot({ depot, appeler, maintenant: MAINTENANT, lues }), fraicheurMs: 10 * 60_000, maintenant: () => MAINTENANT });
    const mois = await autonomie.chiffres([{ nom: "gros", depot: "chef/gros" }], 30);
    assert.ok("chiffres" in mois);
    assert.equal(mois.chiffres.tickets, 699);
    assert.equal(mois.partiels.length, 1);
    assert.equal(mois.partiels[0]!.projet, "gros");
    assert.match(mois.partiels[0]!.raison, /HTTP 403/);
    assert.equal(mois.partiels[0]!.depuis, new Date(MAINTENANT.getTime() - (700 * 30 * JOUR) / (MERGEES + 1)).toISOString());
    // La semaine est entière dans ce qui est lu : aucune mention.
    const semaine = await autonomie.chiffres([{ nom: "gros", depot: "chef/gros" }], 7);
    assert.ok("chiffres" in semaine);
    assert.deepEqual(semaine.partiels, []);
  });

  test("une première page de PR qui ne se lit pas fait échouer la lecture : rien n'est lu", async () => {
    const { appeler } = grosDepot({ panneAPartirDeLaPage: 1 });
    await assert.rejects(lireLAutonomieDuDepot({ depot: "chef/gros", appeler, maintenant: MAINTENANT }), /HTTP 403/);
  });

  test("un ticket dont l'issue ne se lit pas borne la période lue : les plus anciens sont laissés de côté, dits, jamais comptés sans leur issue", async () => {
    const { appeler } = grosDepot({ ticketEnPanne: 600 });
    const donnees = await lireLAutonomieDuDepot({ depot: "chef/gros", appeler, maintenant: MAINTENANT });
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
    const autonomie = tenirLAutonomie({ lire: (depot, lues) => lireLAutonomieDuDepot({ depot, appeler, maintenant: instant, lues }), fraicheurMs: 10 * 60_000, maintenant: () => instant });
    const projets = [{ nom: "parade", depot: "chef/parade" }];
    await autonomie.chiffres(projets, 30);
    const issues = () => chemins.filter((chemin) => chemin.includes("/issues/")).length;
    assert.equal(issues(), 4);
    instant = new Date(MAINTENANT.getTime() + 11 * 60_000);
    const relue = await autonomie.chiffres(projets, 30);
    assert.ok("chiffres" in relue);
    assert.equal(relue.chiffres.tickets, 2);
    assert.equal(issues(), 4);
    assert.equal(chemins.filter((chemin) => chemin.includes("/pulls?")).length, 2);
  });
});
