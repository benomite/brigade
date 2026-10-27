// Un ticket demande une capacité (ligne `requiert` de sa fiche) : il part dans
// une station qui la fournit, et dans aucune autre. Sans station qui la
// fournisse, il ne part pas — 86, sans cook —, `status` dit ce qui manque et le
// geste qui le fournirait, et les autres tickets partent. Sur une cuisine
// complète : rail, garde-fous, stations, un faux `claude`, un GitHub de test.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ouvrirArbitre, servirArbitre } from "../src/arbitre.ts";
import { joindreArbitre } from "../src/arbitrage.ts";
import { decrireEtat, lireEtat } from "../src/etat.ts";
import { MARQUEUR, porteFiche } from "../src/fiche.ts";
import { ACTIONS, JAMAIS_ACCORDEES, jamaisAccordee } from "../src/grant.ts";
import { principal as grant } from "../src/grant-cli.ts";
import { etatDuGrant } from "../src/projections/pass.ts";
import { etatStation } from "../src/projections/stations.ts";
import { lireStations } from "../src/stations-declarees.ts";
import { cuisine, issue, type Lieux } from "./aides/cuisine.ts";
import { appeler, jusqua, repertoireTemporaire } from "./outils.ts";

const stations = (declaration: string) => lireStations({ BRIGADE_STATIONS: declaration });
const DEUX = stations("box/claude:2:code+raisonnement,box/playwright:2:navigateur-headless");
const [CLAUDE, PLAYWRIGHT] = ["box/claude", "box/playwright"];

// Le temps qu'une prise qui ne doit pas avoir lieu aurait largement eu pour se faire.
const laisserServir = () => new Promise((resoudre) => setTimeout(resoudre, 80));

// Pose un ticket calibré avec sa fiche, comme le manager au découpage.
const poser = (gh: Lieux["gh"], numero: number, ...lignes: string[]) => {
  if (lignes.length > 0) gh.ficher(numero, "2026-10-08T09:00:00Z", [MARQUEUR, ...lignes].join("\n"));
  gh.poser(issue(numero));
};

describe("les capacités qu'un ticket demande", { concurrency: 8 }, () => {
  test("deux stations de capacités différentes : le ticket qui demande `navigateur-headless` va à celle qui le fournit, pas à la première libre", async (t) => {
    const { gh, journal, etat, lancements } = cuisine(t, { stations: DEUX, scenario: "muet" });
    poser(gh, 14, "- requiert : navigateur-headless");
    poser(gh, 15, "- requiert : code");
    poser(gh, 16);
    await jusqua(() => lancements().length === 3);

    assert.deepEqual([etat(14), etat(15), etat(16)], ["taken", "taken", "taken"]);
    const prisPar = (ticket: number) => journal.duTicket(ticket).find((e) => e.type === "ticket.taken")?.author;
    // `box/claude` est déclarée la première et libre : elle ne prend pas #14.
    assert.deepEqual([prisPar(14), prisPar(15), prisPar(16)], [`station:${PLAYWRIGHT}`, `station:${CLAUDE}`, `station:${CLAUDE}`]);
    assert.deepEqual(
      journal
        .tout()
        .flatMap((e) => (e.type === "cook.launched" ? [[e.ticket, e.payload.station]] : []))
        .sort(([a], [b]) => Number(a) - Number(b)),
      [
        [14, PLAYWRIGHT],
        [15, CLAUDE],
        [16, CLAUDE],
      ],
    );
    // Une fiche qui demande une capacité n'est pas relue comme changée à chaque sondage.
    assert.equal(journal.tout().filter((e) => e.type === "ticket.changed").length, 0);
  });

  test("la spécialité n'écarte jamais : une station prend le ticket qui ne lui demande rien, et celui qui demande moins qu'elle ne fournit", async (t) => {
    // `box/playwright` est « la station du navigateur » : ce n'est pas une
    // raison de lui refuser un ticket de code, ni un ticket qui ne demande rien.
    const { gh, journal, etat, lancements } = cuisine(t, { stations: stations("box/claude:1:code,box/playwright:2:navigateur-headless+code"), scenario: "muet" });
    poser(gh, 14);
    poser(gh, 15);
    poser(gh, 16, "- requiert : code");
    await jusqua(() => lancements().length === 3);

    assert.deepEqual([etat(14), etat(15), etat(16)], ["taken", "taken", "taken"]);
    const prisPar = (ticket: number) => journal.duTicket(ticket).find((e) => e.type === "ticket.taken")?.author;
    // #14 à la première ; elle est pleine, et les deux autres vont à l'autre.
    assert.deepEqual([prisPar(14), prisPar(15), prisPar(16)], [`station:${CLAUDE}`, `station:${PLAYWRIGHT}`, `station:${PLAYWRIGHT}`]);
  });

  test("la station qui fournit la capacité est pleine : le ticket attend sa place, aucune autre ne le prend, et `status` dit laquelle le retient", async (t) => {
    const { gh, journal, etat, lancements, heure } = cuisine(t, { stations: stations("box/claude:2:code,box/playwright:1:navigateur-headless"), scenario: "muet" });
    poser(gh, 14, "- requiert : navigateur-headless");
    poser(gh, 15, "- requiert : navigateur-headless");
    poser(gh, 16);
    await jusqua(() => lancements().length === 2 && etatStation(journal.base, PLAYWRIGHT)?.heldReason === "cap");
    await laisserServir();

    // `box/claude` a une place libre, et ne prend pas #15 pour autant.
    assert.deepEqual([etat(14), etat(15), etat(16)], ["taken", "waiting", "taken"]);
    assert.equal(lancements().length, 2);
    // Elle ne retient personne : aucun ticket qu'elle pourrait cuisiner n'attend.
    assert.deepEqual(
      journal.tout().filter((e) => e.type === "station.held").map((e) => e.payload),
      [{ station: PLAYWRIGHT, reason: "cap" }],
    );
    const lignes = decrireEtat(lireEtat(journal), heure.maintenant());
    assert.equal(lignes.find((ligne) => ligne.startsWith("  #15")), "  #15  queued  -  withheld by box/playwright (cooks cap reached) — since 0 s  Ticket 15");
  });

  test("devant l'arbitre entre projets, un ticket que seule une station pleine peut cuisiner ne réserve aucune place : la station libre ne demande rien pour lui", async (t) => {
    const ouvert = ouvrirArbitre({ repertoire: repertoireTemporaire(t), plafond: 10 });
    const serveur = await servirArbitre(ouvert, 0);
    t.after(async () => {
      await serveur.fermer();
      ouvert.fermer();
    });
    const projet = () => ouvert.etat().projets.find((connu) => connu.projet === "brigade");
    const { gh, journal, etat, lancements } = cuisine(t, { arbitre: joindreArbitre(serveur.port), stations: stations("box/claude:2:code,box/playwright:1:navigateur-headless"), scenario: "muet" });
    poser(gh, 14, "- requiert : navigateur-headless");
    poser(gh, 15, "- requiert : navigateur-headless");
    await jusqua(() => lancements().length === 1 && etatStation(journal.base, PLAYWRIGHT)?.heldReason === "cap");
    await jusqua(() => projet()?.cooks === 1 && projet()?.demande === false);
    await laisserServir();

    assert.deepEqual([etat(14), etat(15)], ["taken", "waiting"]);
    assert.deepEqual([projet()?.cooks, projet()?.demande], [1, false]);
    assert.equal(etatStation(journal.base, CLAUDE)?.heldReason, null);
  });

  test("aucune station déclarée ne fournit la capacité demandée : le ticket ne part pas, il est 86, et aucun cook n'est lancé", async (t) => {
    const { gh, journal, etat, types, lancements, dernier, avertissements } = cuisine(t, { stations: DEUX, scenario: "muet" });
    poser(gh, 14, "- zone : runtime/src", "- requiert : chrome-connecté");
    await jusqua(() => etat(14) === "86" && gh.commentaires.length === 1);
    await laisserServir();

    assert.equal(etat(14), "86");
    assert.deepEqual(dernier("ticket.86", 14), { reason: "no-station: chrome-connecté", until: null });
    // C'est le runtime qui l'écarte : aucune station ne l'a pris.
    assert.equal(journal.duTicket(14).find((e) => e.type === "ticket.86")?.author, "runtime");
    assert.deepEqual(types(14), ["ticket.arrived", "ticket.86"]);
    // Aucun cook : ni lancement du faux `claude`, ni worktree, ni fait de cook.
    assert.deepEqual(lancements(), []);
    assert.deepEqual(types().filter((type) => type.startsWith("cook.") || type.startsWith("worktree.") || type === "ticket.taken"), []);
    assert.deepEqual(avertissements, []);
    // Et l'issue le dit, une fois.
    assert.deepEqual(
      gh.commentaires.map(([numero]) => numero),
      [14],
    );
    const corps = gh.commentaires[0]?.[1] ?? "";
    assert.match(corps, /^\*\*Aucune station ne fournit `chrome-connecté`\.\*\* Aucun cook n'est lancé/);
    assert.match(corps, /Stations déclarées : `box\/claude` \(code, raisonnement\) ; `box\/playwright` \(navigateur-headless\)\./);
    assert.match(corps, /déclarer une station qui la fournit par `brigade <projet> station stations/);
    assert.match(corps, /n'autorise rien/);
    assert.equal(porteFiche(corps), false);
  });

  test("`status` nomme la capacité qui manque au ticket, et le geste qui la fournirait", async (t) => {
    const { gh, journal, etat, heure } = cuisine(t, { stations: DEUX, scenario: "muet" });
    poser(gh, 14, "- requiert : chrome-connecté");
    await jusqua(() => etat(14) === "86");

    const lignes = decrireEtat(lireEtat(journal), heure.maintenant());
    const debut = lignes.findIndex((ligne) => ligne.startsWith("awaiting"));
    // Une machine qui manque n'est pas une décision du chef : la file ne le porte pas, mais le dit.
    assert.equal(lignes[debut], "awaiting   nothing awaits the chef");
    assert.ok(lignes.slice(debut, lignes.indexOf("end awaiting")).every((ligne) => !ligne.startsWith("  #14 ")));
    assert.ok(lignes.some((ligne) => ligne.includes("no station provides `chrome-connecté` (#14) — to unblock: attach a station that provides it")), lignes.join("\n"));

    // Et sur sa ligne du rail, sous le décompte.
    const rail = lignes.findIndex((ligne) => ligne.startsWith("rail"));
    assert.deepEqual(lignes.slice(rail, rail + 2), ["rail       1 86", "  #14  86  -  since 0 s (no-station: chrome-connecté), no return time — back on its own once a station provides what its card requires  Ticket 14"]);
  });

  test("les tickets du même lot qui ne demandent rien partent normalement pendant qu'un autre est 86 — même sur sa zone", async (t) => {
    const { gh, journal, etat, lancements } = cuisine(t, { stations: DEUX, scenario: "muet" });
    // #14 est le premier dans l'ordre de service, et sa zone recouvre celle de #15.
    poser(gh, 14, "- zone : runtime/src", "- requiert : chrome-connecté");
    poser(gh, 15, "- zone : runtime/src/rail.ts");
    poser(gh, 16);
    poser(gh, 17, "- attend : #16", "- requiert : navigateur-headless");
    await jusqua(() => etat(14) === "86" && lancements().length === 2);
    await laisserServir();

    assert.deepEqual([etat(14), etat(15), etat(16), etat(17)], ["86", "taken", "taken", "waiting"]);
    assert.equal(lancements().length, 2);
    assert.equal(journal.duTicket(14).some((e) => e.type === "cook.launched" || e.type === "ticket.taken"), false);
    // Écarté sans être parti, #14 ne tient pas sa zone : #15 n'a rien attendu.
    assert.deepEqual(journal.base.lire("SELECT 1 FROM events WHERE type = 'ticket.blocked'"), []);
    assert.deepEqual(
      journal.tout().filter((e) => e.type === "station.held"),
      [],
    );
  });

  test("deux capacités fournies chacune par une station, jamais ensemble : le ticket ne part pas, et le motif dit que c'est leur réunion qui manque", async (t) => {
    const { gh, etat, lancements, dernier, journal, heure } = cuisine(t, { stations: DEUX, scenario: "muet" });
    poser(gh, 14, "- requiert : code, navigateur-headless");
    await jusqua(() => etat(14) === "86");
    await laisserServir();

    assert.deepEqual(dernier("ticket.86", 14), { reason: "no-station: code + navigateur-headless", until: null });
    assert.deepEqual(lancements(), []);
    assert.match(
      decrireEtat(lireEtat(journal), heure.maintenant()).join("\n"),
      /no station provides `code` \+ `navigateur-headless` together \(#14\) — to unblock: attach a station that provides them/,
    );
  });

  test("une fois la capacité retirée de sa fiche, le ticket revient en attente tout seul et son cook part ; changée pour une autre qui manque, il dit laquelle", async (t) => {
    const { gh, journal, etat, lancements, dernier } = cuisine(t, { stations: DEUX, scenario: "muet" });
    poser(gh, 14, "- requiert : chrome-connecté");
    await jusqua(() => etat(14) === "86");

    gh.ficher(14, "2026-10-08T10:00:00Z", `${MARQUEUR}\n- requiert : gpu`);
    await jusqua(() => dernier("ticket.86", 14)?.reason === "no-station: gpu");
    assert.equal(etat(14), "86");
    assert.deepEqual(lancements(), []);

    gh.ficher(14, "2026-10-08T11:00:00Z", `${MARQUEUR}\n- requiert : navigateur-headless`);
    await jusqua(() => lancements().length === 1);

    assert.equal(etat(14), "taken");
    assert.equal(journal.duTicket(14).findLast((e) => e.type === "ticket.released")?.payload.reason, "capabilities-reread");
    assert.equal(journal.duTicket(14).find((e) => e.type === "ticket.taken")?.author, `station:${PLAYWRIGHT}`);
  });

  test("une station qui fournit la capacité est déclarée, le runtime redémarre : le ticket revient en attente tout seul et part chez elle", async (t) => {
    const premiere = cuisine(t, { stations: DEUX, scenario: "muet" });
    poser(premiere.gh, 14, "- requiert : chrome-connecté");
    await jusqua(() => premiere.etat(14) === "86");
    premiere.runtime.arreter("test");

    // Redémarré sur la même déclaration, rien ne bouge : ni retour, ni second commentaire.
    const meme = cuisine(t, { stations: DEUX, scenario: "muet", lieux: premiere.lieux });
    await laisserServir();
    assert.equal(meme.etat(14), "86");
    assert.equal(meme.types(14).filter((type) => type === "ticket.86").length, 1);
    assert.equal(meme.gh.commentaires.length, 1);
    meme.runtime.arreter("test");

    const seconde = cuisine(t, { stations: [...DEUX, ...stations("mac/claude-chrome:1:chrome-connecté")], scenario: "muet", lieux: premiere.lieux });
    await jusqua(() => seconde.lancements().length === 1);

    assert.equal(seconde.etat(14), "taken");
    assert.equal(seconde.journal.duTicket(14).find((e) => e.type === "ticket.taken")?.author, "station:mac/claude-chrome");
  });

  test("sans aucune station déclarée, le ticket qui demande une capacité est 86 et le dit ; celui qui ne demande rien attend, comme avant", async (t) => {
    const { gh, etat, lancements, dernier } = cuisine(t, { stations: [], scenario: "muet" });
    poser(gh, 14, "- requiert : code");
    poser(gh, 15);
    await jusqua(() => etat(14) === "86" && gh.commentaires.length === 1);
    await laisserServir();

    assert.deepEqual([etat(14), etat(15)], ["86", "waiting"]);
    assert.deepEqual(dernier("ticket.86", 14), { reason: "no-station: code", until: null });
    assert.match(gh.commentaires[0]?.[1] ?? "", /Ce projet ne déclare aucune station\./);
    assert.deepEqual(lancements(), []);
  });

  test("une fiche illisible ne demande rien : le ticket part pour être refusé sur son issue, pas pour une capacité qui manque", async (t) => {
    const { gh, etat, dernier, lancements } = cuisine(t, { stations: DEUX, scenario: "muet" });
    poser(gh, 14, "- requiert : chrome-connecté", "- budget : 40 tours");
    await jusqua(() => etat(14) === "86");

    assert.deepEqual(dernier("ticket.86", 14), { reason: "unreadable-card", until: null });
    assert.deepEqual(lancements(), []);
  });

  test("demander une capacité ne confère aucune autorisation : `accès-prod`, demandé comme capacité ou comme action, reste refusé par les grants", async (t) => {
    // Le pire cas : une station déclare fournir `accès-prod`, un ticket le
    // demande, et son cook part — la capacité a choisi la station, rien de plus.
    const { gh, journal, repertoire, etat, lancements, heure } = cuisine(t, { stations: stations("box/claude:1:code+accès-prod"), scenario: "muet" });
    const refus = async (...args: string[]) => {
      const commande = appeler(grant, args, { BRIGADE_STATE_DIR: repertoire });
      return { code: await commande.fin, sortie: commande.sortie() };
    };
    const avant = await refus("enable", "accès-prod");

    poser(gh, 14, "- requiert : accès-prod");
    // Sans l'accent, ce n'est pas la capacité déclarée : aucune station ne la fournit.
    poser(gh, 15, "- requiert : acces-prod");
    await jusqua(() => lancements().length === 1 && etat(15) === "86");
    assert.deepEqual([etat(14), etat(15)], ["taken", "86"]);

    // Ni le ticket qui est parti ni celui qui est resté n'ont rien accordé :
    // le seul fait de grant au journal est le refus opposé au chef.
    const grants = () => journal.tout().filter((e) => e.type.startsWith("grant."));
    assert.deepEqual(grants().map((e) => [e.type, e.author, e.ticket]), [["grant.refused", "chef", null]]);
    // Aucun grant n'existe : pas même `merge`.
    assert.equal(etatDuGrant(journal.base, "merge", heure.maintenant()), null);
    // Le cook lancé n'a rien reçu qui porte ce nom : ni argument, ni variable.
    const [cook] = lancements();
    assert.ok(cook);
    assert.doesNotMatch(JSON.stringify([cook.args, cook.env]), /prod/i);

    // La liste de ce qu'aucun grant n'autorise est celle d'avant, et son refus aussi.
    assert.deepEqual(ACTIONS, ["merge"]);
    assert.deepEqual(JAMAIS_ACCORDEES.map(({ action }) => action), ["identifiants-max", "acces-prod"]);
    assert.equal(jamaisAccordee("accès-prod")?.action, "acces-prod");
    for (const args of [["enable", "accès-prod"], ["enable", "acces-prod", "--for", "4h"], ["extend", "acces-prod", "--no-expiry"]]) {
      const apres = await refus(...args);
      assert.equal(apres.code, 1, args.join(" "));
      assert.equal(apres.sortie, avant.sortie, args.join(" "));
    }
    assert.match(avant.sortie, /grant acces-prod refused: “any action on a project's production”/);
    assert.match(avant.sortie, /no grant allows it, not even asked by you/);
    assert.deepEqual([...new Set(grants().map((e) => e.type))], ["grant.refused"]);
  });
});
