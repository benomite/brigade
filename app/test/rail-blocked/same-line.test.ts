// Le rail bloqué (ticket 3358) se dit d'une seule phrase partout dans l'app : la file du second (second/file.ts), le
// `status` que l'app tire de sa lecture du rail et la ligne en tête de ce rail (vue/rail/github.ts, `avecLeRail`).
// `brigade <project> status` sur la station ne le dit plus : le superviseur du runtime a pris sa place (ticket 3945). Un même GitHub — ses issues `fire`, leurs
// commentaires et leurs événements, et les gists des stations du compte — est lu par chacun avec le même `gh`, et
// chacun écrit la même ligne.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { noterGitHubSeul } from "../../../runtime/src/github-seul-etat.ts";
import { ouvrirJournal } from "../../../runtime/src/journal.ts";
import { principal as status } from "../../../runtime/src/status.ts";
import { callParGh, readTheFile, stationsParGh } from "../../src/second/file.ts";
import { readTheBoardOfRepository } from "../../src/board/read.ts";
import { statusOfBoard } from "../../src/board/rail.ts";
import { ghOfDirectory, type StandIn } from "../helpers/gh-of-directory.ts";
import { WITHOUT_POSIX } from "../helpers/posix.ts";
import { reply as gists } from "../stations/fake-gh-gists.ts";

const REPOSITORY = "chef/secondes";
const HOUR = 3_600_000;

function folder(t: TestContext): string {
  const d = mkdtempSync(join(tmpdir(), "brigade-rail-bloque-"));
  t.after(() => rmSync(d, { recursive: true, force: true }));
  return d;
}

// Le GitHub du projet : huit tickets `fire` (#4 à #11) posés il y a 3 j et demi, que personne n'a touchés — ni
// commentaire, ni `model:` ou `effort:`. `labels` : ceux de chacun. Tout autre chemin du dépôt rend une liste vide.
function world(labels: string[], instant: number): Record<string, unknown> {
  const pose = new Date(instant - 84 * HOUR).toISOString();
  const tickets = [4, 5, 6, 7, 8, 9, 10, 11];
  return {
    [`/repos/${REPOSITORY}/issues?state=open&labels=fire&sort=created&direction=asc&per_page=100&page=1`]: tickets.map((number) => ({ number, title: `Ticket ${number}`, html_url: `https://github.com/${REPOSITORY}/issues/${number}`, body: "", created_at: pose, labels: labels.map((name) => ({ name })) })),
    ...Object.fromEntries(tickets.map((number) => [`/repos/${REPOSITORY}/issues/${number}/events?per_page=100`, [{ event: "labeled", label: { name: "fire" }, created_at: pose }]])),
    [`/repos/${REPOSITORY}`]: { full_name: REPOSITORY, default_branch: "main", permissions: { push: true } },
  };
}

// La station `box` du compte, qui sert le projet : son gist d'enregistrement et sa sélection. `arretee` : elle s'est
// arrêtée il y a 3 j et demi, juste après son dernier signe de vie.
function station(directory: string, instant: number, stopped: boolean): void {
  const vue = new Date(instant - (stopped ? 84 * HOUR : 60_000)).toISOString();
  const recording = { brigade: "station-registration", format: 1, name: "box", platform: "linux", machine: "Linux 6.1.0", version: "1.0.0", registeredAt: vue, lastSeen: vue, refreshMs: 120_000, stoppedAt: stopped ? new Date(Date.parse(vue) + 1_000).toISOString() : null };
  const selection = { brigade: "station-selection", format: 1, repositories: [REPOSITORY], updatedAt: vue };
  const files = { "brigade-enregistrement.json": recording, "brigade-selection.json": selection };
  writeFileSync(join(directory, "g1.gist.json"), JSON.stringify({ id: "g1", description: "brigade — station box (registration)", public: false, updated_at: vue, owner: { login: "chef" }, files: Object.fromEntries(Object.entries(files).map(([name, content]) => [name, { filename: name, content: JSON.stringify(content) }])) }));
}

// Le `gh` de ce GitHub : les gists par la doublure des stations ; le dépôt d'après `reponses` — `-i`, comme le client
// du runtime le demande, avec la tête de la réponse.
function ghOf(directory: string, answers: Record<string, unknown>): string {
  const standIn: StandIn = (rep, args, entry) => {
    const raw = args.at(-1) ?? "";
    const path = raw.startsWith("/") ? raw : `/${raw}`;
    if (path.startsWith("/gists")) return gists(rep, args.map((arg) => (arg === raw ? path : arg)), entry);
    const body = JSON.stringify(answers[path] ?? (path.startsWith(`/repos/${REPOSITORY}/`) ? [] : {}));
    return { code: 0, sortie: args.includes("-i") ? `HTTP/2.0 200\r\nContent-Type: application/json\r\n\r\n${body}` : body, erreurs: "" };
  };
  return ghOfDirectory(directory, standIn);
}

// `brigade <project> status` sur la station GitHub seul du projet : ses lignes.
async function statusOfTheStation(t: TestContext, gh: string): Promise<string[]> {
  const state = folder(t);
  ouvrirJournal(state).fermer();
  noterGitHubSeul(state, { etat: "accepted" });
  const lines: string[] = [];
  await status({ args: [], env: { BRIGADE_STATE_DIR: state, BRIGADE_GITHUB_REPO: REPOSITORY, BRIGADE_GH_BIN: gh }, dire: (line) => void lines.push(line), redire: (line) => void lines.push(line) });
  return lines;
}

// Les trois lectures de l'app, au même instant : la file du second, son `status` et la ligne en tête du rail. Chaque
// lecture a son propre appel, donc sa propre échéance de 2 s : une seule, partagée, ne laissait à la seconde que ce que
// la première n'avait pas pris, et la CI chargée la passait (ticket 3761).
async function readsOfTheApp(gh: string, instant: number) {
  const stations = stationsParGh(gh, 2_000);
  const file = await readTheFile(callParGh(gh, 2_000), REPOSITORY, () => new Date(instant), stations);
  assert.ok(file.lue, JSON.stringify(file));
  const signs = async () => {
    const readEntries = await stations();
    return "lues" in readEntries ? { lus: readEntries.lues.map((station) => ({ ...station })) } : { illisible: readEntries.illisibles };
  };
  const readOne = await readTheBoardOfRepository({ depot: REPOSITORY, appeler: callParGh(gh, 2_000), maintenant: () => new Date(instant), signes: signs });
  assert.ok(readOne.lu, readOne.lu ? "" : readOne.raison);
  return { file: file.texte.split("\n"), status: statusOfBoard(readOne).split("\n"), railBloque: readOne.faits.railBloque as { phrase: string } | undefined };
}

const UNDER_THE_HEAD = (lines: readonly string[]) => {
  const head = lines.findIndex((line) => line.startsWith("awaiting "));
  assert.ok(head !== -1, lines.join("\n"));
  return lines[head + 1] ?? "";
};

describe("la même ligne dans `status` et dans la file du second", { skip: WITHOUT_POSIX }, () => {
  // L'app garde sa ligne telle qu'avant (#3945 : « do not rework their behavior ») ; seul `status` de la station la quitte.
  test("huit tickets qu'aucun manager n'a pris, leur station arrêtée : la file du second, le status de l'app et le rail disent la même phrase", async (t) => {
    const directory = folder(t);
    const instant = Date.now();
    station(directory, instant, true);
    const gh = ghOf(directory, world(["fire"], instant));
    const app = await readsOfTheApp(gh, instant);
    const expected = "  STUCK RAIL  8 tickets on the rail, no manager has taken them for 3 d: its station box/claude is stopped. Start it on its computer.";
    assert.equal(UNDER_THE_HEAD(app.file), expected);
    assert.equal(UNDER_THE_HEAD(app.status), expected);
    assert.equal(`  STUCK RAIL  ${app.railBloque?.phrase}`, expected);
  });

  test("les mêmes tickets calibrés par le manager : aucune ligne, ni sur la station, ni dans l'app", async (t) => {
    const directory = folder(t);
    const instant = Date.now();
    station(directory, instant, false);
    const gh = ghOf(directory, world(["fire", "model:opus", "effort:medium"], instant));
    const lines = await statusOfTheStation(t, gh);
    const app = await readsOfTheApp(gh, instant);
    for (const output of [lines, app.file, app.status]) assert.doesNotMatch(output.join("\n"), /STUCK RAIL/);
    assert.equal(app.railBloque, undefined);
  });
});
