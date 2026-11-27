// L'écran « since you were away » (#3305) : la décision à l'ouverture — premier lancement sans écran, trois jours pile sans
// écran, au-delà avec écran, la date réécrite à chaque ouverture, rien de plus tant qu'une nouvelle absence ne vient pas ;
// puis l'écran lui-même : les lignes des résumés de l'absence, ce qui attend le chef et son nombre, le bloc d'autonomie
// absent ou présent, et son bouton unique.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { resumeDeLaSemaine } from "../../../runtime/src/resume-hebdomadaire/resume.ts";
import type { ResumesOfProject } from "../../src/vue/resume-weekly/resume-kitchen.ts";
import { AUTONOMY } from "../../src/vue/resume-weekly/resume-weekly.js";
import { absenceALAperture, KEY_OF_THE_LAST_OPENING, CLOSE, setAbsence, NOTHING_N_AWAITING, THRESHOLD_MS, SEE_WHAT_AWAITING } from "../../src/vue/absence/absence.js";
import { Fake } from "../helpers/false-vue.ts";

const doc = { createElement: (balise: string) => new Fake(balise) };
const NOW = Date.parse("2026-11-11T12:00:00Z");
const storage = (value?: string) => {
  const guard = new Map<string, string>(value === undefined ? [] : [[KEY_OF_THE_LAST_OPENING, value]]);
  return { garde: guard, getItem: (key: string) => guard.get(key) ?? null, setItem: (key: string, v: string) => void guard.set(key, v) };
};
const it_y_a = (ms: number) => new Date(NOW - ms).toISOString();

describe("la décision à l'ouverture", () => {
  test("premier lancement : pas d'écran, et la date est posée", () => {
    const s = storage();
    assert.equal(absenceALAperture({ stockage: s, maintenant: () => NOW }), undefined);
    assert.equal(s.garde.get(KEY_OF_THE_LAST_OPENING), new Date(NOW).toISOString());
  });
  test("sous trois jours : pas d'écran ; trois jours pile : pas d'écran ; au-delà : l'écran, avec l'ancienne date", () => {
    assert.equal(absenceALAperture({ stockage: storage(it_y_a(THRESHOLD_MS - 1)), maintenant: () => NOW }), undefined);
    assert.equal(absenceALAperture({ stockage: storage(it_y_a(THRESHOLD_MS)), maintenant: () => NOW }), undefined);
    assert.equal(absenceALAperture({ stockage: storage(it_y_a(THRESHOLD_MS + 1)), maintenant: () => NOW }), NOW - THRESHOLD_MS - 1);
  });
  test("la date est réécrite à chaque ouverture : l'écran montré ne revient pas à l'ouverture suivante", () => {
    const s = storage(it_y_a(5 * 24 * 3600_000));
    assert.notEqual(absenceALAperture({ stockage: s, maintenant: () => NOW }), undefined);
    assert.equal(s.garde.get(KEY_OF_THE_LAST_OPENING), new Date(NOW).toISOString());
    assert.equal(absenceALAperture({ stockage: s, maintenant: () => NOW + 60_000 }), undefined);
    // Une nouvelle absence de plus de trois jours le ramène.
    assert.notEqual(absenceALAperture({ stockage: s, maintenant: () => NOW + THRESHOLD_MS + 60_001 }), undefined);
  });
  test("un stockage absent, une trace illisible, un stockage qui refuse : pas d'écran, et l'app s'ouvre", () => {
    assert.equal(absenceALAperture({ stockage: undefined, maintenant: () => NOW }), undefined);
    const s = storage("n'importe quoi");
    assert.equal(absenceALAperture({ stockage: s, maintenant: () => NOW }), undefined);
    assert.equal(s.garde.get(KEY_OF_THE_LAST_OPENING), new Date(NOW).toISOString());
    const broken = {
      getItem: () => {
        throw new Error("refus");
      },
      setItem: () => {
        throw new Error("refus");
      },
    };
    assert.equal(absenceALAperture({ stockage: broken, maintenant: () => NOW }), undefined);
  });
});

const url = (n: number) => `https://github.com/chef/parade/issues/${n}`;
const week = (autonomy: boolean) =>
  resumeDeLaSemaine({
    project: "parade",
    weekStart: "2026-11-02",
    weekEnd: "2026-11-08",
    servis: [{ number: 12, title: "feat(#12): show the rail age on the tile", url: url(12), labels: [], epic: null }],
    ...(autonomy ? { autonomie: { tickets: 3, sansHumain: 2, partSansHumain: 2 / 3, delaiMedianMs: 5 * 3600_000, renvoyes: 1, partRenvoyee: 1 / 3, avecHumain: [] } as never } : {}),
    attentes: [],
  });
const reading = (resume: ReturnType<typeof week>): ResumesOfProject => ({ projet: "parade", jour: { jour: "monday", pose: false }, resumes: { resumes: [resume], illisibles: [] } });
const SINCE = Date.parse("2026-11-05T09:00:00Z");

describe("l'écran", () => {
  test("liste ce qui a été servi avec les mots du résumé, et ce qui attend le chef avec son nombre ; l'autonomie présente est montrée", () => {
    const closes: boolean[] = [];
    const screen = setAbsence(doc, { depuis: SINCE, projets: [{ projet: "parade", lecture: reading(week(true)), attentes: [{ ticket: 21, titre: "Keep the old route?" }, { ticket: 22 }] }] }, { fermer: (awaiting) => closes.push(awaiting) }) as Fake;
    const text = screen.textContent;
    const expected = week(true).themes[0]!.lines[0]!;
    assert.match(text, new RegExp(expected.text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(text, /Waiting for the chef \(2\)/);
    assert.match(text, /#21 Keep the old route\?/);
    assert.ok(screen.dessous("h4").some(({ textContent }) => textContent === AUTONOMY));
    const buttons = screen.dessous("button");
    assert.equal(buttons.length, 1);
    assert.equal(buttons[0]!.textContent, SEE_WHAT_AWAITING);
    buttons[0]!.click();
    assert.deepEqual(closes, [true]);
  });
  test("sans chiffres d'autonomie, le bloc est absent : ni titre, ni liste, ni placeholder", () => {
    const screen = setAbsence(doc, { depuis: SINCE, projets: [{ projet: "parade", lecture: reading(week(false)), attentes: [] }] }, { fermer: () => {} }) as Fake;
    assert.ok(!screen.dessous("h4").some(({ textContent }) => textContent === AUTONOMY));
    assert.equal(screen.dessous("ul").filter(({ className }) => className === "autonomie").length, 0);
    assert.ok(!/autonomy/i.test(screen.textContent));
  });
  test("rien n'attend : un bouton qui ferme seulement, et la ligne le dit", () => {
    const closes: boolean[] = [];
    const screen = setAbsence(doc, { depuis: SINCE, projets: [{ projet: "parade", lecture: reading(week(false)), attentes: [] }] }, { fermer: (awaiting) => closes.push(awaiting) }) as Fake;
    assert.match(screen.textContent, new RegExp(NOTHING_N_AWAITING));
    const buttons = screen.dessous("button");
    assert.equal(buttons.length, 1);
    assert.equal(buttons[0]!.textContent, CLOSE);
    buttons[0]!.click();
    assert.deepEqual(closes, [false]);
  });
  test("un résumé d'avant l'absence n'est pas repris", () => {
    const screen = setAbsence(doc, { depuis: Date.parse("2026-11-20T00:00:00Z"), projets: [{ projet: "parade", lecture: reading(week(true)), attentes: [] }] }, { fermer: () => {} }) as Fake;
    assert.match(screen.textContent, /Nothing was served while you were away/);
    assert.ok(!screen.dessous("h4").some(({ textContent }) => textContent === AUTONOMY));
  });
});
