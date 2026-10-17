// Ce que la mise à jour a donné, relayé au journal de chaque projet de la
// station, et dit par la file : « switched to version X at 14:02 », ou le
// retour en arrière d'une version qui n'a pas démarré.
import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { decrireAttentes, passageEnService } from "../../src/attend.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { heureEnClairEn } from "../../src/mise-a-jour/dire.ts";
import { noterIssue } from "../../src/mise-a-jour/etat.ts";
import { brancherMiseAJour, miseAJourDuJour, relayer } from "../../src/mise-a-jour/relais.ts";
import { demarrer } from "../../src/runtime.ts";
import { jusqua, repertoireTemporaire } from "../outils.ts";

const MAINTENANT = new Date("2026-10-15T14:30:00.000Z");
const PASSEE = { quoi: "passee", version: "1.1.0", depuis: "1.0.0", le: "2026-10-15T14:02:10.000Z" } as const;
const REVENUE = { quoi: "revenue", visee: "1.2.0", restauree: "1.1.0", motif: "la station s'est arrêtée en échec en 1.2.0 (systemd : failed)", le: "2026-10-15T14:20:00.000Z", retour: null } as const;

test("chaque issue est recopiée une fois au journal du projet, quel que soit le nombre de relectures ; une issue de plus d'une semaine ne l'est pas", (t) => {
  const dossier = repertoireTemporaire(t);
  const journal = ouvrirJournal(repertoireTemporaire(t));
  t.after(() => journal.fermer());
  noterIssue(dossier, { ...PASSEE, version: "0.9.0", le: "2026-10-01T10:00:00.000Z" });
  noterIssue(dossier, PASSEE);
  const runtime = { projet: "brigade", journal };
  assert.equal(relayer(runtime, dossier, MAINTENANT), 1);
  assert.equal(relayer(runtime, dossier, MAINTENANT), 0);
  noterIssue(dossier, REVENUE);
  assert.equal(relayer(runtime, dossier, MAINTENANT), 1);
  assert.deepEqual(
    journal.tout().map(({ type, payload, author, ticket }) => ({ type, payload, author, ticket })),
    [
      { type: "update.installed", payload: { version: "1.1.0", previous: "1.0.0", at: PASSEE.le }, author: "runtime", ticket: null },
      { type: "update.reverted", payload: { target: "1.2.0", restored: "1.1.0", reason: REVENUE.motif, at: REVENUE.le, restoreFailed: null }, author: "runtime", ticket: null },
    ],
  );
});

test("la file dit la dernière mise à jour, le jour même : le passage, puis le retour en arrière qui l'a suivi", (t) => {
  const dossier = repertoireTemporaire(t);
  const journal = ouvrirJournal(repertoireTemporaire(t));
  t.after(() => journal.fermer());
  const runtime = { projet: "brigade", journal };
  assert.equal(passageEnService(journal.base, MAINTENANT), null);

  noterIssue(dossier, PASSEE);
  relayer(runtime, dossier, MAINTENANT);
  const passage = passageEnService(journal.base, MAINTENANT);
  assert.deepEqual(passage, { le: PASSEE.le, ligne: `switched to version 1.1.0 at ${heureEnClairEn(PASSEE.le)}` });
  assert.deepEqual(decrireAttentes([], () => "1 min", null, passage), ["awaiting   nothing awaits the chef", `  switched to version 1.1.0 at ${heureEnClairEn(PASSEE.le)}`, "end awaiting", ""]);

  noterIssue(dossier, REVENUE);
  relayer(runtime, dossier, MAINTENANT);
  assert.equal(
    passageEnService(journal.base, MAINTENANT)?.ligne,
    `update to version 1.2.0 failed at ${heureEnClairEn(REVENUE.le)}: la station s'est arrêtée en échec en 1.2.0 (systemd : failed) — back on version 1.1.0; 1.2.0 is not retried, the next one will be`,
  );
  noterIssue(dossier, { ...REVENUE, le: "2026-10-15T14:25:00.000Z", retour: "son installation a échoué : apt-get a rendu 100" });
  relayer(runtime, dossier, MAINTENANT);
  assert.match(miseAJourDuJour(journal.base, MAINTENANT)?.ligne ?? "", /— going back to version 1\.1\.0 failed too: son installation a échoué : apt-get a rendu 100$/);

  // Le lendemain, la file ne le dit plus.
  assert.equal(miseAJourDuJour(journal.base, new Date("2026-10-16T14:26:00.000Z")), null);
});

test("branché sur la cuisine d'un projet, le relais recopie dès qu'une issue est notée ; la cuisine arrêtée, il s'arrête avec elle", async (t) => {
  const dossier = join(repertoireTemporaire(t), "mise-a-jour");
  const runtime = brancherMiseAJour(demarrer({ repertoireEtat: repertoireTemporaire(t), projet: "brigade" }), dossier, () => {}, 5);
  let arrete = false;
  t.after(() => void (arrete || runtime.arreter("fin")));
  const relayes = () => runtime.journal.tout().filter((e) => e.type.startsWith("update.")).length;
  assert.equal(relayes(), 0);
  noterIssue(dossier, { ...PASSEE, le: new Date().toISOString() });
  await jusqua(() => relayes() === 1);
  runtime.arreter("fin");
  arrete = true;
});

test("sans répertoire de mise à jour, rien n'est branché", (t) => {
  const socle = demarrer({ repertoireEtat: repertoireTemporaire(t), projet: "brigade" });
  t.after(() => socle.arreter("fin"));
  assert.equal(brancherMiseAJour(socle, null), socle);
});
