import assert from "node:assert/strict";
import { test } from "node:test";
import { parseCarnet, writeCarnet, type Carnet, type Lesson } from "../../src/carnet/carnet.ts";
import { lireSeuils, VARIABLES } from "../../src/seuils/seuils.ts";
import type { Retro } from "../../src/apprentissage/provisoires.ts";
import { decider, histoireDesRetros, type Citation, type LeconHistoire } from "../../src/peremption/peremption.ts";

const SEUILS = lireSeuils({});
const AUJOURDHUI = "2026-12-31";
const VIDE: Carnet = { lessons: [] };

// Une citation de la rétro du ticket servi au rang `servi` : sa référence est
// `retro-<servi>`, son jour se lit du rang pour rester croissant.
const cite = (servi: number, ticket: number, genre: Citation["genre"] = "reconfirme"): Citation => ({
  genre,
  retro: `retro-${servi}`,
  ticket,
  servi,
  date: jour(servi),
});
const jour = (servi: number) => new Date(Date.UTC(2026, 0, 1) + servi * 86_400_000).toISOString().slice(0, 10);

const lecon = (id: string, ...citations: Citation[]): LeconHistoire => ({ id, texte: `La leçon ${id}.`, citations, origin: { kind: "retro" } });

const juger = (histoire: LeconHistoire[], servis: number, carnet: Carnet = VIDE, seuils = SEUILS) => decider({ histoire, carnet, seuils, servis, aujourdhui: AUJOURDHUI });

const promue = (id: string, entered: string, retros: string[]): Lesson => ({ id, text: `La leçon ${id}.`, state: "promoted", entered, retros, origin: { kind: "retro" } });

test("trois rétros de trois tickets différents promeuvent la leçon ; trois rétros de deux tickets, non", () => {
  const trois = juger([lecon("L1", cite(1, 101, "propose"), cite(2, 102), cite(3, 103))], 3);
  assert.deepEqual(trois.decisions, [{ kind: "promote", lesson: "L1", retros: ["retro-1", "retro-2", "retro-3"] }]);
  assert.deepEqual(trois.carnet.lessons, [promue("L1", jour(3), ["retro-1", "retro-2", "retro-3"])]);

  // Le ticket 102, servi deux fois, a deux rétros : elles comptent pour une.
  const deux = juger([lecon("L1", cite(1, 101, "propose"), cite(2, 102), cite(3, 102))], 3);
  assert.deepEqual(deux.decisions, []);
  assert.deepEqual(deux.carnet, VIDE);
});

test("une leçon promue sans reconfirmation pendant 20 tickets servis redevient provisoire ; une reconfirmation au 19e remet le compte à zéro", () => {
  const histoire = [lecon("L1", cite(1, 101, "propose"), cite(2, 102), cite(3, 103))];
  const carnet = juger(histoire, 3).carnet;

  assert.deepEqual(juger(histoire, 22, carnet).decisions, [], "19 tickets servis depuis : elle reste promue");
  const echue = juger(histoire, 23, carnet);
  assert.deepEqual(echue.decisions, [{ kind: "demote", lesson: "L1", retros: ["retro-3"] }]);
  assert.deepEqual(echue.carnet, VIDE, "provisoire, elle quitte le carnet du dépôt pour la base");

  const reconfirmee = [lecon("L1", cite(1, 101, "propose"), cite(2, 102), cite(3, 103), cite(22, 122))];
  assert.deepEqual(juger(reconfirmee, 23, carnet).decisions, [], "reconfirmée au 19e ticket servi");
  assert.deepEqual(juger(reconfirmee, 41, carnet).decisions, [], "19 tickets servis depuis la reconfirmation");
  assert.deepEqual(juger(reconfirmee, 42, carnet).decisions, [{ kind: "demote", lesson: "L1", retros: ["retro-22"] }]);
});

test("une leçon rétrogradée que rien ne reconfirme 20 tickets servis plus tard est supprimée, sa sortie inscrite au carnet comme expirée", () => {
  const histoire = [lecon("L1", cite(1, 101, "propose"), cite(2, 102), cite(3, 103))];
  const promu = juger(histoire, 3).carnet;
  const retrograde = juger(histoire, 23, promu).carnet;

  assert.deepEqual(juger(histoire, 42, retrograde).decisions, [], "19 tickets servis depuis la rétrogradation : elle reste provisoire");
  const supprimee = juger(histoire, 43, retrograde);
  assert.deepEqual(supprimee.decisions, [{ kind: "delete", lesson: "L1", retros: ["retro-3"] }]);
  assert.deepEqual(supprimee.carnet.lessons, [
    { ...promue("L1", jour(3), ["retro-1", "retro-2", "retro-3"]), state: "expired", exit: { date: AUJOURDHUI, reason: "expiry" } },
  ]);
  // Le carnet résultant s'écrit et se relit tel quel, sortie comprise.
  assert.match(writeCarnet(supprimee.carnet), /## L1\n- état: expired\n[\s\S]*- sortie: 2026-12-31\n- raison: expiry\n/);
  assert.deepEqual(parseCarnet(writeCarnet(supprimee.carnet)), supprimee.carnet);

  assert.deepEqual(juger(histoire, 80, supprimee.carnet).decisions, [], "une sortie décidée ne se redécide pas");
});

test("rétrogradée, une leçon ne remonte qu'avec de nouvelles rétros de tickets distincts", () => {
  const anciennes = [cite(1, 101, "propose"), cite(2, 102), cite(3, 103)];
  const retrograde = juger([lecon("L1", ...anciennes)], 23, juger([lecon("L1", ...anciennes)], 3).carnet).carnet;

  const deux = [lecon("L1", ...anciennes, cite(30, 130), cite(31, 131))];
  assert.deepEqual(juger(deux, 31, retrograde).decisions, [], "ses anciennes citations ne comptent plus");
  const trois = [lecon("L1", ...anciennes, cite(30, 130), cite(31, 131), cite(32, 132))];
  assert.deepEqual(juger(trois, 32, retrograde).decisions, [{ kind: "promote", lesson: "L1", retros: ["retro-30", "retro-31", "retro-32"] }]);
});

test("une leçon provisoire jamais promue disparaît 20 tickets servis après sa dernière citation", () => {
  const histoire = [lecon("L1", cite(4, 104, "propose"), cite(6, 106))];
  assert.deepEqual(juger(histoire, 25).decisions, []);
  const supprimee = juger(histoire, 26);
  assert.deepEqual(supprimee.decisions, [{ kind: "delete", lesson: "L1", retros: ["retro-6"] }]);
  assert.deepEqual(supprimee.carnet.lessons, [
    { id: "L1", text: "La leçon L1.", state: "expired", entered: jour(4), retros: ["retro-4", "retro-6"], origin: { kind: "retro" }, exit: { date: AUJOURDHUI, reason: "expiry" } },
  ]);
});

test("une leçon garde son origine au carnet, promue puis expirée ; celle que le carnet a écrite prime", () => {
  const renvoi = { kind: "pass-send-back", ticket: 77 } as const;
  const histoire = [{ ...lecon("L1", cite(1, 101, "propose"), cite(2, 102), cite(3, 103)), origin: renvoi }];
  const promu = juger(histoire, 3).carnet;
  assert.deepEqual(promu.lessons.map((l) => l.origin), [renvoi]);
  assert.match(writeCarnet(promu), /- origine: pass-send-back #77\n/);
  const supprimee = juger(histoire, 43, promu).carnet;
  assert.deepEqual(supprimee.lessons.map((l) => [l.state, l.origin]), [["expired", renvoi]]);

  const correction = { kind: "chef-correction", ticket: 5 } as const;
  const retiree: Lesson = { ...promue("L1", jour(3), ["retro-1"]), origin: correction, state: "retired", exit: { date: jour(3), reason: "manual" } };
  const repromue = juger([{ ...lecon("L1", cite(1, 101, "propose"), cite(7, 107), cite(8, 108), cite(9, 109)), origin: renvoi }], 9, { lessons: [retiree] });
  assert.deepEqual(repromue.carnet.lessons.map((l) => [l.state, l.origin]), [["promoted", correction]]);
});

test("une leçon promue que rien ne reconfirme depuis 40 tickets est rétrogradée puis supprimée d'un même jugement", () => {
  const histoire = [lecon("L1", cite(1, 101, "propose"), cite(2, 102), cite(3, 103))];
  const r = juger(histoire, 43, juger(histoire, 3).carnet);
  assert.deepEqual(r.decisions, [
    { kind: "demote", lesson: "L1", retros: ["retro-3"] },
    { kind: "delete", lesson: "L1", retros: ["retro-3"] },
  ]);
  assert.equal(r.carnet.lessons[0]?.state, "expired");
});

test("une leçon retirée n'est pas repromue par ses reconfirmations d'avant le retrait, mais l'est par trois rétros nouvelles de trois tickets", () => {
  const retiree: Lesson = { ...promue("L1", jour(3), ["retro-1", "retro-2", "retro-3"]), state: "retired", exit: { date: jour(5), reason: "manual" } };
  const carnet: Carnet = { lessons: [retiree] };
  // Trois reconfirmations d'avant le retrait — dont une du jour même, tenue pour antérieure.
  const avant = [cite(1, 101, "propose"), cite(2, 102), cite(3, 103), cite(4, 104), cite(5, 105)];

  const sansNouvelles = juger([lecon("L1", ...avant)], 6, carnet);
  assert.deepEqual(sansNouvelles.decisions, []);
  assert.deepEqual(sansNouvelles.carnet, carnet, "elle garde son id et sa sortie");

  const deuxNouvelles = [lecon("L1", ...avant, cite(7, 107), cite(8, 108))];
  assert.deepEqual(juger(deuxNouvelles, 8, carnet).decisions, [], "deux rétros nouvelles ne suffisent pas, même avec les anciennes");

  const troisNouvelles = [lecon("L1", ...avant, cite(7, 107), cite(8, 108), cite(9, 109))];
  const r = juger(troisNouvelles, 9, carnet);
  assert.deepEqual(r.decisions, [{ kind: "promote", lesson: "L1", retros: ["retro-7", "retro-8", "retro-9"] }]);
  assert.deepEqual(r.carnet.lessons, [promue("L1", jour(9), ["retro-1", "retro-2", "retro-3", "retro-4", "retro-5", "retro-7", "retro-8", "retro-9"])]);
});

test("les seuils viennent des réglages : avec une promotion à 2, deux rétros suffisent", () => {
  const seuils = lireSeuils({ [VARIABLES.promotion]: "2" });
  const histoire = [lecon("L1", cite(1, 101, "propose"), cite(2, 102))];
  assert.deepEqual(juger(histoire, 2).decisions, [], "au défaut de 3, deux ne suffisent pas");
  assert.deepEqual(juger(histoire, 2, VIDE, seuils).decisions, [{ kind: "promote", lesson: "L1", retros: ["retro-1", "retro-2"] }]);

  const courts = lireSeuils({ [VARIABLES.expirationPromue]: "5", [VARIABLES.expirationProvisoire]: "7" });
  const promu = juger([lecon("L1", cite(1, 101, "propose"), cite(2, 102), cite(3, 103))], 3, VIDE, courts).carnet;
  const trois = [lecon("L1", cite(1, 101, "propose"), cite(2, 102), cite(3, 103))];
  assert.deepEqual(juger(trois, 7, promu, courts).decisions, []);
  assert.deepEqual(juger(trois, 8, promu, courts).decisions.map((d) => d.kind), ["demote"]);
  assert.deepEqual(juger(trois, 15, { lessons: [] }, courts).decisions.map((d) => d.kind), ["delete"]);
});

test("chaque décision nomme ses rétros, et les décisions vont dans l'ordre des ids", () => {
  const histoire = [
    lecon("L10", cite(28, 128, "propose"), cite(29, 129), cite(30, 130)),
    lecon("L2", cite(1, 101, "propose")),
    lecon("L3", cite(2, 102, "propose"), cite(30, 130)),
  ];
  const r = juger(histoire, 30);
  assert.deepEqual(r.decisions, [
    { kind: "delete", lesson: "L2", retros: ["retro-1"] },
    { kind: "promote", lesson: "L10", retros: ["retro-28", "retro-29", "retro-30"] },
  ]);
  for (const d of r.decisions) assert.ok(d.retros.length > 0, `${d.kind} ${d.lesson} nomme ses rétros`);
});

test("une entrée incohérente est refusée en le disant", () => {
  assert.throws(() => juger([lecon("L1", cite(4, 104))], 3), /rang 4, hors des 3 tickets servis/);
  assert.throws(() => juger([lecon("L1", cite(1, 101)), lecon("L1", cite(2, 102))], 3), /« L1 » apparaît deux fois/);
  assert.throws(() => decider({ histoire: [], carnet: VIDE, seuils: { ...SEUILS, promotion: 0 }, servis: 1, aujourdhui: AUJOURDHUI }), /seuil promotion/);
  assert.throws(() => decider({ histoire: [], carnet: VIDE, seuils: SEUILS, servis: 1, aujourdhui: "demain" }), /AAAA-MM-JJ/);
});

test("l'histoire se tire des rétros du journal : rang de service, jour, ticket et id de chaque citation", () => {
  const retro = (seq: number, ticket: number, at: string, kept: Retro["kept"]): Retro => ({ ref: `retro-${seq}`, seq, at, project: "p", ticket, run: null, text: null, kept, dropped: [] });
  const retros = [
    retro(10, 101, "2026-10-01T09:00:00.000Z", [{ kind: "propose", text: "Lire le CLAUDE.md." }]),
    retro(14, 102, "2026-10-02T09:00:00.000Z", []),
    retro(20, 103, "2026-10-03T09:00:00.000Z", [{ kind: "reconfirm", id: "L1" }, { kind: "propose", text: "Commiter avant de s'arrêter." }]),
  ];
  assert.deepEqual(histoireDesRetros(retros), [
    {
      id: "L1",
      texte: "Lire le CLAUDE.md.",
      origin: { kind: "retro" },
      citations: [
        { genre: "propose", retro: "retro-10", ticket: 101, servi: 1, date: "2026-10-01" },
        { genre: "reconfirme", retro: "retro-20", ticket: 103, servi: 3, date: "2026-10-03" },
      ],
    },
    { id: "L2", texte: "Commiter avant de s'arrêter.", origin: { kind: "retro" }, citations: [{ genre: "propose", retro: "retro-20", ticket: 103, servi: 3, date: "2026-10-03" }] },
  ]);
});
