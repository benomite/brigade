// #4047 : le mot au cook dans le cycle du cook — un lancement est un tour ; le
// mot que `send-word` met en file pendant ce tour attend sa fin, puis la session
// du cook reprend sur un tour de plus dont l'entrée le porte.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import type { Lancer } from "../../src/brigade-github.ts";
import { fileSurDisque } from "../../src/mot-au-cook/file.ts";
import { avecLesMotsAuCook } from "../../src/mot-au-cook/lanceur.ts";
import type { Fin } from "../../src/superviseur.ts";

const racine = mkdtempSync(join(tmpdir(), "mot-au-cook-lanceur-"));
after(() => rmSync(racine, { recursive: true, force: true }));
let n = 0;

const SESSION = "0b7c3a52-1d2e-4f60-9a8b-7c6d5e4f3a21";
const COOK = ["-p", "--model", "opus", "--disallowedTools", "WebFetch"];
const fin = (partiel: Partial<Fin> = {}): Fin => ({ code: 0, signal: null, turns: 3, tokens: 100, durationMs: 10, arret: null, erreur: null, ...partiel });

type Appel = Parameters<Lancer>[0];
// Une station : son répertoire d'état, où `send-word` met ses mots en file, et
// un faux lanceur — chaque lancement est noté ; `pendant` joue ce qui arrive
// pendant le tour ; sa fin est la suivante de `fins`.
function station(options: { fins?: Fin[]; session?: string | null; pendant?: (envoyer: (texte: string) => void, rang: number) => void } = {}) {
  const repertoireEtat = join(racine, `etat-${(n += 1)}`);
  const envoyer = (texte: string) => fileSurDisque(repertoireEtat).ajouter(7, texte);
  const appels: Appel[] = [];
  const dits: string[] = [];
  const fins = [...(options.fins ?? [])];
  const lancer: Lancer = (appel) => {
    appels.push(appel);
    const session = options.session === undefined ? SESSION : options.session;
    writeFileSync(appel.flux, session === null ? "{}\n" : `${JSON.stringify({ type: "system", subtype: "init", session_id: session })}\n`);
    options.pendant?.(envoyer, appels.length);
    return { fin: Promise.resolve(fins.shift() ?? fin()), flux: appel.flux };
  };
  const lancerLeCook = avecLesMotsAuCook(lancer, { repertoireEtat, avertir: (texte) => dits.push(texte) });
  const cuire = (partiel: Partial<Appel> = {}) => lancerLeCook({ commande: "claude", args: COOK, entree: "the instruction", cwd: racine, env: {}, flux: join(racine, `run-${(n += 1)}.flux.jsonl`), ticket: 7, ...partiel });
  return { appels, dits, envoyer, cuire, repertoireEtat };
}

test("a word sent during the cook's turn resumes its session on one more turn, whose input carries it", async () => {
  const { appels, dits, cuire } = station({ fins: [fin({ turns: 3, tokens: 100 }), fin({ turns: 2, tokens: 40 })], pendant: (envoyer, rang) => rang === 1 && envoyer("use the small table") });
  const lance = cuire();
  const fini = await lance.fin;
  assert.equal(appels.length, 2, "one more turn");
  assert.equal(appels[0]?.entree, "the instruction", "the first turn is not touched");
  assert.deepEqual(appels[1]?.args, ["-p", "--model", "opus", "--resume", SESSION, "--disallowedTools", "WebFetch"]);
  assert.match(appels[1]?.entree ?? "", /^Ton tour est fini[\s\S]*> use the small table$/);
  assert.equal(appels[1]?.flux, (appels[0]?.flux ?? "").replace(/\.flux\.jsonl$/, "-word-1.flux.jsonl"));
  assert.equal(lance.flux, appels[1]?.flux, "the delivery is read in the last turn");
  assert.equal(fini.turns, 5);
  assert.equal(fini.tokens, 140);
  assert.equal(fini.durationMs, 20);
  assert.deepEqual(dits, ["brigade : #7 — a word from the chef reaches its cook at the end of its turn: use the small table"]);
});

test("a cook's turn with no word is launched once, as is", async () => {
  const { appels, cuire } = station();
  const lance = cuire();
  assert.deepEqual(await lance.fin, fin());
  assert.equal(appels.length, 1);
  assert.equal(lance.flux, appels[0]?.flux);
});

test("a word sent during the resumed turn resumes it again", async () => {
  const { appels, cuire } = station({ pendant: (envoyer, rang) => rang <= 2 && envoyer(`word ${rang}`) });
  await cuire().fin;
  assert.equal(appels.length, 3);
  assert.match(appels[2]?.entree ?? "", /word 2/);
  assert.doesNotMatch(appels[2]?.entree ?? "", /word 1/, "a word is given once");
});

test("a resume replaces the forked resume of a send-back", async () => {
  const { appels, cuire } = station({ pendant: (envoyer, rang) => rang === 1 && envoyer("hello") });
  await cuire({ args: ["-p", "--resume", "old", "--fork-session", "--disallowedTools", "X"] }).fin;
  assert.deepEqual(appels[1]?.args, ["-p", "--resume", SESSION, "--disallowedTools", "X"]);
});

test("a turn that does not finish is not resumed: the word goes to the cook's next launch", async () => {
  for (const arrete of [fin({ code: 1 }), fin({ arret: { reason: "idle", limit: 1, observed: 2 } })]) {
    const { appels, cuire } = station({ fins: [arrete], pendant: (envoyer, rang) => rang === 1 && envoyer("use the small table") });
    assert.deepEqual(await cuire().fin, arrete);
    assert.equal(appels.length, 1);
    await cuire({ entree: "the relaunch" }).fin;
    assert.match(appels[1]?.entree ?? "", /^the relaunch\n\n[\s\S]*use the small table/);
  }
});

test("a resumed turn that does not finish leaves the delivery as the previous turn left it", async () => {
  const { appels, dits, cuire } = station({ fins: [fin({ turns: 3 }), fin({ code: 1, turns: 1 })], pendant: (envoyer, rang) => rang === 1 && envoyer("use the small table") });
  const lance = cuire();
  const fini = await lance.fin;
  assert.equal(fini.code, 0);
  assert.equal(fini.turns, 4);
  assert.equal(lance.flux, appels[0]?.flux, "the delivery is read in the turn that finished");
  assert.match(dits.join("\n"), /#7 — the cook resumed on a word from the chef did not finish \(exit code 1\)/);
});

test("a session that cannot be read is not resumed: the word goes to the next launch, and it is said", async () => {
  const { appels, dits, cuire } = station({ session: null, pendant: (envoyer, rang) => rang === 1 && envoyer("use the small table") });
  await cuire().fin;
  assert.equal(appels.length, 1);
  assert.match(dits.join("\n"), /#7 — the session of its cook cannot be resumed/);
  await cuire({ entree: "next" }).fin;
  assert.match(appels[1]?.entree ?? "", /use the small table/);
});

test("a queue that cannot be read does not fail the cook's turn: it is said", async () => {
  const { appels, dits, cuire, repertoireEtat } = station();
  mkdirSync(repertoireEtat, { recursive: true });
  writeFileSync(join(repertoireEtat, "mots-au-cook"), "not a folder");
  assert.deepEqual(await cuire().fin, fin());
  assert.equal(appels.length, 1);
  assert.match(dits.join("\n"), /#7 — the words from the chef could not be taken from the queue at the end of its cook's turn \(they stay on the issue\)/);
});

test("the reviewer, a launch with no ticket and a Codex cook leave the word to the cook", async () => {
  for (const partiel of [{ args: ["-p", "--tools", "Read"] }, { ticket: undefined }, { args: ["adaptateur-codex.ts", "codex", "exec"] }]) {
    const { appels, envoyer, cuire } = station();
    envoyer("use the small table");
    await cuire(partiel).fin;
    assert.equal(appels.length, 1);
    assert.equal(appels[0]?.entree, "the instruction");
    await cuire().fin;
    assert.equal(appels.length, 3, "the word still waits for the cook, and reaches it at the end of its turn");
    assert.match(appels[2]?.entree ?? "", /use the small table/);
  }
});

test("without a state directory, the station's launcher is left as it is", () => {
  const lancer: Lancer = () => ({ fin: Promise.resolve(fin()) });
  assert.equal(avecLesMotsAuCook(lancer, { repertoireEtat: undefined, avertir: () => {} }), lancer);
});
