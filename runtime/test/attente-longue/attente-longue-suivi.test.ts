// #3764 : ce que le suivi des attentes longues fait quand une lecture manque, quand la station n'a pas de manager,
// après un redémarrage, et après la réponse du chef. Et, par la station, une attente de la fiche sur un ticket mis
// de côté, que le manager lève.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { lireRevue, suiviDesAttentesLongues } from "../../src/attente-longue/attente-longue.ts";
import { A_LA_MAIN, stationDuDepot, type Lancer } from "../../src/brigade-github.ts";
import { FauxGitHub, STATION_DU_DEPOT, depotNeuf, fauxClient } from "../faux-github.ts";

const A = 10;
const B = 20;
const MIN = 60_000;
type GitHubDeLAttenteLongue = Parameters<typeof suiviDesAttentesLongues>[0]["github"];
type ReponseDeLaRevue = ReturnType<typeof lireRevue>;

// Un GitHub en mémoire pour #B, dont la lecture des commentaires peut échouer.
function github(commentaires: string[] = []) {
  const ecrits = commentaires;
  const labels: string[] = [];
  let enPanne = false;
  let lectures = 0;
  const client: GitHubDeLAttenteLongue = {
    commentaires: async () => {
      lectures += 1;
      if (enPanne) throw new Error("GitHub is down");
      return ecrits.map((body) => ({ body }));
    },
    corpsDuTicket: async () => `Depends on #${A}.`,
    commenter: async (_numero, corps) => {
      ecrits.push(corps);
    },
    labelliser: async (_numero, poses) => {
      labels.push(...poses);
    },
  };
  return { client, ecrits, labels, panne: (oui: boolean) => (enPanne = oui), lectures: () => lectures };
}

function suivi(gh: ReturnType<typeof github>, revoir?: () => Promise<ReponseDeLaRevue>) {
  let maintenant = 0;
  const revues: number[] = [];
  const avertis: string[] = [];
  const s = suiviDesAttentesLongues({ github: gh.client, station: "box", label: A_LA_MAIN, ...(revoir === undefined ? {} : { revoir: async () => (revues.push(maintenant), revoir()) }), maintenant: () => maintenant, avertir: (texte) => avertis.push(texte) });
  const tour = async (minutes: number, libre = true) => {
    maintenant = minutes * MIN;
    s.tour(libre ? [B] : []);
    if (libre) s.tenu({ number: B, title: "B" }, [A]);
    await s.calme();
  };
  return { tour, revues, avertis };
}

test("a station with no manager still writes, at the hour, what the ticket waits for and that the station decided it", async () => {
  const gh = github();
  const s = suivi(gh);
  for (const minutes of [0, 61, 62, 120]) await s.tour(minutes);
  assert.equal(gh.ecrits.length, 1, gh.ecrits.join("\n---\n"));
  assert.match(gh.ecrits[0] ?? "", /#10: decided by the station/);
  assert.match(gh.ecrits[0] ?? "", /no manager runs on this station/);
});

test("an issue that cannot be read at the hour says nothing and blocks nothing: the next turn reviews the wait", async () => {
  const gh = github();
  const s = suivi(gh, async () => ({ revue: { issue: "garde", commentaire: "Kept: it is real." } }));
  await s.tour(0);
  gh.panne(true);
  await s.tour(61);
  assert.deepEqual(s.revues, []);
  assert.equal(gh.ecrits.length, 0);
  assert.match(s.avertis.join("\n"), /could not be reviewed: GitHub is down; retried next turn/);
  gh.panne(false);
  await s.tour(62);
  assert.equal(s.revues.length, 1);
  assert.equal(gh.ecrits.length, 1);
});

test("a wait already reviewed on the issue — by a station before it restarted — does not go back to the manager", async () => {
  const gh = github();
  const avant = suivi(gh, async () => ({ revue: { issue: "garde", commentaire: "Kept." } }));
  await avant.tour(0);
  await avant.tour(61);
  assert.equal(avant.revues.length, 1);
  const apres = suivi(gh, async () => ({ revue: { issue: "garde", commentaire: "Kept again." } }));
  for (const minutes of [0, 61, 62, 200]) await apres.tour(minutes);
  assert.deepEqual(apres.revues, []);
  assert.equal(gh.ecrits.length, 1);
});

test("once the chef has answered the product question and the ticket is back on the rail, the manager reviews the wait again, without waiting another hour", async () => {
  const gh = github();
  let reponse: ReponseDeLaRevue = { revue: { issue: "produit", question: "Ship without the palette?" } };
  const s = suivi(gh, async () => reponse);
  await s.tour(0);
  await s.tour(61);
  assert.deepEqual(gh.labels, [A_LA_MAIN]);
  // `blocked-on-human` : le ticket n'est plus libre.
  await s.tour(62, false);
  gh.ecrits.push("Ship it without the palette.");
  reponse = { revue: { issue: "leve", commentaire: "Lifted: the chef said to ship without the palette." } };
  await s.tour(70);
  assert.deepEqual(s.revues, [61 * MIN, 70 * MIN]);
  assert.match(gh.ecrits.at(-1) ?? "", /^<!-- brigade:attente-levee #10 -->/);
});

test("a mark of the wait with an outcome the station does not know is no review: the manager still reviews the wait at the hour", async () => {
  const gh = github([`<!-- brigade:attente-longue ligne #${A} -->`, `Quoted: <!-- brigade:attente-longue #${A} -->`]);
  const s = suivi(gh, async () => ({ revue: { issue: "garde", commentaire: "Kept: it is real." } }));
  for (const minutes of [0, 61, 62]) await s.tour(minutes);
  assert.deepEqual(s.revues, [61 * MIN]);
  assert.match(gh.ecrits.at(-1) ?? "", /<!-- brigade:attente-longue garde #10 -->$/);
});

test("the same wait named in another order is the same wait: before the hour, the issue is read once", async () => {
  const gh = github();
  let maintenant = 0;
  const s = suiviDesAttentesLongues({ github: gh.client, station: "box", label: A_LA_MAIN, revoir: async () => ({ revue: { issue: "garde", commentaire: "Kept." } }), maintenant: () => maintenant, avertir: () => {} });
  for (const [minutes, attendus] of [[0, [A, 30]], [1, [30, A]], [2, [A, 30]], [3, [30, A]]] as const) {
    maintenant = minutes * MIN;
    s.tour([B]);
    s.tenu({ number: B, title: "B" }, attendus);
    await s.calme();
  }
  assert.equal(gh.lectures(), 1);
});

test("the manager is told how long the ticket has waited", async () => {
  const gh = github();
  const attentes: number[] = [];
  let maintenant = 1_000 * MIN;
  const s = suiviDesAttentesLongues({ github: gh.client, station: "box", label: A_LA_MAIN, revoir: async (_ticket, { depuisMs }) => (attentes.push(depuisMs), { revue: { issue: "garde", commentaire: "Kept." } }), maintenant: () => maintenant, avertir: () => {} });
  for (const minutes of [0, 30, 75]) {
    maintenant = (1_000 + minutes) * MIN;
    s.tour([B]);
    s.tenu({ number: B, title: "B" }, [A]);
    await s.calme();
  }
  assert.deepEqual(attentes, [75 * MIN]);
});

test("an answer of the manager that does not read is no decision", () => {
  assert.deepEqual(lireRevue("I could not decide."), { illisible: "no JSON object in the answer" });
  assert.deepEqual(lireRevue('{"issue": "leve"}'), { illisible: "`leve` with no `commentaire`" });
  assert.deepEqual(lireRevue('{"issue": "produit"}'), { illisible: "a product question with no `question`" });
  assert.match((lireRevue('{"issue": "design", "question": "?"}') as { illisible: string }).illisible, /unknown outcome/);
});

test("through the station: a ticket whose sheet waits for a ticket set aside starts once the manager lifts that wait", async (t) => {
  const repertoire = mkdtempSync(join(tmpdir(), "attente-longue-"));
  t.after(() => rmSync(repertoire, { recursive: true, force: true }));
  const faux = new FauxGitHub();
  faux.feu(A, ["fire", "model:opus", "effort:medium", A_LA_MAIN], "The base.");
  faux.feu(B, ["fire", "model:opus", "effort:medium"], "## Context\n\nA ticket.");
  faux.poster(B, "manager", `<!-- brigade:fiche -->\n- awaiting: #${A}\n- zone: src/b.ts`);
  let cooks = 0;
  let consultations = 0;
  let maintenant = Date.parse("2026-11-17T10:00:00Z");
  const debut = maintenant;
  const lancer: Lancer = ({ args, flux }) => {
    const consulte = args[args.indexOf("--tools") + 1] === "Read,Grep,Glob";
    if (consulte) consultations += 1;
    else cooks += 1;
    const message = consulte ? JSON.stringify({ issue: "leve", commentaire: "Lifted: #20 does not need #10." }) : "Done.\n<livrable>\nNothing.\n</livrable>";
    writeFileSync(flux, `${JSON.stringify({ type: "result", is_error: false, result: message })}\n`);
    return { fin: Promise.resolve({ code: consulte ? 0 : 1, signal: null, turns: 10, tokens: 1, durationMs: 1, arret: null, erreur: null }) };
  };
  const station = stationDuDepot({ ...STATION_DU_DEPOT, github: fauxClient(faux), depot: depotNeuf(repertoire), manager: () => ({ model: "opus", effort: "high" }), flux: repertoire, lancer, avertir: () => {}, maintenant: () => new Date(maintenant) });
  if ("refus" in station) throw new Error(station.refus);
  for (const minutes of [0, 30, 61, 62]) {
    maintenant = debut + minutes * MIN;
    await station.tour();
    await station.calme();
  }
  assert.equal(consultations, 1);
  assert.ok(cooks >= 1, "the lifted wait no longer holds the ticket");
});

test("through the station: the manager reads the awaited ticket and how long the wait has held", async (t) => {
  const repertoire = mkdtempSync(join(tmpdir(), "attente-longue-"));
  t.after(() => rmSync(repertoire, { recursive: true, force: true }));
  const faux = new FauxGitHub();
  faux.feu(A, ["fire", "model:opus"], "The new palette.");
  faux.feu(B, ["fire", "model:opus", "effort:medium"], `## Context\n\nDepends on #${A}.`);
  const consignes: string[] = [];
  let maintenant = Date.parse("2026-11-17T10:00:00Z");
  const debut = maintenant;
  const lancer: Lancer = ({ args, flux }) => {
    const consulte = args[args.indexOf("--tools") + 1] === "Read,Grep,Glob";
    if (consulte) consignes.push(args[args.indexOf("-p") + 1] ?? "");
    const message = consulte ? JSON.stringify({ issue: "garde", commentaire: "Kept: #20 builds on the palette." }) : "Done.\n<livrable>\nNothing.\n</livrable>";
    writeFileSync(flux, `${JSON.stringify({ type: "result", is_error: false, result: message })}\n`);
    return { fin: Promise.resolve({ code: consulte ? 0 : 1, signal: null, turns: 10, tokens: 1, durationMs: 1, arret: null, erreur: null }) };
  };
  const station = stationDuDepot({ ...STATION_DU_DEPOT, github: fauxClient(faux), depot: depotNeuf(repertoire), manager: () => ({ model: "opus", effort: "high" }), flux: repertoire, lancer, avertir: () => {}, maintenant: () => new Date(maintenant) });
  if ("refus" in station) throw new Error(station.refus);
  for (const minutes of [0, 30, 121]) {
    maintenant = debut + minutes * MIN;
    await station.tour();
    await station.calme();
  }
  assert.equal(consignes.length, 1);
  assert.match(consignes[0] ?? "", /depuis plus de 2 h/);
  assert.match(consignes[0] ?? "", /<attendu numero="10">\n#10 — .*\nLabels : fire, model:opus\n\nThe new palette\.\n<\/attendu>/);
});
