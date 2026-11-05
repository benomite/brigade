// Le rail et les cooks d'un projet, lus de GitHub seul (#2220 ; seul chemin depuis #2061) : la vue du rail range ses
// issues `fire` d'après leurs labels et leurs PR — en attente, prises, en pass, en WAITING —, et l'onglet Cooks montre
// les stations qui les tiennent d'après leurs commentaires de prise. Joué sur un faux GitHub, puis rendu par le rail de
// l'app.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { porter } from "../../../src/bon.ts";
import { comprendre, tableau as tableauDe, type Faits, type Tableau } from "../../../src/faits.ts";
import type { AppelGitHub, ReponseGitHub } from "../../../src/tableau/client.ts";
import { lireLeTableauDuDepot, type LectureDuTableauDuDepot, type TableauLu } from "../../../src/tableau/lecture.ts";
import type { MemoireDesLectures } from "../../../src/tableau/rail-github.ts";
import { statusDuTableau } from "../../../src/tableau/rail.ts";
import { avecLeRail, lireLeRailSurGithub } from "../../../src/vue/rail/github.ts";

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
type Monde = { base?: string; issues?: () => unknown[]; appels?: string[] };
function github({ base = "success", issues, appels = [] }: Monde = {}): AppelGitHub {
  return async (chemin) => {
    appels.push(chemin);
    if (chemin.includes("/issues?") && chemin.includes("labels=fire")) {
      return ok(issues?.() ?? [issue(1, ["fire", "prio:2"]), issue(2, ["fire", "taken", "prio:1"]), issue(3, ["fire", "in-pass"]), issue(4, ["fire", "waiting", "taken"]), issue(5, ["fire", "in-pass"]), issue(40, ["fire"], { pull_request: {} })]);
    }
    // Toutes les issues ouvertes : ce qui est avant le rail (tableau/lecture.ts).
    if (chemin.includes("/issues?")) return ok([issue(1, ["fire"]), issue(2, ["fire", "taken"]), issue(6, [])]);
    if (chemin.includes("/pulls?")) return ok([{ number: 40, state: "open", html_url: `https://github.com/${DEPOT}/pull/40`, created_at: "2026-11-04T02:30:00Z", head: { ref: "cook/3-github" }, body: "" }]);
    if (chemin === `/repos/${DEPOT}`) return ok({ default_branch: "main" });
    if (chemin.includes("/commits/main/check-runs")) return ok({ check_runs: [{ conclusion: base }] });
    if (chemin.includes("/issues/2/comments")) return ok([prise(11, "box/claude", "2026-11-04T02:58:00Z")]);
    if (chemin.includes("/issues/3/comments")) return ok([prise(12, "mac/claude", "2026-11-04T01:00:00Z"), prise(13, "box/claude", "2026-11-04T01:00:05Z")]);
    if (/\/issues\/\d+\/(comments|events)/.test(chemin)) return ok([]);
    return { status: 404, data: {} };
  };
}

const LU = new Date("2026-11-04T03:02:03.076Z");
const lire = (appeler: AppelGitHub, memoire?: MemoireDesLectures) => lireLeTableauDuDepot({ depot: DEPOT, appeler, maintenant: () => LU, ...(memoire === undefined ? {} : { memoire }) });

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

  test("la cuisine est dite ouverte, et `status` dit le rail et ses cooks d'après GitHub", async () => {
    const lu = await lire(github());
    assert.ok(lu.lu);
    assert.equal(dessine(lu).mot, "open");
    const status = statusDuTableau(lu);
    assert.match(status, /^rail {7}1 taken · 1 in pass · 1 WAITING · 2 queued$/m);
    assert.match(status, /^cooks {6}2 running$/m);
  });

  test("ce que la lecture porte d'autre reste : ses autres rubriques, ses livrés et TODO comptés ; le rail et les cooks sont refaits", async () => {
    const avant: TableauLu = {
      lu: true,
      depot: DEPOT,
      luLe: "2026-11-04T01:00:00.000Z",
      cuisine: { rubriques: [{ titre: "kitchen", lignes: ["open"] }, { titre: "rail", lignes: ["9 queued"] }, { titre: "cooks", lignes: ["9 running"] }] },
      faits: { etat: "ouverte", compteurs: { rail: 9, auTravail: 9, aLaPass: 9, attend: 2, livres24h: 4 }, rail: [] },
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
    assert.deepEqual(lu.faits.compteurs, { rail: 5, auTravail: 1, aLaPass: 1, attend: 2, livres24h: 4 });
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

  test("l'onglet Cooks : une station par commentaire de prise qui tient, ses cooks dedans", async () => {
    const vu = dessine(await lire(github()));
    assert.deepEqual(
      vu.stations?.lignes.map(({ station, etat, cooks }) => ({ station, etat, cooks: cooks.map(({ ticket }) => ticket) })),
      [
        { station: "mac/claude", etat: "cooking", cooks: [3] },
        { station: "box/claude", etat: "cooking", cooks: [2] },
      ],
    );
    assert.deepEqual(vu.cooks.enCours.map(({ ticket, station }) => `#${ticket} ${station}`), ["#2 box/claude", "#3 mac/claude"]);
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
