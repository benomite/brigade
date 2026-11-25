// Les deux autres issues du parking par la cuisine (#3814, #4129) : un même renvoi sans attente hors de la cuisine n'est
// pas relancé une troisième fois tel quel, et un parking que GitHub refuse laisse la question au manager.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { stationDuDepot, type Lancer } from "../../src/brigade-github.ts";
import { attenteDeLIssue } from "../../src/attente-github/attente-github.ts";
import { LABEL_PARKED } from "../../src/github-etat/etats.ts";
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
  // La station le parque par ses échecs avec sa raison, pour le superviseur, et rien ne le remet sur le rail (#3911,
  // #4129) : seuls les cooks d'avant comptent.
  const corps = (faux.commentaires.get(7) ?? []).map((c) => c.body);
  const avant = corps;
  assert.equal(avant.filter((texte) => texte.startsWith("<!-- brigade:prise")).length, 2, corps.join("\n---\n"));
  // Aucune attente hors de la cuisine : il est parqué par ses échecs, et c'est le superviseur qu'il attend.
  assert.equal(faux.ticket(7).labels.has(LABEL_PARKED), true, [...faux.ticket(7).labels].join(", "));
  const attente = attenteDeLIssue((faux.commentaires.get(7) ?? []).map((c) => ({ body: c.body, association: c.association })));
  assert.equal(attente?.who, "the supervisor", corps.join("\n---\n"));
  assert.equal(attente?.failures, true);
  assert.equal(attente?.fact, "the supervisor answers");
  const ecarte = avant.find((texte) => texte.includes("Parked (`parked`) by its failure count"));
  assert.ok(ecarte !== undefined, corps.join("\n---\n"));
  assert.ok(ecarte.split("\n").some((ligne) => ligne.includes(`handed back twice in a row with the same result — the review requested changes: ${motif.replace(/\.$/, "")}:`)), ecarte);
});

test("a cook that says it cannot be done yet, but whose parking comment GitHub refuses: no `parked` left, the question goes to the manager, and the station says why", async (t) => {
  const repertoire = mkdtempSync(join(tmpdir(), "geste-rate-"));
  t.after(() => rmSync(repertoire, { recursive: true, force: true }));
  const faux = new FauxGitHub();
  faux.feu(20, ["fire", "model:opus", "effort:medium"], "## Context\n\nThe dashboard's second screen.");
  const client = fauxClient(faux);
  const commenter = client.commenter.bind(client);
  // Le manager consulté sur le blocage d'un cook tourne sous le run `blocage-<numéro>`.
  const consultations: string[] = [];
  const lancer: Lancer = ({ args, flux }) => {
    if (flux.includes("blocage-20")) consultations.push(flux);
    const consulte = args.some((arg) => arg.includes("consult")) || flux.includes("blocage-");
    const message = consulte ? "Done.\n<livrable>\nNothing.\n</livrable>" : "I stopped.\n<livrable>\n<bloque>Too early: this cannot be done before 2026-11-25.</bloque>\n</livrable>";
    writeFileSync(flux, `${JSON.stringify({ type: "result", is_error: false, result: message })}\n`);
    return { fin: Promise.resolve({ code: 0, signal: null, turns: 10, tokens: 1, durationMs: 1, arret: null, erreur: null }) };
  };
  const dits: string[] = [];
  const ouverte = stationDuDepot({
    ...STATION_DU_DEPOT,
    github: { ...client, commenter: async (numero: number, corps: string) => (corps.startsWith("<!-- brigade:parked") ? Promise.reject(new Error("HTTP 502")) : commenter(numero, corps)) } as GitHub,
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
  assert.equal(faux.ticket(20).labels.has(LABEL_PARKED), false);
  assert.ok(dits.some((ligne) => /#20 .*the ticket could not be parked: its question goes to the manager — .*HTTP 502/.test(ligne)), dits.join("\n"));
  assert.equal(consultations.length, 1, "the manager is consulted on the cook's question");
  assert.ok(!dits.some((ligne) => /#20 .*the ticket is parked/.test(ligne)), dits.join("\n"));
});

test("handed back twice with the same wait in other words, the same date: not relaunched a third time, it is parked", async () => {
  const faux = new FauxGitHub();
  faux.feu(7);
  const motifs = ["Too early: this can only be done from 2026-11-25.", "Still too early, the partner's API opens on 2026-11-25: it cannot be done before."];
  let jugees = 0;
  const a = faux.station("A", { juger: async () => ({ verdict: "request-changes", motif: motifs[Math.min(jugees++, 1)] ?? "" }), avertir: () => {}, maintenant: () => new Date("2026-11-18T09:00:00Z") });
  for (let tour = 0; tour < 12; tour += 1) {
    await a.tour();
    await a.calme();
  }
  assert.equal(faux.cuissons.filter(({ issue }) => issue === 7).length, 2);
  assert.equal(faux.ticket(7).labels.has(LABEL_PARKED), true, [...faux.ticket(7).labels].join(", "));
  // Parqué pour sa date, non pour ses échecs : `parked` seul ne les distingue plus, sa marque le dit.
  const attente = attenteDeLIssue((faux.commentaires.get(7) ?? []).map((c) => ({ body: c.body, association: c.association })));
  assert.equal(attente?.followUp, "2026-11-25T00:00:00.000Z");
  assert.equal(attente?.failures, undefined);
});
