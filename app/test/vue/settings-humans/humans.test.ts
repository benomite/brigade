// Les humains du projet sous Settings (#2930) : chaque humain que son `projet.json` déclare, son login et ses rôles ;
// ajouter, changer les rôles et retirer s'appliquent au changement, sans « Save ». Chaque rangée est la rangée de
// réglage (#2920) : elle dit qu'un changement ouvre une PR (`PAR_PR`), puis, dessous, le lien de la PR ouverte. Un refus du service se dit en une ligne
// sur la rangée du login concerné seule, et la rangée revient à ce qui était. La vue est jouée telle qu'elle est, devant
// un faux document (helpers/false-vue.ts), le service derrière le faux pont.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { POWER_UP } from "../../../src/power-up.ts";
import { forTheBar } from "../../../src/bar.ts";
import { EXAMPLE } from "../../../src/config.ts";
import { PALETTE } from "../../../src/colors.ts";
import { KITCHEN_ACTIONS } from "../../../src/kitchen.ts";
import { BANNER } from "../../../src/facts.ts";
import { CONFIRMED, DIRECT } from "../../../src/actions.ts";
import { TABS, HEADINGS } from "../../../src/tabs.ts";
import { EFFORTS, MODELS } from "../../../src/projects/projects.ts";
import { PAR_PR } from "../../../src/vue/components/setting/setting.js";
import { WORDS, nameOfThePr, renderedRead, serviceOfBridge, type Human, type Rendered } from "../../../src/vue/settings-humans/humans.js";
import { type Fake, type Played, playTheVue, type Answers, repos } from "../../helpers/false-vue.ts";

const PARADE = "parade";
const PR = "https://github.com/benomite/parade/pull/2951";
const HUMANS: Human[] = [
  { login: "alice", roles: ["product", "review"] },
  { login: "bob", roles: ["design"] },
];
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

// Une écriture que le test tient : elle ne rend rien tant qu'il ne la lâche pas.
type Writing = { args: unknown[]; rendre(rendered: Rendered): void; rejeter(error: Error): void };

async function open(answers: Answers = {}) {
  const writes: Writing[] = [];
  const hold = (...args: unknown[]) => new Promise<Rendered>((render, rejeter) => writes.push({ args, rendre: render, rejeter }));
  const vue = await playTheVue({
    demarrage: startup,
    espace: () => [],
    listerLesHumains: () => structuredClone(HUMANS),
    enregistrerUnHumain: (project, human) => hold(project, human) as unknown as Rendered,
    retirerUnHumain: (project, login) => hold(project, login) as unknown as Rendered,
    ouvrirLaProposition: () => true,
    ...answers,
  });
  (vue.element("projets").children.at(1) ?? assert.fail("pas de case pour parade")).click();
  await repos();
  return { vue, ecritures: writes };
}

const section = (vue: Played) => vue.element("humains-du-projet").children[0] ?? assert.fail("pas de section des humains");
const rows = (vue: Played) => section(vue).children.filter((pose) => pose.className.split(" ").includes("humain"));
const freshOne = (vue: Played) => rows(vue).find((pose) => pose.className === "reglage humain neuf") ?? assert.fail("pas de rangée neuve");
const row = (vue: Played, login: string) => rows(vue).find((pose) => pose.dataset.login === login) ?? assert.fail(`pas de rangée ${login}`);
const ticks = (pose: Fake) => pose.dessous("input").filter((field) => field.type === "checkbox");
const ticked = (pose: Fake) => ticks(pose).filter((field) => field.checked).map((field) => field.ariaLabel);
const caseOf = (pose: Fake, role: string) => ticks(pose).find((field) => field.ariaLabel === role) ?? assert.fail(`pas de case ${role}`);
const button = (pose: Fake, wording: string) => pose.dessous("button").find((taken) => taken.textContent === wording) ?? assert.fail(`pas de « ${wording} »`);
// La ligne qui dit qu'un changement ouvre une PR, et ce que le dernier geste a rendu, sous la rangée.
const parPr = (pose: Fake) => pose.dessous("p").find((p) => p.className === "par-pr")?.textContent;
const said = (pose: Fake) => pose.dessous("p").find((p) => p.className === "dit en-cours" || p.className === "dit propose")?.textContent;
const enForce = (pose: Fake) => pose.dessous("p").find((p) => p.className === "valeur")?.textContent;
const refusal = (pose: Fake) => pose.dessous("p").find((p) => p.className === "dit refus");
function tick(field: Fake, tickedOne: boolean) {
  field.checked = tickedOne;
  field.declencher("change");
}

describe("Settings : les humains du projet", () => {
  test("chaque humain déclaré, son login et ses rôles ; chaque rangée dit que son changement ouvre une PR ; aucun « Save »", async () => {
    const { vue } = await open();
    assert.deepEqual(vue.appels.filter(({ geste: action }) => action === "listerLesHumains").map(({ args }) => args), [[PARADE]]);
    assert.equal(vue.element("humains-du-projet").hidden, false);
    assert.deepEqual(rows(vue).map((pose) => pose.dataset.login), ["alice", "bob"]);
    assert.deepEqual(ticked(row(vue, "alice")), ["product", "review"]);
    assert.deepEqual(ticked(row(vue, "bob")), ["design"]);
    assert.deepEqual(ticks(row(vue, "bob")).map((field) => field.ariaLabel), ["product", "design", "review", "client-contact"]);
    for (const login of ["alice", "bob"]) {
      assert.match(row(vue, login).textContent, new RegExp(`^${login}`));
      assert.equal(row(vue, login).dataset.depot, "");
      assert.equal(parPr(row(vue, login)), PAR_PR);
      assert.equal(said(row(vue, login)), undefined);
    }
    assert.equal(enForce(row(vue, "alice")), "product, review");
    assert.equal(enForce(row(vue, "bob")), "design");
    assert.equal(
      section(vue).dessous("button").some((taken) => /save|propose/i.test(taken.textContent)),
      false,
    );
  });

  test("changer les rôles part au changement ; la rangée dit qu'elle écrit, puis la PR ouverte, dont le lien s'ouvre", async () => {
    const { vue, ecritures: writes } = await open();
    tick(caseOf(row(vue, "bob"), "review"), true);
    await repos();
    assert.deepEqual(writes.map(({ args }) => args), [[PARADE, { login: "bob", roles: ["design", "review"] }]]);
    assert.equal(said(row(vue, "bob")), WORDS.enCours);
    assert.ok(ticks(row(vue, "bob")).every((field) => field.disabled));
    writes[0]?.rendre({ pr: PR });
    await repos();
    assert.equal(said(row(vue, "bob")), "proposed inpull request #2951");
    assert.deepEqual(ticked(row(vue, "bob")), ["design", "review"]);
    // La valeur en vigueur est celle de projet.json : la PR vaut une fois mergée.
    assert.equal(enForce(row(vue, "bob")), "design");
    assert.equal(refusal(row(vue, "bob")), undefined);
    button(row(vue, "bob"), "pull request #2951").click();
    assert.deepEqual(vue.dernier("ouvrirLaProposition"), [PR]);
  });

  test("ajouter un humain par une rangée neuve : rien ne part avant son login ; le login écrit, il part avec ses rôles", async () => {
    const { vue, ecritures: writes } = await open();
    button(section(vue), WORDS.ajouter).click();
    await repos();
    tick(caseOf(freshOne(vue), "design"), true);
    await repos();
    assert.equal(writes.length, 0);
    assert.equal(parPr(freshOne(vue)), PAR_PR);
    const field = freshOne(vue).dessous("input").find((taken) => taken.ariaLabel === WORDS.login) ?? assert.fail("pas de champ du login");
    field.value = "carol";
    field.declencher("input");
    assert.equal(writes.length, 0);
    field.declencher("change");
    await repos();
    assert.deepEqual(writes.map(({ args }) => args), [[PARADE, { login: "carol", roles: ["design"] }]]);
    writes[0]?.rendre({ pr: PR });
    await repos();
    assert.equal(said(freshOne(vue)), "proposed inpull request #2951");
    assert.equal(freshOne(vue).dessous("input").some((taken) => taken.ariaLabel === WORDS.login), false, "le login proposé ne se réécrit plus");
    assert.equal(freshOne(vue).dataset.login, "carol");
  });

  test("« cancel » sur une rangée neuve la retire sans rien écrire", async () => {
    const { vue, ecritures: writes } = await open();
    button(section(vue), WORDS.ajouter).click();
    await repos();
    assert.equal(rows(vue).length, 3);
    button(rows(vue)[2] ?? assert.fail(), WORDS.annuler).click();
    await repos();
    assert.equal(rows(vue).length, 2);
    assert.equal(writes.length, 0);
  });

  test("retirer un humain part au clic ; la rangée dit la PR du retrait, et ne se change plus", async () => {
    const { vue, ecritures: writes } = await open();
    button(row(vue, "alice"), WORDS.retirer).click();
    await repos();
    assert.deepEqual(writes.map(({ args }) => args), [[PARADE, "alice"]]);
    writes[0]?.rendre({ pr: "https://github.com/benomite/parade/pull/2952" });
    await repos();
    assert.equal(said(row(vue, "alice")), "removal proposed inpull request #2952");
    assert.ok(ticks(row(vue, "alice")).every((field) => field.disabled));
    assert.equal(button(row(vue, "alice"), WORDS.retirer).disabled, true);
  });

  test("un refus se dit en une ligne sous la rangée du login seule ; elle revient à ce qui était et ne dit aucune PR", async () => {
    const { vue, ecritures: writes } = await open();
    tick(caseOf(row(vue, "bob"), "product"), true);
    await repos();
    writes[0]?.rendre({ refus: "you have no access to benomite/parade: nothing was written\ngh: HTTP 403", detail: "$ gh api …" });
    await repos();
    const refusalOfBob = refusal(row(vue, "bob")) ?? assert.fail("pas de refus sur bob");
    assert.equal(refusalOfBob.children[0]?.textContent, "you have no access to benomite/parade: nothing was written");
    // Le reste du refus n'est qu'au survol.
    assert.equal(refusalOfBob.textContent.includes("HTTP 403"), false);
    assert.equal(refusal(row(vue, "alice")), undefined);
    assert.deepEqual(ticked(row(vue, "bob")), ["design"]);
    assert.equal(said(row(vue, "bob")), undefined);
    assert.equal(parPr(row(vue, "bob")), PAR_PR);

    // Un login inconnu, ajouté : le refus est sur sa rangée, qui garde le login écrit.
    button(section(vue), WORDS.ajouter).click();
    await repos();
    const field = freshOne(vue).dessous("input").find((taken) => taken.ariaLabel === WORDS.login) ?? assert.fail();
    field.value = "ghost-user";
    field.declencher("input");
    field.declencher("change");
    await repos();
    writes[1]?.rendre({ refus: "ghost-user is not a GitHub account" });
    await repos();
    assert.equal(refusal(freshOne(vue))?.textContent, "ghost-user is not a GitHub account");
    assert.equal(freshOne(vue).dessous("input").find((taken) => taken.ariaLabel === WORDS.login)?.value, "ghost-user");
    assert.equal(rows(vue).filter((pose) => refusal(pose) !== undefined).length, 2, "bob garde le sien, rien d'autre");
  });

  test("un refus après une PR ouverte se dit sous elle : la PR reste dite, elle est toujours ouverte ; un lien sans numéro se dit « pull request »", async () => {
    const { vue, ecritures: writes } = await open();
    tick(caseOf(row(vue, "bob"), "review"), true);
    await repos();
    writes[0]?.rendre({ pr: "https://example.test/elsewhere" });
    await repos();
    assert.equal(said(row(vue, "bob")), "proposed inpull request");
    tick(caseOf(row(vue, "bob"), "product"), true);
    await repos();
    writes[1]?.rendre({ refus: "you have no access to benomite/parade: nothing was written" });
    await repos();
    assert.equal(said(row(vue, "bob")), "proposed inpull request");
    assert.equal(refusal(row(vue, "bob"))?.children[0]?.textContent, "you have no access to benomite/parade: nothing was written");
    assert.deepEqual(ticked(row(vue, "bob")), ["design", "review"]);
  });

  test("une écriture qui échoue, ou qui ne rend rien de lisible, est un refus — jamais une PR devinée", async () => {
    const { vue, ecritures: writes } = await open();
    tick(caseOf(row(vue, "bob"), "review"), true);
    await repos();
    writes[0]?.rejeter(new Error("ipc closed"));
    await repos();
    assert.equal(refusal(row(vue, "bob"))?.children[0]?.textContent, WORDS.rienEnvoye);
    assert.deepEqual(ticked(row(vue, "bob")), ["design"]);
    assert.deepEqual(renderedRead(undefined), { refus: WORDS.rienEnvoye, detail: "" });
    assert.deepEqual(renderedRead({ pr: "" }), { refus: WORDS.rienEnvoye, detail: '{"pr":""}' });
    assert.equal(nameOfThePr("https://example.test/elsewhere"), "pull request");
  });

  test("sans humain déclaré : la ligne vide et « add the first human », qui ouvre une rangée neuve", async () => {
    const { vue } = await open({ listerLesHumains: () => [] });
    assert.equal(rows(vue).length, 0);
    assert.match(section(vue).textContent, new RegExp(WORDS.vide));
    const first = button(section(vue), WORDS.premier);
    assert.equal(first.className, "recommande");
    first.click();
    await repos();
    assert.deepEqual(rows(vue).map((pose) => pose.className), ["reglage humain neuf"]);
  });

  test("une lecture qui échoue tient en une ligne, son détail au survol ; un pont sans humains ne pose pas la section", async () => {
    const { vue } = await open({ listerLesHumains: () => Promise.reject(new Error("gh: HTTP 502")) as unknown as Human[] });
    const unavailable = section(vue).dessous("p").find((p) => p.className === "indisponible") ?? assert.fail("pas de ligne");
    assert.equal(unavailable.children[0]?.textContent, WORDS.indisponible);
    assert.equal(unavailable.textContent.includes("502"), false);

    const { vue: withoutStation } = await open({ listerLesHumains: () => ({ sans: "parade has no station: its humans are read where its kitchen runs" }) });
    const saidOne = section(withoutStation).dessous("p").find((p) => p.className === "indisponible") ?? assert.fail("pas de ligne");
    assert.equal(saidOne.children[0]?.textContent, "parade has no station: its humans are read where its kitchen runs");

    const { vue: without } = await open({ listerLesHumains: () => undefined as unknown as Human[] });
    assert.equal(without.element("humains-du-projet").hidden, true);
    assert.equal(without.element("humains-du-projet").children.length, 0);
  });

  test("le service du pont : sans ses méthodes, la lecture ne rend rien et une écriture est un refus", async () => {
    const service = serviceOfBridge({}, PARADE);
    assert.equal(await service.list(), undefined);
    assert.ok("refus" in (await service.save({ login: "alice", roles: [] })));
    assert.ok("refus" in (await service.remove("alice")));
  });
});
