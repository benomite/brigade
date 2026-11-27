// La rétro d'un ticket sur sa fiche (#1038) : la vue jouée, la fiche d'un ticket servi ouverte par sa
// carte. Avec une rétro, ses leçons — chacune marquée provisoire, son sens au survol, son id et son
// texte — puis ce que son cook a écrit ; sans, une phrase à la place, jamais une section vide ni cassée.
// L'histoire est écrite en faits bruts (helpers/cards-said.ts), dite comme la fiche la reçoit.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { forTheBar } from "../src/bar.ts";
import { EXAMPLE, type Project } from "../src/config.ts";
import { PALETTE } from "../src/colors.ts";
import { BANNER, type Drawable } from "../src/facts.ts";
import { header } from "../src/card.ts";
import { actionsOfCard } from "../src/card-actions.ts";
import { TABS, HEADINGS } from "../src/tabs.ts";
import { EFFORTS, MODELS } from "../src/projects/projects.ts";
import type { Terminal } from "../src/terminals.ts";
import { SAYS_TEMPORARY, TEMPORARY } from "../src/vue/learning.js";
import { type Fake, playTheVue, repos } from "./helpers/false-vue.ts";
import { type StoryRaw, storyOf, type RetroRaw } from "./helpers/cards-said.ts";

const PARADE: Project = { nom: "parade", dossier: "/tmp/parade" };
const A = "2026-10-16T10:00:00.000Z";
const SECOND: Terminal = { id: 1, projet: "parade", genre: "second", titre: "second · claude", note: "", arrete: false };

const startup = () => ({
  configuration: forTheBar({ chemin: "/tmp/app.json", projets: [PARADE] }, () => true),
  palette: PALETTE,
  exemple: EXAMPLE,
  onglets: TABS,
  rubriques: HEADINGS,
  gestes: {},
  banniere: BANNER,
  calibrage: { modeles: MODELS, efforts: EFFORTS },
  code: undefined,
});

// #12, servi et mergé : rien ne l'attend.
const card = { ticket: 12, etat: "servi", ton: "vert", titre: "Validation SIRET", fiche: header({ titre: "Validation SIRET" }), ouvrable: true, attendu: false, pr: true, attend: [], dit: [] };
const facts = (request: number): Drawable =>
  ({
    projet: "parade",
    demande: request,
    a: A,
    tableau: {
      etat: "ouverte",
      ton: "vert",
      arretee: false,
      tick: "dernier tick il y a 12 s",
      compteurs: [{ libelle: "rail", nombre: 1 }],
      cooks: { enCours: [], vide: "aucun cook en cours" },
      evenement: "rien",
      rail: { colonnes: [{ nom: "T'attend", ton: "vert", compte: "1", cartes: [card], vide: "aucun ticket" }], hors: [], attendLu: A },
    },
  }) as unknown as Drawable;

const STORY: StoryRaw = {
  ticket: 12,
  steps: [
    { kind: "arrived", at: "2026-10-14T08:00:00.000Z" },
    { kind: "delivered", at: "2026-10-14T09:10:00.000Z", run: "r1" },
    { kind: "merged", at: "2026-10-14T10:30:00.000Z", by: "pass" },
  ],
  cost: { attempts: 1, tokens: 48210, durationMs: 722000, incomplete: false },
};
const TEXT = "reconfirm L4\npropose Relire la fiche avant d'écrire.\npropose Un test attend un fait, jamais une durée.";
const RETRO: RetroRaw = {
  at: "2026-10-14T10:30:00.000Z",
  text: TEXT,
  lessons: [
    { kind: "reconfirm", id: "L4", text: "Lancer les tests avant de commiter." },
    { kind: "propose", id: "L9", text: "Relire la fiche avant d'écrire." },
    { kind: "propose", id: "L10", text: "Un test attend un fait, jamais une durée." },
  ],
};

// La fiche de #12 ouverte d'un clic sur sa carte, la box rendant cette rétro — `undefined` : une box
// d'avant la rétro sur la fiche, qui n'écrit pas le champ ; rend sa section « retro ».
async function retroOnTheCard(retro: RetroRaw | null | undefined): Promise<Fake | undefined> {
  const story: StoryRaw = retro === undefined ? STORY : { ...STORY, retro };
  const vue = await playTheVue({ demarrage: startup, espace: () => [SECOND], gestesDeFiche: (readEntry) => actionsOfCard(readEntry), lireHistoire: () => storyOf(story) });
  (vue.element("projets").children[1] ?? assert.fail("pas de case")).click();
  await repos();
  vue.dire("surFaits", facts(vue.dernier("faits")[0] as number));
  (vue.element("rail").dessous("li").find(({ className }) => className === "bon") ?? assert.fail("pas de carte sur le rail")).click();
  await repos();
  const detail = vue.element("fiche");
  assert.equal(detail.hidden, false);
  return detail.dessous("section").find(({ className }) => className === "retro");
}

const lessonList = (section: Fake) => section.dessous("li");

describe("la rétro sur la fiche d'un ticket", () => {
  test("un ticket servi avec sa rétro : chaque leçon marquée provisoire, son id, son texte — puis ce que le cook a écrit", async () => {
    const section = (await retroOnTheCard(RETRO)) ?? assert.fail("pas de section retro sur la fiche");
    assert.equal(section.ariaLabel, "the retro of #12");
    const lines = lessonList(section);
    assert.equal(lines.length, 3);
    for (const [rank, line] of lines.entries()) {
      const lesson = RETRO.lessons[rank] ?? assert.fail("leçon attendue");
      const status = line.dessous("span").find(({ className }) => className === "statut") ?? assert.fail("pas de pastille");
      assert.equal(status.textContent, TEMPORARY);
      // Son sens se lit au survol de la pastille.
      assert.equal(status.ariaLabel, SAYS_TEMPORARY);
      assert.equal(line.dessous("code")[0]?.textContent, lesson.id);
      assert.ok(line.textContent.includes(lesson.text ?? ""), line.textContent);
    }
    // La leçon reconfirmée le dit ; les nouvelles, non.
    assert.deepEqual(lines.map((line) => line.textContent.endsWith("reconfirmed")), [true, false, false]);
    assert.equal(section.dessous("pre")[0]?.textContent, TEXT);
  });

  test("une rétro de plus de trois leçons n'en montre que trois", async () => {
    const lessons = [1, 2, 3, 4, 5].map((n) => ({ kind: "propose" as const, id: `L${n}`, text: `leçon ${n}` }));
    const section = (await retroOnTheCard({ at: A, text: "…", lessons })) ?? assert.fail("pas de section retro");
    assert.deepEqual(lessonList(section).map((line) => line.dessous("code")[0]?.textContent), ["L1", "L2", "L3"]);
  });

  test("un ticket sans rétro : une phrase le dit, ni liste vide ni ligne en échec", async () => {
    const section = (await retroOnTheCard(null)) ?? assert.fail("pas de section retro sur la fiche");
    assert.deepEqual(section.children.map(({ balise, textContent }) => `${balise}: ${textContent}`), ["h4: retro", "p: no retro for this ticket yet"]);
    assert.equal(section.children[1]?.className, "sans");
  });

  test("servi sans que son cook écrive de rétro : une phrase le dit", async () => {
    const section = (await retroOnTheCard({ at: A, text: null, lessons: [] })) ?? assert.fail("pas de section retro sur la fiche");
    assert.deepEqual(section.children.map(({ textContent }) => textContent), ["retro", "served, but its cook wrote no retro"]);
  });

  test("une box d'avant la rétro sur la fiche : aucune section, rien n'est écrit à la place", async () => {
    assert.equal(await retroOnTheCard(undefined), undefined);
  });
});
