// #3448 : sur BOBL-tech/espace, la cuisine est restée retenue par la limite de
// GitHub (`kitchen.held`, cause `github-limit`, `limit: null`), et le ticket
// qui l'a mesurée ne pouvait pas en nommer la cause : ni le refus de GitHub, ni
// les appels qui l'avaient amené, ni ce que la porte de prise disait des tickets
// n'étaient au journal — tout était sur la box. On rejoue la chaîne : des
// appels comptés au compteur de la station, un refus de GitHub, la retenue
// écrite au journal, et la preuve du temps perdu qui la cite.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ouvrirJournal } from "../../src/journal.ts";
import { APPELS_AVANT_LA_PAUSE, constaterLimite, limiteDeLaStation, pausesDeLaStation, type ReponseHttp } from "../../src/limite-github.ts";
import { evenementsDeLaFenetre, LONGUEUR_D_UNE_RETENUE, sectionDuTempsPerdu } from "../../src/preuve-mesure.ts";
import { annoncerRetenue, signauxDeLaStation } from "../../src/retenue/brancher.ts";
import type { CauseDeRetenue } from "../../src/retenue/evenements.ts";
import { detecterRetenue, direSaut, SANS_SIGNAL, type Observation } from "../../src/retenue/retenue.ts";
import { repertoireTemporaire } from "../outils.ts";

const T = (hhmm: string) => Date.parse(`2026-11-12T${hhmm}:00.000Z`);
const iso = (hhmm: string) => new Date(T(hhmm)).toISOString();
const SECONDAIRE: ReponseHttp = {
  statut: 403,
  entetes: new Map([["retry-after", "2100"], ["x-ratelimit-resource", "core"]]),
  corps: JSON.stringify({ message: "You have exceeded a secondary rate limit" }),
};
const SAUT = direSaut(956, "its calibration (model, effort) is incomplete");

test("a pause GitHub starts is kept on the station's counter with its refusal and the calls counted before it; a refusal during the pause adds none (#3448)", async (t) => {
  const station = repertoireTemporaire(t);
  let instant = T("12:19");
  const limite = limiteDeLaStation(station, { maintenant: () => instant });
  t.after(() => limite.fermer());
  // Aucune pause gardée : rien n'est dit, et un répertoire sans compteur non plus.
  assert.equal(pausesDeLaStation(station, instant), null);
  assert.equal(pausesDeLaStation(repertoireTemporaire(t), instant), null);
  assert.equal(pausesDeLaStation(undefined, instant), null);

  for (let i = 0; i < APPELS_AVANT_LA_PAUSE + 2; i += 1) {
    instant += 1000;
    limite.prendre("cuisine", undefined, i % 2 === 0 ? { projet: "espace", lecture: "issues" } : { projet: "brigade", lecture: "issue-comments", ecriture: true });
  }
  instant += 1000;
  const debut = instant;
  const refus = await constaterLimite(limite, SECONDAIRE, { gh: "gh-absent", maintenant: () => instant });
  assert.equal(refus.jusqua, debut + 2100 * 1000);
  // Deux minutes plus tard, un autre refus de la même pause.
  instant += 2 * 60_000;
  await constaterLimite(limite, { ...SECONDAIRE, entetes: new Map([["retry-after", "60"]]) }, { gh: "gh-absent", maintenant: () => instant });

  const dites = pausesDeLaStation(station, instant);
  assert.deepEqual(dites, {
    pauses: 1,
    minutesRefusees: 2,
    derniere: { depuis: debut, jusqua: debut + 2100 * 1000, statut: 403, ressource: "core", retryAfter: "2100" },
    // Le plus récent d'abord, les 5 derniers.
    appelsAvant: [
      { projet: "espace", lecture: "issues", ecriture: false },
      { projet: "brigade", lecture: "issue-comments", ecriture: true },
      { projet: "espace", lecture: "issues", ecriture: false },
      { projet: "brigade", lecture: "issue-comments", ecriture: true },
      { projet: "espace", lecture: "issues", ecriture: false },
    ],
  });

  // La pause passée, une nouvelle se garde à part ; plus d'une heure après sa fin, la première n'est plus dite.
  instant = debut + 2100 * 1000 + 60_000;
  await constaterLimite(limite, SECONDAIRE, { gh: "gh-absent", maintenant: () => instant });
  assert.equal(pausesDeLaStation(station, instant)?.pauses, 2);
  assert.equal(pausesDeLaStation(station, instant)?.derniere.depuis, instant);
  assert.equal(pausesDeLaStation(station, debut + 2100 * 1000 + 61 * 60_000)?.pauses, 1);
});

test("a kitchen held by GitHub's limit writes to the journal the pause, its refusal, the calls before it and the claim gate's skips, and the lost-time evidence cites that line whole (#3448)", async (t) => {
  const station = repertoireTemporaire(t);
  const etat = repertoireTemporaire(t);
  let instant = T("12:19");
  const limite = limiteDeLaStation(station, { maintenant: () => instant });
  t.after(() => limite.fermer());
  for (const etiquette of [{ projet: "espace", lecture: "issues" as const }, { projet: "station", lecture: "gist" as const, ecriture: true }]) {
    instant += 1000;
    limite.prendre("cuisine", undefined, etiquette);
  }
  instant = T("12:20");
  await constaterLimite(limite, SECONDAIRE, { gh: "gh-absent", maintenant: () => instant });

  // 12:50 : rien servi depuis 12:19, #955 attend, et la porte de prise a sauté #956.
  instant = T("12:50");
  const observation: Observation = { eteinte: false, enAttente: [955], attenteDepuis: iso("12:19"), dernierService: null, ouverture: iso("12:17"), explications: [SAUT] };
  const retenue = detecterRetenue(observation, { ...SANS_SIGNAL, ...signauxDeLaStation(station, new Date(instant)), explications: [SAUT] }, new Date(instant));
  assert.ok(retenue);
  const journal = ouvrirJournal(etat, { maintenant: () => new Date(instant) });
  annoncerRetenue(journal, "espace", retenue, observation);
  const [tenue] = journal.base.lire<{ payload: string }>("SELECT payload FROM events WHERE type = 'kitchen.held'");
  journal.fermer();
  assert.ok(tenue);
  const payload = JSON.parse(tenue.payload) as { cause: CauseDeRetenue; skips?: string[] };
  assert.deepEqual(payload.cause, {
    kind: "github-limit",
    limit: null,
    backAt: new Date(T("12:20") + 2100 * 1000).toISOString(),
    pauses: {
      count: 1,
      refusedMinutes: 1,
      last: { at: iso("12:20"), until: new Date(T("12:20") + 2100 * 1000).toISOString(), status: 403, resource: "core", retryAfter: "2100" },
      callsBefore: ["station gist write", "espace issues"],
    },
  });
  assert.deepEqual(payload.skips, [SAUT]);

  // La preuve du temps perdu cite la ligne entière : coupée à 300 caractères, elle s'arrêtait avant les pauses.
  const evenements = evenementsDeLaFenetre(etat, iso("12:00"), iso("13:00"));
  const section = sectionDuTempsPerdu([], { debut: iso("12:00"), fin: iso("13:00"), evenements });
  const ligne = section.split("\n").find((l) => l.includes("`kitchen.held`"));
  assert.ok(ligne);
  assert.ok(ligne.length > 300 && ligne.length < LONGUEUR_D_UNE_RETENUE, String(ligne.length));
  assert.ok(ligne.includes('"callsBefore":["station gist write","espace issues"]'), ligne);
  assert.ok(ligne.includes(`skips=["${SAUT}"]`), ligne);
});

test("a hold whose cause is the claim gate's lines keeps them in its cause only, and a hold with no skip writes no `skips` (#3448)", (t) => {
  const etat = repertoireTemporaire(t);
  const instant = T("12:50");
  const journal = ouvrirJournal(etat, { maintenant: () => new Date(instant) });
  t.after(() => journal.fermer());
  const avecSaut: Observation = { eteinte: false, enAttente: [956], attenteDepuis: iso("12:00"), dernierService: null, ouverture: null, explications: [SAUT] };
  annoncerRetenue(journal, "espace", detecterRetenue(avecSaut, { ...SANS_SIGNAL, explications: [SAUT] }, new Date(instant)), avecSaut);
  const sansSaut: Observation = { ...avecSaut, explications: [] };
  annoncerRetenue(journal, "espace", detecterRetenue(sansSaut, SANS_SIGNAL, new Date(instant)), sansSaut);
  const payloads = journal.base.lire<{ payload: string }>("SELECT payload FROM events WHERE type = 'kitchen.held' ORDER BY seq").map(({ payload }) => JSON.parse(payload) as { cause: CauseDeRetenue; skips?: unknown });
  assert.deepEqual(
    payloads.map(({ cause, skips }) => ({ kind: cause.kind, skips })),
    [
      { kind: "tickets", skips: undefined },
      { kind: "unknown", skips: undefined },
    ],
  );
});
