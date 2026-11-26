// Les tickets récurrents du projet sous Settings (#3231) : une rangée par ticket récurrent — son titre, son rythme en mots
// et la date de sa prochaine occurrence ; suspendu, « paused » et aucune date ; aucun, la ligne vide. Un clic sur « pause »
// le suspend, un clic sur « resume » le reprend avec sa prochaine date, un clic sur « remove » retire la rangée — sans
// confirmation. Un refus se dit en une ligne sur la rangée seule. La vue est jouée telle qu'elle est, devant un faux
// document (aides/fausse-vue.ts), la fixture de la forme du runtime derrière le faux pont.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBar } from "../../src/bar.ts";
import { EXEMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { KITCHEN_ACTIONS } from "../../src/kitchen.ts";
import { BANNIERE } from "../../src/facts.ts";
import { CONFIRMES, DIRECTS } from "../../src/actions.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../src/projects/projects.ts";
import type { EcritureDUnRecurrent, Recurrent } from "../../src/vue/recurring/recurring-box.ts";
import { dateEnMots, MOTS, rang, rythmeEnMots, serviceDesRecurring } from "../../src/vue/recurring/recurring.js";
import { type Faux, type Jouee, jouerLaVue, type Answers, repos } from "../aides/fausse-vue.ts";
import { RECURRING } from "./fixture.ts";

const PARADE = "parade";
const MAINTENANT = Date.parse("2026-10-13T10:04:12Z");
const demarrage = () => ({
  configuration: pourLaBar({ chemin: "/tmp/app.json", projets: [{ nom: PARADE, dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: KITCHEN_ACTIONS, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
});

// Un geste que le test tient : il ne rend rien tant qu'il ne le lâche pas.
type Ecriture = { args: unknown[]; rendre(rendu: EcritureDUnRecurrent): void; rejeter(error: Error): void };

async function ouvrir(answers: Answers = {}) {
  const ecritures: Ecriture[] = [];
  const vue = await jouerLaVue({
    demarrage,
    espace: () => [],
    listerLesRecurrents: () => structuredClone(RECURRING),
    changerUnRecurrent: (...args) => new Promise<EcritureDUnRecurrent>((rendre, rejeter) => ecritures.push({ args, rendre, rejeter })),
    ...answers,
  });
  (vue.element("projets").children.at(1) ?? assert.fail("pas de case pour parade")).click();
  await repos();
  return { vue, ecritures };
}

const section = (vue: Jouee) => vue.element("recurrents-du-projet").children[0] ?? assert.fail("pas de section des tickets récurrents");
const rangees = (vue: Jouee) => section(vue).children.filter((pose) => pose.className.split(" ").includes("recurrent"));
const rangee = (vue: Jouee, id: string) => rangees(vue).find((pose) => pose.dataset.id === id) ?? assert.fail(`pas de rangée ${id}`);
const button = (pose: Faux, libelle: string) => pose.dessous("button").find((taken) => taken.textContent === libelle) ?? assert.fail(`pas de « ${libelle} »`);
const libelles = (pose: Faux) => pose.dessous("button").map((taken) => taken.textContent);
const classe = (pose: Faux, name: string) => [...pose.descendants()].find((taken) => taken.className === name);
const [QUOTIDIEN, HEBDO, MENSUEL, SUSPENDU] = RECURRING as [Recurrent, Recurrent, Recurrent, Recurrent];

describe("Settings : les tickets récurrents du projet", () => {
  test("une rangée par ticket récurrent : son titre, son rythme en mots et sa prochaine date ; le suspendu dit « paused », sans date", async () => {
    const { vue } = await ouvrir();
    assert.deepEqual(vue.appels.filter(({ geste: action }) => action === "listerLesRecurrents").map(({ args }) => args), [[PARADE]]);
    assert.equal(vue.element("recurrents-du-projet").hidden, false);
    assert.deepEqual(rangees(vue).map((pose) => pose.dataset.id), RECURRING.map(({ id }) => id));
    assert.deepEqual(
      rangees(vue).map((pose) => [classe(pose, "titre")?.textContent, classe(pose, "rythme")?.textContent, classe(pose, "prochaine")?.dataset.date ?? classe(pose, "etat-suspendu")?.textContent]),
      [
        ["Check the error dashboard", "every day", "2026-10-13"],
        ["Update the dependencies", "every week on Monday", "2026-10-19"],
        ["Write the monthly cost report", "every month on the 15th", "2026-10-15"],
        ["Rotate the deploy keys", "every month on the 1st", "paused"],
      ],
    );
    assert.match(classe(rangee(vue, HEBDO.id), "prochaine")?.textContent ?? "", /^next .*Oct 19/);
    assert.equal(classe(rangee(vue, SUSPENDU.id), "prochaine"), undefined, "un ticket suspendu ne montre aucune date");
    assert.equal(rangee(vue, SUSPENDU.id).className, "recurrent suspendu");
    assert.deepEqual(libelles(rangee(vue, QUOTIDIEN.id)), [MOTS.pause, MOTS.retirer]);
    assert.deepEqual(libelles(rangee(vue, SUSPENDU.id)), [MOTS.resume, MOTS.retirer]);
  });

  test("aucun ticket récurrent : la ligne vide", async () => {
    const { vue } = await ouvrir({ listerLesRecurrents: () => [] });
    assert.equal(rangees(vue).length, 0);
    assert.equal(classe(section(vue), "aucun")?.textContent, "No recurring tickets yet.");
  });

  test("un clic sur « pause » : le geste part, sans confirmation ; la rangée dit « paused » et plus aucune date", async () => {
    const { vue, ecritures } = await ouvrir();
    button(rangee(vue, HEBDO.id), MOTS.pause).click();
    await repos();
    assert.deepEqual(ecritures.map(({ args }) => args), [[PARADE, "pause", HEBDO.id]]);
    assert.ok(rangee(vue, HEBDO.id).dessous("button").every((taken) => taken.disabled), "le geste en route, la rangée ne se rejoue pas");
    ecritures[0]?.rendre({ recurrent: { ...HEBDO, paused: true } });
    await repos();
    assert.equal(classe(rangee(vue, HEBDO.id), "etat-suspendu")?.textContent, "paused");
    assert.equal(classe(rangee(vue, HEBDO.id), "prochaine"), undefined);
    assert.deepEqual(libelles(rangee(vue, HEBDO.id)), [MOTS.resume, MOTS.retirer]);
    assert.equal(classe(rangee(vue, QUOTIDIEN.id), "etat-suspendu"), undefined, "les autres rangées ne bougent pas");
  });

  test("un clic sur « resume » : la rangée revient, avec la prochaine date que le runtime rend", async () => {
    const { vue, ecritures } = await ouvrir();
    button(rangee(vue, SUSPENDU.id), MOTS.resume).click();
    await repos();
    assert.deepEqual(ecritures.map(({ args }) => args), [[PARADE, "resume", SUSPENDU.id]]);
    ecritures[0]?.rendre({ recurrent: { ...SUSPENDU, paused: false, nextDate: "2026-11-01" } });
    await repos();
    assert.equal(classe(rangee(vue, SUSPENDU.id), "etat-suspendu"), undefined);
    assert.equal(classe(rangee(vue, SUSPENDU.id), "prochaine")?.dataset.date, "2026-11-01");
    assert.deepEqual(libelles(rangee(vue, SUSPENDU.id)), [MOTS.pause, MOTS.retirer]);
  });

  test("un clic sur « remove » : la rangée part ; la dernière partie, la ligne vide", async () => {
    const { vue, ecritures } = await ouvrir({ listerLesRecurrents: () => [structuredClone(MENSUEL)] });
    button(rangee(vue, MENSUEL.id), MOTS.retirer).click();
    await repos();
    assert.deepEqual(ecritures.map(({ args }) => args), [[PARADE, "remove", MENSUEL.id]]);
    ecritures[0]?.rendre({ retire: true });
    await repos();
    assert.equal(rangees(vue).length, 0);
    assert.equal(classe(section(vue), "aucun")?.textContent, MOTS.vide);
  });

  test("un refus se dit en une ligne sur sa rangée seule, le détail au survol ; la rangée reste ce qu'elle était", async () => {
    const { vue, ecritures } = await ouvrir();
    button(rangee(vue, QUOTIDIEN.id), MOTS.pause).click();
    await repos();
    ecritures[0]?.rendre({ refus: "no recurring ticket a1b2c3d4", detail: "$ node geste.ts parade recurring pause a1b2c3d4" });
    await repos();
    const refusal = classe(rangee(vue, QUOTIDIEN.id), "indisponible") ?? assert.fail("pas de refus sur la rangée");
    assert.equal(refusal.children[0]?.textContent, "no recurring ticket a1b2c3d4");
    assert.equal(refusal.textContent.includes("geste.ts"), false, "le détail n'est qu'au survol");
    assert.equal(classe(rangee(vue, QUOTIDIEN.id), "prochaine")?.dataset.date, QUOTIDIEN.nextDate);
    assert.deepEqual(libelles(rangee(vue, QUOTIDIEN.id)).slice(0, 2), [MOTS.pause, MOTS.retirer]);
    assert.equal(classe(rangee(vue, HEBDO.id), "indisponible"), undefined);

    // Un geste qui lève ne passe pas pour un changement : il se dit de même.
    button(rangee(vue, HEBDO.id), MOTS.retirer).click();
    await repos();
    ecritures[1]?.rejeter(new Error("ipc closed"));
    await repos();
    assert.equal(classe(rangee(vue, HEBDO.id), "indisponible")?.children[0]?.textContent, MOTS.rienEnvoye);
    assert.equal(rangees(vue).length, 4);
  });

  test("une lecture qui échoue se dit en une ligne, le détail au survol, sans liste ni ligne vide ; un pont sans tickets récurrents ne pose pas la section", async () => {
    const { vue } = await ouvrir({ listerLesRecurrents: () => ({ sans: "recurring tickets unavailable", detail: "$ node geste.ts parade recurring\nrecurring.json is not valid JSON" }) });
    const failure = classe(section(vue), "indisponible") ?? assert.fail("pas de ligne d'échec");
    assert.equal(failure.children[0]?.textContent, "recurring tickets unavailable");
    assert.equal(rangees(vue).length, 0);
    assert.equal(classe(section(vue), "aucun"), undefined);

    const leve = await ouvrir({ listerLesRecurrents: () => Promise.reject(new Error("ipc closed")) });
    assert.equal(classe(section(leve.vue), "indisponible")?.children[0]?.textContent, MOTS.indisponible);

    const phone = serviceDesRecurring({}, PARADE);
    assert.equal(await phone.list(), undefined);
    assert.deepEqual(await phone.pause("a1b2c3d4"), { refus: MOTS.rienEnvoye });
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
    assert.equal(rythmeEnMots({ kind: "daily" }), "every day");
    assert.deepEqual([1, 2, 3, 4, 5, 6, 7].map((weekday) => rythmeEnMots({ kind: "weekly", weekday })), ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((day) => `every week on ${day}`));
    assert.equal(rythmeEnMots({ kind: "monthly", dayOfMonth: 15 }), "every month on the 15th");
    assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 31].map(rang), ["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd", "31st"]);
  });

  test("la date d'une occurrence : son jour UTC, l'année dite seulement quand ce n'est pas celle d'aujourd'hui", () => {
    assert.equal(dateEnMots("2026-10-19", MAINTENANT), "Mon, Oct 19");
    assert.equal(dateEnMots("2027-01-01", MAINTENANT), "Fri, Jan 1, 2027");
  });
});
