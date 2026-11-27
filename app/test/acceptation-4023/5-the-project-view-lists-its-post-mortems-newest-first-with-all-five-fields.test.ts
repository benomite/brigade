import assert from "node:assert/strict";
import { test } from "node:test";
import { vueOfPostMortems } from "../../src/projects/post-mortems.ts";

// #4023 : la vue du projet liste ses post-mortems, le plus récent d'abord, avec les cinq champs.
const pm = (cause: string, end: string) => ({ cause, duree: "45 min", vuEnPremier: "system", corrige: `fix of ${cause}`, ticket: `#${cause.length}`, fin: end });

test("three post-mortems are listed newest first, each with its five fields", () => {
  const vue = vueOfPostMortems(
    [pm("oldest", "2026-11-10T10:00:00.000Z"), pm("newest", "2026-11-22T10:00:00.000Z"), pm("middle", "2026-11-15T10:00:00.000Z")],
    new Date("2026-11-23T12:00:00.000Z"),
  );
  assert.deepEqual(vue.lignes.map((l) => l.cause), ["newest", "middle", "oldest"]);
  const [first] = vue.lignes;
  const text = JSON.stringify(first);
  for (const field of ["newest", "45 min", "system", "fix of newest", "#6"]) assert.ok(text.includes(field), `the line shows ${field}`);
});
