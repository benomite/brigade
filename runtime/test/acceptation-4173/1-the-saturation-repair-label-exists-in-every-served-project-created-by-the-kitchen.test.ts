// Test d'acceptation gelé (#4173), critère 1. Le contrat que ce test fixe, parce que le ticket le laisse ouvert :
// `runtime/src/labels-des-projets.ts` exporte `garantirLabelsDesProjets({ projets, client })` -> `Promise<void>`.
// `projets` : `{ github: string }[]` (les dépôts servis, `owner/repo`) ; `client(depot)` rend le `ClientGitHub` de ce dépôt.
// La cuisine y crée elle-même `saturation-repair` quand il manque, sans toucher à ce qui est déjà là.
import assert from "node:assert/strict";
import { test } from "node:test";
import { garantirLabelsDesProjets } from "../../src/labels-des-projets.ts";
import type { ClientGitHub } from "../../src/proteger-branche.ts";

function depotFaux(presents: string[]) {
  const labels = new Set(presents);
  const client: ClientGitHub = async (requete) => {
    if (requete.methode === "GET") return { statut: 200, corps: [...labels].map((name) => ({ name, description: null })), scopes: null };
    if (requete.methode === "POST") labels.add((requete.corps as { name: string }).name);
    return { statut: 201, corps: {}, scopes: null };
  };
  return { labels, client };
}

test("the kitchen creates `saturation-repair` in every project it serves that lacks it", async () => {
  const a = depotFaux([]);
  const b = depotFaux(["fix", "tech"]);
  const c = depotFaux(["saturation-repair"]);
  const parDepot: Record<string, ReturnType<typeof depotFaux>> = { "o/a": a, "o/b": b, "o/c": c };
  await garantirLabelsDesProjets({ projets: [{ github: "o/a" }, { github: "o/b" }, { github: "o/c" }], client: (depot) => parDepot[depot]!.client });
  for (const [depot, faux] of Object.entries(parDepot)) assert.ok(faux.labels.has("saturation-repair"), `${depot} has no saturation-repair label`);
});
