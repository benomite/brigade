// La station `box/claude` branchée sur un runtime complet : rail, garde-fous,
// un vrai dépôt git local, un faux `claude` et un GitHub de test.
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { VARIABLES_DE_JETON } from "../src/claude.ts";
import type { Depot } from "../src/depot.ts";
import type { GitHub } from "../src/github.ts";
import { MARQUEUR, porteFiche } from "../src/fiche.ts";
import { ouvrirJournal } from "../src/journal.ts";
import type { Machine } from "../src/machine.ts";
import { cooksEnCours, etatDesGardeFous } from "../src/projections/garde-fous.ts";
import { worktreesGardes } from "../src/projections/nettoyage.ts";
import { ticketDuRail } from "../src/projections/rail.ts";
import { etatStation } from "../src/projections/stations.ts";
import { COOKS_PAR_DEFAUT, configStation, STATION } from "../src/station.ts";
import { BAIL_MS, CALIBRE, chef, controlerBase, cuisine, issue, MACHINE_CALME, PLAFONDS, plafonner } from "./aides/cuisine.ts";
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
      deliverable: null,
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
    assert.deepEqual(types(15).filter((type) => type !== "worktree.removed").slice(-3), ["ticket.passing", "cook.out-of-zone", "cook.reported"]);
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

  test("à un plafond d'un, la station ne fait tourner qu'un cook à la fois, même si le rail est plein", async (t) => {
    const { runtime, repertoire, journal, etat, lancements, types } = cuisine(t, { scenario: "bavard", issues: [issue(14), issue(15), issue(16)] });
    await jusqua(() => lancements().length === 1);
    await new Promise((resoudre) => setTimeout(resoudre, 80));

    assert.deepEqual([etat(14), etat(15), etat(16)], ["taken", "waiting", "waiting"]);
    assert.equal(types().filter((type) => type === "cook.launched").length, 1);
    // Ceux qui attendent ne sont pas un mystère : la station dit ce qui la retient, une fois.
    assert.deepEqual(journal.tout().filter((e) => e.type === "station.held").map((e) => e.payload), [{ station: STATION, reason: "cap" }]);
    assert.equal(etatStation(journal.base, STATION)?.heldReason, "cap");

    // Arrêtée, la station ne retient plus personne : `status` n'en garde rien.
    runtime.arreter("test");
    const relu = ouvrirJournal(repertoire, { lectureSeule: true });
    t.after(() => relu.fermer());
    assert.equal(etatStation(relu.base, STATION)?.heldReason, null);
    assert.equal(relu.tout().filter((e) => e.type.startsWith("station.")).at(-1)?.type, "station.released");
  });

  test("tant que le chef n'a rien réglé, le plafond annoncé est haut : c'est la machine qui borne", () => {
    assert.equal(COOKS_PAR_DEFAUT, 30);
  });

  test("avec un plafond à trois, trois cooks tournent en même temps, chacun sur son ticket, son worktree et sa branche — jamais quatre", async (t) => {
    const { journal, etat, lancements } = cuisine(t, { cooks: 3, scenario: "muet", issues: [issue(14), issue(15), issue(16), issue(17)] });
    await jusqua(() => lancements().length === 3);
    await new Promise((resoudre) => setTimeout(resoudre, 80));

    assert.deepEqual([etat(14), etat(15), etat(16), etat(17)], ["taken", "taken", "taken", "waiting"]);
    const lances = journal.tout().filter((e) => e.type === "cook.launched");
    assert.deepEqual(lances.map((e) => e.ticket).sort(), [14, 15, 16]);
    for (const { ticket, payload } of lances) {
      assert.match(String(payload.run), new RegExp(`^${ticket}-`));
      assert.deepEqual([payload.branch, payload.worktree], [`cook/${payload.run}`, join("worktrees", String(payload.run))]);
    }
    assert.equal(new Set(lancements().map((lance) => lance.cwd)).size, 3);
    assert.equal(cooksEnCours(journal.base).length, 3);
  });

  test("le chef baisse le plafond pendant que des cooks tournent : aucun n'est arrêté, et la station n'en lance plus avant d'être revenue dessous ; zéro lève la limite", async (t) => {
    const attend = "commite-puis-attend";
    const { repertoire, etat, types, lancements, conclure } = cuisine(t, {
      cooks: 3,
      scenario: "muet",
      suite: [attend, attend, attend],
      issues: [14, 15, 16, 17, 18].map((numero) => issue(numero)),
    });
    await jusqua(() => lancements().length === 3);

    plafonner(repertoire, 1);
    await jusqua(() => types().includes("station.capped"));
    await new Promise((resoudre) => setTimeout(resoudre, 80));
    assert.deepEqual([types().includes("cook.exited"), types().includes("guard.tripped")], [false, false]);

    // Les trois finissent : la station repasse sous le plafond, et n'en lance qu'un.
    conclure();
    await jusqua(() => lancements().length === 4);
    await new Promise((resoudre) => setTimeout(resoudre, 80));
    assert.deepEqual([14, 15, 16, 17, 18].map(etat), ["pass", "pass", "pass", "taken", "waiting"]);
    assert.equal(lancements().length, 4);

    plafonner(repertoire, 0);
    await jusqua(() => lancements().length === 5);
    assert.equal(etat(18), "taken");
  });

  test("deux tickets dont les zones se recouvrent ne partent jamais ensemble, même sous le plafond : le second attend, et le rail dit qui tient sa zone", async (t) => {
    const { gh, journal, etat, lancements } = cuisine(t, { cooks: 3, scenario: "muet" });
    gh.ficher(14, "2026-10-08T09:00:00Z", `${MARQUEUR}\n- zone : runtime/src`);
    gh.ficher(15, "2026-10-08T09:00:00Z", `${MARQUEUR}\n- zone : runtime/src/rail.ts`);
    gh.ficher(16, "2026-10-08T09:00:00Z", `${MARQUEUR}\n- zone : docs/`);
    for (const numero of [14, 15, 16]) gh.poser(issue(numero));
    await jusqua(() => lancements().length === 2);
    await new Promise((resoudre) => setTimeout(resoudre, 80));

    assert.deepEqual([etat(14), etat(15), etat(16)], ["taken", "waiting", "taken"]);
    assert.deepEqual(ticketDuRail(journal.base, 15)?.held, [{ ticket: 14, path: "runtime/src/rail.ts" }]);
    assert.equal(lancements().length, 2);
  });

  test("un cook qui meurt et un cook qui dépasse un plafond n'emportent pas les autres : leurs tickets repartent, les autres continuent", async (t) => {
    const { journal, etat, lancements } = cuisine(t, {
      cooks: 4,
      scenario: "muet",
      suite: ["echec", "bavard"],
      plafonds: { turns: 5 },
      issues: [14, 15, 16, 17].map((numero) => issue(numero)),
    });
    // Quatre cooks, puis un neuf pour chacun des deux tickets rendus.
    await jusqua(() => lancements().length === 6);

    const fins = journal.tout().filter((e) => e.type === "cook.exited");
    assert.deepEqual(fins.map((e) => e.payload.outcome).sort(), ["failed", "guard"]);
    const rendus = fins.map((e) => e.ticket);
    assert.equal(new Set(rendus).size, 2);
    assert.deepEqual([14, 15, 16, 17].map(etat), ["taken", "taken", "taken", "taken"]);
    // Les deux autres n'ont eu qu'un cook, et il tourne encore.
    const enCours = cooksEnCours(journal.base);
    assert.equal(enCours.length, 4);
    for (const numero of [14, 15, 16, 17].filter((ticket) => !rendus.includes(ticket))) {
      assert.equal(journal.duTicket(numero).filter((e) => e.type === "cook.launched").length, 1);
      assert.equal(journal.duTicket(numero).some((e) => e.type === "guard.tripped" || e.type === "cook.exited"), false);
    }
  });

  test("un cook qui perd son bail n'emporte pas son voisin : chacun a son regard, et seul celui qui ne progresse pas est arrêté", async (t) => {
    const { repertoire, heure, journal, dernier, types, lancements } = cuisine(t, { cooks: 2, scenario: "muet", issues: [issue(14), issue(15)] });
    await jusqua(() => lancements().length === 2);

    heure.avancer(BAIL_MS - 1);
    writeFileSync(join(repertoire, String(dernier("cook.launched", 15)?.worktree), "note.txt"), "le cook avance\n");
    await jusqua(() => types(15).includes("ticket.renewed"));
    heure.avancer(1);

    await jusqua(() => types(14).filter((type) => type === "cook.launched").length === 2);
    assert.equal(dernier("guard.tripped", 14)?.reason, "lease");
    assert.equal(types(15).some((type) => type === "guard.tripped" || type === "cook.exited"), false);
    assert.equal(cooksEnCours(journal.base).some((cook) => cook.run === dernier("cook.launched", 15)?.run), true);
  });

  test("un ticket rendu au rail pendant que son cook tourne n'est repris qu'une fois ce cook arrêté : jamais deux cooks sur un ticket", async (t) => {
    const { runtime, journal, lancements } = cuisine(t, { cooks: 3, scenario: "muet", issues: [issue(15)] });
    await jusqua(() => lancements().length === 1);

    runtime.rail.rendre(15, "test");
    await jusqua(() => lancements().length === 2);

    const vie = journal.duTicket(15).map((e) => e.type).filter((type) => type === "cook.launched" || type === "cook.exited");
    assert.deepEqual(vie, ["cook.launched", "cook.exited", "cook.launched"]);
    assert.equal(cooksEnCours(journal.base).length, 1);
  });

  test("un jugement du manager ou une relecture en cours ne retient pas la prise : le plafond ne compte que les cooks de tickets", async (t) => {
    const { journal, etat, lancements } = cuisine(t, { scenario: "muet", issues: [issue(15)] });
    journal.ajouter({
      project: "brigade",
      ticket: null,
      author: "runtime",
      type: "cook.launched",
      payload: { run: "juge-9-aaaaaaaa", limits: PLAFONDS, stream: "runs/juge-9-aaaaaaaa.jsonl", station: "manager", model: "sonnet", effort: "medium" },
    });

    await jusqua(() => lancements().length === 1);

    assert.equal(etat(15), "taken");
    assert.equal(cooksEnCours(journal.base).length, 2);
  });

  test("au plus deux tickets en entrée à la fois : le setup des suivants attend que les premiers soient partis", async (t) => {
    const { journal, setup, etat, dernier, lancements } = cuisine(t, { cooks: 10, entrees: 2, setup: "attend", scenario: "muet", issues: [14, 15, 16, 17].map((numero) => issue(numero)) });
    await jusqua(() => setup.appels().length === 2);
    await new Promise((resoudre) => setTimeout(resoudre, 80));

    assert.equal(setup.appels().length, 2);
    assert.deepEqual([14, 15, 16, 17].map(etat), ["taken", "taken", "waiting", "waiting"]);
    assert.deepEqual(dernier("station.held"), { station: STATION, reason: "setups" });

    setup.liberer();
    await jusqua(() => lancements().length === 4);
    assert.deepEqual([14, 15, 16, 17].map(etat), ["taken", "taken", "taken", "taken"]);
    // Plus aucun ticket n'attend : la station ne retient plus personne, et le dit.
    await jusqua(() => etatStation(journal.base, STATION)?.heldReason === null);
  });

  test("une machine qui n'en peut plus : la station ne prend plus rien et le dit une fois, sans toucher aux cooks en cours ; elle reprend quand la machine respire", async (t) => {
    let machine: Machine = { ...MACHINE_CALME, charge: 16.2 };
    const { gh, journal, etat, dernier, types, lancements, avertissements } = cuisine(t, { cooks: 3, scenario: "muet", machine: () => machine, issues: [issue(15)] });
    await jusqua(() => types().includes("station.saturated"));
    await new Promise((resoudre) => setTimeout(resoudre, 80));

    assert.deepEqual([etat(15), lancements().length], ["waiting", 0]);
    assert.deepEqual(dernier("station.saturated"), { station: STATION, resource: "cpu", observed: 16.2, limit: 12 });
    assert.equal(types().filter((type) => type === "station.saturated").length, 1);
    assert.deepEqual(avertissements.map((ligne) => ligne.replace(/^brigade : /, "")), [
      `la station ${STATION} ne prend plus de ticket, la machine n'en peut plus — charge de 16,2 pour 12 au plus`,
    ]);
    assert.equal(etatStation(journal.base, STATION)?.saturatedResource, "cpu");
    assert.deepEqual(dernier("station.held"), { station: STATION, reason: "machine" });

    machine = MACHINE_CALME;
    await jusqua(() => lancements().length === 1);
    assert.deepEqual([types().includes("station.relieved"), etatStation(journal.base, STATION)?.saturatedAt], [true, null]);

    // Le disque se remplit pendant qu'un cook tourne : lui continue, le suivant attend.
    machine = { ...MACHINE_CALME, disqueLibre: 1024 ** 3 };
    gh.poser(issue(16));
    await jusqua(() => dernier("station.saturated")?.resource === "disk");
    await new Promise((resoudre) => setTimeout(resoudre, 80));
    assert.deepEqual([etat(15), etat(16), lancements().length], ["taken", "waiting", 1]);
    assert.equal(types(15).some((type) => type === "guard.tripped" || type === "cook.exited"), false);
  });

  test("une base d'intégration rouge : la station ne lance plus aucun cook et le dit, sans toucher à ceux qui tournent ; elle repart seule au vert", async (t) => {
    const { repertoire, gh, journal, etat, dernier, types, lancements } = cuisine(t, { cooks: 3, scenario: "muet", issues: [issue(15)] });
    await jusqua(() => lancements().length === 1);

    controlerBase(repertoire, "red");
    gh.poser(issue(16));
    await jusqua(() => dernier("station.held") !== undefined);
    await new Promise((resoudre) => setTimeout(resoudre, 80));

    assert.deepEqual([etat(15), etat(16), lancements().length], ["taken", "waiting", 1]);
    assert.deepEqual(journal.tout().filter((e) => e.type === "station.held").map((e) => e.payload), [{ station: STATION, reason: "base" }]);
    assert.equal(etatStation(journal.base, STATION)?.heldReason, "base");
    // Le cook parti avant le rouge continue : la retenue n'arrête personne.
    assert.equal(types(15).some((type) => type === "guard.tripped" || type === "cook.exited"), false);

    // Encore rouge sur un autre commit : rien ne part, et rien n'est redit.
    controlerBase(repertoire, "red", "ba5e0002ffff");
    await new Promise((resoudre) => setTimeout(resoudre, 80));
    assert.deepEqual([etat(16), types().filter((type) => type === "station.held").length], ["waiting", 1]);

    controlerBase(repertoire, "green", "ba5e0003ffff");
    await jusqua(() => lancements().length === 2);
    assert.equal(etat(16), "taken");
    await jusqua(() => etatStation(journal.base, STATION)?.heldReason === null);
  });

  test("des gates de base qui n'ont pas pu se jouer ne sont pas un rouge : la station sert", async (t) => {
    const { repertoire, gh, etat, types, lancements } = cuisine(t, { cooks: 3, scenario: "muet" });
    controlerBase(repertoire, "skipped");
    gh.poser(issue(15));
    await jusqua(() => lancements().length === 1);

    assert.deepEqual([etat(15), types().includes("station.held")], ["taken", false]);
  });

  test("le « stop » du chef et le disjoncteur passent avant la base rouge : c'est eux que la station nomme", async (t) => {
    const { repertoire, gh, dernier } = cuisine(t, { cooks: 3, scenario: "muet" });
    controlerBase(repertoire, "red");
    chef(repertoire, "kitchen.stopped");
    gh.poser(issue(15));
    await jusqua(() => dernier("station.held") !== undefined);

    assert.deepEqual(dernier("station.held"), { station: STATION, reason: "stopped" });
    chef(repertoire, "kitchen.resumed");
    await jusqua(() => dernier("station.held")?.reason === "base");
  });

  test("un rail de trente tickets ne part pas d'un bloc : la station compte d'avance les cooks qu'elle vient de lancer, et monte par paliers d'une minute", async (t) => {
    // Deux cœurs : trois de charge au plus. La machine, elle, ne voit rien venir.
    const calme: Machine = { ...MACHINE_CALME, coeurs: 2 };
    const numeros = Array.from({ length: 30 }, (_, i) => 101 + i);
    const { journal, heure, etat, types, lancements } = cuisine(t, { cooks: 30, entrees: 30, scenario: "muet", machine: () => calme, issues: numeros.map((numero) => issue(numero)) });
    await jusqua(() => lancements().length === 4);
    await new Promise((resoudre) => setTimeout(resoudre, 80));

    assert.equal(numeros.filter((numero) => etat(numero) === "taken").length, 4);
    assert.equal(lancements().length, 4);
    // Ce n'est pas une saturation : la machine respire, la station attend de le voir.
    assert.equal(types().includes("station.saturated"), false);
    // Mais les vingt-six qui attendent ne sont pas un mystère : elle le dit, une fois.
    assert.deepEqual(journal.tout().filter((e) => e.type === "station.held").map((e) => e.payload), [{ station: STATION, reason: "ramp" }]);

    heure.avancer(59_999);
    await new Promise((resoudre) => setTimeout(resoudre, 80));
    assert.equal(lancements().length, 4);
    heure.avancer(1);
    await jusqua(() => lancements().length === 8);
    await new Promise((resoudre) => setTimeout(resoudre, 80));
    assert.equal(numeros.filter((numero) => etat(numero) === "taken").length, 8);
  });

  test("la machine se lit même quand une autre borne retient la station : au plafond, une saturation se dit et se lève", async (t) => {
    let machine: Machine = MACHINE_CALME;
    const { repertoire, journal, types, lancements } = cuisine(t, { cooks: 2, scenario: "muet", machine: () => machine, issues: [issue(14), issue(15), issue(16)] });
    await jusqua(() => lancements().length === 2);

    // Au plafond, et la machine sature : c'est dit quand même.
    machine = { ...MACHINE_CALME, memoireDisponible: 0 };
    await jusqua(() => types().includes("station.saturated"));
    // Le chef baisse le plafond sous ce que la station tient, puis la machine respire.
    plafonner(repertoire, 1);
    await jusqua(() => types().includes("station.capped"));
    machine = MACHINE_CALME;
    await jusqua(() => types().includes("station.relieved"));

    assert.equal(etatStation(journal.base, STATION)?.saturatedAt, null);
    assert.equal(lancements().length, 2);
  });

  test("une machine devenue illisible pendant une saturation ne passe pas pour une machine qui respire : rien n'est levé, rien n'est pris", async (t) => {
    let lire = (): Machine => ({ ...MACHINE_CALME, charge: 16.2 });
    const { journal, etat, types, lancements, avertissements } = cuisine(t, { scenario: "muet", machine: () => lire(), issues: [issue(15)] });
    await jusqua(() => types().includes("station.saturated"));

    lire = () => {
      throw new Error("statfs : ENOENT");
    };
    await jusqua(() => avertissements.some((ligne) => /machine illisible/.test(ligne)));
    await new Promise((resoudre) => setTimeout(resoudre, 80));

    assert.equal(types().includes("station.relieved"), false);
    assert.equal(etatStation(journal.base, STATION)?.saturatedResource, "cpu");
    assert.deepEqual([etat(15), lancements().length], ["waiting", 0]);
  });

  test("un ticket rendu pendant que son cook tourne ne fait pas une place : à un plafond d'un, jamais deux cooks vivants", async (t) => {
    const { runtime, journal, lancements } = cuisine(t, { scenario: "muet", issues: [issue(14), issue(15)] });
    await jusqua(() => lancements().length === 1);

    runtime.rail.rendre(14, "test");
    await jusqua(() => lancements().length === 2);

    let vivants = 0;
    let plusHaut = 0;
    for (const { type } of journal.tout()) {
      if (type === "cook.launched") plusHaut = Math.max(plusHaut, ++vivants);
      if (type === "cook.exited") vivants--;
    }
    assert.equal(plusHaut, 1);
  });

  test("un ticket rendu pendant que son cook tourne tient encore sa zone : un ticket qui la recouvre ne part pas tant que ce cook écrit", async (t) => {
    const { gh, runtime, journal, types, lancements } = cuisine(t, { cooks: 3, scenario: "muet" });
    gh.ficher(14, "2026-10-08T09:00:00Z", `${MARQUEUR}\n- zone : runtime/src`);
    gh.ficher(15, "2026-10-08T09:00:00Z", `${MARQUEUR}\n- zone : runtime/src/rail.ts`);
    gh.poser(issue(14));
    gh.poser(issue(15));
    await jusqua(() => lancements().length === 1);

    runtime.rail.rendre(14, "test");
    // Le cook de 14 arrêté, 14 repart — et tient à nouveau sa zone.
    await jusqua(() => lancements().length === 2);

    assert.equal(types(15).includes("ticket.taken"), false);
    assert.deepEqual(journal.tout().filter((e) => e.type === "cook.launched").map((e) => e.ticket), [14, 14]);
  });

  test("une machine illisible ne retient rien : la station le dit une fois et sert", async (t) => {
    const { lancements, avertissements } = cuisine(t, {
      scenario: "muet",
      machine: () => {
        throw new Error("statfs : ENOENT");
      },
      issues: [issue(15)],
    });
    await jusqua(() => lancements().length === 1);
    await new Promise((resoudre) => setTimeout(resoudre, 80));

    assert.deepEqual(avertissements, ["brigade : machine illisible, la station s'en tient à ce qu'elle savait — statfs : ENOENT"]);
  });

  test("quatre cooks partent de front d'un même clone : quatre worktrees, quatre branches poussées, quatre PR", async (t) => {
    const numeros = [14, 15, 16, 17];
    const { origine, gh, etat, dernier, avertissements } = cuisine(t, { git: true, cooks: 4, issues: numeros.map((numero) => issue(numero)) });
    await jusqua(() => gh.commentaires.length === 4);

    assert.deepEqual(numeros.map(etat), ["pass", "pass", "pass", "pass"]);
    const branches = numeros.map((numero) => `cook/${dernier("cook.launched", numero)?.run}`);
    for (const branche of branches) assert.equal(git(origine, "show", `${branche}:travail.txt`), "le travail du cook");
    assert.deepEqual(gh.prs.map((pr) => pr.branche).sort(), [...branches].sort());
    assert.deepEqual(avertissements, []);
  });

  test("les bornes de l'entrée et de la machine se règlent par l'environnement ; une valeur illisible est un refus de démarrer", () => {
    const env = { BRIGADE_REPO_DIR: "/clone", BRIGADE_BASE_BRANCH: "v2" };
    const { entreesMax, seuils } = configStation(env);
    assert.deepEqual([entreesMax, seuils], [4, { chargeParCoeur: 1.5, memoireMinMo: 1024, disqueMinMo: 5120 }]);
    assert.equal(configStation({ ...env, BRIGADE_MAX_SETUPS: "8" }).entreesMax, 8);
    assert.throws(() => configStation({ ...env, BRIGADE_MAX_SETUPS: "0" }), /BRIGADE_MAX_SETUPS invalide/);
    assert.throws(() => configStation({ ...env, BRIGADE_MAX_LOAD_PER_CORE: "zéro" }), /BRIGADE_MAX_LOAD_PER_CORE invalide/);
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

  test("un cook que le modèle refuse n'a pas échoué : le ticket repart, le chef le lit sur l'issue, et le disjoncteur n'en sait rien", async (t) => {
    const { gh, journal, etat, dernier, types } = cuisine(t, { scenario: "livre", suite: ["refuse", "refuse"], seuilDisjoncteur: 1, issues: [issue(15)] });
    await jusqua(() => etat(15) === "pass");

    const fins = journal.duTicket(15).flatMap((e) => (e.type === "cook.exited" ? [e.payload.outcome] : []));
    const rapports = journal.duTicket(15).flatMap((e) => (e.type === "cook.reported" ? [[e.payload.ending, e.payload.reason]] : []));
    assert.deepEqual(fins, ["refused", "refused", "ok"]);
    assert.deepEqual(rapports.slice(0, 2), [["refused", "refus du modèle (reasoning_extraction)"], ["refused", "refus du modèle (reasoning_extraction)"]]);
    assert.deepEqual(dernier("ticket.released", 15), { reason: "refused", station: STATION });
    assert.deepEqual([etatDesGardeFous(journal.base).failures, types().includes("breaker.opened")], [0, false]);
    assert.match(gh.commentaires[0]?.[1] ?? "", /refusé par le modèle, essai 1\/3[\s\S]*refus du modèle \(reasoning_extraction\) — `stop_reason: refusal`[\s\S]*ni une panne ni un échec[\s\S]*revenu en attente/);
    assert.match(gh.commentaires[1]?.[1] ?? "", /essai 2\/3/);
  });

  test("un ticket que le modèle refuse trois fois d'affilée n'est pas relancé sans fin : il remonte au chef, 86, avec le motif", async (t) => {
    const { gh, journal, etat, dernier, types, avertissements } = cuisine(t, { scenario: "refuse", seuilDisjoncteur: 1, issues: [issue(15)] });
    await jusqua(() => etat(15) === "86" && gh.commentaires.length === 3);
    await new Promise((resoudre) => setTimeout(resoudre, 80));

    assert.equal(types(15).filter((type) => type === "cook.launched").length, 3);
    assert.deepEqual(dernier("ticket.86", 15), { reason: "refused", until: null });
    assert.deepEqual([etatDesGardeFous(journal.base).failures, types().includes("breaker.opened")], [0, false]);
    assert.match(gh.commentaires[2]?.[1] ?? "", /essai 3\/3[\s\S]*\*\*Remonté au chef\.\*\* 3 refus d'affilée : le ticket est 86/);
    assert.match(avertissements.join("\n"), /le modèle a refusé 3 fois d'affilée le ticket #15 — remonté au chef/);
  });

  test("un cook refusé dont le ticket a quitté la station pendant la cuisson : le commentaire ne prétend ni l'avoir rendu ni l'avoir remonté", async (t) => {
    // Le ticket part entre la mort du cook et le regard suivant de la station :
    // au moment où elle lit son worktree pour juger sa fin.
    const partir: { geste?: () => void } = {};
    const { gh, runtime, etat, dernier } = cuisine(t, {
      scenario: "refuse",
      issues: [issue(15)],
      depot: (depot) => ({ ...depot, commits: (worktree) => (partir.geste?.(), depot.commits(worktree)) }),
    });
    partir.geste = () => runtime.rail.quatreVingtSix(15, { motif: "ailleurs" });
    await jusqua(() => gh.commentaires.length === 1);

    assert.deepEqual([etat(15), dernier("ticket.86", 15)?.reason, dernier("ticket.released", 15)], ["86", "ailleurs", undefined]);
    assert.equal(dernier("cook.reported", 15)?.ending, "refused");
    assert.match(gh.commentaires[0]?.[1] ?? "", /refusé par le modèle, essai 1\/3[\s\S]*ne tenait plus ce ticket/);
    assert.doesNotMatch(gh.commentaires[0]?.[1] ?? "", /revenu en attente|Remonté au chef/);
  });

  test("un cook qui a commité avant le refus du modèle a livré : son travail est récolté", async (t) => {
    const { gh, journal, etat, dernier } = cuisine(t, { scenario: "commite-puis-refuse", issues: [issue(15)] });
    await jusqua(() => etat(15) === "pass" && gh.commentaires.length === 1);

    assert.deepEqual([dernier("cook.reported", 15)?.ending, dernier("cook.reported", 15)?.reason], ["done", "harvested:refus du modèle (reasoning_extraction)"]);
    assert.equal(journal.duTicket(15).find((e) => e.type === "cook.exited")?.payload.outcome, "ok");
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
    // Le livrable est ce que le cook a délimité ; son message entier reste au journal.
    assert.equal(rapport?.deliverable, "Audit : la CI passe douze minutes dans l'installation des dépendances, faute de cache.");
    assert.match(String(rapport?.summary), /^J'ai lu le workflow[\s\S]*<livrable>[\s\S]*Vérifié sur les runs 41 à 43\.$/);
    assert.equal(etat(15), "pass");
    assert.deepEqual([pousses, gh.prs], [[], []]);
    // Sur le ticket : le livrable en clair, et ce qui l'entoure replié.
    assert.match(
      gh.commentaires[0]?.[1] ?? "",
      /fini, sans diff\*\*[^\n]*\nAucun commit : le livrable de ce ticket est ce que le cook a délimité, ci-dessous\.[^\n]*reviewer le relit[^\n]*\n\nAudit : la CI passe douze minutes[^\n]*\n\n<details>\n<summary>Le reste du message du cook<\/summary>\n\nJ'ai lu le workflow et trois runs\.\n\nVérifié sur les runs 41 à 43\.\n\n<\/details>$/,
    );
    assert.equal(etatDesGardeFous(journal.base).failures, 0);
  });

  test("un cook qui conclut sans commit et sans rien délimiter n'a pas livré : c'est un échec, pas un ticket sans diff dont le message serait le livrable", async (t) => {
    const { gh, etat, dernier, journal } = cuisine(t, { scenario: "bavard", suite: ["rapporte-sans-delimiter"], issues: [issue(15)] });
    await jusqua(() => gh.commentaires.length === 1);

    assert.equal(journal.duTicket(15).find((e) => e.type === "cook.exited")?.payload.outcome, "failed");
    const rapport = dernier("cook.reported", 15);
    assert.deepEqual([rapport?.ending, rapport?.reason, rapport?.deliverable], ["failed", "no-deliverable", null]);
    assert.match(String(rapport?.summary), /^Brouillon :/);
    assert.notEqual(etat(15), "pass");
    assert.equal(dernier("ticket.passing", 15), undefined);
    assert.equal(etatDesGardeFous(journal.base).failures, 1);
    // Le chef lit pourquoi, et le message du cook n'est pas présenté comme un livrable.
    assert.match(
      gh.commentaires[0]?.[1] ?? "",
      /échoué \(no-deliverable\)\*\*[^\n]*\nAucun commit, et rien n'est délimité entre `<livrable>` et `<\/livrable>` dans le dernier message du cook : il n'a pas de livrable\.[^\n]*\n[^\n]*revenu en attente[^\n]*\n\n<details>\n<summary>Le message du cook, sans livrable<\/summary>\n\nBrouillon :[\s\S]*<\/details>$/,
    );
  });

  test("un cook qui a commité et délimité son compte-rendu : seul ce qu'il a délimité est publié en clair, sur le ticket comme dans la PR", async (t) => {
    const { gh, dernier } = cuisine(t, { scenario: "bavard", suite: ["livre-et-delimite"], issues: [issue(15)] });
    await jusqua(() => gh.commentaires.length === 1);

    const rapport = dernier("cook.reported", 15);
    assert.deepEqual([rapport?.ending, rapport?.reason, rapport?.deliverable], ["done", null, "J'ai ajouté `travail.txt` et vérifié qu'il se lit."]);
    assert.match(gh.prs[0]?.corps ?? "", /\n\nJ'ai ajouté `travail\.txt` et vérifié qu'il se lit\.$/);
    assert.doesNotMatch(gh.prs[0]?.corps ?? "", /hésité/);
    assert.match(
      gh.commentaires[0]?.[1] ?? "",
      /\n\nJ'ai ajouté `travail\.txt` et vérifié qu'il se lit\.\n\n<details>\n<summary>Le reste du message du cook<\/summary>\n\nJ'ai hésité entre deux noms de fichier\.\n\n<\/details>$/,
    );
  });

  test("un cook qui a commité sans rien délimiter n'est pas en échec : son message est son compte-rendu, publié tel quel", async (t) => {
    const { gh, etat, dernier } = cuisine(t, { issues: [issue(15)] });
    await jusqua(() => gh.commentaires.length === 1);

    const rapport = dernier("cook.reported", 15);
    assert.deepEqual([rapport?.ending, rapport?.reason, rapport?.deliverable, etat(15)], ["done", null, null, "pass"]);
    assert.match(gh.commentaires[0]?.[1] ?? "", /\n\nJ'ai ajouté `travail\.txt` et vérifié qu'il se lit\.$/);
    assert.doesNotMatch(gh.commentaires[0]?.[1] ?? "", /<details>/);
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
    const { gh, heure, journal, etat, dernier, lancements, types, avertissements } = cuisine(t, { scenario: "bavard", seuilDisjoncteur: 1, issues: [issue(15)] });
    await jusqua(() => lancements().length === 1);

    // Passé la moitié du bail sans progrès, la station le signale à son regard
    // suivant — un dixième de bail plus tard, au plus — sans l'arrêter.
    heure.avancer(BAIL_MS / 2 - 1);
    await new Promise((resoudre) => setTimeout(resoudre, 80));
    assert.equal(types(15).includes("cook.stalled"), false);
    heure.avancer(BAIL_MS / 10);
    await jusqua(() => types(15).includes("cook.stalled"));
    const run = dernier("cook.launched", 15)?.run;
    assert.deepEqual(dernier("cook.stalled", 15), { run, station: STATION, idleMs: BAIL_MS * 0.6 - 1, leaseMs: BAIL_MS });
    assert.match(avertissements.at(-1) ?? "", /le cook .* du ticket #15 coince — aucun progrès dans son worktree depuis 6 min, son bail tombe à 10 min/);

    heure.avancer(BAIL_MS * 0.4);
    await new Promise((resoudre) => setTimeout(resoudre, 80));
    assert.equal(types(15).includes("guard.tripped"), false);
    // Signalé une fois par épisode, pas à chaque regard.
    assert.equal(types(15).filter((type) => type === "cook.stalled").length, 1);
    heure.avancer(1);

    await jusqua(() => gh.commentaires.length === 1);
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
    // Le chef le lit sur l'issue, une fois : son cook est arrêté, rien n'est poussé, rien ne repartira.
    await jusqua(() => gh.commentaires.length === 1);
    assert.match(gh.commentaires[0]?.[1] ?? "", /arrêté : le ticket a quitté le rail[\s\S]*Rien n'est poussé[\s\S]*branche `cook\/15-/);
    assert.deepEqual(gh.prs, []);
  });

  test("un cook qui finit alors que son ticket vient de quitter le rail : sa branche est poussée, aucune PR n'est ouverte, et le chef lit quoi en faire", async (t) => {
    // Le ticket part entre la fin du cook et le regard suivant de la station :
    // au moment où elle lit son worktree pour juger sa fin.
    const partir: { geste?: () => void } = {};
    const pousses: string[] = [];
    const { gh, journal, runtime, dernier } = cuisine(t, {
      issues: [issue(15)],
      depot: (depot) => ({ ...depot, commits: (worktree) => (partir.geste?.(), depot.commits(worktree)), pousser: (branche) => void pousses.push(branche) }),
    });
    partir.geste = () => {
      partir.geste = undefined;
      gh.poser(issue(15, CALIBRE, { state: "closed", updatedAt: "2026-10-08T11:00:00Z" }));
      journal.ajouter({ project: "brigade", ticket: 15, author: "github", type: "ticket.left", payload: { reason: "closed" } });
    };
    await jusqua(() => gh.commentaires.length === 1);

    const branche = String(dernier("cook.launched", 15)?.branch);
    assert.deepEqual([runtime.rail.tickets(), pousses, gh.prs], [[], [branche], []]);
    assert.deepEqual([dernier("cook.reported", 15)?.ending, dernier("cook.reported", 15)?.pr], ["done", null]);
    const dit = gh.commentaires[0]?.[1] ?? "";
    assert.match(dit, /fini, ticket sorti du rail[\s\S]*ne part pas en pass[\s\S]*poussée, sans PR[\s\S]*gh pr create --head cook\/15-\S+ --base v2[\s\S]*J'ai ajouté `travail.txt`/);
    assert.doesNotMatch(dit, /Hors zone/);
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
    assert.deepEqual(dernier("station.held"), { station: STATION, reason: "stopped" });
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
      deliverable: null,
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
    // Un worktree neuf, où le cook de renvoi retrouve la livraison refusée.
    assert.notEqual(repris?.cwd, cook?.cwd);
    assert.equal(repris?.env.BASE_DE_TEST, "base du ticket 17");
  });

  test("un setup en échec sur un renvoi retire le worktree neuf, pas la branche : elle porte la livraison refusée, et le renvoi la reprend", async (t) => {
    const { repertoire, gates, setup, heure, etat, lancements, dernier, journal } = cuisine(t, { pass: true, setup: "exporte", issues: [issue(17)] });
    gates.regler("rouge");
    // Le setup casse une fois le premier cook parti : la pass le voit d'abord.
    await jusqua(() => lancements().length === 1);
    setup.regler("echec");

    await jusqua(() => etat(17) === "86");

    assert.equal(dernier("ticket.86", 17)?.reason, "setup-failed");
    assert.equal(lancements().length, 1);
    assert.deepEqual(readdirSync(join(repertoire, "worktrees")).filter((nom) => !nom.startsWith(".")), []);
    // Le setup réparé, le ticket repart : son cook est encore un renvoi, sur la branche de la livraison.
    setup.regler("exporte");
    heure.avancer(600_001);
    await jusqua(() => lancements().length === 2);
    const branches = journal.duTicket(17).filter((e) => e.type === "cook.launched").map((e) => e.payload.branch);
    assert.equal(branches[1], branches[0]);
  });

  test("un cook qui échoue en laissant du travail non commité : son worktree part quand même, ce qu'il avait écrit est commité sur sa branche locale, et rien n'est poussé", async (t) => {
    const { repertoire, origine, clone, gh, dernier, types } = cuisine(t, { git: true, scenario: "ecrit-puis-echoue", seuilDisjoncteur: 1, issues: [issue(15)] });
    await jusqua(() => types(15).includes("worktree.removed"));

    const run = String(dernier("cook.launched", 15)?.run);
    assert.deepEqual([dernier("cook.reported", 15)?.ending, dernier("cook.reported", 15)?.reason], ["failed", "code de sortie 1"]);
    assert.equal(existsSync(join(repertoire, "worktrees", run)), false);
    assert.equal(git(clone, "worktree", "list").split("\n").length, 1);
    assert.equal(git(clone, "show", `cook/${run}:brouillon.txt`), "le travail du cook, jamais commité");
    assert.equal(git(clone, "log", "-1", "--format=%an", `cook/${run}`), "brigade");
    assert.deepEqual(dernier("worktree.removed", 15), { worktree: `worktrees/${run}`, branch: `cook/${run}`, harvest: git(clone, "rev-parse", `cook/${run}`) });
    assert.throws(() => git(origine, "rev-parse", "--verify", "--quiet", `cook/${run}`));
    assert.deepEqual(gh.prs, []);
    // Racontée d'abord, rangée ensuite.
    assert.ok(types(15).indexOf("cook.reported") < types(15).indexOf("worktree.removed"));
  });

  test("un cook qui réécrit le fichier `.git` de son worktree ne fait rien lancer à la station : sa livraison échoue en le disant, rien n'est poussé, et son worktree est gardé", async (t) => {
    const { repertoire, origine, gh, journal, etat, dernier, types } = cuisine(t, { git: true, scenario: "livre-puis-detourne", seuilDisjoncteur: 1, issues: [issue(15)] });
    await jusqua(() => types(15).includes("worktree.kept"));

    const run = String(dernier("cook.launched", 15)?.run);
    // Le dépôt du cook est là, sa commande aussi : elle n'a pas été lancée.
    assert.equal(existsSync(join(repertoire, "worktrees", `${run}.piege`, "commande.sh")), true);
    assert.equal(existsSync(join(repertoire, "worktrees", `${run}.temoin`)), false);
    assert.equal(dernier("cook.reported", 15)?.ending, "failed");
    assert.match(String(dernier("cook.reported", 15)?.reason), /ne désigne plus son dépôt dans le clone \(fichier `\.git` réécrit\)/);
    assert.equal(types(15).includes("ticket.passing"), false);
    assert.notEqual(etat(15), "pass");
    assert.deepEqual(gh.prs, []);
    assert.throws(() => git(origine, "rev-parse", "--verify", "--quiet", `cook/${run}`));
    // Ce qu'il a laissé n'est pas perdu : le worktree reste, et c'est dit.
    assert.equal(existsSync(join(repertoire, "worktrees", run, "brouillon.txt")), true);
    assert.deepEqual(worktreesGardes(journal.base).map(({ ticket, reason }) => [ticket, reason]), [[15, "failed"]]);
    assert.match(String(dernier("worktree.kept", 15)?.detail), /ne désigne plus son dépôt dans le clone/);
  });

  test("un cook qui quitte sa branche et commite ailleurs n'a pas livré un ticket sans diff : il a échoué, rien ne part en pass, et son worktree est gardé avec ce travail", async (t) => {
    const { repertoire, clone, gh, journal, etat, dernier, types, avertissements } = cuisine(t, { git: true, scenario: "commite-ailleurs", seuilDisjoncteur: 1, issues: [issue(15)] });
    await jusqua(() => types(15).includes("worktree.kept"));

    const run = String(dernier("cook.launched", 15)?.run);
    assert.deepEqual([dernier("cook.reported", 15)?.ending, dernier("cook.reported", 15)?.reason], ["failed", "off-branch"]);
    assert.equal(types(15).includes("ticket.passing"), false);
    assert.notEqual(etat(15), "pass");
    assert.deepEqual(gh.prs, []);
    // Ce qu'il a commité ailleurs n'est pas perdu : le worktree reste, et c'est dit.
    assert.equal(git(clone, "show", "ailleurs:travail.txt"), "le travail du cook");
    assert.equal(existsSync(join(repertoire, "worktrees", run)), true);
    assert.deepEqual(worktreesGardes(journal.base).map(({ ticket, reason }) => [ticket, reason]), [[15, "failed"]]);
    assert.match(String(dernier("worktree.kept", 15)?.detail), /n'est plus sur sa branche `cook\/15-/);
    assert.equal(avertissements.filter((ligne) => /worktree du ticket #15 non rangé/.test(ligne)).length, 1);
  });

  test("un cook qui livre en laissant du travail non commité : la station le commite à sa place avant de pousser, et le dit sur l'issue", async (t) => {
    const { repertoire, origine, gh, etat, dernier, types } = cuisine(t, { git: true, scenario: "livre-et-laisse", issues: [issue(15)] });
    await jusqua(() => types(15).includes("worktree.removed") && gh.commentaires.length === 1);

    const run = String(dernier("cook.launched", 15)?.run);
    assert.equal(etat(15), "pass");
    assert.equal(git(origine, "show", `cook/${run}:brouillon.txt`), "oublié par le cook");
    assert.deepEqual(git(origine, "log", "--format=%an", `${BASE}..cook/${run}`).split("\n"), ["brigade", "cook"]);
    // Récolté avant le push : au rangement, il ne restait rien.
    assert.equal(dernier("worktree.removed", 15)?.harvest, null);
    assert.equal(existsSync(join(repertoire, "worktrees", run)), false);
    const recolte = git(origine, "rev-parse", "--short=7", `cook/${run}`);
    assert.match(gh.commentaires[0]?.[1] ?? "", new RegExp(`Le cook avait laissé du travail non commité dans son worktree : la station l'a commité à sa place \\(\`${recolte}\`\\), et il fait partie de la livraison`));
  });

  test("un cook mort avec le runtime : au démarrage suivant son worktree est rangé, avec ce qu'il avait écrit, avant qu'un cook neuf ne reparte", async (t) => {
    const premiere = cuisine(t, { git: true, scenario: "bavard", issues: [issue(15)] });
    await jusqua(() => premiere.lancements().length === 1);
    const run = String(premiere.dernier("cook.launched", 15)?.run);
    writeFileSync(join(premiere.lancements()[0]?.cwd ?? "", "brouillon.txt"), "à moitié écrit\n");
    premiere.runtime.arreter("test");

    const { clone, repertoire, journal, types } = cuisine(t, { lieux: premiere.lieux, git: true, scenario: "bavard" });
    await jusqua(() => types(15).filter((type) => type === "cook.launched").length === 2);

    const faits = journal.duTicket(15);
    const range = faits.findIndex((e) => e.type === "worktree.removed");
    assert.deepEqual(faits[range]?.payload, { worktree: `worktrees/${run}`, branch: `cook/${run}`, harvest: git(clone, "rev-parse", `cook/${run}`) });
    assert.ok(range < faits.findLastIndex((e) => e.type === "cook.launched"));
    assert.equal(git(clone, "show", `cook/${run}:brouillon.txt`), "à moitié écrit");
    assert.equal(existsSync(join(repertoire, "worktrees", run)), false);
  });

  test("un worktree qui ne se range pas est gardé, et dit : au journal, à journald, dans `status` — et la station y revient à chaque tick", async (t) => {
    let essais = 0;
    const { journal, dernier, types, avertissements } = cuisine(t, {
      issues: [issue(15)],
      depot: (depot) => ({
        ...depot,
        async ranger() {
          essais++;
          throw new Error("git worktree : fatal: verrou tenu");
        },
      }),
    });
    await jusqua(() => essais >= 3);

    const lance = dernier("cook.launched", 15);
    const garde = { worktree: lance?.worktree, branch: lance?.branch, reason: "failed", detail: "git worktree : fatal: verrou tenu" };
    assert.deepEqual(dernier("worktree.kept", 15), garde);
    assert.equal(types(15).filter((type) => type === "worktree.kept").length, 1);
    assert.deepEqual(worktreesGardes(journal.base).map(({ ticket, reason }) => [ticket, reason]), [[15, "failed"]]);
    assert.equal(avertissements.filter((ligne) => /worktree du ticket #15 non rangé/.test(ligne)).length, 1);
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

// Quand chaque rôle a son identité GitHub, le cook n'en a aucune.
describe("la station, cooks sans identité", { concurrency: 8 }, () => {
  const remisA = (repertoire: string, run: unknown) => join(repertoire, "runs", `${String(run)}.ticket.md`);

  test("le ticket est remis au cook en fichier, hors de son worktree — corps et commentaires —, et sa consigne l'y envoie au lieu de gh", async (t) => {
    const { repertoire, gh, lancements, dernier } = cuisine(t, { scenario: "bavard", sansIdentite: true, issues: [issue(15, CALIBRE, { title: "Le ticket privé" })] });
    gh.decrire(15, { body: "Fais ceci, puis cela." });
    gh.repondre(15, "Et n'oublie pas la doc.");
    await jusqua(() => lancements().length === 1);

    const fichier = remisA(repertoire, dernier("cook.launched", 15)?.run);
    const consigne = lancements()[0]?.args[1] ?? "";
    assert.ok(consigne.includes(`le fichier \`${fichier}\``), consigne);
    assert.doesNotMatch(consigne, /gh issue view/);
    assert.match(consigne, /aucun accès à GitHub/);
    const remis = readFileSync(fichier, "utf8");
    assert.match(remis, /^# #15 — Le ticket privé\n\nFais ceci, puis cela\./);
    assert.match(remis, /\*\*Commentaire de chef \(OWNER\)\*\*\n\nEt n'oublie pas la doc\./);
    assert.ok(!fichier.startsWith(join(repertoire, "worktrees")));
  });

  test("un ticket illisible sur GitHub ne lance aucun cook : il est reproposé plus tard, et son worktree ne reste pas", async (t) => {
    const { repertoire, gh, etat, dernier, lancements, avertissements } = cuisine(t, { scenario: "bavard", sansIdentite: true, issues: [issue(15)] });
    const lire = gh.github.commentaires;
    let lectures = 0;
    // Le rail lit les commentaires à l'arrivée du ticket ; la panne vient après.
    gh.github.commentaires = async (numero) => {
      if (++lectures > 1) throw new Error("gh api : HTTP 502");
      return lire(numero);
    };
    await jusqua(() => etat(15) === "86");

    assert.equal(dernier("ticket.86", 15)?.reason, "ticket-unreadable");
    assert.deepEqual(lancements(), []);
    assert.match(avertissements.join("\n"), /ticket #15 illisible sur GitHub, aucun cook n'est lancé — gh api : HTTP 502/);
    assert.deepEqual(readdirSync(join(repertoire, "worktrees")), []);
  });

  test("un setup qui exporte un jeton GitHub ne le passe pas au cook", async (t) => {
    const { lancements } = cuisine(t, { scenario: "bavard", setup: "jeton", sansIdentite: true, issues: [issue(15)] });
    await jusqua(() => lancements().length === 1);

    const env = lancements()[0]?.env ?? {};
    assert.equal(env.BASE_DE_TEST, "base du ticket 15");
    assert.deepEqual(Object.keys(env).filter((nom) => /TOKEN|API_KEY/.test(nom)), []);
  });

  test("sous l'identité unique de la machine, rien ne change : le cook lit son ticket par gh, et aucun fichier ne lui est remis", async (t) => {
    const { repertoire, lancements, dernier } = cuisine(t, { scenario: "bavard", setup: "jeton", issues: [issue(15)] });
    await jusqua(() => lancements().length === 1);

    assert.match(lancements()[0]?.args[1] ?? "", /gh issue view 15 --repo benomite\/brigade --comments/);
    assert.equal(existsSync(remisA(repertoire, dernier("cook.launched", 15)?.run)), false);
    // Ce que le setup exporte pour `gh` passe, comme avant.
    assert.equal(lancements()[0]?.env.GH_TOKEN, "ghp-du-projet");
  });
});
