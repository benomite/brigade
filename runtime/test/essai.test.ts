// L'essai à blanc : ce que la pass aurait mergé sous grant, ce qu'elle a vu de
// la base sans rien y jouer, et ce que le chef a fait à la place. Tout se joue
// en processus : un faux dépôt, et des faits posés à la main.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { direEssai, lireDepuis, lireEssais, montrerEssais, repeterLeMerge, type DepotDEssai } from "../src/essai.ts";
import type { Evenement, Fait } from "../src/evenements.ts";
import { GrantRefuse } from "../src/grant.ts";
import type { EtatDeLaBase } from "../src/projections/pass.ts";

const pr = (numero: number) => `https://github.com/o/r/pull/${numero}`;
const LIVRAISON = { branch: "cook/a", checkedBase: null };
const personne = () => false;

// Un dépôt dont la base a avancé de `retard` commits, en recevant `recus`.
const depot = (retard: number, recus: string[] = [], change: Partial<DepotDEssai> = {}): DepotDEssai => ({
  connait: () => true,
  rapatrier: async () => "base-1",
  livree: (branche) => `origin/${branche}`,
  retard: () => ({ depart: "base-0", commits: retard }),
  arrives: () => recus,
  changes: () => ["travail.txt", "docs/runtime.md"],
  ...change,
});

const ROUGE: EtatDeLaBase = { sha: "rouge-1", outcome: "red", at: "2026-10-08T10:00:00.000Z", tickets: [], redSince: "2026-10-08T10:00:00.000Z", unplayed: null, reason: null, recheck: null };

describe("la pass répète un merge qu'elle ne fait pas", () => {
  test("la base n'a pas bougé : elle aurait mergé", async () => {
    assert.deepEqual(await repeterLeMerge(depot(0), LIVRAISON, null, personne), { outcome: "merge", head: "base-1", behind: 0, overlap: [], reason: null });
  });

  test("la base a avancé sans toucher aux fichiers de la livraison, chemins communs mis à part : elle aurait mergé sans rejeu", async () => {
    const vue = await repeterLeMerge(depot(2, ["voisin.ts", "docs/runtime.md"]), LIVRAISON, null, (fichier) => fichier.startsWith("docs/"));
    assert.deepEqual(vue, { outcome: "merge", head: "base-1", behind: 2, overlap: [], reason: null });
  });

  test("la base a avancé sur ses fichiers : un rejeu des gates aurait tranché — il n'est pas joué, les fichiers croisés sont nommés", async () => {
    const vue = await repeterLeMerge(depot(3, ["travail.txt", "voisin.ts"]), LIVRAISON, null, personne);
    assert.deepEqual(vue, { outcome: "replay", head: "base-1", behind: 3, overlap: ["travail.txt"], reason: null });
  });

  test("déjà rejouée verte sur cette base-là : elle aurait mergé", async () => {
    const vue = await repeterLeMerge(depot(3, ["travail.txt"]), { branch: "cook/a", checkedBase: "base-1" }, null, personne);
    assert.deepEqual(vue, { outcome: "merge", head: "base-1", behind: 3, overlap: [], reason: "replayed" });
  });

  test("la base est rouge : elle aurait attendu, et le dépôt n'est pas même rapatrié", async () => {
    const vue = await repeterLeMerge(depot(0, [], { rapatrier: () => assert.fail("rien à rapatrier") }), LIVRAISON, ROUGE, personne);
    assert.deepEqual(vue, { outcome: "wait", head: "rouge-1", behind: null, overlap: [], reason: "base-red" });
  });

  test("ce qu'elle ne peut pas regarder, elle ne le devine pas : branche perdue, origine injoignable", async () => {
    assert.deepEqual(await repeterLeMerge(depot(0, [], { connait: () => false }), LIVRAISON, null, personne), { outcome: "unknown", head: null, behind: null, overlap: [], reason: "branch-lost" });
    assert.deepEqual(await repeterLeMerge(depot(0), { branch: null, checkedBase: null }, null, personne), { outcome: "unknown", head: null, behind: null, overlap: [], reason: "branch-lost" });
    const panne = depot(0, [], { rapatrier: () => Promise.reject(new Error("git fetch : fatal: unable to access")) });
    assert.deepEqual(await repeterLeMerge(panne, LIVRAISON, null, personne), { outcome: "unknown", head: null, behind: null, overlap: [], reason: "git fetch : fatal: unable to access" });
  });
});

// Un journal posé à la main : chaque fait prend la seconde suivante.
function journal() {
  const faits: Evenement[] = [];
  const noter = (fait: Fait, ticket: number | null = 17, at?: string) => {
    const seq = faits.length + 1;
    faits.push({ seq, at: at ?? `2026-10-08T10:00:${String(seq).padStart(2, "0")}.000Z`, project: "brigade", ticket, author: "pass", ...fait } as Evenement);
  };
  const repeter = (ticket: number, numero: number, change: Record<string, unknown> = {}, at?: string) =>
    noter(
      {
        type: "pass.rehearsed",
        payload: { action: "merge", pr: pr(numero), number: numero, sha: `abcdef0${numero}`, branch: `cook/${numero}`, base: "v2", verdict: 40 + numero, outcome: "merge", head: "base-1", behind: 0, overlap: [], reason: null, ...change },
      } as Fait,
      ticket,
      at,
    );
  const merger = (ticket: number, numero: number, sha = `abcdef0${numero}`, by: "pass" | "outside" = "outside") =>
    noter({ type: "merge.done", payload: { pr: pr(numero), sha, by, actor: "benomite", reconciled: false } }, ticket);
  return { faits, noter, repeter, merger };
}

describe("ce qui aurait été mergé, et ce que le chef a fait à la place", () => {
  test("une livraison par PR, avec ce qu'elle est devenue : mergée à la main, sur le même commit ou un autre, fermée, encore ouverte", () => {
    const { faits, noter, repeter, merger } = journal();
    repeter(17, 1);
    repeter(18, 2);
    repeter(19, 3);
    repeter(20, 4);
    merger(17, 1);
    merger(18, 2, "fedcba9");
    noter({ type: "pass.pr-closed", payload: { pr: pr(3) } }, 19);

    const { essais } = lireEssais(faits, null);
    assert.deepEqual(
      essais.map((essai) => [essai.ticket, essai.pr, essai.sha, essai.verdict, essai.suite.quoi]),
      [
        [17, pr(1), "abcdef01", 41, "merged"],
        [18, pr(2), "abcdef02", 42, "merged"],
        [19, pr(3), "abcdef03", 43, "closed"],
        [20, pr(4), "abcdef04", 44, "open"],
      ],
    );
    assert.deepEqual(essais[0]?.suite, { quoi: "merged", at: "2026-10-08T10:00:05.000Z", sha: "abcdef01", by: "outside", actor: "benomite" });
    assert.equal(essais[1]?.suite.quoi === "merged" && essais[1].suite.sha, "fedcba9");
  });

  test("une PR rejugée ne fait qu'une ligne, celle de sa dernière livraison ; fermée puis rouverte et mergée, elle est mergée", () => {
    const { faits, noter, repeter, merger } = journal();
    repeter(17, 1);
    repeter(17, 1, { sha: "1111111", verdict: 50 });
    noter({ type: "pass.pr-closed", payload: { pr: pr(1) } });
    merger(17, 1, "1111111");

    const { essais } = lireEssais(faits, null);
    assert.deepEqual(essais.map((essai) => [essai.sha, essai.verdict, essai.suite.quoi]), [["1111111", 50, "merged"]]);
  });

  test("une livraison que la pass ne suit plus est dite telle : ticket sorti du rail, ou reparti sur une autre branche", () => {
    const { faits, noter, repeter } = journal();
    repeter(17, 1);
    repeter(18, 2);
    repeter(19, 3);
    repeter(20, 4);
    noter({ type: "pass.abandoned", payload: { branch: "cook/1", pr: pr(1) } }, 17);
    noter({ type: "pass.abandoned", payload: { branch: "cook/2", pr: null, merged: true } }, 18);
    noter({ type: "pass.abandoned", payload: { branch: "cook/3", pr: null } }, 19);
    noter({ type: "cook.launched", payload: { run: "r2", branch: "cook/autre", worktree: "worktrees/r2" } } as Fait, 20);

    assert.deepEqual(
      lireEssais(faits, null).essais.map((essai) => essai.suite),
      [
        { quoi: "unfollowed", at: "2026-10-08T10:00:05.000Z", open: true },
        { quoi: "merged", at: "2026-10-08T10:00:06.000Z", sha: null, by: "outside", actor: null },
        { quoi: "unfollowed", at: "2026-10-08T10:00:07.000Z", open: false },
        { quoi: "unfollowed", at: "2026-10-08T10:00:08.000Z", open: null },
      ],
    );
  });

  test("le merge d'une autre PR du même ticket ne dit rien de celle-ci, et un cook relancé sur sa branche ne la lâche pas", () => {
    const { faits, noter, repeter, merger } = journal();
    repeter(17, 1);
    noter({ type: "cook.launched", payload: { run: "r2", branch: "cook/1", worktree: "worktrees/r2" } } as Fait);
    merger(17, 9);
    assert.deepEqual(lireEssais(faits, null).essais.map((essai) => essai.suite.quoi), ["open"]);
  });

  test("depuis une date : les essais d'avant n'y sont pas, ce que le chef en a fait depuis ne les ramène pas ; les arrêts que la pass ne merge jamais se comptent à part", () => {
    const { faits, noter, repeter, merger } = journal();
    repeter(17, 1, {}, "2026-10-07T09:00:00.000Z");
    noter({ type: "pass.held", payload: { reason: "judge-modified" } }, 30, "2026-10-07T09:30:00.000Z");
    repeter(18, 2, {}, "2026-10-08T09:00:00.000Z");
    noter({ type: "pass.held", payload: { reason: "no-grant" } }, 18);
    noter({ type: "pass.held", payload: { reason: "judge-modified" } }, 31);
    noter({ type: "pass.held", payload: { reason: "declaration-modified: .claude/brigade/reseau" } }, 32);
    noter({ type: "pass.held", payload: { reason: "merge-refused: HTTP 405" } }, 33);
    merger(17, 1);

    const depuis = lireEssais(faits, "2026-10-08T00:00:00.000Z");
    assert.deepEqual([depuis.essais.map((essai) => essai.ticket), depuis.jamaisMergees], [[18], 2]);
    const tout = lireEssais(faits, null);
    assert.deepEqual([tout.essais.map((essai) => essai.ticket), tout.jamaisMergees], [[17, 18], 3]);
  });
});

describe("la liste que le chef lit avant d'accorder", () => {
  test("une livraison par ligne, ce que le chef en a fait en regard, les désaccords nommés, et le compte", () => {
    const { faits, noter, repeter, merger } = journal();
    repeter(17, 1);
    repeter(18, 2, { behind: 2 });
    repeter(19, 3);
    repeter(20, 4);
    repeter(21, 5, { outcome: "replay", behind: 3, overlap: ["travail.txt"] });
    repeter(22, 6, { outcome: "wait", head: "rouge-1", behind: null, reason: "base-red" });
    repeter(23, 7, { outcome: "unknown", head: null, behind: null, reason: "branch-lost" });
    merger(17, 1);
    merger(18, 2, "fedcba9");
    noter({ type: "pass.pr-closed", payload: { pr: pr(3) } }, 19);
    noter({ type: "pass.abandoned", payload: { branch: "cook/7", pr: pr(7) } }, 23);
    noter({ type: "pass.held", payload: { reason: "judge-modified" } }, 30);

    const lignes = montrerEssais(faits, null);
    assert.deepEqual(lignes, [
      "essai à blanc — ce que la pass aurait mergé sous le grant `merge`, depuis le début du journal",
      "lu au journal seul, GitHub n'est pas interrogé : l'état des PR est celui que le runtime a constaté — dernier fait au journal le 2026-10-08T10:00:12.000Z",
      "",
      `2026-10-08T10:00:01.000Z  #17  ${pr(1)}  abcdef0 sur v2  verdict n° 41  aurait mergé`,
      "    → mergée à la main le 2026-10-08T10:00:08.000Z par benomite, même commit",
      `2026-10-08T10:00:02.000Z  #18  ${pr(2)}  abcdef0 sur v2  verdict n° 42  aurait mergé sans rejeu, v2 avancée de 2 commits hors de ses fichiers`,
      "    → ÉCART — mergée à la main le 2026-10-08T10:00:09.000Z par benomite, sur un autre commit : fedcba9 au lieu de abcdef0",
      `2026-10-08T10:00:03.000Z  #19  ${pr(3)}  abcdef0 sur v2  verdict n° 43  aurait mergé`,
      "    → DÉSACCORD — PR fermée sans merge le 2026-10-08T10:00:10.000Z",
      `2026-10-08T10:00:04.000Z  #20  ${pr(4)}  abcdef0 sur v2  verdict n° 44  aurait mergé`,
      "    → encore ouverte",
      `2026-10-08T10:00:05.000Z  #21  ${pr(5)}  abcdef0 sur v2  verdict n° 45  n'aurait pas mergé telle quelle : v2 avancée de 3 commits sur ses fichiers (travail.txt), un rejeu des gates aurait tranché — non joué`,
      "    → encore ouverte",
      `2026-10-08T10:00:06.000Z  #22  ${pr(6)}  abcdef0 sur v2  verdict n° 46  aurait attendu : v2 était rouge (rouge-1)`,
      "    → encore ouverte",
      `2026-10-08T10:00:07.000Z  #23  ${pr(7)}  abcdef0 sur v2  verdict n° 47  n'a pas pu regarder v2 (branch-lost) : rien n'est dit de ce qu'elle aurait fait`,
      "    → plus suivie depuis le 2026-10-08T10:00:11.000Z, sa PR encore ouverte ce jour-là",
      "",
      "sur 7 livraisons arrêtées faute de grant, la brigade en aurait mergé 4 ; 1 qu'un rejeu des gates aurait tranchée, 1 qu'elle aurait fait attendre, 1 dont elle n'a rien pu dire",
      "tu en as mergé 2 (dont 1 sur un autre commit), fermé 1 ; 3 encore ouvertes, 1 plus suivie",
      "désaccords : 1 fermée sans merge que la brigade aurait mergée · écarts : 1 mergée sur un autre commit que celui du verdict",
      "1 autre livraison verte arrêtée que la pass ne merge jamais elle-même, grant ou pas (juges ou déclarations modifiés) : elle n'est pas dans ce compte",
    ]);
  });

  test("rien à lire : c'est dit, avec la date demandée", () => {
    assert.deepEqual(montrerEssais([], "2026-10-08T00:00:00.000Z"), [
      "essai à blanc — ce que la pass aurait mergé sous le grant `merge`, depuis le 2026-10-08T00:00:00.000Z",
      "aucune livraison verte arrêtée faute de grant",
    ]);
  });

  test("la ligne du journal reprend celle d'un usage du grant, à ceci près que rien n'a bougé", () => {
    const { faits, repeter } = journal();
    repeter(17, 1);
    const fait = faits[0] as Extract<Evenement, { type: "pass.rehearsed" }>;
    assert.equal(direEssai(fait.payload), `essai à blanc, sans grant : merge de ${pr(1)} sur v2, commit abcdef0, autorisé par le verdict n° 41 — aurait mergé ; rien n'a bougé`);
  });
});

describe("--depuis", () => {
  const maintenant = new Date(2026, 9, 10, 15, 0, 0);
  test("une date (le début de cette journée), une date et une heure, ou une durée jusqu'à maintenant", () => {
    assert.equal(lireDepuis("2026-10-08", maintenant), new Date(2026, 9, 8, 0, 0, 0).toISOString());
    assert.equal(lireDepuis("2026-10-08T14:30", maintenant), new Date(2026, 9, 8, 14, 30, 0).toISOString());
    assert.equal(lireDepuis("7j", maintenant), new Date(2026, 9, 3, 15, 0, 0).toISOString());
    assert.equal(lireDepuis("48h", maintenant), new Date(2026, 9, 8, 15, 0, 0).toISOString());
  });

  test("ce qui ne se lit pas, ou n'est pas encore arrivé, est refusé", () => {
    for (const valeur of ["hier", "2026-02-31", "2026-10-11", "0j"]) assert.throws(() => lireDepuis(valeur, maintenant), GrantRefuse, valeur);
  });
});
