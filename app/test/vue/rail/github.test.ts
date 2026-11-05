// Le rail et les cooks d'un projet sur GitHub seul (#2220) : son interrupteur posé dans `projet.json`, la vue du rail range
// ses issues `fire` d'après leurs labels et leurs PR — en attente, prises, en pass, en WAITING —, et l'onglet Cooks montre
// les stations d'après leurs commentaires de prise et leurs signes de vie (#2358), jamais le rail figé du tableau de l'ancien chemin.
// Un projet de l'ancien chemin garde son rail tel qu'avant (#2059). Joué sur un faux GitHub, puis rendu par le rail de l'app.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { porter } from "../../../src/bon.ts";
import { comprendre, SANS_RAISON, tableau as tableauDe, tenirFaits, type Faits, type Tableau } from "../../../src/faits.ts";
import type { AppelGitHub, ReponseGitHub } from "../../../src/tableau/client.ts";
import type { LectureDuTableauDuDepot, TableauLu } from "../../../src/tableau/lecture.ts";
import { avecLesEtatsGithub, type MemoireDesLectures } from "../../../src/tableau/rail-github.ts";
import { statusDuTableau } from "../../../src/tableau/rail.ts";
import { avecLeRailGithub, interrupteurLu } from "../../../src/vue/rail/github.ts";

const DEPOT = "acme/kitchen";
const ok = (data: unknown, etag?: string): ReponseGitHub => ({ status: 200, data, ...(etag === undefined ? {} : { etag }) });
const projetJson = (reglages: object) => ok({ content: Buffer.from(JSON.stringify({ version: 1, integrationBranch: "main", ...reglages })).toString("base64"), encoding: "base64" });
const issue = (number: number, labels: string[], extra: object = {}) => ({
  number,
  title: `Ticket ${number}`,
  html_url: `https://github.com/${DEPOT}/issues/${number}`,
  created_at: "2026-11-03T21:00:00Z",
  labels: labels.map((name) => ({ name })),
  ...extra,
});
const prise = (id: number, station: string, le: string) => ({ id, body: `<!-- brigade:prise station=${station} -->\nTaken by station \`${station}\`.`, author_association: "OWNER", created_at: le });

// Le projet : #1 en attente, #2 pris par box/claude, #3 en pass (PR #40) cuisiné par mac/claude, #4 en WAITING, #5 en pass
// sans PR — GitHub ne dit d'elle aucun des quatre —, et #6, sans `fire`, avant le rail. Sa base est verte, ou rouge.
type Monde = { interrupteur?: boolean | "absent" | "refuse"; base?: string; issues?: () => unknown[]; commentaires?: Record<number, unknown[]>; appels?: string[] };
function github({ interrupteur = true, base = "success", issues, commentaires = {}, appels = [] }: Monde = {}): AppelGitHub {
  return async (chemin) => {
    appels.push(chemin);
    if (chemin.endsWith("/contents/.claude/brigade/projet.json")) {
      if (interrupteur === "absent") return { status: 404, data: {} };
      if (interrupteur === "refuse") return { status: 403, data: { message: "API rate limit exceeded" } };
      return projetJson({ githubOnlyState: interrupteur });
    }
    if (chemin.includes("/issues?") && chemin.includes("labels=fire")) {
      return ok(issues?.() ?? [issue(1, ["fire", "prio:2"]), issue(2, ["fire", "taken", "prio:1"]), issue(3, ["fire", "in-pass"]), issue(4, ["fire", "waiting", "taken"]), issue(5, ["fire", "in-pass"]), issue(40, ["fire"], { pull_request: {} })]);
    }
    // L'ancien chemin lit toutes les issues ouvertes (tableau/rail-github.ts).
    if (chemin.includes("/issues?")) return ok([issue(1, ["fire"]), issue(2, ["fire", "taken"]), issue(6, [])]);
    if (chemin.includes("/pulls?")) return ok([{ number: 40, state: "open", html_url: `https://github.com/${DEPOT}/pull/40`, created_at: "2026-11-04T02:30:00Z", head: { ref: "cook/3-github" }, body: "" }]);
    if (chemin === `/repos/${DEPOT}`) return ok({ default_branch: "main" });
    if (chemin.includes("/commits/main/check-runs")) return ok({ check_runs: [{ conclusion: base }] });
    const commentees = /\/issues\/(\d+)\/comments/.exec(chemin)?.[1];
    if (commentees !== undefined && commentaires[Number(commentees)] !== undefined) return ok(commentaires[Number(commentees)]);
    if (chemin.includes("/issues/2/comments")) return ok([prise(11, "box/claude", "2026-11-04T02:58:00Z")]);
    if (chemin.includes("/issues/3/comments")) return ok([prise(12, "mac/claude", "2026-11-04T01:00:00Z"), prise(13, "box/claude", "2026-11-04T01:00:05Z")]);
    if (/\/issues\/\d+\/(comments|events)/.test(chemin)) return ok([]);
    return { status: 404, data: {} };
  };
}

// Le tableau que la box publie encore : le rail figé de l'ancien chemin — trois tickets en attente que GitHub a pris
// depuis, aucune station déclarée, la cuisine retenue et oisive.
const LU = "2026-11-04T03:02:03.076Z";
const tableauFige = (): TableauLu =>
  ({
    lu: true,
    depot: DEPOT,
    numero: 99,
    adresse: null,
    genereLe: LU,
    luLe: LU,
    age: 0,
    projet: "kitchen",
    file: [],
    pages: [],
    bilans: [],
    cuisine: {
      rubriques: [
        { titre: "kitchen", lignes: ["open · breaker closed (0 failures in a row, opens at 3)"] },
        { titre: "stations", lignes: ["NONE DECLARED since 2026-11-03 19:31 UTC — no cook leaves, the tickets stay waiting"] },
        { titre: "rail", lignes: ["3 queued"] },
        { titre: "cooks", lignes: ["none running"] },
      ],
    },
    gestes: [],
    faits: {
      etat: "retenue",
      lu: LU,
      dernierTick: LU,
      compteurs: { rail: 3, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 2 },
      dernierEvenement: null,
      rail: [1, 2, 3].map((ticket) => ({ ticket, etat: "en attente", titre: `Ticket ${ticket}`, url: `https://github.com/${DEPOT}/issues/${ticket}` })),
      cooks: [],
      stations: [],
      cuisineOisive: { depuis: "2026-11-03T23:38:00.000Z", cartes: [1, 2, 3] },
    },
    lignesDuRail: [],
    etatLuLe: LU,
  }) as unknown as TableauLu;

// Ce que la vue dessine de la lecture : le tableau de `facts`, avec la ligne de chaque ticket que `status` écrit.
function dessine(lu: LectureDuTableauDuDepot): Tableau {
  assert.ok(lu.lu, "the board is read");
  const faits = comprendre(JSON.stringify(lu.faits));
  assert.ok(!("informe" in faits), `facts are in shape: ${"informe" in faits ? faits.informe : ""}`);
  return tableauDe(faits as Faits, undefined, { texte: statusDuTableau(lu), a: lu.luLe });
}
const colonnes = (vu: Tableau) => Object.fromEntries(vu.rail.colonnes.map(({ nom, cartes }) => [nom, cartes.map(({ ticket, mot, etat }) => `#${ticket} ${mot ?? etat}`)]));

describe("un projet sur GitHub seul : le rail de ses issues, de leurs labels et de leurs PR", () => {
  test("ses issues `fire` rangées par état — en attente, prises, en pass, WAITING —, pas le rail figé du tableau", async () => {
    const vu = dessine(await avecLeRailGithub(tableauFige(), github()));
    const lues = colonnes(vu);
    assert.deepEqual(lues["On the rail"], ["#1 queued", "#5 queued"]);
    assert.deepEqual(lues["Taken"], ["#2 taken"]);
    assert.deepEqual(lues["Pass"], ["#3 in pass"]);
    assert.deepEqual(lues["Waiting"], ["#4 waiting"]);
    // Les compteurs sont ceux de GitHub ; les livrés, que GitHub ne compte pas ici, restent ceux du tableau.
    assert.deepEqual(vu.compteurs.map(({ nombre }) => nombre), [5, 1, 1, 0, 2]);
    // « Aucun cook n'a tourné » était le journal de l'ancien chemin : il n'est plus dit.
    assert.equal(vu.panne, undefined);
  });

  test("ce que l'ancien chemin disait de la cuisine et que GitHub seul ne suit pas n'est plus dit : retenue, sans station", async () => {
    const lu = await avecLeRailGithub(tableauFige(), github());
    assert.ok(lu.lu);
    assert.equal(dessine(lu).mot, "open");
    const status = statusDuTableau(lu);
    assert.doesNotMatch(status, /NONE DECLARED/);
    assert.match(status, /^rail {7}1 taken · 1 in pass · 1 WAITING · 2 queued$/m);
    assert.match(status, /^cooks {6}2 running$/m);
    // L'arrêt du chef reste dit tel quel.
    const arretee = tableauFige();
    (arretee.faits as Record<string, unknown>).etat = "arrêtée";
    const relue = await avecLeRailGithub(arretee, github());
    assert.equal(relue.lu && relue.faits?.etat, "arrêtée");
  });

  test("base rouge : le ticket en pass est « base red »", async () => {
    assert.deepEqual(colonnes(dessine(await avecLeRailGithub(tableauFige(), github({ base: "failure" }))))["Pass"], ["#3 base red"]);
  });

  test("les bons disent qui tient chaque ticket et depuis quand, sa priorité, et la PR d'un ticket en pass", async () => {
    const lu = await avecLeRailGithub(tableauFige(), github());
    assert.ok(lu.lu);
    const lignes = new Map((lu.lignesDuRail ?? []).map(({ ticket, ligne }) => [ticket, ligne.replace(/^ {2}#\d+ {2}/, "")]));
    assert.equal(lignes.get(2), "taken  prio:1  by box/claude since 2026-11-04 02:58 UTC  Ticket 2");
    assert.equal(lignes.get(3), "in pass  -  since 2026-11-04 02:30 UTC, cooked by mac/claude  Ticket 3");
    assert.equal(lignes.get(1), "queued  prio:2  since 2026-11-03 21:00 UTC  Ticket 1");
    assert.deepEqual(porter({ etat: "pris", titre: "Ticket 2" }, { lignes: [lignes.get(2) ?? ""], bloque: false }).dit.slice(0, 2), [
      { libelle: "taken by", valeur: "box/claude", exact: true },
      { libelle: "since", valeur: "2026-11-04 02:58 UTC" },
    ]);
    const carte = dessine(lu).rail.colonnes.find(({ nom }) => nom === "Pass")?.cartes[0];
    assert.match(carte?.dit.find(({ libelle }) => libelle === "right now")?.valeur ?? "", /^awaiting review and merge PR #40, for /);
    assert.equal(carte?.dit.find(({ libelle }) => libelle === "cooked by")?.valeur, "mac/claude");
    // L'âge du rail est celui de la lecture de GitHub, pas celui du tableau publié.
    assert.equal(lu.etatLuLe, lu.luLe);
    assert.deepEqual(
      (lu.faits?.rail as { ticket: number; depuis?: string }[]).map(({ ticket, depuis }) => [ticket, depuis ?? null]),
      [[2, "2026-11-04T02:58:00Z"], [1, null], [3, "2026-11-04T02:30:00Z"], [4, null], [5, null]],
    );
  });

  test("l'onglet Cooks : ses stations dites de GitHub — une qui cuit, une qui attend, une tue —, rien des stations de l'ancien journal (#2358)", async () => {
    const fige = tableauFige();
    // L'ancien journal déclarait ce Mac sans qu'il s'y soit annoncé : « not signed in yet ». Il n'en reste rien.
    (fige.faits as Record<string, unknown>).stations = [{ station: "macbook/claude", distante: true, plafond: 2, ordinaires: false, bacASable: null, prendOrdinaires: false, cuisson: "cooking", presente: false, vueLe: null, cooks: [] }];
    const signe = (name: string, lastSeen: string) => ({ name, lastSeen, stoppedAt: null, refreshMs: 120_000, selection: [DEPOT] });
    const signes = { lus: [signe("box", "2026-11-04T03:01:00Z"), signe("mac", "2026-11-04T03:00:30Z"), signe("atelier", "2026-11-04T03:01:30Z"), signe("pc", "2026-11-02T18:40:00Z")] };
    const vu = dessine(await avecLeRailGithub(fige, github(), undefined, undefined, async () => signes));
    assert.deepEqual(
      vu.stations?.lignes.map(({ station, etat, presente, vueLe, cooks }) => ({ station, etat, presente, vueLe, cooks: cooks.map(({ ticket }) => ticket) })),
      [
        { station: "atelier/claude", etat: "idle", presente: true, vueLe: "2026-11-04T03:01:30Z", cooks: [] },
        { station: "box/claude", etat: "cooking", presente: true, vueLe: "2026-11-04T03:01:00Z", cooks: [2] },
        { station: "mac/claude", etat: "cooking", presente: true, vueLe: "2026-11-04T03:00:30Z", cooks: [3] },
        { station: "pc/claude", etat: "silent", presente: false, vueLe: "2026-11-02T18:40:00Z", cooks: [] },
      ],
    );
    assert.deepEqual(vu.stations?.surGithub, { illisible: null });
    // Aucune n'a de bouton : arrêter une station est un geste de l'ancien chemin.
    assert.deepEqual(vu.stations?.lignes.filter(({ etat }) => etat !== "cooking").map(({ geste }) => geste), [null, null]);
    assert.deepEqual(vu.cooks.enCours.map(({ ticket, station }) => `#${ticket} ${station}`), ["#2 box/claude", "#3 mac/claude"]);
  });

  test("l'onglet Cooks, signes de vie illisibles : les stations qui tiennent un ticket, sans rien dire de leur présence, et pourquoi", async () => {
    const vu = dessine(await avecLeRailGithub(tableauFige(), github(), undefined, undefined, async () => ({ illisible: "GitHub did not answer" })));
    assert.deepEqual(
      vu.stations?.lignes.map(({ station, etat, presente }) => ({ station, etat, presente })),
      [
        { station: "box/claude", etat: "cooking", presente: undefined },
        { station: "mac/claude", etat: "cooking", presente: undefined },
      ],
    );
    assert.deepEqual(vu.stations?.surGithub, { illisible: "GitHub did not answer" });
  });

  test("plus de cent tickets : chaque page est lue", async () => {
    const appels: string[] = [];
    const cent = Array.from({ length: 100 }, (_, rang) => issue(100 + rang, ["fire"]));
    const vu = dessine(await avecLeRailGithub(tableauFige(), async (chemin, entetes) => (chemin.includes("labels=fire") ? ok(/[?&]page=1$/.test(chemin) ? cent : [issue(300, ["fire"])]) : github({ appels })(chemin, entetes))));
    assert.equal(colonnes(vu)["On the rail"]?.length, 101);
  });

  test("GitHub qui refuse : une lecture ratée — la vue garde le dernier rail lu —, jamais le rail figé", async () => {
    const interrupteurs = new Map<string, boolean>();
    assert.ok((await avecLeRailGithub(tableauFige(), github(), undefined, interrupteurs)).lu);
    const refuse: AppelGitHub = async (chemin, entetes) => (chemin.includes("/contents/") || chemin.includes("labels=fire") ? { status: 403, data: {} } : github()(chemin, entetes));
    const ratee = await avecLeRailGithub(tableauFige(), refuse, undefined, interrupteurs);
    assert.equal(ratee.lu, false);
    assert.match(!ratee.lu ? ratee.raison : "", /^The rail of acme\/kitchen was not read from GitHub: GitHub answered HTTP 403\.$/);
  });

  test("relu avec les ETag : une seconde lecture sans changement redemande chaque chemin sous condition", async () => {
    const memoire: MemoireDesLectures = new Map();
    const conditions: string[] = [];
    const avecEtag: AppelGitHub = async (chemin, entetes) => {
      if (entetes?.["If-None-Match"] !== undefined) {
        conditions.push(chemin);
        return { status: 304, data: null };
      }
      return { ...(await github()(chemin)), etag: `"${chemin}"` };
    };
    const premiere = await avecLeRailGithub(tableauFige(), avecEtag, memoire);
    const seconde = await avecLeRailGithub(tableauFige(), avecEtag, memoire);
    assert.deepEqual(seconde, premiere);
    assert.ok(conditions.some((chemin) => chemin.endsWith("projet.json")) && conditions.some((chemin) => chemin.includes("/issues/2/comments")));
  });
});

// Un ticket mis de côté (#2075) : #7 sorti de la cuisine après ses renvois, #8 en pass retenu par `blocked-on-human` — sa
// livraison touche à ce qui la juge —, #9 sorti à la main sans un mot, #10 sorti puis mis en WAITING par le chef. Le tableau
// figé disait #7 mis de côté, sans raison : sous « outside the columns ».
describe("un ticket mis de côté par `hors-cuisine` ou `blocked-on-human`, sur GitHub seul (#2075)", () => {
  const issuesMisesDeCote = () => [issue(1, ["fire"]), issue(7, ["fire", "hors-cuisine"]), issue(8, ["fire", "in-pass", "blocked-on-human"]), issue(9, ["fire", "hors-cuisine"]), issue(10, ["fire", "hors-cuisine", "waiting"])];
  const commentaires = {
    7: [
      prise(21, "box/claude", "2026-11-04T01:00:00Z"),
      { id: 22, body: "<!-- brigade:renvoi n=3 sha=abc1234 -->\nStation `box/claude`: still not mergeable after 2 sends back — the review requested changes: the empty case is not tested\n\nTaken off the kitchen (`hors-cuisine`): a human decides.", author_association: "OWNER", created_at: "2026-11-04T02:00:00Z" },
      { id: 23, body: "<!-- brigade:manager -->\n**Manager — `hors-cuisine` : ce ticket ne se sert pas sur cette box.**", author_association: "OWNER", created_at: "2026-11-04T02:01:00Z" },
    ],
    8: [{ id: 31, body: "Station `box/claude`: this delivery changes what judges it (`.github/workflows/ci.yml`), so it is not merged on the review alone. Review it and merge it by hand: PR #2326.", author_association: "OWNER", created_at: "2026-11-04T02:30:00Z" }],
  };
  const tableauAvecLe86 = (): TableauLu => {
    const fige = tableauFige();
    const faits = fige.faits as Record<string, unknown>;
    faits.rail = [{ ticket: 7, etat: "86", titre: "Ticket 7", url: `https://github.com/${DEPOT}/issues/7` }];
    faits.attend = [];
    return fige;
  };
  const lire = () => avecLeRailGithub(tableauAvecLe86(), github({ issues: issuesMisesDeCote, commentaires }));

  test("il est dans TODO, jamais sous « outside the columns » ; dans WAITING si le chef l'y a mis", async () => {
    const vu = dessine(await lire());
    const lues = colonnes(vu);
    assert.deepEqual(lues["Todo"], ["#7 set aside", "#8 set aside", "#9 set aside"]);
    assert.deepEqual(lues["Waiting"], ["#10 waiting"]);
    assert.deepEqual(lues["On the rail"], ["#1 queued"]);
    assert.deepEqual(lues["Pass"], []);
    assert.deepEqual(vu.rail.hors, []);
  });

  test("sa carte dit en une ligne pourquoi, du commentaire qui a posé le label ; sans commentaire, qu'il a été posé à la main", async () => {
    const todo = dessine(await lire()).rail.colonnes.find(({ nom }) => nom === "Todo")?.cartes ?? [];
    const dit = Object.fromEntries(todo.map(({ ticket, ligne, miseDeCote, fiche }) => [ticket, { ligne, miseDeCote, attendu: fiche.attendu }]));
    assert.deepEqual(dit[7], { ligne: "off the kitchen after 2 sends back — the review requested changes", miseDeCote: { label: "hors-cuisine", liens: [] }, attendu: "off the kitchen after 2 sends back — the review requested changes" });
    assert.deepEqual(dit[8], { ligne: "changes what judges it: merge PR #2326 by hand", miseDeCote: { label: "blocked-on-human", liens: [2326] }, attendu: "changes what judges it: merge PR #2326 by hand" });
    assert.deepEqual(dit[9], { ligne: SANS_RAISON, miseDeCote: { label: "hors-cuisine", liens: [] }, attendu: SANS_RAISON });
    assert.equal(SANS_RAISON, "set aside by hand — no reason on the issue");
  });

  test("un `#N` de sa ligne s'ouvre : le process principal en tient l'adresse, sur le dépôt du projet", async () => {
    const lu = await lire();
    assert.ok(lu.lu);
    const tenus = tenirFaits();
    tenus.recevoir({ projet: "kitchen", demande: 0, a: LU, sorties: [{ commande: "facts", texte: JSON.stringify(lu.faits) }] });
    assert.equal(tenus.adresse("kitchen", 2326), `https://github.com/${DEPOT}/issues/2326`);
    assert.equal(tenus.adresse("kitchen", 8), `https://github.com/${DEPOT}/issues/8`);
    assert.equal(tenus.adresse("kitchen", 2327), undefined);
  });

  test("ni prise ni cook pour un ticket mis de côté, et la ligne `rail` de `status` le compte à part", async () => {
    const lu = await lire();
    assert.ok(lu.lu);
    assert.deepEqual(lu.faits?.cooks, []);
    assert.match(statusDuTableau(lu), /^rail {7}1 WAITING · 1 queued · 3 set aside$/m);
  });
});

describe("un projet de l'ancien chemin : le même rail qu'avant", () => {
  for (const interrupteur of [false, "absent", "refuse"] as const) {
    test(`interrupteur ${interrupteur === false ? "éteint" : interrupteur === "absent" ? "absent" : "illisible, jamais lu posé"} : le tableau, ses états refaits de GitHub (#2059)`, async () => {
      const appels: string[] = [];
      const lu = await avecLeRailGithub(tableauFige(), github({ interrupteur, appels }));
      assert.deepEqual(lu, await avecLesEtatsGithub(tableauFige(), github({ interrupteur })));
      assert.ok(!appels.some((chemin) => chemin.includes("labels=fire") || chemin.includes("/comments")), "nothing of the GitHub-only rail is read");
    });
  }

  test("l'interrupteur se lit dans le contenu de `projet.json`, vrai seulement s'il le dit", () => {
    assert.equal(interrupteurLu(projetJson({ githubOnlyState: true }).data), true);
    assert.equal(interrupteurLu(projetJson({ githubOnlyState: "yes" }).data), false);
    assert.equal(interrupteurLu(projetJson({}).data), false);
    assert.equal(interrupteurLu({ content: "pas du base64 de JSON" }), false);
    assert.equal(interrupteurLu(null), false);
  });
});
