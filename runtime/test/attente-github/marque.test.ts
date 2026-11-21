// #3761 : ce qu'une issue en WAITING attend se relit de sa marque sans import lourd — la lecture du rail de l'app la lit
// aussi : la marque la plus récente d'un auteur du dépôt, complète, et rien d'autre.
import assert from "node:assert/strict";
import { test } from "node:test";
import { attenteDeLIssue, DE_CONFIANCE } from "../../src/attente-github/marque.ts";

const marque = (attente: Record<string, unknown>) => `<!-- brigade:waiting ${JSON.stringify(attente)} -->\n**WAITING**`;
const COMPLETE = { what: "the answer", who: "a collaborator", followUp: "2026-11-24T09:00:00.000Z" };

test("la marque la plus récente d'un auteur du dépôt, et sa rentrée à la relance quand la cuisine l'a posée", () => {
  assert.deepEqual(DE_CONFIANCE, ["OWNER", "MEMBER", "COLLABORATOR"]);
  assert.deepEqual(attenteDeLIssue([{ body: marque({ ...COMPLETE, who: "the bank" }), association: "OWNER" }, { body: marque(COMPLETE), association: "COLLABORATOR" }]), COMPLETE);
  assert.deepEqual(attenteDeLIssue([{ body: marque({ ...COMPLETE, backOnFollowUp: true }), association: "OWNER" }]), { ...COMPLETE, backOnFollowUp: true });
  assert.deepEqual(attenteDeLIssue([{ body: marque({ ...COMPLETE, backOnFollowUp: "yes" }), association: "OWNER" }]), COMPLETE);
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
