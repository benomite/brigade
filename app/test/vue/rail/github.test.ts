// Le rail et les cooks d'un projet, lus de GitHub seul (#2220 ; seul chemin depuis #2061) : la vue du rail range ses
// issues `fire` d'après leurs labels et leurs PR — en attente, prises, en pass, en WAITING, mises de côté (#2075) —, et
// l'onglet Cooks montre les stations d'après leurs commentaires de prise et leurs signes de vie (#2358). Joué sur un faux
// GitHub, puis rendu par le rail de l'app. Son TODO est ce qui attend le chef lu de GitHub, la lecture même que le
// second relaie (#2460).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { porter } from "../../../src/bon.ts";
import { gestesDeCarte } from "../../../src/gestes-fiche.ts";
import { comprendre, SANS_RAISON, tableau as tableauDe, tenirFaits, type Faits, type Tableau } from "../../../src/faits.ts";
import type { AppelGitHub, ReponseGitHub } from "../../../src/tableau/client.ts";
import { lireLeTableauDuDepot, type LectureDuTableauDuDepot, type TableauLu } from "../../../src/tableau/lecture.ts";
import { avecCeQuiAttendLeChef, blocDuChef, lireCeQuiAttendLeChef } from "../../../src/tableau/attente-du-chef.ts";
import type { MemoireDesLectures } from "../../../src/tableau/rail-github.ts";
import { statusDuTableau } from "../../../src/tableau/rail.ts";
import { avecLeRail, lireLeRailSurGithub, type SignesDeVie } from "../../../src/vue/rail/github.ts";

const DEPOT = "acme/kitchen";
const ok = (data: unknown, etag?: string): ReponseGitHub => ({ status: 200, data, ...(etag === undefined ? {} : { etag }) });
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
type Monde = { fermees?: unknown[]; base?: string; issues?: () => unknown[]; commentaires?: Record<number, unknown[]>; appels?: string[] };
function github({ fermees, base = "success", issues, commentaires = {}, appels = [] }: Monde = {}): AppelGitHub {
  return async (chemin) => {
    appels.push(chemin);
    if (chemin.includes("/issues?") && chemin.includes("labels=fire")) {
      return ok(issues?.() ?? [issue(1, ["fire", "prio:2"]), issue(2, ["fire", "taken", "prio:1"]), issue(3, ["fire", "in-pass"]), issue(4, ["fire", "waiting", "taken"]), issue(5, ["fire", "in-pass"]), issue(40, ["fire"], { pull_request: {} })]);
    }
    // Toutes les issues ouvertes : ce qui est avant le rail (tableau/lecture.ts).
    if (chemin.includes("/issues?")) return ok([issue(1, ["fire"]), issue(2, ["fire", "taken"]), issue(6, [])]);
    if (chemin.includes("/pulls?state=closed")) return ok(fermees ?? []);
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

const LU = new Date("2026-11-04T03:02:03.076Z");
// La lecture de l'app (main.ts, `lireLeTableau`) : le rail, puis ce qui attend le chef.
const lire = async (appeler: AppelGitHub, memoire?: MemoireDesLectures, signes?: () => Promise<SignesDeVie>) =>
  avecCeQuiAttendLeChef(await lireLeTableauDuDepot({ depot: DEPOT, appeler, maintenant: () => LU, ...(memoire === undefined ? {} : { memoire }), ...(signes === undefined ? {} : { signes }) }), appeler);

// Ce que la vue dessine de la lecture : le tableau de `facts`, avec la ligne de chaque ticket que `status` écrit.
function dessine(lu: LectureDuTableauDuDepot): Tableau {
  assert.ok(lu.lu, "the rail is read");
  const faits = comprendre(JSON.stringify(lu.faits));
  assert.ok(!("informe" in faits), `facts are in shape: ${"informe" in faits ? faits.informe : ""}`);
  return tableauDe(faits as Faits, undefined, { texte: statusDuTableau(lu), a: lu.luLe });
}
const colonnes = (vu: Tableau) => Object.fromEntries(vu.rail.colonnes.map(({ nom, cartes }) => [nom, cartes.map(({ ticket, mot, etat }) => `#${ticket} ${mot ?? etat}`)]));

describe("le rail d'un projet : ses issues, leurs labels et leurs PR", () => {
  test("ses issues `fire` rangées par état — en attente, prises, en pass, WAITING", async () => {
    const vu = dessine(await lire(github()));
    const lues = colonnes(vu);
    assert.deepEqual(lues["On the rail"], ["#1 queued", "#5 queued"]);
    assert.deepEqual(lues["Taken"], ["#2 taken"]);
    assert.deepEqual(lues["Pass"], ["#3 in pass"]);
    assert.deepEqual(lues["Waiting"], ["#4 waiting"]);
    // Les compteurs sont ceux de GitHub ; ni les livrés ni TODO ne sont comptés par la lecture du rail.
    assert.deepEqual(vu.compteurs.map(({ nombre }) => nombre), [5, 1, 1, 0, 0]);
    // Aucun journal de station n'est lu : aucune panne n'est dite.
    assert.equal(vu.panne, undefined);
  });

  test("une épique dont le corps liste les tickets garde `fire` et sa `prio:`, et n'est pas sur le rail (#2618)", async () => {
    const liste = "Split.\n\n<!-- brigade:tickets -->\n**0/2 servi.**\n\n| #11 | A | ouvert |\n<!-- /brigade:tickets -->";
    const lu = await lireLeRailSurGithub({ depot: DEPOT, appeler: github({ issues: () => [issue(1, ["fire", "prio:2"]), issue(2583, ["fire", "prio:1", "model:opus", "effort:medium"], { body: liste })] }), maintenant: () => LU });
    assert.deepEqual(lu.tickets.map(({ ticket }) => ticket), [1]);
  });

  test("la cuisine est dite ouverte, et `status` dit le rail et ses cooks d'après GitHub", async () => {
    const lu = await lire(github());
    assert.ok(lu.lu);
    assert.equal(dessine(lu).mot, "open");
    const status = statusDuTableau(lu);
    assert.match(status, /^rail {7}1 taken · 1 in pass · 1 WAITING · 2 queued$/m);
    assert.match(status, /^cooks {6}2 running$/m);
  });

  test("ce que la lecture porte d'autre reste : ses autres rubriques, son TODO compté, ses livrés lus des PR mergées ; le rail et les cooks sont refaits", async () => {
    const avant: TableauLu = {
      lu: true,
      depot: DEPOT,
      luLe: "2026-11-04T01:00:00.000Z",
      cuisine: { rubriques: [{ titre: "kitchen", lignes: ["open"] }, { titre: "rail", lignes: ["9 queued"] }, { titre: "cooks", lignes: ["9 running"] }] },
      faits: { etat: "ouverte", compteurs: { rail: 9, auTravail: 9, aLaPass: 9, attend: 2, livres24h: 4 }, rail: [] },
      file: [],
      bilans: [],
      lignesDuRail: [],
      activites: [],
    };
    const lu = avecLeRail(avant, await lireLeRailSurGithub({ depot: DEPOT, appeler: github(), maintenant: () => LU }));
    assert.equal(lu.luLe, LU.toISOString());
    assert.deepEqual(lu.cuisine.rubriques, [
      { titre: "kitchen", lignes: ["open"] },
      { titre: "rail", lignes: ["1 taken · 1 in pass · 1 WAITING · 2 queued"] },
      { titre: "cooks", lignes: ["2 running"] },
    ]);
    assert.deepEqual(lu.faits.compteurs, { rail: 5, auTravail: 1, aLaPass: 1, attend: 2, livres24h: 0 });
  });

  test("base rouge : le ticket en pass est « base red »", async () => {
    assert.deepEqual(colonnes(dessine(await lire(github({ base: "failure" }))))["Pass"], ["#3 base red"]);
  });

  test("les bons disent qui tient chaque ticket et depuis quand, sa priorité, et la PR d'un ticket en pass", async () => {
    const lu = await lire(github());
    assert.ok(lu.lu);
    const lignes = new Map(lu.lignesDuRail.map(({ ticket, ligne }) => [ticket, ligne.replace(/^ {2}#\d+ {2}/, "")]));
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
    // L'âge du rail est celui de la lecture de GitHub.
    assert.equal(lu.luLe, LU.toISOString());
    assert.equal(lu.faits.lu, LU.toISOString());
    assert.deepEqual(
      (lu.faits.rail as { ticket: number; depuis?: string }[]).map(({ ticket, depuis }) => [ticket, depuis ?? null]),
      [[2, "2026-11-04T02:58:00Z"], [1, null], [3, "2026-11-04T02:30:00Z"], [4, null], [5, null]],
    );
  });

  test("l'onglet Cooks : ses stations dites de GitHub — une qui cuit, une qui attend, une tue (#2358)", async () => {
    const signe = (name: string, lastSeen: string) => ({ name, lastSeen, stoppedAt: null, refreshMs: 120_000, selection: [DEPOT] });
    const signes = { lus: [signe("box", "2026-11-04T03:01:00Z"), signe("mac", "2026-11-04T03:00:30Z"), signe("atelier", "2026-11-04T03:01:30Z"), signe("pc", "2026-11-02T18:40:00Z")] };
    const vu = dessine(await lire(github(), undefined, async () => signes));
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
    assert.deepEqual(vu.cooks.enCours.map(({ ticket, station }) => `#${ticket} ${station}`), ["#2 box/claude", "#3 mac/claude"]);
  });

  test("l'onglet Cooks, signes de vie illisibles : les stations qui tiennent un ticket, sans rien dire de leur présence, et pourquoi", async () => {
    const vu = dessine(await lire(github(), undefined, async () => ({ illisible: "GitHub did not answer" })));
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
    const vu = dessine(await lire(async (chemin, entetes) => (chemin.includes("labels=fire") ? ok(/[?&]page=1$/.test(chemin) ? cent : [issue(300, ["fire"])]) : github({ appels })(chemin, entetes))));
    assert.equal(colonnes(vu)["On the rail"]?.length, 101);
  });

  test("GitHub qui refuse : la lecture du rail lève, et la lecture du projet échoue en le disant — jamais un rail vide", async () => {
    const refuse: AppelGitHub = async (chemin, entetes) => (chemin.includes("labels=fire") ? { status: 403, data: {} } : github()(chemin, entetes));
    await assert.rejects(lireLeRailSurGithub({ depot: DEPOT, appeler: refuse }), /^Error: GitHub answered HTTP 403$/);
    const ratee = await lire(refuse);
    assert.equal(ratee.lu, false);
    assert.equal(!ratee.lu ? ratee.raison : "", "GitHub refused to read the rail of acme/kitchen (HTTP 403).");
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
    const premiere = await lire(avecEtag, memoire);
    const seconde = await lire(avecEtag, memoire);
    assert.deepEqual(seconde, premiere);
    assert.ok(conditions.some((chemin) => chemin.includes("labels=fire")) && conditions.some((chemin) => chemin.includes("/issues/2/comments")));
  });
});

// Un ticket mis de côté (#2075) : #7 sorti de la cuisine après ses renvois, #8 en pass retenu par `blocked-on-human` — sa
// livraison touche à ce qui la juge —, #9 sorti à la main sans un mot, #10 sorti puis mis en WAITING par le chef.
describe("un ticket mis de côté par `served-elsewhere` ou `blocked-on-human`, sur GitHub seul (#2075)", () => {
  const issuesMisesDeCote = () => [issue(1, ["fire"]), issue(7, ["fire", "served-elsewhere"]), issue(8, ["fire", "in-pass", "blocked-on-human"]), issue(9, ["fire", "served-elsewhere"]), issue(10, ["fire", "served-elsewhere", "waiting"])];
  const commentaires = {
    7: [
      prise(21, "box/claude", "2026-11-04T01:00:00Z"),
      { id: 22, body: "<!-- brigade:renvoi n=3 sha=abc1234 -->\nStation `box/claude`: still not mergeable after 2 sends back — the review requested changes: the empty case is not tested\n\nTaken off the kitchen (`served-elsewhere`): a human decides.", author_association: "OWNER", created_at: "2026-11-04T02:00:00Z" },
      { id: 23, body: "<!-- brigade:manager -->\n**Manager — `served-elsewhere` : ce ticket ne se sert pas sur cette box.**", author_association: "OWNER", created_at: "2026-11-04T02:01:00Z" },
    ],
    8: [{ id: 31, body: "Station `box/claude`: this delivery changes what judges it (`.github/workflows/ci.yml`), so it is not merged on the review alone. Review it and merge it by hand: PR #2326.", author_association: "OWNER", created_at: "2026-11-04T02:30:00Z" }],
  };
  const lireMisDeCote = () => lire(github({ issues: issuesMisesDeCote, commentaires }));

  test("seul `blocked-on-human` entre dans TODO ; les autres restent sur le rail, jamais sous « outside the columns » ; dans WAITING si le chef l'y a mis", async () => {
    const vu = dessine(await lireMisDeCote());
    const lues = colonnes(vu);
    assert.deepEqual(lues["Awaiting you"], ["#8 set aside"]);
    assert.deepEqual(lues["Waiting"], ["#10 waiting"]);
    assert.deepEqual(lues["On the rail"], ["#1 queued", "#7 set aside", "#9 set aside"]);
    assert.deepEqual(lues["Pass"], []);
    assert.deepEqual(vu.rail.hors, []);
  });

  test("sa carte dit pourquoi : celle de TODO pose sa question, celles du rail disent leur raison — ou qu'elles ont été posées à la main", async () => {
    const vu = dessine(await lireMisDeCote());
    const todo = vu.rail.colonnes.find(({ nom }) => nom === "Awaiting you")?.cartes ?? [];
    assert.deepEqual(
      todo.map(({ ticket, ligne, miseDeCote, fiche }) => ({ ticket, ligne, miseDeCote, attendu: fiche.attendu })),
      [{ ticket: 8, ligne: "Merge PR #2326 by hand? It changes what judges it.", miseDeCote: { label: "blocked-on-human", liens: [2326] }, attendu: "Merge PR #2326 by hand? It changes what judges it." }],
    );
    const rail = vu.rail.colonnes.find(({ nom }) => nom === "On the rail")?.cartes ?? [];
    const dit = Object.fromEntries(rail.map(({ ticket, ligne }) => [ticket, ligne]));
    assert.equal(dit[7], "Will not start: its delivery was sent back to a cook 2 times and is still not mergeable.");
    assert.equal(dit[9], "Will not start: it was set aside by hand, and no comment on the issue says why.");
    // Le message de la station reste derrière « details », en entier.
    assert.match(rail.find(({ ticket }) => ticket === 7)?.refus?.brut ?? "", /^still not mergeable after 2 sends back — /);
    assert.equal(SANS_RAISON, "set aside by hand — no reason on the issue");
  });

  test("un `#N` de sa ligne s'ouvre : le process principal en tient l'adresse, sur le dépôt du projet", async () => {
    const lu = await lireMisDeCote();
    assert.ok(lu.lu);
    const tenus = tenirFaits();
    tenus.recevoir({ projet: "kitchen", demande: 0, a: LU.toISOString(), sorties: [{ commande: "facts", texte: JSON.stringify(lu.faits) }] });
    assert.equal(tenus.adresse("kitchen", 2326), `https://github.com/${DEPOT}/pull/2326`);
    assert.equal(tenus.adresse("kitchen", 8), `https://github.com/${DEPOT}/issues/8`);
    assert.equal(tenus.adresse("kitchen", 2327), undefined);
  });

  test("ni prise ni cook pour un ticket mis de côté, et la ligne `rail` de `status` le compte à part", async () => {
    const lu = await lireMisDeCote();
    assert.ok(lu.lu);
    assert.deepEqual(lu.faits?.cooks, []);
    assert.match(statusDuTableau(lu), /^rail {7}1 WAITING · 1 queued · 3 set aside$/m);
  });
});

// Le Todo du chef du 2026-11-05 (#2422), tel que ses issues le disaient : treize cartes, aucune ne demandait rien — onze
// `served-elsewhere` de cause technique, deux `blocked-on-human` (#2408, #2322) dont la ligne était un constat, et #1683, l'issue du
// tableau de la cuisine. Les commentaires sont ceux que la station écrit (runtime/src/brigade-github.ts, renvois.ts).
describe("le Todo du chef ne tient que ce qui lui demande quelque chose, et chaque carte le demande (#2422)", () => {
  const renvoi = (n: number, raison: string) => ({ id: n, body: `<!-- brigade:renvoi n=3 sha=7579211 -->\nStation \`box/claude\`: still not mergeable after 2 sends back — ${raison}\n\nTaken off the kitchen (\`served-elsewhere\`): a human decides.`, author_association: "OWNER", created_at: "2026-11-05T01:00:00Z" });
  const sansLivraison = (n: number) => ({ id: n, body: "<!-- brigade:echec n=3 -->\nStation `box/claude`: the cook stopped without a delivery — the cook committed nothing\n\nTaken off the kitchen (`served-elsewhere`) after 3 cooks without a delivery: a human decides.", author_association: "OWNER", created_at: "2026-11-05T01:00:00Z" });
  const juge = (n: number, pr: number) => ({ id: n, body: `Station \`box/claude\`: this delivery changes what judges it (\`.github/workflows/ci.yml\`, \`.claude/brigade/gates.sh\`), so it is not merged on the review alone. Review it and merge it by hand: PR #${pr}.`, author_association: "OWNER", created_at: "2026-11-05T01:00:00Z" });
  const conflit = "the PR conflicts with the base: merge the base into the branch, resolve the conflicts, run the gates, and commit";
  const ciRouge = "the CI is red on `7579211` (PR #2400):\n- `app tests`";
  const revue = "the review requested changes on `7579211` (PR #2401):\n\nThe empty case is not tested.";
  const techniques: Record<number, unknown> = { 2301: renvoi(1, conflit), 2302: renvoi(2, ciRouge), 2303: renvoi(3, revue), 2304: sansLivraison(4), 2305: renvoi(5, conflit), 2306: renvoi(6, ciRouge), 2307: sansLivraison(7), 2308: renvoi(8, revue), 2309: renvoi(9, conflit), 2310: sansLivraison(10), 2311: renvoi(11, ciRouge) };
  const issues = () => [
    ...Object.keys(techniques).map((n) => issue(Number(n), ["fire", "served-elsewhere"])),
    issue(2408, ["fire", "in-pass", "blocked-on-human"]),
    issue(2322, ["fire", "in-pass", "blocked-on-human"]),
    issue(1683, ["fire", "served-elsewhere", "kitchen-board"]),
  ];
  const commentaires = { ...Object.fromEntries(Object.entries(techniques).map(([n, c]) => [Number(n), [c]])), 2408: [juge(21, 2416)], 2322: [juge(22, 2325)] };
  const lireLeTodo = async () => dessine(await lire(github({ issues, commentaires })));

  test("Todo montre deux cartes, #2408 et #2322, chacune une question qui nomme sa PR", async () => {
    const vu = await lireLeTodo();
    const todo = vu.rail.colonnes.find(({ nom }) => nom === "Awaiting you")?.cartes ?? [];
    assert.deepEqual(todo.map(({ ticket, ligne }) => [ticket, ligne]), [
      [2322, "Merge PR #2325 by hand? It changes what judges it."],
      [2408, "Merge PR #2416 by hand? It changes what judges it."],
    ]);
    for (const carte of todo) assert.ok(!gestesDeCarte(carte).some(({ id }) => (id as string) === "merger"), `#${carte.ticket} offers no merge button: the PR is merged on GitHub`);
    assert.deepEqual(todo.map(({ miseDeCote }) => miseDeCote?.liens), [[2325], [2416]]);
  });

  test("les onze `served-elsewhere` techniques sont sur le rail, avec leur ligne, et aucun dans Todo", async () => {
    const vu = await lireLeTodo();
    const rail = vu.rail.colonnes.find(({ nom }) => nom === "On the rail")?.cartes ?? [];
    assert.equal(rail.length, 11);
    assert.deepEqual([...new Set(rail.map(({ ligne }) => ligne))].sort(), [
      "Will not start: 3 cooks in a row stopped without delivering anything.",
      "Will not start: its delivery was sent back to a cook 2 times and is still not mergeable.",
    ]);
    // Le message brut, en entier, est gardé pour « details ».
    assert.ok(rail.every(({ refus }) => (refus?.brut ?? "").includes(" — ")));
    assert.ok(!(vu.rail.colonnes.find(({ nom }) => nom === "Awaiting you")?.cartes ?? []).some(({ ticket }) => ticket in techniques));
  });

  test("#1683, l'issue du tableau de la cuisine, ne se montre nulle part", async () => {
    const vu = await lireLeTodo();
    const partout = [...vu.rail.colonnes.flatMap(({ cartes }) => cartes), ...vu.rail.hors];
    assert.ok(!partout.some(({ ticket }) => ticket === 1683));
  });

  test("un `served-elsewhere` dont le commentaire marqué pose une question de produit entre dans Todo, avec cette question", async () => {
    const question = { id: 40, body: "<!-- brigade:todo kind=product-question -->\nShould the export keep the old column order?\n\nBoth are defensible.", author_association: "OWNER", created_at: "2026-11-05T02:00:00Z" };
    const vu = dessine(await lire(github({ issues: () => [issue(2312, ["fire", "served-elsewhere"])], commentaires: { 2312: [renvoi(1, conflit), question] } })));
    const todo = vu.rail.colonnes.find(({ nom }) => nom === "Awaiting you")?.cartes ?? [];
    // La question n'est dite qu'une fois, sur la carte (#2434) : la ligne dit ce que sa sorte attend.
    assert.deepEqual(todo.map(({ ticket, ligne, chef, todo: carte }) => ({ ticket, ligne, chef, question: carte?.question })), [
      { ticket: 2312, ligne: "A product question waits for your answer.", chef: { sorte: "product-question", texte: "Should the export keep the old column order?\n\nBoth are defensible." }, question: "Should the export keep the old column order?" },
    ]);
  });
});

describe("ce qui attend le chef : la lecture du second", () => {
  test("la même entrée dans TODO que dans le bloc qu'il relaie, et rien d'autre", async () => {
    const question = { id: 40, body: "<!-- brigade:todo kind=product-question -->\nShould the export keep the old column order?", author_association: "OWNER", created_at: "2026-11-05T02:00:00Z" };
    const monde = () => github({ issues: () => [issue(2312, ["fire", "served-elsewhere"])], commentaires: { 2312: [question] } });
    const lu = await lire(monde());
    assert.ok(lu.lu);
    const attente = await lireCeQuiAttendLeChef({ depot: DEPOT, appeler: monde(), maintenant: () => LU });
    assert.ok(attente.lue);
    assert.deepEqual(lu.file.map(({ ticket }) => ticket), [2312]);
    assert.deepEqual(statusDuTableau(lu).split("\n").filter((ligne) => ligne.includes("#2312")), blocDuChef(attente).filter((ligne) => ligne.includes("#2312")));
    const todo = dessine(lu).rail.colonnes.find(({ nom }) => nom === "Awaiting you")?.cartes ?? [];
    assert.deepEqual(todo.map(({ ticket }) => ticket), [2312]);
  });

  test("ce qui attend le chef qui ne se lit pas : une lecture ratée, jamais un TODO vide", async () => {
    const rail = github();
    const refuse: AppelGitHub = async (chemin) => (chemin.includes("labels=chef-todo") ? { status: 403, data: { message: "API rate limit exceeded" } } : rail(chemin));
    const lu = await lire(refuse);
    assert.ok(!lu.lu);
    assert.match(lu.raison, /^What awaits the chef in acme\/kitchen was not read from GitHub: GitHub answered HTTP 403/);
  });
});

describe("la colonne Served : les issues fermées par une PR mergée en 24 h", () => {
  const fermee = (n: number, mergeLe: string | null, station = "box/claude") => ({
    number: 1000 + n, title: `#${n} — Ticket ${n}`, html_url: `https://github.com/${DEPOT}/pull/${1000 + n}`, created_at: "2026-11-05T10:00:00Z",
    updated_at: mergeLe ?? "2026-11-05T12:00:00Z", merged_at: mergeLe, head: { ref: `cook/${n}-github` }, body: `Closes #${n}\n\nCooked by station \`${station}\`.`,
  });

  test("brigade le 2026-11-06 : une trentaine de tickets servis, tous dans Served, le plus récent d'abord", async () => {
    const trente = Array.from({ length: 30 }, (_, i) => fermee(100 + i, new Date(Date.parse("2026-11-04T03:00:00Z") - (i + 1) * 40 * 60_000).toISOString()));
    const vieille = fermee(99, "2026-11-02T00:00:00Z");
    const sansMerge = fermee(98, null);
    const vu = dessine(await lire(github({ fermees: [...trente, sansMerge, vieille] })));
    const servis = colonnes(vu)["Served"] ?? [];
    assert.equal(servis.length, 30);
    assert.equal(servis[0]?.split(" ")[0], "#100");
    assert.ok(!servis.some((c) => c.startsWith("#98 ") || c.startsWith("#99 ")), "neither unmerged nor older than 24 h");
    assert.equal(vu.compteurs.find(({ libelle }) => libelle === "served 24 h")?.nombre, 30);
  });

  test("une seule lecture des PR fermées par rafraîchissement", async () => {
    const appels: string[] = [];
    await lire(github({ fermees: [fermee(7, "2026-11-04T01:00:00Z")], appels }));
    assert.equal(appels.filter((c) => c.includes("/pulls?state=closed")).length, 1);
  });
});
