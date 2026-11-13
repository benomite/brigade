// Deux stations servent un projet, chacune avec son manager, son journal et
// son faux `claude`, sur un seul GitHub (#2568) : le travail du manager sur une
// issue se prend sur GitHub comme un ticket, et une seule station le fait.
import assert from "node:assert/strict";
import { describe, test, type TestContext } from "node:test";
import { BAIL_DU_MANAGER_MS, corpsDePriseDuManager, corpsDeTravailFait } from "../src/github-etat/prise-du-manager.ts";
import type { Fait } from "../src/evenements.ts";
import type { Issue } from "../src/github.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { empreinte, MARQUEUR_MANAGER } from "../src/juger.ts";
import { chef, cuisine, fauxGitHub, issue, montre } from "./aides/cuisine.ts";
import { jusqua, poserJournalVide, repertoireTemporaire } from "./outils.ts";

const EPIQUE = "Le chef veut voir, partout, combien de tickets attendent.";
const PRISE = /^<!-- brigade:manager-prise station=([^ ]+) etat=[0-9a-f]+ jeton=[0-9a-f]+( fait)? -->/;

// Un projet sur un GitHub, et les stations qui le servent : chacune son
// répertoire d'état, son journal, son manager allumé.
// `depuis` : l'heure des stations au départ.
function projet(t: TestContext, issues: Issue[], depuis?: string) {
  const gh = fauxGitHub(...issues);
  const heure = montre(depuis);
  // `journal` : ce que son journal tient déjà quand elle démarre.
  const station = (nom: string, manager: { jugement?: string; suite?: string[] }, journal: Array<{ ticket: number } & Fait> = []) => {
    const repertoire = repertoireTemporaire(t);
    poserJournalVide(repertoire);
    const avant = ouvrirJournal(repertoire);
    for (const { ticket, ...fait } of journal) avant.ajouter({ project: "brigade", ticket, author: "manager", ...fait } as Parameters<typeof avant.ajouter>[0]);
    avant.fermer();
    const c = cuisine(t, { lieux: { repertoire, origine: "", clone: "", gh, heure }, manager: { ...manager, station: nom } });
    chef(repertoire, "manager.enabled");
    // Les lancements de `claude` de son manager, par le préfixe de leur run.
    const runs = (prefixe: string) => c.journal.tout().filter((e) => e.type === "cook.launched" && String(e.payload.run).startsWith(prefixe));
    return { ...c, runs };
  };
  const dits = (numero: number) => gh.commentaires.filter(([n, corps]) => n === numero && corps.includes(MARQUEUR_MANAGER)).map(([, corps]) => corps);
  // Les prises du travail du manager sur l'issue, telles que GitHub les rend.
  const prises = async (numero: number) =>
    (await gh.github.commentaires(numero)).flatMap(({ body }) => {
      const marque = PRISE.exec(body);
      return marque ? [{ station: marque[1], fait: marque[2] !== undefined }] : [];
    });
  const laisserTourner = async (tours = 6) => {
    const depart = gh.sondages.ouvertes;
    await jusqua(() => gh.sondages.ouvertes >= depart + tours);
  };
  return { gh, heure, station, dits, prises, laisserTourner };
}

describe("deux stations sur un projet : le manager agit une fois par issue", { concurrency: 4 }, () => {
  test("une issue `product` neuve : une qualification, un découpage, aucun sous-ticket en double", async (t) => {
    const p = projet(t, [issue(30, ["product"])]);
    p.gh.decrire(30, { body: EPIQUE });
    const box = p.station("box/claude", { suite: ["juge-epique", "decoupe-tickets"] });
    const mac = p.station("mac/claude", { suite: ["juge-epique", "decoupe-tickets"] });

    await jusqua(() => p.dits(30).some((dit) => /epic split into/.test(dit)));
    await p.laisserTourner();

    // Une qualification, un découpage, sur les deux stations ensemble.
    assert.equal(box.runs("juge-30-").length + mac.runs("juge-30-").length, 1);
    assert.equal(box.runs("decoupe-30-").length + mac.runs("decoupe-30-").length, 1);
    assert.equal(box.runs("juge-30-").length, box.runs("decoupe-30-").length, "la station qui qualifie est celle qui découpe");
    // Trois sous-tickets, une fois chacun, que l'autre station ne rejuge pas.
    assert.deepEqual(p.gh.creations, [501, 502, 503]);
    assert.equal(new Set([501, 502, 503].map((numero) => p.gh.lire(numero)?.title)).size, 3);
    for (const numero of [501, 502, 503]) assert.equal(box.runs(`juge-${numero}-`).length + mac.runs(`juge-${numero}-`).length, 0);
    assert.equal(p.dits(30).filter((dit) => /epic split into/.test(dit)).length, 1);
    // L'issue dit qui a fait le travail, et qu'il est fait.
    const [tenue, ...autres] = (await p.prises(30)).filter((prise) => prise.fait);
    assert.deepEqual(autres, []);
    assert.equal(tenue?.station, box.runs("juge-30-").length === 1 ? "box/claude" : "mac/claude");
  });

  test("le travail qu'une autre station a dit fait n'est pas refait, même longtemps après", async (t) => {
    const p = projet(t, [issue(30, [])]);
    // Le corps vide, sans commentaire : l'état que les stations lisent.
    p.gh.repondre(30, corpsDeTravailFait("mac/claude", empreinte({ ...issue(30, []), body: "" }, []), "0a1b2c3d"));
    p.heure.avancer(10 * BAIL_DU_MANAGER_MS);
    const box = p.station("box/claude", { jugement: "juge-ticket" });

    await p.laisserTourner();

    assert.equal(box.runs("juge-").length, 0);
    assert.deepEqual(p.gh.labellisations, []);
    // Rien ne reste à faire ici : le sondage est confirmé.
    assert.ok(p.gh.sondages.inchanges > 0);
  });

  test("une issue refusée au chef avant #3429, dont la station qui l'a jugée a dit le travail fait : elle la rejuge une fois pour sa question, sa propre prise faite ne la retient pas", async (t) => {
    const p = projet(t, [issue(30, [])]);
    const etat = empreinte({ ...issue(30, []), body: "" }, []);
    p.gh.repondre(30, corpsDeTravailFait("box/claude", etat, "0a1b2c3d"));
    const box = p.station("box/claude", { jugement: "juge-decision" }, [
      { ticket: 30, type: "manager.judged", payload: { run: "juge-30-a", fingerprint: etat, verdict: "refused", kind: "decision", reason: "A decision issue.", missing: null, model: null, effort: null, calibration: null } },
      { ticket: 30, type: "manager.commented", payload: {} },
    ]);

    await jusqua(() => p.gh.lire(30)?.labels.includes("decision") === true);
    await p.laisserTourner();

    assert.equal(box.runs("juge-30-").length, 1);
    assert.deepEqual(p.gh.labellisations, [[30, ["decision"]]]);
    assert.match(p.dits(30)[0] ?? "", /\nDo you grant the deploy role write access to the backup bucket\?\n/);
  });

  test("une station qui s'arrête au milieu du travail le rend : une autre le prend une fois sa prise périmée", async (t) => {
    // Les commentaires que GitHub date pendant le test le sont de 9 h 30 : la
    // station part avant, pour que ses prises soient vives quand elle les lit.
    const p = projet(t, [issue(30, [])], "2026-10-08T09:00:00.000Z");
    // La prise d'une station qui s'est tue sans dire le travail fait, à 8 h.
    p.gh.ficher(30, "2026-10-08T08:00:00Z", corpsDePriseDuManager("mac/claude", empreinte({ ...issue(30, []), body: "" }, []), "0a1b2c3d"));
    const box = p.station("box/claude", { jugement: "juge-ticket" });

    await p.laisserTourner();
    assert.equal(box.runs("juge-").length, 0);
    assert.deepEqual(p.gh.labellisations, []);

    // 9 h 31 : la prise de 8 h a périmé.
    p.heure.avancer(31 * 60_000);
    await jusqua(() => p.dits(30).length === 1);

    assert.equal(box.runs("juge-30-").length, 1);
    assert.deepEqual(p.gh.lire(30)?.labels, ["fire", "model:haiku", "effort:low"]);
    // Le travail est dit fait au tour qui l'a mené au bout.
    await p.laisserTourner(2);
    assert.deepEqual(await p.prises(30), [
      { station: "mac/claude", fait: false },
      { station: "box/claude", fait: true },
    ]);
  });
});
