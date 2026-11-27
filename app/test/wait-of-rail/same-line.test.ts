// Pourquoi la file du rail ne part pas (ticket 3433) se dit d'une seule phrase partout : `brigade <project> status` sur la
// station (runtime/src/attente-du-rail/status.ts), le `status` que l'app tire de sa lecture du rail, et la ligne en tête de ce
// rail (vue/rail/github.ts, `avecLeRail`) — avec, pour chaque carte, la même ligne. Un même GitHub — ses issues `fire`, leurs
// événements, et les gists des stations du compte — est lu par chacun avec le même `gh`.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { noterGitHubSeul } from "../../../runtime/src/github-seul-etat.ts";
import { ouvrirJournal } from "../../../runtime/src/journal.ts";
import { principal as status } from "../../../runtime/src/status.ts";
import { callByGh, stationsByGh } from "../../src/second/file.ts";
import { readTheBoardOfRepository } from "../../src/board/read.ts";
import { statusOfBoard } from "../../src/board/rail.ts";
import { ghOfDirectory, type StandIn } from "../helpers/gh-of-directory.ts";
import { WITHOUT_POSIX } from "../helpers/posix.ts";
import { reply as gists } from "../stations/fake-gh-gists.ts";

const REPOSITORY = "chef/secondes";
const HOUR = 3_600_000;

function folder(t: TestContext): string {
  const d = mkdtempSync(join(tmpdir(), "brigade-attente-du-rail-"));
  t.after(() => rmSync(d, { recursive: true, force: true }));
  return d;
}

// Le GitHub du projet : deux tickets `fire` posés il y a 2 min que personne n'a pris — #5 dépend de #4. Tout autre chemin
// du dépôt rend une liste vide.
function world(instant: number): Record<string, unknown> {
  const pose = new Date(instant - 2 * 60_000).toISOString();
  const tickets = [{ number: 4, body: "" }, { number: 5, body: "Depends on #4" }];
  return {
    [`/repos/${REPOSITORY}/issues?state=open&labels=fire&sort=created&direction=asc&per_page=100&page=1`]: tickets.map(({ number, body }) => ({ number, title: `Ticket ${number}`, html_url: `https://github.com/${REPOSITORY}/issues/${number}`, body, created_at: pose, labels: [{ name: "fire" }] })),
    ...Object.fromEntries(tickets.map(({ number }) => [`/repos/${REPOSITORY}/issues/${number}/events?per_page=100`, [{ event: "labeled", label: { name: "fire" }, created_at: pose }]])),
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

// Le `status` de l'app et le rail, au même instant.
async function readOfTheApp(gh: string, instant: number) {
  const call = callByGh(gh, 2_000);
  const stations = stationsByGh(gh, 2_000);
  const signs = async () => {
    const readEntries = await stations();
    return "lues" in readEntries ? { lus: readEntries.lues.map((station) => ({ ...station })) } : { illisible: readEntries.illisibles };
  };
  const readOne = await readTheBoardOfRepository({ depot: REPOSITORY, appeler: call, maintenant: () => new Date(instant), signes: signs });
  assert.ok(readOne.lu, readOne.lu ? "" : readOne.raison);
  return { status: statusOfBoard(readOne).split("\n"), attente: readOne.faits.attenteDuRail as { phrase: string } | undefined, cartes: readOne.faits.lignesDesCartes as Record<number, string> | undefined };
}

// Les lignes de l'attente dans un `status` : la phrase, puis celle de chaque carte.
const OF_THE_WAIT = (lines: readonly string[]) => {
  const rank = lines.findIndex((line) => line.startsWith("queue wait "));
  assert.ok(rank !== -1, lines.join("\n"));
  return lines.slice(rank, rank + 2);
};

describe("la même phrase dans `status` et dans le rail", { skip: WITHOUT_POSIX }, () => {
  test("deux tickets en file dont un dépend de l'autre, leur station arrêtée : status, le status de l'app et le rail disent la même chose", async (t) => {
    const directory = folder(t);
    const instant = Date.now();
    station(directory, instant, true);
    const gh = ghOf(directory, world(instant));
    const station_ = OF_THE_WAIT(await statusOfTheStation(t, gh));
    const app = await readOfTheApp(gh, instant);
    const expected = ["queue wait Station box/claude is stopped, so no cook can start. Start it on its computer.", "  #5  after #4 — waiting for its merge; waits for #4 — read from the body: 'Depends on #4'"];
    assert.deepEqual(station_, expected);
    assert.deepEqual(OF_THE_WAIT(app.status), expected);
    assert.equal(`queue wait ${app.attente?.phrase}`, expected[0]);
    assert.deepEqual(app.cartes, { 5: "after #4 — waiting for its merge; waits for #4 — read from the body: 'Depends on #4'" });
  });

  test("leur station en ligne : l'attente normale, la même durée partout", async (t) => {
    const directory = folder(t);
    const instant = Date.now();
    station(directory, instant, false);
    const gh = ghOf(directory, world(instant));
    const station_ = OF_THE_WAIT(await statusOfTheStation(t, gh));
    const app = await readOfTheApp(gh, instant);
    assert.match(station_[0] ?? "", /^queue wait Normal wait: a cook takes the ticket within minutes \(the oldest has waited 2 min\)\. It resolves by itself\.$/);
    assert.deepEqual(OF_THE_WAIT(app.status), station_);
    assert.equal(`queue wait ${app.attente?.phrase}`, station_[0]);
  });
});
