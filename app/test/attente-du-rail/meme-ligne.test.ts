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
import { appelParGh, stationsParGh } from "../../src/second/file.ts";
import { lireLeTableauDuDepot } from "../../src/tableau/lecture.ts";
import { statusDuTableau } from "../../src/tableau/rail.ts";
import { ghDuRepertoire, type Doublure } from "../aides/gh-du-repertoire.ts";
import { SANS_POSIX } from "../aides/posix.ts";
import { repondre as gists } from "../stations/faux-gh-gists.ts";

const DEPOT = "chef/secondes";
const HEURE = 3_600_000;

function dossier(t: TestContext): string {
  const d = mkdtempSync(join(tmpdir(), "brigade-attente-du-rail-"));
  t.after(() => rmSync(d, { recursive: true, force: true }));
  return d;
}

// Le GitHub du projet : deux tickets `fire` posés il y a 2 min que personne n'a pris — #5 dépend de #4. Tout autre chemin
// du dépôt rend une liste vide.
function monde(instant: number): Record<string, unknown> {
  const pose = new Date(instant - 2 * 60_000).toISOString();
  const tickets = [{ number: 4, body: "" }, { number: 5, body: "Depends on #4" }];
  return {
    [`/repos/${DEPOT}/issues?state=open&labels=fire&sort=created&direction=asc&per_page=100&page=1`]: tickets.map(({ number, body }) => ({ number, title: `Ticket ${number}`, html_url: `https://github.com/${DEPOT}/issues/${number}`, body, created_at: pose, labels: [{ name: "fire" }] })),
    ...Object.fromEntries(tickets.map(({ number }) => [`/repos/${DEPOT}/issues/${number}/events?per_page=100`, [{ event: "labeled", label: { name: "fire" }, created_at: pose }]])),
    [`/repos/${DEPOT}`]: { full_name: DEPOT, default_branch: "main", permissions: { push: true } },
  };
}

// La station `box` du compte, qui sert le projet : son gist d'enregistrement et sa sélection. `arretee` : elle s'est
// arrêtée il y a 3 j et demi, juste après son dernier signe de vie.
function station(repertoire: string, instant: number, arretee: boolean): void {
  const vue = new Date(instant - (arretee ? 84 * HEURE : 60_000)).toISOString();
  const enregistrement = { brigade: "station-registration", format: 1, name: "box", platform: "linux", machine: "Linux 6.1.0", version: "1.0.0", registeredAt: vue, lastSeen: vue, refreshMs: 120_000, stoppedAt: arretee ? new Date(Date.parse(vue) + 1_000).toISOString() : null };
  const selection = { brigade: "station-selection", format: 1, repositories: [DEPOT], updatedAt: vue };
  const fichiers = { "brigade-enregistrement.json": enregistrement, "brigade-selection.json": selection };
  writeFileSync(join(repertoire, "g1.gist.json"), JSON.stringify({ id: "g1", description: "brigade — station box (registration)", public: false, updated_at: vue, owner: { login: "chef" }, files: Object.fromEntries(Object.entries(fichiers).map(([nom, contenu]) => [nom, { filename: nom, content: JSON.stringify(contenu) }])) }));
}

// Le `gh` de ce GitHub : les gists par la doublure des stations ; le dépôt d'après `reponses` — `-i`, comme le client
// du runtime le demande, avec la tête de la réponse.
function ghDe(repertoire: string, reponses: Record<string, unknown>): string {
  const doublure: Doublure = (rep, args, entree) => {
    const brut = args.at(-1) ?? "";
    const chemin = brut.startsWith("/") ? brut : `/${brut}`;
    if (chemin.startsWith("/gists")) return gists(rep, args.map((arg) => (arg === brut ? chemin : arg)), entree);
    const corps = JSON.stringify(reponses[chemin] ?? (chemin.startsWith(`/repos/${DEPOT}/`) ? [] : {}));
    return { code: 0, sortie: args.includes("-i") ? `HTTP/2.0 200\r\nContent-Type: application/json\r\n\r\n${corps}` : corps, erreurs: "" };
  };
  return ghDuRepertoire(repertoire, doublure);
}

// `brigade <project> status` sur la station GitHub seul du projet : ses lignes.
async function statusDeLaStation(t: TestContext, gh: string): Promise<string[]> {
  const etat = dossier(t);
  ouvrirJournal(etat).fermer();
  noterGitHubSeul(etat, { etat: "accepted" });
  const lignes: string[] = [];
  await status({ args: [], env: { BRIGADE_STATE_DIR: etat, BRIGADE_GITHUB_REPO: DEPOT, BRIGADE_GH_BIN: gh }, dire: (ligne) => void lignes.push(ligne), redire: (ligne) => void lignes.push(ligne) });
  return lignes;
}

// Le `status` de l'app et le rail, au même instant.
async function lectureDeLApp(gh: string, instant: number) {
  const appeler = appelParGh(gh, 2_000);
  const stations = stationsParGh(gh, 2_000);
  const signes = async () => {
    const lues = await stations();
    return "lues" in lues ? { lus: lues.lues.map((station) => ({ ...station })) } : { illisible: lues.illisibles };
  };
  const lu = await lireLeTableauDuDepot({ depot: DEPOT, appeler, maintenant: () => new Date(instant), signes });
  assert.ok(lu.lu, lu.lu ? "" : lu.raison);
  return { status: statusDuTableau(lu).split("\n"), attente: lu.faits.attenteDuRail as { phrase: string } | undefined, cartes: lu.faits.lignesDesCartes as Record<number, string> | undefined };
}

// Les lignes de l'attente dans un `status` : la phrase, puis celle de chaque carte.
const DE_L_ATTENTE = (lignes: readonly string[]) => {
  const rang = lignes.findIndex((ligne) => ligne.startsWith("queue wait "));
  assert.ok(rang !== -1, lignes.join("\n"));
  return lignes.slice(rang, rang + 2);
};

describe("la même phrase dans `status` et dans le rail", { skip: SANS_POSIX }, () => {
  test("deux tickets en file dont un dépend de l'autre, leur station arrêtée : status, le status de l'app et le rail disent la même chose", async (t) => {
    const repertoire = dossier(t);
    const instant = Date.now();
    station(repertoire, instant, true);
    const gh = ghDe(repertoire, monde(instant));
    const station_ = DE_L_ATTENTE(await statusDeLaStation(t, gh));
    const app = await lectureDeLApp(gh, instant);
    const attendue = ["queue wait Station box/claude is stopped, so no cook can start. Start the station.", "  #5  after #4"];
    assert.deepEqual(station_, attendue);
    assert.deepEqual(DE_L_ATTENTE(app.status), attendue);
    assert.equal(`queue wait ${app.attente?.phrase}`, attendue[0]);
    assert.deepEqual(app.cartes, { 5: "after #4" });
  });

  test("leur station en ligne : l'attente normale, la même durée partout", async (t) => {
    const repertoire = dossier(t);
    const instant = Date.now();
    station(repertoire, instant, false);
    const gh = ghDe(repertoire, monde(instant));
    const station_ = DE_L_ATTENTE(await statusDeLaStation(t, gh));
    const app = await lectureDeLApp(gh, instant);
    assert.match(station_[0] ?? "", /^queue wait Normal wait: a cook takes the ticket within minutes \(the oldest has waited 2 min\)\. It resolves by itself\.$/);
    assert.deepEqual(DE_L_ATTENTE(app.status), station_);
    assert.equal(`queue wait ${app.attente?.phrase}`, station_[0]);
  });
});
