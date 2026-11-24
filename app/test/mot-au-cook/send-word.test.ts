// Le mot au cook, côté process principal (#4048), par le geste du pont `envoyerUnMot` que main.ts branche : la commande
// `send-word` écrite avec `{ticket, text}`, et chaque réponse du runtime lue en `{ok: true}` ou `{ok: false, reason}` d'une
// ligne — un runtime sans la commande, une réponse illisible, un projet sans station ou parti ne passent jamais pour un
// envoi réussi. Le geste `lancer` est une doublure : rien ne part.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Lu, Rendu } from "../../src/box.ts";
import { mots } from "../../src/box.ts";
import { brancherLeMotAuCook } from "../../src/vue/mot-au-cook/mot-au-cook-box.ts";

const LU = { nom: "parade" } as Lu;
const sortiePar = (code: number) => Object.assign(new Error("exit"), { code, cmd: "send-word" });
const rendu = (sortie: string, erreur: Rendu["erreur"] = null, erreurs = ""): Rendu => ({ lance: "$ node geste.ts parade send-word", erreur, sortie, erreurs });

// Le geste branché comme main.ts le branche : « parade » a une station (ou pas, `sansStation`), « gone » a quitté le fichier.
function geste(r: Rendu, { sansStation = false } = {}) {
  const commandes: string[] = [];
  const ecoutes = new Map<string, (evenement: unknown, ...args: unknown[]) => unknown>();
  const cuisineDuProjet = (nom: unknown) => (nom === "parade" ? { vise: { nom: "parade" }, lu: sansStation ? undefined : LU } : { vise: undefined, lu: undefined });
  brancherLeMotAuCook({ handle: (canal, ecouter) => ecoutes.set(canal, ecouter) }, cuisineDuProjet, async (_, commande) => (commandes.push(commande), r));
  const ecoute = ecoutes.get("envoyerUnMot") ?? assert.fail("pas de geste envoyerUnMot");
  return { commandes, envoyer: async (entree: unknown, projet = "parade") => (await ecoute(null, projet, entree)) as { ok: boolean; reason?: string; detail?: string } };
}

test("{ok: true} on the last line is a word sent, by send-word with {ticket, text} as one JSON word", async () => {
  const { commandes, envoyer } = geste(rendu('starting\n{"ok":true}\n'));
  const text = "use 'the' \"short\" query ";
  assert.deepEqual(await envoyer({ ticket: 14, text }), { ok: true });
  assert.equal(commandes.length, 1);
  assert.deepEqual(mots(commandes[0] ?? ""), ["send-word", JSON.stringify({ ticket: 14, text })]);
});

test("nothing is launched for what is not a ticket or not a word", async () => {
  const { commandes, envoyer } = geste(rendu('{"ok":true}'));
  for (const entree of [null, "14", [14], { ticket: "14", text: "a" }, { ticket: 1.5, text: "a" }, { ticket: 0, text: "a" }, { ticket: -3, text: "a" }]) {
    assert.deepEqual(await envoyer(entree), { ok: false, reason: "nothing was sent: this is not a ticket" }, JSON.stringify(entree));
  }
  for (const text of [undefined, 3, "", "   "]) assert.deepEqual(await envoyer({ ticket: 14, text }), { ok: false, reason: "nothing was sent: the word is empty" });
  assert.deepEqual(commandes, []);
  assert.deepEqual(await envoyer({ ticket: 1, text: "a" }), { ok: true });
});

test("{ok: false, reason} gives its reason on one line, the output in the detail", async () => {
  const sortie = '{"ok":false,"reason":"no cook holds `#14`\\nsecond line"}\n';
  const { envoyer } = geste(rendu(sortie, sortiePar(1)));
  assert.deepEqual(await envoyer({ ticket: 14, text: "hi" }), { ok: false, reason: "no cook holds #14", detail: `$ node geste.ts parade send-word\n${sortie}`.trim() });
});

test("an unreadable answer, or a refusal without a reason, never reads as sent", async () => {
  for (const sortie of ["", "not json", '{"ok":false}', '{"ok":false,"reason":"  "}', '{"ok":"yes"}', "[true]", "null"]) {
    const lue = await geste(rendu(sortie)).envoyer({ ticket: 14, text: "hi" });
    assert.equal(lue.ok, false, sortie);
    assert.equal(lue.reason, "the runtime's answer could not be read: the word may not have reached the cook", sortie);
  }
});

test("a runtime without the command is never a word sent, and says to update it", async () => {
  const lue = await geste(rendu("", sortiePar(66), "send-word is not a runtime command")).envoyer({ ticket: 14, text: "hi" });
  assert.deepEqual(lue, {
    ok: false,
    reason: "nothing was sent: this station's runtime cannot pass a word to a cook yet — update it",
    detail: "$ node geste.ts parade send-word\nsend-word is not a runtime command",
  });
});

test("a project with no station, or one that left the projects file, launches nothing", async () => {
  const sans = geste(rendu('{"ok":true}'), { sansStation: true });
  assert.deepEqual(await sans.envoyer({ ticket: 14, text: "hi" }), { ok: false, reason: "nothing was sent: “parade” has no station — there is no runtime to pass it on" });
  const parti = geste(rendu('{"ok":true}'));
  assert.deepEqual(await parti.envoyer({ ticket: 14, text: "hi" }, "gone"), { ok: false, reason: "nothing was sent: “gone” is no longer in the projects file" });
  assert.deepEqual([...sans.commandes, ...parti.commandes], []);
});
