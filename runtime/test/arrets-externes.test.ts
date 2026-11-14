import assert from "node:assert/strict";
import { test } from "node:test";
import { reconcilierLesArretsExternes } from "../src/arrets-externes.ts";

const echec143 = "<!-- brigade:echec n=1 -->\nStation `A`: the cook stopped without a delivery — claude ended in error (exit code 143; claude wrote nothing)\n\nTaken off the kitchen (`served-elsewhere`) after 3 cooks without a delivery: a human decides.";

test("a ticket whose comments cannot be read stays set aside, is said, and the reconciliation is not complete (#3528)", async () => {
  const dits: string[] = [];
  const faits: string[] = [];
  const github = {
    commentaires: async (): Promise<{ body: string }[]> => {
      throw new Error("GitHub unreachable");
    },
    commenter: async () => void faits.push("commenter"),
    labelliser: async () => void faits.push("labelliser"),
    delabelliser: async () => void faits.push("delabelliser"),
  };
  const fait = await reconcilierLesArretsExternes([{ number: 21, labels: ["fire", "served-elsewhere"] }], { github, station: "A", echecs: async () => [], avertir: (texte) => dits.push(texte) });
  assert.deepEqual(fait, { rendus: [], complete: false });
  assert.deepEqual(faits, []);
  assert.match(dits[0] ?? "", /#21 sur A.*GitHub unreachable/);
});

test("a ticket is put back on the rail with its comment before the label comes off (#3528)", async () => {
  const faits: string[] = [];
  const github = {
    commentaires: async () => [{ body: echec143 }],
    commenter: async () => void faits.push("commenter"),
    labelliser: async () => void faits.push("labelliser"),
    delabelliser: async (_: number, label: string) => void faits.push(`delabelliser ${label}`),
  };
  const fait = await reconcilierLesArretsExternes([{ number: 21, labels: ["served-elsewhere"] }], { github, station: "A", echecs: async () => [{ body: echec143 }], avertir: () => {} });
  assert.deepEqual(fait, { rendus: [21], complete: true });
  assert.deepEqual(faits, ["commenter", "labelliser", "delabelliser served-elsewhere"]);
});
