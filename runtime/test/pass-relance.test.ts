// Le geste du chef sur une carte coincée en pass — livrée, jamais jugée, et
// rien dans sa pass : `pass <n> --relaunch` relance son jugement, par la file
// de la pass, et refuse ce qui n'est pas coincé (#1425).
import assert from "node:assert/strict";
import { describe, test, type TestContext } from "node:test";
import type { Check } from "../src/events/pass.ts";
import { relancerLeJugement } from "../src/file-de-la-pass.ts";
import { renvoyerLaLivraison } from "../src/geste-ticket.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { principal as montrerPass } from "../src/montrer-pass.ts";
import { passDuTicket } from "../src/projections/pass.ts";
import { CALIBRE, chef, cuisine, issue } from "./aides/cuisine.ts";
import { aArreter, appeler, jusqua, repertoireTemporaire } from "./outils.ts";

const EN_COURS: Check[] = [{ name: "tests", outcome: "pending", conclusion: "in_progress", url: null }];

const issues = (numeros: number[]) => numeros.map((numero, rang) => issue(numero, CALIBRE, { createdAt: `2026-10-01T00:00:${String(rang + 1).padStart(2, "0")}Z` }));

// Une cuisine sous grant, la CI de chaque commit en cours sauf pour ceux que le test libère.
function service(t: TestContext, numeros: number[], options: { lieux?: ReturnType<typeof cuisine>["lieux"]; pass?: boolean } = {}) {
  const lieu = cuisine(t, { lieux: options.lieux, pass: options.pass ?? true, issues: issues(numeros) });
  chef(lieu.repertoire, "grant.activated");
  const { journal, gh } = lieu;
  const liberes = new Set<number>();
  gh.github.ci = async (sha) => ([...liberes].some((numero) => passDuTicket(journal.base, numero)?.sha === sha) ? [] : EN_COURS);
  const evenements = (numero: number, type: string) => journal.duTicket(numero).filter((e) => e.type === type);
  // `pass <n> --relaunch`, joué comme le chef le joue, depuis son propre process.
  const relancer = async (numero: number) => {
    const appel = appeler(montrerPass, [String(numero), "--relaunch"], { BRIGADE_STATE_DIR: lieu.repertoire });
    return { code: await appel.fin, sortie: appel.sortie() };
  };
  return { ...lieu, evenements, relancer, liberer: (numero: number) => void liberes.add(numero) };
}

describe("relancer une pass coincée", { concurrency: 2 }, () => {
  test("une carte livrée qu'aucune pass ne juge est relancée : un jugement est mis en file, et son journal montre pass.started", async (t) => {
    // Une vie sans pass : 17 est livrée, et personne ne la juge.
    const premiere = service(t, [17], { pass: false });
    await jusqua(() => premiere.types(17).includes("ticket.passing"));
    assert.equal(passDuTicket(premiere.journal.base, 17)?.phase, "delivered");

    // Le renvoi du rail ne s'y applique pas, et le dit comme avant.
    assert.deepEqual(renvoyerLaLivraison(premiere.journal, "brigade", 17, null), {
      done: false,
      reason: "#17 has no delivery waiting for you: only a delivery the pass holds for you — green and not merged, or escalated — is sent back",
      price: "none: nothing was changed",
    });

    const relance = await premiere.relancer(17);
    assert.equal(relance.code, 0, relance.sortie);
    assert.match(relance.sortie, /#17: a judgement is queued/);
    const relances = premiere.evenements(17, "pass.relaunched");
    assert.equal(relances.length, 1);
    assert.equal(relances[0]!.author, "chef");
    assert.deepEqual(relances[0]!.payload, { run: passDuTicket(premiere.journal.base, 17)!.run });
    premiere.runtime.arreter("test");

    // La pass la prend, après la relance.
    const seconde = service(t, [17], { lieux: premiere.lieux });
    seconde.liberer(17);
    await jusqua(() => seconde.evenements(17, "pass.started").length > 0);
    assert.ok(seconde.evenements(17, "pass.started")[0]!.seq > relances[0]!.seq);
    const historique = appeler(montrerPass, ["17"], { BRIGADE_STATE_DIR: seconde.repertoire });
    assert.equal(await historique.fin, 0);
    assert.match(historique.sortie(), /judgement relaunched by the chef/);
  });

  test("une carte dont la pass tourne, qui attend son tour, ou déjà mergée est refusée, sans rien écrire ni créer de pass", async (t) => {
    const { journal, evenements, relancer, liberer } = service(t, [17, 18]);
    const compter = (type: string) => journal.tout().filter((e) => e.type === type).length;

    // La pass de 17 tourne — elle attend sa CI —, 18 attend son tour derrière elle.
    await jusqua(() => passDuTicket(journal.base, 17)?.phase === "judging" && passDuTicket(journal.base, 18)?.phase === "delivered");
    const debuts = compter("pass.started");

    const active = await relancer(17);
    assert.equal(active.code, 1);
    assert.match(active.sortie, /#17 already has an active pass: it is being judged since .* — nothing to relaunch/);
    const enFile = await relancer(18);
    assert.equal(enFile.code, 1);
    assert.match(enFile.sortie, /#18 is waiting for its turn — #17 is in its pass, next in line: it is not stuck/);
    assert.equal(compter("pass.relaunched"), 0);
    assert.equal(compter("pass.started"), debuts);

    // Mergée : il n'y a plus rien à juger.
    liberer(17);
    await jusqua(() => evenements(17, "merge.done").length > 0);
    const mergee = await relancer(17);
    assert.equal(mergee.code, 1);
    assert.match(mergee.sortie, /#17 is already (merged|served): there is no judgement to relaunch/);
    assert.equal(compter("pass.relaunched"), 0);
    assert.equal(evenements(17, "pass.started").length, 1);
  });
});

test("une carte mergée puis partie du rail — sa pass partie avec elle — se dit mergée, pas jamais passée en pass ; une carte inconnue, jamais passée", (t) => {
  const journal = ouvrirJournal(repertoireTemporaire(t));
  aArreter(t, () => journal.fermer());
  journal.ajouter({ project: "brigade", ticket: 17, author: "pass", type: "merge.done", payload: { pr: "https://github.com/benomite/brigade/pull/1", sha: null, by: "pass", reconciled: false } });
  journal.ajouter({ project: "brigade", ticket: 17, author: "github", type: "ticket.left", payload: { reason: "closed" } });
  assert.equal(passDuTicket(journal.base, 17), null);
  assert.deepEqual(relancerLeJugement(journal, 17), { fait: false, raison: "#17 is already merged: there is no judgement to relaunch" });
  assert.deepEqual(relancerLeJugement(journal, 18), { fait: false, raison: "#18 has never been through the pass: there is no delivery to judge" });
});
