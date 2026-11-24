// #4047 : la file des mots au cook, dans le répertoire d'état — ce que la
// commande `send-word` y ajoute, le runtime l'y prend, une fois.
import assert from "node:assert/strict";
import { appendFileSync, existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { fileSurDisque } from "../../src/mot-au-cook/file.ts";

const racine = mkdtempSync(join(tmpdir(), "mot-au-cook-file-"));
after(() => rmSync(racine, { recursive: true, force: true }));
let n = 0;
const etat = () => join(racine, `etat-${(n += 1)}`);

test("a word added by one process is taken by another, oldest first, once", () => {
  const repertoire = etat();
  fileSurDisque(repertoire).ajouter(7, "use the small table");
  fileSurDisque(repertoire).ajouter(7, "then the big one");
  fileSurDisque(repertoire).ajouter(8, "another ticket");
  const runtime = fileSurDisque(repertoire);
  assert.deepEqual(runtime.prendre(7), ["use the small table", "then the big one"]);
  assert.deepEqual(runtime.prendre(7), [], "taken once");
  assert.deepEqual(runtime.prendre(8), ["another ticket"]);
  assert.equal(existsSync(join(repertoire, "mots-au-cook", "7.jsonl.pris")), false, "nothing is left behind");
});

test("a ticket with no queued word gives nothing", () => {
  assert.deepEqual(fileSurDisque(etat()).prendre(7), []);
});

test("an unreadable line is set aside and said, the readable words are taken", () => {
  const repertoire = etat();
  const dits: string[] = [];
  const file = fileSurDisque(repertoire, (texte) => dits.push(texte));
  file.ajouter(7, "first");
  appendFileSync(join(repertoire, "mots-au-cook", "7.jsonl"), "{not json\n\n{\"other\":1}\n");
  file.ajouter(7, "last");
  assert.deepEqual(file.prendre(7), ["first", "last"]);
  assert.equal(dits.length, 2);
  assert.match(dits[0] ?? "", /#7 — a queued word from the chef cannot be read/);
});

test("a queue that cannot be read throws, instead of reading as empty", () => {
  const repertoire = etat();
  rmSync(repertoire, { recursive: true, force: true });
  writeFileSync(join(racine, "pas-un-dossier"), "");
  const file = fileSurDisque(join(racine, "pas-un-dossier"));
  assert.throws(() => file.prendre(7));
});
