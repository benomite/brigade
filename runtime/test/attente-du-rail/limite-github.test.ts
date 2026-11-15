// Quand GitHub limite la station (#3684) : la ligne `queue wait` le dit avec l'heure de reprise, jamais « offline », et la
// ligne `rail` liste les tickets `fire` qui attendent au lieu de dire `empty`.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { avecLeRailEnFile, lireLAttente, lignesDeLAttente } from "../../src/attente-du-rail/status.ts";
import { DEPOT } from "../outils.ts";

const MAINTENANT = Date.parse("2026-11-12T10:00:00.000Z");
const FEUX = `/repos/${DEPOT}/issues?state=open&labels=fire&sort=created&direction=asc&per_page=100&page=1`;
const issue = (number: number) => ({ number, title: `#${number}`, body: "", created_at: "2026-11-12T09:00:00Z", labels: [{ name: "fire" }] });
const lire = (numeros: number[]) => async (chemin: string) => (chemin === FEUX ? numeros.map(issue) : chemin.includes("/events?") ? [] : assert.fail(`not dictated: ${chemin}`));
// Une station muette depuis une heure : sans la limite, `status` la disait hors ligne.
const muette = async () => ({ lues: [{ name: "box/claude", lastSeen: new Date(MAINTENANT - 3_600_000).toISOString(), stoppedAt: null, refreshMs: 120_000, selection: [DEPOT] }] });
const limite = { backAt: "2026-11-12T10:42:00.000Z" };

describe("GitHub limite la station", () => {
  test("la ligne `queue wait` dit la limite de GitHub et l'heure de reprise, sans « offline », « out of quota » ni geste", async () => {
    const [ligne] = await lignesDeLAttente({ depot: DEPOT, lire: lire([4]), stations: muette, maintenant: MAINTENANT, limite });
    assert.equal(ligne, "queue wait GitHub is rate-limiting the station, so no cook can start before about 10:42 UTC. It resolves by itself.");
    assert.doesNotMatch(ligne ?? "", /offline|out of quota|Start the station|Start it on its computer/);
  });

  test("sans limite, la station muette reste dite hors ligne", async () => {
    const [ligne] = await lignesDeLAttente({ depot: DEPOT, lire: lire([4]), stations: muette, maintenant: MAINTENANT });
    assert.match(ligne ?? "", /offline or out of quota, so no cook can start\. Start it on its computer\.$/);
  });

  test("trois tickets en file : la ligne `rail` les liste au lieu de dire `empty`", async () => {
    const { enFile } = await lireLAttente({ depot: DEPOT, lire: lire([4, 5, 6]), stations: muette, maintenant: MAINTENANT, limite });
    assert.deepEqual(enFile, [4, 5, 6]);
    const photo = ["project    parade", "", "rail       empty", "cooks      none"];
    const lignes = avecLeRailEnFile(photo, enFile);
    assert.deepEqual(lignes, ["project    parade", "", "rail       3 queued, held by GitHub's rate limit", "  #4  queued", "  #5  queued", "  #6  queued", "cooks      none"]);
    assert.ok(!lignes.some((ligne) => /^rail\s+empty/.test(ligne)));
  });

  test("hors limite, ou ailleurs qu'un rail vide : la ligne `rail` ne bouge pas", async () => {
    const sans = await lireLAttente({ depot: DEPOT, lire: lire([4, 5, 6]), stations: muette, maintenant: MAINTENANT });
    assert.deepEqual(sans.enFile, []);
    assert.deepEqual(avecLeRailEnFile(["rail       empty"], []), ["rail       empty"]);
    assert.deepEqual(avecLeRailEnFile(["rail       2 queued"], [4, 5]), ["rail       2 queued"]);
  });
});
