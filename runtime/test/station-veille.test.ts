// Le Mac fermé, ou en veille, en pleine cuisson : sa station se tait. Le bail
// de son ticket tombe, faute de progrès montré, et le ticket revient au rail,
// prêt. Ce que le Mac avait déjà poussé — sa branche, ses commits — est
// conservé : le cook suivant en repart, sur la box ou sur le Mac réveillé, au
// lieu de recommencer de zéro. Pendant la veille, le ticket n'a jamais qu'un
// cook : réveillé, le Mac apprend que le sien est arrêté, et rien de lui n'est
// plus reçu. Sur une cuisine complète — la box saturée par sa machine, le Mac
// `distante+ordinaires` avec son bac à sable —, la station jouée par le test
// depuis sa propre connexion au journal, comme le ferait son geste (`run pull`).
import assert from "node:assert/strict";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import type { BacASableDeLaStation, Demande, Mission, Reponse } from "../src/events/remote.ts";
import type { Machine } from "../src/machine.ts";
import { cooksEnCours } from "../src/projections/guardrails.ts";
import { etatStation } from "../src/projections/stations.ts";
import { lireStations } from "../src/stations-declarees.ts";
import { demander } from "../src/tirer.ts";
import { travailLaisse } from "../src/travail-conserve.ts";
import { BAIL_MS, cuisine, issue, MACHINE_CALME, pousserSurLOrigine, type Options } from "./aides/cuisine.ts";
import { BASE, commiter, git, jusqua, repertoireTemporaire } from "./outils.ts";

const [BOX, MAC] = ["box/claude", "mac/claude"];
const STATIONS = lireStations({ BRIGADE_STATIONS: `${BOX}:3:code,${MAC}:2:chrome-connecté:distante+ordinaires` });
const PRESENCE_MS = 120_000;
const DISPONIBLE: BacASableDeLaStation = { available: true, version: "2.1.250", home: "/Users/chef", worktrees: "/Users/chef/brigade-cooks/brigade", caches: ["/Users/chef/Library/Caches/brigade"] };
// Sa machine n'en peut plus : la box sature, sous son plafond, sans aucun cook.
const PLEINE: Machine = { ...MACHINE_CALME, charge: 64 };

// Le temps qu'une prise qui ne doit pas avoir lieu aurait largement eu pour se faire.
const laisserServir = () => new Promise((resoudre) => setTimeout(resoudre, 80));

function service(t: TestContext, options: Options = {}) {
  let machine = PLEINE;
  const lieu = cuisine(t, { stations: STATIONS, scenario: "muet", presenceMs: PRESENCE_MS, machine: () => machine, ...options });
  const { gh, journal, repertoire, heure, etat, dernier } = lieu;
  const tirer = (demande: Demande): Promise<Reponse> => demander(repertoire, MAC, demande, { maintenant: heure.maintenant, pasMs: 2 });
  const reclamer = async (): Promise<Extract<Reponse, { verb: "claim" }>> => {
    const reponse = await tirer({ verb: "claim", sandbox: DISPONIBLE });
    assert.ok(reponse.ok && reponse.verb === "claim", JSON.stringify(reponse));
    return reponse;
  };
  const mission = async (): Promise<Mission> => {
    const { mission: recue } = await reclamer();
    assert.ok(recue !== null, "aucune mission");
    return recue;
  };
  // Qui a pris le ticket, dans l'ordre.
  const prises = (ticket: number) => journal.duTicket(ticket).flatMap((e) => (e.type === "ticket.taken" ? [e.author] : []));
  // La box sature : le Mac s'annonce et prend #17, un ticket ordinaire.
  const prendre = async (): Promise<Mission> => {
    gh.poser(issue(17));
    assert.ok((await tirer({ verb: "announce", sandbox: DISPONIBLE })).ok);
    await jusqua(() => etatStation(journal.base, BOX)?.saturatedResource === "cpu" && etat(17) === "waiting");
    const prise = await mission();
    assert.equal(prise.ticket, 17);
    assert.deepEqual(prises(17), [`station:${MAC}`]);
    return prise;
  };
  // Le Mac se ferme : plus aucune demande. Passé le bail, son cook est perdu.
  const fermer = async () => {
    heure.avancer(BAIL_MS);
    await jusqua(() => dernier("cook.reported", 17) !== undefined);
  };
  // La box respire : elle prend de nouveau des tickets.
  const soulager = async () => {
    machine = MACHINE_CALME;
    await jusqua(() => etatStation(journal.base, BOX)?.saturatedResource == null);
  };
  return { ...lieu, tirer, reclamer, mission, prises, prendre, fermer, soulager };
}

describe("le Mac fermé ou en veille : ses tickets reviennent au rail sans perte, et la box les reprend", { concurrency: 4 }, () => {
  test("en pleine cuisson, le Mac se tait : le bail tombe, le ticket revient prêt, et ce qu'il avait poussé est conservé", async (t) => {
    const { gh, journal, repertoire, etat, dernier, tirer, prises, prendre, fermer } = service(t);
    const { run, branch } = await prendre();
    assert.equal((await tirer({ verb: "renew", run, proof: "e1", turns: 3, tokens: 300 })).ok, true);
    // Son cook a commité, et sa station a poussé sa branche sur l'origine.
    pousserSurLOrigine(repertoire, branch);

    await fermer();
    assert.equal(dernier("guard.tripped", 17)?.reason, "lease");
    // De nouveau prêt : en attente, ni 86 ni retenu — et personne d'autre ne l'a pris.
    assert.equal(etat(17), "waiting");
    assert.deepEqual(prises(17), [`station:${MAC}`]);
    // Le compte-rendu dit ce qui est conservé : la branche, et ses commits.
    const rapport = dernier("cook.reported", 17);
    assert.deepEqual([rapport?.ending, rapport?.reason, rapport?.branch, rapport?.kept], ["failed", "guard:lease", branch, 1]);
    assert.deepEqual(travailLaisse(journal.base, 17), { run, branch, kept: 1 });
    const commentaire = gh.commentaires.find(([numero, corps]) => numero === 17 && corps.startsWith("**Cook"))?.[1] ?? "";
    assert.match(commentaire, new RegExp(`Ce que la branche \`${branch}\` porte sur l'origine — 1 commit en plus de \`v2\` — est conservé : le cook suivant en repart`));
  });

  test("la box reprend le ticket sur la branche conservée, et repart de ce que le Mac avait poussé — sans redémarrer de zéro", async (t) => {
    const { origine, etat, dernier, tirer, cooks, prises, prendre, fermer, soulager } = service(t, { git: true, scenario: "livre" });
    const { run, branch } = await prendre();
    // Sur le Mac : son cook commite, sa station pousse la branche.
    const mac = join(repertoireTemporaire(t), "mac");
    git(origine, "clone", "-q", origine, mac);
    git(mac, "checkout", "-q", "-b", branch, `origin/${BASE}`);
    commiter(mac, "travail-du-mac.txt");
    git(mac, "push", "-q", "origin", branch);
    assert.equal((await tirer({ verb: "renew", run, proof: "e1", turns: 3, tokens: 300 })).ok, true);

    await fermer();
    assert.equal(dernier("cook.reported", 17)?.kept, 1);
    assert.equal(etat(17), "waiting");

    // La box a de la place : elle le prend, sur la branche du Mac.
    await soulager();
    await jusqua(() => dernier("cook.reported", 17)?.ending === "done");
    assert.deepEqual(prises(17), [`station:${MAC}`, `station:${BOX}`]);
    const lance = dernier("cook.launched", 17);
    assert.deepEqual([lance?.station, lance?.branch, lance?.continues, lance?.remote], [BOX, branch, run, undefined]);
    const consigne = cooks().at(-1)?.args[1] ?? "";
    assert.match(consigne, /^Tu es un cook de la brigade : tu reprends un seul ticket, le ticket #17/);
    assert.match(consigne, /Ne repars pas de zéro/);
    assert.ok(consigne.includes(`\`${branch}\``), consigne);
    // Son commit s'ajoute à celui du Mac, sur la même branche : rien n'est perdu,
    // rien n'est refait. Aucune autre branche n'est née pour ce ticket.
    assert.deepEqual(git(origine, "log", "--format=%s", branch).split("\n"), ["le travail du cook", "ajoute travail-du-mac.txt", "amorce"]);
    assert.deepEqual(git(origine, "for-each-ref", "--format=%(refname:short)", "refs/heads/cook/").split("\n"), [branch]);
    assert.equal(dernier("cook.reported", 17)?.branch, branch);
    assert.equal(etat(17), "pass");
  });

  test("pendant la veille, aucun ticket n'est perdu ni doublé : tenu par le Mac, la box ne le prend pas ; perdu, un seul cook le reprend ; réveillé, le Mac n'en reçoit plus rien", async (t) => {
    const { journal, repertoire, etat, heure, dernier, lancements, tirer, reclamer, prises, prendre, soulager } = service(t);
    const { run, branch } = await prendre();
    pousserSurLOrigine(repertoire, branch);

    // Une veille courte : la box a de la place, mais le ticket est tenu — elle
    // ne le prend pas. Réveillé avant la fin du bail, le Mac le garde.
    heure.avancer(BAIL_MS / 2);
    await soulager();
    await laisserServir();
    assert.deepEqual([etat(17), prises(17), lancements().length], ["taken", [`station:${MAC}`], 0]);
    assert.equal((await tirer({ verb: "renew", run, proof: "e1", turns: 1, tokens: 10 })).ok, true);

    // Une veille longue : le bail tombe, et la box le reprend — une fois.
    heure.avancer(BAIL_MS);
    await jusqua(() => lancements().length === 1 && etat(17) === "taken");
    assert.deepEqual(prises(17), [`station:${MAC}`, `station:${BOX}`]);
    assert.equal(dernier("cook.launched", 17)?.branch, branch);

    // Le Mac se réveille : son cook est arrêté, sa livraison n'est pas reçue, et
    // le ticket ne lui revient pas.
    const renouvele = await tirer({ verb: "renew", run, proof: "e2", turns: 9, tokens: 90 });
    assert.deepEqual([renouvele.ok, !renouvele.ok && renouvele.refusal, !renouvele.ok && renouvele.stop], [false, "stopped", "lease"]);
    const livre = await tirer({ verb: "deliver", run, ending: "delivered", reason: null, message: "J'ai fini.", turns: 9, tokens: 90 });
    assert.deepEqual([livre.ok, !livre.ok && livre.refusal], [false, "stopped"]);
    assert.deepEqual(await reclamer(), { ok: true, verb: "claim", mission: null, held: null });
    await laisserServir();

    // Un ticket, au rail une fois, tenu par la box, avec un seul cook en cours.
    assert.deepEqual(prises(17), [`station:${MAC}`, `station:${BOX}`]);
    assert.equal(journal.duTicket(17).findLast((e) => e.type === "ticket.taken")?.author, `station:${BOX}`);
    assert.equal(etat(17), "taken");
    assert.equal(cooksEnCours(journal.base).filter((cook) => cook.ticket === 17).length, 1);
    assert.equal(lancements().length, 1);
    assert.deepEqual(
      journal.duTicket(17).flatMap((e) => (e.type === "cook.reported" ? [e.payload.ending] : [])),
      ["failed"],
    );
  });

  test("réveillé, la box toujours saturée, le Mac reprend lui-même le travail conservé : même branche, tirée de l'origine", async (t) => {
    const { repertoire, dernier, tirer, mission, prendre, fermer } = service(t);
    const { run, branch } = await prendre();
    assert.equal((await tirer({ verb: "renew", run, proof: "e1", turns: 3, tokens: 300 })).ok, true);
    pousserSurLOrigine(repertoire, branch);
    await fermer();

    const reprise = await mission();
    assert.deepEqual([reprise.ticket, reprise.branch, reprise.resumes], [17, branch, { returns: 0, pr: null }]);
    assert.notEqual(reprise.run, run);
    assert.match(reprise.prompt, /Ne repars pas de zéro/);
    assert.equal(reprise.sandbox, true);
    assert.deepEqual([dernier("cook.launched", 17)?.continues, dernier("cook.launched", 17)?.branch], [run, branch]);
    // Son ancien cook, lui, n'est plus rien.
    const ancien = await tirer({ verb: "renew", run, proof: "e2", turns: 1, tokens: 10 });
    assert.deepEqual([ancien.ok, !ancien.ok && ancien.refusal], [false, "stopped"]);
  });

  test("rien de poussé : rien n'est conservé, et le cook suivant repart de la base, comme un premier", async (t) => {
    const { gh, journal, etat, dernier, cooks, tirer, prendre, fermer, soulager } = service(t);
    const { run, branch } = await prendre();
    assert.equal((await tirer({ verb: "renew", run, proof: "e1", turns: 3, tokens: 300 })).ok, true);
    await fermer();
    assert.equal(etat(17), "waiting");
    assert.equal(dernier("cook.reported", 17)?.kept, undefined);
    assert.match(gh.commentaires.find(([numero, corps]) => numero === 17 && corps.startsWith("**Cook"))?.[1] ?? "", /rien n'en était poussé sur l'origine/);
    // Le Mac a pu pousser depuis : la box le vérifie avant de partir.
    assert.deepEqual(travailLaisse(journal.base, 17), { run, branch, kept: null });

    await soulager();
    await jusqua(() => etat(17) === "taken" && dernier("cook.launched", 17)?.station === BOX);
    const lance = dernier("cook.launched", 17);
    assert.equal(lance?.branch, `cook/${lance?.run}`);
    assert.equal(lance?.continues, undefined);
    await jusqua(() => cooks().length === 1);
    assert.match(cooks()[0]?.args[1] ?? "", /^Tu es un cook de la brigade : tu exécutes un seul ticket, le ticket #17/);
  });
});
