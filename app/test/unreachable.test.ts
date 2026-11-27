// La box qui ne répond pas (#728) : une seule ligne, pas quatre « non vérifié » ; elle n'apparaît
// qu'après deux lectures ratées de suite, et disparaît dès que la box répond. Le rail garde sa
// dernière lecture, et les tickets `fire` se lisent sur GitHub, sans la box.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { causeOfSilence, READS_FOR_UNREACHABLE, signalOf, holdBands } from "../src/alerts.ts";
import type { Reading } from "../src/box.ts";
import { ticketsOf } from "../src/fire.ts";

const silentOne = (message: string, a: string): Reading => ({ projet: "parade", demande: 1, a, erreur: `$ brigade parade facts\n${message}\n→ exit code 1`, atteinte: false, cas: null });
const SILENCE = "connect to host box port 22: Connection timed out during banner exchange";
const MANAGER_OK: Reading = { projet: "parade", demande: 1, a: "2026-10-15T10:00:00.000Z", sorties: [{ commande: "manager", texte: "manager    ALLUMÉ\n" }] };

describe("box injoignable (#728)", () => {
  test("une seule lecture ratée ne suffit pas, deux disent une seule ligne qui couvre les états non lus", () => {
    const bands = holdBands();
    bands.ouvrir(["parade"]);
    assert.equal(READS_FOR_UNREACHABLE, 2);
    const first = bands.faits(silentOne(SILENCE, "2026-10-15T10:00:00.000Z"));
    assert.ok(first.alertes.every(({ sujet: subject }) => subject !== "injoignable"));
    // Le manager et `status` ratés dans la même minute ne comptent pas pour des lectures de plus.
    bands.manager(silentOne(SILENCE, "2026-10-15T10:00:01.000Z"));
    assert.ok(bands.status({ projet: "parade", demande: 1, a: "2026-10-15T10:00:02.000Z", erreur: "$ brigade parade status\n→ exit code 1", atteinte: false, cas: null }).alertes.every(({ sujet: subject }) => subject !== "injoignable"));
    const band = bands.faits(silentOne(SILENCE, "2026-10-15T10:01:30.000Z"));
    assert.equal(band.alertes.length, 1);
    const [line] = band.alertes;
    assert.equal(line?.sujet, "injoignable");
    assert.match(line?.dit ?? "", /^station unreachable since \d\d:\d\d, 1 min ago — the state of the kitchen has been unknown since then$/);
    assert.match(line?.pourquoi ?? "", /^no answer/);
    assert.deepEqual(line?.consignes, ["check that the machine is on and reachable", "restart it if it no longer answers", "then try again"]);
    assert.match(line?.geste ?? "", /try again/);
    assert.match(line?.geste ?? "", /machine at its host/);
    assert.deepEqual(line?.appel, { relire: true });
    assert.equal(band.signal?.etat, "injoignable");
  });

  test("elle disparaît dès que la box répond, et le compte repart de zéro", () => {
    const bands = holdBands();
    bands.faits(silentOne(SILENCE, "2026-10-15T10:00:00.000Z"));
    assert.equal(bands.faits(silentOne(SILENCE, "2026-10-15T10:00:30.000Z")).signal?.etat, "injoignable");
    // Une lecture du manager qui aboutit : la box répond.
    assert.ok(bands.manager(MANAGER_OK).alertes.every(({ sujet: subject }) => subject !== "injoignable"));
    assert.ok(bands.faits(silentOne(SILENCE, "2026-10-15T10:01:00.000Z")).alertes.every(({ sujet: subject }) => subject !== "injoignable"));
  });

  test("la cause se dit en mots simples", () => {
    assert.match(causeOfSilence(SILENCE), /^no answer/);
    assert.match(causeOfSilence("connect to host box port 22: Connection refused"), /^connection refused/);
    assert.match(causeOfSilence("Could not resolve hostname box: Name or service not known"), /^address not found/);
  });

  test("le signal de la pastille dit « injoignable », avant tout autre", () => {
    const signal = signalOf([{ sujet: "injoignable", verifie: true, ton: "rouge", dit: "station unreachable for 1 min", geste: "g", prix: "p" }]);
    assert.equal(signal?.etat, "injoignable");
  });
});

describe("les tickets fire lus sur GitHub (#728)", () => {
  test("titre, numéro et priorité, les plus prioritaires d'abord", () => {
    const output = JSON.stringify([
      { number: 12, title: "B", labels: [{ name: "fire" }, { name: "prio:p1" }] },
      { number: 7, title: "A", labels: [{ name: "fire" }, { name: "prio:p0" }] },
      { number: 3, title: "C", labels: [{ name: "fire" }] },
    ]);
    assert.deepEqual(ticketsOf(output), [
      { ticket: 7, titre: "A", prio: "p0" },
      { ticket: 12, titre: "B", prio: "p1" },
      { ticket: 3, titre: "C" },
    ]);
  });

  test("une sortie qui n'a pas la forme est dite, jamais lue comme vide", () => {
    assert.equal(typeof ticketsOf("pas du json"), "string");
    assert.equal(typeof ticketsOf("{}"), "string");
  });
});
