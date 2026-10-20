// Un profil de cook au dispatch : une préférence, jamais une contrainte. Un
// ticket de son domaine part sous lui quand son cook est libre, et son cook
// reçoit le carnet du profil en plus des leçons du projet — le journal le dit.
// Le cook du profil occupé, le ticket part aussitôt avec un généraliste, sans
// carnet. Sur une cuisine complète (rail, garde-fous, stations, un faux
// `claude`, un GitHub de test), avec des définitions écrites dans un dépôt de
// test comme le « oui » du chef les écrit.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import type { Lesson } from "../../src/carnet/carnet.ts";
import { consigne, consigneDeSuite } from "../../src/claude.ts";
import type { Demande, Reponse } from "../../src/events/remote.ts";
import { MARQUEUR } from "../../src/fiche.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { consigneDeRenvoi, consigneDeReprise } from "../../src/pass.ts";
import { PROFILS_DIR, saveDefinition, type DefinitionDeProfil } from "../../src/profils/definition.ts";
import { blocDuCarnet, carnetDuProfil, lireLesProfils, profilPrefere, profilsOccupes } from "../../src/profils/preference.ts";
import { lireStations } from "../../src/stations-declarees.ts";
import { demander } from "../../src/tirer.ts";
import { PLAFONDS, cuisine, issue, type Lieux, type Options } from "../aides/cuisine.ts";
import { jusqua, repertoireTemporaire } from "../outils.ts";

const lecon = (id: string, text: string, reste: Partial<Lesson> = {}): Lesson => ({ id, text, state: "promoted", entered: "2026-10-01", retros: ["#3"], origin: { kind: "retro" }, ...reste });

// Le profil du domaine `zone`, avec son carnet.
const profil = (name: string, zone: string, lessons: Lesson[] = []): DefinitionDeProfil => ({
  name,
  zone,
  perimeter: [zone],
  skills: [],
  accepted: "2026-10-19",
  tickets: [1, 2, 3, 4, 5],
  notebook: { lessons },
});

const VUE = profil("app-src-vue", "app/src/vue", [
  lecon("L-1", "Capturer l'écran avant et après."),
  lecon("L-2", "Une leçon sortie du carnet.", { state: "retired", exit: { date: "2026-10-18", reason: "manual" } }),
]);

// Le dépôt du projet, avec les définitions de ces profils, écrites comme le « oui » du chef les écrit.
function depot(t: TestContext, ...profils: DefinitionDeProfil[]): string {
  const repoDir = repertoireTemporaire(t);
  for (const defini of profils) saveDefinition(repoDir, defini);
  return repoDir;
}

// Pose un ticket calibré avec sa fiche, comme le manager au découpage.
const poser = (gh: Lieux["gh"], numero: number, ...lignes: string[]) => {
  if (lignes.length > 0) gh.ficher(numero, "2026-10-08T09:00:00Z", [MARQUEUR, ...lignes].join("\n"));
  gh.poser(issue(numero));
};

const prompt = (args: string[]) => args[args.indexOf("-p") + 1] ?? "";

// Une cuisine dont le projet définit ces profils dans son dépôt, relus à chaque lancement.
function service(t: TestContext, options: Options, ...profils: DefinitionDeProfil[]) {
  const repoDir = depot(t, ...profils);
  const lieu = cuisine(t, { scenario: "muet", ...options, profils: () => lireLesProfils(repoDir) });
  const { journal, cooks } = lieu;
  // Le carnet que le journal dit donné au cook du ticket, s'il y en a un.
  const carnetDonne = (ticket: number) => journal.duTicket(ticket).filter((e) => e.type === "profile.notebook-given");
  // La consigne du cook du ticket.
  const consigneDe = (ticket: number) => prompt(cooks().find((cook) => prompt(cook.args).includes(`le ticket #${ticket} du dépôt`))?.args ?? []);
  return { ...lieu, repoDir, carnetDonne, consigneDe };
}

const LECON_DU_PROJET = "Un test attend un fait, jamais une durée.";
const retro = (journal: ReturnType<typeof cuisine>["journal"], projet = "brigade") =>
  journal.ajouter({ project: projet, ticket: 9, author: "pass", type: "retro.recorded", payload: { run: null, text: null, kept: [{ kind: "propose", text: LECON_DU_PROJET }], dropped: [] } });

describe("un profil de cook au dispatch", { concurrency: 8 }, () => {
  test("le profil et un généraliste libres : le ticket de son domaine part sous le profil, son cook reçoit son carnet et les leçons du projet, et le journal le dit", async (t) => {
    const { gh, journal, cooks, carnetDonne, consigneDe, dernier } = service(t, { cooks: 2 }, VUE);
    retro(journal);
    poser(gh, 14, "- zone : app/src/vue/rail.ts");
    await jusqua(() => cooks().length === 1);

    const [donne, ...autres] = carnetDonne(14);
    assert.equal(autres.length, 0);
    const run = dernier("cook.launched", 14)?.run;
    assert.deepEqual(donne?.payload, { run, name: "app-src-vue", zone: "app/src/vue", file: `${PROFILS_DIR}/app-src-vue.md`, lessons: ["L-1"] });
    assert.equal(donne?.author, "station:box/claude");

    const texte = consigneDe(14);
    // Les leçons du projet, comme tout cook, puis le carnet du profil.
    assert.ok(texte.includes(`- L1 : ${LECON_DU_PROJET}`), texte);
    assert.ok(texte.includes("tu le cuisines sous le profil de cook « app-src-vue »"), texte);
    assert.ok(texte.includes("- L-1 : Capturer l'écran avant et après."), texte);
    assert.ok(texte.indexOf(`- L1 : ${LECON_DU_PROJET}`) < texte.indexOf("- L-1 :"));
    // Une leçon sortie du carnet n'en fait plus partie.
    assert.doesNotMatch(texte, /L-2/);
    assert.deepEqual(dernier("cook.launched", 14)?.lessons, ["L1"]);
  });

  test("le cook du profil occupé : le ticket suivant du domaine part aussitôt avec un généraliste, sans carnet — il ne l'attend pas", async (t) => {
    const { gh, journal, cooks, carnetDonne, consigneDe } = service(t, { cooks: 3 }, VUE);
    retro(journal);
    poser(gh, 14, "- zone : app/src/vue/rail.ts");
    poser(gh, 15, "- zone : app/src/vue/pass.ts");
    await jusqua(() => cooks().length === 2);

    // Les deux tournent : le second n'a attendu la fin d'aucun cook.
    assert.equal(journal.tout().filter((e) => e.type === "cook.exited").length, 0);
    assert.deepEqual(
      [14, 15].map((ticket) => journal.duTicket(ticket).filter((e) => e.type === "cook.launched").length),
      [1, 1],
    );
    // Un seul part sous le profil ; l'autre est un généraliste.
    const sousLeProfil = [14, 15].filter((ticket) => carnetDonne(ticket).length === 1);
    assert.equal(sousLeProfil.length, 1);
    const generaliste = sousLeProfil[0] === 14 ? 15 : 14;
    assert.equal(carnetDonne(generaliste).length, 0);
    const texte = consigneDe(generaliste);
    assert.ok(texte.includes(`- L1 : ${LECON_DU_PROJET}`), texte);
    assert.doesNotMatch(texte, /profil de cook|L-1/);
  });

  test("un ticket hors de tout domaine, ou sans fiche, part avec un généraliste : aucun carnet, et sa consigne est celle de tout cook", async (t) => {
    const { gh, cooks, carnetDonne, consigneDe } = service(t, { cooks: 3 }, VUE);
    poser(gh, 14, "- zone : runtime/src");
    poser(gh, 15);
    await jusqua(() => cooks().length === 2);

    assert.deepEqual([carnetDonne(14).length, carnetDonne(15).length], [0, 0]);
    assert.equal(consigneDe(14), consigne({ ticket: 14, titre: issue(14).title, depot: "benomite/brigade", base: "v2" }));
    assert.doesNotMatch(consigneDe(15), /profil de cook/);
  });

  test("une station distante : le cook qu'elle tire reçoit le carnet du profil comme un cook de la box, et le journal le dit en son nom", async (t) => {
    const MAC = "mac/claude";
    const { gh, journal, etat, repertoire, heure, carnetDonne } = service(t, { stations: lireStations({ BRIGADE_STATIONS: `box/claude:1:code,${MAC}:1:chrome-connecté:distante` }), presenceMs: 120_000 }, VUE);
    const tirer = (demande: Demande): Promise<Reponse> => demander(repertoire, MAC, demande, { maintenant: heure.maintenant, pasMs: 2 });
    retro(journal);
    poser(gh, 16, "- zone : app/src/vue", "- requiert : chrome-connecté");
    await jusqua(() => etat(16) === "86");
    await tirer({ verb: "announce" });
    await jusqua(() => etat(16) === "waiting");

    const reponse = await tirer({ verb: "claim" });
    assert.ok(reponse.ok && reponse.verb === "claim" && reponse.mission !== null, JSON.stringify(reponse));
    const { mission } = reponse;
    assert.ok(mission.prompt.includes(`- L1 : ${LECON_DU_PROJET}`));
    assert.ok(mission.prompt.includes("- L-1 : Capturer l'écran avant et après."));
    assert.deepEqual(
      carnetDonne(16).map((e) => [e.author, e.payload]),
      [[`station:${MAC}`, { run: mission.run, name: "app-src-vue", zone: "app/src/vue", file: `${PROFILS_DIR}/app-src-vue.md`, lessons: ["L-1"] }]],
    );
  });

  test("une définition illisible n'est pas un profil : elle est écartée, et nommée", async (t) => {
    const repoDir = repertoireTemporaire(t);
    mkdirSync(join(repoDir, PROFILS_DIR), { recursive: true });
    writeFileSync(join(repoDir, PROFILS_DIR, "casse.md"), "pas une définition\n");
    const avertis: string[] = [];

    assert.deepEqual(lireLesProfils(repoDir, (texte) => void avertis.push(texte)), []);
    assert.equal(avertis.length, 1);
    assert.match(avertis[0] ?? "", /casse\.md est illisible/);
    // Sans dossier de profils, aucun profil, et rien à dire.
    assert.deepEqual(lireLesProfils(repertoireTemporaire(t), (texte) => void avertis.push(texte)), []);
    assert.equal(avertis.length, 1);
  });
});

describe("le profil préféré d'un ticket", () => {
  const RUNTIME = profil("runtime-src", "runtime/src");
  const PROFILS = profil("runtime-src-profils", "runtime/src/profils");

  test("celui dont le domaine touche la zone du ticket ; aucun, un généraliste", () => {
    assert.equal(profilPrefere([VUE, RUNTIME], ["app/src/vue/rail.ts"], new Set())?.name, "app-src-vue");
    // Une zone qui contient le domaine le touche aussi.
    assert.equal(profilPrefere([VUE], ["app/src"], new Set())?.name, "app-src-vue");
    assert.equal(profilPrefere([VUE, RUNTIME], ["docs"], new Set()), null);
    assert.equal(profilPrefere([VUE], [], new Set()), null);
    // Par segments entiers : `app/src/vue2` n'est pas du domaine `app/src/vue`.
    assert.equal(profilPrefere([VUE], ["app/src/vue2"], new Set()), null);
  });

  test("plusieurs le touchent : le plus précis d'abord ; occupé, le suivant ; tous occupés, un généraliste", () => {
    const zone = ["runtime/src/profils/preference.ts"];
    assert.equal(profilPrefere([RUNTIME, PROFILS], zone, new Set())?.name, "runtime-src-profils");
    assert.equal(profilPrefere([RUNTIME, PROFILS], zone, new Set(["runtime-src-profils"]))?.name, "runtime-src");
    assert.equal(profilPrefere([RUNTIME, PROFILS], zone, new Set(["runtime-src-profils", "runtime-src"])), null);
  });

  test("le cook d'un profil est occupé tant qu'un cook lancé sous lui tourne, et d'un seul projet", (t) => {
    const journal = ouvrirJournal(repertoireTemporaire(t));
    t.after(() => journal.fermer());
    const lancer = (projet: string, run: string, ticket: number) => {
      journal.ajouter({ project: projet, ticket, author: "station:box/claude", type: "cook.launched", payload: { run, limits: PLAFONDS, stream: `runs/${run}.jsonl` } });
      journal.ajouter({ project: projet, ticket, author: "station:box/claude", type: "profile.notebook-given", payload: { run, name: "app-src-vue", zone: "app/src/vue", file: `${PROFILS_DIR}/app-src-vue.md`, lessons: [] } });
    };
    assert.deepEqual([...profilsOccupes(journal.base, "brigade")], []);
    lancer("brigade", "r1", 14);
    lancer("autre", "r2", 3);
    assert.deepEqual([...profilsOccupes(journal.base, "brigade")], ["app-src-vue"]);

    journal.ajouter({ project: "brigade", ticket: 14, author: "runtime", type: "cook.exited", payload: { run: "r1", outcome: "ok", code: 0, signal: null, turns: 1, tokens: 1, durationMs: 1 } });
    assert.deepEqual([...profilsOccupes(journal.base, "brigade")], []);
    assert.deepEqual([...profilsOccupes(journal.base, "autre")], ["app-src-vue"]);
  });

  test("chaque consigne de cook porte le carnet après les leçons du projet ; sans profil, elle reste ce qu'elle était", () => {
    const carnet = carnetDuProfil(VUE);
    const lecons = [{ id: "L1", texte: LECON_DU_PROJET }];
    const mission = { ticket: 7, titre: "t", depot: "o/r", base: "v2", lecons };
    const consignes = [
      (c?: typeof carnet | null) => consigne({ ...mission, carnet: c }),
      (c?: typeof carnet | null) => consigneDeSuite({ ...mission, branche: "cook/7", carnet: c }),
      (c?: typeof carnet | null) => consigneDeRenvoi({ ...mission, branche: "cook/7", n: 1, findings: ["f"], carnet: c }),
      (c?: typeof carnet | null) => consigneDeReprise({ base: "v2", branche: "cook/7", worktree: "/w", n: 1, findings: ["f"], lecons, carnet: c }),
    ];
    for (const ecrire of consignes) {
      const texte = ecrire(carnet);
      assert.ok(texte.includes("- L-1 : Capturer l'écran avant et après."));
      assert.ok(texte.indexOf(`- L1 : ${LECON_DU_PROJET}`) < texte.indexOf("- L-1 :"));
      assert.equal(ecrire(null), ecrire());
      assert.doesNotMatch(ecrire(), /profil de cook/);
    }
    // Un profil au carnet vide : son cook sait sous quel profil il part.
    assert.match(blocDuCarnet(carnetDuProfil(profil("docs", "docs"))).join("\n"), /profil de cook « docs ».*aucune leçon/);
    assert.deepEqual(blocDuCarnet(null), []);
  });
});
