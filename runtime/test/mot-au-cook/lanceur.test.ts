// #4047 : le mot au cook dans le cycle du cook — un lancement est un tour ; le
// mot envoyé pendant ce tour attend sa fin, puis la session du cook reprend sur
// un tour de plus dont l'entrée le porte.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import type { Lancer } from "../../src/brigade-github.ts";
import { fileSurDisque } from "../../src/mot-au-cook/file.ts";
import { avecLesMots, avecLesMotsAuCook, avecReprise, ENTREE_DE_LA_REPRISE, fluxDeLaReprise } from "../../src/mot-au-cook/lanceur.ts";
import { creerMotAuCook, fileEnMemoire, type FileDesMots } from "../../src/mot-au-cook/mot-au-cook.ts";
import type { Fin } from "../../src/superviseur.ts";

const racine = mkdtempSync(join(tmpdir(), "mot-au-cook-lanceur-"));
after(() => rmSync(racine, { recursive: true, force: true }));
let n = 0;

const SESSION = "0b7c3a52-1d2e-4f60-9a8b-7c6d5e4f3a21";
const COOK = ["-p", "--model", "opus", "--disallowedTools", "WebFetch"];
const fin = (partiel: Partial<Fin> = {}): Fin => ({ code: 0, signal: null, turns: 3, tokens: 100, durationMs: 10, arret: null, erreur: null, ...partiel });

type Appel = Parameters<Lancer>[0];
// Un faux lanceur : chaque lancement est noté ; `pendant` joue ce qui arrive
// pendant le tour (un mot envoyé) ; sa fin est la suivante de `fins`.
function cuisine(options: { fins?: Fin[]; session?: string | null; pendant?: (appel: Appel, rang: number) => void } = {}) {
  const appels: Appel[] = [];
  const fins = [...(options.fins ?? [])];
  const lancer: Lancer = (appel) => {
    appels.push(appel);
    const session = options.session === undefined ? SESSION : options.session;
    writeFileSync(appel.flux, session === null ? "{}\n" : `${JSON.stringify({ type: "system", subtype: "init", session_id: session })}\n`);
    options.pendant?.(appel, appels.length);
    return { fin: Promise.resolve(fins.shift() ?? fin()), flux: appel.flux };
  };
  return { appels, lancer };
}
const flux = () => join(racine, `run-${(n += 1)}.flux.jsonl`);
const avec = (file: FileDesMots) => creerMotAuCook({ etat: () => "taken", commenter: async () => {}, livrer: () => {}, file });

test("a word sent during the cook's turn resumes its session on one more turn, whose input carries it", async () => {
  const file = fileEnMemoire();
  const dits: string[] = [];
  const { appels, lancer } = cuisine({ fins: [fin({ turns: 3, tokens: 100 }), fin({ turns: 2, tokens: 40 })], pendant: (_appel, rang) => rang === 1 && file.ajouter(7, "use the small table") });
  const lance = avecLesMots(lancer, avec(file), (texte) => dits.push(texte))({ commande: "claude", args: COOK, entree: "the instruction", cwd: racine, env: {}, flux: flux(), ticket: 7 });
  const fini = await lance.fin;
  assert.equal(appels.length, 2, "one more turn");
  assert.equal(appels[0]?.entree, "the instruction", "the first turn is not touched");
  assert.deepEqual(appels[1]?.args, ["-p", "--model", "opus", "--resume", SESSION, "--disallowedTools", "WebFetch"]);
  assert.match(appels[1]?.entree ?? "", /use the small table/);
  assert.ok(appels[1]?.entree?.startsWith(ENTREE_DE_LA_REPRISE));
  assert.equal(appels[1]?.flux, fluxDeLaReprise(appels[0]?.flux ?? "", 1));
  assert.equal(lance.flux, appels[1]?.flux, "the delivery is read in the last turn");
  assert.equal(fini.turns, 5);
  assert.equal(fini.tokens, 140);
  assert.equal(fini.durationMs, 20);
});

test("a cook's turn with no word is launched once, as is", async () => {
  const { appels, lancer } = cuisine();
  const demande = flux();
  const lance = avecLesMots(lancer, avec(fileEnMemoire()), () => {})({ commande: "claude", args: COOK, entree: "the instruction", cwd: racine, env: {}, flux: demande, ticket: 7 });
  assert.deepEqual(await lance.fin, fin());
  assert.equal(appels.length, 1);
  assert.equal(lance.flux, demande);
});

test("a word sent during the resumed turn resumes it again", async () => {
  const file = fileEnMemoire();
  const { appels, lancer } = cuisine({ pendant: (_appel, rang) => rang <= 2 && file.ajouter(7, `word ${rang}`) });
  await avecLesMots(lancer, avec(file), () => {})({ commande: "claude", args: COOK, entree: "x", cwd: racine, env: {}, flux: flux(), ticket: 7 }).fin;
  assert.equal(appels.length, 3);
  assert.match(appels[2]?.entree ?? "", /word 2/);
  assert.doesNotMatch(appels[2]?.entree ?? "", /word 1/, "a word is given once");
});

test("a turn that does not finish is not resumed: the word goes to the cook's next launch", async () => {
  for (const arrete of [fin({ code: 1 }), fin({ arret: { reason: "idle", limit: 1, observed: 2 } })]) {
    const file = fileEnMemoire();
    const { appels, lancer } = cuisine({ fins: [arrete], pendant: (_appel, rang) => rang === 1 && file.ajouter(7, "use the small table") });
    const lancerAvecLesMots = avecLesMots(lancer, avec(file), () => {});
    assert.deepEqual(await lancerAvecLesMots({ commande: "claude", args: COOK, entree: "x", cwd: racine, env: {}, flux: flux(), ticket: 7 }).fin, arrete);
    assert.equal(appels.length, 1);
    await lancerAvecLesMots({ commande: "claude", args: COOK, entree: "the relaunch", cwd: racine, env: {}, flux: flux(), ticket: 7 }).fin;
    assert.match(appels[1]?.entree ?? "", /^the relaunch\n\n[\s\S]*use the small table/);
  }
});

test("a resumed turn that does not finish leaves the delivery as the previous turn left it", async () => {
  const file = fileEnMemoire();
  const dits: string[] = [];
  const premier = fin({ turns: 3, tokens: 100 });
  const { appels, lancer } = cuisine({ fins: [premier, fin({ code: 1, turns: 1, tokens: 5 })], pendant: (_appel, rang) => rang === 1 && file.ajouter(7, "use the small table") });
  const lance = avecLesMots(lancer, avec(file), (texte) => dits.push(texte))({ commande: "claude", args: COOK, entree: "x", cwd: racine, env: {}, flux: flux(), ticket: 7 });
  const fini = await lance.fin;
  assert.equal(fini.code, 0);
  assert.equal(fini.turns, 4);
  assert.equal(lance.flux, appels[0]?.flux, "the delivery is read in the turn that finished");
  assert.match(dits.join("\n"), /#7 — the cook resumed on a word from the chef did not finish \(exit code 1\)/);
});

test("a session that cannot be read is not resumed: the word goes to the next launch, and it is said", async () => {
  const file = fileEnMemoire();
  const dits: string[] = [];
  const { appels, lancer } = cuisine({ session: null, pendant: (_appel, rang) => rang === 1 && file.ajouter(7, "use the small table") });
  const lancerAvecLesMots = avecLesMots(lancer, avec(file), (texte) => dits.push(texte));
  await lancerAvecLesMots({ commande: "claude", args: COOK, entree: "x", cwd: racine, env: {}, flux: flux(), ticket: 7 }).fin;
  assert.equal(appels.length, 1);
  assert.match(dits.join("\n"), /#7 — the session of its cook cannot be resumed/);
  await lancerAvecLesMots({ commande: "claude", args: COOK, entree: "next", cwd: racine, env: {}, flux: flux(), ticket: 7 }).fin;
  assert.match(appels[1]?.entree ?? "", /use the small table/);
});

test("a queue that cannot be read does not fail the cook's turn: it is said", async () => {
  const dits: string[] = [];
  const casse: FileDesMots = { ajouter: () => {}, prendre: () => { throw new Error("disk\ngone"); } };
  const { appels, lancer } = cuisine();
  assert.deepEqual(await avecLesMots(lancer, avec(casse), (texte) => dits.push(texte))({ commande: "claude", args: COOK, entree: "x", cwd: racine, env: {}, flux: flux(), ticket: 7 }).fin, fin());
  assert.equal(appels.length, 1);
  assert.match(dits.join("\n"), /#7 — the words from the chef could not be taken from the queue at the end of its cook's turn \(they stay on the issue\): disk gone/);
});

test("the reviewer, a launch with no ticket and a Codex cook are launched as they are", async () => {
  for (const [args, ticket] of [[["-p", "--tools", "Read"], 7], [COOK, undefined]] as const) {
    const file = fileEnMemoire();
    const mot = avec(file);
    file.ajouter(7, "use the small table");
    mot.debutDeTour(7);
    await mot.finDeTour(7);
    const { appels, lancer } = cuisine();
    await avecLesMots(lancer, mot, () => {})({ commande: "claude", args: [...args], entree: "x", cwd: racine, env: {}, flux: flux(), ...(ticket === undefined ? {} : { ticket }) }).fin;
    assert.equal(appels.length, 1);
    assert.equal(appels[0]?.entree, "x");
    assert.equal(mot.aDesMots(7), true, "the word still waits for the cook");
  }
});

test("a resume replaces the forked resume of a send-back", () => {
  assert.deepEqual(avecReprise(["-p", "--resume", "old", "--fork-session", "--disallowedTools", "X"], SESSION), ["-p", "--resume", SESSION, "--disallowedTools", "X"]);
});

test("the station's launcher takes the words that `send-word` queued in the state directory", async () => {
  const repertoireEtat = join(racine, "etat");
  const dits: string[] = [];
  const { appels, lancer } = cuisine({ pendant: (_appel, rang) => rang === 1 && fileSurDisque(repertoireEtat).ajouter(7, "use the small table") });
  await avecLesMotsAuCook(lancer, { repertoireEtat, avertir: (texte) => dits.push(texte) })({ commande: "claude", args: COOK, entree: "x", cwd: racine, env: {}, flux: flux(), ticket: 7 }).fin;
  assert.equal(appels.length, 2);
  assert.match(appels[1]?.entree ?? "", /use the small table/);
  assert.deepEqual(dits, ["brigade : #7 — a word from the chef reaches its cook at the end of its turn: use the small table"]);
});

test("without a state directory, the station's launcher is left as it is", () => {
  const { lancer } = cuisine();
  assert.equal(avecLesMotsAuCook(lancer, { repertoireEtat: undefined, avertir: () => {} }), lancer);
});
