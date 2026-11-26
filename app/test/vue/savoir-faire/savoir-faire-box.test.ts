// Le savoir-faire du projet, côté process principal (#4241), par les gestes du pont que main.ts branche : la commande
// `know-how` lancée là où la cuisine du projet tourne, et chaque réponse du runtime lue — des entrées, `{ok: true}`, ou la
// ligne d'un refus. Un runtime sans la commande, une réponse illisible, un projet sans station ou parti ne passent jamais
// pour une lecture ou un changement réussi. Le geste `lancer` est une doublure : rien ne part.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Lu, Rendu } from "../../../src/box.ts";
import { mots } from "../../../src/box.ts";
import { brancherLeSavoirFaire } from "../../../src/vue/savoir-faire/savoir-faire-box.ts";

const LU = { nom: "parade" } as Lu;
const LANCE = "$ node geste.ts parade know-how";
const sortiePar = (code: number) => Object.assign(new Error("exit"), { code, cmd: "know-how" });
const rendu = (sortie: string, erreur: Rendu["erreur"] = null, erreurs = ""): Rendu => ({ lance: LANCE, erreur, sortie, erreurs });
const ENTREES = [
  { id: "L1", text: "Run the typecheck before pushing.", ticket: 4001 },
  { id: "L2", text: "Never kill a process by name.", ticket: 4002 },
];

// Les gestes branchés comme main.ts les branche : « parade » a une station (ou pas, `sansStation`), « gone » a quitté le fichier.
function gestes(r: Rendu, { sansStation = false } = {}) {
  const commandes: string[] = [];
  const ecoutes = new Map<string, (evenement: unknown, ...args: unknown[]) => unknown>();
  const cuisineDuProjet = (nom: unknown) => (nom === "parade" ? { vise: { nom: "parade" }, lu: sansStation ? undefined : LU } : { vise: undefined, lu: undefined });
  brancherLeSavoirFaire({ handle: (canal, ecouter) => ecoutes.set(canal, ecouter) }, cuisineDuProjet, async (_, commande) => (commandes.push(commande), r));
  const ecoute = (canal: string) => ecoutes.get(canal) ?? assert.fail(`pas de geste ${canal}`);
  return {
    commandes,
    lire: async (projet = "parade") => await ecoute("lireLeSavoirFaire")(null, projet),
    modifier: async (id: unknown, texte: unknown, projet = "parade") => await ecoute("modifierLeSavoirFaire")(null, projet, id, texte),
    retirer: async (id: unknown, projet = "parade") => await ecoute("retirerDuSavoirFaire")(null, projet, id),
  };
}

test("read: `know-how` gives the entries of its last line, each with its ticket", async () => {
  const { commandes, lire } = gestes(rendu(`starting\n${JSON.stringify({ entries: ENTREES })}\n`));
  assert.deepEqual(await lire(), { entries: ENTREES });
  assert.deepEqual(commandes, ["know-how"]);
  assert.deepEqual(await gestes(rendu('{"entries":[]}')).lire(), { entries: [] });
});

test("read: one entry that does not read makes the whole reading unavailable, never a part of it shown as all", async () => {
  const detail = (sortie: string) => `${LANCE}\n${sortie}`.trim();
  for (const entree of [null, { id: "X1", text: "a", ticket: 1 }, { id: "L1", text: 3, ticket: 1 }, { id: "L1", text: "a", ticket: "1" }, { id: "L1", text: "a", ticket: 0 }, { id: "L1", text: "a", ticket: 1.5 }]) {
    const sortie = JSON.stringify({ entries: [ENTREES[0], entree] });
    assert.deepEqual(await gestes(rendu(sortie)).lire(), { refus: "know-how unavailable", detail: detail(sortie) }, JSON.stringify(entree));
  }
  for (const sortie of ["", "not json", '{"entries":{}}', "[]"]) assert.deepEqual(await gestes(rendu(sortie)).lire(), { refus: "know-how unavailable", detail: detail(sortie) }, sortie);
  // Une sortie lisible, mais d'une commande en échec : elle ne se croit pas.
  assert.deepEqual(await gestes(rendu('{"entries":[]}', sortiePar(1))).lire(), { refus: "know-how unavailable", detail: `${LANCE}\n{"entries":[]}` });
});

test("a runtime without the command, a project without a station or gone: said, never an empty know-how", async () => {
  const sans = rendu("", sortiePar(66), "« know-how » n'est pas une commande du runtime");
  assert.deepEqual(await gestes(sans).lire(), { refus: "know-how unavailable: this station's runtime does not give it yet — update it", detail: `${LANCE}\n« know-how » n'est pas une commande du runtime` });
  assert.deepEqual(await gestes(sans).retirer("L1"), { refus: "nothing was changed: this station's runtime does not know the know-how yet — update it", detail: `${LANCE}\n« know-how » n'est pas une commande du runtime` });
  const sansStation = gestes(rendu('{"ok":true}'), { sansStation: true });
  assert.deepEqual(await sansStation.lire(), { refus: "know-how unavailable: “parade” has no station — it is read where its kitchen runs" });
  assert.deepEqual(await sansStation.modifier("L1", "a"), { refus: "nothing was sent: “parade” has no station — there is no runtime to change it" });
  assert.deepEqual(sansStation.commandes, []);
  const parti = gestes(rendu('{"ok":true}'));
  assert.deepEqual(await parti.lire("gone"), { refus: "“gone” is no longer in the projects file" });
  assert.deepEqual(await parti.modifier("L1", "a", "gone"), { refus: "“gone” is no longer in the projects file" });
  assert.deepEqual(await parti.retirer("L1", "gone"), { refus: "“gone” is no longer in the projects file" });
  assert.deepEqual(parti.commandes, []);
});

test("edit and remove: the command names the entry, the text stays one word whatever it holds, and {ok: true} is done", async () => {
  const { commandes, modifier, retirer } = gestes(rendu('{"ok":true,"entry":{"id":"L2","text":"x","ticket":4002}}\n'));
  const texte = "Never kill by name; use the 'pid' — \"always\"";
  assert.deepEqual(await modifier("L2", texte), { ok: true });
  assert.deepEqual(await retirer("L12"), { ok: true });
  assert.deepEqual(commandes.map(mots), [["know-how", "edit", "L2", texte], ["know-how", "remove", "L12"]]);
});

test("nothing is launched for what is not an entry's id, or an empty text", async () => {
  const { commandes, modifier, retirer } = gestes(rendu('{"ok":true}'));
  for (const id of [undefined, 3, "", "L0", "l1", "L1; rm -rf /", "L1 L2"]) {
    assert.deepEqual(await modifier(id, "a"), { refus: "nothing was sent: this is not an entry of the know-how" }, String(id));
    assert.deepEqual(await retirer(id), { refus: "nothing was sent: this is not an entry of the know-how" }, String(id));
  }
  for (const texte of [undefined, 3, "", "  \n "]) assert.deepEqual(await modifier("L1", texte), { refus: "nothing was sent: an entry cannot be empty" }, String(texte));
  assert.deepEqual(commandes, []);
});

test("a refusal gives its line, the output in the detail; an unreadable answer never reads as done", async () => {
  const sortie = '{"ok":false,"message":"“L9” is not an entry of the project\'s know-how\\nsecond line"}\n';
  assert.deepEqual(await gestes(rendu(sortie, sortiePar(1))).modifier("L9", "a"), { refus: "“L9” is not an entry of the project's know-how", detail: `${LANCE}\n${sortie}`.trim() });
  for (const autre of ["", "not json", '{"ok":false}', '{"ok":false,"message":""}', '{"ok":"yes"}', "[true]"]) {
    assert.deepEqual(await gestes(rendu(autre)).retirer("L1"), { refus: "nothing was changed: the runtime's answer could not be read", detail: `${LANCE}\n${autre}`.trim() }, autre);
  }
});
