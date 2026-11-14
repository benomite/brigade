// Un besoin découpé n'est plus sur le rail (#3479) : ses tickets disent
// `Part of #<besoin>`, le besoin les liste en tâches cochées quand ils sont
// servis, il se ferme quand ils le sont tous, et le rail ne montre jamais un
// besoin avec un ticket qui en est né. Une vision produit, un document de
// référence, sortent du rail eux aussi, avec une ligne qui dit pourquoi.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { avecTaches, besoinDe, horsDesBesoins, lienDuCorps, partDe, sortirDuRail } from "../../src/besoin/besoin.ts";
import { estUneVision, LIGNE_VISION, MARQUE_VISION, sortirLaVision } from "../../src/besoin/vision.ts";
import { stationDuDepot, type Lancer } from "../../src/brigade-github.ts";
import { DEBUT, FIN, rendreListe } from "../../src/epique.ts";
import { MARQUEUR_MANAGER } from "../../src/juger.ts";
import { suivreLeTour } from "../../src/retenue/tour.ts";
import { chef, CALIBRE, cuisine, issue, type Options } from "../aides/cuisine.ts";
import { FauxGitHub, STATION_DU_DEPOT, fauxClient } from "../faux-github.ts";
import { jusqua } from "../outils.ts";

const MAINTENANT = new Date("2026-11-13T17:00:00Z");
const BESOIN = "Le chef veut voir, partout, combien de tickets attendent.";

function brigade(t: TestContext, options: Options = {}) {
  const c = cuisine(t, { ...options, manager: options.manager ?? { jugement: "decoupe-tickets" } });
  chef(c.repertoire, "manager.enabled");
  const labels = (numero: number) => c.gh.lire(numero)?.labels ?? [];
  const liste = (numero: number) => c.gh.corpsDe(numero).split(DEBUT)[1]?.split(FIN)[0] ?? "";
  const dits = (numero: number) => c.gh.commentaires.filter(([n]) => n === numero).map(([, corps]) => corps);
  const laisserTourner = async () => {
    const depart = c.gh.sondages.ouvertes;
    await jusqua(() => c.gh.sondages.ouvertes >= depart + 3);
  };
  return { ...c, labels, liste, dits, laisserTourner };
}

// Le ticket fermé par le merge de sa PR : servi.
const livrer = (c: ReturnType<typeof brigade>, ...numeros: number[]) => {
  for (const numero of numeros) {
    c.gh.fermeesParUnMerge.set(numero, { number: 900 + numero, url: `https://github.com/acme/kitchen/pull/${900 + numero}`, base: "main", sha: "s", state: "closed", merged: true, enRetard: false, mergeePar: null });
    const ouverte = c.gh.lire(numero);
    if (ouverte) c.gh.poser({ ...ouverte, state: "closed", updatedAt: "2026-10-08T12:00:00Z" });
  }
};

describe("un besoin découpé", { concurrency: 4 }, () => {
  test("le lien se lit dans les deux sens : `Part of #N` sur le ticket, une tâche par ticket dans le besoin, cochée quand il est servi", () => {
    assert.equal(partDe(30), "Part of #30");
    assert.equal(besoinDe("Epic: #30\nPart of #31\n\n## Context"), 31);
    assert.equal(besoinDe("Epic: #30"), 30, "a ticket written by hand says its need by its epic line");
    assert.equal(besoinDe("```\nPart of #30\n```"), null, "quoting the line is not carrying it");
    assert.deepEqual(lienDuCorps(30, "Part of #30"), {}, "an issue is never its own need");
    const lignes = [
      { ticket: 501, title: "Un", state: "served", served: true },
      { ticket: 502, title: "Deux", state: "open", served: false },
    ];
    const bloc = avecTaches(rendreListe(30, lignes), lignes);
    assert.match(bloc, /^- \[x\] #501\n- \[ \] #502\n<!-- \/brigade:tickets -->$/m);
    assert.ok(bloc.startsWith(DEBUT) && bloc.endsWith(FIN));
  });

  test("le rail ne porte jamais un besoin et un ticket qui en est né : seuls les tickets restent", () => {
    const rail = horsDesBesoins([
      { number: 30, title: "Le besoin", labels: CALIBRE },
      { number: 501, title: "Ticket 1", labels: CALIBRE, besoin: 30 },
      { number: 502, title: "Ticket 2", labels: CALIBRE, besoin: 30 },
      { number: 40, title: "Un ticket seul", labels: CALIBRE },
      { number: 50, title: "Une épique listée", labels: CALIBRE, epique: true as const },
    ]);
    assert.deepEqual(rail.map(({ number }) => number), [501, 502, 40]);
  });

  test("la prise d'un cook ne rend jamais un besoin découpé, même lancé et calibré, quand un ticket qui en est né est sur le rail", async (t) => {
    const repertoire = mkdtempSync(join(tmpdir(), "besoin-"));
    t.after(() => rmSync(repertoire, { recursive: true, force: true }));
    const faux = new FauxGitHub();
    // Le besoin : lancé, calibré, sans liste dans son corps — le seul ticket
    // libre du rail, si le rail le portait.
    faux.feu(30, ["fire", "model:opus", "effort:medium"], BESOIN);
    // Son ticket, retenu par une dépendance ouverte : il attend, lui.
    faux.feu(501, ["fire", "model:sonnet", "effort:low"], `Epic: #30\n${partDe(30)}\n\nDepends on #600`);
    faux.feu(600, ["model:opus"], "an open issue");
    const lancer: Lancer = () => assert.fail("no cook leaves");
    const suivi = suivreLeTour(() => MAINTENANT);
    const station = stationDuDepot({
      ...STATION_DU_DEPOT,
      nom: "box/claude",
      places: 4,
      depotGitHub: "benomite/brigade",
      github: fauxClient(faux, "box/claude"),
      depot: { connait: () => false, preparer: async () => assert.fail("no worktree"), reprendre: async () => assert.fail("no worktree"), retirer: () => {}, ranger: async () => null, pousser: () => {}, commits: () => 0, changes: () => [], diff: () => "", tete: () => "t" },
      flux: repertoire,
      lancer,
      observer: suivi.envelopper,
      maintenant: () => MAINTENANT,
      avertir: () => {},
    });
    if ("refus" in station) throw new Error(station.refus);
    await station.tour();
    await station.calme();

    assert.equal(faux.prisesDe("box/claude"), 0);
    assert.deepEqual(faux.pris(), []);
    assert.deepEqual(suivi.vue().enAttente, [501], "the rail shows the ticket, not its need");
  });

  test("le manager découpe un besoin lancé : `fire` lui est retiré avant que ses tickets n'entrent sur le rail, chacun dit `Part of`, et le besoin les liste en tâches", async (t) => {
    const c = brigade(t, { issues: [issue(30, ["epic", "fire", "prio:2"])] });
    c.gh.decrire(30, { body: BESOIN });
    await jusqua(() => /- \[ \] #503/.test(c.liste(30)));

    assert.deepEqual(c.gh.creations, [501, 502, 503]);
    assert.ok(!c.labels(30).includes("fire"), "the split need is off the rail");
    assert.deepEqual(c.gh.delabellisations, [[30, "fire"]]);
    // Retiré avant que le premier ticket ne reçoive `fire`.
    assert.deepEqual(c.gh.labellisations[0], [501, ["fire"]]);
    for (const numero of [501, 502, 503]) {
      assert.match(c.gh.corpsDe(numero), /^Part of #30$/m);
      assert.match(c.liste(30), new RegExp(`^- \\[ \\] #${numero}$`, "m"));
      assert.ok(c.labels(numero).includes("fire"));
    }
    const dit = c.dits(30).find((corps) => corps.includes(MARQUEUR_MANAGER) && /epic split into/.test(corps)) ?? "";
    assert.match(dit, /The epic itself is off the rail \(`fire` removed\)/);
  });

  test("le besoin reste ouvert tant qu'un de ses tickets l'est, et se ferme quand ils sont tous servis, ses tâches cochées", async (t) => {
    const c = brigade(t, { issues: [issue(30, ["epic", "fire"])] });
    c.gh.decrire(30, { body: BESOIN });
    await jusqua(() => /- \[ \] #503/.test(c.liste(30)));

    livrer(c, 501, 502);
    await jusqua(() => /- \[x\] #502/.test(c.liste(30)));
    await c.laisserTourner();
    assert.equal(c.gh.lire(30)?.state, "open", "one ticket still open: the need stays open");
    assert.match(c.liste(30), /^- \[x\] #501\n- \[x\] #502\n- \[ \] #503$/m);
    assert.deepEqual(c.gh.fermetures, []);

    livrer(c, 503);
    await jusqua(() => c.gh.lire(30)?.state === "closed");
    assert.match(c.liste(30), /^- \[x\] #501\n- \[x\] #502\n- \[x\] #503$/m);
    assert.deepEqual(c.gh.fermetures, [30]);
  });

  test("sortir du rail un besoin que GitHub dit fermé, ou sans `fire`, ne touche à rien ; GitHub qui ne répond pas fait lever, le découpage reprend", async () => {
    const retraits: number[] = [];
    const github = (lue: { state: "open" | "closed"; labels: string[] } | null, panne = false) => ({
      issue: async () => {
        if (panne) throw new Error("gh api : HTTP 502");
        return lue === null ? null : { ...issue(30, lue.labels, { state: lue.state }), body: "" };
      },
      delabelliser: async (numero: number) => void retraits.push(numero),
    });
    assert.equal(await sortirDuRail(github({ state: "closed", labels: ["fire"] }), 30), false);
    assert.equal(await sortirDuRail(github({ state: "open", labels: [] }), 30), false);
    assert.equal(await sortirDuRail(github(null), 30), false);
    assert.deepEqual(retraits, []);
    await assert.rejects(sortirDuRail(github(null, true), 30), /HTTP 502/);
    assert.equal(await sortirDuRail(github({ state: "open", labels: ["fire", "epic"] }), 30), true);
    assert.deepEqual(retraits, [30]);
  });
});

describe("une vision produit lancée", { concurrency: 4 }, () => {
  test("le manager la sort du rail avec une seule ligne qui dit pourquoi ; un livrable lancé reste sur le rail", async (t) => {
    const c = brigade(t, {
      manager: { jugement: "juge-ticket" },
      issues: [issue(3, ["fire"], { title: "Product vision — Secondes" }), issue(41, CALIBRE, { title: "Add the timer screen" })],
    });
    await jusqua(() => !c.labels(3).includes("fire"));
    await c.laisserTourner();

    const dits = c.dits(3);
    assert.deepEqual(dits, [LIGNE_VISION], "exactly one comment on the vision");
    assert.equal(dits[0]?.split("\n").length, 1, "one line");
    assert.match(dits[0] ?? "", /product vision or a reference document is not a deliverable/);
    assert.deepEqual(c.labels(41), CALIBRE, "the deliverable stays on the rail");
    assert.deepEqual(c.dits(41), []);
  });

  test("ce qui se dit vision : un label, ou un titre qui l'annonce — pas un livrable qui commence par le mot", () => {
    assert.ok(estUneVision({ title: "Product vision — Secondes", labels: [] }));
    assert.ok(estUneVision({ title: "Vision: what Secondes is for", labels: [] }));
    assert.ok(estUneVision({ title: "[Vision] Secondes", labels: [] }));
    assert.ok(estUneVision({ title: "Secondes, in one page", labels: ["vision"] }));
    assert.ok(estUneVision({ title: "Glossary", labels: ["reference"] }));
    assert.ok(!estUneVision({ title: "Vision mode for the camera", labels: ["fire"] }));
    assert.ok(!estUneVision({ title: "Add the timer screen", labels: ["fire"] }));
  });

  test("la ligne ne se pose pas deux fois ; GitHub qui ne répond pas laisse la vision au tour suivant", async () => {
    const poses: string[] = [];
    const retraits: string[] = [];
    let panne = true;
    const github = {
      commentaires: async () => {
        if (panne) throw new Error("gh api : HTTP 502");
        return poses.map((body) => ({ body, author: "brigade", association: "OWNER", createdAt: "2026-11-13T17:00:00Z" }));
      },
      commenter: async (_: number, corps: string) => void poses.push(corps),
      delabelliser: async (_: number, label: string) => void retraits.push(label),
    };
    const avertissements: string[] = [];
    assert.equal(await sortirLaVision(github, { number: 3, labels: ["fire"] }, (m) => void avertissements.push(m)), false);
    assert.match(avertissements[0] ?? "", /la vision #3 n'est pas sortie du rail/);
    assert.deepEqual([poses, retraits], [[], []]);

    panne = false;
    assert.equal(await sortirLaVision(github, { number: 3, labels: ["fire"] }, () => {}), true);
    // Le chef remet `fire` : il se retire de nouveau, sans seconde ligne.
    assert.equal(await sortirLaVision(github, { number: 3, labels: ["fire"] }, () => {}), true);
    assert.equal(await sortirLaVision(github, { number: 3, labels: [] }, () => {}), true);
    assert.equal(poses.length, 1);
    assert.ok(poses[0]?.includes(MARQUE_VISION));
    assert.deepEqual(retraits, ["fire", "fire"]);
  });
});
