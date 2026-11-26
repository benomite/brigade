// #3761, #4129 : ce qu'une issue parquée attend se relit de sa marque sans import lourd — la lecture du rail de l'app la
// lit aussi : la marque la plus récente d'un auteur du dépôt, complète, et rien d'autre. La marque d'avant #4129
// (`brigade:waiting`) se lit encore.
import assert from "node:assert/strict";
import { test } from "node:test";
import { attenteDeLIssue, corpsDuParking, DE_CONFIANCE, reprendALaDate } from "../../src/attente-github/marque.ts";

const marque = (attente: Record<string, unknown>) => `<!-- brigade:waiting ${JSON.stringify(attente)} -->\n**WAITING**`;
const COMPLETE = { what: "the answer", who: "a collaborator", followUp: "2026-11-24T09:00:00.000Z" };

test("la marque la plus récente d'un auteur du dépôt, et ses échecs quand la station l'a parqué pour eux", () => {
  assert.deepEqual(DE_CONFIANCE, ["OWNER", "MEMBER", "COLLABORATOR"]);
  assert.deepEqual(attenteDeLIssue([{ body: marque({ ...COMPLETE, who: "the bank" }), association: "OWNER" }, { body: marque(COMPLETE), association: "COLLABORATOR" }]), COMPLETE);
  assert.deepEqual(attenteDeLIssue([{ body: corpsDuParking({ ...COMPLETE, failures: true }), association: "OWNER" }]), { ...COMPLETE, failures: true });
  assert.deepEqual(attenteDeLIssue([{ body: marque({ ...COMPLETE, failures: "yes" }), association: "OWNER" }]), COMPLETE);
  // La marque d'avant #4129 d'un ticket mis de côté par ses échecs : il attend toujours pour eux.
  assert.deepEqual(attenteDeLIssue([{ body: marque({ ...COMPLETE, whileSetAside: true, backOnFollowUp: true }), association: "OWNER" }]), { ...COMPLETE, failures: true });
});

test("la marque du parking : qui, pour quoi, jusqu'à une date ou un fait ; seule une date le fait reprendre seul", () => {
  const corps = corpsDuParking({ ...COMPLETE, fact: "the bank answers" });
  assert.match(corps, /^<!-- brigade:parked \{.*\} -->\n\*\*PARKED: waits for a collaborator\.\*\* the answer\n/);
  assert.match(corps, /^- \*\*until\*\*: the bank answers$/m);
  assert.deepEqual(attenteDeLIssue([{ body: corps, association: "OWNER" }]), { ...COMPLETE, fact: "the bank answers" });
  assert.equal(reprendALaDate({ ...COMPLETE, fact: "the bank answers" }, new Date("2026-12-01T00:00:00Z")), false);
  assert.equal(reprendALaDate(COMPLETE, new Date("2026-11-24T08:59:59Z")), false);
  assert.equal(reprendALaDate(COMPLETE, new Date("2026-11-24T09:00:00Z")), true);
  // Un `-->` des mots du chef ne ferme pas la marque.
  assert.deepEqual(attenteDeLIssue([{ body: corpsDuParking({ ...COMPLETE, what: "a --> b" }), association: "OWNER" }]), { ...COMPLETE, what: "a --> b" });
});

test("une marque d'un inconnu, sans marque, incomplète ou illisible ne dit rien : la précédente, ou rien", () => {
  const avant = { body: marque(COMPLETE), association: "OWNER" };
  assert.equal(attenteDeLIssue([{ body: marque(COMPLETE), association: "NONE" }]), null);
  assert.equal(attenteDeLIssue([{ body: "no mark", association: "OWNER" }]), null);
  for (const incomplete of [{ ...COMPLETE, what: 3 }, { ...COMPLETE, who: null }, { ...COMPLETE, followUp: 7 }, { ...COMPLETE, followUp: "someday" }]) {
    assert.equal(attenteDeLIssue([{ body: marque(incomplete), association: "OWNER" }]), null, JSON.stringify(incomplete));
  }
  assert.deepEqual(attenteDeLIssue([avant, { body: "<!-- brigade:waiting {not json} -->", association: "OWNER" }]), COMPLETE);
});
