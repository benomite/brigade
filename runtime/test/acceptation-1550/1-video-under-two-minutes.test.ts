// #1550, critère 1 : docs/demo/ contient la vidéo (mp4), d'une durée de moins de 2 minutes.
// Test d'acceptation : lit la durée dans l'atome `mvhd` du fichier, sans ffprobe.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";

const DEMO = new URL("../../../docs/demo/", import.meta.url);

test("docs/demo/ holds an mp4 video lasting less than 2 minutes", () => {
  const videos = readdirSync(DEMO).filter((nom) => nom.endsWith(".mp4"));
  assert.ok(videos.length >= 1, "no .mp4 in docs/demo/");
  for (const nom of videos) {
    const octets = readFileSync(new URL(nom, DEMO));
    assert.equal(octets.subarray(4, 8).toString("latin1"), "ftyp", `${nom} is not an mp4`);
    const i = octets.indexOf("mvhd", 0, "latin1");
    assert.ok(i >= 0, `${nom} has no movie header`);
    const version = octets[i + 4];
    const echelle = version === 1 ? octets.readUInt32BE(i + 24) : octets.readUInt32BE(i + 16);
    const duree = version === 1 ? Number(octets.readBigUInt64BE(i + 28)) : octets.readUInt32BE(i + 20);
    const secondes = duree / echelle;
    assert.ok(secondes > 0, `${nom} has no duration`);
    assert.ok(secondes < 120, `${nom} lasts ${secondes}s, not under 2 minutes`);
  }
});
