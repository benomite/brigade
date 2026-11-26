// L'écran « since you were away » (#3305) : la décision à l'ouverture — premier lancement sans écran, trois jours pile sans
// écran, au-delà avec écran, la date réécrite à chaque ouverture, rien de plus tant qu'une nouvelle absence ne vient pas ;
// puis l'écran lui-même : les lignes des résumés de l'absence, ce qui attend le chef et son nombre, le bloc d'autonomie
// absent ou présent, et son bouton unique.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { resumeDeLaSemaine } from "../../../runtime/src/resume-hebdomadaire/resume.ts";
import type { ResumesDuProjet } from "../../src/vue/resume-hebdomadaire/resume-cuisine.ts";
import { AUTONOMIE } from "../../src/vue/resume-hebdomadaire/resume-hebdomadaire.js";
import { absenceALAperture, CLE_DE_LA_DERNIERE_OUVERTURE, FERMER, poserAbsence, RIEN_N_ATTEND, SEUIL_MS, VOIR_CE_QUI_ATTEND } from "../../src/vue/absence/absence.js";
import { Faux } from "../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const MAINTENANT = Date.parse("2026-11-11T12:00:00Z");
const stockage = (valeur?: string) => {
  const garde = new Map<string, string>(valeur === undefined ? [] : [[CLE_DE_LA_DERNIERE_OUVERTURE, valeur]]);
  return { garde, getItem: (cle: string) => garde.get(cle) ?? null, setItem: (cle: string, v: string) => void garde.set(cle, v) };
};
const il_y_a = (ms: number) => new Date(MAINTENANT - ms).toISOString();

describe("la décision à l'ouverture", () => {
  test("premier lancement : pas d'écran, et la date est posée", () => {
    const s = stockage();
    assert.equal(absenceALAperture({ stockage: s, maintenant: () => MAINTENANT }), undefined);
    assert.equal(s.garde.get(CLE_DE_LA_DERNIERE_OUVERTURE), new Date(MAINTENANT).toISOString());
  });
  test("sous trois jours : pas d'écran ; trois jours pile : pas d'écran ; au-delà : l'écran, avec l'ancienne date", () => {
    assert.equal(absenceALAperture({ stockage: stockage(il_y_a(SEUIL_MS - 1)), maintenant: () => MAINTENANT }), undefined);
    assert.equal(absenceALAperture({ stockage: stockage(il_y_a(SEUIL_MS)), maintenant: () => MAINTENANT }), undefined);
    assert.equal(absenceALAperture({ stockage: stockage(il_y_a(SEUIL_MS + 1)), maintenant: () => MAINTENANT }), MAINTENANT - SEUIL_MS - 1);
  });
  test("la date est réécrite à chaque ouverture : l'écran montré ne revient pas à l'ouverture suivante", () => {
    const s = stockage(il_y_a(5 * 24 * 3600_000));
    assert.notEqual(absenceALAperture({ stockage: s, maintenant: () => MAINTENANT }), undefined);
    assert.equal(s.garde.get(CLE_DE_LA_DERNIERE_OUVERTURE), new Date(MAINTENANT).toISOString());
    assert.equal(absenceALAperture({ stockage: s, maintenant: () => MAINTENANT + 60_000 }), undefined);
    // Une nouvelle absence de plus de trois jours le ramène.
    assert.notEqual(absenceALAperture({ stockage: s, maintenant: () => MAINTENANT + SEUIL_MS + 60_001 }), undefined);
  });
  test("un stockage absent, une trace illisible, un stockage qui refuse : pas d'écran, et l'app s'ouvre", () => {
    assert.equal(absenceALAperture({ stockage: undefined, maintenant: () => MAINTENANT }), undefined);
    const s = stockage("n'importe quoi");
    assert.equal(absenceALAperture({ stockage: s, maintenant: () => MAINTENANT }), undefined);
    assert.equal(s.garde.get(CLE_DE_LA_DERNIERE_OUVERTURE), new Date(MAINTENANT).toISOString());
    const casse = {
      getItem: () => {
        throw new Error("refus");
      },
      setItem: () => {
        throw new Error("refus");
      },
    };
    assert.equal(absenceALAperture({ stockage: casse, maintenant: () => MAINTENANT }), undefined);
  });
});

const url = (n: number) => `https://github.com/chef/parade/issues/${n}`;
const semaine = (autonomie: boolean) =>
  resumeDeLaSemaine({
    project: "parade",
    weekStart: "2026-11-02",
    weekEnd: "2026-11-08",
    servis: [{ number: 12, title: "feat(#12): show the rail age on the tile", url: url(12), labels: [], epic: null }],
    ...(autonomie ? { autonomie: { tickets: 3, sansHumain: 2, partSansHumain: 2 / 3, delaiMedianMs: 5 * 3600_000, renvoyes: 1, partRenvoyee: 1 / 3, avecHumain: [] } as never } : {}),
    attentes: [],
  });
const lecture = (resume: ReturnType<typeof semaine>): ResumesDuProjet => ({ projet: "parade", jour: { jour: "monday", pose: false }, resumes: { resumes: [resume], illisibles: [] } });
const DEPUIS = Date.parse("2026-11-05T09:00:00Z");

describe("l'écran", () => {
  test("liste ce qui a été servi avec les mots du résumé, et ce qui attend le chef avec son nombre ; l'autonomie présente est montrée", () => {
    const ferme: boolean[] = [];
    const ecran = poserAbsence(doc, { depuis: DEPUIS, projets: [{ projet: "parade", lecture: lecture(semaine(true)), attentes: [{ ticket: 21, titre: "Keep the old route?" }, { ticket: 22 }] }] }, { fermer: (attend) => ferme.push(attend) }) as Faux;
    const texte = ecran.textContent;
    const attendu = semaine(true).themes[0]!.lines[0]!;
    assert.match(texte, new RegExp(attendu.text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(texte, /Waiting for the chef \(2\)/);
    assert.match(texte, /#21 Keep the old route\?/);
    assert.ok(ecran.dessous("h4").some(({ textContent }) => textContent === AUTONOMIE));
    const boutons = ecran.dessous("button");
    assert.equal(boutons.length, 1);
    assert.equal(boutons[0]!.textContent, VOIR_CE_QUI_ATTEND);
    boutons[0]!.click();
    assert.deepEqual(ferme, [true]);
  });
  test("sans chiffres d'autonomie, le bloc est absent : ni titre, ni liste, ni placeholder", () => {
    const ecran = poserAbsence(doc, { depuis: DEPUIS, projets: [{ projet: "parade", lecture: lecture(semaine(false)), attentes: [] }] }, { fermer: () => {} }) as Faux;
    assert.ok(!ecran.dessous("h4").some(({ textContent }) => textContent === AUTONOMIE));
    assert.equal(ecran.dessous("ul").filter(({ className }) => className === "autonomie").length, 0);
    assert.ok(!/autonomy/i.test(ecran.textContent));
  });
  test("rien n'attend : un bouton qui ferme seulement, et la ligne le dit", () => {
    const ferme: boolean[] = [];
    const ecran = poserAbsence(doc, { depuis: DEPUIS, projets: [{ projet: "parade", lecture: lecture(semaine(false)), attentes: [] }] }, { fermer: (attend) => ferme.push(attend) }) as Faux;
    assert.match(ecran.textContent, new RegExp(RIEN_N_ATTEND));
    const boutons = ecran.dessous("button");
    assert.equal(boutons.length, 1);
    assert.equal(boutons[0]!.textContent, FERMER);
    boutons[0]!.click();
    assert.deepEqual(ferme, [false]);
  });
  test("un résumé d'avant l'absence n'est pas repris", () => {
    const ecran = poserAbsence(doc, { depuis: Date.parse("2026-11-20T00:00:00Z"), projets: [{ projet: "parade", lecture: lecture(semaine(true)), attentes: [] }] }, { fermer: () => {} }) as Faux;
    assert.match(ecran.textContent, /Nothing was served while you were away/);
    assert.ok(!ecran.dessous("h4").some(({ textContent }) => textContent === AUTONOMIE));
  });
});
