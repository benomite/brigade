// La box qui ne répond pas (#728) : une seule ligne, pas quatre « non vérifié » ; elle n'apparaît
// qu'après deux lectures ratées de suite, et disparaît dès que la box répond. Le rail garde sa
// dernière lecture, et les tickets `fire` se lisent sur GitHub, sans la box.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { causeDuSilence, LECTURES_POUR_INJOIGNABLE, signalDe, tenirBandes } from "../src/alertes.ts";
import type { Lecture } from "../src/box.ts";
import { ticketsDe } from "../src/feu.ts";

const ssh = (message: string, a: string): Lecture => ({ projet: "parade", demande: 1, a, erreur: `$ ssh box brigade parade facts\n${message}\n→ exit code 255`, atteinte: false, cas: "ssh-en-echec" });
const SILENCE = "ssh: connect to host box port 22: Connection timed out during banner exchange";
const MANAGER_OK: Lecture = { projet: "parade", demande: 1, a: "2026-10-15T10:00:00.000Z", sorties: [{ commande: "manager", texte: "manager    ALLUMÉ\n" }] };

describe("box injoignable (#728)", () => {
  test("une seule lecture ratée ne suffit pas, deux disent une seule ligne qui couvre les états non lus", () => {
    const bandes = tenirBandes();
    bandes.ouvrir(["parade"]);
    assert.equal(LECTURES_POUR_INJOIGNABLE, 2);
    const premiere = bandes.faits(ssh(SILENCE, "2026-10-15T10:00:00.000Z"));
    assert.ok(premiere.alertes.every(({ sujet }) => sujet !== "injoignable"));
    // Le manager et `status` ratés dans la même minute ne comptent pas pour des lectures de plus.
    bandes.manager(ssh(SILENCE, "2026-10-15T10:00:01.000Z"));
    assert.ok(bandes.status({ projet: "parade", demande: 1, a: "2026-10-15T10:00:02.000Z", erreur: "$ ssh box\n→ exit code 255", atteinte: false, cas: "ssh-en-echec" }).alertes.every(({ sujet }) => sujet !== "injoignable"));
    const bande = bandes.faits(ssh(SILENCE, "2026-10-15T10:01:30.000Z"));
    assert.equal(bande.alertes.length, 1);
    const [ligne] = bande.alertes;
    assert.equal(ligne?.sujet, "injoignable");
    assert.match(ligne?.dit ?? "", /^box unreachable for 1 min: the app knows nothing of the kitchen right now$/);
    assert.match(ligne?.pourquoi ?? "", /^no answer/);
    assert.match(ligne?.geste ?? "", /try again now/);
    assert.match(ligne?.geste ?? "", /machine at its host/);
    assert.deepEqual(ligne?.appel, { relire: true });
    assert.equal(bande.signal?.etat, "injoignable");
  });

  test("elle disparaît dès que la box répond, et le compte repart de zéro", () => {
    const bandes = tenirBandes();
    bandes.faits(ssh(SILENCE, "2026-10-15T10:00:00.000Z"));
    assert.equal(bandes.faits(ssh(SILENCE, "2026-10-15T10:00:30.000Z")).signal?.etat, "injoignable");
    // Une lecture du manager qui aboutit : la box répond.
    assert.ok(bandes.manager(MANAGER_OK).alertes.every(({ sujet }) => sujet !== "injoignable"));
    assert.ok(bandes.faits(ssh(SILENCE, "2026-10-15T10:01:00.000Z")).alertes.every(({ sujet }) => sujet !== "injoignable"));
  });

  test("la cause se dit en mots simples", () => {
    assert.match(causeDuSilence(SILENCE), /^no answer/);
    assert.match(causeDuSilence("ssh: connect to host box port 22: Connection refused"), /^connection refused/);
    assert.match(causeDuSilence("ssh: Could not resolve hostname box: Name or service not known"), /^address not found/);
  });

  test("le signal de la pastille dit « injoignable », avant tout autre", () => {
    const signal = signalDe([{ sujet: "injoignable", verifie: true, ton: "rouge", dit: "box unreachable for 1 min", geste: "g", prix: "p" }]);
    assert.equal(signal?.etat, "injoignable");
  });
});

describe("les tickets fire lus sur GitHub (#728)", () => {
  test("titre, numéro et priorité, les plus prioritaires d'abord", () => {
    const sortie = JSON.stringify([
      { number: 12, title: "B", labels: [{ name: "fire" }, { name: "prio:p1" }] },
      { number: 7, title: "A", labels: [{ name: "fire" }, { name: "prio:p0" }] },
      { number: 3, title: "C", labels: [{ name: "fire" }] },
    ]);
    assert.deepEqual(ticketsDe(sortie), [
      { ticket: 7, titre: "A", prio: "p0" },
      { ticket: 12, titre: "B", prio: "p1" },
      { ticket: 3, titre: "C" },
    ]);
  });

  test("une sortie qui n'a pas la forme est dite, jamais lue comme vide", () => {
    assert.equal(typeof ticketsDe("pas du json"), "string");
    assert.equal(typeof ticketsDe("{}"), "string");
  });
});
