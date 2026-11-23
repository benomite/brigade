// Le mot au cook, côté process principal (#4048) : la commande `send-word` écrite avec `{ticket, text}`, et chaque réponse
// du runtime lue en `{ok: true}` ou `{ok: false, reason}` d'une ligne — un runtime sans la commande, une réponse illisible,
// un projet sans station ou parti ne passent jamais pour un envoi réussi. Le geste `lancer` est une doublure : rien ne part.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Lu, Rendu } from "../../src/box.ts";
import { mots } from "../../src/box.ts";
import { brancherLeMotAuCook, commandeDuMot, envoyerLeMot } from "../../src/vue/mot-au-cook/mot-au-cook-box.ts";

const LU = { nom: "parade" } as Lu;
const rendu = (sortie: string, erreur: Rendu["erreur"] = null, erreurs = ""): Rendu => ({ lance: "$ node geste.ts parade send-word", erreur, sortie, erreurs });
const lancerQuiRend = (r: Rendu) => {
  const commandes: string[] = [];
  return { commandes, lancer: async (_: Lu, commande: string) => (commandes.push(commande), r) };
};

test("the command is send-word with {ticket, text} as one JSON word, quotes and apostrophes kept", () => {
  const ecrite = commandeDuMot({ ticket: 14, text: "use 'the' \"short\" query " });
  assert.ok("commande" in ecrite);
  assert.deepEqual(mots(ecrite.commande), ["send-word", JSON.stringify({ ticket: 14, text: "use 'the' \"short\" query " })]);
});

test("nothing is written for what is not a ticket or not a word", () => {
  for (const entree of [null, "14", [14], { ticket: "14", text: "a" }, { ticket: 1.5, text: "a" }, { ticket: 0, text: "a" }, { ticket: -3, text: "a" }]) {
    assert.deepEqual(commandeDuMot(entree), { refus: "nothing was sent: this is not a ticket" }, JSON.stringify(entree));
  }
  for (const text of [undefined, 3, "", "   "]) assert.deepEqual(commandeDuMot({ ticket: 14, text }), { refus: "nothing was sent: the word is empty" });
  assert.ok("commande" in commandeDuMot({ ticket: 1, text: "a" }));
});

test("{ok: true} on the last line is a word sent", async () => {
  const { commandes, lancer } = lancerQuiRend(rendu('starting\n{"ok":true}\n'));
  assert.deepEqual(await envoyerLeMot("parade", LU, { ticket: 14, text: "hi" }, lancer), { ok: true });
  assert.deepEqual(commandes, [`send-word '{"ticket":14,"text":"hi"}'`]);
});

test("{ok: false, reason} gives its reason on one line, the output in the detail", async () => {
  const sortie = '{"ok":false,"reason":"no cook holds `#14`\\nsecond line"}\n';
  const { lancer } = lancerQuiRend(rendu(sortie, Object.assign(new Error("exit"), { code: 1, cmd: "send-word" })));
  const lue = await envoyerLeMot("parade", LU, { ticket: 14, text: "hi" }, lancer);
  assert.deepEqual(lue, { ok: false, reason: "no cook holds #14", detail: `$ node geste.ts parade send-word\n${sortie}`.trim() });
});

test("an unreadable answer, or a refusal without a reason, never reads as sent", async () => {
  for (const sortie of ["", "not json", '{"ok":false}', '{"ok":false,"reason":"  "}', '{"ok":"yes"}', "[true]", "null"]) {
    const { lancer } = lancerQuiRend(rendu(sortie));
    const lue = await envoyerLeMot("parade", LU, { ticket: 14, text: "hi" }, lancer);
    assert.equal(lue.ok, false, sortie);
    assert.equal(!lue.ok && lue.reason, "the runtime's answer could not be read: the word may not have reached the cook", sortie);
  }
});

test("a runtime without the command says to update it", async () => {
  const { lancer } = lancerQuiRend(rendu("", Object.assign(new Error("exit"), { code: 66, cmd: "send-word" }), "send-word is not a runtime command"));
  const lue = await envoyerLeMot("parade", LU, { ticket: 14, text: "hi" }, lancer);
  assert.equal(!lue.ok && lue.reason, "nothing was sent: this station's runtime cannot pass a word to a cook yet — update it");
});

test("a project with no station, or a bad entry, launches nothing", async () => {
  const { commandes, lancer } = lancerQuiRend(rendu('{"ok":true}'));
  assert.deepEqual(await envoyerLeMot("parade", undefined, { ticket: 14, text: "hi" }, lancer), { ok: false, reason: "nothing was sent: “parade” has no station — there is no runtime to pass it on" });
  assert.deepEqual(await envoyerLeMot("parade", LU, { ticket: 14, text: " " }, lancer), { ok: false, reason: "nothing was sent: the word is empty" });
  assert.deepEqual(commandes, []);
});

test("the bridge gesture envoyerUnMot runs it for a known project, and refuses one that left the projects file", async () => {
  const ecoutes = new Map<string, (evenement: unknown, ...args: unknown[]) => unknown>();
  const { commandes, lancer } = lancerQuiRend(rendu('{"ok":true}'));
  brancherLeMotAuCook({ handle: (canal, ecouter) => ecoutes.set(canal, ecouter) }, (nom) => (nom === "parade" ? { vise: { nom: "parade" }, lu: LU } : { vise: undefined, lu: undefined }), lancer);
  const geste = ecoutes.get("envoyerUnMot") ?? assert.fail("pas de geste");
  assert.deepEqual(await geste(null, "parade", { ticket: 14, text: "hi" }), { ok: true });
  assert.deepEqual(await geste(null, "gone", { ticket: 14, text: "hi" }), { ok: false, reason: "nothing was sent: “gone” is no longer in the projects file" });
  assert.equal(commandes.length, 1);
});
