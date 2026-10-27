// Une station que l'app appaire au projet sans en faire la principale — un Mac,
// qui fournit `macos` — est déclarée au journal du projet par la principale
// (`projets/secondaires.ts`), sans commande du chef. La cuisine la lit au réveil
// suivant, sans redémarrer : le ticket qui demande `macos`, mis de côté faute de
// station, part chez elle, et chez aucune autre ; celui qui demande ce
// qu'aucune station ne fournit reste de côté. Sur une cuisine complète, la
// station appairée jouée par le test depuis sa propre connexion au journal,
// comme le ferait sa demande.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { MARQUEUR } from "../src/fiche.ts";
import { declarerLesSecondaires, secondairesDuProjet } from "../src/projets/secondaires.ts";
import type { ProjetDemande } from "../src/projets/demande.ts";
import { stationsAnnoncees } from "../src/projections/stations.ts";
import { lireStations } from "../src/stations-declarees.ts";
import { demander } from "./aides/demander.ts";
import { lectureDesAppairees } from "./aides/appairees.ts";
import { cuisine, issue, type Lieux } from "./aides/cuisine.ts";
import { jusqua } from "./outils.ts";
import { posixOnly } from "./support/plateforme.ts";

const [BOX, MAC] = ["box/claude", "macbook-air-de-benoit/claude"];
const DEPOT = "acme/brigade";
// Ce que l'app a écrit dans le gist du Mac : le projet, sans en être la principale, et `macos`.
const DEMANDE: ProjetDemande = { nom: "brigade", depot: DEPOT, base: "v2", principale: false, cooks: 1, manager: null, reviewer: null, ouvertLe: null, demandeLe: null, fournit: ["macos"] };

// Le temps qu'une prise qui ne doit pas avoir lieu aurait largement eu pour se faire.
const laisserServir = () => new Promise((resoudre) => setTimeout(resoudre, 80));

// Pose un ticket calibré avec sa fiche, comme le manager au découpage.
const poser = (gh: Lieux["gh"], numero: number, ...lignes: string[]) => {
  gh.ficher(numero, "2026-10-26T09:00:00Z", [MARQUEUR, ...lignes].join("\n"));
  gh.poser(issue(numero));
};

describe("une station appairée par l'app reçoit les tickets qui demandent ce qu'elle fournit", { concurrency: 4, skip: posixOnly("runs a full kitchen on the fake claude, then declares a paired Mac from the test's own journal connection and has it claim the `macos` ticket while the `ios` one stays aside; skipped because the fake claude is a bash script, though Windows launches it through Git Bash and no failure of this kitchen there is known") }, () => {
  test("le ticket qui demande `macos`, mis de côté faute de station, part sur le Mac dès que la principale le déclare ; celui qui demande `ios` reste de côté, et la box ne prend ni l'un ni l'autre", async (t) => {
    const { repertoire, journal, gh, heure, types, etat, dernier } = cuisine(t, { decisions: true, scenario: "muet", stations: lireStations({ BRIGADE_STATIONS: `${BOX}:2:code+raisonnement` }) });
    poser(gh, 14, "- requiert : macos");
    poser(gh, 15, "- requiert : ios");
    await jusqua(() => types(14).includes("ticket.86") && types(15).includes("ticket.86"));
    assert.equal(dernier("ticket.86", 14)?.reason, "no-station: macos");

    // La principale lit le Mac dans les gists appairés du compte, et le déclare.
    const trouvees = secondairesDuProjet(lectureDesAppairees(heure.maintenant().getTime(), { id: "gistmac", nom: "MacBook Air de Benoit", projets: [DEMANDE] }), DEPOT, { nom: "box", gist: "gistbox" });
    assert.ok(Array.isArray(trouvees));
    assert.deepEqual(declarerLesSecondaires(repertoire, "brigade", trouvees).ecrites, [MAC]);
    await jusqua(() => stationsAnnoncees(journal.base).includes(MAC));
    assert.deepEqual(stationsAnnoncees(journal.base), [BOX, MAC]);

    // Le Mac vient : il s'annonce, et réclame.
    const tirer = (demande: Parameters<typeof demander>[2]) => demander(repertoire, MAC, demande, { maintenant: heure.maintenant, pasMs: 2 });
    assert.ok((await tirer({ verb: "announce" })).ok);
    await jusqua(() => etat(14) === "waiting");
    const prise = await tirer({ verb: "claim" });
    assert.ok(prise.ok && prise.verb === "claim", JSON.stringify(prise));
    assert.equal(prise.mission?.ticket, 14);
    assert.equal(etat(14), "taken");
    assert.equal(journal.duTicket(14).find((e) => e.type === "ticket.taken")?.author, `station:${MAC}`);

    // Rien d'autre pour lui : `ios`, personne ne le fournit.
    const rien = await tirer({ verb: "claim" });
    assert.ok(rien.ok && rien.verb === "claim");
    assert.equal(rien.mission, null);
    await laisserServir();
    assert.equal(etat(15), "86");
    assert.equal(dernier("ticket.86", 15)?.reason, "no-station: ios");
    assert.deepEqual(
      journal.tout().filter((e) => e.type === "ticket.taken").map((e) => [e.ticket, e.author]),
      [[14, `station:${MAC}`]],
    );
  });
});
