// Un ticket dont les gates ne se jouent pas sur une station va à une autre
// station du projet, jamais au chef en geste (#3057). Les tests passent par
// la station (`stationDuDepot`), sur un faux GitHub que deux stations du même
// projet partagent : le faux `claude` de la première finit sur un `<bloque>`
// qui dit que ses gates ne tournent pas ici, celui de la seconde livre.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { MARQUE_DE_LA_CONSULTATION } from "../../src/blocage-au-manager.ts";
import { A_LA_MAIN, stationDuDepot, type Lancer } from "../../src/brigade-github.ts";
import { LABEL_IN_PASS, LABEL_TAKEN } from "../../src/github-etat/etats.ts";
import { CHEF_TODO } from "../../src/github-seul/carte-todo/carte-todo.ts";
import { corpsDeLIncapacite, gatesInjouables, incapables, MARQUE_D_INCAPACITE, stationsCapables } from "../../src/routage-station/routage-station.ts";
import { FauxGitHub, STATION_DU_DEPOT, depotNeuf, fauxClient } from "../faux-github.ts";

const N = 674;
const CALIBRE = ["fire", "model:opus", "effort:medium"];
const INJOUABLES = "The gates cannot run on this station: the local Postgres service the tests need is unreachable (ECONNREFUSED 127.0.0.1:5432).";

// Une station du projet sur le faux GitHub partagé. `bloque` : ce que ses cooks
// déclarent (null : ils livrent un commit). Les stations du projet : `projet`.
// `retraitsIllisibles` : GitHub ne donne pas les retraits de labels de l'issue.
// `apresLeCook` : joué quand un cook finit.
function station(t: TestContext, faux: FauxGitHub, nom: string, projet: readonly string[] | undefined, bloque: string | null, retraitsIllisibles = false, apresLeCook?: () => void) {
  const repertoire = mkdtempSync(join(tmpdir(), "routage-station-"));
  t.after(() => rmSync(repertoire, { recursive: true, force: true }));
  let cooks = 0;
  const consultations: string[][] = [];
  const lancer: Lancer = ({ args, flux }) => {
    const consulte = args.some((arg) => arg.startsWith(MARQUE_DE_LA_CONSULTATION));
    if (consulte) consultations.push(args);
    else cooks += 1;
    const message = consulte ? JSON.stringify({ issue: "geste", geste: "install postgres" }) : bloque !== null ? `I stopped.\n<livrable>\n<bloque>${bloque}</bloque>\n</livrable>` : "Done.\n<livrable>\nDelivered.\n</livrable>";
    writeFileSync(flux, `${JSON.stringify({ type: "result", is_error: false, result: message })}\n`);
    if (!consulte) apresLeCook?.();
    return { fin: Promise.resolve({ code: 0, signal: null, turns: 10, tokens: 1, durationMs: 1, arret: null, erreur: null }) };
  };
  const avertissements: string[] = [];
  const sauts = new Map<number, string>();
  const depot = depotNeuf(repertoire);
  const ouverte = stationDuDepot({
    ...STATION_DU_DEPOT,
    nom,
    github: { ...fauxClient(faux, nom), ...(retraitsIllisibles ? { retraitsDeLabels: async () => assert.fail("HTTP 502") } : {}) },
    depot: bloque === null ? { ...depot, commits: () => 1, changes: () => ["src/a.ts"], diff: () => "diff --git a/src/a.ts b/src/a.ts\n+x\n" } : depot,
    manager: () => ({ model: "opus", effort: "high" }),
    flux: repertoire,
    lancer,
    avertir: (texte) => void avertissements.push(texte),
    sauter: (ticket, ligne) => void sauts.set(ticket, ligne),
    ...(projet === undefined ? {} : { stationsDuProjet: () => projet }),
  });
  if ("refus" in ouverte) throw new Error(ouverte.refus);
  const tour = async () => {
    sauts.clear();
    await ouverte.tour();
    await ouverte.calme();
    return sauts.get(N) ?? null;
  };
  return { tour, cooks: () => cooks, consultations, avertissements };
}

const commentaires = (faux: FauxGitHub) => (faux.commentaires.get(N) ?? []).map((c) => c.body);
const sansCarte = (faux: FauxGitHub) => {
  const ticket = faux.ticket(N);
  assert.equal(ticket.labels.has(A_LA_MAIN), false, "not blocked-on-human");
  assert.equal(ticket.labels.has(CHEF_TODO), false, "no chef TODO card");
  assert.ok(commentaires(faux).every((corps) => !corps.startsWith("**Gesture for the chef") && !corps.startsWith("**Question for the chef")), "no card for the chef");
};

test("a cook's block says the gates cannot run on its station: missing dependency, unreachable local service — and nothing else", () => {
  assert.equal(gatesInjouables(INJOUABLES), true);
  assert.equal(gatesInjouables("I cannot run the gates: `pnpm` is not installed on this machine."), true);
  assert.equal(gatesInjouables("Les gates ne peuvent pas tourner ici : la dépendance `libvips` manque sur cette station."), true);
  assert.equal(gatesInjouables("Which layout does the chef want for the second screen?"), false, "a product question");
  assert.equal(gatesInjouables("The tests pass. Should the button be red or blue?"), false, "the gates run");
  assert.equal(gatesInjouables("This ticket builds on #12, which is not merged yet."), false, "a dependency on a ticket");
});

test("the unable stations are read from the repo's marks since the ticket was last put back on the rail; the capable ones are the others", () => {
  const marque = (station: string, at: string, association = "OWNER") => ({ body: corpsDeLIncapacite({ station, vers: [], question: INJOUABLES }), association, createdAt: at });
  const lues = [marque("box/codex", "2026-11-09T10:00:00Z"), marque("pc/claude", "2026-11-09T12:00:00Z"), marque("box/claude", "2026-11-09T12:30:00Z", "NONE")];
  assert.deepEqual([...incapables(lues, [])].sort(), ["box/codex", "pc/claude"], "an outsider's comment is not a mark");
  assert.deepEqual([...incapables(lues, [{ label: "fire", createdAt: "2026-11-09T11:00:00Z" }])], ["pc/claude"], "putting the ticket back on the rail clears the earlier marks");
  assert.deepEqual([...incapables(lues, [{ label: "served-elsewhere", createdAt: "2026-11-09T11:00:00Z" }])], ["pc/claude"]);
  assert.deepEqual(stationsCapables("box/codex", ["box/codex", "box/claude", "pc/claude"], new Set(["box/codex", "pc/claude"])), ["box/claude"]);
  assert.deepEqual(stationsCapables("box/codex", ["box/codex"], new Set(["box/codex"])), []);
});

test("two stations of the project, the first unable to run the gates: the ticket is reassigned to the second and cooked there — no TODO card for the chef", async (t) => {
  const faux = new FauxGitHub();
  faux.feu(N, CALIBRE, "## Context\n\nMirror the lab's measurements.");
  const projet = ["box/codex", "box/claude"];
  const premiere = station(t, faux, "box/codex", projet, INJOUABLES);
  const seconde = station(t, faux, "box/claude", projet, null);
  assert.equal(await premiere.tour(), null, "first turn: the first station takes the ticket");
  assert.equal(premiere.cooks(), 1);
  const marque = commentaires(faux).find((corps) => corps.startsWith(MARQUE_D_INCAPACITE));
  assert.match(marque ?? "", /^<!-- brigade:station-incapable station=box\/codex -->\nStation `box\/codex` cannot run this ticket's gates.*given back for another station of the project \(`box\/claude`\)/);
  assert.equal(faux.ticket(N).labels.has(LABEL_TAKEN), false, "given back to the rail");
  assert.equal(premiere.consultations.length, 0, "the manager is not consulted: nothing to decide");
  assert.ok(premiere.avertissements.some((ligne) => ligne.includes("goes to another station of the project (box/claude)")));
  sansCarte(faux);
  // La seconde le prend et le cuisine : sa PR l'amène au pass.
  assert.equal(await seconde.tour(), null);
  assert.equal(seconde.cooks(), 1, "cooked on the second station");
  assert.ok(faux.prs.some((pr) => pr.issue === N && pr.state === "open"), "the second station's delivery is a PR");
  assert.equal(faux.ticket(N).labels.has(LABEL_IN_PASS), true);
  assert.equal(premiere.cooks(), 1, "never cooked again on the first");
  sansCarte(faux);
  assert.ok(!commentaires(faux).some((corps) => corps.startsWith("<!-- brigade:echec")), "not counted among the ticket's tries");
});

test("a ticket is never sent back to a station already marked unable for it, turn after turn, and even when it is the only free ticket", async (t) => {
  const faux = new FauxGitHub();
  faux.feu(N, CALIBRE);
  const projet = ["box/codex", "box/claude"];
  const premiere = station(t, faux, "box/codex", projet, INJOUABLES);
  await premiere.tour();
  for (let tour = 0; tour < 3; tour += 1) assert.equal(await premiere.tour(), `#${N} is claimable but not claimed, the claim gate skipped it: station box/codex cannot run its gates — it goes to box/claude`);
  assert.equal(premiere.cooks(), 1, "the marked station never takes it again");
  assert.equal(faux.ticket(N).labels.has(LABEL_TAKEN), false);
  // Une station redémarrée relit la marque sur l'issue : elle ne le reprend pas non plus.
  const relancee = station(t, faux, "box/codex", projet, null);
  assert.match((await relancee.tour()) ?? "", /station box\/codex cannot run its gates/);
  assert.equal(relancee.cooks(), 0);
});

test("issue comments unreadable at the claim gate: the claim, which reads the same comments, takes nothing, and the turn fails", async (t) => {
  const faux = new FauxGitHub();
  faux.feu(N, CALIBRE);
  const premiere = station(t, faux, "box/codex", ["box/codex", "box/claude"], INJOUABLES);
  await premiere.tour();
  const avant = faux.commentaires.get(N);
  faux.commentaires.set(N, new Proxy([], { get: () => assert.fail("HTTP 502") }) as never);
  await assert.rejects(premiere.tour(), /HTTP 502/);
  assert.equal(premiere.cooks(), 1, "not retaken on an unreadable issue");
  faux.commentaires.set(N, avant ?? []);
  assert.match((await premiere.tour()) ?? "", /station box\/codex cannot run its gates/, "readable again: the mark holds");
  assert.equal(premiere.cooks(), 1);
});

test("label removals unreadable at the claim gate: every mark holds", async (t) => {
  const faux = new FauxGitHub();
  faux.feu(N, CALIBRE);
  faux.poster(N, "box/codex", corpsDeLIncapacite({ station: "box/codex", vers: ["box/claude"], question: INJOUABLES }));
  const premiere = station(t, faux, "box/codex", ["box/codex", "box/claude"], null, true);
  assert.equal(await premiere.tour(), `#${N} is claimable but not claimed, the claim gate skipped it: station box/codex cannot run its gates — it goes to box/claude`);
  assert.equal(premiere.cooks(), 0);
});

test("the earlier marks unreadable when the cook stops: the station says so, still marks itself, and the ticket is given back", async (t) => {
  const faux = new FauxGitHub();
  faux.feu(N, CALIBRE);
  // La première lecture des commentaires après le cook échoue, une fois.
  let illisible = false;
  const premiere = station(t, faux, "box/codex", ["box/codex", "box/claude"], INJOUABLES, false, () => {
    const lus = faux.commentaires.get(N) ?? [];
    illisible = true;
    faux.commentaires.set(N, new Proxy(lus, { get: (cible, cle, recepteur) => {
      if (illisible) {
        illisible = false;
        faux.commentaires.set(N, lus);
        throw new Error("HTTP 502");
      }
      return Reflect.get(cible, cle, recepteur);
    } }));
  });
  await premiere.tour();
  assert.ok(premiere.avertissements.some((ligne) => ligne === `brigade : #${N} sur box/codex — the stations already unable to run its gates could not be read: HTTP 502`), premiere.avertissements.join("\n"));
  assert.match(commentaires(faux).find((corps) => corps.startsWith(MARQUE_D_INCAPACITE)) ?? "", /^<!-- brigade:station-incapable station=box\/codex -->/);
  assert.equal(faux.ticket(N).labels.has(LABEL_TAKEN), false, "given back to the rail");
  sansCarte(faux);
});

test("a single station of the project, unable to run the gates: the ticket stays held on that station, reported at the station level — no gesture, no blocked-on-human, no manager", async (t) => {
  const faux = new FauxGitHub();
  faux.feu(N, CALIBRE);
  const seule = station(t, faux, "box/codex", ["box/codex"], INJOUABLES);
  await seule.tour();
  assert.equal(seule.cooks(), 1);
  assert.match(commentaires(faux).find((corps) => corps.startsWith(MARQUE_D_INCAPACITE)) ?? "", /No other station of the project can take it: the ticket stays on the rail, held on `box\/codex`, until that station can run the gates\./);
  assert.ok(seule.avertissements.some((ligne) => ligne.startsWith("brigade : station box/codex cannot run the gates of #674, and no other station of the project can")), "said in the station's log");
  assert.equal(seule.consultations.length, 0, "the manager is not consulted");
  sansCarte(faux);
  assert.equal(faux.ticket(N).labels.has("fire"), true, "it stays on the rail");
  assert.equal(await seule.tour(), `#${N} is claimable but not claimed, the claim gate skipped it: station box/codex cannot run its gates and no other station of the project can — the station is to be fixed`);
  assert.equal(seule.cooks(), 1, "held: not cooked again on that station");
  assert.ok(!commentaires(faux).some((corps) => corps.startsWith("<!-- brigade:echec")), "not counted among the ticket's tries");
});
