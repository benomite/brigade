// #2429 : la nuit du 5 novembre 2026, la ligne de la cuisine retenue disait
// « cause unknown » alors que GitHub refusait encore les appels (sa reprise dite
// était passée), puis quand un ticket attendait un autre mis de côté. On rejoue
// la séquence : la limite, la reprise passée sous des refus qui durent, puis la
// dépendance et la porte de prise.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { GitHubDuTour, TicketLu } from "../../src/brigade-github.ts";
import { LimiteGitHubAtteinte, limiteDeLaStation } from "../../src/limite-github.ts";
import { explicationsDuRail, signauxDeLaStation } from "../../src/retenue/brancher.ts";
import { direCause, diagnostiquer, SANS_SIGNAL } from "../../src/retenue/retenue.ts";
import { suivreLeTour } from "../../src/retenue/tour.ts";
import { repertoireTemporaire } from "../outils.ts";

const T = (hhmm: string) => Date.parse(`2026-11-05T${hhmm}:00.000Z`);
const heureLocale = (hhmm: string) => {
  const d = new Date(T(hhmm));
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

test("la limite de GitHub reste la cause tant que ses refus durent, la reprise dite fût-elle passée", (t) => {
  const station = repertoireTemporaire(t);
  let instant = T("09:04");
  const limite = limiteDeLaStation(station, { maintenant: () => instant });
  t.after(() => limite.fermer());
  limite.suspendre(T("09:19"));
  assert.throws(() => limite.prendre(), LimiteGitHubAtteinte);

  instant = T("09:07");
  const dite = diagnostiquer({ ...SANS_SIGNAL, ...signauxDeLaStation(station, new Date(instant)) });
  assert.equal(direCause(dite.cause), `cause: GitHub is rate-limiting calls (limit reached), back around ${heureLocale("09:19")}`);

  // 09:21 : la reprise est passée, GitHub refuse encore (le tour a levé l'erreur à 09:20).
  instant = T("09:20");
  limite.suspendre(T("09:19") + 60_000 * 3);
  assert.throws(() => limite.prendre(), LimiteGitHubAtteinte);
  instant = T("09:25");
  limite.suspendre(T("09:26"));
  instant = T("09:27");
  const apres = signauxDeLaStation(station, new Date(instant));
  assert.equal(apres.limiteGitHub?.refusedAt, new Date(T("09:25")).toISOString());
  const ligne = direCause(diagnostiquer({ ...SANS_SIGNAL, ...apres }).cause);
  assert.match(ligne, /^cause: GitHub is rate-limiting calls \(limit reached\), calls still refused at /);
  assert.doesNotMatch(ligne, /unknown/);

  // Des minutes sans aucun refus : la limite ne tient plus rien.
  instant = T("09:40");
  assert.equal(signauxDeLaStation(station, new Date(instant)).limiteGitHub, null);
});

test("un ticket qui en attend un mis de côté le dit, avec la ligne de raison", () => {
  const rail = [
    { ticket: 2187, state: "waiting", awaits: [{ ticket: 2186, left: { reason: "hors-cuisine: the chef set it aside", seq: 5 } }], held: [], waitingFor: null },
    { ticket: 2400, state: "waiting", awaits: [{ ticket: 2399, left: null }], held: [], waitingFor: null },
  ] as unknown as Parameters<typeof explicationsDuRail>[0];
  const lignes = explicationsDuRail(rail);
  assert.deepEqual(lignes, ["#2187 waits on #2186, set aside: hors-cuisine: the chef set it aside"]);
  const { cause } = diagnostiquer({ ...SANS_SIGNAL, explications: lignes });
  assert.equal(direCause(cause), "cause: #2187 waits on #2186, set aside: hors-cuisine: the chef set it aside");
});

test("un ticket prenable que la porte de prise a sauté dit pourquoi", async () => {
  const suivi = suivreLeTour(() => new Date(T("10:22")));
  const tickets: TicketLu[] = [{ number: 2383, title: "t", labels: ["fire", "model:opus", "effort:high"], state: "open" }];
  const github = suivi.envelopper({ fires: async () => tickets } as unknown as GitHubDuTour);
  await github.fires();
  suivi.sauter(2383, "zone held by #2390");
  const { cause } = diagnostiquer({ ...SANS_SIGNAL, explications: suivi.vue().explications });
  assert.equal(direCause(cause), "cause: #2383 is claimable but not claimed, the claim gate skipped it: zone held by #2390");
  // Le tour suivant relit les tickets : ce que la porte n'a pas redit tombe.
  await github.fires();
  assert.deepEqual(suivi.vue().explications, []);
  assert.match(direCause(diagnostiquer(SANS_SIGNAL).cause), /^cause unknown/);
});
