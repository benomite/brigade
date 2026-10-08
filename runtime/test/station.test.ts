// La station `box/claude` branchée sur un runtime complet : rail, garde-fous,
// un vrai dépôt git local, un faux `claude` et un GitHub de test.
import assert from "node:assert/strict";
import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { VARIABLES_DE_JETON } from "../src/claude.ts";
import type { Depot } from "../src/depot.ts";
import type { GitHub } from "../src/github.ts";
import { MARQUEUR, porteFiche } from "../src/fiche.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { etatDesGardeFous } from "../src/projections/garde-fous.ts";
import { etatStation } from "../src/projections/stations.ts";
import { STATION } from "../src/station.ts";
import { BAIL_MS, CALIBRE, chef, cuisine, issue } from "./aides/cuisine.ts";
import { BASE, commiter, DEPOT, git, jusqua } from "./outils.ts";

// Chaque test a ses lieux — répertoire d'état, dépôt, GitHub : ils se jouent de front.
describe("la station", { concurrency: 8 }, () => {
  test("au branchement, la station annonce son nom, son moteur, ce qu'elle fournit et son plafond de cooks", (t) => {
    const { journal } = cuisine(t);

    const annonce = journal.tout().find((e) => e.type === "station.announced");
    assert.deepEqual([annonce?.author, annonce?.payload], [`station:${STATION}`, { station: "box/claude", engine: "claude", provides: ["code"], maxCooks: 1 }]);
    assert.equal(etatStation(journal.base, STATION)?.maxCooks, 1);
  });

  test("l'annonce n'est réécrite au redémarrage que si elle a changé", (t) => {
    const premiere = cuisine(t);
    premiere.runtime.arreter("test");

    const seconde = cuisine(t, { lieux: premiere.lieux });

    assert.equal(seconde.types().filter((type) => type === "station.announced").length, 1);
  });

  test("un ticket calibré en attente est pris, et son cook part dans un worktree qui lui est propre", async (t) => {
    const { repertoire, clone, etat, dernier, lancements, journal } = cuisine(t, { git: true, scenario: "bavard", issues: [issue(15)] });
    await jusqua(() => lancements().length === 1);

    assert.equal(etat(15), "taken");
    const lancement = dernier("cook.launched", 15);
    const run = String(lancement?.run);
    assert.match(run, /^15-[0-9a-f]{8}$/);
    const [cook] = lancements();
    assert.equal(cook?.cwd.endsWith(join("worktrees", run)), true);
    assert.equal(git(cook?.cwd ?? "", "rev-parse", "--abbrev-ref", "HEAD"), `cook/${run}`);
    assert.notEqual(git(cook?.cwd ?? "", "rev-parse", "--show-toplevel"), git(clone, "rev-parse", "--show-toplevel"));
    assert.equal(journal.duTicket(15).find((e) => e.type === "ticket.taken")?.author, `station:${STATION}`);
    assert.equal(existsSync(join(repertoire, "worktrees", run)), true);
  });

  test("le calibrage du ticket est celui du cook : passé au binaire, et porté par le journal", async (t) => {
    const { dernier, lancements } = cuisine(t, { scenario: "bavard", issues: [issue(15, ["fire", "model:opus", "effort:xhigh"])] });
    await jusqua(() => lancements().length === 1);

    const args = lancements()[0]?.args ?? [];
    assert.equal(args[args.indexOf("--model") + 1], "opus");
    assert.equal(args[args.indexOf("--effort") + 1], "xhigh");
    assert.match(args[args.indexOf("-p") + 1] ?? "", /ticket #15/);
    const lancement = dernier("cook.launched", 15);
    assert.deepEqual(
      [lancement?.station, lancement?.model, lancement?.effort, lancement?.branch, lancement?.worktree],
      [STATION, "opus", "xhigh", `cook/${lancement?.run}`, join("worktrees", String(lancement?.run))],
    );
  });

  test("le cook ne reçoit pas l'état du runtime qui le fait tourner", async (t) => {
    const { lancements } = cuisine(t, { scenario: "bavard", issues: [issue(15)] });
    await jusqua(() => lancements().length === 1);

    assert.equal(Object.keys(lancements()[0]?.env ?? {}).some((nom) => nom.startsWith("BRIGADE_")), false);
  });

  test("un cook qui livre : sa branche est poussée, une PR vise la base, le ticket part en pass", async (t) => {
    const { origine, gh, etat, dernier, types } = cuisine(t, { git: true, issues: [issue(15)] });
    await jusqua(() => gh.commentaires.length === 1);

    const run = String(dernier("cook.launched", 15)?.run);
    assert.equal(etat(15), "pass");
    assert.equal(git(origine, "show", `cook/${run}:travail.txt`), "le travail du cook");
    assert.deepEqual(gh.prs.map((pr) => [pr.branche, pr.base]), [[`cook/${run}`, BASE]]);
    assert.match(gh.prs[0]?.titre ?? "", /#15/);
    assert.deepEqual(types(15).filter((type) => type !== "ticket.renewed" && type !== "cook.progressed"), [
      "ticket.arrived",
      "ticket.taken",
      "cook.launched",
      "cook.exited",
      "ticket.passing",
      "cook.reported",
    ]);
    assert.deepEqual(dernier("cook.reported", 15), {
      run,
      ending: "done",
      reason: null,
      summary: "J'ai ajouté `travail.txt` et vérifié qu'il se lit.",
      branch: `cook/${run}`,
      pr: `https://github.com/${DEPOT}/pull/101`,
    });
  });

  test("le cook commente son ticket : ce qu'il a fait, son calibrage, ce qu'il a consommé, sa PR", async (t) => {
    const { gh, dernier } = cuisine(t, { issues: [issue(15)] });
    await jusqua(() => gh.commentaires.length === 1);

    const [numero, corps] = gh.commentaires[0] ?? [0, ""];
    assert.equal(numero, 15);
    assert.match(corps, /fini/);
    assert.match(corps, /`sonnet` \/ `low`/);
    assert.match(corps, /1 tour\b/);
    assert.match(corps, /tokens/);
    assert.match(corps, new RegExp(`cook/${dernier("cook.launched", 15)?.run}`));
    assert.match(corps, /pull\/101/);
    assert.match(corps, /J'ai ajouté `travail.txt` et vérifié qu'il se lit\./);
  });

  test("un ticket sans calibrage n'est jamais lancé : il passe 86 et un commentaire dit quoi poser", async (t) => {
    const { gh, etat, types, lancements, journal } = cuisine(t, { issues: [issue(15, ["fire", "model:sonnet"])] });
    await jusqua(() => gh.commentaires.length === 1);

    assert.equal(etat(15), "86");
    assert.equal(journal.duTicket(15).at(-1)?.type, "ticket.86");
    assert.deepEqual(journal.duTicket(15).at(-1)?.payload, { reason: "no-calibration", until: null });
    assert.equal(types().includes("cook.launched"), false);
    assert.deepEqual(lancements(), []);
    const [numero, corps] = gh.commentaires[0] ?? [0, ""];
    assert.equal(numero, 15);
    assert.match(corps, /effort:<low\|medium\|high\|xhigh\|max>/);
    assert.doesNotMatch(corps, /model:</);
  });

  test("un ticket non calibré ne retient pas le suivant", async (t) => {
    const { etat, lancements } = cuisine(t, { scenario: "bavard", issues: [issue(14, ["fire"]), issue(15)] });
    await jusqua(() => lancements().length === 1);

    assert.deepEqual([etat(14), etat(15)], ["86", "taken"]);
  });

  test("une fois ses labels posés, le ticket refusé revient en attente tout seul et son cook part", async (t) => {
    const { gh, etat, lancements, journal } = cuisine(t, { scenario: "bavard", issues: [issue(15, ["fire"])] });
    await jusqua(() => etat(15) === "86");

    gh.poser(issue(15, CALIBRE, { updatedAt: "2026-10-08T11:00:00Z" }));
    await jusqua(() => lancements().length === 1);

    assert.deepEqual(journal.duTicket(15).find((e) => e.type === "ticket.released")?.payload, { reason: "calibrated", station: null });
    assert.equal(etat(15), "taken");
  });

  test("un ticket dont la fiche est illisible n'est jamais lancé : il passe 86 et un commentaire dit quoi corriger", async (t) => {
    const { gh, etat, types, lancements, dernier } = cuisine(t, { scenario: "bavard" });
    gh.ficher(14, "2026-10-08T09:00:00Z", `${MARQUEUR}\n- attend : #15\n- budget : 40 tours\n- zone : /etc`);
    gh.ficher(15, "2026-10-08T09:00:00Z", `${MARQUEUR}\n- zone : runtime/`);
    gh.poser(issue(14));
    gh.poser(issue(15));
    await jusqua(() => lancements().length === 1);

    assert.deepEqual([etat(14), etat(15)], ["86", "taken"]);
    assert.deepEqual(dernier("ticket.86", 14), { reason: "unreadable-card", until: null });
    assert.equal(types(14).includes("cook.launched"), false);
    const [numero, corps] = gh.commentaires[0] ?? [0, ""];
    assert.equal(numero, 14);
    assert.match(corps, /fiche du ticket illisible/);
    assert.match(corps, /- clé inconnue « budget »/);
    assert.match(corps, /- zone : « \/etc » n'est pas un chemin du dépôt/);
    assert.match(corps, /reviendra en attente tout seul/);
    // Il cite le marqueur sans devenir une seconde fiche.
    assert.match(corps, /brigade:fiche/);
    assert.equal(porteFiche(corps), false);
  });

  test("un cook qui écrit hors de la zone de son ticket est signalé au chef : au journal et sur l'issue, sans que rien ne s'arrête", async (t) => {
    const { gh, etat, dernier, types } = cuisine(t, { scenario: "bavard", suite: ["livre"] });
    gh.ficher(15, "2026-10-08T09:00:00Z", `${MARQUEUR}\n- zone : runtime/src, docs/`);
    gh.ficher(16, "2026-10-08T09:00:00Z", `${MARQUEUR}\n- zone : travail.txt`);
    gh.poser(issue(15));
    gh.poser(issue(16));
    await jusqua(() => gh.commentaires.length === 1);

    const run = String(dernier("cook.launched", 15)?.run);
    assert.deepEqual(dernier("cook.out-of-zone", 15), { run, zone: ["runtime/src", "docs/"], files: [{ path: "travail.txt", owners: [16] }], cardChanged: false });
    // Signaler n'est pas arrêter : la livraison part en pass comme une autre.
    assert.equal(etat(15), "pass");
    assert.deepEqual(types(15).slice(-3), ["ticket.passing", "cook.out-of-zone", "cook.reported"]);
    const [numero, corps] = gh.commentaires[0] ?? [0, ""];
    assert.equal(numero, 15);
    assert.match(corps, /Hors zone — 1 fichier écrit hors de la zone du ticket/);
    assert.match(corps, /- `travail\.txt` — dans la zone de #16/);
    assert.match(corps, /zone du ticket : `runtime\/src`, `docs\/`/);
    assert.match(corps, /Rien n'est arrêté/);
    assert.equal(porteFiche(corps), false);
  });

  test("dans sa zone, dans un chemin commun, ou sans zone : rien n'est signalé", async (t) => {
    const cas: [fiche: string | null, communs: string[]][] = [
      [`${MARQUEUR}\n- zone : travail.txt`, []],
      [`${MARQUEUR}\n- zone : .`, []],
      [`${MARQUEUR}\n- zone : runtime/`, ["travail.txt"]],
      [`${MARQUEUR}\n- attend : rien`, []],
      [null, []],
    ];
    await Promise.all(
      cas.map(async ([fiche, communs]) => {
        const { gh, types, etat } = cuisine(t, { scenario: "bavard", suite: ["livre"], communs });
        if (fiche !== null) gh.ficher(15, "2026-10-08T09:00:00Z", fiche);
        gh.poser(issue(15));
        await jusqua(() => gh.commentaires.length === 1);

        assert.equal(etat(15), "pass", String(fiche));
        assert.equal(types(15).includes("cook.out-of-zone"), false, String(fiche));
        assert.doesNotMatch(gh.commentaires[0]?.[1] ?? "", /Hors zone|fiche/i, String(fiche));
      }),
    );
  });

  test("une fiche modifiée pendant la cuisson ne change pas le juge : la zone est celle de la prise, et le changement est montré", async (t) => {
    const { gh, journal, lancements, dernier, conclure } = cuisine(t, { scenario: "bavard", suite: ["commite-puis-attend"] });
    gh.ficher(15, "2026-10-08T09:00:00Z", `${MARQUEUR}\n- zone : runtime/src`);
    gh.poser(issue(15));
    await jusqua(() => lancements().length === 1);
    // Le cook tourne sous le compte du service : il peut éditer la fiche de son propre ticket.
    gh.ficher(15, "2026-10-08T09:30:00Z", `${MARQUEUR}\n- zone : runtime/src, travail.txt`);
    await jusqua(() => journal.duTicket(15).some((e) => e.type === "ticket.changed"));
    conclure();
    await jusqua(() => gh.commentaires.length === 1);

    assert.deepEqual(dernier("cook.out-of-zone", 15)?.files, [{ path: "travail.txt", owners: [] }]);
    assert.deepEqual([dernier("cook.out-of-zone", 15)?.zone, dernier("cook.out-of-zone", 15)?.cardChanged], [["runtime/src"], true]);
    const corps = gh.commentaires[0]?.[1] ?? "";
    assert.match(corps, /- `travail\.txt`\n/);
    assert.match(corps, /La fiche a changé pendant la cuisson.*zone du ticket à la prise : `runtime\/src`.*aujourd'hui : `runtime\/src`, `travail\.txt`/s);
  });

  test("une fiche modifiée pendant la cuisson est montrée même quand la livraison tient dans la zone de la prise", async (t) => {
    const { gh, journal, lancements, dernier, conclure } = cuisine(t, { scenario: "bavard", suite: ["commite-puis-attend"] });
    gh.ficher(15, "2026-10-08T09:00:00Z", `${MARQUEUR}\n- zone : travail.txt`);
    gh.poser(issue(15));
    await jusqua(() => lancements().length === 1);
    gh.ficher(15, "2026-10-08T09:30:00Z", `${MARQUEUR}\n- zone : aucune`);
    await jusqua(() => journal.duTicket(15).some((e) => e.type === "ticket.changed"));
    conclure();
    await jusqua(() => gh.commentaires.length === 1);

    assert.deepEqual(dernier("cook.out-of-zone", 15), { run: dernier("cook.launched", 15)?.run, zone: ["travail.txt"], files: [], cardChanged: true });
    const corps = gh.commentaires[0]?.[1] ?? "";
    assert.doesNotMatch(corps, /Hors zone/);
    assert.match(corps, /La fiche a changé pendant la cuisson.*aujourd'hui : aucune/s);
  });

  test("une fois sa fiche corrigée, le ticket refusé revient en attente tout seul et son cook part", async (t) => {
    const { gh, etat, lancements, journal } = cuisine(t, { scenario: "bavard" });
    gh.ficher(15, "2026-10-08T09:00:00Z", `${MARQUEUR}\n- attend : le rail`);
    gh.poser(issue(15));
    await jusqua(() => etat(15) === "86");

    gh.ficher(15, "2026-10-08T11:00:00Z", `${MARQUEUR}\n- attend : rien`);
    await jusqua(() => lancements().length === 1);

    assert.deepEqual(journal.duTicket(15).find((e) => e.type === "ticket.released")?.payload, { reason: "card-readable", station: null });
    assert.equal(etat(15), "taken");
  });

  test("la station ne fait tourner qu'un cook à la fois, même si le rail est plein", async (t) => {
    const { etat, lancements, types } = cuisine(t, { scenario: "bavard", issues: [issue(14), issue(15), issue(16)] });
    await jusqua(() => lancements().length === 1);
    await new Promise((resoudre) => setTimeout(resoudre, 80));

    assert.deepEqual([etat(14), etat(15), etat(16)], ["taken", "waiting", "waiting"]);
    assert.equal(types().filter((type) => type === "cook.launched").length, 1);
  });

  test("un cook fini, la station prend le ticket suivant", async (t) => {
    const { etat } = cuisine(t, { issues: [issue(14), issue(15)] });

    await jusqua(() => etat(14) === "pass" && etat(15) === "pass");
  });

  test("un cook qui échoue : le ticket revient en attente, le journal et un commentaire disent pourquoi", async (t) => {
    const { gh, dernier, journal } = cuisine(t, { scenario: "bavard", suite: ["echec"], issues: [issue(15)] });
    await jusqua(() => gh.commentaires.length === 1);

    assert.equal(dernier("cook.exited", 15)?.outcome, "failed");
    const rapport = journal.duTicket(15).find((e) => e.type === "cook.reported")?.payload as Record<string, unknown>;
    assert.deepEqual([rapport.ending, rapport.reason, rapport.pr], ["failed", "code de sortie 1", null]);
    assert.match(gh.commentaires[0]?.[1] ?? "", /échoué.*code de sortie 1/s);
    assert.deepEqual(gh.prs, []);
  });

  test("un ticket qui échoue est repris par un cook neuf, et le disjoncteur borne la série", async (t) => {
    const { journal, etat, types, lancements } = cuisine(t, { scenario: "echec", issues: [issue(15)] });
    await jusqua(() => etatDesGardeFous(journal.base).breakerOpenedAt !== null);
    await new Promise((resoudre) => setTimeout(resoudre, 80));

    assert.equal(types(15).filter((type) => type === "cook.launched").length, 3);
    assert.equal(new Set(lancements().map((cook) => cook.cwd)).size, 3);
    assert.equal(etat(15), "waiting");
  });

  test("un cook qui conclut sans commit, avec un compte-rendu, a livré un ticket sans diff : il part en pass, sans rien pousser ni ouvrir de PR", async (t) => {
    const pousses: string[] = [];
    const { gh, etat, dernier, journal } = cuisine(t, {
      scenario: "bavard",
      suite: ["rapporte-sans-commit"],
      issues: [issue(15)],
      depot: (depot) => ({ ...depot, pousser: (branche) => void pousses.push(branche) }),
    });
    await jusqua(() => gh.commentaires.length === 1);

    assert.equal(journal.duTicket(15).find((e) => e.type === "cook.exited")?.payload.outcome, "ok");
    const rapport = dernier("cook.reported", 15);
    assert.deepEqual([rapport?.ending, rapport?.reason, rapport?.pr], ["done", "no-diff", null]);
    assert.match(String(rapport?.summary), /^Audit : la CI passe douze minutes/);
    assert.equal(etat(15), "pass");
    assert.deepEqual([pousses, gh.prs], [[], []]);
    assert.match(gh.commentaires[0]?.[1] ?? "", /fini, sans diff[\s\S]*Aucun commit : le livrable de ce ticket est le compte-rendu[\s\S]*reviewer le relit[\s\S]*Audit : la CI/);
    assert.equal(etatDesGardeFous(journal.base).failures, 0);
  });

  test("un cook qui écrit des fichiers, oublie de les commiter et dit avoir fini n'a rien livré : ce n'est pas un ticket sans diff", async (t) => {
    const { gh, etat, dernier, journal } = cuisine(t, { scenario: "bavard", suite: ["ecrit-sans-commiter"], issues: [issue(15)] });
    await jusqua(() => gh.commentaires.length === 1);

    assert.equal(journal.duTicket(15).find((e) => e.type === "cook.exited")?.payload.outcome, "failed");
    assert.deepEqual([dernier("cook.reported", 15)?.ending, dernier("cook.reported", 15)?.reason], ["failed", "no-commit"]);
    assert.notEqual(etat(15), "pass");
    assert.equal(dernier("ticket.passing", 15), undefined);
    assert.equal(etatDesGardeFous(journal.base).failures, 1);
  });

  test("un cook qui conclut sans rien commiter ni rien dire a échoué", async (t) => {
    const { gh, etat, dernier, journal } = cuisine(t, { scenario: "bavard", suite: ["fini"], issues: [issue(15)] });
    await jusqua(() => gh.commentaires.length === 1);

    assert.equal(journal.duTicket(15).find((e) => e.type === "cook.exited")?.payload.outcome, "failed");
    assert.equal(journal.duTicket(15).find((e) => e.type === "cook.reported")?.payload.reason, "no-commit");
    assert.equal(etatDesGardeFous(journal.base).failures, 1);
    assert.notEqual(etat(15), "pass");
    assert.equal(dernier("ticket.passing", 15), undefined);
  });

  test("une branche qui ne peut pas être poussée fait du cook un échec, pas une livraison", async (t) => {
    const pousser = () => {
      throw new Error("git push : remote: Permission denied");
    };
    const { gh, journal } = cuisine(t, { scenario: "bavard", suite: ["livre"], issues: [issue(15)], depot: (depot) => ({ ...depot, pousser }) });
    await jusqua(() => gh.commentaires.length === 1);

    const rapport = journal.duTicket(15).find((e) => e.type === "cook.reported")?.payload as Record<string, unknown>;
    assert.equal(rapport.ending, "failed");
    assert.match(String(rapport.reason), /push.*Permission denied/);
    assert.equal(journal.duTicket(15).find((e) => e.type === "cook.exited")?.payload.outcome, "failed");
    assert.deepEqual(gh.prs, []);
  });

  test("un cook qui a commité puis s'est arrêté en erreur a fini : son travail est récolté et part en pass", async (t) => {
    const { gh, journal, etat, dernier } = cuisine(t, { scenario: "bavard", suite: ["commite-puis-echoue"], issues: [issue(15)] });
    await jusqua(() => gh.commentaires.length === 1);

    assert.equal(etat(15), "pass");
    assert.equal(journal.duTicket(15).find((e) => e.type === "cook.exited")?.payload.outcome, "ok");
    assert.equal(etatDesGardeFous(journal.base).failures, 0);
    const rapport = dernier("cook.reported", 15);
    assert.deepEqual([rapport?.ending, rapport?.reason], ["done", "harvested:code de sortie 1"]);
    assert.deepEqual(gh.prs.map((pr) => pr.branche), [rapport?.branch]);
    assert.match(gh.commentaires[0]?.[1] ?? "", /récolté.*code de sortie 1/s);
  });

  test("un cook inerte après son commit est arrêté par l'inactivité, et son travail récolté", async (t) => {
    const { gh, journal, etat, dernier, types } = cuisine(t, {
      scenario: "bavard",
      suite: ["commite-puis-se-tait"],
      // Assez long pour que le cook ait commité avant, même sur une machine
      // chargée : son démarrage compte dans l'inactivité.
      plafonds: { idleMs: 1500 },
      issues: [issue(15)],
    });
    await jusqua(() => gh.commentaires.length === 1);

    assert.equal(etat(15), "pass");
    assert.equal(types(15).includes("guard.tripped"), true);
    assert.equal(journal.duTicket(15).find((e) => e.type === "cook.exited")?.payload.outcome, "ok");
    assert.equal(dernier("cook.reported", 15)?.reason, "harvested:guard:idle");
  });

  test("un cook arrêté par un garde-fou sans avoir rien commité reste un échec", async (t) => {
    const { gh, journal, dernier } = cuisine(t, { scenario: "bavard", suite: ["muet"], plafonds: { idleMs: 300 }, seuilDisjoncteur: 1, issues: [issue(15)] });
    await jusqua(() => gh.commentaires.length === 1);

    assert.equal(journal.duTicket(15).find((e) => e.type === "cook.exited")?.payload.outcome, "guard");
    assert.deepEqual([dernier("cook.reported", 15)?.ending, dernier("cook.reported", 15)?.reason], ["failed", "guard:idle"]);
    assert.deepEqual(gh.prs, []);
  });

  test("un travail récolté qui ne peut pas être poussé reste un échec", async (t) => {
    const pousser = () => {
      throw new Error("git push : remote: Permission denied");
    };
    const { gh, journal, dernier } = cuisine(t, {
      scenario: "bavard",
      suite: ["commite-puis-echoue"],
      issues: [issue(15)],
      depot: (depot) => ({ ...depot, pousser }),
    });
    await jusqua(() => gh.commentaires.length === 1);

    assert.equal(journal.duTicket(15).find((e) => e.type === "cook.exited")?.payload.outcome, "failed");
    assert.match(String(dernier("cook.reported", 15)?.reason), /push-failed/);
  });

  test("le « stop » du chef ne récolte rien : le ticket revient en attente, le travail reste sur la station", async (t) => {
    const { repertoire, gh, etat, dernier, lancements } = cuisine(t, { scenario: "commite-puis-bavarde", issues: [issue(15)] });
    await jusqua(() => lancements().length === 1 && existsSync(join(lancements()[0]?.cwd ?? "", "travail.txt")));

    chef(repertoire, "kitchen.stopped");

    await jusqua(() => dernier("cook.exited", 15) !== undefined);
    assert.equal(dernier("cook.exited", 15)?.outcome, "stop");
    assert.equal(etat(15), "waiting");
    assert.deepEqual(gh.prs, []);
  });

  test("un quota épuisé après un commit reste un 86 : le ticket attend le retour du quota", async (t) => {
    const { gh, etat, dernier } = cuisine(t, { scenario: "commite-puis-quota", issues: [issue(15)] });
    await jusqua(() => dernier("cook.reported", 15) !== undefined);

    assert.equal(etat(15), "86");
    assert.deepEqual(gh.prs, []);
  });

  test("quota épuisé : le ticket passe 86 jusqu'à l'heure de retour, sans échec ni commentaire", async (t) => {
    const { gh, journal, etat, dernier } = cuisine(t, { scenario: "quota", issues: [issue(15)] });
    await jusqua(() => etat(15) === "86");
    await jusqua(() => dernier("cook.reported", 15) !== undefined);

    assert.equal(dernier("cook.exited", 15)?.outcome, "neutral");
    assert.deepEqual(dernier("ticket.86", 15), { reason: "quota", until: "2026-10-08T15:30:00.000Z" });
    assert.deepEqual(dernier("station.86"), { station: STATION, reason: "quota", until: "2026-10-08T15:30:00.000Z", window: "five_hour" });
    assert.equal(dernier("cook.reported", 15)?.ending, "86");
    assert.equal(etatDesGardeFous(journal.base).failures, 0);
    assert.deepEqual(gh.commentaires, []);
  });

  test("tant que le quota n'est pas revenu la station ne prend rien ; à l'heure dite, elle reprend", async (t) => {
    const { heure, etat, types } = cuisine(t, { scenario: "livre", suite: ["quota"], issues: [issue(14), issue(15)] });
    await jusqua(() => etat(14) === "86");
    await new Promise((resoudre) => setTimeout(resoudre, 80));
    assert.equal(etat(15), "waiting");
    assert.equal(types().filter((type) => type === "cook.launched").length, 1);

    heure.avancer(6 * 3_600_000);

    await jusqua(() => etat(14) === "pass" && etat(15) === "pass");
  });

  test("un quota épuisé qui ne dit pas quand il revient est retenté une heure plus tard", async (t) => {
    const { etat, dernier } = cuisine(t, { scenario: "quota-sans-heure", issues: [issue(15)] });
    await jusqua(() => etat(15) === "86");

    assert.equal(dernier("ticket.86", 15)?.until, "2026-10-08T11:00:00.000Z");
    assert.equal(dernier("station.86")?.until, "2026-10-08T11:00:00.000Z");
  });

  test("connexion Max expirée : le ticket revient en attente, la station le signale et ne prend plus rien", async (t) => {
    const { gh, journal, etat, dernier, types } = cuisine(t, { scenario: "non-connecte", issues: [issue(14), issue(15)] });
    await jusqua(() => gh.commentaires.length === 1);
    await new Promise((resoudre) => setTimeout(resoudre, 80));

    assert.deepEqual([etat(14), etat(15)], ["waiting", "waiting"]);
    assert.equal(types().filter((type) => type === "cook.launched").length, 1);
    assert.deepEqual(dernier("station.disconnected", 14), { station: STATION, reason: "authentication_failed", run: dernier("cook.launched", 14)?.run });
    assert.deepEqual(dernier("ticket.released", 14), { reason: "disconnected", station: STATION });
    assert.equal(etatDesGardeFous(journal.base).failures, 0);
    assert.equal(gh.commentaires[0]?.[0], 14);
    assert.match(gh.commentaires[0]?.[1] ?? "", /connexion Max.*claude \/login.*reprendre/s);
  });

  test("après une connexion expirée, la station repart au « reprendre » du chef", async (t) => {
    const { repertoire, gh, etat } = cuisine(t, { scenario: "livre", suite: ["non-connecte"], issues: [issue(15)] });
    await jusqua(() => gh.commentaires.length === 1);

    chef(repertoire, "kitchen.resumed");

    await jusqua(() => etat(15) === "pass");
  });

  test("une machine sans session le dit dès le démarrage, sans lancer de cook", async (t) => {
    const { journal, etat, dernier, types, avertissements } = cuisine(t, { session: "absente", issues: [issue(15)] });
    await jusqua(() => etatStation(journal.base, STATION)?.disconnectedAt !== null);
    await new Promise((resoudre) => setTimeout(resoudre, 80));

    assert.deepEqual(dernier("station.disconnected"), { station: STATION, reason: "not-logged-in", run: null });
    assert.match(avertissements[0] ?? "", /connexion Max.*claude \/login/s);
    assert.equal(types().includes("cook.launched"), false);
    assert.equal(etat(15), "waiting");
  });

  test("un cook vivant qui ne touche à rien ne renouvelle pas son bail : à l'échéance il est arrêté, et son ticket revient en attente", async (t) => {
    const { gh, heure, journal, etat, dernier, lancements, types } = cuisine(t, { scenario: "bavard", seuilDisjoncteur: 1, issues: [issue(15)] });
    await jusqua(() => lancements().length === 1);

    heure.avancer(BAIL_MS - 1);
    await new Promise((resoudre) => setTimeout(resoudre, 80));
    assert.equal(types(15).includes("guard.tripped"), false);
    heure.avancer(1);

    await jusqua(() => gh.commentaires.length === 1);
    const run = dernier("cook.launched", 15)?.run;
    assert.equal(types(15).includes("ticket.renewed"), false);
    assert.deepEqual(dernier("guard.tripped", 15), { run, reason: "lease", limit: BAIL_MS, observed: BAIL_MS });
    assert.equal(dernier("cook.exited", 15)?.outcome, "guard");
    assert.deepEqual([dernier("cook.reported", 15)?.ending, dernier("cook.reported", 15)?.reason], ["failed", "guard:lease"]);
    assert.match(gh.commentaires[0]?.[1] ?? "", /échoué.*Aucun progrès dans son worktree depuis 10 min/s);
    // Le rail n'a pas rendu le ticket dans le dos de la station : c'est la fin
    // du cook qui le remet en attente, et elle compte au disjoncteur.
    assert.equal(types(15).includes("ticket.released"), false);
    assert.equal(etat(15), "waiting");
    assert.equal(etatDesGardeFous(journal.base).failures, 1);
  });

  test("un fichier touché dans le worktree renouvelle le bail, et l'échéance repart de là", async (t) => {
    const { heure, dernier, lancements, types } = cuisine(t, { scenario: "bavard", seuilDisjoncteur: 1, issues: [issue(15)] });
    await jusqua(() => lancements().length === 1);

    writeFileSync(join(lancements()[0]?.cwd ?? "", "brouillon.txt"), "pas encore commité\n");
    heure.avancer(BAIL_MS / 2);

    await jusqua(() => types(15).includes("ticket.renewed"));
    assert.deepEqual(dernier("ticket.renewed", 15), { station: STATION, leaseUntil: new Date(heure.maintenant().getTime() + BAIL_MS).toISOString() });
    // Passé l'échéance du premier bail, le cook tient toujours son ticket…
    heure.avancer(BAIL_MS - 1);
    await new Promise((resoudre) => setTimeout(resoudre, 80));
    assert.equal(types(15).includes("guard.tripped"), false);
    // … et le perd un bail entier après son dernier progrès.
    heure.avancer(1);
    await jusqua(() => dernier("guard.tripped", 15) !== undefined);
    assert.deepEqual([dernier("guard.tripped", 15)?.reason, dernier("guard.tripped", 15)?.observed], ["lease", BAIL_MS]);
    assert.equal(types(15).filter((type) => type === "ticket.renewed").length, 1);
  });

  test("un commit renouvelle le bail ; un fichier que le projet ignore, non", async (t) => {
    const { clone, heure, dernier, lancements, types } = cuisine(t, { git: true, scenario: "bavard", seuilDisjoncteur: 1, issues: [issue(15)] });
    await jusqua(() => lancements().length === 1);
    const worktree = lancements()[0]?.cwd ?? "";

    commiter(worktree);
    heure.avancer(BAIL_MS / 2);
    await jusqua(() => types(15).includes("ticket.renewed"));

    writeFileSync(join(clone, ".git/info/exclude"), "*.log\n");
    writeFileSync(join(worktree, "outil.log"), "une ligne de plus\n");
    heure.avancer(BAIL_MS);
    await jusqua(() => dernier("guard.tripped", 15) !== undefined);
    assert.equal(dernier("guard.tripped", 15)?.reason, "lease");
    assert.equal(types(15).filter((type) => type === "ticket.renewed").length, 1);
  });

  test("un cook qui a commité puis ne progresse plus : à l'échéance son travail est récolté et part en pass", async (t) => {
    const { gh, heure, journal, etat, dernier, lancements, types } = cuisine(t, { scenario: "commite-puis-bavarde", issues: [issue(15)] });
    await jusqua(() => lancements().length === 1 && existsSync(join(lancements()[0]?.cwd ?? "", "travail.txt")));

    heure.avancer(BAIL_MS / 2);
    await jusqua(() => types(15).includes("ticket.renewed"));
    heure.avancer(BAIL_MS);

    await jusqua(() => gh.commentaires.length === 1);
    assert.equal(etat(15), "pass");
    assert.equal(dernier("cook.exited", 15)?.outcome, "ok");
    assert.deepEqual([dernier("cook.reported", 15)?.ending, dernier("cook.reported", 15)?.reason], ["done", "harvested:guard:lease"]);
    assert.deepEqual(gh.prs.map((pr) => pr.branche), [dernier("cook.reported", 15)?.branch]);
    assert.match(gh.commentaires[0]?.[1] ?? "", /récolté.*Aucun progrès dans son worktree depuis 10 min/s);
    assert.equal(types(15).includes("ticket.released"), false);
    assert.equal(etatDesGardeFous(journal.base).failures, 0);
  });

  // Un dépôt dont la lecture du worktree tombe en panne quand le test le dit.
  const illisible = (etat: { panne: boolean }) => (depot: Depot): Depot => ({
    ...depot,
    empreinte(worktree) {
      if (etat.panne) throw new Error("git status : fatal: not a git repository");
      return depot.empreinte(worktree);
    },
  });

  test("une lecture ratée du worktree à l'échéance n'arrête pas le cook : la station relit au tick suivant, et son progrès compte", async (t) => {
    const etat = { panne: false };
    const { heure, lancements, types, avertissements } = cuisine(t, { scenario: "bavard", seuilDisjoncteur: 1, issues: [issue(15)], depot: illisible(etat) });
    await jusqua(() => lancements().length === 1);
    writeFileSync(join(lancements()[0]?.cwd ?? "", "brouillon.txt"), "pas encore commité\n");

    etat.panne = true;
    heure.avancer(BAIL_MS);
    await jusqua(() => avertissements.length > 0);
    assert.match(avertissements[0] ?? "", /worktree du ticket #15 illisible.*not a git repository/s);
    etat.panne = false;

    await jusqua(() => types(15).includes("ticket.renewed"));
    assert.equal(types(15).includes("guard.tripped"), false);
  });

  test("un worktree durablement illisible ne vaut pas progrès : passé un sursis, le bail tombe", async (t) => {
    const etat = { panne: false };
    const { heure, dernier, lancements, types, avertissements } = cuisine(t, { scenario: "bavard", seuilDisjoncteur: 1, issues: [issue(15)], depot: illisible(etat) });
    await jusqua(() => lancements().length === 1);

    etat.panne = true;
    heure.avancer(BAIL_MS + BAIL_MS / 10 - 1);
    await jusqua(() => avertissements.length >= 3);
    assert.equal(types(15).includes("guard.tripped"), false);
    heure.avancer(1);

    await jusqua(() => dernier("guard.tripped", 15) !== undefined);
    assert.deepEqual([dernier("guard.tripped", 15)?.reason, dernier("guard.tripped", 15)?.observed], ["lease", BAIL_MS + BAIL_MS / 10]);
  });

  test("un ticket retiré du rail pendant que son cook tourne : le cook est arrêté", async (t) => {
    const { gh, dernier, lancements, runtime } = cuisine(t, { scenario: "bavard", bailMs: 90, issues: [issue(15)] });
    await jusqua(() => lancements().length === 1);

    gh.poser(issue(15, ["model:sonnet", "effort:low"], { updatedAt: "2026-10-08T11:00:00Z" }));

    await jusqua(() => dernier("cook.exited", 15) !== undefined);
    assert.equal(dernier("cook.exited", 15)?.outcome, "stop");
    assert.deepEqual(runtime.rail.tickets(), []);
  });

  test("cuisine arrêtée : la station ne prend rien, et repart au « reprendre »", async (t) => {
    const premiere = cuisine(t);
    chef(premiere.repertoire, "kitchen.stopped");
    await jusqua(() => etatDesGardeFous(premiere.journal.base).stoppedAt !== null);
    premiere.gh.poser(issue(15));
    await jusqua(() => premiere.etat(15) === "waiting");
    await new Promise((resoudre) => setTimeout(resoudre, 80));
    assert.equal(premiere.etat(15), "waiting");

    chef(premiere.repertoire, "kitchen.resumed");

    await jusqua(() => premiere.etat(15) === "pass");
  });

  test("un « stop » pendant un cook rend le ticket au rail, sans commentaire ni reprise", async (t) => {
    const { repertoire, gh, etat, dernier, lancements, types } = cuisine(t, { scenario: "bavard", issues: [issue(15)] });
    await jusqua(() => lancements().length === 1);

    chef(repertoire, "kitchen.stopped");

    await jusqua(() => dernier("cook.exited", 15) !== undefined);
    await new Promise((resoudre) => setTimeout(resoudre, 80));
    assert.equal(etat(15), "waiting");
    assert.equal(types().filter((type) => type === "cook.launched").length, 1);
    assert.deepEqual(gh.commentaires, []);
  });

  test("un cook mort avec le runtime : au redémarrage son ticket est en attente, et un cook neuf le reprend", async (t) => {
    const premiere = cuisine(t, { scenario: "bavard", issues: [issue(15)] });
    await jusqua(() => premiere.lancements().length === 1);
    premiere.runtime.arreter("test");

    const seconde = cuisine(t, { scenario: "livre", lieux: premiere.lieux });

    await jusqua(() => seconde.etat(15) === "pass");
    assert.deepEqual(
      seconde.types(15).filter((type) => type.startsWith("cook.") && type !== "cook.progressed"),
      ["cook.launched", "cook.interrupted", "cook.launched", "cook.exited", "cook.reported"],
    );
  });

  test("un ticket resté pris par une vie précédente, sans cook, est rendu au démarrage", async (t) => {
    const premiere = cuisine(t, { session: "absente", issues: [issue(15)] });
    await jusqua(() => premiere.etat(15) === "waiting");
    premiere.runtime.rail.prendre(STATION);
    premiere.runtime.arreter("test");

    const seconde = cuisine(t, { session: "absente", lieux: premiere.lieux });

    assert.equal(seconde.etat(15), "waiting");
    assert.deepEqual(seconde.dernier("ticket.released", 15), { reason: "station-restarted", station: STATION });
  });

  test("un runtime mort entre l'envoi en pass et le compte-rendu : au redémarrage la station ouvre la PR, écrit le compte-rendu et le dit sur le ticket", async (t) => {
    const premiere = cuisine(t);
    const { github } = premiere.gh;
    const { ouvrirPR } = github;
    // GitHub ne répond pas : la station attend sa PR, le ticket déjà en pass.
    github.ouvrirPR = () => new Promise(() => {});
    premiere.gh.poser(issue(15));
    await jusqua(() => premiere.etat(15) === "pass");
    assert.equal(premiere.types(15).includes("cook.reported"), false);
    premiere.runtime.arreter("test");

    github.ouvrirPR = ouvrirPR;
    const { gh, etat, dernier, types, lancements, avertissements } = cuisine(t, { lieux: premiere.lieux });
    await jusqua(() => gh.commentaires.length === 1);

    const run = String(dernier("cook.launched", 15)?.run);
    assert.equal(etat(15), "pass");
    assert.deepEqual(dernier("cook.reported", 15), {
      run,
      ending: "done",
      reason: null,
      summary: "J'ai ajouté `travail.txt` et vérifié qu'il se lit.",
      branch: `cook/${run}`,
      pr: `https://github.com/${DEPOT}/pull/101`,
      reconciled: true,
    });
    assert.deepEqual(gh.prs.map((pr) => [pr.branche, pr.base, pr.titre]), [[`cook/${run}`, BASE, "#15 — Ticket 15"]]);
    assert.match(gh.prs[0]?.corps ?? "", /`sonnet` \/ `low`[\s\S]*J'ai ajouté `travail.txt`/);
    const [numero, corps] = gh.commentaires[0] ?? [0, ""];
    assert.equal(numero, 15);
    assert.match(corps, /reprise après un redémarrage/);
    assert.match(corps, new RegExp(`cook/${run}`));
    assert.match(corps, /pull\/101/);
    assert.match(corps, /J'ai ajouté `travail.txt` et vérifié qu'il se lit\./);
    assert.match(avertissements.join("\n"), /livraison du ticket #15 reprise/);
    // Aucun cook n'est relancé : le travail était livré.
    assert.equal(types(15).filter((type) => type === "cook.launched").length, 1);
    assert.equal(lancements().length, 1);
  });

  test("une PR ouverte juste avant la mort du runtime est retrouvée au redémarrage : jamais une seconde", async (t) => {
    const premiere = cuisine(t);
    const { github } = premiere.gh;
    const { ouvrirPR } = github;
    // La PR est créée, mais sa réponse n'arrive jamais.
    github.ouvrirPR = async (pr) => {
      await ouvrirPR(pr);
      return new Promise(() => {});
    };
    premiere.gh.poser(issue(15));
    await jusqua(() => premiere.gh.prs.length === 1);
    premiere.runtime.arreter("test");

    github.ouvrirPR = ouvrirPR;
    const { gh, dernier } = cuisine(t, { lieux: premiere.lieux });
    await jusqua(() => gh.commentaires.length === 1);

    assert.equal(gh.prs.length, 1);
    const rapport = dernier("cook.reported", 15);
    assert.deepEqual([rapport?.pr, rapport?.reconciled], [`https://github.com/${DEPOT}/pull/101`, true]);
  });

  test("GitHub injoignable au redémarrage : le compte-rendu repris s'écrit sans PR, et le commentaire le dit", async (t) => {
    const premiere = cuisine(t);
    premiere.gh.github.ouvrirPR = () => new Promise(() => {});
    premiere.gh.poser(issue(15));
    await jusqua(() => premiere.etat(15) === "pass");
    premiere.runtime.arreter("test");

    premiere.gh.pannes.lecture = true;
    const { gh, dernier, avertissements } = cuisine(t, { lieux: premiere.lieux });
    await jusqua(() => gh.commentaires.length === 1);

    const rapport = dernier("cook.reported", 15);
    assert.deepEqual([rapport?.ending, rapport?.pr, rapport?.reconciled], ["done", null, true]);
    assert.deepEqual(gh.prs, []);
    assert.match(gh.commentaires[0]?.[1] ?? "", /PR non ouverte.*HTTP 502/s);
    assert.match(avertissements.join("\n"), /PR non ouverte pour le ticket #15/);
  });

  test("une livraison déjà racontée n'est pas reprise au redémarrage", async (t) => {
    const premiere = cuisine(t, { issues: [issue(15)] });
    await jusqua(() => premiere.gh.commentaires.length === 1);
    premiere.runtime.arreter("test");

    const { gh, types, runtime } = cuisine(t, { session: "absente", lieux: premiere.lieux });
    await jusqua(() => runtime.journal.tout().some((e) => e.type === "runtime.ticked"));

    assert.equal(types(15).filter((type) => type === "cook.reported").length, 1);
    assert.equal(gh.commentaires.length, 1);
    assert.equal(gh.prs.length, 1);
  });

  test("un worktree impossible à préparer met le ticket 86 dix minutes, sans lancer de cook", async (t) => {
    const preparer = async () => {
      throw new Error("git fetch : fatal: unable to access origin");
    };
    const { etat, dernier, types, avertissements } = cuisine(t, { issues: [issue(15)], depot: (depot) => ({ ...depot, preparer }) });

    await jusqua(() => etat(15) === "86");

    assert.deepEqual(dernier("ticket.86", 15), { reason: "worktree-failed", until: "2026-10-08T10:10:00.000Z" });
    assert.equal(types().includes("cook.launched"), false);
    assert.match(avertissements[0] ?? "", /worktree.*#15.*git fetch/s);
  });

  test("le setup du projet passe avant le cook, avec le numéro du ticket, et le cook reçoit ce qu'il exporte", async (t) => {
    const { repertoire, setup, dernier, lancements, avertissements } = cuisine(t, { scenario: "bavard", setup: "exporte", issues: [issue(15)] });
    await jusqua(() => lancements().length === 1);

    const worktree = join(repertoire, String(dernier("cook.launched", 15)?.worktree));
    const [cook] = lancements();
    assert.deepEqual(setup.appels(), [`15 ${worktree}`]);
    assert.equal(cook?.env.BASE_DE_TEST, "base du ticket 15");
    // L'état que le setup attribue au worktree passe ; celui du runtime, jamais.
    assert.deepEqual(
      Object.entries(cook?.env ?? {}).filter(([nom]) => nom.startsWith("BRIGADE_")),
      [["BRIGADE_STATE_DIR", `${worktree}/.brigade-state`]],
    );
    assert.deepEqual(avertissements, []);
  });

  test("un setup qui exporte une clé ne détourne pas le cook de la connexion Max : aucun jeton ne lui parvient", async (t) => {
    const { lancements } = cuisine(t, { scenario: "bavard", setup: "jeton", issues: [issue(15)] });
    await jusqua(() => lancements().length === 1);

    const env = lancements()[0]?.env ?? {};
    assert.equal(env.BASE_DE_TEST, "base du ticket 15");
    assert.deepEqual(Object.keys(env).filter((nom) => VARIABLES_DE_JETON.includes(nom)), []);
  });

  test("un ticket qui quitte la station pendant son setup ne laisse pas de worktree : il est repris dans un neuf", async (t) => {
    const { repertoire, runtime, setup, dernier, lancements, types } = cuisine(t, { scenario: "bavard", setup: "attend", issues: [issue(15)] });
    await jusqua(() => setup.appels().length === 1);

    runtime.rail.rendre(15, "test");
    setup.liberer();
    await jusqua(() => lancements().length === 1);

    assert.equal(setup.appels().length, 2);
    assert.equal(types(15).filter((type) => type === "cook.launched").length, 1);
    assert.deepEqual(readdirSync(join(repertoire, "worktrees")), [String(dernier("cook.launched", 15)?.run)]);
  });

  test("le setup tient le ticket : son bail repart quand le cook est lancé", async (t) => {
    const { journal, lancements } = cuisine(t, { scenario: "bavard", setup: "exporte", issues: [issue(15)] });
    await jusqua(() => lancements().length === 1);

    const types = journal.duTicket(15).map((e) => e.type).filter((type) => type !== "cook.progressed");
    assert.deepEqual(types.slice(0, 4), ["ticket.arrived", "ticket.taken", "ticket.renewed", "cook.launched"]);
  });

  test("un setup en échec : aucun cook n'est lancé, le ticket est 86 dix minutes avec son motif, et rien n'est compté comme un échec de cook", async (t) => {
    const { repertoire, journal, etat, dernier, types, lancements, avertissements, gh } = cuisine(t, { setup: "echec", issues: [issue(15)] });

    await jusqua(() => etat(15) === "86");

    assert.deepEqual(dernier("ticket.86", 15), { reason: "setup-failed", until: "2026-10-08T10:10:00.000Z" });
    assert.equal(types().includes("cook.launched"), false);
    assert.deepEqual(lancements(), []);
    assert.equal(etatDesGardeFous(journal.base).failures, 0);
    assert.match(avertissements[0] ?? "", /setup.*#15.*code de sortie 1.*npm ci a échoué/s);
    assert.deepEqual(gh.commentaires, []);
    // Rien n'y a été cuisiné : le worktree ne reste pas.
    assert.deepEqual(readdirSync(join(repertoire, "worktrees")), []);
  });

  test("un setup réparé : le ticket revient en attente à l'heure dite, et son cook part", async (t) => {
    const { heure, setup, etat, lancements, journal } = cuisine(t, { scenario: "bavard", setup: "echec", issues: [issue(15)] });
    await jusqua(() => etat(15) === "86");

    setup.regler("exporte");
    heure.avancer(600_000);
    await jusqua(() => lancements().length === 1);

    assert.equal(journal.duTicket(15).find((e) => e.type === "ticket.released")?.payload.reason, "86-over");
    assert.equal(setup.appels().length, 2);
  });

  test("un setup qui dépasse la moitié du bail est arrêté, et c'est un échec de setup", async (t) => {
    const { etat, dernier, lancements, avertissements } = cuisine(t, { setup: "lent", bailMs: 400, issues: [issue(15)] });
    const debut = Date.now();

    await jusqua(() => etat(15) === "86");

    assert.equal(dernier("ticket.86", 15)?.reason, "setup-failed");
    assert.deepEqual(lancements(), []);
    assert.match(avertissements[0] ?? "", /plafond de 0,2 s dépassé/);
    // Le setup dort trente secondes : il n'a pas été attendu.
    assert.ok(Date.now() - debut < 20_000);
  });

  test("le runtime qui s'arrête abandonne le setup en cours, sans rien écrire sur le ticket", async (t) => {
    const { repertoire, runtime, setup, lancements, avertissements } = cuisine(t, { setup: "lent", issues: [issue(15)] });
    await jusqua(() => setup.appels().length === 1);

    runtime.arreter("test");
    await new Promise((resoudre) => setTimeout(resoudre, 80));

    const journal = ouvrirJournal(repertoire);
    t.after(() => journal.fermer());
    assert.equal(journal.duTicket(15).at(-1)?.type, "ticket.taken");
    assert.deepEqual(lancements(), []);
    assert.deepEqual(avertissements, []);
  });

  test("un ticket renvoyé par la pass repasse par le setup : le cook de renvoi reçoit lui aussi ce qu'il exporte", async (t) => {
    const { gates, lancements } = cuisine(t, { pass: true, setup: "exporte", issues: [issue(17)] });
    gates.regler("rouge");
    await jusqua(() => lancements().length === 2);

    const [cook, repris] = lancements();
    assert.equal(repris?.cwd, cook?.cwd);
    assert.equal(repris?.env.BASE_DE_TEST, "base du ticket 17");
  });

  test("un setup en échec sur un renvoi laisse le worktree : il porte la livraison refusée", async (t) => {
    const { gates, setup, etat, lancements, dernier } = cuisine(t, { pass: true, setup: "exporte", issues: [issue(17)] });
    gates.regler("rouge");
    // Le setup casse une fois le premier cook parti : la pass le voit d'abord.
    await jusqua(() => lancements().length === 1);
    setup.regler("echec");

    await jusqua(() => etat(17) === "86");

    assert.equal(dernier("ticket.86", 17)?.reason, "setup-failed");
    assert.equal(lancements().length, 1);
    assert.equal(existsSync(join(lancements()[0]?.cwd ?? "", "travail.txt")), true);
  });

  test("une PR qui ne s'ouvre pas n'annule pas la livraison : le ticket part en pass, et le commentaire le dit", async (t) => {
    const { gh, etat, dernier, avertissements } = cuisine(t);
    gh.pannes.pr = true;
    gh.poser(issue(15));

    await jusqua(() => gh.commentaires.length === 1);

    assert.equal(etat(15), "pass");
    assert.equal(dernier("cook.reported", 15)?.pr, null);
    assert.match(gh.commentaires[0]?.[1] ?? "", /PR non ouverte.*HTTP 422/s);
    assert.equal(avertissements.length, 1);
  });

  test("un commentaire qui ne part pas n'empêche pas le ticket d'avancer", async (t) => {
    const { gh, etat, dernier, avertissements } = cuisine(t);
    gh.pannes.commentaire = true;
    gh.poser(issue(15));

    await jusqua(() => dernier("cook.reported", 15) !== undefined && avertissements.length === 1);

    assert.equal(etat(15), "pass");
    assert.match(avertissements[0] ?? "", /commentaire.*#15.*HTTP 502/s);
  });
});
