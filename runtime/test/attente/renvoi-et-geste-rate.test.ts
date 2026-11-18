// Les deux autres issues du geste de WAITING par la cuisine (#3814) : un même renvoi sans attente hors de la cuisine n'est
// pas relancé une troisième fois tel quel, et un geste de WAITING que GitHub refuse laisse la question au manager.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { stationDuDepot, type Lancer } from "../../src/brigade-github.ts";
import { LABEL_WAITING } from "../../src/github-etat/etats.ts";
import type { GitHub } from "../../src/github.ts";
import { FauxGitHub, STATION_DU_DEPOT, depotNeuf, fauxClient } from "../faux-github.ts";

test("handed back twice with the same plain reason, no date: not relaunched a third time, and the reason is said on one line", async () => {
  const faux = new FauxGitHub();
  faux.feu(7);
  const motif = "The settings page still shows the old menu: remove it.";
  const a = faux.station("A", { juger: async () => ({ verdict: "request-changes", motif }), avertir: () => {}, maintenant: () => new Date("2026-11-18T09:00:00Z") });
  for (let tour = 0; tour < 12; tour += 1) {
    await a.tour();
    await a.calme();
  }
  // La station le met de côté avec sa raison ; la relance de la guérison (guerison/relance.ts, #2750), qui le rend à un
  // cook avec les points à réparer et ses propres plafonds, est un autre chemin : seuls les cooks d'avant comptent.
  const corps = (faux.commentaires.get(7) ?? []).map((c) => c.body);
  const relance = corps.findIndex((texte) => texte.startsWith("<!-- brigade:relance"));
  const avant = relance === -1 ? corps : corps.slice(0, relance);
  assert.equal(avant.filter((texte) => texte.startsWith("<!-- brigade:prise")).length, 2, corps.join("\n---\n"));
  assert.equal(faux.ticket(7).labels.has(LABEL_WAITING), false, "no wait outside the kitchen: not WAITING");
  const ecarte = avant.find((texte) => texte.includes("Set aside by its failure count"));
  assert.ok(ecarte !== undefined, corps.join("\n---\n"));
  assert.ok(ecarte.split("\n").some((ligne) => ligne.includes(`handed back twice in a row with the same result — the review requested changes: ${motif.replace(/\.$/, "")}:`)), ecarte);
});

test("a cook that says it cannot be done yet, but whose WAITING comment GitHub refuses: no `waiting` left, the question goes to the manager, and the station says why", async (t) => {
  const repertoire = mkdtempSync(join(tmpdir(), "geste-rate-"));
  t.after(() => rmSync(repertoire, { recursive: true, force: true }));
  const faux = new FauxGitHub();
  faux.feu(20, ["fire", "model:opus", "effort:medium"], "## Context\n\nThe dashboard's second screen.");
  const client = fauxClient(faux);
  const commenter = client.commenter.bind(client);
  const lancer: Lancer = ({ args, flux }) => {
    const consulte = args.some((arg) => arg.includes("consult"));
    const message = consulte ? "Done.\n<livrable>\nNothing.\n</livrable>" : "I stopped.\n<livrable>\n<bloque>Too early: this cannot be done before 2026-11-25.</bloque>\n</livrable>";
    writeFileSync(flux, `${JSON.stringify({ type: "result", is_error: false, result: message })}\n`);
    return { fin: Promise.resolve({ code: 0, signal: null, turns: 10, tokens: 1, durationMs: 1, arret: null, erreur: null }) };
  };
  const dits: string[] = [];
  const ouverte = stationDuDepot({
    ...STATION_DU_DEPOT,
    github: { ...client, commenter: async (numero: number, corps: string) => (corps.startsWith("<!-- brigade:waiting") ? Promise.reject(new Error("HTTP 502")) : commenter(numero, corps)) } as GitHub,
    depot: depotNeuf(repertoire),
    manager: () => ({ model: "opus", effort: "high" }),
    flux: repertoire,
    lancer,
    avertir: (ligne) => void dits.push(ligne),
    maintenant: () => new Date("2026-11-18T09:00:00Z"),
  });
  if ("refus" in ouverte) throw new Error(ouverte.refus);
  await ouverte.tour();
  await ouverte.calme();
  assert.equal(faux.ticket(20).labels.has(LABEL_WAITING), false);
  assert.ok(dits.some((ligne) => /#20 .*could not be put in WAITING: its question goes to the manager — .*HTTP 502/.test(ligne)), dits.join("\n"));
});
