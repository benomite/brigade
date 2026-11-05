// With the GitHub-only switch on, the old-path loops that read the log stop at
// their entry; with it off they behave as before. Each loop is driven on a real
// runtime, its switch a flag the test flips. What must not happen is checked
// after several ticks, never after a duration.
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { avecRail } from "../../../src/alimenter.ts";
import { brancherGardeFous } from "../../../src/garde-fous.ts";
import { boucleAncienneArretee, BOUCLES_PERIMEES, BRANCHES_PAR_TOUR, elaguerBranchesPerimees, type Curseur } from "../../../src/github-seul/boucles-perimees/boucles-perimees.ts";
import { LimiteGitHubAtteinte } from "../../../src/limite-github.ts";
import { brancherCadence } from "../../../src/produit/cadence/brancher.ts";
import { principal } from "../../../src/produit/cadence/commande.ts";
import { lireLaCadence } from "../../../src/produit/cadence/etat.ts";
import { demarrer } from "../../../src/runtime.ts";
import { lireStations } from "../../../src/stations-declarees.ts";
import { cuisineFermee } from "../../closing/kitchen.ts";
import { demander, SansReponse } from "../../aides/demander.ts";
import { BAIL_MS, CALIBRE, chef, cuisine, fauxGitHub, issue, montre, REGLAGES } from "../../aides/cuisine.ts";
import { DEPOT, jusqua, repertoireTemporaire } from "../../outils.ts";

const FAUX_ROLE = join(import.meta.dirname, "../../produit/cadence/faux-role.sh");

// The switch, as the test flips it.
const interrupteur = (allume: boolean) => {
  const etat = { allume };
  return { etat, perimee: () => etat.allume };
};

// Lets `combien` more ticks go by.
const laisserPasser = async (journal: { tout(): Array<{ type: string }> }, combien = 6) => {
  const ticks = () => journal.tout().filter((fait) => fait.type === "runtime.ticked").length;
  const depart = ticks();
  await jusqua(() => ticks() >= depart + combien);
};

describe("the guard", () => {
  test("stops the old path with the switch on, unless the GitHub-only station was refused", () => {
    assert.equal(boucleAncienneArretee({ githubOnlyState: true })(), true);
    assert.equal(boucleAncienneArretee({ githubOnlyState: false })(), false);
    assert.equal(boucleAncienneArretee({})(), false);
    assert.equal(boucleAncienneArretee(null)(), false);
    let refusee = false;
    const garde = boucleAncienneArretee({ githubOnlyState: true }, () => refusee);
    assert.equal(garde(), true);
    refusee = true;
    assert.equal(garde(), false);
  });

  test("names the loops it stops", () => {
    assert.deepEqual([...BOUCLES_PERIMEES], ["rail-feeding", "closer", "product-role", "base-check", "station-gist-rail", "cleanup", "pass"]);
  });
});

describe("rail feeding", () => {
  test("switch on, the poll reads no issue and the rail stays empty; off, the ticket arrives", async (t) => {
    const sw = interrupteur(true);
    const k = cuisineFermee(t, { perimee: sw.perimee });
    k.gh.poser(issue(7));
    await laisserPasser(k.journal);
    assert.equal(k.types(7).includes("ticket.arrived"), false);
    assert.deepEqual(k.runtime.rail.tickets(), []);

    sw.etat.allume = false;
    await jusqua(() => k.types(7).includes("ticket.arrived"));
  });

  test("switch off from the start, the ticket arrives as before", async (t) => {
    const k = cuisineFermee(t, { perimee: interrupteur(false).perimee });
    await k.poser(7);
    assert.equal(k.runtime.rail.tickets().length, 1);
  });
});

describe("the closer", () => {
  test("switch on, a requested pass never starts; off, it runs", async (t) => {
    const sw = interrupteur(true);
    const k = cuisineFermee(t, { perimee: sw.perimee });
    k.closer.message("Rien à retirer.\n\n<livrable>\nRien.\n</livrable>\n");
    const { code, sortie } = await k.demander();
    assert.equal(code, 0, sortie);
    await laisserPasser(k.journal);
    assert.equal(k.types().includes("closing.started"), false);

    sw.etat.allume = false;
    await k.fin();
  });
});

describe("the base check", () => {
  test("switch on, the base is not checked; off, it is", async (t) => {
    const sw = interrupteur(true);
    const k = cuisineFermee(t, { perimee: sw.perimee });
    // A merge made outside the runtime: the base is to be checked for it.
    k.journal.ajouter({ project: "brigade", ticket: 17, author: "runtime", type: "merge.done", payload: { pr: "https://github.com/acme/brigade/pull/101", sha: k.teteDeLaBase(), by: "outside", reconciled: false, unverified: true } });
    await laisserPasser(k.journal);
    assert.equal(k.types().includes("base.checked"), false);

    sw.etat.allume = false;
    await jusqua(() => k.types().includes("base.checked"));
  });
});

describe("the pass", () => {
  test("switch on, a delivery the log holds is not judged nor merged; off, it is (#2370)", async (t) => {
    const sw = interrupteur(false);
    let ciPrete = false;
    const k = cuisine(t, { pass: true, issues: [issue(17, CALIBRE)], perimee: sw.perimee });
    chef(k.repertoire, "grant.activated");
    let lectures = 0;
    k.gh.github.ci = async () => {
      lectures += 1;
      // Livrée, sa CI en cours : le jugement en vol la lit, et l'interrupteur
      // s'allume là, avant qu'il ne finisse. Allumé dès `pass.started`, il
      // laissait ce jugement lire une CI déjà verte : sous Windows, ses gates
      // durent plus que les ticks attendus, et il mergeait (#2378).
      if (lectures === 1) sw.etat.allume = true;
      return ciPrete ? [] : [{ name: "tests", outcome: "pending", conclusion: "pending", url: null }];
    };
    await jusqua(() => sw.etat.allume);
    // Allumé : le jugement en vol finit sur sa CI en cours, puis plus rien ne repart.
    await laisserPasser(k.journal, 2);
    ciPrete = true;
    await laisserPasser(k.journal, 3);
    assert.equal(lectures, 1);
    assert.equal(k.types(17).includes("merge.done"), false);

    sw.etat.allume = false;
    await jusqua(() => k.types(17).includes("merge.done"));
  });
});

describe("the product role", () => {
  const role = (t: TestContext, sw: ReturnType<typeof interrupteur>) => {
    let arreter: (() => void) | undefined;
    t.after(() => arreter?.());
    const repertoire = repertoireTemporaire(t);
    const dossier = join(repertoire, "role");
    mkdirSync(dossier, { recursive: true });
    const heure = montre();
    const gh = fauxGitHub();
    const socle = demarrer({ repertoireEtat: repertoire, projet: "brigade", intervalleVeilleMs: 5, intervalleTickMs: 20, maintenant: heure.maintenant });
    const garde = brancherGardeFous(REGLAGES, avecRail(socle, { depot: DEPOT, dureeBailMs: BAIL_MS, gh: "", github: gh.github, maintenant: heure.maintenant }));
    const runtime = brancherCadence(garde, {
      perimee: sw.perimee,
      github: gh.github,
      depotGitHub: DEPOT,
      repertoireEtat: repertoire,
      bin: FAUX_ROLE,
      calibrage: () => ({ model: "sonnet", effort: "low" }),
      env: { ...process.env, FAUX_ROLE_DIR: dossier },
      maintenant: heure.maintenant,
      avertir: () => {},
    });
    arreter = () => runtime.arreter("test");
    principal({ args: ["on"], env: { BRIGADE_STATE_DIR: repertoire }, dire: () => {}, redire: () => {} });
    return { runtime, gh };
  };

  test("switch on, the role does not leave on the empty rail; off, it does", async (t) => {
    const sw = interrupteur(true);
    const k = role(t, sw);
    await laisserPasser(k.runtime.journal);
    assert.equal(lireLaCadence(k.runtime.journal.base).dernierPassage, null);

    sw.etat.allume = false;
    await jusqua(() => lireLaCadence(k.runtime.journal.base).dernierPassage !== null);
  });
});

describe("the station", () => {
  const MAC = "mac/claude";
  const DECLAREES = lireStations({ BRIGADE_STATIONS: `box/claude:1:code,${MAC}:2:chrome-connecté:distante` });

  test("switch on, a remote station's request gets no answer from the gist rail; off, it is answered", async (t) => {
    const sw = interrupteur(true);
    const k = cuisine(t, { stations: DECLAREES, scenario: "muet", perimee: sw.perimee });
    const annoncer = (attenteMs?: number) => demander(k.repertoire, MAC, { verb: "announce" }, { maintenant: k.heure.maintenant, pasMs: 2, attenteMs });
    await assert.rejects(annoncer(300), SansReponse);

    sw.etat.allume = false;
    // The answer is a fact to wait for: the gesture's own wait, as every other
    // station test, not 5 s of wall clock a loaded Windows runner can outlast.
    const reponse = await annoncer();
    assert.equal(reponse.ok, true);
  });

  test("switch on, the cleanup leaves a served ticket's branch; off, it prunes it", async (t) => {
    const sw = interrupteur(true);
    const k = cuisine(t, { perimee: sw.perimee });
    const noter = (ticket: number, type: string, payload: Record<string, unknown>) => k.journal.ajouter({ project: "brigade", ticket, author: "runtime", type, payload } as never);
    noter(17, "ticket.arrived", { title: "Ticket 17", priority: 1, createdAt: "2026-10-01T00:00:00Z", url: "https://exemple.test/17" });
    noter(17, "cook.launched", { run: "17-aaa", limits: { durationMs: 3_600_000, tokens: 2_000_000, idleMs: 600_000 }, stream: "runs/17-aaa.jsonl", station: "box/claude", model: "sonnet", effort: "low", branch: "cook/17-aaa", worktree: "worktrees/17-aaa" });
    noter(17, "cook.exited", { run: "17-aaa", outcome: "ok", code: 0, signal: null, turns: 1, tokens: 1, durationMs: 1 });
    noter(17, "worktree.removed", { worktree: "worktrees/17-aaa", branch: "cook/17-aaa", harvest: null });
    noter(17, "ticket.served", {});
    await laisserPasser(k.journal);
    assert.equal(k.types(17).includes("branch.removed"), false);

    sw.etat.allume = false;
    await jusqua(() => k.types(17).includes("branch.removed"));
  });
});

describe("the stale `cook/<n>-github` branches", () => {
  const sonder = (fermees: Record<number, boolean | null>, branches: string[]) => {
    const supprimees: string[] = [];
    const avertissements: string[] = [];
    return {
      supprimees,
      avertissements,
      options: {
        branches: async () => branches,
        issueFermee: async (numero: number) => fermees[numero] ?? null,
        supprimer: async (branche: string) => void supprimees.push(branche),
        avertir: (message: string) => void avertissements.push(message),
      },
    };
  };

  test("those whose issue is closed are deleted, live ones are kept", async () => {
    const k = sonder({ 14: true, 15: false, 16: true }, ["cook/14-github", "cook/15-github", "cook/16-github"]);
    assert.deepEqual(await elaguerBranchesPerimees(k.options), ["cook/14-github", "cook/16-github"]);
    assert.deepEqual(k.supprimees, ["cook/14-github", "cook/16-github"]);
  });

  test("an issue GitHub does not answer for keeps its branch, and other branches are never touched", async () => {
    const k = sonder({ 14: true }, ["cook/14-github", "cook/20-github", "cook/14-aaa", "cook/fermeture-0a1b2c3d", "main"]);
    assert.deepEqual(await elaguerBranchesPerimees(k.options), ["cook/14-github"]);
    assert.deepEqual(k.supprimees, ["cook/14-github"]);
  });

  test("a branch that cannot be deleted is said, and the others still go", async () => {
    const k = sonder({ 14: true, 16: true }, ["cook/14-github", "cook/16-github"]);
    const supprimer = k.options.supprimer;
    k.options.supprimer = async (branche) => {
      if (branche === "cook/14-github") throw new Error("push refused");
      await supprimer(branche);
    };
    assert.deepEqual(await elaguerBranchesPerimees(k.options), ["cook/16-github"]);
    assert.match(k.avertissements.join("\n"), /cook\/14-github not removed — push refused/);
  });

  test("twenty stale branches are removed over several passes, a few issues read per pass, never all at once (#2436)", async () => {
    const numeros = Array.from({ length: 20 }, (_, i) => 100 + i);
    const k = sonder(Object.fromEntries(numeros.map((n) => [n, true])), numeros.map((n) => `cook/${n}-github`));
    // A deleted branch is no longer listed.
    k.options.branches = async () => numeros.map((n) => `cook/${n}-github`).filter((branche) => !k.supprimees.includes(branche));
    let lues = 0;
    const issueFermee = k.options.issueFermee;
    k.options.issueFermee = async (numero: number) => {
      lues += 1;
      return issueFermee(numero);
    };
    const curseur: Curseur = { derniere: null };
    const passes: number[] = [];
    while (k.supprimees.length < 20 && passes.length < 20) {
      const avant = lues;
      await elaguerBranchesPerimees(k.options, curseur);
      passes.push(lues - avant);
    }
    assert.deepEqual(k.supprimees.sort(), numeros.map((n) => `cook/${n}-github`).sort());
    assert.equal(passes.length, Math.ceil(20 / BRANCHES_PAR_TOUR));
    assert.ok(passes.every((n) => n <= BRANCHES_PAR_TOUR));
  });

  test("the passes go round the live branches, and GitHub's pause ends a pass without a word", async () => {
    const k = sonder({}, ["cook/1-github", "cook/2-github", "cook/3-github", "cook/4-github", "cook/5-github"]);
    const vues: number[] = [];
    let enPause = false;
    k.options.issueFermee = async (numero: number) => {
      if (enPause) throw new LimiteGitHubAtteinte(0, 0);
      vues.push(numero);
      return false;
    };
    const curseur: Curseur = { derniere: null };
    await elaguerBranchesPerimees(k.options, curseur);
    await elaguerBranchesPerimees(k.options, curseur);
    assert.deepEqual(vues, [1, 2, 3, 4, 5, 1]);
    enPause = true;
    await elaguerBranchesPerimees(k.options, curseur);
    assert.deepEqual(k.avertissements, []);
    enPause = false;
    await elaguerBranchesPerimees(k.options, curseur);
    assert.deepEqual(vues.slice(6), [2, 3, 4]);
  });
});
