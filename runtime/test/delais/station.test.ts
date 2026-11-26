// Les délais tels que la station les joue. #4299 : après le merge d'un ticket pris plus de 10 minutes plus tôt,
// son issue reçoit un commentaire avec son temps partagé, et un seul. #4308 : au merge d'un ticket, la station écrit
// sa fiche — titre et labels — au clone, à côté de son temps : les délais de `status` la lisent. Sur un faux GitHub
// et une fausse horloge, comme `temps-ticket/mesure.test.ts`.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { brancheDuTicket, stationGitHub, type GitHubDuTour } from "../../src/brigade-github.ts";
import type { Delais } from "../../src/delais/delais.ts";
import { delaisDuClone } from "../../src/delais/lecture.ts";
import { LABEL_IN_PASS, LABEL_TAKEN } from "../../src/github-etat/etats.ts";
import { repertoireTemporaire } from "../outils.ts";

const MARQUE = "<!-- brigade:delai-de-prise -->";

test("the station merges a ticket taken 16.8 minutes earlier: its issue gets one comment whose parts add up to that time", async (t) => {
  const clone = repertoireTemporaire(t);
  let horloge = Date.UTC(2026, 10, 25, 10);
  const avancer = (secondes: number) => (horloge += secondes * 1000);
  const labels = new Set(["fire", "model:sonnet", "effort:medium"]);
  const postes: { numero: number; body: string }[] = [];
  const faux: { pr: { number: number; sha: string; state: "open" | "closed"; merged: boolean; enRetard: boolean } | null } = { pr: null };
  let ciEnCours = true;
  const github = {
    checksDeLaBase: async () => [{ name: "tests", outcome: "green" as const }],
    fires: async () => [{ number: 7, title: "ticket 7", labels: [...labels], state: "open" as const }],
    dependancesOuvertes: async () => [],
    prDuTicket: async () => (faux.pr === null ? null : { ...faux.pr }),
    prsOuvertes: async () => (faux.pr?.state === "open" ? [{ branche: brancheDuTicket(7), fichiers: ["src/a.ts"] }] : []),
    corpsDuTicket: async () => "",
    ci: async () => [{ name: "tests", outcome: ciEnCours ? ("pending" as const) : ("green" as const) }],
    commentaires: async (numero: number) => postes.filter((p) => p.numero === numero).map(({ body }) => ({ body, author: "station", association: "OWNER", createdAt: new Date(horloge).toISOString() })),
    commenter: async (numero: number, body: string) => void postes.push({ numero, body }),
    labelliser: async (_numero: number, ajout: string[]) => ajout.forEach((label) => labels.add(label)),
    delabelliser: async (_numero: number, label: string) => void labels.delete(label),
    ouvrirPR: async () => {
      faux.pr = { number: 70, sha: "a".repeat(40), state: "open", merged: false, enRetard: false };
      return "https://github.com/faux/depot/pull/70";
    },
    depotDuTicket: async () => null,
    mettreAJour: async () => assert.fail("the branch is up to date"),
    fermerIssue: async () => void labels.delete(LABEL_IN_PASS),
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
    prise: { prendre: async () => (labels.add(LABEL_TAKEN), { prise: true }), lacher: async () => true },
    cuisiner: async () => (avancer(900), { branche: brancheDuTicket(7), testsMs: 0 }),
    juger: async () => (avancer(30), { verdict: "approve", motif: "" }),
    avertir: (texte) => assert.fail(texte),
    clone,
    maintenant: () => new Date(horloge),
  });
  await station.tour();
  await station.calme();
  avancer(50);
  await station.tour();
  await station.relu();
  avancer(20);
  ciEnCours = false;
  await station.tour();
  await station.relu();
  assert.equal(faux.pr?.merged, true);
  await station.tour();
  await station.relu();

  const lents = postes.filter(({ body }) => body.startsWith(MARQUE));
  assert.deepEqual(lents.map(({ numero }) => numero), [7]);
  const corps = lents[0]?.body ?? "";
  t.diagnostic(corps.replaceAll("\n", " ⏎ "));
  const total = Number(/Taken to merged: ([\d.]+) min/.exec(corps)?.[1]);
  assert.equal(total, 16.8);
  const parts = [...corps.matchAll(/^- (?:cook|gates|review|send-backs|waits): ([\d.]+) min$/gm)].map((m) => Number(m[1]));
  assert.equal(parts.length, 5);
  assert.equal(Math.round(parts.reduce((s, p) => s + p, 0) * 10), total * 10);
  assert.match(corps, /- cook: 15 min/);
});

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
