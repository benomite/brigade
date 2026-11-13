// Une boucle d'attentes entre tickets se défait seule (#3477) : le ticket posé
// en dernier lâche son attente, une ligne le dit sur son issue, et les attentes
// hors boucle ne bougent pas. Les cas de la station passent par `stationDuDepot`
// sur un faux GitHub ; les boucles longues et les lectures qui échouent, par
// `defaireLesBoucles` sur un faux lecteur.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { cycleDAttentes, defaireLesBoucles } from "../../src/boucle-attente/boucle-attente.ts";
import { MARQUE_D_ATTENTE_LEVEE } from "../../src/boucle-attente/levee.ts";
import { MARQUE_D_ATTENTE_DE_TICKET } from "../../src/attente-ticket/attente-ticket.ts";
import { stationDuDepot, type Lancer } from "../../src/brigade-github.ts";
import { MARQUEUR } from "../../src/fiche.ts";
import type { GitHub } from "../../src/github.ts";
import { FauxGitHub, STATION_DU_DEPOT, depotNeuf, fauxClient } from "../faux-github.ts";

const CALIBRE = ["fire", "model:opus", "effort:medium"];
const OUVERT = ["fire", "model:opus"];
const levees = (faux: FauxGitHub, n: number) => (faux.commentaires.get(n) ?? []).map((c) => c.body).filter((b) => b.startsWith(MARQUE_D_ATTENTE_LEVEE));
const fiche = (...attendus: number[]) => `${MARQUEUR}\n- attend : ${attendus.map((n) => `#${n}`).join(", ")}\n- zone : src/screen`;

function station(t: TestContext, avant: (faux: FauxGitHub) => void, bloque: string | null = null) {
  const repertoire = mkdtempSync(join(tmpdir(), "boucle-attente-"));
  t.after(() => rmSync(repertoire, { recursive: true, force: true }));
  const faux = new FauxGitHub();
  avant(faux);
  let cooks = 0;
  const lancer: Lancer = ({ flux }) => {
    cooks += 1;
    const message = cooks === 1 && bloque !== null ? `I stopped.\n<livrable>\n<bloque>${bloque}</bloque>\n</livrable>` : "Done.\n<livrable>\nNothing.\n</livrable>";
    writeFileSync(flux, `${JSON.stringify({ type: "result", is_error: false, result: message })}\n`);
    return { fin: Promise.resolve({ code: 0, signal: null, turns: 10, tokens: 1, durationMs: 1, arret: null, erreur: null }) };
  };
  const sauts = new Map<number, string>();
  const github: GitHub = { ...fauxClient(faux) };
  const ouverte = stationDuDepot({ ...STATION_DU_DEPOT, github, depot: depotNeuf(repertoire), manager: () => ({ model: "opus", effort: "high" }), flux: repertoire, lancer, avertir: () => {}, sauter: (ticket, ligne) => void sauts.set(ticket, ligne) });
  if ("refus" in ouverte) throw new Error(ouverte.refus);
  const tour = async () => {
    sauts.clear();
    await ouverte.tour();
    await ouverte.calme();
  };
  return { faux, tour, cooks: () => cooks, sauts };
}

test("a loop already in the stored state (#18 waits for #28, #28 waits for #18): the next cycle drops the wait of #28, one line says so, and both tickets run by their remaining waits", async (t) => {
  const s = station(t, (faux) => {
    faux.feu(18, CALIBRE, "body");
    faux.feu(28, OUVERT, "body");
    faux.poster(18, "box", fiche(28));
    faux.poster(28, "box", fiche(18));
  });
  await s.tour();
  // #18 is the older ticket and keeps its wait on #28; #28 drops its wait on #18.
  const lignes = levees(s.faux, 28);
  assert.equal(lignes.length, 1);
  assert.match(lignes[0] ?? "", /removed the wait of #28 on #18/);
  assert.match(lignes[0] ?? "", /waited for each other/);
  assert.equal(levees(s.faux, 18).length, 0);
  // #18 still waits for #28, which is not a loop any more: it is skipped, and says what for.
  assert.equal(s.sauts.get(18), "#18 is claimable but not claimed, the claim gate skipped it: waiting for #28 — it starts on its own once it is served");
  await s.tour();
  assert.equal(levees(s.faux, 28).length, 1, "a broken loop is not reported again");
  s.faux.ticket(28).state = "closed";
  await s.tour();
  assert.equal(s.cooks(), 1, "#18 starts once #28 is served");
});

test("a wait added by a stopped cook that closes a loop: the later wait is dropped and the ticket is not left blocked on the older one", async (t) => {
  // #20 (the cook's ticket) names #10 as unmerged work, while #10 already waits for #20.
  const s = station(
    t,
    (faux) => {
      faux.feu(20, CALIBRE, "body");
      faux.feu(10, OUVERT, "body");
      faux.poster(10, "box", fiche(20));
    },
    "This builds on the unmerged work of #10.",
  );
  await s.tour();
  assert.equal(levees(s.faux, 20).length, 1);
  assert.equal(levees(s.faux, 10).length, 0);
  assert.match(levees(s.faux, 20)[0] ?? "", /removed the wait of #20 on #10/);
  assert.ok((s.faux.commentaires.get(20) ?? []).some((c) => c.body.startsWith(MARQUE_D_ATTENTE_DE_TICKET)), "the waiting mark is still on the issue");
  await s.tour();
  assert.equal(s.sauts.get(20) ?? null, null, "#20 is not held by #10 any more");
  assert.equal(s.cooks(), 2);
});

test("a wait that is not part of a loop is left untouched", async (t) => {
  const s = station(t, (faux) => {
    faux.feu(20, CALIBRE, "body");
    faux.feu(10, OUVERT, "body");
    faux.poster(20, "box", fiche(10));
  });
  await s.tour();
  assert.equal(levees(s.faux, 20).length + levees(s.faux, 10).length, 0);
  assert.equal(s.sauts.get(20), "#20 is claimable but not claimed, the claim gate skipped it: waiting for #10 — it starts on its own once it is served");
});

// Un faux lecteur : `attentes` dit, ticket par ticket, la ligne `attend` de sa fiche.
function lecteur(attentes: Record<number, number[]>, { illisibles = [] as number[] } = {}) {
  const poses: Array<{ numero: number; corps: string }> = [];
  const github = {
    commentaires: async (numero: number) => {
      if (illisibles.includes(numero)) throw new Error("unreadable");
      return [...(attentes[numero]?.length ? [{ body: fiche(...(attentes[numero] as number[])) }] : []), ...poses.filter((p) => p.numero === numero).map((p) => ({ body: p.corps }))];
    },
    dependancesOuvertes: async () => [],
    issue: async (numero: number) => ({ number: numero, state: "open" as const, body: "" }),
    commenter: async (numero: number, corps: string) => void poses.push({ numero, corps }),
  };
  return { github: github as never, poses };
}

test("a longer loop (#1 → #2 → #3 → #1) is broken with exactly one wait removed: the most recent ticket drops its wait", async () => {
  const { github, poses } = lecteur({ 1: [2], 2: [3], 3: [1] });
  assert.deepEqual(await defaireLesBoucles(github, 1, []), [2]);
  assert.equal(poses.length, 1);
  assert.equal(poses[0]?.numero, 3);
  assert.match(poses[0]?.corps ?? "", /removed the wait of #3 on #1/);
  assert.match(poses[0]?.corps ?? "", /#1 → #2 → #3 → #1/);
  // Read again, the loop is gone: no second line.
  assert.deepEqual(await defaireLesBoucles(github, 2, []), [3]);
  assert.equal(poses.length, 1);
});

test("two separate loops reached from one ticket are each broken once; waits outside them stay", async () => {
  const { github, poses } = lecteur({ 5: [1, 2], 1: [4], 4: [1], 2: [9] });
  assert.deepEqual(await defaireLesBoucles(github, 5, []), [1, 2]);
  assert.deepEqual(poses.map((p) => p.numero), [4]);
});

test("a ticket that cannot be read is given no waits: no loop is decided on what was not read", async () => {
  const { github, poses } = lecteur({ 1: [2], 2: [1] }, { illisibles: [2] });
  assert.deepEqual(await defaireLesBoucles(github, 1, []), [2]);
  assert.equal(poses.length, 0);
});

test("a ticket whose own comments cannot be read has no waits, as before: no loop, no line", async () => {
  const { github } = lecteur({ 1: [2] }, { illisibles: [1] });
  assert.deepEqual(await defaireLesBoucles(github, 1, []), []);
});

test("cycleDAttentes: finds the cycle in order, and none in a chain", () => {
  assert.deepEqual(cycleDAttentes(1, (n) => ({ 1: [2], 2: [3], 3: [2] })[n] ?? []), [2, 3]);
  assert.equal(cycleDAttentes(1, (n) => ({ 1: [2], 2: [3] })[n] ?? []), null);
});
