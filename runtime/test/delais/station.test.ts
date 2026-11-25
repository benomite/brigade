// #4308 : au merge d'un ticket, la station écrit sa fiche — titre et labels — au clone, à côté de son temps : les
// délais de `status` la lisent. Sur un faux GitHub et une fausse horloge, comme `temps-ticket/mesure.test.ts`.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { brancheDuTicket, stationGitHub, type GitHubDuTour } from "../../src/brigade-github.ts";
import type { Delais } from "../../src/delais/delais.ts";
import { delaisDuClone } from "../../src/delais/lecture.ts";
import { LABEL_TAKEN } from "../../src/github-etat/etats.ts";
import { repertoireTemporaire } from "../outils.ts";

test("after the station merges a ticket, the clone holds its title and labels, and its delay reads them", async (t) => {
  const clone = repertoireTemporaire(t);
  let horloge = Date.UTC(2026, 10, 25, 8);
  const avancer = (secondes: number) => (horloge += secondes * 1000);
  const labels = new Set(["fire", "model:sonnet", "effort:medium", "attendu:1"]);
  const commentaires: Array<{ id: number; body: string; association: string; createdAt: string }> = [];
  const faux: { pr: { number: number; sha: string; state: "open" | "closed"; merged: boolean; enRetard: boolean } | null } = { pr: null };
  const github = {
    checksDeLaBase: async () => [{ name: "tests", outcome: "green" as const }],
    fires: async () => [{ number: 7, title: "ticket 7", labels: [...labels], state: "open" as const }],
    dependancesOuvertes: async () => [],
    prDuTicket: async () => (faux.pr === null ? null : { ...faux.pr }),
    prsOuvertes: async () => (faux.pr?.state === "open" ? [{ branche: brancheDuTicket(7), fichiers: ["src/a.ts"] }] : []),
    corpsDuTicket: async () => "",
    ci: async () => [{ name: "tests", outcome: "green" as const }],
    commentaires: async () => [...commentaires],
    commenter: async (_numero: number, body: string) => {
      commentaires.push({ id: commentaires.length + 1, body, association: "OWNER", createdAt: new Date(horloge).toISOString() });
    },
    labelliser: async (_numero: number, ajout: string[]) => ajout.forEach((label) => labels.add(label)),
    delabelliser: async (_numero: number, label: string) => {
      labels.delete(label);
    },
    ouvrirPR: async () => {
      faux.pr = { number: 70, sha: "a".repeat(40), state: "open", merged: false, enRetard: false };
      return "https://github.com/faux/depot/pull/70";
    },
    depotDuTicket: async () => null,
    mettreAJour: async () => assert.fail("the branch is up to date"),
    fermerIssue: async () => {},
    merger: async () => {
      avancer(5);
      if (faux.pr !== null) Object.assign(faux.pr, { merged: true, state: "closed" });
      return { fait: true as const };
    },
  } as unknown as GitHubDuTour;
  const station = stationGitHub({
    nom: "A",
    places: 1,
    base: "main",
    github,
    prise: {
      prendre: async () => {
        labels.add(LABEL_TAKEN);
        return { prise: true };
      },
      lacher: async () => true,
    },
    cuisiner: async () => {
      avancer(100);
      return { branche: brancheDuTicket(7), testsMs: 0 };
    },
    juger: async () => {
      avancer(30);
      return { verdict: "approve", motif: "" };
    },
    avertir: () => {},
    clone,
    maintenant: () => new Date(horloge),
  });
  for (let tour = 0; tour < 4 && faux.pr?.merged !== true; tour++) {
    await station.tour();
    await station.calme();
    await station.relu();
    avancer(60);
  }
  assert.equal(faux.pr?.merged, true);
  const [fiche] = JSON.parse(readFileSync(join(clone, ".claude/brigade/delais-tickets.json"), "utf8")) as { ticket: number; titre: string; etiquettes: string[] }[];
  assert.equal(fiche?.ticket, 7);
  assert.equal(fiche?.titre, "ticket 7");
  assert.ok(fiche?.etiquettes.includes("attendu:1"));
  const delais = delaisDuClone(clone, new Date(horloge)) as Delais;
  assert.equal(delais.fusionnes, 1);
  assert.equal(delais.sans_temps_attendu, 0);
  assert.deepEqual(delais.pires_depassements.map(({ ticket, titre, modele, effort }) => ({ ticket, titre, modele, effort })), [{ ticket: 7, titre: "ticket 7", modele: "sonnet", effort: "medium" }]);
});
