// Une station distante — le Mac du chef — et les tickets ordinaires, ceux qui
// ne demandent rien. Sans réglage, elle ne prend que ceux qui demandent une de
// ses capacités ; déclarée `distante+ordinaires`, elle prend aussi les autres,
// à condition que son poste ait le bac à sable de Claude Code : son cook y est
// lancé, avec la configuration de `bac-a-sable/`. Sans lui, elle n'en prend
// aucun, et le dit. Jamais plus de cooks que son plafond. Sur une cuisine
// complète, la station jouée par le test depuis sa propre connexion au
// journal, comme le ferait son geste (`run pull`).
import assert from "node:assert/strict";
import { posix } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { CONSIGNE_DE_REFUS } from "../src/bac-a-sable/configuration.ts";
import { NON_DIT } from "../src/bac-a-sable/ordinaires.ts";
import { argumentsClaude } from "../src/claude.ts";
import type { BacASableDeLaStation, Demande, Mission, Reponse } from "../src/events/remote.ts";
import { faits, lireEtat } from "../src/etat.ts";
import { MARQUEUR } from "../src/fiche.ts";
import { principal as montrerStation } from "../src/montrer-station.ts";
import { etatStation } from "../src/projections/stations.ts";
import type { Machine } from "../src/machine.ts";
import { DECLARATION_RESEAU } from "../src/reseau.ts";
import { lireStations } from "../src/stations-declarees.ts";
import { demander } from "../src/tirer.ts";
import { cuisine, issue, MACHINE_CALME, type Lieux, type Options } from "./aides/cuisine.ts";
import { appeler, jusqua } from "./outils.ts";

const [BOX, MAC] = ["box/claude", "mac/claude"];
const declarer = (mac: string, box: string) => lireStations({ BRIGADE_STATIONS: `${box},${mac}` });

// Le poste du chef, tel que sa sonde le dit quand le bac à sable est là.
const HOME = "/Users/chef";
const WORKTREES = "/Users/chef/brigade-cooks/brigade";
const CACHE = "/Users/chef/Library/Caches/brigade";
const DISPONIBLE: BacASableDeLaStation = { available: true, version: "2.1.250", home: HOME, worktrees: WORKTREES, caches: [CACHE] };
const RAISON = "Seatbelt est introuvable : `/usr/bin/sandbox-exec` n'existe pas sur ce Mac";
const INDISPONIBLE: BacASableDeLaStation = { available: false, reason: RAISON };

const poser = (gh: Lieux["gh"], numero: number, ...lignes: string[]) => {
  if (lignes.length > 0) gh.ficher(numero, "2026-10-08T09:00:00Z", [MARQUEUR, ...lignes].join("\n"));
  gh.poser(issue(numero));
};

// Le temps qu'une prise qui ne doit pas avoir lieu aurait largement eu pour se faire.
const laisserServir = () => new Promise((resoudre) => setTimeout(resoudre, 80));

// Une cuisine dont la station d'ici est pleine — #14 y cuit, à son plafond
// d'un cook : la box sature — et dont la branche d'intégration déclare un hôte
// à joindre. Le Mac est déclaré comme le test le veut. `box` : la station d'ici
// telle que le test la déclare ; `occuper` : faux, #14 n'est pas posé.
async function service(t: TestContext, mac: string, options: Options = {}, { box = `${BOX}:1:code`, occuper = true } = {}) {
  const lieu = cuisine(t, {
    stations: declarer(mac, box),
    scenario: "muet",
    presenceMs: 120_000,
    depot: (depot) => ({ ...depot, lire: (branche, chemin) => (branche === "origin/v2" && chemin === DECLARATION_RESEAU ? "registry.npmjs.org\n" : null) }),
    ...options,
  });
  const { journal, repertoire, heure } = lieu;
  const tirer = (demande: Demande): Promise<Reponse> => demander(repertoire, MAC, demande, { maintenant: heure.maintenant, pasMs: 2 });
  const reclamer = async (sandbox?: BacASableDeLaStation): Promise<Extract<Reponse, { verb: "claim" }>> => {
    const reponse = await tirer(sandbox === undefined ? { verb: "claim" } : { verb: "claim", sandbox });
    assert.ok(reponse.ok && reponse.verb === "claim", JSON.stringify(reponse));
    return reponse;
  };
  const mission = async (sandbox?: BacASableDeLaStation): Promise<Mission> => {
    const { mission: recue } = await reclamer(sandbox);
    assert.ok(recue !== null, "aucune mission");
    return recue;
  };
  const lance = (ticket: number) => journal.duTicket(ticket).findLast((e) => e.type === "cook.launched")?.payload as Record<string, unknown> | undefined;
  const station = async () => {
    const appel = appeler(montrerStation, [], { BRIGADE_STATE_DIR: repertoire });
    assert.equal(await appel.fin, 0);
    return appel.sortie();
  };
  // Le Mac se manifeste pour la première fois : #16, que lui seul peut cuisiner,
  // était 86 — station absente — et repart.
  const annoncer = async (sandbox: BacASableDeLaStation) => {
    await jusqua(() => lieu.etat(16) === "86");
    assert.ok((await tirer({ verb: "announce", sandbox })).ok);
    await jusqua(() => lieu.etat(16) === "waiting");
  };
  const ordinaires = () => faits(lireEtat(journal, heure.maintenant()), heure.maintenant()).stations.find((s) => s.station === MAC);
  if (occuper) {
    poser(lieu.gh, 14, "- requiert : code");
    await jusqua(() => lieu.lancements().length === 1 && lieu.etat(14) === "taken");
  }
  return { ...lieu, tirer, reclamer, mission, lance, station, ordinaires, annoncer };
}

describe("une station distante et les tickets ordinaires", { concurrency: 4 }, () => {
  test("réglage désactivé : elle ne prend que les tickets qui demandent une de ses capacités, comme avant — même avec le bac à sable sur son poste", async (t) => {
    const { gh, etat, journal, mission, reclamer, station, ordinaires, annoncer } = await service(t, `${MAC}:2:chrome-connecté:distante`);
    poser(gh, 16, "- requiert : chrome-connecté");
    poser(gh, 17);
    await annoncer(DISPONIBLE);

    const recue = await mission(DISPONIBLE);
    assert.equal(recue.ticket, 16);
    // Elle le cuit comme avant : à nu, sans bac à sable.
    assert.equal(recue.sandbox, undefined);
    assert.deepEqual(recue.args, argumentsClaude(recue.prompt, { model: recue.model, effort: recue.effort }));

    // Le ticket ordinaire ne lui revient pas : il attend la station d'ici.
    assert.deepEqual(await reclamer(DISPONIBLE), { ok: true, verb: "claim", mission: null, held: null });
    await laisserServir();
    assert.equal(etat(17), "waiting");
    assert.equal(journal.duTicket(17).filter((e) => e.type === "ticket.taken").length, 0);
    assert.deepEqual(ordinaires(), {
      station: MAC,
      distante: true,
      plafond: 2,
      ordinaires: false,
      ensemble: false,
      bacASable: { disponible: true, raison: null, version: "2.1.250", depuis: ordinaires()?.bacASable?.depuis },
      prendOrdinaires: false,
      cuisson: "cooking",
      arreteeDepuis: null,
      refus: null,
      cooks: [{ ticket: 16, titre: "Ticket 16", station: MAC }],
    });
    assert.match(await station(), /ordinary tickets +not taken — it only takes the tickets that ask for one of its capabilities/);
  });

  test("réglage activé et bac à sable disponible : elle prend un ticket ordinaire, et son cook est lancé avec la configuration du bac à sable", async (t) => {
    const { gh, etat, journal, mission, lance, station, ordinaires, annoncer } = await service(t, `${MAC}:2:chrome-connecté:distante+ordinaires`);
    poser(gh, 16, "- requiert : chrome-connecté");
    poser(gh, 17);
    await annoncer(DISPONIBLE);

    // Ce qui demande ses capacités reste pris comme avant, à nu.
    const capacite = await mission(DISPONIBLE);
    assert.equal(capacite.ticket, 16);
    assert.equal(capacite.sandbox, undefined);
    assert.ok(capacite.args.includes("bypassPermissions"));
    assert.equal(lance(16)?.sandbox, undefined);

    // Le ticket ordinaire lui revient, dans le bac à sable.
    const ordinaire = await mission(DISPONIBLE);
    assert.equal(ordinaire.ticket, 17);
    assert.equal(etat(17), "taken");
    assert.equal(journal.duTicket(17).findLast((e) => e.type === "ticket.taken")?.author, `station:${MAC}`);
    assert.equal(ordinaire.sandbox, true);
    assert.equal(lance(17)?.sandbox, true);
    assert.equal(lance(17)?.station, MAC);

    // La commande : celle d'un cook de la box, dont le mode de permission cède
    // la place à celui du bac à sable, à ses réglages et à la consigne de ses
    // refus — rien d'autre.
    const args = ordinaire.args;
    const place = args.indexOf("--permission-mode");
    assert.deepEqual(args.slice(place, place + 3), ["--permission-mode", "dontAsk", "--settings"]);
    assert.deepEqual(args.slice(place + 4, place + 6), ["--append-system-prompt", CONSIGNE_DE_REFUS]);
    assert.ok(!args.includes("bypassPermissions"));
    const sansBac = argumentsClaude(ordinaire.prompt, { model: ordinaire.model, effort: ordinaire.effort });
    assert.deepEqual([...args.slice(0, place), ...args.slice(place + 6)], [...sansBac.slice(0, place), ...sansBac.slice(place + 2)]);
    const reglages = JSON.parse(args[place + 3] ?? "");
    const worktree = posix.join(WORKTREES, ordinaire.run);
    assert.deepEqual(
      [reglages.sandbox.enabled, reglages.sandbox.failIfUnavailable, reglages.sandbox.allowUnsandboxedCommands, reglages.permissions.disableBypassPermissionsMode],
      [true, true, false, "disable"],
    );
    // Il n'écrit que dans son worktree et les caches du projet, ne lit pas la
    // clé ssh du chef, ne joint que les hôtes du projet.
    assert.deepEqual(reglages.sandbox.filesystem.allowWrite, [worktree, CACHE]);
    assert.ok(reglages.sandbox.filesystem.denyRead.includes(`${HOME}/.ssh`));
    assert.ok(reglages.sandbox.network.allowedDomains.includes("registry.npmjs.org"));
    assert.ok(reglages.sandbox.network.allowedDomains.includes("github.com"));
    assert.equal(reglages.sandbox.network.strictAllowlist, true);

    // L'état exposé : réglage, bac à sable, prise.
    assert.deepEqual(etatStation(journal.base, MAC)?.sandbox, { available: true, reason: null, version: "2.1.250", at: etatStation(journal.base, MAC)?.sandbox?.at });
    assert.deepEqual([ordinaires()?.ordinaires, ordinaires()?.bacASable?.disponible, ordinaires()?.prendOrdinaires], [true, true, true]);
    assert.match(await station(), /ordinary tickets +taken when the box is saturated, each cook inside the Claude Code sandbox \(claude 2\.1\.250\)/);
  });

  test("réglage activé et bac à sable indisponible : elle ne prend aucun ticket ordinaire, et expose l'état et sa raison", async (t) => {
    const { gh, etat, journal, mission, reclamer, station, ordinaires, avertissements, annoncer } = await service(t, `${MAC}:2:chrome-connecté:distante+ordinaires`);
    poser(gh, 16, "- requiert : chrome-connecté");
    poser(gh, 17);
    await annoncer(INDISPONIBLE);

    // Ce qui demande ses capacités part quand même.
    assert.equal((await mission(INDISPONIBLE)).ticket, 16);
    // Le ticket ordinaire, non.
    assert.deepEqual(await reclamer(INDISPONIBLE), { ok: true, verb: "claim", mission: null, held: null });
    await laisserServir();
    assert.equal(etat(17), "waiting");
    assert.equal(journal.duTicket(17).filter((e) => e.type === "ticket.taken").length, 0);

    assert.deepEqual(etatStation(journal.base, MAC)?.sandbox, { available: false, reason: RAISON, version: null, at: etatStation(journal.base, MAC)?.sandbox?.at });
    assert.deepEqual(ordinaires(), {
      station: MAC,
      distante: true,
      plafond: 2,
      ordinaires: true,
      ensemble: false,
      bacASable: { disponible: false, raison: RAISON, version: null, depuis: ordinaires()?.bacASable?.depuis },
      prendOrdinaires: false,
      cuisson: "cooking",
      arreteeDepuis: null,
      refus: null,
      cooks: [{ ticket: 16, titre: "Ticket 16", station: MAC }],
    });
    assert.ok(avertissements.some((message) => message.includes(`la station ${MAC} ne prend aucun ticket ordinaire — bac à sable indisponible : ${RAISON}`)));
    assert.match(await station(), new RegExp(`ordinary tickets +NONE TAKEN — sandbox unavailable since .+: ${RAISON.replace(/[.*+?^${}()|[\]\\/`]/g, "\\$&")}`));
    // Écrit quand ça change, pas à chaque demande.
    assert.equal(journal.tout().filter((e) => e.type === "station.sandbox").length, 1);

    // Une station qui n'en dit rien ne l'a pas.
    assert.deepEqual(await reclamer(), { ok: true, verb: "claim", mission: null, held: null });
    assert.equal(etatStation(journal.base, MAC)?.sandbox?.reason, NON_DIT);
    // Ni un poste qui poserait ses worktrees là où un cook ne doit rien lire :
    // sa configuration ne tient pas.
    assert.deepEqual(await reclamer({ ...DISPONIBLE, worktrees: `${HOME}/.config/brigade/stations/brigade` }), { ok: true, verb: "claim", mission: null, held: null });
    assert.match(etatStation(journal.base, MAC)?.sandbox?.reason ?? "", /^the sandbox configuration does not hold on this workstation — .*\.config\/brigade/);
    assert.equal(etat(17), "waiting");

    // Le bac à sable revenu, le ticket part.
    assert.equal((await mission(DISPONIBLE)).ticket, 17);
  });

  test("elle ne dépasse jamais la limite de cooks fixée pour le Mac : tickets ordinaires compris", async (t) => {
    const { gh, etat, journal, mission, reclamer, annoncer } = await service(t, `${MAC}:1:chrome-connecté:distante+ordinaires`);
    poser(gh, 17);
    poser(gh, 18);
    poser(gh, 16, "- requiert : chrome-connecté");
    await annoncer(DISPONIBLE);

    assert.equal((await mission(DISPONIBLE)).ticket, 16);
    // Plein : ni l'ordinaire, ni rien d'autre.
    for (let essai = 0; essai < 3; essai++) assert.deepEqual(await reclamer(DISPONIBLE), { ok: true, verb: "claim", mission: null, held: "cap" });
    await laisserServir();
    assert.deepEqual([etat(17), etat(18)], ["waiting", "waiting"]);
    const prisParLeMac = journal.tout().filter((e) => e.type === "ticket.taken" && e.author === `station:${MAC}`).length;
    assert.equal(prisParLeMac, 1);
    assert.equal(etatStation(journal.base, MAC)?.heldReason, "cap");
  });
});

// Le Mac ne prend un ticket ordinaire que quand la box sature : ses stations
// sont à leur plafond, ou sa machine n'en peut plus. Tant qu'elle a de la
// place, elle garde ses tickets. Inéligible — sans le réglage, sans bac à
// sable, à sa propre limite —, le Mac n'en reçoit aucun, même box saturée :
// c'est ce que montrent les tests ci-dessus, où la box est à son plafond.
describe("les tickets ordinaires partent sur le Mac quand la box sature, et alors seulement", { concurrency: 4 }, () => {
  const MAC_ORDINAIRES = `${MAC}:2:chrome-connecté:distante+ordinaires`;
  const prisPar = (journal: { duTicket(ticket: number): Array<{ type: string; author: string }> }, ticket: number) =>
    journal.duTicket(ticket).findLast((e) => e.type === "ticket.taken")?.author;

  test("box saturée — à son plafond —, Mac éligible avec de la place : un ticket ordinaire en attente part sur le Mac", async (t) => {
    const { gh, etat, journal, tirer, mission } = await service(t, MAC_ORDINAIRES);
    poser(gh, 17);
    assert.ok((await tirer({ verb: "announce", sandbox: DISPONIBLE })).ok);
    await jusqua(() => etat(17) === "waiting");

    const recue = await mission(DISPONIBLE);
    assert.equal(recue.ticket, 17);
    assert.equal(recue.sandbox, true);
    assert.equal(etat(17), "taken");
    assert.equal(prisPar(journal, 17), `station:${MAC}`);
  });

  test("box non saturée — elle a de la place, et monte par paliers — : un ticket ordinaire en attente reste sur la box, même quand le Mac le réclame", async (t) => {
    // Trois cooks au plus sur la box, un seul en cours (#14), parti à l'instant :
    // la charge ne le reflète pas encore, et compté d'avance il la mènerait au
    // seuil (12 pour 8 cœurs). La box se retient le temps qu'il pèse — l'horloge
    // du test ne bouge pas —, elle ne sature pas.
    const { gh, etat, journal, heure, tirer, reclamer } = await service(t, MAC_ORDINAIRES, { machine: () => ({ ...MACHINE_CALME, charge: 11.5 }) }, { box: `${BOX}:3:code` });
    assert.ok((await tirer({ verb: "announce", sandbox: DISPONIBLE })).ok);
    poser(gh, 17);
    await jusqua(() => etat(17) === "waiting");

    for (let essai = 0; essai < 3; essai++) assert.deepEqual(await reclamer(DISPONIBLE), { ok: true, verb: "claim", mission: null, held: null });
    assert.equal(etat(17), "waiting");
    assert.equal(journal.tout().filter((e) => e.type === "ticket.taken" && e.author === `station:${MAC}`).length, 0);

    // Le cook de #14 a pesé : la box prend le ticket elle-même.
    heure.avancer(61_000);
    await jusqua(() => etat(17) === "taken");
    assert.equal(prisPar(journal, 17), `station:${BOX}`);
  });

  test("box saturée par sa machine, sous son plafond : le Mac prend le ticket ordinaire", async (t) => {
    const PLEINE: Machine = { ...MACHINE_CALME, charge: 64 };
    // Trois cooks au plus sur la box, aucun en cours : seule la machine la retient.
    const { gh, etat, journal, tirer, mission } = await service(t, MAC_ORDINAIRES, { machine: () => PLEINE }, { box: `${BOX}:3:code`, occuper: false });
    assert.ok((await tirer({ verb: "announce", sandbox: DISPONIBLE })).ok);
    poser(gh, 17);
    await jusqua(() => etatStation(journal.base, BOX)?.saturatedResource === "cpu" && etat(17) === "waiting");

    assert.equal((await mission(DISPONIBLE)).ticket, 17);
    assert.equal(prisPar(journal, 17), `station:${MAC}`);
  });
});
