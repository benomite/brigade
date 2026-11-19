// La veille des tickets `taken` sans cook ni attente (#3883) : ce que les tests
// d'acceptation ne tiennent pas — un cook qui peut tourner sur une autre
// station, l'attente lue après la prise, le ticket que la station tient
// elle-même, le temps sans cook qui repart de zéro, une lecture qui échoue.
import assert from "node:assert/strict";
import { test } from "node:test";
import { corpsDePrise } from "../../src/github-etat/prise.ts";
import { LABEL_TAKEN } from "../../src/github-etat/etats.ts";
import { veilleDesOrphelins } from "../../src/reprise-attente/orphelins.ts";
import { CALIBRE, FauxGitHub } from "../faux-github.ts";

const MIN = 60_000;
// Le faux date ses commentaires du 2026-11-02, quelques secondes après minuit :
// à cette heure-là, une prise a dix minutes, un cook peut encore tourner dessous.
const RECENT = Date.UTC(2026, 10, 2) + 10 * MIN;
// Dix-sept jours plus tard, aucun cook ne tourne plus sous cette prise.
const T0 = Date.parse("2026-11-19T14:00:00Z");
const attente = (station: string, jusqua: number) => `<!-- brigade:attente until=${jusqua} -->\nStation \`${station}\`: the cook stopped without a delivery — the station restarted.\n\nThe ticket waits until ${new Date(jusqua).toISOString()}, then is retried.`;

// Une station sans place, qui ne reprend rien, et tourne aux instants donnés (minutes après `debut`).
async function tourner(faux: FauxGitHub, debut: number, minutes: number[], { avant, avertis }: { avant?: (minute: number) => void; avertis?: string[] } = {}) {
  let instant = debut;
  const mac = faux.station("mac", { places: 0, maintenant: () => new Date(instant), ...(avertis === undefined ? {} : { avertir: (texte: string) => void avertis.push(texte) }) });
  for (const minute of minutes) {
    avant?.(minute);
    instant = debut + minute * MIN;
    await mac.tour();
    await mac.calme();
  }
}

test("a ticket another station took ten minutes ago, with no wait, keeps taken: a cook may run there", async () => {
  const faux = new FauxGitHub();
  faux.feu(20, [...CALIBRE, LABEL_TAKEN]);
  faux.poster(20, "box", corpsDePrise("box"));
  // Son voisin, que la même station a mis sur une attente passée : son cook s'est arrêté.
  faux.feu(21, [...CALIBRE, LABEL_TAKEN]);
  faux.poster(21, "box", corpsDePrise("box"));
  faux.poster(21, "box", attente("box", RECENT - MIN));
  await tourner(faux, RECENT, [0, 6, 12]);
  assert.equal(faux.ticket(20).labels.has(LABEL_TAKEN), true);
  assert.equal(faux.ticket(21).labels.has(LABEL_TAKEN), false);
});

test("a ticket another station took recently, then put on a wait that has passed, returns to the rail: the wait says its cook stopped", async () => {
  const faux = new FauxGitHub();
  faux.feu(20, [...CALIBRE, LABEL_TAKEN]);
  faux.poster(20, "box", corpsDePrise("box"));
  faux.poster(20, "box", attente("box", RECENT - MIN));
  await tourner(faux, RECENT, [0, 6]);
  assert.equal(faux.ticket(20).labels.has(LABEL_TAKEN), false);
  assert.match(faux.commentaires.get(20)?.at(-1)?.body ?? "", /^<!-- brigade:lache station=box -->\nStation `mac`: this ticket was `taken` by station `box` with no cook on any station and no wait for more than 5 minutes\. .*returns to the rail\.$/s);
});

test("a wait posted before the claim says nothing of the cook of that claim: the ticket keeps taken", async () => {
  const faux = new FauxGitHub();
  faux.feu(20, [...CALIBRE, LABEL_TAKEN]);
  faux.poster(20, "box", attente("box", RECENT - MIN));
  faux.poster(20, "box", corpsDePrise("box"));
  faux.feu(21, [...CALIBRE, LABEL_TAKEN]);
  faux.poster(21, "box", corpsDePrise("box"));
  faux.poster(21, "box", attente("box", RECENT - MIN));
  await tourner(faux, RECENT, [0, 6, 12]);
  assert.equal(faux.ticket(20).labels.has(LABEL_TAKEN), true);
  assert.equal(faux.ticket(21).labels.has(LABEL_TAKEN), false, "the wait after the claim releases it");
});

test("a ticket this station holds with no cook here returns to the rail after 5 minutes, however recent its claim", async () => {
  const faux = new FauxGitHub();
  // Hors du rail au premier tour : la station ne le rend pas comme une prise d'un runtime d'avant.
  faux.feu(20, CALIBRE.filter((label) => label !== "fire"));
  await tourner(faux, RECENT, [0, 1, 7], {
    avant: (minute) => {
      if (minute !== 1) return;
      for (const label of ["fire", LABEL_TAKEN]) faux.ticket(20).labels.add(label);
      faux.poster(20, "mac", corpsDePrise("mac"));
    },
  });
  assert.equal(faux.ticket(20).labels.has(LABEL_TAKEN), false);
  assert.match(faux.commentaires.get(20)?.at(-1)?.body ?? "", /^<!-- brigade:lache station=mac -->\nStation `mac`: this ticket was `taken` by station `mac` with no cook/);
});

test("5 minutes exactly with no cook and no wait is not more than 5 minutes: the ticket keeps taken until the next turn", async () => {
  const faux = new FauxGitHub();
  faux.feu(20, [...CALIBRE, LABEL_TAKEN]);
  faux.poster(20, "box", corpsDePrise("box"));
  await tourner(faux, T0, [0, 5, 6], { avant: (minute) => minute === 6 && assert.equal(faux.ticket(20).labels.has(LABEL_TAKEN), true, "kept at 5 min") });
  assert.equal(faux.ticket(20).labels.has(LABEL_TAKEN), false, "released at 6 min");
});

test("a live wait in between starts the 5 minutes again", async () => {
  const faux = new FauxGitHub();
  faux.feu(20, [...CALIBRE, LABEL_TAKEN]);
  faux.poster(20, "box", corpsDePrise("box"));
  await tourner(faux, T0, [0, 3, 7, 13], {
    avant: (minute) => {
      if (minute === 3) faux.poster(20, "box", attente("box", T0 + 4 * MIN));
      if (minute === 13) assert.equal(faux.ticket(20).labels.has(LABEL_TAKEN), true, "first seen with no wait at 7 min");
    },
  });
  assert.equal(faux.ticket(20).labels.has(LABEL_TAKEN), false, "released 6 min after");
});

test("a ticket that lost taken in between starts the 5 minutes again", async () => {
  const faux = new FauxGitHub();
  faux.feu(20, [...CALIBRE, LABEL_TAKEN]);
  faux.poster(20, "box", corpsDePrise("box"));
  await tourner(faux, T0, [0, 3, 4, 7, 10], {
    avant: (minute) => {
      if (minute === 3) faux.ticket(20).labels.delete(LABEL_TAKEN);
      if (minute === 4) faux.ticket(20).labels.add(LABEL_TAKEN);
      if (minute === 10) assert.equal(faux.ticket(20).labels.has(LABEL_TAKEN), true, "first seen taken again at 4 min");
    },
  });
  assert.equal(faux.ticket(20).labels.has(LABEL_TAKEN), false, "released 6 min after");
});

test("comments that cannot be read leave the ticket taken, say so, and do not stop the turn", async () => {
  const faux = new FauxGitHub();
  for (const numero of [20, 21]) {
    faux.feu(numero, [...CALIBRE, LABEL_TAKEN]);
    faux.poster(numero, "box", corpsDePrise("box"));
  }
  const lus = faux.commentaires;
  let illisible = false;
  faux.commentaires = new (class extends Map<number, NonNullable<ReturnType<typeof lus.get>>> {
    override get(numero: number) {
      if (illisible && numero === 20) throw new Error("HTTP 502");
      return super.get(numero);
    }
  })(lus);
  const avertis: string[] = [];
  await tourner(faux, T0, [0, 6], { avertis, avant: (minute) => void (illisible = minute === 6) });
  assert.equal(faux.ticket(20).labels.has(LABEL_TAKEN), true);
  assert.equal(faux.ticket(21).labels.has(LABEL_TAKEN), false, "the other orphan is released in the same turn");
  assert.ok(avertis.some((texte) => /#20 on mac — a taken ticket with no cook here could not be checked for an orphan claim: HTTP 502/.test(texte)), avertis.join("\n"));
});

test("taken already gone when it is removed (404) is a release; any other refusal is not swallowed", async () => {
  let instant = T0;
  const commentaires = async () => [{ id: 1, body: corpsDePrise("box"), association: "OWNER", createdAt: "2026-11-02T00:00:01Z" }];
  const parti = veilleDesOrphelins({ github: { commentaires, commenter: async () => {}, delabelliser: async () => Promise.reject(new Error("HTTP 404 — Label does not exist")) }, station: "mac", maintenant: () => instant });
  await parti.voir({ number: 20 });
  instant = T0 + 6 * MIN;
  assert.equal(await parti.voir({ number: 20 }), true);
  instant = T0;
  const refuse = veilleDesOrphelins({ github: { commentaires, commenter: async () => {}, delabelliser: async () => Promise.reject(new Error("HTTP 403 — Forbidden")) }, station: "mac", maintenant: () => instant });
  await refuse.voir({ number: 20 });
  instant = T0 + 6 * MIN;
  await assert.rejects(refuse.voir({ number: 20 }), /HTTP 403/);
});

test("a ticket with a live wait, or that another station took recently, is not released and its 5 minutes do not run", async () => {
  let instant = T0;
  const poses: string[] = [];
  const priseRecente = { id: 1, body: corpsDePrise("box"), association: "OWNER", createdAt: new Date(T0).toISOString() };
  const lus = new Map([
    [20, [priseRecente]],
    [21, [{ ...priseRecente, createdAt: "2026-11-02T00:00:01Z" }, { id: 2, body: attente("box", T0 + 60 * MIN), association: "OWNER", createdAt: "2026-11-02T00:00:02Z" }]],
  ]);
  const veille = veilleDesOrphelins({
    github: { commentaires: async (numero) => lus.get(numero) ?? [], commenter: async (numero) => void poses.push(`comment #${numero}`), delabelliser: async (numero) => void poses.push(`untake #${numero}`) },
    station: "mac",
    maintenant: () => instant,
  });
  for (const minute of [0, 6, 12]) {
    instant = T0 + minute * MIN;
    assert.equal(await veille.voir({ number: 20 }), false, `#20 at ${minute} min`);
    assert.equal(await veille.voir({ number: 21 }), false, `#21 at ${minute} min`);
  }
  assert.deepEqual(poses, []);
});
