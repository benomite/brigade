// Une station distante tire son travail, sous les mêmes règles qu'un cook de la
// box : elle s'annonce, réclame un ticket dont elle fournit tout ce qu'il
// demande, ne renouvelle son bail que sur une preuve de travail, tombe sous les
// mêmes plafonds, et sa livraison traverse la même pass. Absente, les tickets
// qu'elle seule peut cuisiner sont 86, et les autres partent. Sur une cuisine
// complète : rail, garde-fous, stations, pass, un faux `claude`, un GitHub de
// test — et la station, jouée par le test, depuis sa propre connexion au
// journal, comme le ferait son geste (`run tirer`).
import assert from "node:assert/strict";
import { basename } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { DELAI_DE_REPONSE_MS } from "../src/distantes.ts";
import type { Demande, Mission, Reponse } from "../src/events/remote.ts";
import { decrireEtat, lireEtat } from "../src/etat.ts";
import { MARQUEUR } from "../src/fiche.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { etatDesGardeFous } from "../src/projections/guardrails.ts";
import { etatStation } from "../src/projections/stations.ts";
import { lireStations } from "../src/stations-declarees.ts";
import { demander } from "./aides/demander.ts";
import { BAIL_MS, chef, cuisine, issue, PLAFONDS, pousserSurLOrigine, type Lieux, type Options } from "./aides/cuisine.ts";
import { jusqua } from "./outils.ts";

const [BOX, MAC] = ["box/claude", "mac/claude"];
const DECLAREES = lireStations({ BRIGADE_STATIONS: `${BOX}:1:code,${MAC}:2:chrome-connecté:distante` });
const PRESENCE_MS = 120_000;

// Pose un ticket calibré avec sa fiche, comme le manager au découpage.
const poser = (gh: Lieux["gh"], numero: number, ...lignes: string[]) => {
  if (lignes.length > 0) gh.ficher(numero, "2026-10-08T09:00:00Z", [MARQUEUR, ...lignes].join("\n"));
  gh.poser(issue(numero));
};

// Le temps qu'une prise qui ne doit pas avoir lieu aurait largement eu pour se faire.
const laisserServir = () => new Promise((resoudre) => setTimeout(resoudre, 80));

// Une cuisine dont le projet déclare une station d'ici et une station
// distante, et de quoi jouer celle-ci.
function service(t: TestContext, options: Options = {}) {
  const lieu = cuisine(t, { stations: DECLAREES, scenario: "muet", presenceMs: PRESENCE_MS, ...options });
  const { journal, repertoire, heure } = lieu;
  // Le geste de la station : une autre connexion au journal, et la réponse du runtime.
  const tirer = (demande: Demande, station = MAC): Promise<Reponse> => demander(repertoire, station, demande, { maintenant: heure.maintenant, pasMs: 2 });
  const reclamer = async (): Promise<Mission> => {
    const reponse = await tirer({ verb: "claim" });
    assert.ok(reponse.ok && reponse.verb === "claim" && reponse.mission !== null, JSON.stringify(reponse));
    return reponse.mission;
  };
  const compter = (type: string) => journal.tout().filter((e) => e.type === type).length;
  const jusquAu = (type: string, combien = 1) => jusqua(() => compter(type) >= combien);
  const raison = (ticket: number) => lieu.runtime.rail.tickets().find((x) => x.ticket === ticket)?.reason;
  return { ...lieu, tirer, reclamer, compter, jusquAu, raison };
}

describe("une station distante tire son travail", { concurrency: 8 }, () => {
  test("annoncée, elle reçoit le ticket dont elle fournit tout ce qu'il demande — jamais celui qui demande ce qu'elle ne fournit pas, même s'il attend devant", async (t) => {
    const { gh, journal, etat, lancements, tirer, reclamer, dernier } = service(t);
    poser(gh, 14, "- requiert : code");
    // La station d'ici est pleine : #15 attend, devant #16 dans l'ordre de service.
    poser(gh, 15, "- requiert : code");
    poser(gh, 16, "- requiert : chrome-connecté");
    await jusqua(() => lancements().length === 1 && etat(16) === "86");

    const annonce = await tirer({ verb: "announce" });
    assert.deepEqual(annonce, { ok: true, verb: "announce", provides: ["chrome-connecté"], maxCooks: 2, presenceMs: PRESENCE_MS, leaseMs: BAIL_MS, limits: PLAFONDS });
    await jusqua(() => etat(16) === "waiting");

    const mission = await reclamer();
    assert.equal(mission.ticket, 16);
    assert.deepEqual([etat(14), etat(15), etat(16)], ["taken", "waiting", "taken"]);
    assert.equal(journal.duTicket(16).findLast((e) => e.type === "ticket.taken")?.author, `station:${MAC}`);
    // Ce qu'elle reçoit : de quoi lancer le même cook, sous les mêmes bornes —
    // rien de plus. Le cook d'ici, lui, a été lancé avec les mêmes arguments.
    assert.deepEqual(
      { ...mission, prompt: "", args: [] },
      { ticket: 16, title: "Ticket 16", run: mission.run, branch: `cook/${mission.run}`, base: "v2", repository: "acme/brigade", model: "sonnet", effort: "low", prompt: "", args: [], limits: PLAFONDS, leaseMs: BAIL_MS, leaseUntil: mission.leaseUntil, resumes: null },
    );
    assert.match(mission.prompt, /^Tu es un cook de la brigade : tu exécutes un seul ticket, le ticket #16 du dépôt acme\/brigade/);
    const dIci = lancements()[0]?.args ?? [];
    assert.deepEqual(mission.args.map((arg, i) => (i === 1 ? "" : arg)), dIci.map((arg, i) => (i === 1 ? "" : arg)));
    assert.equal(mission.args[1], mission.prompt);
    assert.deepEqual(Object.keys(mission).filter((cle) => /secret|token|jeton|grant/i.test(cle)), []);
    // Son cook est lancé par les garde-fous, sous les plafonds d'un cook de la box.
    const lance = dernier("cook.launched", 16);
    assert.deepEqual([lance?.station, lance?.remote, lance?.limits, lance?.branch], [MAC, true, PLAFONDS, mission.branch]);
    assert.deepEqual(lance?.limits, dernier("cook.launched", 14)?.limits);

    // Rien d'autre ne lui revient : #15 demande ce qu'elle ne fournit pas.
    assert.deepEqual(await tirer({ verb: "claim" }), { ok: true, verb: "claim", mission: null, held: null });
    await laisserServir();
    assert.equal(etat(15), "waiting");
    assert.equal(journal.duTicket(15).filter((e) => e.type === "ticket.taken").length, 0);
    // Aucun cook n'a été lancé sur la box pour son ticket.
    assert.equal(lancements().length, 1);
  });

  test("son cook reçoit les leçons provisoires du projet, comme un cook de la box, et son lancement dit lesquelles", async (t) => {
    const { gh, journal, etat, tirer, reclamer, dernier } = service(t);
    journal.ajouter({ project: "brigade", ticket: 9, author: "pass", type: "retro.recorded", payload: { run: null, text: null, kept: [{ kind: "propose", text: "Lire la fiche avant d'écrire." }], dropped: [] } });
    journal.ajouter({ project: "autre", ticket: 9, author: "pass", type: "retro.recorded", payload: { run: null, text: null, kept: [{ kind: "propose", text: "Une leçon d'un autre projet." }], dropped: [] } });
    poser(gh, 16, "- requiert : chrome-connecté");
    await jusqua(() => etat(16) === "86");
    await tirer({ verb: "announce" });
    await jusqua(() => etat(16) === "waiting");

    const mission = await reclamer();
    assert.ok(mission.prompt.includes("- L1 : Lire la fiche avant d'écrire."));
    assert.doesNotMatch(mission.prompt, /autre projet/);
    assert.deepEqual(dernier("cook.launched", 16)?.lessons, ["L1"]);
  });

  test("seule une station que le projet déclare distante tire son travail : un nom inconnu ou une station de la box sont refusés, et rien n'est prêté", async (t) => {
    const { gh, journal, etat, tirer } = service(t);
    poser(gh, 16, "- requiert : chrome-connecté");
    await jusqua(() => etat(16) === "86");

    const inconnue = await tirer({ verb: "claim" }, "mac/chrome");
    assert.deepEqual([inconnue.ok, !inconnue.ok && inconnue.refusal], [false, "unknown-station"]);
    const dIci = await tirer({ verb: "claim" }, BOX);
    assert.deepEqual([dIci.ok, !dIci.ok && dIci.refusal], [false, "not-remote"]);
    // Ni l'une ni l'autre ne vaut présence : le ticket attend toujours.
    assert.equal(etat(16), "86");
    assert.equal(journal.tout().filter((e) => e.type === "station.present").length, 0);
    assert.equal(etatStation(journal.base, MAC)?.presentSince, null);
  });

  test("son bail ne se renouvelle que sur une preuve de travail : sans preuve, ou sur la même empreinte, le renouvellement est refusé — et le bail tombe", async (t) => {
    const { gh, journal, etat, heure, tirer, reclamer, compter, jusquAu, dernier } = service(t);
    poser(gh, 16, "- requiert : chrome-connecté");
    await jusqua(() => etat(16) === "86");
    await tirer({ verb: "announce" });
    const { run, leaseUntil } = await reclamer();
    const echeance = () => journal.duTicket(16).findLast((e) => e.type === "ticket.taken" || e.type === "ticket.renewed")?.payload as { leaseUntil: string };
    assert.equal(echeance().leaseUntil, leaseUntil);

    // Sans preuve : refusé, et le bail n'a pas bougé.
    heure.avancer(60_000);
    const sansPreuve = await tirer({ verb: "renew", run, proof: null, turns: 1, tokens: 10 });
    assert.deepEqual([sansPreuve.ok, !sansPreuve.ok && sansPreuve.refusal, !sansPreuve.ok && sansPreuve.leaseUntil], [false, "no-progress", leaseUntil]);
    assert.equal(compter("ticket.renewed"), 0);

    // Une empreinte : le worktree a bougé, le bail repart d'ici.
    const renouvele = await tirer({ verb: "renew", run, proof: "empreinte-1", turns: 2, tokens: 20 });
    const repousse = new Date(heure.maintenant().getTime() + BAIL_MS).toISOString();
    assert.deepEqual(renouvele, { ok: true, verb: "renew", leaseUntil: repousse });
    assert.equal(echeance().leaseUntil, repousse);

    // La même empreinte : rien n'a bougé, rien n'est renouvelé — que la station
    // soit là et que son cook consomme n'y change rien.
    heure.avancer(60_000);
    const immobile = await tirer({ verb: "renew", run, proof: "empreinte-1", turns: 9, tokens: 90 });
    assert.deepEqual([immobile.ok, !immobile.ok && immobile.refusal, !immobile.ok && immobile.leaseUntil], [false, "no-progress", repousse]);
    assert.equal(compter("ticket.renewed"), 1);
    // Chaque refus est au journal, sur le ticket.
    assert.deepEqual(
      journal.duTicket(16).flatMap((e) => (e.type === "remote.answered" && !e.payload.ok ? [e.payload.refusal] : [])),
      ["no-progress", "no-progress"],
    );

    // Le bail tombe : le cook est arrêté par un arrêt de garde-fou, comme
    // celui d'une station d'ici, et le ticket revient.
    heure.avancer(BAIL_MS);
    await jusquAu("cook.exited");
    // Depuis le dernier progrès montré : une minute, puis le bail entier.
    assert.deepEqual(dernier("guard.tripped", 16), { run, reason: "lease", limit: BAIL_MS, observed: BAIL_MS + 60_000 });
    assert.equal(dernier("cook.exited", 16)?.outcome, "guard");
    assert.notEqual(etat(16), "taken");
    await jusquAu("cook.reported");
    assert.deepEqual([dernier("cook.reported", 16)?.ending, dernier("cook.reported", 16)?.reason], ["failed", "guard:lease"]);
    // La station l'apprend à sa demande suivante : son cook est à arrêter.
    const apres = await tirer({ verb: "renew", run, proof: "empreinte-2", turns: 9, tokens: 90 });
    assert.deepEqual([apres.ok, !apres.ok && apres.refusal, !apres.ok && apres.stop], [false, "stopped", "lease"]);
    assert.equal(compter("ticket.renewed"), 1);
  });

  test("les plafonds des garde-fous sont ceux d'un cook de la box : le plafond de jetons l'arrête sur ce que sa station rapporte, sans ouvrir le disjoncteur, et chaque étape est au journal", async (t) => {
    const { gh, journal, etat, tirer, reclamer, jusquAu, dernier, types, lancements } = service(t, { plafonds: { tokens: 55 }, seuilDisjoncteur: 1 });
    poser(gh, 14, "- requiert : code");
    poser(gh, 16, "- requiert : chrome-connecté");
    await jusqua(() => lancements().length === 1 && etat(16) === "86");
    await tirer({ verb: "announce" });
    const { run, limits } = await reclamer();
    // Les mêmes valeurs que le cook lancé sur la box, dans la même cuisine.
    assert.deepEqual(limits, { ...PLAFONDS, tokens: 55 });
    assert.deepEqual(dernier("cook.launched", 16)?.limits, dernier("cook.launched", 14)?.limits);

    assert.equal((await tirer({ verb: "renew", run, proof: "e1", turns: 5, tokens: 50 })).ok, true);
    // Le relevé du cook au tick, comme celui d'un cook de la box.
    await jusqua(() => journal.duTicket(16).some((e) => e.type === "cook.progressed" && e.payload.turns === 5 && e.payload.tokens === 50));

    const depasse = await tirer({ verb: "renew", run, proof: "e2", turns: 6, tokens: 60 });
    assert.deepEqual([depasse.ok, !depasse.ok && depasse.refusal, !depasse.ok && depasse.stop], [false, "stopped", "tokens"]);
    await jusquAu("cook.exited");
    assert.deepEqual(dernier("guard.tripped", 16), { run, reason: "tokens", limit: 55, observed: 60 });
    const fin = dernier("cook.exited", 16);
    assert.deepEqual([fin?.outcome, fin?.turns, fin?.tokens], ["guard", 6, 60]);
    // Le plafond dépassé n'a pas renouvelé le bail.
    assert.equal(journal.duTicket(16).filter((e) => e.type === "ticket.renewed").length, 1);
    // Un cook arrêté par un plafond n'est pas une cuisine cassée : le
    // disjoncteur reste fermé, au seuil d'un échec.
    assert.equal(etatDesGardeFous(journal.base).breakerOpenedAt, null);

    // Chaque étape de ce cook est au journal, sur son ticket.
    const etapes = types(16).filter((type) => !/^(ticket\.(arrived|changed)|cook\.(progressed|stalled))$/.test(type));
    assert.deepEqual(etapes.slice(etapes.indexOf("remote.answered")), [
      // La réponse à « réclamer », qui porte la mission — après la prise et le lancement.
      "remote.answered",
      "ticket.renewed",
      "remote.answered",
      "guard.tripped",
      "remote.answered",
      "cook.exited",
      "cook.reported",
    ]);
    assert.deepEqual(etapes.slice(etapes.lastIndexOf("ticket.taken"), etapes.indexOf("remote.answered")), ["ticket.taken", "cook.launched"]);
    // Et chaque demande de la station, avec sa réponse.
    const echanges = journal.tout().flatMap((e) => (e.type === "remote.asked" || e.type === "remote.answered" ? [`${e.type}:${e.payload.verb}`] : []));
    assert.deepEqual(echanges, ["announce", "claim", "renew", "renew"].flatMap((geste) => [`remote.asked:${geste}`, `remote.answered:${geste}`]));
  });

  test("le plafond de jetons l'arrête de même, sur ce que sa station rapporte", async (t) => {
    const { gh, etat, tirer, reclamer, dernier, jusquAu } = service(t, { plafonds: { tokens: 100 } });
    poser(gh, 16, "- requiert : chrome-connecté");
    await jusqua(() => etat(16) === "86");
    await tirer({ verb: "announce" });
    const { run } = await reclamer();
    const depasse = await tirer({ verb: "renew", run, proof: "e1", turns: 1, tokens: 101 });
    assert.deepEqual([depasse.ok, !depasse.ok && depasse.stop], [false, "tokens"]);
    assert.deepEqual(dernier("guard.tripped", 16), { run, reason: "tokens", limit: 100, observed: 101 });
    await jusquAu("cook.exited");
    assert.equal(dernier("cook.exited", 16)?.outcome, "guard");
  });

  test("le plafond d'inactivité aussi : une station qui ne rapporte plus rien de son cook le perd", async (t) => {
    const { gh, etat, tirer, reclamer, dernier, jusquAu } = service(t, { plafonds: { idleMs: 60 } });
    poser(gh, 16, "- requiert : chrome-connecté");
    await jusqua(() => etat(16) === "86");
    await tirer({ verb: "announce" });
    const { run } = await reclamer();
    // Elle ne rapporte rien : passé le plafond d'inactivité, il est arrêté.
    await jusquAu("cook.exited");
    const silence = dernier("guard.tripped", 16);
    assert.deepEqual([silence?.run, silence?.reason, silence?.limit], [run, "idle", 60]);
    assert.equal(dernier("cook.exited", 16)?.outcome, "guard");
    const apres = await tirer({ verb: "renew", run, proof: "e1", turns: 1, tokens: 10 });
    assert.deepEqual([apres.ok, !apres.ok && apres.stop], [false, "idle"]);
  });

  test("le « stop » du chef arrête son cook et la retient, comme une station d'ici", async (t) => {
    const { gh, repertoire, etat, tirer, reclamer, jusquAu, dernier } = service(t);
    poser(gh, 16, "- requiert : chrome-connecté");
    await jusqua(() => etat(16) === "86");
    await tirer({ verb: "announce" });
    const { run } = await reclamer();

    chef(repertoire, "kitchen.stopped");
    await jusquAu("cook.exited");
    assert.equal(dernier("cook.exited", 16)?.outcome, "stop");
    await jusqua(() => etat(16) === "waiting");
    const apres = await tirer({ verb: "renew", run, proof: "e1", turns: 1, tokens: 10 });
    assert.deepEqual([apres.ok, !apres.ok && apres.refusal, !apres.ok && apres.stop], [false, "stopped", "stop"]);
    assert.deepEqual(await tirer({ verb: "claim" }), { ok: true, verb: "claim", mission: null, held: "stopped" });
    assert.equal(etat(16), "waiting");
  });

  test("sa livraison traverse la pass par le même chemin que celle d'un cook de la box : mêmes gates, même reviewer, même merge", async (t) => {
    const { gh, repertoire, journal, etat, tirer, reclamer, gates, relectures, cooks, dernier, types } = service(t, { pass: true, scenario: "livre" });
    // Servi, un ticket quitte le rail dans la foulée — son issue est fermée : c'est au journal qu'il se lit.
    const servi = (ticket: number) => types(ticket).includes("ticket.served");
    chef(repertoire, "grant.activated");
    poser(gh, 14, "- requiert : code");
    poser(gh, 16, "- requiert : chrome-connecté");
    await jusqua(() => servi(14) && etat(16) === "86");

    await tirer({ verb: "announce" });
    const { run, branch } = await reclamer();
    assert.equal((await tirer({ verb: "renew", run, proof: "e1", turns: 3, tokens: 300 })).ok, true);
    // Son cook a fini : la station pousse sa branche sur l'origine, puis rend.
    pousserSurLOrigine(repertoire, branch);
    const rendu = await tirer({ verb: "deliver", run, ending: "delivered", reason: null, message: "J'ai fini.\n<livrable>\nLe parcours est éprouvé dans Chrome.\n</livrable>", turns: 4, tokens: 400 });
    assert.deepEqual(rendu, { ok: true, verb: "deliver", ending: "done", reason: null });
    await jusqua(() => servi(16));

    // Le chemin emprunté, de la livraison au service : celui du ticket cuisiné
    // sur la box, fait pour fait.
    const chemin = (ticket: number) =>
      journal
        .duTicket(ticket)
        .map((e) => e.type)
        .filter((type) => /^(pass|grant|merge|gates|review)\.|^cook\.(exited|reported)$|^ticket\.(passing|served|released|86)$/.test(type));
    const [box, mac] = [chemin(14), chemin(16)];
    assert.deepEqual(mac.slice(mac.lastIndexOf("cook.exited")), box);
    assert.ok(box.includes("pass.judged") && box.includes("merge.done") && box.at(-1) === "ticket.served", box.join(" "));
    // Les mêmes gates : jouées une fois par livraison, dans le worktree jetable de son jugement.
    assert.deepEqual(gates.appels().map((essai) => basename(essai)).sort(), ["jugement-14", "jugement-16"]);
    // Le même reviewer : même binaire, même calibrage, mêmes arguments — seule sa consigne nomme le ticket.
    const lus = relectures();
    assert.equal(lus.length, 2);
    const sansConsigne = (args: string[]) => args.map((arg, i) => (i === 1 ? "" : arg));
    assert.deepEqual(sansConsigne(lus[0]?.args ?? []), sansConsigne(lus[1]?.args ?? []));
    // Et le même verdict, produit par les mêmes juges.
    const verdict = (ticket: number) => {
      const juge = dernier("pass.judged", ticket) as { verdict: string; gates: { outcome: string }; ci: { outcome: string }; review: { outcome: string }; judgeModified: boolean };
      return [juge.verdict, juge.gates.outcome, juge.ci.outcome, juge.review.outcome, juge.judgeModified];
    };
    assert.deepEqual(verdict(16), verdict(14));
    assert.deepEqual(verdict(16), ["green", "green", "none", "green", false]);
    // Son compte-rendu est celui d'un cook : sa branche, sa PR, son livrable.
    const rapport = dernier("cook.reported", 16);
    assert.deepEqual([rapport?.ending, rapport?.branch, rapport?.deliverable], ["done", branch, "Le parcours est éprouvé dans Chrome."]);
    assert.match(String(rapport?.pr), /\/pull\/10[12]$/);
    assert.deepEqual([dernier("cook.exited", 16)?.outcome, dernier("cook.exited", 16)?.turns, dernier("cook.exited", 16)?.tokens], ["ok", 4, 400]);
    // Aucun cook n'a tourné sur la box pour #16 : ni lancement de `claude`, ni worktree.
    assert.deepEqual(cooks().map((lance) => /ticket #(\d+)/.exec(lance.args[1] ?? "")?.[1]), ["14"]);
    assert.equal(types(16).includes("worktree.removed"), false);
    // La branche que le clone a rapatriée de l'origine part comme une autre, le ticket servi.
    await jusqua(() => journal.tout().filter((e) => e.type === "branch.removed").length === 2);
    assert.deepEqual(journal.duTicket(16).findLast((e) => e.type === "branch.removed")?.payload, { branch });
    assert.match(gh.commentaires.find(([numero, corps]) => numero === 16 && corps.startsWith("**Cook"))?.[1] ?? "", new RegExp(`^\\*\\*Cook \`${MAC}\` — fini\\*\\*.*\\n.*Branche \`${branch}\``));
  });

  test("une livraison que la pass renvoie est reprise par la station distante sur la même branche, avec ses findings", async (t) => {
    const { gh, repertoire, etat, tirer, reclamer, gates, jusquAu, dernier } = service(t, { pass: true, stations: lireStations({ BRIGADE_STATIONS: `${MAC}:1:chrome-connecté:distante` }) });
    gates.regler("rouge");
    poser(gh, 16, "- requiert : chrome-connecté");
    await jusqua(() => etat(16) === "86");
    await tirer({ verb: "announce" });
    const premiere = await reclamer();
    pousserSurLOrigine(repertoire, premiere.branch);
    assert.equal((await tirer({ verb: "deliver", run: premiere.run, ending: "delivered", reason: null, message: null, turns: 1, tokens: 10 })).ok, true);
    await jusquAu("pass.returned");
    await jusqua(() => etat(16) === "waiting");

    const reprise = await reclamer();
    assert.deepEqual([reprise.ticket, reprise.branch, reprise.resumes?.returns], [16, premiere.branch, 1]);
    assert.notEqual(reprise.run, premiere.run);
    assert.match(reprise.prompt, /renvoi/i);
    assert.equal(dernier("cook.launched", 16)?.branch, premiere.branch);
  });

  test("sans commit sur l'origine, ce qu'elle a délimité est son livrable — et sans rien de délimité, elle n'a rien livré", async (t) => {
    const { gh, etat, tirer, reclamer, jusquAu, dernier, compter } = service(t, { stations: lireStations({ BRIGADE_STATIONS: `${MAC}:2:chrome-connecté:distante` }) });
    poser(gh, 16, "- requiert : chrome-connecté");
    poser(gh, 17, "- requiert : chrome-connecté");
    await jusqua(() => etat(16) === "86" && etat(17) === "86");
    await tirer({ verb: "announce" });
    const [delimite, bavard] = [await reclamer(), await reclamer()];

    const sansDiff = await tirer({ verb: "deliver", run: delimite.run, ending: "delivered", reason: null, message: "<livrable>\nLa réponse.\n</livrable>", turns: 1, tokens: 10 });
    assert.deepEqual(sansDiff, { ok: true, verb: "deliver", ending: "done", reason: "no-diff" });
    const rien = await tirer({ verb: "deliver", run: bavard.run, ending: "delivered", reason: null, message: "J'ai beaucoup réfléchi.", turns: 1, tokens: 10 });
    assert.deepEqual(rien, { ok: true, verb: "deliver", ending: "failed", reason: "no-deliverable" });
    await jusquAu("cook.reported", 2);
    assert.equal(etat(delimite.ticket), "pass");
    assert.deepEqual([dernier("cook.reported", delimite.ticket)?.ending, dernier("cook.reported", delimite.ticket)?.deliverable], ["done", "La réponse."]);
    assert.deepEqual([dernier("cook.exited", bavard.ticket)?.outcome, dernier("cook.reported", bavard.ticket)?.ending], ["failed", "failed"]);
    // Une fois rendu, le run ne reçoit plus rien.
    const tard = await tirer({ verb: "deliver", run: delimite.run, ending: "delivered", reason: null, message: null, turns: 1, tokens: 10 });
    assert.deepEqual([tard.ok, !tard.ok && tard.refusal], [false, "stopped"]);
    assert.equal(compter("cook.exited"), 2);
  });

  test("absente, elle ne retient que les tickets qui la demandent : ils sont 86 « station absente », sans cook ni panne, et les autres partent — dans le même lot", async (t) => {
    const { gh, journal, etat, raison, heure, lancements, tirer, jusquAu, compter, avertissements } = service(t);
    poser(gh, 14, "- requiert : code");
    poser(gh, 16, "- requiert : chrome-connecté");
    await jusqua(() => lancements().length === 1 && etat(16) === "86");

    // Le ticket que la box peut cuisiner est parti ; l'autre attend sa station.
    assert.deepEqual([etat(14), etat(16), raison(16)], ["taken", "86", `station-absent: ${MAC}`]);
    assert.equal(journal.duTicket(16).filter((e) => e.type === "ticket.taken" || e.type === "cook.launched").length, 0);
    // Ce n'est pas une panne : ni échec compté, ni disjoncteur, ni retenue de la station d'ici.
    assert.deepEqual([etatDesGardeFous(journal.base).failures, etatDesGardeFous(journal.base).breakerOpenedAt], [0, null]);
    assert.equal(etatStation(journal.base, BOX)?.heldReason, null);
    const commentaire = gh.commentaires.find(([numero]) => numero === 16)?.[1] ?? "";
    assert.match(commentaire, /^\*\*Station absente — `mac\/claude` ne s'est pas manifestée récemment\.\*\*/);
    assert.match(commentaire, /Ce n'est pas une panne/);
    // `status` le dit sur la ligne du ticket, et rien dans ce qui attend le chef : une machine absente n'est pas son choix.
    const lignes = decrireEtat(lireEtat(journal), heure.maintenant());
    assert.ok(lignes.includes("awaiting   nothing awaits the chef"), lignes.join("\n"));
    assert.ok(lignes.some((ligne) => ligne.startsWith("  #16  86") && ligne.includes(`(station-absent: ${MAC})`)), lignes.join("\n"));

    // Elle se manifeste : le ticket repart seul.
    await tirer({ verb: "announce" });
    await jusqua(() => etat(16) === "waiting");
    assert.equal(compter("station.present"), 1);
    assert.notEqual(etatStation(journal.base, MAC)?.presentSince, null);

    // Elle ne se manifeste plus : passé le délai de présence, elle est absente
    // de nouveau, et le ticket avec elle — sans que son issue le redise.
    heure.avancer(PRESENCE_MS);
    await jusquAu("station.absent");
    await jusqua(() => etat(16) === "86");
    assert.equal(raison(16), `station-absent: ${MAC}`);
    assert.equal(etatStation(journal.base, MAC)?.presentSince, null);
    assert.equal(gh.commentaires.filter(([numero]) => numero === 16).length, 1);
    assert.ok(avertissements.some((message) => message.includes(`la station ${MAC} ne s'est pas manifestée`)));
    assert.equal(etat(14), "taken");
    assert.equal(lancements().length, 1);
  });

  test("une demande restée sans lecture trop longtemps n'attend plus personne : aucun ticket n'est prêté à une station qui n'écoute plus", async (t) => {
    const { gh, journal, repertoire, etat, heure, tirer, compter } = service(t);
    poser(gh, 16, "- requiert : chrome-connecté");
    await jusqua(() => etat(16) === "86");
    await tirer({ verb: "announce" });
    await jusqua(() => etat(16) === "waiting");

    // Écrite il y a plus longtemps que le délai de réponse : le journal porte son heure.
    const ancien = ouvrirJournal(repertoire, { maintenant: () => new Date(heure.maintenant().getTime() - DELAI_DE_REPONSE_MS - 1) });
    ancien.ajouter({ project: "brigade", ticket: null, author: `station:${MAC}`, type: "remote.asked", payload: { id: "tardive", station: MAC, verb: "claim" } });
    ancien.fermer();
    await jusqua(() => journal.tout().some((e) => e.type === "remote.answered" && e.payload.id === "tardive"));
    const reponse = journal.tout().find((e) => e.type === "remote.answered" && e.payload.id === "tardive")?.payload as Reponse;
    assert.deepEqual([reponse.ok, !reponse.ok && reponse.refusal], [false, "late"]);
    assert.equal(etat(16), "waiting");
    assert.equal(compter("ticket.taken"), 0);
  });

  test("un runtime qui redémarre tient ses cooks pour interrompus, comme ceux de la box : le ticket revient, et sa station l'apprend", async (t) => {
    const premiere = service(t);
    poser(premiere.gh, 16, "- requiert : chrome-connecté");
    await jusqua(() => premiere.etat(16) === "86");
    await premiere.tirer({ verb: "announce" });
    const { run } = await premiere.reclamer();
    premiere.runtime.arreter("test");

    const seconde = service(t, { lieux: premiere.lieux });
    assert.ok(seconde.types(16).includes("cook.interrupted"));
    const apres = await seconde.tirer({ verb: "renew", run, proof: "e1", turns: 1, tokens: 10 });
    assert.deepEqual([apres.ok, !apres.ok && apres.refusal, !apres.ok && apres.stop], [false, "stopped", "interrupted"]);
    // Toujours présente — sa dernière demande est au journal —, elle le reprend.
    await jusqua(() => seconde.etat(16) === "waiting");
    assert.equal((await seconde.reclamer()).ticket, 16);
  });
});
