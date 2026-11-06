// Un projet servi sur l'état GitHub seul (`brigade-github.ts`, #2060), le seul
// chemin depuis #2061 : deux stations égales sur un faux GitHub.
//
// L'état des tickets, la relecture et le merge sont les vrais modules de
// l'épique (`github-etat/etats.ts`, `github-etat/fusion.ts`,
// `github-etat/prise.ts`) : seul le client GitHub est faux, plus bas qu'eux.
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { ATTENTE_PRESSEE_MS, PASS_MAX, RELANCE_DES_GATES_MS, TOURS_PRESSES, brancherBrigadeGithub, brancheDuTicket, clientDuTour, dependancesDuCorps, lecteurDeLaCiDesPR, verdictDesGates, priseDeLaStation, stationDuDepot, stationGitHub, secoupent, zoneDuCorps, type GitHubDuTour, type Juger, type JugerEnSecond, type Lancer, type Prise, type StationGitHub } from "../src/brigade-github.ts";
import { ConsigneIllisible } from "../src/second-juge.ts";
import type { CommentaireDeVerdict } from "../src/github-etat/fusion.ts";
import { corpsDeLacher, corpsDePrise } from "../src/github-etat/prise.ts";
import { LABEL_IN_PASS, LABEL_TAKEN } from "../src/github-etat/etats.ts";
import type { GitHub, StatutDeCommit } from "../src/github.ts";
import { CONTEXTE_DES_GATES, GATES_PERIMEES_MS, type LieuDesGates, type VerdictDesGates } from "../src/github-etat/gates-de-la-tete.ts";
import { jusqua, repertoireTemporaire } from "./outils.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { LimiteGitHubAtteinte, limiteDeLaStation } from "../src/limite-github.ts";
import { lireLaCuisine } from "../src/retenue/brancher.ts";
import { direCause, diagnostiquer } from "../src/retenue/retenue.ts";
import { suivreLeTour } from "../src/retenue/tour.ts";
import { lireLaConsigne } from "../src/second-juge.ts";
import { CALIBRE, FauxGitHub, fauxClient, type OptionsDuFaux, type PR, type Ticket } from "./faux-github.ts";

const zoneDe = (...chemins: string[]) => `## Context\n\nwhatever\n\n## Zone\n\n${chemins.map((c) => `- \`${c}\``).join("\n")}\n\n## Acceptance\n\n- done\n`;

const verdictDe = (faux: FauxGitHub, pr: number) => (faux.commentaires.get(pr) ?? []).filter((c) => c.body.startsWith("<!-- brigade:verdict"));

// Un projet ouvert sur le chemin GitHub seul, arrêté en fin de test.
function ouvrir(t: TestContext, station: StationGitHub) {
  const ouvert = brancherBrigadeGithub({ station: () => station, intervalleMs: 5, avertir: () => {} });
  assert.equal(ouvert.refus, undefined);
  t.after(() => ouvert.arreter());
  return ouvert;
}

test("two stations claim the same ticket at once: the earliest claim cooks it, the other lets go", async () => {
  const faux = new FauxGitHub();
  faux.feu(1);
  const [a, b] = [faux.station("A"), faux.station("B")];
  await Promise.all([a.tour(), b.tour()]);
  await Promise.all([a.calme(), b.calme()]);
  const premiere = faux.commentaires.get(1)?.find((c) => c.body.startsWith("<!-- brigade:prise"))?.station;
  assert.deepEqual(faux.cuissons, [{ station: premiere, issue: 1 }]);
  assert.deepEqual([...faux.ticket(1).labels].sort(), [...CALIBRE, LABEL_IN_PASS].sort());
  assert.equal(faux.prs.length, 1);
});

test("a ticket whose dependency is open is held back, and claimed once the dependency closes", async () => {
  const faux = new FauxGitHub();
  faux.feu(1, ["model:sonnet", "effort:medium"]);
  faux.feu(2, CALIBRE, "Context.\n\nDepends on #1");
  faux.feu(3, CALIBRE, "Depends on #1, #4");
  faux.feu(4, ["model:sonnet", "effort:medium"]);
  const a = faux.station("A", { places: 5 });
  await a.tour();
  await a.calme();
  assert.deepEqual(faux.cuissons, []);
  assert.deepEqual(faux.pris(), []);
  faux.ticket(1).state = "closed";
  await a.tour();
  await a.calme();
  assert.deepEqual(faux.cuissons, [{ station: "A", issue: 2 }]);
  faux.ticket(4).state = "closed";
  await a.tour();
  await a.calme();
  assert.deepEqual(faux.cuissons.map((cuisson: { issue: number }) => cuisson.issue), [2, 3]);
});

test("the `Depends on` lines of an issue body name its dependencies", () => {
  assert.deepEqual(dependancesDuCorps("no dependency, see #5"), []);
  assert.deepEqual(dependancesDuCorps("Depends on #7"), [7]);
  assert.deepEqual(dependancesDuCorps("intro\nDepends on #7, #8 and #9\nDepends on #7\nrelated to #10"), [7, 8, 9]);
});

test("a merged PR that GitHub did not close the issue for: the station closes the ticket and drops in-pass (replay of espace#756)", async (t) => {
  const faux = new FauxGitHub();
  faux.nonFermees.add(1);
  faux.feu(1);
  ouvrir(t, faux.station("A"));
  await jusqua(() => faux.mergee(1) !== undefined);
  await jusqua(() => faux.ticket(1).state === "closed");
  assert.equal(faux.ticket(1).labels.has("in-pass"), false);
});

test("a ticket left open with in-pass while its PR is merged is closed by the next turn of any station", async (t) => {
  const faux = new FauxGitHub();
  faux.feu(1, [...CALIBRE, "in-pass"]);
  faux.prs.push({ number: 1000, issue: 1, branche: "cook/1-github", sha: faux.sha(), state: "closed", merged: true, enRetard: false, mergeePar: "A", fichiers: [] });
  const station = faux.station("B");
  await station.tour();
  assert.equal(faux.ticket(1).state, "closed");
  assert.equal(faux.ticket(1).labels.has("in-pass"), false);
  assert.deepEqual(faux.cuissons, []);
});

for (const [arretee, restante] of [
  ["A", "B"],
  ["B", "A"],
] as const) {
  test(`two stations on a fake GitHub: station ${arretee} stops, station ${restante} still takes, cooks and merges a ticket`, async (t) => {
    const faux = new FauxGitHub();
    faux.feu(1);
    const stations = { A: faux.station("A"), B: faux.station("B") };
    const ouverts = { A: ouvrir(t, stations.A), B: ouvrir(t, stations.B) };
    await jusqua(() => faux.mergee(1) !== undefined);

    await ouverts[arretee].arreter();
    await stations[arretee].calme();
    const avant = faux.appelsDe(arretee);

    faux.feu(2);
    await jusqua(() => faux.mergee(2) !== undefined);
    assert.deepEqual(
      faux.cuissons.filter((cuisson) => cuisson.issue === 2),
      [{ station: restante, issue: 2 }],
    );
    const pr = faux.mergee(2);
    assert.equal(pr?.mergeePar, restante);
    // Le verdict qui l'a approuvée est un commentaire de la PR, signé de la restante.
    assert.match(verdictDe(faux, pr?.number ?? 0)[0]?.body ?? "", new RegExp(`station=${restante} verdict=approve`));
    assert.equal(faux.ticket(2).state, "closed");
    // L'arrêtée n'a plus rien lu ni écrit.
    assert.equal(faux.appelsDe(arretee), avant);
  });

  test(`station ${arretee} delivers a ticket and stops before it is reviewed: station ${restante} reviews and merges it`, async (t) => {
    const faux = new FauxGitHub();
    faux.feu(3);
    const stations = { A: faux.station("A"), B: faux.station("B") };
    // Elle prend, cuisine et livre en pass, puis ne tourne plus.
    await stations[arretee].tour();
    await stations[arretee].calme();
    assert.ok(faux.ticket(3).labels.has(LABEL_IN_PASS));
    assert.ok(!faux.ticket(3).labels.has(LABEL_TAKEN));
    const avant = faux.appelsDe(arretee);

    ouvrir(t, stations[restante]);
    await jusqua(() => faux.mergee(3) !== undefined);
    assert.equal(faux.mergee(3)?.mergeePar, restante);
    assert.deepEqual(faux.relectures, [{ station: restante, pr: faux.mergee(3)?.number }]);
    assert.deepEqual(faux.cuissons, [{ station: arretee, issue: 3 }]);
    assert.equal(faux.appelsDe(arretee), avant);
  });
}

test("a branch behind its base is updated, never merged on that turn, then merged once up to date", async () => {
  const faux = new FauxGitHub();
  faux.feu(4);
  const a = faux.station("A");
  await a.tour();
  await a.calme();
  await a.tour();
  assert.equal(faux.mergee(4), undefined, "en retard : la mise à jour est demandée");
  assert.deepEqual(
    faux.appels.filter((appel) => ["mettreAJour", "merger"].includes(appel.quoi)).map((appel) => appel.quoi),
    ["mettreAJour"],
  );
  await a.tour();
  assert.equal(faux.mergee(4)?.mergeePar, "A");
  // Une seule relecture : l'approbation tient après la mise à jour.
  assert.equal(faux.relectures.length, 1);
});

test("a review that requests changes keeps the PR unmerged", async () => {
  const faux = new FauxGitHub();
  faux.feu(5);
  const a = faux.station("A", { juger: async () => ({ verdict: "request-changes", motif: "tests missing" }) });
  for (let tour = 0; tour < 4; tour += 1) {
    await a.tour();
    await a.calme();
  }
  assert.equal(faux.mergee(5), undefined);
  assert.ok(!faux.appels.some((appel) => appel.quoi === "merger"));
  assert.match(verdictDe(faux, 1000)[0]?.body ?? "", /verdict=request-changes[\s\S]*tests missing/);
});

test("a cook that delivers nothing gives the ticket back on the issue, which another station then takes", async () => {
  const faux = new FauxGitHub();
  faux.feu(6);
  const a = faux.station("A", { cuisiner: async () => ({ echec: "gates red" }), avertir: () => {} });
  await a.tour();
  await a.calme();
  assert.deepEqual([...faux.ticket(6).labels].sort(), [...CALIBRE].sort());
  assert.match((faux.commentaires.get(6) ?? []).map((c) => c.body).join("\n"), /Station `A`: the cook stopped without a delivery — gates red/);
  const b = faux.station("B");
  await b.tour();
  await b.calme();
  assert.deepEqual(faux.cuissons, [{ station: "B", issue: 6 }]);
});

test("a station with 3 places never holds more than 3 tickets, even when its cooks throw at once (GitHub limiting its calls, #2179)", async () => {
  const faux = new FauxGitHub();
  for (let n = 1; n <= 13; n += 1) faux.feu(n);
  const avertis: string[] = [];
  const a = faux.station("A", {
    places: 3,
    cuisiner: async () => {
      throw new Error("GitHub a atteint sa limite d'appels");
    },
    avertir: (texte) => avertis.push(texte),
  });
  await a.tour();
  await a.calme();
  // Trois prises, pas treize : un cook qui lève garde sa place.
  assert.equal(faux.prisesDe("A"), 3);
  assert.equal(faux.pris().length, 3);
  // Le tour suivant rend les trois sur l'issue avant d'en prendre d'autres.
  await a.tour();
  await a.calme();
  assert.ok(faux.pris().length <= 3, `taken: ${faux.pris().join(", ")}`);
  const lachers = [...faux.commentaires.values()].flat().filter((c) => c.body.startsWith("<!-- brigade:lache station=A")).length;
  assert.equal(lachers, 3);
  assert.ok(avertis.some((texte) => /limite d'appels/.test(texte)));
});

test("with 5 tickets in pass a station with free places claims nothing; at 4 it claims (PASS_MAX, #2300)", async () => {
  const faux = new FauxGitHub();
  for (let n = 1; n <= 5; n += 1) faux.feu(n, [...CALIBRE, LABEL_IN_PASS]);
  faux.feu(10);
  const a = faux.station("A", { places: 3 });
  await a.tour();
  await a.calme();
  assert.equal(PASS_MAX, 5);
  assert.equal(faux.prisesDe("A"), 0);
  assert.equal(faux.cuissons.length, 0);
  // One leaves the pass: under the cap, the station claims again.
  faux.ticket(5).labels.delete(LABEL_IN_PASS);
  await a.tour();
  await a.calme();
  assert.ok(faux.cuissons.some((c) => c.issue === 10));
});

test("a restarted station gives back, at its first turn, the tickets it held with no cook, then takes only what its places allow (#2179)", async () => {
  const faux = new FauxGitHub();
  for (let n = 1; n <= 5; n += 1) faux.feu(n);
  // Un runtime d'avant a pris les cinq, puis s'est arrêté sans les rendre.
  const avant = faux.station("A", { places: 5, cuisiner: () => new Promise(() => {}) });
  void avant.tour();
  await jusqua(() => faux.pris().length === 5);
  // Un sixième, pris par une autre station : il n'est pas à A de le rendre.
  faux.feu(6);
  const b = faux.station("B", { cuisiner: () => new Promise(() => {}) });
  void b.tour();
  await jusqua(() => faux.pris().includes(6));
  const apres = faux.station("A", { places: 2, cuisiner: () => new Promise(() => {}) });
  await apres.tour();
  await apres.calme();
  const lachersDeA = [...faux.commentaires.values()].flat().filter((c) => c.body.startsWith("<!-- brigade:lache station=A")).length;
  assert.equal(lachersDeA, 5);
  assert.ok(faux.ticket(6).labels.has(LABEL_TAKEN), "#6 stays B's");
  // Rendus à ce tour, ils ne sont repris qu'au suivant, et pas plus que ses places.
  assert.deepEqual(faux.pris(), [6]);
  await apres.tour();
  assert.deepEqual(faux.pris(), [1, 2, 6]);
});

// Des gates que le test dit, et les têtes sur lesquelles chaque station les a jouées.
function gatesDites(verdict: VerdictDesGates) {
  const jouees: Array<{ station: string; sha: string }> = [];
  const pour = (station: string) => async (_ticket: { number: number }, pr: { sha: string }): Promise<LieuDesGates> => ({
    jouer: async () => {
      jouees.push({ station, sha: pr.sha });
      return verdict;
    },
    liberer: () => {},
  });
  return { jouees, pour };
}

// espace, le 2026-11-05 (#2456) : depuis le 2026-10-22, GitHub Actions ne
// teste plus ses PR (`ci.yml` en `workflow_dispatch` seul), ses gates tournent
// sur la box. PR #757, #759, #761 approuvées par `box/claude` attendaient une CI
// qui ne viendrait jamais, et rien n'était mergé.
test("espace on 2026-11-05: an approved PR with no check on its head ends merged after green gates, run once by one station and published as a status", async () => {
  const faux = new FauxGitHub();
  faux.feu(757);
  const gates = gatesDites({ vert: true, resume: "", detail: "" });
  const sansCI = () => false;
  // Le second de deux merges est refusé par GitHub : la station le dit, sans plus.
  const avertir = () => {};
  const [box, mac] = [faux.station("box/claude", { ciDesPR: sansCI, gates: gates.pour("box/claude"), avertir }), faux.station("mac/claude", { ciDesPR: sansCI, gates: gates.pour("mac/claude"), avertir })];
  await box.tour();
  await box.calme();
  const pr = faux.prs.find((p) => p.issue === 757);
  assert.ok(pr);
  faux.sansCI.add(pr.number);
  for (let i = 0; i < 4 && faux.mergee(757) === undefined; i += 1) {
    await Promise.all([box.tour(), mac.tour()]);
    await Promise.all([box.calme(), mac.calme()]);
  }
  assert.equal(faux.mergee(757)?.number, pr.number);
  // Les gates ont tourné une fois, sur la tête mergée, et leur verdict se lit sur la PR.
  assert.equal(gates.jouees.length, 1);
  assert.equal(gates.jouees[0]?.sha, pr.sha);
  // Deux stations ont pu prendre la tête au même instant : seule la première les a jouées.
  const statuts = faux.statutsDeCommit.get(pr.sha) ?? [];
  assert.ok(statuts.every(({ context }) => context === CONTEXTE_DES_GATES));
  assert.deepEqual(statuts.filter(({ state }) => state !== "pending").map(({ state }) => state), ["success"]);
  assert.equal(statuts.at(-1)?.state, "success");
  assert.match(faux.statutsDeCommit.get(pr.sha)?.at(-1)?.description ?? "", /^Gates green on station (box|mac)\/claude$/);
});

test("with no CI on its PRs, red gates send the delivery back to a cook like a red CI, with what failed written on the issue (#2456)", async () => {
  const faux = new FauxGitHub();
  faux.feu(759);
  const gates = gatesDites({ vert: false, resume: "FAIL  runtime/test/pass.test.ts", detail: "They exited with code 1.\n\n- `FAIL  runtime/test/pass.test.ts`" });
  const a = faux.station("box/claude", { ciDesPR: () => false, gates: gates.pour("box/claude") });
  await a.tour();
  await a.calme();
  const pr = faux.prs.find((p) => p.issue === 759);
  assert.ok(pr);
  faux.sansCI.add(pr.number);
  for (let i = 0; i < 4 && !(faux.commentaires.get(759) ?? []).some((c) => c.body.startsWith("<!-- brigade:renvoi")); i += 1) {
    await a.tour();
    await a.calme();
  }
  assert.equal(faux.mergee(759), undefined);
  const commentaires = faux.commentaires.get(759) ?? [];
  assert.match(commentaires.find((c) => c.body.includes("ran the project's gates"))?.body ?? "", /Station `box\/claude` ran the project's gates on `[0-9a-f]{7}` \(PR #\d+\) — no CI runs on this project's PRs — and they are red\.\n\nThey exited with code 1\.\n\n- `FAIL  runtime\/test\/pass\.test\.ts`/);
  assert.match(commentaires.find((c) => c.body.startsWith("<!-- brigade:renvoi"))?.body ?? "", /sent back to a cook \(1\/2\) — the CI is red on `[0-9a-f]+`: brigade\/gates/);
  assert.deepEqual([...faux.statutsDeCommit.values()].flat().map(({ state }) => state), ["pending", "failure"]);
});

test("a project with CI on its PRs keeps requiring it: an approved PR whose CI never starts is not merged, and no gates are run for it (#2456)", async () => {
  const faux = new FauxGitHub();
  faux.feu(761);
  const gates = gatesDites({ vert: true, resume: "", detail: "" });
  const a = faux.station("box/claude", { ciDesPR: () => true, gates: gates.pour("box/claude") });
  await a.tour();
  await a.calme();
  const pr = faux.prs.find((p) => p.issue === 761);
  assert.ok(pr);
  faux.sansCI.add(pr.number);
  for (let i = 0; i < 4; i += 1) {
    await a.tour();
    await a.calme();
  }
  assert.equal(faux.mergee(761), undefined);
  assert.equal(verdictDe(faux, pr.number).length, 1);
  assert.deepEqual(gates.jouees, []);
  assert.equal(faux.statutsDeCommit.size, 0);
  // Sa CI démarre puis passe au vert : la PR se merge.
  faux.sansCI.delete(pr.number);
  await a.tour();
  await a.calme();
  assert.equal(faux.mergee(761)?.number, pr.number);
});

test("with no CI on its PRs and a station that does not run gates, the delivery waits, said once on the service log (#2456)", async () => {
  const faux = new FauxGitHub();
  faux.feu(760);
  const dits: string[] = [];
  const a = faux.station("mac/claude", { ciDesPR: () => false, avertir: (texte) => dits.push(texte) });
  await a.tour();
  await a.calme();
  const pr = faux.prs.find((p) => p.issue === 760);
  assert.ok(pr);
  faux.sansCI.add(pr.number);
  for (let i = 0; i < 4; i += 1) {
    await a.tour();
    await a.calme();
  }
  assert.equal(faux.mergee(760), undefined);
  assert.equal(dits.filter((dit) => /has no CI and waits for the project's gates, which station mac\/claude does not run/.test(dit)).length, 1);
});

test("the CI of a project's PRs is read from its workflows on the base: espace's dispatch-only CI runs none, brigade's runs one; in doubt, the CI is awaited (#2456)", () => {
  const depotDe = (workflows: Record<string, string>, tete = "c0ffee") => {
    let lectures = 0;
    return {
      lectures: () => lectures,
      depot: {
        vue: () => tete,
        fichiers: () => ["README.md", ...Object.keys(workflows)],
        lire: (_revision: string, chemin: string) => {
          lectures += 1;
          return workflows[chemin] ?? null;
        },
      },
    };
  };
  // espace depuis le 2026-10-22 : `ci.yml` ne part qu'à la main.
  const espace = depotDe({ ".github/workflows/ci.yml": "name: CI\non:\n  workflow_dispatch:\njobs: {}\n" });
  const ciDEspace = lecteurDeLaCiDesPR(espace.depot, "main");
  assert.equal(ciDEspace(["src/app.ts"]), false);
  // Lus une fois par commit de la base.
  assert.equal(ciDEspace(["src/other.ts"]), false);
  assert.equal(espace.lectures(), 1);
  // Aucun workflow : aucune CI sur les PR.
  assert.equal(lecteurDeLaCiDesPR(depotDe({}).depot, "main")(["a.ts"]), false);
  // brigade : sa CI se lance sur toute PR vers main ; ses pages, seulement sur les leurs.
  const brigade = depotDe({
    ".github/workflows/ci.yml": "on:\n  pull_request:\n    branches: [main]\n  push:\n    branches: [main]\n",
    ".github/workflows/pages.yml": "on:\n  pull_request:\n    paths: [site/**]\n",
  });
  assert.equal(lecteurDeLaCiDesPR(brigade.depot, "main")(["runtime/src/pass.ts"]), true);
  const pagesSeules = depotDe({ ".github/workflows/pages.yml": "on:\n  pull_request:\n    paths: [site/**]\n" });
  assert.equal(lecteurDeLaCiDesPR(pagesSeules.depot, "main")(["runtime/src/pass.ts"]), false);
  assert.equal(lecteurDeLaCiDesPR(pagesSeules.depot, "main")(["site/index.html"]), true);
  // Dans le doute, la CI est attendue : un dépôt qui ne se lit pas, un workflow illisible.
  assert.equal(lecteurDeLaCiDesPR({}, "main")(["a.ts"]), true);
  assert.equal(lecteurDeLaCiDesPR({ ...espace.depot, vue: () => assert.fail("no origin/main") }, "main")(["a.ts"]), true);
  assert.equal(lecteurDeLaCiDesPR({ ...espace.depot, lire: () => null }, "main")(["a.ts"]), true);
});

test("what the gates said, for the status and for the cook: green says nothing more, red names its failures and its end (#2456)", () => {
  assert.deepEqual(verdictDesGates({ outcome: "green", code: 0, failures: [], tail: "ok" }, 1_800_000), { vert: true, resume: "", detail: "" });
  const rouge = verdictDesGates({ outcome: "red", code: 1, failures: ["FAIL  runtime/test/pass.test.ts"], tail: "1 failed" }, 1_800_000);
  assert.equal(rouge.vert, false);
  assert.equal(rouge.resume, "FAIL  runtime/test/pass.test.ts");
  assert.equal(rouge.detail, "They exited with code 1.\n\n- `FAIL  runtime/test/pass.test.ts`\n\nThe end of their output:\n\n```\n1 failed\n```");
  assert.equal(verdictDesGates({ outcome: "timeout", code: null, failures: [], tail: "" }, 1_800_000).resume, "stopped after 1800 s");
});

test("gates that cannot run on a head — GitHub refusing the status, a clone behind — are retried 30 min later, not at every turn (#2456)", async () => {
  const faux = new FauxGitHub();
  faux.feu(762);
  let instant = Date.parse("2026-11-05T15:00:00Z");
  const dits: string[] = [];
  let preparations = 0;
  const gates = async (): Promise<LieuDesGates> => {
    preparations += 1;
    return preparations === 1 ? { nonJouees: "the station's clone holds the branch at another head" } : { jouer: async () => ({ vert: true, resume: "", detail: "" }), liberer: () => {} };
  };
  const a = faux.station("box/claude", { ciDesPR: () => false, gates, avertir: (texte) => dits.push(texte), maintenant: () => new Date(instant) });
  await a.tour();
  await a.calme();
  const pr = faux.prs.find((p) => p.issue === 762);
  assert.ok(pr);
  faux.sansCI.add(pr.number);
  for (let i = 0; i < 4; i += 1) {
    await a.tour();
    await a.calme();
  }
  assert.equal(preparations, 1);
  assert.equal(faux.mergee(762), undefined);
  assert.match(dits.join("\n"), /the gates of PR #\d+ \(#762\) are not run on box\/claude — the station's clone holds the branch at another head; retried in 30 min, or on a new head/);
  instant += RELANCE_DES_GATES_MS;
  for (let i = 0; i < 3 && faux.mergee(762) === undefined; i += 1) {
    await a.tour();
    await a.calme();
  }
  assert.equal(preparations, 2);
  assert.equal(faux.mergee(762)?.number, pr.number);
});

test("with no CI on its PRs, a gates claim left by a station that died during them is taken over once stale, and a live one is read again only then (#2456)", async () => {
  const faux = new FauxGitHub();
  faux.feu(749);
  let instant = Date.parse("2026-11-05T15:00:00Z");
  const gates = gatesDites({ vert: true, resume: "", detail: "" });
  const box = faux.station("box/claude", { ciDesPR: () => false, gates: gates.pour("box/claude"), maintenant: () => new Date(instant) });
  await box.tour();
  await box.calme();
  const pr = faux.prs.find((p) => p.issue === 749);
  assert.ok(pr);
  faux.sansCI.add(pr.number);
  // À jour sur sa base : sa tête ne bougera plus.
  pr.enRetard = false;
  // mac/claude a pris la tête, puis est tombée pendant ses gates : son pending reste.
  faux.statutsDeCommit.set(pr.sha, [{ id: 0, state: "pending", context: CONTEXTE_DES_GATES, description: "Gates running on station mac/claude", createdAt: new Date(instant).toISOString() }]);
  const lectures = () => faux.appels.filter((appel) => appel.station === "box/claude" && appel.quoi === "statuts").length;
  for (let i = 0; i < 4; i += 1) {
    await box.tour();
    await box.calme();
  }
  // Fraîche, la prise tient : box attend, et ne relit les statuts qu'une fois.
  assert.equal(faux.mergee(749), undefined);
  assert.deepEqual(gates.jouees, []);
  assert.equal(lectures(), 1);
  // Périmée, box la reprend, joue les gates sur la tête et merge.
  instant += GATES_PERIMEES_MS;
  for (let i = 0; i < 4 && faux.mergee(749) === undefined; i += 1) {
    await box.tour();
    await box.calme();
  }
  assert.equal(faux.mergee(749)?.number, pr.number);
  assert.deepEqual(gates.jouees, [{ station: "box/claude", sha: pr.sha }]);
  assert.deepEqual((faux.statutsDeCommit.get(pr.sha) ?? []).map(({ state, description }) => [state, description]), [
    ["pending", "Gates running on station mac/claude"],
    ["pending", "Gates running on station box/claude"],
    ["success", "Gates green on station box/claude"],
  ]);
});

test("a delivery whose CI is red is never merged: it goes back to a cook with the failing check, then off the kitchen after 2 sends back (#2209)", async () => {
  const faux = new FauxGitHub();
  faux.feu(31);
  const a = faux.station("A");
  await a.tour();
  await a.calme();
  const pr = faux.prs.find((p) => p.issue === 31);
  assert.ok(pr);
  faux.ciRouge.add(pr.number);
  for (let i = 0; i < 12; i += 1) {
    await a.tour();
    await a.calme();
  }
  assert.equal(faux.mergee(31), undefined);
  const renvois = (faux.commentaires.get(31) ?? []).filter((c) => c.body.startsWith("<!-- brigade:renvoi"));
  assert.equal(renvois.length, 3);
  assert.match(renvois[0]?.body ?? "", /sent back to a cook \(1\/2\) — the CI is red on `[0-9a-f]+`: tests/);
  assert.match(renvois[2]?.body ?? "", /Taken off the kitchen/);
  assert.ok(faux.ticket(31).labels.has("hors-cuisine"));
  // Recuisiné deux fois, sous la même PR : aucune seconde PR.
  assert.equal(faux.cuissons.filter((c) => c.issue === 31).length, 3);
  assert.equal(faux.prs.filter((p) => p.issue === 31).length, 1);
});

test("a delivery the review refuses goes back to a cook with the review's reason (#2209)", async () => {
  const faux = new FauxGitHub();
  faux.feu(32);
  let refus = true;
  const a = faux.station("A", { juger: async () => (refus ? { verdict: "request-changes", motif: "tests missing for the empty case" } : { verdict: "approve", motif: "" }) });
  for (let i = 0; i < 3; i += 1) {
    await a.tour();
    await a.calme();
  }
  const renvoi = (faux.commentaires.get(32) ?? []).find((c) => c.body.startsWith("<!-- brigade:renvoi"));
  assert.match(renvoi?.body ?? "", /the review requested changes: tests missing for the empty case/);
  refus = false;
  for (let i = 0; i < 6; i += 1) {
    await a.tour();
    await a.calme();
  }
  assert.equal(faux.mergee(32)?.mergeePar, "A");
});

test("replay of #2478: a PR approved after a request-changes, its ticket out of the pass, is merged and no cook is launched (#2622)", async () => {
  const faux = new FauxGitHub();
  faux.feu(2478);
  const sha = faux.sha();
  faux.prs.push({ number: 2499, issue: 2478, branche: brancheDuTicket(2478), sha, state: "open", merged: false, enRetard: false, mergeePar: null, fichiers: ["runtime/src/x.ts"] });
  faux.poster(2499, "A", `<!-- brigade:verdict station=A verdict=request-changes sha=${sha} -->\nChanges requested by station \`A\`.\n\nfix it`);
  faux.poster(2499, "A", `<!-- brigade:verdict station=A verdict=approve sha=${sha} -->\nApproved by station \`A\`.`);
  const a = faux.station("A", {
    juger: async () => {
      throw new Error("the approved PR is not judged again");
    },
  });
  for (let i = 0; i < 4; i += 1) {
    await a.tour();
    await a.calme();
  }
  assert.equal(faux.mergee(2478)?.number, 2499);
  assert.equal(faux.cuissons.length, 0);
});

const secondsDe = (faux: FauxGitHub, pr: number) => (faux.commentaires.get(pr) ?? []).filter((c) => c.body.startsWith("<!-- brigade:second-judge"));

test("a delivery that changes what judges it goes, once the review approves, before a second judge: its approval and a green CI merge it like any other (#2555)", async () => {
  const faux = new FauxGitHub();
  faux.feu(33);
  const a = faux.station("A");
  await a.tour();
  await a.calme();
  const pr = faux.prs.find((p) => p.issue === 33);
  assert.ok(pr);
  pr.fichiers = [".github/workflows/tests.yml", "runtime/src/x.ts"];
  for (let i = 0; i < 5 && faux.mergee(33) === undefined; i += 1) await a.tour();
  assert.equal(faux.mergee(33)?.mergeePar, "A");
  assert.equal(faux.ticket(33).state, "closed");
  // Jugée une fois, après la relecture, sur la tête mergée — à jour de sa base.
  assert.deepEqual(faux.relectures, [{ station: "A", pr: pr.number }]);
  assert.deepEqual(faux.secondsJugements, [{ station: "A", pr: pr.number, sha: pr.sha, juges: [".github/workflows/tests.yml"] }]);
  assert.match(secondsDe(faux, pr.number)[0]?.body ?? "", /^<!-- brigade:second-judge station=A verdict=approve sha=[0-9a-f]{40} -->\nApproved by the second judge[\s\S]*Adds a check, weakens none\./);
  // Rien n'attend le chef.
  assert.ok(!faux.ticket(33).labels.has("blocked-on-human"));
  assert.ok(![...faux.commentaires.values()].flat().some((c) => /by hand/.test(c.body)));
});

test("a delivery the second judge refuses goes back to a cook with its reasons, like a review that requests changes; its next head is judged again and merges (#2555)", async () => {
  const faux = new FauxGitHub();
  faux.feu(39);
  let refus = true;
  const juges: string[] = [];
  const a = faux.station("A", {
    jugerEnSecond: async (_ticket, pr) => {
      juges.push(pr.sha);
      return refus ? { verdict: "request-changes", motif: "`tests.yml` skips the runtime tests (`if: false`), and the ticket does not ask for it." } : { verdict: "approve", motif: "Adds a check." };
    },
  });
  await a.tour();
  await a.calme();
  const pr = faux.prs.find((p) => p.issue === 39);
  assert.ok(pr);
  pr.fichiers = [".github/workflows/tests.yml"];
  for (let i = 0; i < 4 && juges.length === 0; i += 1) await a.tour();
  assert.equal(juges.length, 1);
  assert.equal(faux.mergee(39), undefined);
  const renvoi = (faux.commentaires.get(39) ?? []).find((c) => c.body.startsWith("<!-- brigade:renvoi"));
  assert.match(renvoi?.body ?? "", /sent back to a cook \(1\/2\) — the second judge requested changes: `tests\.yml` skips the runtime tests \(`if: false`\), and the ticket does not ask for it\./);
  assert.ok(!faux.ticket(39).labels.has(LABEL_IN_PASS), "it leaves the pass");
  assert.match(secondsDe(faux, pr.number)[0]?.body ?? "", /verdict=request-changes/);
  // Le cook reprend la branche : une tête neuve, que le second juge relit.
  refus = false;
  for (let i = 0; i < 8 && faux.mergee(39) === undefined; i += 1) {
    await a.tour();
    await a.calme();
  }
  assert.equal(faux.mergee(39)?.mergeePar, "A");
  assert.equal(juges.length, 2);
  assert.notEqual(juges[0], juges[1]);
});

test("the second judge is launched only on a head that can merge: running CI waits, red goes back to a cook without it, green launches it (#2555)", async () => {
  const faux = new FauxGitHub();
  faux.feu(37);
  const a = faux.station("A");
  await a.tour();
  await a.calme();
  const pr = faux.prs.find((p) => p.issue === 37);
  assert.ok(pr);
  pr.fichiers = [".github/workflows/tests.yml", "runtime/src/x.ts"];
  faux.ciEnCours.add(pr.number);
  for (let i = 0; i < 4; i += 1) await a.tour();
  assert.equal(faux.secondsJugements.length, 0, "running CI: not judged yet");
  assert.equal(faux.mergee(37), undefined);
  faux.ciEnCours.delete(pr.number);
  faux.ciRouge.add(pr.number);
  for (let i = 0; i < 2; i += 1) await a.tour();
  assert.equal(faux.secondsJugements.length, 0, "red CI: not judged");
  assert.match((faux.commentaires.get(37) ?? []).find((c) => c.body.startsWith("<!-- brigade:renvoi"))?.body ?? "", /the CI is red/);
  faux.ciRouge.delete(pr.number);
  faux.ticket(37).labels.add(LABEL_IN_PASS);
  for (let i = 0; i < 4 && faux.mergee(37) === undefined; i += 1) await a.tour();
  assert.equal(faux.secondsJugements.length, 1, "green CI: judged");
  assert.equal(faux.mergee(37)?.mergeePar, "A");
});

test("with no CI on its PRs, a delivery that changes what judges it has its gates run on its head, then goes before the second judge, and merges (#2456, #2555)", async () => {
  const faux = new FauxGitHub();
  faux.feu(38);
  const gates = gatesDites({ vert: true, resume: "", detail: "" });
  const a = faux.station("box/claude", { ciDesPR: () => false, gates: gates.pour("box/claude") });
  await a.tour();
  await a.calme();
  const pr = faux.prs.find((p) => p.issue === 38);
  assert.ok(pr);
  pr.fichiers = [".claude/brigade/gates.sh"];
  faux.sansCI.add(pr.number);
  for (let i = 0; i < 6 && faux.mergee(38) === undefined; i += 1) {
    await a.tour();
    await a.calme();
  }
  assert.equal(gates.jouees.length, 1);
  assert.deepEqual(faux.secondsJugements.map(({ juges }) => juges), [[".claude/brigade/gates.sh"]]);
  assert.equal(faux.mergee(38)?.mergeePar, "box/claude");
});

test("a station that launches no second judge never merges a delivery that changes what judges it, and says so once per head (#2555)", async () => {
  const faux = new FauxGitHub();
  faux.feu(40);
  const dits: string[] = [];
  const a = faux.station("A", { jugerEnSecond: null, avertir: (texte) => dits.push(texte) });
  await a.tour();
  await a.calme();
  const pr = faux.prs.find((p) => p.issue === 40);
  assert.ok(pr);
  pr.fichiers = ["agents/second-juge.md"];
  for (let i = 0; i < 5; i += 1) await a.tour();
  assert.equal(faux.mergee(40), undefined);
  assert.deepEqual(dits, [`brigade : PR #${pr.number} (#40) changes what judges it and waits for a second judge, which station A does not launch`]);
});

test("a station whose second judge's brief cannot be read says so once per head in the project's queue, with the path, and never merges (#2571)", async () => {
  const faux = new FauxGitHub();
  faux.feu(42);
  const a = faux.station("A", {
    jugerEnSecond: async () => {
      throw new ConsigneIllisible("/usr/lib/brigade-station/agents/second-juge.md", new Error("ENOENT"));
    },
  });
  await a.tour();
  await a.calme();
  const pr = faux.prs.find((p) => p.issue === 42);
  assert.ok(pr);
  pr.fichiers = ["agents/second-juge.md"];
  for (let i = 0; i < 5; i += 1) await a.tour();
  assert.equal(faux.mergee(42), undefined);
  const dits = (faux.commentaires.get(42) ?? []).filter((c) => c.body.includes("second-juge-sans-consigne"));
  assert.equal(dits.length, 1);
  assert.match(dits[0]?.body ?? "", /\/usr\/lib\/brigade-station\/agents\/second-juge\.md/);
});

test("the card a station posted before #2555 on a delivery that changes what judges it is lifted, and the second judge decides (#2555)", async () => {
  const faux = new FauxGitHub();
  faux.feu(41);
  const a = faux.station("A");
  await a.tour();
  await a.calme();
  const pr = faux.prs.find((p) => p.issue === 41);
  assert.ok(pr);
  pr.fichiers = [".github/workflows/tests.yml"];
  faux.ticket(41).labels.add("blocked-on-human");
  for (let i = 0; i < 5 && faux.mergee(41) === undefined; i += 1) await a.tour();
  assert.ok(!faux.ticket(41).labels.has("blocked-on-human"));
  assert.equal(faux.mergee(41)?.mergeePar, "A");
});

test("a head already sent back is not sent back again, even if a stale list still shows it in pass (#2189)", async () => {
  const faux = new FauxGitHub();
  faux.feu(34);
  const a = faux.station("A", { juger: async () => ({ verdict: "request-changes", motif: "not wired" }) });
  await a.tour();
  await a.calme();
  await a.tour();
  // La liste lue sous ETag porte encore `in-pass` : le tour revoit la même tête refusée.
  faux.ticket(34).labels.add(LABEL_IN_PASS);
  faux.ticket(34).labels.delete(LABEL_TAKEN);
  await a.tour();
  await a.tour();
  const renvois = (faux.commentaires.get(34) ?? []).filter((c) => c.body.startsWith("<!-- brigade:renvoi"));
  assert.equal(renvois.length, 1);
});

test("a delivery that conflicts with the base goes back to a cook to merge the base in, then merges (#2209)", async () => {
  const faux = new FauxGitHub();
  faux.feu(36);
  const a = faux.station("A");
  await a.tour();
  await a.calme();
  const pr = faux.prs.find((p) => p.issue === 36);
  assert.ok(pr);
  pr.enConflit = true;
  for (let i = 0; i < 6; i += 1) {
    await a.tour();
    await a.calme();
  }
  const renvoi = (faux.commentaires.get(36) ?? []).find((c) => c.body.startsWith("<!-- brigade:renvoi"));
  assert.match(renvoi?.body ?? "", /conflicts with the base/);
  assert.equal(faux.mergee(36)?.mergeePar, "A");
});

test("a ticket whose cooks fail 3 times goes off the kitchen instead of looping (#2209)", async () => {
  const faux = new FauxGitHub();
  faux.feu(35);
  const a = faux.station("A", { cuisiner: async () => ({ echec: "the cook committed nothing" }), avertir: () => {} });
  for (let i = 0; i < 8; i += 1) {
    await a.tour();
    await a.calme();
  }
  const echecs = (faux.commentaires.get(35) ?? []).filter((c) => c.body.startsWith("<!-- brigade:echec"));
  assert.equal(echecs.length, 3);
  assert.match(echecs[2]?.body ?? "", /Taken off the kitchen/);
  assert.ok(faux.ticket(35).labels.has("hors-cuisine"));
});

test("removing hors-cuisine restarts the count of cooks without a delivery (#2430)", async () => {
  const faux = new FauxGitHub();
  faux.feu(35);
  const a = faux.station("A", { cuisiner: async () => ({ echec: "the cook committed nothing" }), avertir: () => {} });
  for (let i = 0; i < 8 && !faux.ticket(35).labels.has("hors-cuisine"); i += 1) {
    await a.tour();
    await a.calme();
  }
  assert.ok(faux.ticket(35).labels.has("hors-cuisine"));
  // Le second relance le ticket : il retire `hors-cuisine`, sur GitHub.
  await faux.pour("chef").delabelliser(35, "hors-cuisine");
  for (let i = 0; i < 1; i += 1) {
    await a.tour();
    await a.calme();
  }
  const echecs = (faux.commentaires.get(35) ?? []).filter((c) => c.body.startsWith("<!-- brigade:echec"));
  assert.equal(echecs.length, 4);
  assert.equal(faux.ticket(35).labels.has("hors-cuisine"), false);
});

test("a send-back whose label removal failed is completed at the next turn, without a second comment (#2319)", async () => {
  const faux = new FauxGitHub();
  faux.feu(39);
  const a = faux.station("A", { juger: async () => ({ verdict: "request-changes", motif: "no" }), avertir: () => {} });
  await a.tour();
  await a.calme();
  await a.tour();
  // Le renvoi est écrit, mais \`in-pass\` est resté : son retrait avait échoué.
  faux.ticket(39).labels.add(LABEL_IN_PASS);
  faux.ticket(39).labels.delete(LABEL_TAKEN);
  await a.tour();
  assert.equal(faux.ticket(39).labels.has(LABEL_IN_PASS), false);
  assert.equal((faux.commentaires.get(39) ?? []).filter((c) => c.body.startsWith("<!-- brigade:renvoi")).length, 1);
});

test("tickets are taken in prio order, then oldest first (#2209)", async () => {
  const faux = new FauxGitHub();
  faux.feu(40, CALIBRE);
  faux.feu(41, [...CALIBRE, "prio:2"]);
  faux.feu(42, [...CALIBRE, "prio:0"]);
  faux.feu(43, [...CALIBRE, "prio:1"]);
  faux.feu(44, [...CALIBRE, "prio:0"]);
  const a = faux.station("A", { places: 1 });
  for (let i = 0; i < 5; i += 1) {
    await a.tour();
    await a.calme();
  }
  assert.deepEqual(faux.cuissons.map((c) => c.issue), [42, 44, 43, 41, 40]);
});

test("a red check that runs only on the base (Windows) holds nothing; a red check the PR also runs holds its merge (#2279)", async () => {
  const faux = new FauxGitHub();
  faux.feu(37);
  faux.checksDeLaBaseSeule = [{ name: "windows tests (2/4)", outcome: "red" }];
  const a = faux.station("A");
  for (let i = 0; i < 4; i += 1) {
    await a.tour();
    await a.calme();
  }
  assert.equal(faux.mergee(37)?.mergeePar, "A");
  faux.feu(38);
  faux.base = "red";
  for (let i = 0; i < 4; i += 1) {
    await a.tour();
    await a.calme();
  }
  assert.equal(faux.mergee(38), undefined);
});

test("a red base re-runs its failed jobs once: while they run, nothing is held, nothing is sent back, and green after them the pass merges (#2323)", async () => {
  const faux = new FauxGitHub();
  const avertis: string[] = [];
  faux.runDeLaBase = 501;
  faux.base = "red";
  faux.feu(39);
  const a = faux.station("A", { avertir: (texte) => void avertis.push(texte) });
  for (let i = 0; i < 4; i += 1) {
    await a.tour();
    await a.calme();
  }
  // La relance tourne encore : la livraison qui court `tests` s'est mergée, et
  // la station n'a rien dit d'autre que la relance.
  assert.equal(faux.relanceEnCours, true);
  assert.equal(faux.mergee(39)?.mergeePar, "A");
  assert.deepEqual(avertis, ["brigade : base red on A — the failed jobs of run 501 are re-run once before any merge is held"]);
  assert.deepEqual(faux.commentaires.get(39)?.filter((c) => c.body.includes("sent back")) ?? [], []);
  faux.finirLaRelance("green");
  faux.feu(40);
  for (let i = 0; i < 4; i += 1) {
    await a.tour();
    await a.calme();
  }
  assert.equal(faux.mergee(40)?.mergeePar, "A");
  assert.equal(faux.tentatives.get(501), 2);
  assert.equal(faux.appels.filter((appel) => appel.quoi === "relancerLesEchecs").length, 1);
});

test("a base still red after its re-run holds as before, and neither another station nor a restarted one re-runs it again (#2323)", async () => {
  const faux = new FauxGitHub();
  const avertis: string[] = [];
  const avertir = (texte: string) => void avertis.push(texte);
  faux.runDeLaBase = 502;
  faux.base = "red";
  const a = faux.station("A", { avertir });
  await a.tour();
  await a.calme();
  assert.equal(faux.relanceEnCours, true);
  // Tant que la relance tourne, aucun ticket de réparation (#2339).
  assert.equal(faux.creations.length, 0);
  faux.finirLaRelance("red");
  faux.feu(41);
  // B, et A redémarrée, ne savent pas que A l'a relancée : GitHub le leur dit.
  const b = faux.station("B", { avertir });
  const relancee = faux.station("A", { avertir });
  for (let i = 0; i < 4; i += 1) {
    for (const station of [a, b, relancee]) {
      await station.tour();
      await station.calme();
    }
  }
  assert.equal(faux.mergee(41), undefined);
  assert.equal(faux.tentatives.get(502), 2);
  assert.equal(faux.appels.filter((appel) => appel.quoi === "relancerLesEchecs").length, 1);
  assert.equal(avertis.filter((texte) => texte.includes("re-run")).length, 1);
  // Rouge après sa relance : un seul ticket de réparation, quelle que soit la
  // station, et c'est lui que la base rouge laisse merger (#2339).
  assert.deepEqual(faux.creations, [900]);
  assert.ok(faux.ticket(900).corps.includes(`brigade:base-rouge sha=${faux.teteDeLaBase}`));
  assert.equal(faux.mergee(900)?.mergeePar, "A");
});

test("a review runs off the turn: while one delivery's review runs, the turn reviews and merges another one (#2329)", async () => {
  const faux = new FauxGitHub();
  faux.feu(51);
  faux.feu(52);
  let liberer = () => {};
  const retenue = new Promise<void>((resoudre) => (liberer = resoudre));
  const a = faux.station("A", {
    places: 2,
    horsDuTour: true,
    juger: async (ticket) => {
      if (ticket.number === 51) await retenue;
      return { verdict: "approve", motif: "" };
    },
  });
  await a.tour();
  await jusqua(() => a.enCuisine().length === 0);
  // #51 se relit encore : les tours suivants relisent, mettent à jour et mergent #52.
  for (let i = 0; i < 20 && faux.mergee(52) === undefined; i += 1) {
    await a.tour();
    await new Promise((resoudre) => setImmediate(resoudre));
  }
  assert.equal(faux.mergee(52)?.mergeePar, "A");
  assert.equal(faux.mergee(51), undefined);
  liberer();
  for (let i = 0; i < 4 && faux.mergee(51) === undefined; i += 1) {
    await a.tour();
    await a.calme();
  }
  assert.equal(faux.mergee(51)?.mergeePar, "A");
});

test("the pass presses the next turns on a delivery, a fresh verdict and a merge attempt — CI running included, once per head — and never on a quiet turn (#2333)", async () => {
  const faux = new FauxGitHub();
  faux.feu(61);
  const a = faux.station("A");
  const pressions: boolean[] = [];
  a.presser = (maintenant = false) => pressions.push(maintenant);
  await a.tour();
  assert.deepEqual(pressions, [], "a ticket taken presses nothing");
  await a.calme();
  assert.deepEqual(pressions, [true], "delivered: its review at once");
  assert.ok(faux.ticket(61).labels.has(LABEL_IN_PASS) && !faux.ticket(61).labels.has(LABEL_TAKEN), "woken once `taken` is gone");
  await a.tour();
  assert.deepEqual(pressions, [true, false], "approved, its branch updated");
  const pr = faux.prs[0] as (typeof faux.prs)[number];
  faux.ciEnCours.add(pr.number);
  await a.tour();
  assert.deepEqual(pressions, [true, false, false], "its CI still running");
  await a.tour();
  assert.deepEqual(pressions, [true, false, false], "the same head, its CI still running: nothing new");
  faux.ciEnCours.delete(pr.number);
  await a.tour();
  assert.equal(faux.mergee(61)?.mergeePar, "A");
  assert.deepEqual(pressions, [true, false, false, false], "merged");
  await a.tour();
  assert.deepEqual(pressions, [true, false, false, false], "a quiet kitchen");
});

test("a review that requests changes presses the next turns: the ticket sent back is taken again within 30 s (#2333)", async () => {
  const faux = new FauxGitHub();
  faux.feu(62);
  const a = faux.station("A", { juger: async () => ({ verdict: "request-changes", motif: "not yet" }) });
  const pressions: boolean[] = [];
  a.presser = (maintenant = false) => pressions.push(maintenant);
  await a.tour();
  await a.calme();
  assert.deepEqual(pressions, [true]);
  await a.tour();
  assert.ok(!faux.ticket(62).labels.has(LABEL_IN_PASS), "sent back to a cook");
  assert.deepEqual(pressions.slice(0, 2), [true, false], "the verdict presses");
});

test("the loop: with a first-turn delay, the first turn waits for it, then the interval runs as before (#2436)", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const tours: number[] = [];
  const station: StationGitHub = {
    tour: async () => void tours.push(Date.now() / 1000),
    enCuisine: () => [],
    calme: async () => {},
    relu: async () => {},
  };
  const ouvert = brancherBrigadeGithub({ station: () => station, intervalleMs: 120_000, premierTourMs: 40_000, avertir: () => {} });
  t.after(() => ouvert.arreter());
  const fini = async () => {
    for (let i = 0; i < 10; i += 1) await new Promise<void>((resoudre) => queueMicrotask(resoudre));
  };
  await fini();
  assert.deepEqual(tours, []);
  t.mock.timers.tick(39_000);
  await fini();
  assert.deepEqual(tours, []);
  t.mock.timers.tick(1_000);
  await fini();
  assert.deepEqual(tours, [40]);
  t.mock.timers.tick(120_000);
  await fini();
  assert.deepEqual(tours, [40, 160]);
});

test("the loop: a press brings the next turn within 30 s, a delivery's at once, then TOURS_PRESSES turns 30 s apart and the interval again; a quiet kitchen keeps the interval (#2333)", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const tours: number[] = [];
  let pendant: (() => void) | undefined;
  const station: StationGitHub = {
    tour: async () => {
      tours.push(Date.now() / 1000);
      const faire = pendant;
      pendant = undefined;
      faire?.();
    },
    enCuisine: () => [],
    calme: async () => {},
    relu: async () => {},
  };
  const ouvert = brancherBrigadeGithub({ station: () => station, intervalleMs: 120_000, avertir: () => {} });
  t.after(() => ouvert.arreter());
  const fini = async () => {
    for (let i = 0; i < 10; i += 1) await new Promise<void>((resoudre) => queueMicrotask(resoudre));
  };
  // Le temps avance par pas de 5 s : chaque tour programme le suivant après lui.
  const avancer = async (secondes: number) => {
    t.mock.timers.tick(0);
    await fini();
    for (let s = 0; s < secondes; s += 5) {
      t.mock.timers.tick(5_000);
      await fini();
    }
  };
  const presser = (maintenant?: boolean) => {
    assert.ok(station.presser !== undefined, "the loop sets `presser`");
    station.presser(maintenant);
  };
  assert.equal(TOURS_PRESSES, 4);
  assert.equal(ATTENTE_PRESSEE_MS, 30_000);
  await avancer(300);
  assert.deepEqual(tours, [0, 120, 240], "quiet: the interval");
  // Un verdict à 300 s, le prochain tour était à 360 s : il vient à 330 s.
  presser();
  await avancer(300);
  assert.deepEqual(tours.slice(3), [330, 360, 390, 420, 540], "pressed: 4 turns 30 s apart, then the interval");
  // Une livraison à 600 s : un tour tout de suite.
  presser(true);
  await avancer(5);
  assert.deepEqual(tours.slice(8), [600], "delivered: at once");
  await avancer(250);
  assert.deepEqual(tours.slice(8), [600, 630, 660, 690, 810]);
  // Un fait pendant le tour de 930 s : les 4 suivants viennent à 30 s.
  pendant = () => presser();
  await avancer(350);
  assert.deepEqual(tours.slice(13), [930, 960, 990, 1020, 1050, 1170]);
});

test("WAITING, off-kitchen and uncalibrated tickets are not taken; with the base red, nothing in pass is reviewed or merged", async () => {
  const faux = new FauxGitHub();
  faux.feu(7, [...CALIBRE, "waiting"]);
  faux.feu(8, [...CALIBRE, "hors-cuisine"]);
  faux.feu(9, ["fire"]);
  faux.feu(10);
  const a = faux.station("A", { places: 4 });
  await a.tour();
  await a.calme();
  assert.deepEqual(faux.cuissons, [{ station: "A", issue: 10 }]);
  faux.base = "red";
  await a.tour();
  await a.tour();
  // Seule la réparation que la base rouge a fait ouvrir est relue ; #10 attend.
  assert.deepEqual(faux.relectures.filter(({ pr }) => faux.pr(pr).issue === 10), []);
  assert.equal(faux.mergee(10), undefined);
  faux.base = "green";
  await a.tour();
  await a.tour();
  assert.equal(faux.mergee(10)?.mergeePar, "A");
});

const reparations = (faux: FauxGitHub) => [...faux.tickets.values()].filter((t) => t.state === "open" && t.corps.includes("brigade:base-rouge"));

test("a red main: no PR is merged, and the next turns merge nothing either (#2214)", async () => {
  const faux = new FauxGitHub();
  faux.feu(10);
  const a = faux.station("A", { places: 2 });
  await a.tour();
  await a.calme();
  faux.base = "red";
  for (let i = 0; i < 3; i++) await a.tour();
  assert.equal(faux.mergee(10), undefined);
  assert.deepEqual(faux.relectures.filter(({ pr }) => faux.pr(pr).issue === 10), []);
  assert.equal(faux.prs.filter((pr) => pr.merged && pr.issue === 10).length, 0);
});

test("a red commit gets exactly one repair issue, however many turns and stations see it (#2214)", async () => {
  const faux = new FauxGitHub();
  faux.base = "red";
  const a = faux.station("A", { places: 0, avertir: () => {} });
  const b = faux.station("B", { places: 0, avertir: () => {} });
  for (let i = 0; i < 3; i++) await Promise.all([a.tour(), b.tour()]);
  const [reparation, ...autres] = reparations(faux);
  assert.deepEqual(autres, []);
  assert.ok(faux.creations.length <= 2);
  assert.ok(reparation?.corps.includes(`brigade:base-rouge sha=${faux.teteDeLaBase}`));
  assert.ok(reparation?.labels.has("prio:0") && reparation.labels.has("fire"));
  // Les deux stations ont créé la leur au même instant : la plus récente s'est fermée.
  assert.equal(reparation?.number, 900);
  // Un autre commit rouge : une autre réparation.
  faux.teteDeLaBase = "c".repeat(40);
  await a.tour();
  assert.equal(reparations(faux).length, 2);
});

test("a repair issue that GitHub refused to create is retried on the next turn, and the merges stay stopped (#2214)", async () => {
  const faux = new FauxGitHub();
  faux.feu(10);
  const dits: string[] = [];
  const a = faux.station("A", { places: 1, avertir: (texte) => dits.push(texte) });
  await a.tour();
  await a.calme();
  faux.base = "red";
  const github = faux.pour("A");
  const creer = github.creerIssue;
  let refus = true;
  github.creerIssue = async (issue) => {
    if (refus) throw new Error("rate limited");
    return creer(issue);
  };
  const station = stationGitHub({ nom: "A", places: 1, base: "main", github, prise: faux.prise(github, "A"), cuisiner: async () => assert.fail("no cook"), juger: async () => assert.fail("no review"), avertir: (texte) => dits.push(texte) });
  await station.tour();
  assert.equal(faux.creations.length, 0);
  assert.ok(dits.some((texte) => texte.includes("rate limited")));
  refus = false;
  await station.tour();
  assert.equal(faux.creations.length, 1);
  assert.equal(faux.mergee(10), undefined);
});

test("merges resume once main is green again, and the repair itself is merged on the red main (#2214)", async () => {
  const faux = new FauxGitHub();
  faux.feu(10);
  const a = faux.station("A", { places: 2, avertir: () => {} });
  await a.tour();
  await a.calme();
  faux.base = "red";
  // Le tour ouvre la réparation et la prend ; son cook la livre.
  await a.tour();
  await a.calme();
  const [reparation] = reparations(faux);
  assert.ok(reparation);
  assert.equal(faux.mergee(10), undefined);
  // La réparation est livrée, mise à jour, puis mergée malgré la base rouge ; #10 attend.
  await a.tour();
  await a.tour();
  assert.equal(faux.mergee(reparation.number)?.mergeePar, "A");
  assert.equal(faux.mergee(10), undefined);
  faux.base = "green";
  await a.tour();
  await a.tour();
  assert.equal(faux.mergee(10)?.mergeePar, "A");
  assert.equal(faux.creations.length, 1);
});

test("a runtime that cannot serve the project says why, and cooks nothing for it", async () => {
  const dits: string[] = [];
  const decisions: unknown[] = [];
  const ouvert = brancherBrigadeGithub({ station: () => ({ refus: "no station on this machine" }), avertir: (texte) => dits.push(texte), noter: (decision) => decisions.push(decision) });
  assert.equal(ouvert.refus, "no station on this machine");
  assert.deepEqual(ouvert.enCuisine(), []);
  await ouvert.arreter();
  assert.deepEqual(decisions, [{ etat: "refused", reason: "no station on this machine" }]);
  assert.match(dits.join("\n"), /cannot serve the project on GitHub-only state — no station on this machine; it cooks nothing for it/);
});

test("a ticket goes from fire to merged, and the module imports neither the relay, nor the mailbox, nor the log", async (t) => {
  const faux = new FauxGitHub();
  faux.feu(1);
  const ouvert = ouvrir(t, faux.station("A"));
  await jusqua(() => faux.mergee(1) !== undefined);
  assert.deepEqual(ouvert.enCuisine(), []);

  const source = readFileSync(join(import.meta.dirname, "../src/brigade-github.ts"), "utf8");
  const imports = [...source.matchAll(/^import .* from "([^"]+)";$/gm)].map(([, module]) => module ?? "");
  assert.ok(imports.includes("./github-etat/etats.ts") && imports.includes("./github-etat/fusion.ts"));
  assert.deepEqual(
    imports.filter((module) => /relais|tirer-par-github|tableau|distantes|journal|porte-journal|base\.ts|rail\.ts|alimenter|reglages/.test(module)),
    [],
  );
  // Ni interrupteur, ni ancien chemin.
  assert.doesNotMatch(source, /githubOnlyState|surGitHubSeul|ancien:/);
});


// Un flux de `claude` qui conclut sur `texte`.
const fluxQuiConclut = (texte: string) => `${JSON.stringify({ type: "result", is_error: false, result: texte })}\n`;

test("the station of this runtime: a ticket is cooked in the station's repository, reviewed by the reviewer and merged, through the real GitHub client", async (t) => {
  const repertoire = mkdtempSync(join(tmpdir(), "brigade-github-"));
  t.after(() => rmSync(repertoire, { recursive: true, force: true }));
  const faux = new FauxGitHub();
  faux.feu(11, ["fire", "model:opus", "effort:high"]);
  const fait: string[] = [];
  const lancements: Array<{ args: string[]; cwd: string }> = [];
  const lancer: Lancer = ({ args, cwd, flux }) => {
    lancements.push({ args, cwd });
    const reviewer = args.includes("--tools");
    writeFileSync(flux, fluxQuiConclut(reviewer ? JSON.stringify({ verdict: "vert", resume: "Looks right.", constats: [{ gravite: "remarque", fichier: "a.ts", constat: "a nit" }] }) : "done"));
    return { fin: Promise.resolve({ code: 0, signal: null, turns: 1, tokens: 1, durationMs: 1, arret: null, erreur: null }) };
  };
  const station = stationDuDepot({
    nom: "box",
    places: 1,
    base: "main",
    depotGitHub: "faux/depot",
    github: fauxClient(faux),
    depot: {
      connait: () => false,
      preparer: async (run) => {
        fait.push(`preparer ${run}`);
        return { worktree: join(repertoire, run), branche: `cook/${run}` };
      },
      reprendre: async (run, branche) => {
        fait.push(`reprendre ${run} ${branche}`);
        return join(repertoire, run);
      },
      retirer: (worktree) => void fait.push(`retirer ${worktree.slice(repertoire.length + 1)}`),
      ranger: async (_worktree, branche) => {
        fait.push(`ranger ${branche}`);
        return null;
      },
      pousser: (branche) => void fait.push(`pousser ${branche}`),
      commits: () => 1,
      changes: () => ["a.ts"],
      diff: () => "diff --git a/a.ts b/a.ts\n+x\n",
    },
    prise: priseDeLaStation,
    claude: "claude",
    env: {},
    cloison: null,
    plafonds: { durationMs: 60_000, tokens: 1_000, idleMs: 60_000 },
    graceMs: 1,
    reviewer: { model: "sonnet", effort: "medium" },
    flux: repertoire,
    lancer,
    avertir: (texte) => assert.fail(texte),
  });
  assert.ok(!("refus" in station));
  if ("refus" in station) return;
  await station.tour();
  await station.calme();
  for (let tour = 0; tour < 3 && faux.mergee(11) === undefined; tour += 1) {
    await station.tour();
    await station.calme();
  }
  assert.equal(faux.mergee(11)?.mergeePar, "box");
  assert.equal(faux.mergee(11)?.branche, "cook/11-github");
  assert.deepEqual(fait, ["preparer 11-github", "ranger cook/11-github", "pousser cook/11-github", "reprendre review-11-github cook/11-github", "retirer review-11-github"]);
  // Le cook part sous son calibrage, la relecture sous celui du reviewer.
  assert.deepEqual(
    lancements.map(({ args }) => args.slice(args.indexOf("--model"), args.indexOf("--model") + 4)),
    [
      ["--model", "opus", "--effort", "high"],
      ["--model", "sonnet", "--effort", "medium"],
    ],
  );
  assert.match(verdictDe(faux, faux.mergee(11)?.number ?? 0)[0]?.body ?? "", /station=box verdict=approve[\s\S]*Looks right\.[\s\S]*Remark \(`a\.ts`\): a nit/);
});

test("the station of this runtime: a delivery that changes what judges it is reviewed, then judged by a second, separate launch under opus / high with the brief of agents/second-juge.md, and merged on its approval (#2555)", async (t) => {
  const repertoire = mkdtempSync(join(tmpdir(), "brigade-github-"));
  t.after(() => rmSync(repertoire, { recursive: true, force: true }));
  const faux = new FauxGitHub();
  faux.feu(12, ["fire", "model:sonnet", "effort:low"]);
  const fait: string[] = [];
  const lancements: Array<{ args: string[]; cwd: string; flux: string }> = [];
  const lancer: Lancer = ({ args, cwd, flux }) => {
    lancements.push({ args, cwd, flux });
    const texte = args[args.indexOf("-p") + 1] ?? "";
    const reponse = texte.startsWith("Tu es le **second juge**")
      ? JSON.stringify({ verdict: "approuve", motif: "Runs one more check; weakens none." })
      : args.includes("--tools")
        ? JSON.stringify({ verdict: "vert", resume: "Looks right.", constats: [] })
        : "done";
    writeFileSync(flux, fluxQuiConclut(reponse));
    return { fin: Promise.resolve({ code: 0, signal: null, turns: 1, tokens: 1, durationMs: 1, arret: null, erreur: null }) };
  };
  const station = stationDuDepot({
    nom: "box",
    places: 1,
    base: "main",
    depotGitHub: "faux/depot",
    github: fauxClient(faux),
    depot: {
      connait: () => false,
      preparer: async (run) => ({ worktree: join(repertoire, run), branche: `cook/${run}` }),
      reprendre: async (run, branche) => {
        fait.push(`reprendre ${run} ${branche}`);
        return join(repertoire, run);
      },
      retirer: (worktree) => void fait.push(`retirer ${worktree.slice(repertoire.length + 1)}`),
      ranger: async () => null,
      pousser: () => {},
      commits: () => 1,
      changes: () => [".github/workflows/tests.yml"],
      diff: () => "diff --git a/.github/workflows/tests.yml b/.github/workflows/tests.yml\n+      - run: npm run lint\n",
    },
    prise: priseDeLaStation,
    claude: "claude",
    env: {},
    cloison: null,
    plafonds: { durationMs: 60_000, tokens: 1_000, idleMs: 60_000 },
    graceMs: 1,
    reviewer: { model: "sonnet", effort: "medium" },
    flux: repertoire,
    lancer,
    avertir: (texte) => assert.fail(texte),
  });
  assert.ok(!("refus" in station));
  if ("refus" in station) return;
  await station.tour();
  await station.calme();
  const pr = faux.prs.find((p) => p.issue === 12);
  assert.ok(pr);
  pr.fichiers = [".github/workflows/tests.yml"];
  for (let tour = 0; tour < 4 && faux.mergee(12) === undefined; tour += 1) {
    await station.tour();
    await station.calme();
  }
  assert.equal(faux.mergee(12)?.mergeePar, "box");
  // Trois lancements : le cook, le reviewer, puis le second juge — à part, dans son worktree et sous son flux.
  assert.equal(lancements.length, 3);
  const [, relecture, second] = lancements;
  assert.ok(relecture && second);
  const calibrageDe = (args: string[]) => args.slice(args.indexOf("--model"), args.indexOf("--model") + 4);
  assert.deepEqual(calibrageDe(relecture.args), ["--model", "sonnet", "--effort", "medium"]);
  assert.deepEqual(calibrageDe(second.args), ["--model", "opus", "--effort", "high"]);
  assert.deepEqual(second.args.slice(second.args.indexOf("--tools"), second.args.indexOf("--tools") + 2), ["--tools", "Read,Grep,Glob"]);
  assert.equal(second.cwd, join(repertoire, "second-judge-12-github"));
  assert.notEqual(second.flux, relecture.flux);
  assert.deepEqual(fait, ["reprendre review-12-github cook/12-github", "retirer review-12-github", "reprendre second-judge-12-github cook/12-github", "retirer second-judge-12-github"]);
  const texte = second.args[second.args.indexOf("-p") + 1] ?? "";
  assert.ok(texte.startsWith(lireLaConsigne()), "the brief of agents/second-juge.md, read from the runtime");
  assert.match(texte, /## La livraison\n\nDépôt faux\/depot, PR #\d+[\s\S]*- \.github\/workflows\/tests\.yml\n[\s\S]*\+ {6}- run: npm run lint/);
  // Rien de la relecture ne lui est donné.
  assert.doesNotMatch(texte, /Looks right/);
  assert.match((faux.commentaires.get(pr.number) ?? []).find((c) => c.body.startsWith("<!-- brigade:second-judge"))?.body ?? "", /station=box verdict=approve[\s\S]*`opus` \/ `high`[\s\S]*Runs one more check; weakens none\./);
});

// espace, le 2026-11-05, sur la station de la box (#2456) : son `ci.yml` ne part
// qu'à la main, ses PR n'ont aucun check. La station lit ses workflows sur la
// base, joue `.claude/brigade/gates.sh` sur la tête de la PR approuvée, en pose
// le statut, et merge au tour suivant.
test("the station of this runtime, on espace: reading its dispatch-only CI, it runs the project's gates on the approved PR head, posts their status, and merges", async (t) => {
  const repertoire = mkdtempSync(join(tmpdir(), "brigade-github-"));
  t.after(() => rmSync(repertoire, { recursive: true, force: true }));
  const faux = new FauxGitHub();
  faux.feu(757, ["fire", "model:opus", "effort:high"]);
  const fait: string[] = [];
  const lancer: Lancer = ({ args, flux }) => {
    writeFileSync(flux, fluxQuiConclut(args.includes("--tools") ? JSON.stringify({ verdict: "vert", resume: "Looks right.", constats: [] }) : "done"));
    return { fin: Promise.resolve({ code: 0, signal: null, turns: 1, tokens: 1, durationMs: 1, arret: null, erreur: null }) };
  };
  // Le worktree d'un run : celui des gates porte les gates du projet, qui notent où elles ont tourné.
  const worktreeDe = (run: string) => {
    const worktree = join(repertoire, run);
    mkdirSync(join(worktree, ".claude/brigade"), { recursive: true });
    const script = join(worktree, ".claude/brigade/gates.sh");
    writeFileSync(script, `#!/bin/sh\necho "gates in $1" >> "${join(repertoire, "gates.log")}"\necho "PASS  all"\n`);
    chmodSync(script, 0o755);
    return worktree;
  };
  const bas = faux.pour("box");
  const station = stationDuDepot({
    nom: "box",
    places: 1,
    base: "main",
    depotGitHub: "BOBL-tech/espace",
    github: { ...fauxClient(faux), ci: async (sha) => (await bas.ci(sha)).map((check) => ({ ...check, conclusion: "", url: null })), statuts: bas.statuts, poserStatut: bas.poserStatut } as GitHub,
    depot: {
      connait: () => false,
      preparer: async (run) => ({ worktree: worktreeDe(run), branche: `cook/${run}` }),
      reprendre: async (run, branche) => {
        fait.push(`reprendre ${run} ${branche}`);
        return worktreeDe(run);
      },
      retirer: (worktree) => void fait.push(`retirer ${worktree.slice(repertoire.length + 1)}`),
      ranger: async () => null,
      pousser: () => {},
      commits: () => 1,
      changes: () => ["src/app.ts"],
      diff: () => "diff --git a/src/app.ts b/src/app.ts\n+x\n",
      tete: (branche) => faux.prs.findLast((p) => p.branche === branche)?.sha ?? "",
      vue: () => "e5ba5e",
      fichiers: () => [".github/workflows/ci.yml", "src/app.ts"],
      lire: (_revision, chemin) => (chemin === ".github/workflows/ci.yml" ? "name: CI\non:\n  workflow_dispatch:\njobs:\n  test:\n    runs-on: ubuntu-latest\n" : null),
    },
    prise: priseDeLaStation,
    claude: "claude",
    env: {},
    cloison: null,
    plafonds: { durationMs: 60_000, tokens: 1_000, idleMs: 60_000 },
    graceMs: 1,
    reviewer: { model: "sonnet", effort: "medium" },
    flux: repertoire,
    lancer,
    gates: { delaiMs: 2_000 },
    avertir: (texte) => assert.fail(texte),
  });
  assert.ok(!("refus" in station));
  if ("refus" in station) return;
  await station.tour();
  await station.calme();
  const pr = faux.prs.find((p) => p.issue === 757);
  assert.ok(pr);
  faux.sansCI.add(pr.number);
  for (let tour = 0; tour < 4 && faux.mergee(757) === undefined; tour += 1) {
    await station.tour();
    await station.calme();
  }
  assert.equal(faux.mergee(757)?.mergeePar, "box");
  assert.deepEqual(fait, ["reprendre review-757-github cook/757-github", "retirer review-757-github", "reprendre gates-757-github cook/757-github", "retirer gates-757-github"]);
  assert.equal(readFileSync(join(repertoire, "gates.log"), "utf8"), `gates in ${join(repertoire, "gates-757-github")}\n`);
  assert.deepEqual((faux.statutsDeCommit.get(pr.sha) ?? []).map(({ state, description }) => [state, description]), [
    ["pending", "Gates running on station box"],
    ["success", "Gates green on station box"],
  ]);
});

test("a ticket whose branch a previous cook left in the clone is resumed from that branch, not prepared anew, and a failed resume keeps the branch", async (t) => {
  const repertoire = mkdtempSync(join(tmpdir(), "brigade-github-"));
  t.after(() => rmSync(repertoire, { recursive: true, force: true }));
  const faux = new FauxGitHub();
  faux.feu(13);
  const fait: string[] = [];
  const lancer: Lancer = ({ flux }) => {
    writeFileSync(flux, fluxQuiConclut("done"));
    return { fin: Promise.resolve({ code: 0, signal: null, turns: 1, tokens: 1, durationMs: 1, arret: { reason: "tokens", limit: 1, observed: 2 }, erreur: null }) };
  };
  const station = stationDuDepot({
    nom: "box",
    places: 1,
    base: "main",
    depotGitHub: "faux/depot",
    github: fauxClient(faux),
    depot: {
      connait: (branche) => branche === "cook/13-github",
      preparer: async () => assert.fail("`git worktree add -b` cannot recreate a branch the clone already has"),
      reprendre: async (run, branche) => {
        fait.push(`reprendre ${run} ${branche}`);
        return join(repertoire, run);
      },
      retirer: (worktree, branche) => void fait.push(`retirer ${worktree.slice(repertoire.length + 1)} ${branche ?? "-"}`),
      ranger: async () => null,
      pousser: () => {},
      commits: () => 1,
      changes: () => [],
      diff: () => "",
      tete: () => "a".repeat(40),
    },
    prise: priseDeLaStation,
    claude: "claude",
    env: {},
    cloison: null,
    plafonds: { durationMs: 60_000, tokens: 1_000, idleMs: 60_000 },
    graceMs: 1,
    reviewer: { model: "sonnet", effort: "medium" },
    flux: repertoire,
    lancer,
    avertir: () => {},
  });
  assert.ok(!("refus" in station));
  if ("refus" in station) return;
  await station.tour();
  await station.calme();
  assert.deepEqual(fait, ["reprendre 13-github cook/13-github", "retirer 13-github -"]);
});

// Une station dont le cook reprend la branche que le clone porte déjà, conclut
// « done », et laisse sa tête telle quelle — ou la fait avancer (#2372).
async function repriseQui(t: TestContext, avance: boolean, enConflit = false, turns = 12, faux = new FauxGitHub(), maintenant?: () => Date, poussee: boolean | "locale" = false, pushes: string[] = [], refus?: Error) {
  const repertoire = mkdtempSync(join(tmpdir(), "brigade-github-"));
  t.after(() => rmSync(repertoire, { recursive: true, force: true }));
  if (faux.tickets.size === 0) faux.feu(14);
  if (enConflit) faux.prs.push({ number: 99, issue: 14, branche: "cook/14-github", sha: "c".repeat(40), state: "open", merged: false, enRetard: false, enConflit: true, mergeePar: null, fichiers: [] });
  let tete = "a".repeat(40);
  const lancer: Lancer = ({ flux }) => {
    writeFileSync(flux, fluxQuiConclut("done"));
    if (avance) tete = "b".repeat(40);
    return { fin: Promise.resolve({ code: 0, signal: null, turns, tokens: 1, durationMs: 1, arret: null, erreur: null }) };
  };
  const station = stationDuDepot({
    nom: "box",
    places: 1,
    base: "main",
    depotGitHub: "faux/depot",
    github: fauxClient(faux),
    depot: {
      connait: (branche) => branche === "cook/14-github",
      preparer: async () => assert.fail("the branch is resumed"),
      reprendre: async (run) => join(repertoire, run),
      retirer: () => {},
      ranger: async () => null,
      pousser: (branche) => {
        if (refus !== undefined) throw refus;
        pushes.push(branche);
      },
      commits: () => 1,
      changes: () => [],
      diff: () => "",
      tete: () => tete,
      ...(poussee === "locale" ? { livree: (branche: string) => branche } : poussee ? { livree: (branche: string) => `origin/${branche}` } : {}),
    },
    prise: priseDeLaStation,
    claude: "claude",
    env: {},
    cloison: null,
    plafonds: { durationMs: 60_000, tokens: 1_000, idleMs: 60_000 },
    graceMs: 1,
    reviewer: { model: "sonnet", effort: "medium" },
    flux: repertoire,
    lancer,
    maintenant,
    avertir: () => {},
  });
  assert.ok(!("refus" in station));
  if ("refus" in station) throw new Error("inaccessible");
  await station.tour();
  await station.calme();
  return faux;
}

test("a cook that resumes a branch and adds nothing to it delivers nothing: it counts as a failed cook, and the ticket is not put back in pass (#2372)", async (t) => {
  const faux = await repriseQui(t, false);
  assert.equal(faux.ticket(14).labels.has(LABEL_IN_PASS), false);
  assert.match((faux.commentaires.get(14) ?? []).map((c) => c.body).join("\n"), /brigade:echec n=1[\s\S]*the cook added nothing since its last delivery/);
});

// #2577, 2026-11-06 : la livraison poussée sans PR, deux cooks relancés dessus sans rien y ajouter.
test("a branch pushed without a PR is a delivery cut before its PR: it goes to the pass as is, without a cook, and no failure counts (#2577)", async (t) => {
  const faux = await repriseQui(t, false, false, 12, new FauxGitHub(), undefined, true);
  assert.equal(faux.ticket(14).labels.has(LABEL_IN_PASS), true);
  assert.ok(faux.prs.some((pr) => pr.branche === "cook/14-github" && pr.state === "open"));
  assert.doesNotMatch((faux.commentaires.get(14) ?? []).map((c) => c.body).join("\n"), /brigade:echec/);
});

// #2610, 2026-11-06 : `cook/2594-github` n'existait que dans le clone ; la station la crut poussée, la PR fut refusée en 422, à chaque tour.
test("a branch that exists only in the clone is pushed once, then its PR is opened: no loop (#2610)", async (t) => {
  const pushes: string[] = [];
  const faux = await repriseQui(t, false, false, 12, new FauxGitHub(), undefined, "locale", pushes);
  assert.deepEqual(pushes, ["cook/14-github"]);
  assert.equal(faux.prs.filter((pr) => pr.branche === "cook/14-github").length, 1);
  assert.equal(faux.ticket(14).labels.has(LABEL_IN_PASS), true);
  assert.doesNotMatch((faux.commentaires.get(14) ?? []).map((c) => c.body).join("\n"), /brigade:echec/);
});

test("a branch only in the clone whose push fails goes back to a cook, not to the pass (#2610)", async (t) => {
  const faux = await repriseQui(t, false, false, 12, new FauxGitHub(), undefined, "locale", [], new Error("git push : refused"));
  assert.equal(faux.prs.length, 0);
  assert.equal(faux.ticket(14).labels.has(LABEL_IN_PASS), false);
});

test("a PR that GitHub refuses is not retried every turn: the ticket goes back to a cook with the reason, and counts as a failure (#2610)", async (t) => {
  const faux = new FauxGitHub();
  faux.refusDePR = new Error("gh api repos/faux/depot/pulls : HTTP 422");
  await repriseQui(t, false, false, 12, faux, undefined, "locale");
  assert.equal(faux.ticket(14).labels.has(LABEL_IN_PASS), false);
  assert.match((faux.commentaires.get(14) ?? []).map((c) => c.body).join("\n"), /brigade:echec n=1[\s\S]*GitHub refused the pull request[\s\S]*HTTP 422/);
});

test("a pushed branch that already had its PR is not delivered again: a cook that adds nothing to it still counts as failed (#2372, #2577)", async (t) => {
  const faux = new FauxGitHub();
  faux.feu(14);
  faux.prs.push({ number: 99, issue: 14, branche: "cook/14-github", sha: "a".repeat(40), state: "open", merged: false, enRetard: false, mergeePar: null, fichiers: [] });
  await repriseQui(t, false, false, 12, faux, undefined, true);
  assert.equal(faux.ticket(14).labels.has(LABEL_IN_PASS), false);
  assert.match((faux.commentaires.get(14) ?? []).map((c) => c.body).join("\n"), /brigade:echec n=1[\s\S]*the cook added nothing since its last delivery/);
});

// #2477, 2026-11-05 : trois cooks arrêtés par le quota, une minute après leur prise.
test("three one-minute stops caused by a Claude quota limit leave the ticket on the rail, with the reason said each time (#2508, #2477 of 2026-11-05)", async (t) => {
  const repertoire = mkdtempSync(join(tmpdir(), "brigade-github-"));
  t.after(() => rmSync(repertoire, { recursive: true, force: true }));
  const faux = new FauxGitHub();
  faux.feu(77);
  const journal: string[] = [];
  let heure = Date.parse("2026-11-05T21:17:00Z");
  const limite = { type: "rate_limit_event", rate_limit_info: { status: "rejected", resetsAt: (heure + 2 * 3_600_000) / 1000, rateLimitType: "five_hour" } };
  const lancer: Lancer = ({ flux }) => {
    writeFileSync(flux, `${JSON.stringify(limite)}\n${JSON.stringify({ type: "result", is_error: true, result: "You've hit your limit" })}\n`);
    writeFileSync(`${flux}.stderr`, "Claude usage limit reached\n");
    return { fin: Promise.resolve({ code: 1, signal: null, turns: 1, tokens: 1, durationMs: 60_000, arret: null, erreur: null }) };
  };
  const station = stationDuDepot({
    nom: "box",
    places: 1,
    base: "main",
    depotGitHub: "faux/depot",
    github: fauxClient(faux),
    depot: {
      connait: () => false,
      preparer: async (run) => ({ worktree: join(repertoire, run), branche: "cook/77-github" }),
      reprendre: async (run) => join(repertoire, run),
      retirer: () => {},
      ranger: async () => null,
      pousser: () => {},
      commits: () => 0,
      changes: () => [],
      diff: () => "",
      tete: () => "a".repeat(40),
    },
    prise: priseDeLaStation,
    claude: "claude",
    env: {},
    cloison: null,
    plafonds: { durationMs: 60_000, tokens: 1_000, idleMs: 60_000 },
    graceMs: 1,
    reviewer: { model: "sonnet", effort: "medium" },
    flux: repertoire,
    lancer,
    maintenant: () => new Date(heure),
    avertir: (texte) => void journal.push(texte),
  });
  assert.ok(!("refus" in station));
  if ("refus" in station) return;
  for (let i = 0; i < 3; i += 1) {
    await station.tour();
    await station.calme();
    // Le tour suivant, tout de suite : le ticket attend le retour du quota.
    await station.tour();
    await station.calme();
    assert.equal(faux.cuissons.length, 0);
    heure += 2 * 3_600_000 + 60_000;
  }
  const corps = (faux.commentaires.get(77) ?? []).map((c) => c.body);
  assert.equal(corps.filter((c) => /exit code 1[\s\S]*Claude usage limit reached/.test(c)).length, 3);
  assert.equal(corps.filter((c) => c.includes("brigade:echec")).length, 0);
  assert.equal(faux.ticket(77).labels.has("hors-cuisine"), false);
  assert.equal(journal.filter((l) => /exit code 1.*Claude usage limit reached/.test(l)).length, 3);
  assert.equal(corps.filter((c) => c.includes("brigade:attente")).length, 3);
});

test("a cook that stops in its first turns after a send-back, adding nothing, has not worked on the review: the try is not counted (#2508)", async (t) => {
  const faux = await repriseQui(t, false, false, 1);
  const corps = (faux.commentaires.get(14) ?? []).map((c) => c.body).join("\n");
  assert.doesNotMatch(corps, /brigade:echec/);
  assert.match(corps, /before it could work on the review's remarks/);
});

test("a cook that keeps stopping in its first turns after a send-back, adding nothing, is counted after 3 such stops, and waits between them (#2508)", async (t) => {
  const faux = new FauxGitHub();
  let heure = Date.parse("2026-11-05T21:17:00Z");
  for (let i = 0; i < 3; i += 1) {
    await repriseQui(t, false, false, 1, faux, () => new Date(heure));
    // Retenu par l'attente : un second tour immédiat ne le reprend pas.
    if (i < 2) await repriseQui(t, false, false, 1, faux, () => new Date(heure));
    heure += 31 * 60_000;
  }
  const corps = (faux.commentaires.get(14) ?? []).map((c) => c.body);
  assert.equal(corps.filter((c) => c.includes("brigade:attente")).length, 2);
  assert.equal(corps.filter((c) => c.includes("brigade:echec")).length, 1);
});

test("a cook killed by a signal is not a failed cook: the ticket waits, and nothing is counted (#2508)", async (t) => {
  const repertoire = mkdtempSync(join(tmpdir(), "brigade-github-"));
  t.after(() => rmSync(repertoire, { recursive: true, force: true }));
  const faux = new FauxGitHub();
  faux.feu(78);
  const lancer: Lancer = ({ flux }) => {
    writeFileSync(flux, "");
    return { fin: Promise.resolve({ code: null, signal: "SIGKILL", turns: 1, tokens: 1, durationMs: 1, arret: null, erreur: null }) };
  };
  const station = stationDuDepot({
    nom: "box", places: 1, base: "main", depotGitHub: "faux/depot", github: fauxClient(faux),
    depot: { connait: () => false, preparer: async (run) => ({ worktree: join(repertoire, run), branche: "cook/78-github" }), reprendre: async (run) => join(repertoire, run), retirer: () => {}, ranger: async () => null, pousser: () => {}, commits: () => 0, changes: () => [], diff: () => "", tete: () => "a".repeat(40) },
    prise: priseDeLaStation, claude: "claude", env: {}, cloison: null, plafonds: { durationMs: 60_000, tokens: 1_000, idleMs: 60_000 }, graceMs: 1, reviewer: { model: "sonnet", effort: "medium" }, flux: repertoire, lancer, avertir: () => {},
  });
  assert.ok(!("refus" in station));
  if ("refus" in station) return;
  await station.tour();
  await station.calme();
  const corps = (faux.commentaires.get(78) ?? []).map((c) => c.body).join("\n");
  assert.match(corps, /signal SIGKILL/);
  assert.doesNotMatch(corps, /brigade:echec/);
});

// #2543, 2026-11-06 : la station, relancée par sa mise à jour toutes les 35 à 45 min, tuait ses
// cooks ; chaque ticket attendait 30 min, puis son cook repris mourait à la relance suivante.
test("a cook killed because its station stops does not hold its ticket: no wait, no try counted, and the next round takes it again (#2543)", async (t) => {
  const repertoire = mkdtempSync(join(tmpdir(), "brigade-github-"));
  t.after(() => rmSync(repertoire, { recursive: true, force: true }));
  const faux = new FauxGitHub();
  faux.feu(79);
  let lances = 0;
  let tuer: () => void = () => {};
  const lancer: Lancer = ({ flux }) => {
    lances += 1;
    writeFileSync(flux, "");
    return { fin: new Promise((resoudre) => (tuer = () => resoudre({ code: null, signal: "SIGKILL", turns: 4, tokens: 1, durationMs: 1, arret: null, erreur: null }))) };
  };
  const options = {
    nom: "box", places: 1, base: "main", depotGitHub: "faux/depot", github: fauxClient(faux),
    depot: { connait: () => false, preparer: async (run: string) => ({ worktree: join(repertoire, run), branche: "cook/79-github" }), reprendre: async (run: string) => join(repertoire, run), retirer: () => {}, ranger: async () => null, pousser: () => {}, commits: () => 0, changes: () => [], diff: () => "", tete: () => "a".repeat(40) },
    prise: priseDeLaStation, claude: "claude", env: {}, cloison: null, plafonds: { durationMs: 60_000, tokens: 1_000, idleMs: 60_000 }, graceMs: 1, reviewer: { model: "sonnet", effort: "medium" as const }, flux: repertoire, lancer, avertir: () => {},
  };
  const station = stationDuDepot(options);
  assert.ok(!("refus" in station));
  if ("refus" in station) return;
  await station.tour();
  await jusqua(() => lances === 1);
  // La station s'arrête, puis le runtime tue son cook.
  station.arreter?.();
  tuer();
  await station.calme();

  const corps = (faux.commentaires.get(79) ?? []).map((c) => c.body).join("\n");
  assert.match(corps, /stopped with its station[\s\S]*signal SIGKILL/);
  assert.doesNotMatch(corps, /brigade:attente/);
  assert.doesNotMatch(corps, /brigade:echec/);
  assert.equal(faux.ticket(79).labels.has(LABEL_TAKEN), false);

  // La station relancée le reprend à son premier tour, sans attendre.
  const relancee = stationDuDepot(options);
  assert.ok(!("refus" in relancee));
  if ("refus" in relancee) return;
  await relancee.tour();
  await jusqua(() => lances === 2);
  tuer();
  await relancee.calme();
});

test("the loop tells its station it stops before the runtime kills the cooks (#2543)", async (t) => {
  const appels: string[] = [];
  const station: StationGitHub = {
    tour: async () => void appels.push("tour"),
    arreter: () => void appels.push("arreter"),
    quitter: async () => void appels.push("quitter"),
    enCuisine: () => [],
    calme: async () => {},
    relu: async () => {},
  };
  const ouvert = brancherBrigadeGithub({ station: () => station, intervalleMs: 120_000, avertir: () => {} });
  const arrete = ouvert.arreter();
  // Rien n'est attendu : le runtime tue ses cooks juste après cet appel, dans le même tour de boucle.
  assert.ok(appels.includes("arreter"));
  await arrete;
  assert.deepEqual(appels.slice(-2), ["arreter", "quitter"]);
  t.after(() => ouvert.arreter());
});

test("a cook that adds nothing to a branch whose PR conflicts with main is not a failed cook: three of them do not take the ticket off the kitchen (#2454, #2061 of 2026-11-05)", async (t) => {
  for (let i = 0; i < 3; i += 1) {
    const faux = await repriseQui(t, false, true);
    const corps = (faux.commentaires.get(14) ?? []).map((c) => c.body).join("\n");
    assert.doesNotMatch(corps, /brigade:echec/);
    assert.equal(faux.ticket(14).labels.has("hors-cuisine"), false);
    assert.equal(faux.ticket(14).labels.has(LABEL_IN_PASS), false);
  }
});

test("a cook that takes a ticket whose PR conflicts with main is told to bring the branch up to date, and its delivery goes back in pass (#2454)", async (t) => {
  const faux = await repriseQui(t, true, true);
  assert.equal(faux.ticket(14).labels.has(LABEL_IN_PASS), true);
});

// #2545, 2026-11-06 : sans accès à GitHub, le cook repris sur une CI rouge ne savait que le nom
// des jobs, et rejouait la sélection de la CI pour trouver le test en échec — 16 cooks, 93 min.
test("a cook that takes a ticket whose PR's CI is red is given what the red checks say: their failure annotations, check by check (#2545)", async (t) => {
  const repertoire = mkdtempSync(join(tmpdir(), "brigade-github-"));
  t.after(() => rmSync(repertoire, { recursive: true, force: true }));
  const faux = new FauxGitHub();
  faux.feu(14);
  faux.prs.push({ number: 99, issue: 14, branche: "cook/14-github", sha: "c".repeat(40), state: "open", merged: false, enRetard: false, enConflit: false, mergeePar: null, fichiers: [] });
  const job = "https://github.com/faux/depot/actions/runs/7/job/";
  const lus: string[] = [];
  let consigne = "";
  const lancer: Lancer = ({ args, flux }) => {
    consigne = args[args.indexOf("-p") + 1] ?? "";
    writeFileSync(flux, fluxQuiConclut("done"));
    return { fin: Promise.resolve({ code: 0, signal: null, turns: 12, tokens: 1, durationMs: 1, arret: null, erreur: null }) };
  };
  const station = stationDuDepot({
    nom: "box", places: 1, base: "main", depotGitHub: "faux/depot",
    github: {
      ...fauxClient(faux),
      ci: async () => [
        { name: "tests app (3/3)", conclusion: "failure", outcome: "red", url: `${job}31` },
        { name: "types (app)", conclusion: "failure", outcome: "red", url: `${job}32` },
        { name: "tests runtime (1/16)", conclusion: "success", outcome: "green", url: `${job}33` },
      ],
      annotationsDuCheck: async (check) => {
        lus.push(check.name);
        return check.name === "tests app (3/3)" ? [{ chemin: null, ligne: null, titre: "tests app (3/3)", message: "✖ failing tests:\n\ntest at test/peau.test.ts:57:1\n✖ the skin has no hard-coded colour" }] : [];
      },
    },
    depot: { connait: (branche) => branche === "cook/14-github", preparer: async () => assert.fail("the branch is resumed"), reprendre: async (run) => join(repertoire, run), retirer: () => {}, ranger: async () => null, pousser: () => {}, commits: () => 1, changes: () => [], diff: () => "", tete: () => "a".repeat(40) },
    prise: priseDeLaStation, claude: "claude", env: {}, cloison: null, plafonds: { durationMs: 60_000, tokens: 1_000, idleMs: 60_000 }, graceMs: 1, reviewer: { model: "sonnet", effort: "medium" }, flux: repertoire, lancer, avertir: () => {},
  });
  assert.ok(!("refus" in station));
  if ("refus" in station) return;
  await station.tour();
  await station.calme();

  // Les checks rouges seuls sont lus.
  assert.deepEqual(lus, ["tests app (3/3)", "types (app)"]);
  assert.match(consigne, /## Work left on the delivery\n\nthe CI of PR #99 is red\./);
  assert.match(consigne, /### What the CI says is red[\s\S]*#### `tests app \(3\/3\)`\n\n```\ntests app \(3\/3\)\n✖ failing tests:\n\ntest at test\/peau\.test\.ts:57:1\n✖ the skin has no hard-coded colour\n```/);
  assert.match(consigne, /#### `types \(app\)`\n\n_GitHub gives no failure annotation for this check: https:\/\/github\.com\/faux\/depot\/actions\/runs\/7\/job\/32_/);
  assert.doesNotMatch(consigne, /tests runtime \(1\/16\)/);
});

test("a cook that resumes a branch and moves its head delivers as before (#2372)", async (t) => {
  const faux = await repriseQui(t, true);
  assert.equal(faux.ticket(14).labels.has(LABEL_IN_PASS), true);
});

for (const nom of ["box/claude", "macbook-air-de-benoit/claude"]) {
  test(`the station declared \`${nom}\` runs on GitHub only: it takes the ticket, signs its verdict and merges, under its name as declared`, async (t) => {
    const repertoire = mkdtempSync(join(tmpdir(), "brigade-github-"));
    t.after(() => rmSync(repertoire, { recursive: true, force: true }));
    const faux = new FauxGitHub();
    faux.feu(12);
    const lancer: Lancer = ({ args, flux }) => {
      writeFileSync(flux, fluxQuiConclut(args.includes("--tools") ? JSON.stringify({ verdict: "vert", resume: "Looks right.", constats: [] }) : "done"));
      return { fin: Promise.resolve({ code: 0, signal: null, turns: 1, tokens: 1, durationMs: 1, arret: null, erreur: null }) };
    };
    const station = stationDuDepot({
      nom,
      places: 1,
      base: "main",
      depotGitHub: "faux/depot",
      github: fauxClient(faux, nom),
      depot: {
        connait: () => false,
        preparer: async (run) => ({ worktree: join(repertoire, run), branche: `cook/${run}` }),
        reprendre: async (run) => join(repertoire, run),
        retirer: () => {},
        ranger: async () => null,
        pousser: () => {},
        commits: () => 1,
        changes: () => ["a.ts"],
        diff: () => "diff --git a/a.ts b/a.ts\n+x\n",
      },
      prise: priseDeLaStation,
      claude: "claude",
      env: {},
      cloison: null,
      plafonds: { durationMs: 60_000, tokens: 1_000, idleMs: 60_000 },
      graceMs: 1,
      reviewer: { model: "sonnet", effort: "medium" },
      flux: repertoire,
      lancer,
      avertir: (texte) => assert.fail(texte),
    });
    assert.ok(!("refus" in station), "refus" in station ? station.refus : "");
    if ("refus" in station) return;
    await station.tour();
    await station.calme();
    for (let tour = 0; tour < 3 && faux.mergee(12) === undefined; tour += 1) {
    await station.tour();
    await station.calme();
  }
    assert.ok((faux.commentaires.get(12) ?? []).some((c) => c.body.endsWith(`Taken by station \`${nom}\`.`)));
    assert.match(verdictDe(faux, faux.mergee(12)?.number ?? 0)[0]?.body ?? "", new RegExp(`^<!-- brigade:verdict station=${nom} verdict=approve `));
    assert.equal(faux.mergee(12)?.mergeePar, nom);
  });
}

test("a station never claims a ticket that needs a capability it lacks, and claims it once it has every one (#2187)", async () => {
  const faux = new FauxGitHub();
  faux.feu(1, [...CALIBRE, "needs:mac"]);
  faux.feu(2, [...CALIBRE, "needs:mac", "needs:android"]);
  faux.feu(3);
  const sans = faux.station("A", { places: 3 });
  await sans.tour();
  await sans.calme();
  assert.deepEqual(faux.cuissons, [{ station: "A", issue: 3 }]);
  const partielle = faux.station("B", { places: 3, capacites: ["mac"] });
  await partielle.tour();
  await partielle.calme();
  assert.deepEqual(faux.cuissons.map((c) => c.issue), [3, 1]);
  const complete = faux.station("C", { places: 3, capacites: ["mac", "android"] });
  await complete.tour();
  await complete.calme();
  assert.deepEqual(faux.cuissons.map((c) => c.issue), [3, 1, 2]);
});

test("a ticket whose zone is held by another open PR is held back, and claimed once that PR is closed (#2188)", async () => {
  const faux = new FauxGitHub();
  faux.feu(1, CALIBRE, zoneDe("runtime/src/a.ts", "docs/"));
  const autre = faux.prOuverte(["runtime/src/b.ts", "docs/runtime/README.md"]);
  const a = faux.station("A");
  await a.tour();
  await a.calme();
  assert.deepEqual(faux.cuissons, []);
  assert.equal(faux.prisesDe("A"), 0);
  // La PR qui tenait la zone est fermée : le ticket est pris au tour suivant.
  autre.state = "closed";
  await a.tour();
  await a.calme();
  assert.deepEqual(faux.cuissons, [{ station: "A", issue: 1 }]);
});

test("a free zone is claimed, a zone inside or around a changed folder is held, an own PR holds nothing (#2188)", async () => {
  const faux = new FauxGitHub();
  faux.feu(1, CALIBRE, zoneDe("app/src/x.ts"));
  faux.feu(2, CALIBRE, zoneDe("runtime/src/deep/file.ts"));
  faux.feu(3, CALIBRE, zoneDe("runtime"));
  faux.feu(4, CALIBRE, zoneDe("scripts/x.sh"));
  faux.feu(5, CALIBRE);
  faux.prOuverte(["runtime/src"]);
  // La PR du ticket 4 : elle change sa propre zone.
  faux.prOuverte(["scripts/x.sh"], brancheDuTicket(4));
  const a = faux.station("A", { places: 5 });
  await a.tour();
  await a.calme();
  assert.deepEqual(faux.cuissons.map((c) => c.issue).sort(), [1, 4, 5]);
});

test("the open PRs are read only when a ticket has a zone (#2188)", async () => {
  const faux = new FauxGitHub();
  faux.feu(1);
  const a = faux.station("A");
  await a.tour();
  await a.calme();
  assert.ok(!faux.appels.some((appel) => appel.quoi === "prsOuvertes"));
  assert.deepEqual(faux.cuissons, [{ station: "A", issue: 1 }]);
});

test("the zone of a ticket is read from its Zone section", () => {
  assert.deepEqual(zoneDuCorps(zoneDe("a/b.ts", "c/")), ["a/b.ts", "c"]);
  assert.deepEqual(zoneDuCorps("## Zone\n\n`a.ts`, ./b/\n"), ["a.ts", "b"]);
  assert.deepEqual(zoneDuCorps("## Context\n\nno zone here"), []);
  assert.ok(secoupent("runtime", "runtime/src/a.ts"));
  assert.ok(!secoupent("runtime", "runtime2/a.ts"));
});

test("a taken label nobody holds — a release whose removal failed, left by another station — is removed at any turn, and the ticket is taken again (#2206)", async () => {
  const faux = new FauxGitHub();
  const b = faux.station("B", { cuisiner: () => new Promise(() => {}) });
  // B a déjà passé son premier tour : rien n'est plus rendu par redémarrage.
  await b.tour();
  // A a lâché #7 — le commentaire est parti — mais le retrait du label a échoué.
  faux.feu(7, [...CALIBRE, LABEL_TAKEN]);
  const a = faux.pour("A");
  await a.commenter(7, corpsDePrise("A"));
  await a.commenter(7, corpsDeLacher("A"));
  // Un ticket que A tient vraiment garde son label.
  faux.feu(8, [...CALIBRE, LABEL_TAKEN]);
  await a.commenter(8, corpsDePrise("A"));
  await b.tour();
  assert.ok(!faux.ticket(7).labels.has(LABEL_TAKEN), "the stale label is gone");
  assert.ok(faux.ticket(8).labels.has(LABEL_TAKEN), "#8 stays A's");
  await b.tour();
  assert.deepEqual(faux.pris(), [7, 8]);
  assert.equal(faux.prisesDe("B"), 1);
});

// #2429 : la nuit du 5 novembre 2026. La limite de GitHub dit une reprise que
// les refus dépassent ; puis, le tour GitHub seul rendu à lui-même, #2187
// attend #2186 mis de côté et #2383, prenable, n'est pas pris. Chaque ligne se
// lit comme la retenue la lit, par `lireLaCuisine` sur le tour enveloppé.
test("the held-kitchen line replays 2026-11-05: the limit past its announced end, a set-aside dependency, a claim-gate skip (#2429)", async (t) => {
  const racine = repertoireTemporaire(t);
  const journal = ouvrirJournal(repertoireTemporaire(t));
  t.after(() => journal.fermer());
  const T = (hhmm: string) => Date.parse(`2026-11-05T${hhmm}:00.000Z`);
  let instant = T("09:04");
  const limite = limiteDeLaStation(racine, { maintenant: () => instant });
  t.after(() => limite.fermer());
  const faux = new FauxGitHub();
  const suivi = suivreLeTour(() => new Date(instant));
  const github = suivi.envelopper(faux.pour("A"));
  const station = stationGitHub({ nom: "A", places: 1, base: "main", github, prise: faux.prise(github, "A"), cuisiner: async () => assert.fail("no cook"), juger: async () => assert.fail("no review"), avertir: (texte) => assert.fail(texte), sauter: suivi.sauter });
  const ligne = () => direCause(diagnostiquer(lireLaCuisine(journal.base, new Date(instant), { station: racine, tour: suivi }).signaux()).cause);

  // Rien n'est pris : #2186 est mis de côté, #2187 l'attend, #2383 est prenable mais sa zone est tenue.
  faux.feu(2186, [...CALIBRE, "hors-cuisine"]);
  faux.poster(2186, "A", "<!-- brigade:renvoi n=2 sha=abc -->\nStation `A`: still not mergeable after 2 sends back — conflicts with main\n\nTaken off the kitchen (`hors-cuisine`): a human decides.");
  faux.feu(2187, CALIBRE);
  faux.poster(2187, "A", "<!-- brigade:fiche -->\nattend : #2186\nzone : rien");
  faux.feu(2383, CALIBRE, zoneDe("runtime/src/a.ts"));
  faux.prOuverte(["runtime/src/a.ts"], "cook/2390-github");
  await station.tour();
  await station.calme();
  assert.deepEqual(faux.cuissons, []);

  // 09:07 : la limite, reprise dite 09:19.
  limite.suspendre(T("09:19"));
  assert.throws(() => limite.prendre(), LimiteGitHubAtteinte);
  instant = T("09:07");
  assert.match(ligne(), /^cause: GitHub is rate-limiting calls \(limit reached\), back around /);
  // 09:21 : la reprise dite est passée, GitHub refuse encore.
  instant = T("09:20");
  limite.suspendre(T("09:21"));
  instant = T("09:22");
  assert.match(ligne(), /^cause: GitHub is rate-limiting calls \(limit reached\), calls still refused at /);
  // Les refus cessent : la limite ne tient plus, le tour GitHub seul dit ce qui retient.
  instant = T("10:30");
  await station.tour();
  await station.calme();
  assert.equal(ligne(), "cause: #2187 waits on #2186, set aside: Station `A`: still not mergeable after 2 sends back — conflicts with main; #2383 is claimable but not claimed, the claim gate skipped it: zone held by #2390");
  // Sans ce que la porte a dit, la cause reste inconnue.
  faux.prs.length = 0;
  faux.tickets.delete(2187);
  faux.ticket(2383).corps = "";
  faux.ticket(2383).labels.add("taken");
  await station.tour();
  assert.match(ligne(), /^cause unknown/);
});
