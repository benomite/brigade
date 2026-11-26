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
import { callParGh, lireLaFile, stationsParGh } from "../../src/second/file.ts";
import { lireLeTableauDuRepository } from "../../src/tableau/read.ts";
import { statusDuTableau } from "../../src/tableau/rail.ts";
import { ghDuRepertoire, type Doublure } from "../aides/gh-du-repertoire.ts";
import { SANS_POSIX } from "../aides/posix.ts";
import { repondre as gists } from "../stations/faux-gh-gists.ts";

const REPOSITORY = "chef/secondes";
const HEURE = 3_600_000;

function dossier(t: TestContext): string {
  const d = mkdtempSync(join(tmpdir(), "brigade-rail-bloque-"));
  t.after(() => rmSync(d, { recursive: true, force: true }));
  return d;
}

// Le GitHub du projet : huit tickets `fire` (#4 à #11) posés il y a 3 j et demi, que personne n'a touchés — ni
// commentaire, ni `model:` ou `effort:`. `labels` : ceux de chacun. Tout autre chemin du dépôt rend une liste vide.
function monde(labels: string[], instant: number): Record<string, unknown> {
  const pose = new Date(instant - 84 * HEURE).toISOString();
  const tickets = [4, 5, 6, 7, 8, 9, 10, 11];
  return {
    [`/repos/${REPOSITORY}/issues?state=open&labels=fire&sort=created&direction=asc&per_page=100&page=1`]: tickets.map((number) => ({ number, title: `Ticket ${number}`, html_url: `https://github.com/${REPOSITORY}/issues/${number}`, body: "", created_at: pose, labels: labels.map((name) => ({ name })) })),
    ...Object.fromEntries(tickets.map((number) => [`/repos/${REPOSITORY}/issues/${number}/events?per_page=100`, [{ event: "labeled", label: { name: "fire" }, created_at: pose }]])),
    [`/repos/${REPOSITORY}`]: { full_name: REPOSITORY, default_branch: "main", permissions: { push: true } },
  };
}

// La station `box` du compte, qui sert le projet : son gist d'enregistrement et sa sélection. `arretee` : elle s'est
// arrêtée il y a 3 j et demi, juste après son dernier signe de vie.
function station(repertoire: string, instant: number, arretee: boolean): void {
  const vue = new Date(instant - (arretee ? 84 * HEURE : 60_000)).toISOString();
  const enregistrement = { brigade: "station-registration", format: 1, name: "box", platform: "linux", machine: "Linux 6.1.0", version: "1.0.0", registeredAt: vue, lastSeen: vue, refreshMs: 120_000, stoppedAt: arretee ? new Date(Date.parse(vue) + 1_000).toISOString() : null };
  const selection = { brigade: "station-selection", format: 1, repositories: [REPOSITORY], updatedAt: vue };
  const fichiers = { "brigade-enregistrement.json": enregistrement, "brigade-selection.json": selection };
  writeFileSync(join(repertoire, "g1.gist.json"), JSON.stringify({ id: "g1", description: "brigade — station box (registration)", public: false, updated_at: vue, owner: { login: "chef" }, files: Object.fromEntries(Object.entries(fichiers).map(([name, contenu]) => [name, { filename: name, content: JSON.stringify(contenu) }])) }));
}

// Le `gh` de ce GitHub : les gists par la doublure des stations ; le dépôt d'après `reponses` — `-i`, comme le client
// du runtime le demande, avec la tête de la réponse.
function ghDe(repertoire: string, answers: Record<string, unknown>): string {
  const doublure: Doublure = (rep, args, entree) => {
    const brut = args.at(-1) ?? "";
    const chemin = brut.startsWith("/") ? brut : `/${brut}`;
    if (chemin.startsWith("/gists")) return gists(rep, args.map((arg) => (arg === brut ? chemin : arg)), entree);
    const corps = JSON.stringify(answers[chemin] ?? (chemin.startsWith(`/repos/${REPOSITORY}/`) ? [] : {}));
    return { code: 0, sortie: args.includes("-i") ? `HTTP/2.0 200\r\nContent-Type: application/json\r\n\r\n${corps}` : corps, erreurs: "" };
  };
  return ghDuRepertoire(repertoire, doublure);
}

// `brigade <project> status` sur la station GitHub seul du projet : ses lignes.
async function statusDeLaStation(t: TestContext, gh: string): Promise<string[]> {
  const state = dossier(t);
  ouvrirJournal(state).fermer();
  noterGitHubSeul(state, { etat: "accepted" });
  const lines: string[] = [];
  await status({ args: [], env: { BRIGADE_STATE_DIR: state, BRIGADE_GITHUB_REPO: REPOSITORY, BRIGADE_GH_BIN: gh }, dire: (line) => void lines.push(line), redire: (line) => void lines.push(line) });
  return lines;
}

// Les trois lectures de l'app, au même instant : la file du second, son `status` et la ligne en tête du rail. Chaque
// lecture a son propre appel, donc sa propre échéance de 2 s : une seule, partagée, ne laissait à la seconde que ce que
// la première n'avait pas pris, et la CI chargée la passait (ticket 3761).
async function lecturesDeLApp(gh: string, instant: number) {
  const stations = stationsParGh(gh, 2_000);
  const file = await lireLaFile(callParGh(gh, 2_000), REPOSITORY, () => new Date(instant), stations);
  assert.ok(file.lue, JSON.stringify(file));
  const signes = async () => {
    const lues = await stations();
    return "lues" in lues ? { lus: lues.lues.map((station) => ({ ...station })) } : { illisible: lues.illisibles };
  };
  const lu = await lireLeTableauDuRepository({ depot: REPOSITORY, appeler: callParGh(gh, 2_000), maintenant: () => new Date(instant), signes });
  assert.ok(lu.lu, lu.lu ? "" : lu.raison);
  return { file: file.texte.split("\n"), status: statusDuTableau(lu).split("\n"), railBloque: lu.faits.railBloque as { phrase: string } | undefined };
}

const SOUS_LA_TETE = (lines: readonly string[]) => {
  const tete = lines.findIndex((line) => line.startsWith("awaiting "));
  assert.ok(tete !== -1, lines.join("\n"));
  return lines[tete + 1] ?? "";
};

describe("la même ligne dans `status` et dans la file du second", { skip: SANS_POSIX }, () => {
  // L'app garde sa ligne telle qu'avant (#3945 : « do not rework their behavior ») ; seul `status` de la station la quitte.
  test("huit tickets qu'aucun manager n'a pris, leur station arrêtée : la file du second, le status de l'app et le rail disent la même phrase", async (t) => {
    const repertoire = dossier(t);
    const instant = Date.now();
    station(repertoire, instant, true);
    const gh = ghDe(repertoire, monde(["fire"], instant));
    const app = await lecturesDeLApp(gh, instant);
    const attendue = "  STUCK RAIL  8 tickets on the rail, no manager has taken them for 3 d: its station box/claude is stopped. Start it on its computer.";
    assert.equal(SOUS_LA_TETE(app.file), attendue);
    assert.equal(SOUS_LA_TETE(app.status), attendue);
    assert.equal(`  STUCK RAIL  ${app.railBloque?.phrase}`, attendue);
  });

  test("les mêmes tickets calibrés par le manager : aucune ligne, ni sur la station, ni dans l'app", async (t) => {
    const repertoire = dossier(t);
    const instant = Date.now();
    station(repertoire, instant, false);
    const gh = ghDe(repertoire, monde(["fire", "model:opus", "effort:medium"], instant));
    const lines = await statusDeLaStation(t, gh);
    const app = await lecturesDeLApp(gh, instant);
    for (const sortie of [lines, app.file, app.status]) assert.doesNotMatch(sortie.join("\n"), /STUCK RAIL/);
    assert.equal(app.railBloque, undefined);
  });
});
