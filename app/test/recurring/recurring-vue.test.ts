// Les tickets récurrents du projet sous Settings (#3231) : une rangée par ticket récurrent — son titre, son rythme en mots
// et la date de sa prochaine occurrence ; suspendu, « paused » et aucune date ; aucun, la ligne vide. Un clic sur « pause »
// le suspend, un clic sur « resume » le reprend avec sa prochaine date, un clic sur « remove » retire la rangée — sans
// confirmation. Un refus se dit en une ligne sur la rangée seule. La vue est jouée telle qu'elle est, devant un faux
// document (helpers/false-vue.ts), la fixture de la forme du runtime derrière le faux pont.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { POWER_UP } from "../../src/power-up.ts";
import { forTheBar } from "../../src/bar.ts";
import { EXAMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/colors.ts";
import { KITCHEN_ACTIONS } from "../../src/kitchen.ts";
import { BANNER } from "../../src/facts.ts";
import { CONFIRMED, DIRECT } from "../../src/actions.ts";
import { TABS, HEADINGS } from "../../src/tabs.ts";
import { EFFORTS, MODELS } from "../../src/projects/projects.ts";
import type { WritingOfARecurring, Recurring } from "../../src/vue/recurring/recurring-box.ts";
import { dateInWords, WORDS, rank, paceInWords, serviceOfRecurring } from "../../src/vue/recurring/recurring.js";
import { type Fake, type Played, playTheVue, type Answers, repos } from "../helpers/false-vue.ts";
import { RECURRING } from "./fixture.ts";

const PARADE = "parade";
const NOW = Date.parse("2026-10-13T10:04:12Z");
const startup = () => ({
  configuration: forTheBar({ chemin: "/tmp/app.json", projets: [{ nom: PARADE, dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE,
  exemple: EXAMPLE,
  onglets: TABS,
  rubriques: HEADINGS,
  gestes: { allumage: POWER_UP, cuisine: KITCHEN_ACTIONS, directs: DIRECT, confirmes: CONFIRMED },
  banniere: BANNER,
  calibrage: { modeles: MODELS, efforts: EFFORTS },
  code: undefined,
});

// Un geste que le test tient : il ne rend rien tant qu'il ne le lâche pas.
type Writing = { args: unknown[]; rendre(rendered: WritingOfARecurring): void; rejeter(error: Error): void };

async function open(answers: Answers = {}) {
  const writes: Writing[] = [];
  const vue = await playTheVue({
    demarrage: startup,
    espace: () => [],
    listerLesRecurrents: () => structuredClone(RECURRING),
    changerUnRecurrent: (...args) => new Promise<WritingOfARecurring>((render, rejeter) => writes.push({ args, rendre: render, rejeter })),
    ...answers,
  });
  (vue.element("projets").children.at(1) ?? assert.fail("pas de case pour parade")).click();
  await repos();
  return { vue, ecritures: writes };
}

const section = (vue: Played) => vue.element("recurrents-du-projet").children[0] ?? assert.fail("pas de section des tickets récurrents");
const rows = (vue: Played) => section(vue).children.filter((pose) => pose.className.split(" ").includes("recurrent"));
const row = (vue: Played, id: string) => rows(vue).find((pose) => pose.dataset.id === id) ?? assert.fail(`pas de rangée ${id}`);
const button = (pose: Fake, wording: string) => pose.dessous("button").find((taken) => taken.textContent === wording) ?? assert.fail(`pas de « ${wording} »`);
const wordings = (pose: Fake) => pose.dessous("button").map((taken) => taken.textContent);
const classe = (pose: Fake, name: string) => [...pose.descendants()].find((taken) => taken.className === name);
const [QUOTIDIEN, HEBDO, MENSUEL, SUSPENDED] = RECURRING as [Recurring, Recurring, Recurring, Recurring];

describe("Settings : les tickets récurrents du projet", () => {
  test("une rangée par ticket récurrent : son titre, son rythme en mots et sa prochaine date ; le suspendu dit « paused », sans date", async () => {
    const { vue } = await open();
    assert.deepEqual(vue.appels.filter(({ geste: action }) => action === "listerLesRecurrents").map(({ args }) => args), [[PARADE]]);
    assert.equal(vue.element("recurrents-du-projet").hidden, false);
    assert.deepEqual(rows(vue).map((pose) => pose.dataset.id), RECURRING.map(({ id }) => id));
    assert.deepEqual(
      rows(vue).map((pose) => [classe(pose, "titre")?.textContent, classe(pose, "rythme")?.textContent, classe(pose, "prochaine")?.dataset.date ?? classe(pose, "etat-suspendu")?.textContent]),
      [
        ["Check the error dashboard", "every day", "2026-10-13"],
        ["Update the dependencies", "every week on Monday", "2026-10-19"],
        ["Write the monthly cost report", "every month on the 15th", "2026-10-15"],
        ["Rotate the deploy keys", "every month on the 1st", "paused"],
      ],
    );
    assert.match(classe(row(vue, HEBDO.id), "prochaine")?.textContent ?? "", /^next .*Oct 19/);
    assert.equal(classe(row(vue, SUSPENDED.id), "prochaine"), undefined, "un ticket suspendu ne montre aucune date");
    assert.equal(row(vue, SUSPENDED.id).className, "recurrent suspendu");
    assert.deepEqual(wordings(row(vue, QUOTIDIEN.id)), [WORDS.pause, WORDS.retirer]);
    assert.deepEqual(wordings(row(vue, SUSPENDED.id)), [WORDS.resume, WORDS.retirer]);
  });

  test("aucun ticket récurrent : la ligne vide", async () => {
    const { vue } = await open({ listerLesRecurrents: () => [] });
    assert.equal(rows(vue).length, 0);
    assert.equal(classe(section(vue), "aucun")?.textContent, "No recurring tickets yet.");
  });

  test("un clic sur « pause » : le geste part, sans confirmation ; la rangée dit « paused » et plus aucune date", async () => {
    const { vue, ecritures: writes } = await open();
    button(row(vue, HEBDO.id), WORDS.pause).click();
    await repos();
    assert.deepEqual(writes.map(({ args }) => args), [[PARADE, "pause", HEBDO.id]]);
    assert.ok(row(vue, HEBDO.id).dessous("button").every((taken) => taken.disabled), "le geste en route, la rangée ne se rejoue pas");
    writes[0]?.rendre({ recurrent: { ...HEBDO, paused: true } });
    await repos();
    assert.equal(classe(row(vue, HEBDO.id), "etat-suspendu")?.textContent, "paused");
    assert.equal(classe(row(vue, HEBDO.id), "prochaine"), undefined);
    assert.deepEqual(wordings(row(vue, HEBDO.id)), [WORDS.resume, WORDS.retirer]);
    assert.equal(classe(row(vue, QUOTIDIEN.id), "etat-suspendu"), undefined, "les autres rangées ne bougent pas");
  });

  test("un clic sur « resume » : la rangée revient, avec la prochaine date que le runtime rend", async () => {
    const { vue, ecritures: writes } = await open();
    button(row(vue, SUSPENDED.id), WORDS.resume).click();
    await repos();
    assert.deepEqual(writes.map(({ args }) => args), [[PARADE, "resume", SUSPENDED.id]]);
    writes[0]?.rendre({ recurrent: { ...SUSPENDED, paused: false, nextDate: "2026-11-01" } });
    await repos();
    assert.equal(classe(row(vue, SUSPENDED.id), "etat-suspendu"), undefined);
    assert.equal(classe(row(vue, SUSPENDED.id), "prochaine")?.dataset.date, "2026-11-01");
    assert.deepEqual(wordings(row(vue, SUSPENDED.id)), [WORDS.pause, WORDS.retirer]);
  });

  test("un clic sur « remove » : la rangée part ; la dernière partie, la ligne vide", async () => {
    const { vue, ecritures: writes } = await open({ listerLesRecurrents: () => [structuredClone(MENSUEL)] });
    button(row(vue, MENSUEL.id), WORDS.retirer).click();
    await repos();
    assert.deepEqual(writes.map(({ args }) => args), [[PARADE, "remove", MENSUEL.id]]);
    writes[0]?.rendre({ retire: true });
    await repos();
    assert.equal(rows(vue).length, 0);
    assert.equal(classe(section(vue), "aucun")?.textContent, WORDS.vide);
  });

  test("un refus se dit en une ligne sur sa rangée seule, le détail au survol ; la rangée reste ce qu'elle était", async () => {
    const { vue, ecritures: writes } = await open();
    button(row(vue, QUOTIDIEN.id), WORDS.pause).click();
    await repos();
    writes[0]?.rendre({ refus: "no recurring ticket a1b2c3d4", detail: "$ node geste.ts parade recurring pause a1b2c3d4" });
    await repos();
    const refusal = classe(row(vue, QUOTIDIEN.id), "indisponible") ?? assert.fail("pas de refus sur la rangée");
    assert.equal(refusal.children[0]?.textContent, "no recurring ticket a1b2c3d4");
    assert.equal(refusal.textContent.includes("geste.ts"), false, "le détail n'est qu'au survol");
    assert.equal(classe(row(vue, QUOTIDIEN.id), "prochaine")?.dataset.date, QUOTIDIEN.nextDate);
    assert.deepEqual(wordings(row(vue, QUOTIDIEN.id)).slice(0, 2), [WORDS.pause, WORDS.retirer]);
    assert.equal(classe(row(vue, HEBDO.id), "indisponible"), undefined);

    // Un geste qui lève ne passe pas pour un changement : il se dit de même.
    button(row(vue, HEBDO.id), WORDS.retirer).click();
    await repos();
    writes[1]?.rejeter(new Error("ipc closed"));
    await repos();
    assert.equal(classe(row(vue, HEBDO.id), "indisponible")?.children[0]?.textContent, WORDS.rienEnvoye);
    assert.equal(rows(vue).length, 4);
  });

  test("une lecture qui échoue se dit en une ligne, le détail au survol, sans liste ni ligne vide ; un pont sans tickets récurrents ne pose pas la section", async () => {
    const { vue } = await open({ listerLesRecurrents: () => ({ sans: "recurring tickets unavailable", detail: "$ node geste.ts parade recurring\nrecurring.json is not valid JSON" }) });
    const failure = classe(section(vue), "indisponible") ?? assert.fail("pas de ligne d'échec");
    assert.equal(failure.children[0]?.textContent, "recurring tickets unavailable");
    assert.equal(rows(vue).length, 0);
    assert.equal(classe(section(vue), "aucun"), undefined);

    const lifted = await open({ listerLesRecurrents: () => Promise.reject(new Error("ipc closed")) });
    assert.equal(classe(section(lifted.vue), "indisponible")?.children[0]?.textContent, WORDS.indisponible);

    const phone = serviceOfRecurring({}, PARADE);
    assert.equal(await phone.list(), undefined);
    assert.deepEqual(await phone.pause("a1b2c3d4"), { refus: WORDS.rienEnvoye });
  });
});

describe("un projet en lecture seule", () => {
  test("la section n'est pas posée : elle n'offre que des gestes", () => {
    const css = readFileSync(join(import.meta.dirname, "..", "..", "src", "vue", "recurring", "recurring.css"), "utf8");
    assert.match(css, /#etat\[data-lecture-seule\] #recurrents-du-projet \{\s*display: none !important;/);
  });
});

describe("les mots d'un ticket récurrent", () => {
  test("le rythme en mots", () => {
    assert.equal(paceInWords({ kind: "daily" }), "every day");
    assert.deepEqual([1, 2, 3, 4, 5, 6, 7].map((weekday) => paceInWords({ kind: "weekly", weekday })), ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((day) => `every week on ${day}`));
    assert.equal(paceInWords({ kind: "monthly", dayOfMonth: 15 }), "every month on the 15th");
    assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 31].map(rank), ["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd", "31st"]);
  });

  test("la date d'une occurrence : son jour UTC, l'année dite seulement quand ce n'est pas celle d'aujourd'hui", () => {
    assert.equal(dateInWords("2026-10-19", NOW), "Mon, Oct 19");
    assert.equal(dateInWords("2027-01-01", NOW), "Fri, Jan 1, 2027");
  });
});
