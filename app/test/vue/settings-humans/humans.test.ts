// Les humains du projet sous Settings (#2930) : chaque humain que son `projet.json` déclare, son login et ses rôles ;
// ajouter, changer les rôles et retirer s'appliquent au changement, sans « Save ». Chaque rangée est la rangée de
// réglage (#2920) : elle dit qu'un changement ouvre une PR (`PAR_PR`), puis, dessous, le lien de la PR ouverte. Un refus du service se dit en une ligne
// sur la rangée du login concerné seule, et la rangée revient à ce qui était. La vue est jouée telle qu'elle est, devant
// un faux document (aides/fausse-vue.ts), le service derrière le faux pont.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ALLUMAGE } from "../../../src/allumage.ts";
import { pourLaBar } from "../../../src/bar.ts";
import { EXEMPLE } from "../../../src/config.ts";
import { PALETTE } from "../../../src/couleurs.ts";
import { KITCHEN_ACTIONS } from "../../../src/kitchen.ts";
import { BANNIERE } from "../../../src/facts.ts";
import { CONFIRMES, DIRECTS } from "../../../src/actions.ts";
import { ONGLETS, RUBRIQUES } from "../../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../../src/projects/projects.ts";
import { PAR_PR } from "../../../src/vue/composants/setting/setting.js";
import { MOTS, nameDeLaPr, renduLu, serviceDuPont, type Human, type Rendu } from "../../../src/vue/settings-humans/humans.js";
import { type Faux, type Jouee, jouerLaVue, type Answers, repos } from "../../aides/fausse-vue.ts";

const PARADE = "parade";
const PR = "https://github.com/benomite/parade/pull/2951";
const HUMANS: Human[] = [
  { login: "alice", roles: ["product", "review"] },
  { login: "bob", roles: ["design"] },
];
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

// Une écriture que le test tient : elle ne rend rien tant qu'il ne la lâche pas.
type Ecriture = { args: unknown[]; rendre(rendu: Rendu): void; rejeter(error: Error): void };

async function ouvrir(answers: Answers = {}) {
  const ecritures: Ecriture[] = [];
  const hold = (...args: unknown[]) => new Promise<Rendu>((rendre, rejeter) => ecritures.push({ args, rendre, rejeter }));
  const vue = await jouerLaVue({
    demarrage,
    espace: () => [],
    listerLesHumains: () => structuredClone(HUMANS),
    enregistrerUnHumain: (project, human) => hold(project, human) as unknown as Rendu,
    retirerUnHumain: (project, login) => hold(project, login) as unknown as Rendu,
    ouvrirLaProposition: () => true,
    ...answers,
  });
  (vue.element("projets").children.at(1) ?? assert.fail("pas de case pour parade")).click();
  await repos();
  return { vue, ecritures };
}

const section = (vue: Jouee) => vue.element("humains-du-projet").children[0] ?? assert.fail("pas de section des humains");
const rangees = (vue: Jouee) => section(vue).children.filter((pose) => pose.className.split(" ").includes("humain"));
const neuve = (vue: Jouee) => rangees(vue).find((pose) => pose.className === "reglage humain neuf") ?? assert.fail("pas de rangée neuve");
const rangee = (vue: Jouee, login: string) => rangees(vue).find((pose) => pose.dataset.login === login) ?? assert.fail(`pas de rangée ${login}`);
const coches = (pose: Faux) => pose.dessous("input").filter((champ) => champ.type === "checkbox");
const cochees = (pose: Faux) => coches(pose).filter((champ) => champ.checked).map((champ) => champ.ariaLabel);
const caseDe = (pose: Faux, role: string) => coches(pose).find((champ) => champ.ariaLabel === role) ?? assert.fail(`pas de case ${role}`);
const button = (pose: Faux, libelle: string) => pose.dessous("button").find((taken) => taken.textContent === libelle) ?? assert.fail(`pas de « ${libelle} »`);
// La ligne qui dit qu'un changement ouvre une PR, et ce que le dernier geste a rendu, sous la rangée.
const parPr = (pose: Faux) => pose.dessous("p").find((p) => p.className === "par-pr")?.textContent;
const dit = (pose: Faux) => pose.dessous("p").find((p) => p.className === "dit en-cours" || p.className === "dit propose")?.textContent;
const enVigueur = (pose: Faux) => pose.dessous("p").find((p) => p.className === "valeur")?.textContent;
const refusal = (pose: Faux) => pose.dessous("p").find((p) => p.className === "dit refus");
function cocher(champ: Faux, cochee: boolean) {
  champ.checked = cochee;
  champ.declencher("change");
}

describe("Settings : les humains du projet", () => {
  test("chaque humain déclaré, son login et ses rôles ; chaque rangée dit que son changement ouvre une PR ; aucun « Save »", async () => {
    const { vue } = await ouvrir();
    assert.deepEqual(vue.appels.filter(({ geste: action }) => action === "listerLesHumains").map(({ args }) => args), [[PARADE]]);
    assert.equal(vue.element("humains-du-projet").hidden, false);
    assert.deepEqual(rangees(vue).map((pose) => pose.dataset.login), ["alice", "bob"]);
    assert.deepEqual(cochees(rangee(vue, "alice")), ["product", "review"]);
    assert.deepEqual(cochees(rangee(vue, "bob")), ["design"]);
    assert.deepEqual(coches(rangee(vue, "bob")).map((champ) => champ.ariaLabel), ["product", "design", "review", "client-contact"]);
    for (const login of ["alice", "bob"]) {
      assert.match(rangee(vue, login).textContent, new RegExp(`^${login}`));
      assert.equal(rangee(vue, login).dataset.depot, "");
      assert.equal(parPr(rangee(vue, login)), PAR_PR);
      assert.equal(dit(rangee(vue, login)), undefined);
    }
    assert.equal(enVigueur(rangee(vue, "alice")), "product, review");
    assert.equal(enVigueur(rangee(vue, "bob")), "design");
    assert.equal(
      section(vue).dessous("button").some((taken) => /save|propose/i.test(taken.textContent)),
      false,
    );
  });

  test("changer les rôles part au changement ; la rangée dit qu'elle écrit, puis la PR ouverte, dont le lien s'ouvre", async () => {
    const { vue, ecritures } = await ouvrir();
    cocher(caseDe(rangee(vue, "bob"), "review"), true);
    await repos();
    assert.deepEqual(ecritures.map(({ args }) => args), [[PARADE, { login: "bob", roles: ["design", "review"] }]]);
    assert.equal(dit(rangee(vue, "bob")), MOTS.enCours);
    assert.ok(coches(rangee(vue, "bob")).every((champ) => champ.disabled));
    ecritures[0]?.rendre({ pr: PR });
    await repos();
    assert.equal(dit(rangee(vue, "bob")), "proposed inpull request #2951");
    assert.deepEqual(cochees(rangee(vue, "bob")), ["design", "review"]);
    // La valeur en vigueur est celle de projet.json : la PR vaut une fois mergée.
    assert.equal(enVigueur(rangee(vue, "bob")), "design");
    assert.equal(refusal(rangee(vue, "bob")), undefined);
    button(rangee(vue, "bob"), "pull request #2951").click();
    assert.deepEqual(vue.dernier("ouvrirLaProposition"), [PR]);
  });

  test("ajouter un humain par une rangée neuve : rien ne part avant son login ; le login écrit, il part avec ses rôles", async () => {
    const { vue, ecritures } = await ouvrir();
    button(section(vue), MOTS.ajouter).click();
    await repos();
    cocher(caseDe(neuve(vue), "design"), true);
    await repos();
    assert.equal(ecritures.length, 0);
    assert.equal(parPr(neuve(vue)), PAR_PR);
    const champ = neuve(vue).dessous("input").find((taken) => taken.ariaLabel === MOTS.login) ?? assert.fail("pas de champ du login");
    champ.value = "carol";
    champ.declencher("input");
    assert.equal(ecritures.length, 0);
    champ.declencher("change");
    await repos();
    assert.deepEqual(ecritures.map(({ args }) => args), [[PARADE, { login: "carol", roles: ["design"] }]]);
    ecritures[0]?.rendre({ pr: PR });
    await repos();
    assert.equal(dit(neuve(vue)), "proposed inpull request #2951");
    assert.equal(neuve(vue).dessous("input").some((taken) => taken.ariaLabel === MOTS.login), false, "le login proposé ne se réécrit plus");
    assert.equal(neuve(vue).dataset.login, "carol");
  });

  test("« cancel » sur une rangée neuve la retire sans rien écrire", async () => {
    const { vue, ecritures } = await ouvrir();
    button(section(vue), MOTS.ajouter).click();
    await repos();
    assert.equal(rangees(vue).length, 3);
    button(rangees(vue)[2] ?? assert.fail(), MOTS.annuler).click();
    await repos();
    assert.equal(rangees(vue).length, 2);
    assert.equal(ecritures.length, 0);
  });

  test("retirer un humain part au clic ; la rangée dit la PR du retrait, et ne se change plus", async () => {
    const { vue, ecritures } = await ouvrir();
    button(rangee(vue, "alice"), MOTS.retirer).click();
    await repos();
    assert.deepEqual(ecritures.map(({ args }) => args), [[PARADE, "alice"]]);
    ecritures[0]?.rendre({ pr: "https://github.com/benomite/parade/pull/2952" });
    await repos();
    assert.equal(dit(rangee(vue, "alice")), "removal proposed inpull request #2952");
    assert.ok(coches(rangee(vue, "alice")).every((champ) => champ.disabled));
    assert.equal(button(rangee(vue, "alice"), MOTS.retirer).disabled, true);
  });

  test("un refus se dit en une ligne sous la rangée du login seule ; elle revient à ce qui était et ne dit aucune PR", async () => {
    const { vue, ecritures } = await ouvrir();
    cocher(caseDe(rangee(vue, "bob"), "product"), true);
    await repos();
    ecritures[0]?.rendre({ refus: "you have no access to benomite/parade: nothing was written\ngh: HTTP 403", detail: "$ gh api …" });
    await repos();
    const refusalDeBob = refusal(rangee(vue, "bob")) ?? assert.fail("pas de refus sur bob");
    assert.equal(refusalDeBob.children[0]?.textContent, "you have no access to benomite/parade: nothing was written");
    // Le reste du refus n'est qu'au survol.
    assert.equal(refusalDeBob.textContent.includes("HTTP 403"), false);
    assert.equal(refusal(rangee(vue, "alice")), undefined);
    assert.deepEqual(cochees(rangee(vue, "bob")), ["design"]);
    assert.equal(dit(rangee(vue, "bob")), undefined);
    assert.equal(parPr(rangee(vue, "bob")), PAR_PR);

    // Un login inconnu, ajouté : le refus est sur sa rangée, qui garde le login écrit.
    button(section(vue), MOTS.ajouter).click();
    await repos();
    const champ = neuve(vue).dessous("input").find((taken) => taken.ariaLabel === MOTS.login) ?? assert.fail();
    champ.value = "ghost-user";
    champ.declencher("input");
    champ.declencher("change");
    await repos();
    ecritures[1]?.rendre({ refus: "ghost-user is not a GitHub account" });
    await repos();
    assert.equal(refusal(neuve(vue))?.textContent, "ghost-user is not a GitHub account");
    assert.equal(neuve(vue).dessous("input").find((taken) => taken.ariaLabel === MOTS.login)?.value, "ghost-user");
    assert.equal(rangees(vue).filter((pose) => refusal(pose) !== undefined).length, 2, "bob garde le sien, rien d'autre");
  });

  test("un refus après une PR ouverte se dit sous elle : la PR reste dite, elle est toujours ouverte ; un lien sans numéro se dit « pull request »", async () => {
    const { vue, ecritures } = await ouvrir();
    cocher(caseDe(rangee(vue, "bob"), "review"), true);
    await repos();
    ecritures[0]?.rendre({ pr: "https://example.test/elsewhere" });
    await repos();
    assert.equal(dit(rangee(vue, "bob")), "proposed inpull request");
    cocher(caseDe(rangee(vue, "bob"), "product"), true);
    await repos();
    ecritures[1]?.rendre({ refus: "you have no access to benomite/parade: nothing was written" });
    await repos();
    assert.equal(dit(rangee(vue, "bob")), "proposed inpull request");
    assert.equal(refusal(rangee(vue, "bob"))?.children[0]?.textContent, "you have no access to benomite/parade: nothing was written");
    assert.deepEqual(cochees(rangee(vue, "bob")), ["design", "review"]);
  });

  test("une écriture qui échoue, ou qui ne rend rien de lisible, est un refus — jamais une PR devinée", async () => {
    const { vue, ecritures } = await ouvrir();
    cocher(caseDe(rangee(vue, "bob"), "review"), true);
    await repos();
    ecritures[0]?.rejeter(new Error("ipc closed"));
    await repos();
    assert.equal(refusal(rangee(vue, "bob"))?.children[0]?.textContent, MOTS.rienEnvoye);
    assert.deepEqual(cochees(rangee(vue, "bob")), ["design"]);
    assert.deepEqual(renduLu(undefined), { refus: MOTS.rienEnvoye, detail: "" });
    assert.deepEqual(renduLu({ pr: "" }), { refus: MOTS.rienEnvoye, detail: '{"pr":""}' });
    assert.equal(nameDeLaPr("https://example.test/elsewhere"), "pull request");
  });

  test("sans humain déclaré : la ligne vide et « add the first human », qui ouvre une rangée neuve", async () => {
    const { vue } = await ouvrir({ listerLesHumains: () => [] });
    assert.equal(rangees(vue).length, 0);
    assert.match(section(vue).textContent, new RegExp(MOTS.vide));
    const first = button(section(vue), MOTS.premier);
    assert.equal(first.className, "recommande");
    first.click();
    await repos();
    assert.deepEqual(rangees(vue).map((pose) => pose.className), ["reglage humain neuf"]);
  });

  test("une lecture qui échoue tient en une ligne, son détail au survol ; un pont sans humains ne pose pas la section", async () => {
    const { vue } = await ouvrir({ listerLesHumains: () => Promise.reject(new Error("gh: HTTP 502")) as unknown as Human[] });
    const indisponible = section(vue).dessous("p").find((p) => p.className === "indisponible") ?? assert.fail("pas de ligne");
    assert.equal(indisponible.children[0]?.textContent, MOTS.indisponible);
    assert.equal(indisponible.textContent.includes("502"), false);

    const { vue: sansStation } = await ouvrir({ listerLesHumains: () => ({ sans: "parade has no station: its humans are read where its kitchen runs" }) });
    const dite = section(sansStation).dessous("p").find((p) => p.className === "indisponible") ?? assert.fail("pas de ligne");
    assert.equal(dite.children[0]?.textContent, "parade has no station: its humans are read where its kitchen runs");

    const { vue: sans } = await ouvrir({ listerLesHumains: () => undefined as unknown as Human[] });
    assert.equal(sans.element("humains-du-projet").hidden, true);
    assert.equal(sans.element("humains-du-projet").children.length, 0);
  });

  test("le service du pont : sans ses méthodes, la lecture ne rend rien et une écriture est un refus", async () => {
    const service = serviceDuPont({}, PARADE);
    assert.equal(await service.list(), undefined);
    assert.ok("refus" in (await service.save({ login: "alice", roles: [] })));
    assert.ok("refus" in (await service.remove("alice")));
  });
});
