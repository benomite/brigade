// Les stations contributrices que le chef refuse (#2936) : la liste que le projet tient, qui ne change que par le
// rôle `chef`, qui survit à un redémarrage, et la commande `contributor-stations` que l'app joue sous Settings.
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { Sortie } from "../../src/appel.ts";
import type { Commentaire } from "../../src/github.ts";
import { principal } from "../../src/station-contributrice/commande.ts";
import { listerLesStations } from "../../src/station-contributrice/commande.ts";
import { corpsDeReclamation, corpsDeRendu, reclamer } from "../../src/station-contributrice/reclamation.ts";
import { fichierDesRefus, lireLesRefus, ouvrirLesRefus, RefusInterdit } from "../../src/station-contributrice/refus.ts";
import { repertoireTemporaire } from "../outils.ts";

const CHEF = { roles: ["chef"] };

test("the chef refuses a station and accepts it again; the refusal is read again by a new store on the same file (a restart)", (t) => {
  const fichier = fichierDesRefus(repertoireTemporaire(t));
  const avant = ouvrirLesRefus(fichier);
  assert.deepEqual(avant.liste(), [], "no file is an empty list");
  assert.equal(avant.refuser(CHEF, "bob-pc/claude"), true);
  assert.equal(avant.refuser(CHEF, "bob-pc/claude"), false, "refusing twice changes nothing");
  assert.equal(avant.refuser(CHEF, "carol/claude"), true);
  const apres = ouvrirLesRefus(fichier);
  assert.deepEqual(apres.liste(), ["bob-pc/claude", "carol/claude"]);
  assert.equal(apres.refuse("bob-pc/claude"), true);
  assert.equal(apres.reaccepter(CHEF, "bob-pc/claude"), true);
  assert.equal(apres.reaccepter(CHEF, "bob-pc/claude"), false);
  assert.deepEqual(lireLesRefus(fichier), ["carol/claude"]);
});

test("a user without the chef role cannot change the list: the refusal says so and the file is not touched", (t) => {
  const fichier = fichierDesRefus(repertoireTemporaire(t));
  const refus = ouvrirLesRefus(fichier);
  for (const roles of [[], ["product", "design", "review", "client-contact"]]) {
    assert.throws(() => refus.refuser({ roles }, "bob-pc/claude"), RefusInterdit);
    assert.equal(existsSync(fichier), false);
  }
  refus.refuser(CHEF, "bob-pc/claude");
  const ecrit = readFileSync(fichier, "utf8");
  assert.throws(() => refus.reaccepter({ roles: ["review"] }, "bob-pc/claude"), /only the chef may refuse or accept/);
  assert.equal(readFileSync(fichier, "utf8"), ecrit);
  assert.deepEqual(refus.liste(), ["bob-pc/claude"]);
});

test("a file that cannot be read is an error, never an empty list that the next gesture would overwrite", (t) => {
  const fichier = fichierDesRefus(repertoireTemporaire(t));
  writeFileSync(fichier, '{"refused":["bob-pc/cla');
  const refus = ouvrirLesRefus(fichier);
  assert.throws(() => refus.liste(), /cannot be read/);
  assert.throws(() => refus.refuser(CHEF, "carol/claude"), /cannot be read/);
  assert.equal(readFileSync(fichier, "utf8"), '{"refused":["bob-pc/cla');
  writeFileSync(fichier, '{"refused":[1]}');
  assert.throws(() => refus.liste(), /is not \{"refused"/);
});

test("a refused station's claim is rejected without a word on the issue; an accepted station's claim goes through", async () => {
  const commentaires: Commentaire[] = [];
  const github = (auteur: string) => ({
    commentaires: async () => [...commentaires],
    commenter: async (_numero: number, body: string) => void commentaires.push({ body, author: auteur, association: "NONE", createdAt: "2026-11-08T10:00:00Z" }),
  });
  const maintenant = () => new Date("2026-11-08T10:00:05Z");
  const refusees = () => ["bob-pc/claude"];
  const bob = await reclamer(7, { github: github("bob"), station: "bob-pc/claude", login: "bob", maintenant, refusees });
  assert.deepEqual(bob, { prise: false, tenant: null, refusee: true });
  assert.deepEqual(commentaires, []);
  const alice = await reclamer(7, { github: github("alice"), station: "alice-pc/claude", login: "alice", maintenant, refusees });
  assert.equal(alice.prise, true);
  assert.equal(commentaires.length, 1);
});

const prise = (station: string, login: string, auteur = login): Commentaire => ({ body: corpsDeReclamation(station, login), author: auteur, association: "NONE", createdAt: "2026-11-08T10:00:00Z" });

test("the stations listed are those that claimed a ticket, each once, with their refusal; a refused station never seen is listed too", async () => {
  const lues = new Map<number, Commentaire[]>([
    [7, [prise("bob-pc/claude", "bob"), { ...prise("bob-pc/claude", "bob"), body: corpsDeRendu("bob-pc/claude", "bob") }]],
    [8, [prise("bob-pc/claude", "bob"), prise("alice-pc/claude", "alice"), prise("mallory/claude", "alice", "mallory")]],
    [9, []],
  ]);
  const depuis: string[] = [];
  const vues = await listerLesStations({ commentairesDepuis: async (instant) => (depuis.push(instant), [...lues.values()].flat()) }, ["bob-pc/claude", "carol/claude"], "2026-10-09T00:00:00Z");
  assert.deepEqual(depuis, ["2026-10-09T00:00:00Z"], "one listing of the repo's comments, never one reading per issue (#3030)");
  assert.deepEqual(vues, [
    { station: "bob-pc/claude", login: "bob", refused: true },
    { station: "alice-pc/claude", login: "alice", refused: false },
    { station: "carol/claude", login: null, refused: true },
  ]);
});

async function jouer(args: string[], env: Record<string, string | undefined>) {
  const dites: string[] = [];
  const redites: string[] = [];
  let code = 0;
  try {
    await principal({ args, env, dire: (ligne) => void dites.push(ligne), redire: (ligne) => void redites.push(ligne) });
  } catch (erreur) {
    if (!(erreur instanceof Sortie)) throw erreur;
    code = erreur.code;
  }
  return { dites, redites, code };
}

test("the contributor-stations command refuses and accepts for the chef, refuses any other role, and writes nothing on a bad usage", async (t) => {
  const repertoire = repertoireTemporaire(t);
  const env = { BRIGADE_STATE_DIR: repertoire };
  const refuse = await jouer(["refuse", "bob-pc/claude"], env);
  assert.deepEqual([refuse.code, refuse.dites], [0, ['{"ok":true}']]);
  assert.deepEqual(lireLesRefus(fichierDesRefus(repertoire)), ["bob-pc/claude"]);

  const interdit = await jouer(["accept", "bob-pc/claude", "--role", "review"], env);
  assert.equal(interdit.code, 1);
  assert.match(interdit.dites[0] ?? "", /"ok":false.*only the chef may refuse or accept/);
  assert.deepEqual(lireLesRefus(fichierDesRefus(repertoire)), ["bob-pc/claude"]);

  const reaccepte = await jouer(["accept", "bob-pc/claude", "--role", "chef"], env);
  assert.deepEqual([reaccepte.code, reaccepte.dites], [0, ['{"ok":true}']]);
  assert.deepEqual(lireLesRefus(fichierDesRefus(repertoire)), []);

  const mauvaisNom = await jouer(["refuse", "bob pc"], env);
  assert.equal(mauvaisNom.code, 1);
  assert.match(mauvaisNom.dites[0] ?? "", /not a station name/);
  for (const args of [["refuse"], ["ban", "x"], ["refuse", "a", "b"], ["refuse", "a", "--role"]]) assert.equal((await jouer(args, env)).code, 2, args.join(" "));
  assert.equal((await jouer(["refuse", "a"], {})).code, 2, "no state directory");
  assert.deepEqual(lireLesRefus(join(repertoire, "stations-refusees.json")), []);
});
