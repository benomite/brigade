// Quand GitHub limite la station (#3684) : la ligne `queue wait` le dit avec l'heure de reprise, jamais « offline », et la
// ligne `rail` liste les tickets `fire` qui attendent au lieu de dire `empty`.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { avecLeRailEnFile, lignesDeLAttente } from "../../src/attente-du-rail/status.ts";
import { limitesDeLaStation } from "../../src/github-limite.ts";
import { noterGitHubSeul } from "../../src/github-seul-etat.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { principal as status } from "../../src/status.ts";
import { appeler, DEPOT, fauxGh, repertoireTemporaire } from "../outils.ts";

const MAINTENANT = Date.parse("2026-11-12T10:00:00.000Z");
const FEUX = `/repos/${DEPOT}/issues?state=open&labels=fire&sort=created&direction=asc&per_page=100&page=1`;
const issue = (number: number) => ({ number, title: `#${number}`, body: "", created_at: "2026-11-12T09:00:00Z", labels: [{ name: "fire" }] });
const lire = (numeros: number[]) => async (chemin: string) => (chemin === FEUX ? numeros.map(issue) : chemin.includes("/events?") || chemin.includes("/comments?") ? [] : assert.fail(`not dictated: ${chemin}`));
// Une station muette depuis une heure : sans la limite, `status` la disait hors ligne.
const muette = async () => ({ lues: [{ name: "box/claude", lastSeen: new Date(MAINTENANT - 3_600_000).toISOString(), stoppedAt: null, refreshMs: 120_000, selection: [DEPOT] }] });
const limite = { backAt: "2026-11-12T10:42:00.000Z" };

describe("GitHub limite la station", () => {
  test("la ligne `queue wait` dit la limite de GitHub et l'heure de reprise, sans « offline », « out of quota » ni geste", async () => {
    const [ligne] = await lignesDeLAttente({ depot: DEPOT, lire: lire([4]), stations: muette, maintenant: MAINTENANT, limite });
    assert.equal(ligne, "queue wait GitHub is rate-limiting the station, so no cook can start before about 10:42 UTC. It resolves by itself.");
    assert.doesNotMatch(ligne ?? "", /offline|out of quota|Start the station|Start it on its computer/);
  });

  test("stations illisibles pendant la limite : la ligne dit la limite, pas un `gh` en panne", async () => {
    const [ligne] = await lignesDeLAttente({ depot: DEPOT, lire: lire([4]), stations: async () => ({ illisibles: "GitHub refused" }), maintenant: MAINTENANT, limite });
    assert.match(ligne ?? "", /^queue wait GitHub is rate-limiting the station, so no cook can start before about 10:42 UTC\./);
  });

  test("sans limite, la station muette reste dite hors ligne", async () => {
    const [ligne] = await lignesDeLAttente({ depot: DEPOT, lire: lire([4]), stations: muette, maintenant: MAINTENANT });
    assert.match(ligne ?? "", /offline or out of quota, so no cook can start\. Start it on its computer\.$/);
  });

  test("trois tickets en file : `status` liste les trois sous la ligne `rail`, au lieu de `empty`", async (t) => {
    const repertoire = repertoireTemporaire(t);
    const station = repertoireTemporaire(t);
    ouvrirJournal(repertoire).fermer();
    noterGitHubSeul(repertoire, { etat: "accepted" });
    const maintenant = Date.now();
    const limites = limitesDeLaStation(station);
    limites.constater("compte", { sorte: "primary", depuis: maintenant, reprise: maintenant + 3_600_000 });
    limites.fermer();
    const gh = fauxGh(t);
    gh.repondre(FEUX, { corps: [4, 5, 6].map(issue) });
    for (const n of [4, 5, 6]) {
      gh.repondre(`/repos/${DEPOT}/issues/${n}/comments?per_page=100`, { corps: [] });
      gh.repondre(`/repos/${DEPOT}/issues/${n}/events?per_page=100`, { corps: [{ event: "labeled", label: { name: "fire" }, created_at: new Date(maintenant - 60_000).toISOString() }] });
    }
    const enregistrement = { brigade: "station-registration", format: 1, name: "box/claude", platform: "linux", machine: "box", version: "1", registeredAt: new Date(maintenant - 86_400_000).toISOString(), lastSeen: new Date(maintenant - 3_600_000).toISOString(), refreshMs: 120_000, stoppedAt: null };
    gh.repondre("/gists?per_page=100&page=1", { corps: [{ id: "g1", files: { "brigade-enregistrement.json": {} } }] });
    gh.repondre("/gists/g1", { corps: { owner: { login: "chef" }, files: { "brigade-enregistrement.json": { content: JSON.stringify(enregistrement) }, "brigade-selection.json": { content: JSON.stringify({ repositories: [DEPOT] }) } } } });
    const commande = appeler(status, [], { BRIGADE_STATE_DIR: repertoire, BRIGADE_STATION_DIR: station, BRIGADE_GITHUB_REPO: DEPOT, BRIGADE_GH_BIN: gh.bin });
    assert.equal(await commande.fin, 0);
    const lignes = commande.sortie().split("\n");
    const attente = lignes.find((ligne) => ligne.startsWith("queue wait ")) ?? "";
    assert.match(attente, /^queue wait GitHub is rate-limiting the station, so no cook can start before about \d\d:\d\d UTC\./, commande.sortie());
    assert.doesNotMatch(attente, /offline|out of quota|Start the station/);
    const rang = lignes.findIndex((ligne) => ligne.startsWith("rail "));
    assert.deepEqual(lignes.slice(rang, rang + 4), ["rail       3 queued, held by GitHub's rate limit", "  #4  queued", "  #5  queued", "  #6  queued"], commande.sortie());
    assert.ok(!lignes.some((ligne) => /^rail\s+empty/.test(ligne)));
  });

  test("la ligne `rail` d'une photo vide liste les tickets en file", () => {
    const photo = ["project    parade", "", "rail       empty", "cooks      none"];
    assert.deepEqual(avecLeRailEnFile(photo, [4, 5, 6]), ["project    parade", "", "rail       3 queued, held by GitHub's rate limit", "  #4  queued", "  #5  queued", "  #6  queued", "cooks      none"]);
  });

  test("hors limite, ou ailleurs qu'un rail vide : la ligne `rail` ne bouge pas", async () => {
    assert.deepEqual(avecLeRailEnFile(["rail       empty"], []), ["rail       empty"]);
    assert.deepEqual(avecLeRailEnFile(["rail       2 queued"], [4, 5]), ["rail       2 queued"]);
  });
});
