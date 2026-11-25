// #1550, critère 3 : le fichier vidéo pèse moins de 25 Mo.
// Test d'acceptation : mesure les mp4 commités de docs/demo/.
import assert from "node:assert/strict";
import { readdirSync, statSync } from "node:fs";
import { test } from "node:test";

const DEMO = new URL("../../../docs/demo/", import.meta.url);

test("every video in docs/demo/ is under 25 MB, and there is one", () => {
  const videos = readdirSync(DEMO).filter((nom) => nom.endsWith(".mp4"));
  assert.ok(videos.length >= 1, "no .mp4 in docs/demo/");
  for (const nom of videos) {
    const taille = statSync(new URL(nom, DEMO)).size;
    assert.ok(taille < 25 * 1024 * 1024, `${nom} weighs ${taille} bytes`);
  }
});
