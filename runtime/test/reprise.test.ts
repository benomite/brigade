// La reprise des cooks en vol : un runtime remplacé pendant qu'un cook tourne
// ne le tue pas — un relais le porte —, et celui qui démarre sur son état le
// retrouve et le suit comme le sien : sa fin, sa pass, son merge.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { cooksEnCours } from "../src/projections/guardrails.ts";
import { chef, cuisine, issue, STATION, type Options } from "./aides/cuisine.ts";
import { BASE, git, jusqua, mort, vivant } from "./outils.ts";

// Une première vie : un cook part sur #15 et commite, puis attend qu'on le
// laisse conclure. Le runtime est arrêté pendant qu'il tourne.
async function premiereVie(t: TestContext, options: Options = {}) {
  const premiere = cuisine(t, { scenario: "commite-puis-attend", issues: [issue(15)], ...options });
  await jusqua(() => premiere.cooks().length === 1 && premiere.dernier("cook.launched", 15) !== undefined);
  const lancement = premiere.dernier("cook.launched", 15) ?? {};
  const run = String(lancement.run);
  const fichierDuPid = join(premiere.repertoire, "runs", `${run}.cook.pid`);
  await jusqua(() => existsSync(fichierDuPid));
  const pid = Number(readFileSync(fichierDuPid, "utf8"));
  const worktree = join(premiere.repertoire, String(lancement.worktree));
  await jusqua(() => existsSync(join(worktree, "travail.txt")));
  // Le fichier est écrit avant d'être commité : dans un worktree git, le
  // commit est le fait attendu, pas le fichier.
  if (existsSync(join(worktree, ".git"))) await jusqua(() => git(worktree, "log", "-1", "--format=%s") === "le travail du cook");
  premiere.runtime.arreter("SIGTERM");
  return { premiere, run, pid, worktree, branche: String(lancement.branch) };
}

// Ce qui, au journal d'un ticket, dirait qu'un cook a été interrompu ou relancé.
const ARRETS = ["cook.interrupted", "cook.exited", "guard.tripped", "ticket.released"];

describe("la reprise des cooks en vol", { concurrency: 4 }, () => {
  test("un second runtime démarré pendant qu'un cook du premier est en vol le liste en cours, sans le relancer ni le tuer", async (t) => {
    const { premiere, run, pid, worktree } = await premiereVie(t);
    // Entre les deux vies, personne ne tient le projet : le cook tourne seul.
    assert.equal(vivant(pid), true);
    assert.equal(existsSync(worktree), true);

    const seconde = cuisine(t, { scenario: "livre", lieux: premiere.lieux });

    assert.deepEqual(cooksEnCours(seconde.journal.base).map((cook) => [cook.run, cook.ticket]), [[run, 15]]);
    assert.deepEqual(seconde.dernier("cook.resumed", 15), { run, pid: Number(JSON.parse(readFileSync(join(seconde.repertoire, "runs", `${run}.relais.json`), "utf8")).pid) });
    assert.equal(seconde.etat(15), "taken");
    assert.deepEqual(seconde.types(15).filter((type) => ARRETS.includes(type)), []);
    assert.equal(seconde.cooks().length, 1);
    assert.equal(vivant(pid), true);
    assert.match(seconde.avertissements.join("\n"), new RegExp(`cook ${run} du ticket #15 repris en vol \\(station ${STATION.replace("/", "\\/")}`));
  });

  test("aucun cook en vol n'est interrompu pendant le remplacement : ni son processus, ni son worktree, ni sa branche — le rangement de la nouvelle vie passe sans y toucher", async (t) => {
    const { premiere, run, pid, worktree, branche } = await premiereVie(t, { git: true });
    const tete = git(premiere.lieux.clone, "rev-parse", branche);

    const seconde = cuisine(t, { lieux: premiere.lieux, git: true });
    // Plusieurs ticks : le rangement des worktrees et le bail ont eu leur tour.
    const ticks = () => seconde.journal.tout().filter((e) => e.type === "runtime.ticked").length;
    await jusqua(() => ticks() >= 5);

    assert.equal(vivant(pid), true);
    assert.equal(existsSync(join(worktree, "travail.txt")), true);
    assert.equal(git(premiere.lieux.clone, "rev-parse", branche), tete);
    assert.deepEqual(seconde.types(15).filter((type) => ARRETS.includes(type) || type.startsWith("worktree.")), []);
    assert.deepEqual(cooksEnCours(seconde.journal.base).map((cook) => cook.run), [run]);
    assert.equal(seconde.etat(15), "taken");
  });

  test("le cook repris finit son travail : sa branche est poussée, sa PR ouverte, il passe la pass et se merge — sans qu'aucun cook neuf ne parte", async (t) => {
    const { premiere, run, pid, branche } = await premiereVie(t);

    const seconde = cuisine(t, { lieux: premiere.lieux, pass: true });
    chef(seconde.repertoire, "grant.activated");
    await jusqua(() => seconde.dernier("cook.resumed", 15) !== undefined);
    seconde.conclure();

    await jusqua(() => seconde.types(15).includes("ticket.served"));
    await mort(pid);
    const pr = `https://github.com/benomite/brigade/pull/101`;
    assert.deepEqual(seconde.dernier("cook.exited", 15) && [seconde.dernier("cook.exited", 15)?.run, seconde.dernier("cook.exited", 15)?.outcome], [run, "ok"]);
    assert.deepEqual([seconde.dernier("cook.reported", 15)?.ending, seconde.dernier("cook.reported", 15)?.branch, seconde.dernier("cook.reported", 15)?.pr], ["done", branche, pr]);
    assert.deepEqual(seconde.gh.prs.map((ouverte) => [ouverte.branche, ouverte.base]), [[branche, BASE]]);
    assert.equal(seconde.dernier("merge.done", 15)?.by, "pass");
    assert.equal(seconde.gh.merges.length, 1);
    // Son worktree est rangé une fois, par la station qui l'a repris.
    assert.deepEqual(seconde.types(15).filter((type) => type === "worktree.removed"), ["worktree.removed"]);
    // Un seul cook pour ce ticket, d'une vie à l'autre : celui de la première.
    assert.equal(seconde.cooks().length, 1);
    assert.deepEqual(seconde.types(15).filter((type) => type === "cook.launched"), ["cook.launched"]);
    assert.deepEqual(seconde.types(15).filter((type) => ARRETS.includes(type)), ["cook.exited"]);
    // Le compte-rendu sur le ticket est celui d'un cook fini, comme les autres.
    assert.match(seconde.gh.commentaires.find(([numero]) => numero === 15)?.[1] ?? "", /\*\*Cook `box\/claude` — fini\*\*/);
  });

  test("un cook qui a fini pendant que personne ne tenait le projet : sa fin est lue au démarrage, et sa livraison part en pass", async (t) => {
    const { premiere, run, pid } = await premiereVie(t);
    premiere.conclure();
    await jusqua(() => existsSync(join(premiere.repertoire, "runs", `${run}.fin.json`)));
    await mort(pid);

    const seconde = cuisine(t, { lieux: premiere.lieux });

    await jusqua(() => seconde.etat(15) === "pass" && seconde.dernier("cook.reported", 15) !== undefined);
    assert.deepEqual([seconde.dernier("cook.exited", 15)?.run, seconde.dernier("cook.exited", 15)?.outcome], [run, "ok"]);
    assert.equal(seconde.dernier("cook.reported", 15)?.ending, "done");
    assert.equal(seconde.cooks().length, 1);
  });

  test("un cook repris garde son bail : le temps du remplacement ne compte pas contre lui", async (t) => {
    const { premiere } = await premiereVie(t, { bailMs: 600_000 });
    // Le remplacement a duré plus que le bail.
    premiere.lieux.heure.avancer(3_600_000);

    const seconde = cuisine(t, { lieux: premiere.lieux, bailMs: 600_000 });
    await jusqua(() => seconde.dernier("cook.resumed", 15) !== undefined);
    const ticks = () => seconde.journal.tout().filter((e) => e.type === "runtime.ticked").length;
    await jusqua(() => ticks() >= 3);

    assert.equal(seconde.etat(15), "taken");
    assert.deepEqual(seconde.types(15).filter((type) => ARRETS.includes(type)), []);
  });
});
