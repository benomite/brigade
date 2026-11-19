// #3763 : ce que la carte dit quand une lecture manque — des commentaires illisibles ne la disent jamais libre.
import assert from "node:assert/strict";
import { test } from "node:test";
import { lignesDeLAttente } from "../../src/attente-du-rail/status.ts";
import { DEPOT } from "../outils.ts";

const MAINTENANT = Date.parse("2026-11-17T10:00:00.000Z");
const FEUX = `/repos/${DEPOT}/issues?state=open&labels=fire&sort=created&direction=asc&per_page=100&page=1`;
const issue = (number: number) => ({ number, title: `#${number}`, body: "", created_at: "2026-11-17T09:00:00Z", labels: [{ name: "fire" }] });

test("des commentaires qui ne se lisent pas : la carte dit qu'ils ne se sont pas lus, elle n'est pas dite libre", async () => {
  const lire = async (chemin: string) => {
    if (chemin === FEUX) return [issue(5)];
    if (chemin.includes("/comments")) throw new Error("GitHub answered HTTP 502");
    return chemin.includes("/events?") ? [] : assert.fail(`not dictated: ${chemin}`);
  };
  const dites = await lignesDeLAttente({ depot: DEPOT, lire, stations: async () => ({ lues: [] }), maintenant: MAINTENANT });
  assert.ok(dites.some((l) => l.trimStart().startsWith("#5 ") && l.includes("its card and its cooks' stops could not be read on GitHub")), dites.join("\n"));
});
