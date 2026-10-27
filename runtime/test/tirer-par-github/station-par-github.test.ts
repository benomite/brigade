// Une station secondaire du projet — une autre machine, déclarée
// `distante+ensemble` — réclame un ticket, renouvelle son bail et rend son
// travail par GitHub seulement : elle pose sa demande dans son gist, la principale la relaie au
// journal du projet, son runtime en décide, et la réponse se publie au Kitchen
// board, où la station la lit. Son travail, c'est sa branche poussée sur
// l'origine : la pass de la principale le juge comme celui de tout cook. Et
// quand elle se tait, son bail tombe chez la principale. Sur une cuisine complète ; GitHub est un double
// en mémoire — des gists et des issues. La station secondaire n'a ni ssh vers
// la box ni accès à son journal : elle n'a que son gist et le tableau.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import type { Canal, Fichiers } from "../../src/appairage/canal.ts";
import type { BacASableDeLaStation, Reponse } from "../../src/events/remote.ts";
import { MARQUEUR } from "../../src/fiche.ts";
import { lireStations } from "../../src/stations-declarees.ts";
import type { ClientDuTableau, IssueDuTableau } from "../../src/tableau/publication/client.ts";
import { publierLeTableau, tableauDuJournal } from "../../src/tableau/publication/publier.ts";
import type { DemandeParGitHub } from "../../src/tirer-par-github/demande.ts";
import { demanderParGitHub, lecteurDuTableau } from "../../src/tirer-par-github/demander.ts";
import { relayerLesDemandes } from "../../src/tirer-par-github/relayer.ts";
import { attributionsDuTableau, reponseDuTableau } from "../../src/tirer-par-github/tableau.ts";
import { BAIL_MS, chef, cuisine, issue, plafonner, pousserSurLOrigine, type Options } from "../aides/cuisine.ts";
import { DEPOT, jusqua } from "../outils.ts";
import { posixOnly } from "../support/plateforme.ts";

const [BOX, MAC, PC] = ["box/claude", "mac/claude", "pc/claude"];
const GISTS: Record<string, string> = { [MAC]: "gistmac", [PC]: "gistpc" };
// Le poste de la seconde station, tel que sa sonde le dit : le bac à sable est là.
const DISPONIBLE: BacASableDeLaStation = { available: true, version: "2.1.250", home: "/Users/chef", worktrees: "/Users/chef/brigade-cooks/brigade", caches: [] };

// GitHub, doublé : les gists du compte et les issues du dépôt.
function fauxGitHub() {
  const gists = new Map<string, Fichiers>(Object.values(GISTS).map((id) => [id, {}]));
  const canal: Canal = {
    creer: async () => assert.fail("personne ne crée de gist ici"),
    async ecrire(id, fichiers) {
      const gist = gists.get(id);
      if (gist === undefined) return "absent";
      Object.assign(gist, fichiers);
      return "ecrit";
    },
    lire: async (id) => {
      const gist = gists.get(id);
      return gist === undefined ? null : { ...gist };
    },
  };
  const issues = new Map<number, IssueDuTableau>();
  const tableau: ClientDuTableau = {
    auLabel: async (label) => [...issues.values()].filter((une) => une.labels.includes(label)).map((une) => ({ ...une })),
    issue: async (numero) => (issues.has(numero) ? { ...issues.get(numero)! } : null),
    async creer({ titre, corps, labels }) {
      const numero = issues.size + 1;
      issues.set(numero, { numero, ouverte: true, titre, corps, labels });
      return numero;
    },
    async ecrireCorps(numero, corps) {
      issues.get(numero)!.corps = corps;
    },
    rouvrir: async () => {},
    epingler: async () => false,
  };
  const corps = () => [...issues.values()][0]?.corps ?? "";
  return { gists, canal, tableau, corps };
}

// Une cuisine dont le projet déclare ces stations ; la principale qui relaie et
// publie ; et de quoi jouer chaque station secondaire, par GitHub seulement.
function service(t: TestContext, declaration: string, options: Options = {}) {
  const lieu = cuisine(t, { stations: lireStations({ BRIGADE_STATIONS: declaration }), scenario: "muet", presenceMs: 120_000, plafonds: { durationMs: 3_600_000, idleMs: 3_600_000 }, ...options });
  const { journal, repertoire, heure, runtime } = lieu;
  const github = fauxGitHub();
  const instant = () => heure.maintenant().getTime();
  const secondaires = Object.entries(GISTS).map(([station, gist]) => ({ station, gist }));
  // La principale : ce que `projets/tenir.ts` fait à chaque lecture, puis ce
  // que le tableau fait à chaque tick (`brancherLeTableau`).
  const relayer = () => relayerLesDemandes({ repertoireEtat: repertoire, depot: DEPOT, secondaires, lire: github.canal.lire, maintenant: instant });
  const publication = publierLeTableau({ client: github.tableau, depot: DEPOT, lire: (lu) => tableauDuJournal(journal, runtime.projet, lu, { depot: DEPOT }), dire: () => {} });
  const relayees: string[] = [];
  let tourne = false;
  let boucle: Promise<void> = Promise.resolve();
  // Ce qui l'a arrêtée pendant qu'elle tournait : le test le dit à sa fin.
  let panne: unknown = null;
  const principale = () => {
    tourne = true;
    boucle = (async () => {
      while (tourne) {
        relayees.push(...(await relayer()).relayees.map(({ station, verb }) => `${station} ${verb}`));
        await publication.rafraichir(heure.maintenant());
        await new Promise((resoudre) => setTimeout(resoudre, 5));
      }
    })().catch((erreur: unknown) => void (tourne && (panne = erreur)));
  };
  // Arrêtée avant que la cuisine ne ferme son journal.
  const arreterLaPrincipale = async () => {
    tourne = false;
    await boucle;
    assert.equal(panne, null);
  };
  const demander = (station: string, demande: DemandeParGitHub): Promise<Reponse> =>
    demanderParGitHub({ station, depot: DEPOT, gist: GISTS[station]!, canal: github.canal, lireLeTableau: lecteurDuTableau(github.tableau), maintenant: instant, pasMs: 5, attenteMs: 60_000 }, demande);
  const prises = (ticket: number) => journal.duTicket(ticket).filter((e) => e.type === "ticket.taken").map((e) => e.author.replace(/^station:/, ""));
  // Qui tient le ticket, prise après prise : `<station>` à sa prise, `-` quand
  // il la quitte — rendu, ou son cook fini, qui le rend au rail.
  const tenues = (ticket: number) => journal.duTicket(ticket).flatMap((e) => (e.type === "ticket.taken" ? [e.payload.station] : e.type === "ticket.released" || e.type === "cook.exited" ? ["-"] : []));
  return { ...lieu, github, relayer, principale, relayees, demander, prises, tenues, arreterLaPrincipale };
}

const enAttente = async (lieu: ReturnType<typeof service>, ...numeros: number[]) => {
  // La box, à un cook au plus, est occupée : les tickets suivants attendent une station.
  lieu.gh.poser(issue(14));
  await jusqua(() => lieu.etat(14) === "taken");
  for (const numero of numeros) lieu.gh.poser(issue(numero));
  await jusqua(() => numeros.every((numero) => lieu.etat(numero) === "waiting"));
};

describe("une station secondaire tire son travail par GitHub, arbitrée par la principale", { concurrency: 4, skip: posixOnly("the kitchen runs the fake claude, a POSIX shell script") }, () => {
  test("sans ssh vers la box, elle obtient un ticket et son bail : sa demande posée dans son gist, la réponse lue au Kitchen board", async (t) => {
    const lieu = service(t, `${BOX}:1:code,${MAC}:1:code:distante+ensemble`);
    const { github, journal, etat, prises } = lieu;
    await enAttente(lieu, 17);
    lieu.principale();

    const reponse = await lieu.demander(MAC, { verb: "claim", sandbox: DISPONIBLE });
    assert.ok(reponse.ok && reponse.verb === "claim", JSON.stringify(reponse));
    const { mission } = reponse;
    assert.ok(mission !== null, JSON.stringify(reponse));
    assert.equal(mission.ticket, 17);
    assert.equal(mission.branch, `cook/${mission.run}`);
    // Un ticket ordinaire ne part sur une autre machine que dans son bac à sable.
    assert.equal(mission.sandbox, true);
    // Les arguments de `claude` reviennent entiers : la consigne en tête, comme `pull` les rend.
    assert.deepEqual(mission.args.slice(0, 2), ["-p", mission.prompt]);
    assert.ok(mission.args.includes("--model") && mission.args.includes(mission.model));
    assert.match(mission.prompt, /ticket #17/);
    assert.ok(Date.parse(mission.leaseUntil) > lieu.heure.maintenant().getTime());

    // C'est la principale qui a décidé : le ticket est à elle au journal, une fois.
    assert.equal(etat(17), "taken");
    assert.deepEqual(prises(17), [MAC]);
    // Et rien n'est passé par le geste de la box : chaque demande au journal vient de GitHub.
    const demandes = journal.tout().filter((e) => e.type === "remote.asked");
    assert.equal(demandes.length, 1);
    assert.ok(demandes.every((e) => e.type === "remote.asked" && e.payload.via === "github"));
    // Le tableau dit le prêt et son bail.
    assert.deepEqual(attributionsDuTableau(github.corps(), MAC), [{ ticket: 17, station: MAC, run: mission.run, bailJusqua: mission.leaseUntil }]);
    // Sa demande est restée dans son gist ; la principale ne la relaie qu'une fois.
    assert.equal(Object.keys(github.gists.get("gistmac") ?? {}).length, 1);
    assert.deepEqual(lieu.relayees, [`${MAC} claim`]);
    await lieu.arreterLaPrincipale();
  });

  test("deux stations réclament le même ticket au même instant : une seule l'obtient, l'autre n'en reçoit aucun", async (t) => {
    const lieu = service(t, `${BOX}:1:code,${MAC}:1:code:distante+ensemble,${PC}:1:code:distante+ensemble`);
    const { github, etat, prises } = lieu;
    await enAttente(lieu, 17);

    // Les deux demandes sont posées avant que la principale ne lise : elle les relaie ensemble.
    const reponses = [lieu.demander(MAC, { verb: "claim", sandbox: DISPONIBLE }), lieu.demander(PC, { verb: "claim", sandbox: DISPONIBLE })];
    await jusqua(() => [...github.gists.values()].every((gist) => Object.keys(gist).length === 1));
    lieu.principale();
    const [mac, pc] = await Promise.all(reponses);
    assert.deepEqual(lieu.relayees.slice(0, 2).sort(), [`${MAC} claim`, `${PC} claim`]);

    const recues = [mac, pc].map((reponse) => (reponse?.ok && reponse.verb === "claim" ? (reponse.mission?.ticket ?? null) : "refus"));
    assert.deepEqual(recues.filter((recue) => recue === 17).length, 1, JSON.stringify([mac, pc]));
    assert.deepEqual(recues.filter((recue) => recue === null).length, 1, JSON.stringify([mac, pc]));
    const gagnante = recues[0] === 17 ? MAC : PC;
    assert.equal(etat(17), "taken");
    assert.deepEqual(prises(17), [gagnante]);
    // Le tableau ne prête le ticket qu'à elle.
    assert.deepEqual(attributionsDuTableau(github.corps(), gagnante).map(({ ticket }) => ticket), [17]);
    assert.deepEqual(attributionsDuTableau(github.corps(), gagnante === MAC ? PC : MAC), []);
    await lieu.arreterLaPrincipale();
  });

  test("la station renouvelle son bail par GitHub : son échéance avance au Kitchen board — sans preuve de progrès, elle n'avance pas", async (t) => {
    const lieu = service(t, `${BOX}:1:code,${MAC}:1:code:distante+ensemble`);
    const { github, heure } = lieu;
    await enAttente(lieu, 17);
    lieu.principale();
    const prise = await lieu.demander(MAC, { verb: "claim", sandbox: DISPONIBLE });
    assert.ok(prise.ok && prise.verb === "claim" && prise.mission !== null, JSON.stringify(prise));
    const { run, leaseUntil: premier } = prise.mission;
    await jusqua(() => attributionsDuTableau(github.corps(), MAC)[0]?.bailJusqua === premier);

    // Son cook a travaillé : son worktree a bougé.
    heure.avancer(60_000);
    const renouvele = await lieu.demander(MAC, { verb: "renew", run, proof: "empreinte-1", turns: 3, tokens: 1200 });
    assert.ok(renouvele.ok && renouvele.verb === "renew", JSON.stringify(renouvele));
    assert.ok(Date.parse(renouvele.leaseUntil) > Date.parse(premier), `${renouvele.leaseUntil} après ${premier}`);
    await jusqua(() => attributionsDuTableau(github.corps(), MAC)[0]?.bailJusqua === renouvele.leaseUntil);
    assert.deepEqual(attributionsDuTableau(github.corps(), MAC), [{ ticket: 17, station: MAC, run, bailJusqua: renouvele.leaseUntil }]);

    // La même empreinte : rien n'a bougé, le bail ne se renouvelle pas — il reste au tableau tel quel.
    heure.avancer(60_000);
    const refuse = await lieu.demander(MAC, { verb: "renew", run, proof: "empreinte-1", turns: 4, tokens: 1300 });
    assert.deepEqual([refuse.ok, !refuse.ok && refuse.refusal], [false, "no-progress"]);
    assert.equal(attributionsDuTableau(github.corps(), MAC)[0]?.bailJusqua, renouvele.leaseUntil);
    // Chaque renouvellement a son fichier dans le gist, à côté de la réclamation.
    assert.equal(Object.keys(github.gists.get("gistmac") ?? {}).length, 2);
    await lieu.arreterLaPrincipale();
  });

  test("sans ssh vers la box, elle rend son travail par sa branche et sa PR : la pass de la principale la juge comme celle de tout cook", async (t) => {
    const lieu = service(t, `${BOX}:1:code,${MAC}:1:chrome-connecté:distante+ensemble`, { pass: true, scenario: "livre" });
    const { gh, github, journal, repertoire, etat, types, dernier, gates, relectures, cooks } = lieu;
    // Servi, un ticket quitte le rail dans la foulée — son issue est fermée : c'est au journal qu'il se lit.
    const servi = (ticket: number) => types(ticket).includes("ticket.served");
    chef(repertoire, "grant.activated");
    // #14 cuit sur la box ; #16 demande ce que seule la seconde station fournit.
    gh.poser(issue(14));
    gh.ficher(16, "2026-10-08T09:00:00Z", [MARQUEUR, "- requiert : chrome-connecté"].join("\n"));
    gh.poser(issue(16));
    await jusqua(() => servi(14) && etat(16) === "86");
    lieu.principale();

    assert.equal((await lieu.demander(MAC, { verb: "announce" })).ok, true);
    const prise = await lieu.demander(MAC, { verb: "claim" });
    assert.ok(prise.ok && prise.verb === "claim" && prise.mission !== null, JSON.stringify(prise));
    const { ticket, run, branch } = prise.mission;
    assert.equal(ticket, 16);
    assert.equal((await lieu.demander(MAC, { verb: "renew", run, proof: "e1", turns: 3, tokens: 300 })).ok, true);
    // Son cook a fini : la station pousse sa branche sur l'origine, puis le dit dans son gist.
    pousserSurLOrigine(repertoire, branch);
    const rendu = await lieu.demander(MAC, { verb: "deliver", run, ending: "delivered", reason: null, message: "J'ai fini.\n<livrable>\nLe parcours est éprouvé dans Chrome.\n</livrable>", turns: 4, tokens: 400 });
    assert.deepEqual(rendu, { ok: true, verb: "deliver", ending: "done", reason: null });
    await jusqua(() => servi(16));

    // Le chemin emprunté, de la livraison au service : celui du ticket cuisiné
    // sur la box, fait pour fait.
    const chemin = (numero: number) =>
      journal
        .duTicket(numero)
        .map((e) => e.type)
        .filter((type) => /^(pass|grant|merge|gates|review)\.|^cook\.(exited|reported)$|^ticket\.(passing|served|released|86)$/.test(type));
    const [box, mac] = [chemin(14), chemin(16)];
    assert.deepEqual(mac.slice(mac.lastIndexOf("cook.exited")), box);
    assert.ok(box.includes("pass.judged") && box.includes("merge.done") && box.at(-1) === "ticket.served", box.join(" "));
    // Les mêmes gates, le même reviewer, le même verdict.
    assert.deepEqual(gates.appels().map((essai) => essai.slice(essai.lastIndexOf("/") + 1)).sort(), ["jugement-14", "jugement-16"]);
    const lus = relectures();
    assert.equal(lus.length, 2);
    const sansConsigne = (args: string[]) => args.map((arg, i) => (i === 1 ? "" : arg));
    assert.deepEqual(sansConsigne(lus[0]?.args ?? []), sansConsigne(lus[1]?.args ?? []));
    const verdict = (numero: number) => {
      const juge = dernier("pass.judged", numero) as { verdict: string; gates: { outcome: string }; review: { outcome: string } };
      return [juge.verdict, juge.gates.outcome, juge.review.outcome];
    };
    assert.deepEqual(verdict(16), verdict(14));
    assert.deepEqual(verdict(16), ["green", "green", "green"]);
    // Son compte-rendu est celui d'un cook : sa branche, sa PR, son livrable.
    const rapport = dernier("cook.reported", 16);
    assert.deepEqual([rapport?.ending, rapport?.branch, rapport?.deliverable], ["done", branch, "Le parcours est éprouvé dans Chrome."]);
    assert.match(String(rapport?.pr), /\/pull\/10[12]$/);
    assert.deepEqual([dernier("cook.exited", 16)?.outcome, dernier("cook.exited", 16)?.turns, dernier("cook.exited", 16)?.tokens], ["ok", 4, 400]);
    // Aucun cook n'a tourné sur la box pour #16.
    assert.deepEqual(cooks().map((lance) => /ticket #(\d+)/.exec(lance.args[1] ?? "")?.[1]), ["14"]);

    // Rien n'est passé par le geste de la box : chaque demande, la livraison comprise, vient de GitHub.
    const demandes = journal.tout().filter((e) => e.type === "remote.asked");
    assert.deepEqual(demandes.map((e) => e.type === "remote.asked" && [e.payload.verb, e.payload.via]), [["announce", "github"], ["claim", "github"], ["renew", "github"], ["deliver", "github"]]);
    // Rendu, le ticket n'est plus prêté au tableau ; sa livraison y a sa réponse.
    await jusqua(() => attributionsDuTableau(github.corps(), MAC).length === 0);
    const livraison = demandes.at(-1);
    assert.ok(livraison?.type === "remote.asked");
    assert.deepEqual(reponseDuTableau(github.corps(), MAC, livraison.payload.id), rendu);
    // Un fichier par créneau dans son gist : sa réclamation, son renouvellement, sa livraison.
    assert.deepEqual(Object.keys(github.gists.get("gistmac") ?? {}).map((nom) => nom.split(".").slice(3, -1).join(".")).sort(), ["claim", `deliver.${run}`, `renew.${run}`]);
    await lieu.arreterLaPrincipale();
  });

  test("une station qui se tait perd son bail sans rien faire : il tombe au Kitchen board, la principale reprend le ticket — jamais tenu par deux stations", async (t) => {
    const lieu = service(t, `${BOX}:1:code,${MAC}:1:code:distante+ensemble,${PC}:1:code:distante+ensemble`);
    const { github, repertoire, etat, heure, prises, tenues, dernier } = lieu;
    await enAttente(lieu, 17);
    lieu.principale();
    const prise = await lieu.demander(MAC, { verb: "claim", sandbox: DISPONIBLE });
    assert.ok(prise.ok && prise.verb === "claim" && prise.mission?.ticket === 17, JSON.stringify(prise));
    const { run, leaseUntil } = prise.mission;
    await jusqua(() => attributionsDuTableau(github.corps(), MAC)[0]?.bailJusqua === leaseUntil);
    // La box a désormais de la place : le ticket reste à la station tant que son bail court.
    plafonner(repertoire, 2, BOX);

    // La station se tait — son poste fermé : plus rien n'arrive de son gist.
    // Le bail passe, et la principale le fait tomber d'elle-même.
    heure.avancer(BAIL_MS);
    await jusqua(() => dernier("guard.tripped", 17)?.reason === "lease");
    assert.equal(dernier("guard.tripped", 17)?.run, run);
    await jusqua(() => attributionsDuTableau(github.corps(), MAC).length === 0);
    assert.deepEqual([dernier("cook.reported", 17)?.ending, dernier("cook.reported", 17)?.reason], ["failed", "guard:lease"]);

    // Le ticket revient au rail, et la principale le reprend sur la box.
    await jusqua(() => prises(17).length === 2 && etat(17) === "taken");
    assert.deepEqual(prises(17), [MAC, BOX]);
    // Jamais tenu par deux stations : la seconde prise vient après que la première l'a quitté.
    assert.deepEqual(tenues(17), [MAC, "-", BOX]);

    // Réveillée, la station l'apprend à sa demande suivante : son cook est arrêté,
    // et rien de ce qu'elle rendrait n'est plus reçu.
    const apres = await lieu.demander(MAC, { verb: "renew", run, proof: "empreinte-2", turns: 9, tokens: 90 });
    assert.deepEqual([apres.ok, !apres.ok && apres.refusal, !apres.ok && apres.stop], [false, "stopped", "lease"]);
    const tardive = await lieu.demander(MAC, { verb: "deliver", run, ending: "delivered", reason: null, message: null, turns: 9, tokens: 90 });
    assert.deepEqual([tardive.ok, !tardive.ok && tardive.refusal], [false, "stopped"]);
    // Une autre station qui le réclame ne l'obtient pas : la box le tient.
    const autre = await lieu.demander(PC, { verb: "claim", sandbox: DISPONIBLE });
    assert.ok(autre.ok && autre.verb === "claim", JSON.stringify(autre));
    assert.equal(autre.mission, null);
    assert.deepEqual(prises(17), [MAC, BOX]);
    assert.equal(etat(17), "taken");
    assert.deepEqual([...attributionsDuTableau(github.corps(), MAC), ...attributionsDuTableau(github.corps(), PC)], []);
    await lieu.arreterLaPrincipale();
  });
});

test("le côté de la station secondaire n'ouvre aucun journal et ne passe par aucun geste de la box : il n'a que son gist et le tableau", () => {
  const source = readFileSync(join(import.meta.dirname, "../../src/tirer-par-github/demander.ts"), "utf8");
  assert.doesNotMatch(source, /from "\.\.\/(journal|tirer|distantes)\.ts"|ouvrirJournal|BRIGADE_STATE_DIR|node:child_process/);
});
