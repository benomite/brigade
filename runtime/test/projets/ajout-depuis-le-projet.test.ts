// Un ordinateur ajouté à un projet depuis la page du projet (« + station »,
// #1830) : l'app écrit dans le gist de sa station une ligne qui ne la dit pas
// principale. La station en rejoint la cuisine, comme une case cochée sur sa
// page à elle — et y cuit : un ticket que seul cet ordinateur peut cuire part
// chez lui de lui-même, sans second geste. De bout en bout sur une vraie
// cuisine, GitHub doublé en mémoire, le cook lancé par le faux `claude`.
import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import type { Canal, Fichiers } from "../../src/appairage/canal.ts";
import { FICHIER_LOCAL } from "../../src/appairage/presence.ts";
import type { BacASableDeLaStation, Mission } from "../../src/events/remote.ts";
import { MARQUEUR } from "../../src/fiche.ts";
import { documentDeDemande, FICHIER_PROJETS, FICHIER_SUIVI, type ProjetDemande, type SuiviDuProjet } from "../../src/projets/demande.ts";
import { FICHIER_REJOINTES, rejointesLues, type CuisineRejointe } from "../../src/projets/rejoindre.ts";
import { tenirProjetsDeLApp } from "../../src/projets/tenir.ts";
import { lireStations } from "../../src/stations-declarees.ts";
import { superviser } from "../../src/superviseur.ts";
import type { ClientDuTableau, IssueDuTableau } from "../../src/tableau/publication/client.ts";
import { publierLeTableau, tableauDuJournal } from "../../src/tableau/publication/publier.ts";
import { cuisinerPourLaPrincipale, tenirLesCuisinesRejointes } from "../../src/tirer-par-github/cuisiner.ts";
import { lecteurDuTableau } from "../../src/tirer-par-github/demander.ts";
import { relayerLesDemandes } from "../../src/tirer-par-github/relayer.ts";
import { lectureDesAppairees } from "../aides/appairees.ts";
import { chef, cuisine, issue, pousserSurLOrigine } from "../aides/cuisine.ts";
import { DEPOT, FAUX_CLAUDE, jusqua, repertoireTemporaire, temporaireDuFichier } from "../outils.ts";
import { posixOnly } from "../support/plateforme.ts";

const rienNeReste = temporaireDuFichier();

const [BOX, MAC] = ["box/claude", "mac/claude"];
const [GIST_BOX, GIST_MAC] = ["gistbox", "gistmac"];
const DISPONIBLE: BacASableDeLaStation = { available: true, version: "2.1.250", home: "/Users/chef", worktrees: "/Users/chef/brigade-cooks/brigade", caches: [] };

// GitHub, doublé : les gists et les issues du dépôt.
function fauxGitHub(gists: Map<string, Fichiers>) {
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
  return { canal, tableau };
}

test(
  "ajouté depuis la page du projet, le Mac en rejoint la cuisine et y cuit : le ticket que seul un Mac peut cuire part chez lui de lui-même, et la pass de la box le sert",
  { skip: posixOnly("the fake claude is a POSIX shell script") },
  async (t) => {
    const lieu = cuisine(t, { stations: lireStations({ BRIGADE_STATIONS: `${BOX}:1:code,${MAC}:1:macos:distante+ensemble` }), presenceMs: 120_000, plafonds: { durationMs: 3_600_000, idleMs: 3_600_000 }, pass: true, scenario: "livre" });
    const { gh, journal, repertoire, runtime, heure, etat, types } = lieu;
    const instant = () => heure.maintenant().getTime();
    const servi = (ticket: number) => types(ticket).includes("ticket.served");
    chef(repertoire, "grant.activated");
    // #14 cuit sur la box ; #16 — comme mirrorscreen #1112 — demande ce que seul un Mac fournit.
    gh.poser(issue(14));
    gh.ficher(16, "2026-10-08T09:00:00Z", [MARQUEUR, "- requiert : macos"].join("\n"));
    gh.poser(issue(16));
    await jusqua(() => servi(14) && etat(16) === "86");

    // Ce que « + station » écrit dans le gist du Mac : le projet, sans le dire sa principale.
    const ajoute: ProjetDemande = { nom: runtime.projet, depot: DEPOT, base: null, principale: false, cooks: 1, manager: null, reviewer: null, ouvertLe: null, demandeLe: null, fournit: ["navigateur-headless"] };
    const gists = new Map<string, Fichiers>([[GIST_MAC, { [FICHIER_PROJETS]: documentDeDemande([ajoute]) }]]);
    const github = fauxGitHub(gists);

    // La box : ce que `projets/tenir.ts` relaie à chaque lecture, et le tableau qu'elle publie.
    const publication = publierLeTableau({ client: github.tableau, depot: DEPOT, lire: (lu) => tableauDuJournal(journal, runtime.projet, lu, { depot: DEPOT }), dire: () => {} });
    let tourne = true;
    const principale = (async () => {
      while (tourne) {
        await relayerLesDemandes({ repertoireEtat: repertoire, depot: DEPOT, secondaires: [{ station: MAC, gist: GIST_MAC }], lire: github.canal.lire, maintenant: instant });
        await publication.rafraichir(heure.maintenant());
        await new Promise((resoudre) => setTimeout(resoudre, 5));
      }
    })();

    // Le Mac : sa station, appairée par son gist, telle que `station/main.ts` la tient — ce qu'elle rejoint ouvre sa boucle.
    const racine = repertoireTemporaire(t);
    writeFileSync(join(racine, FICHIER_LOCAL), JSON.stringify({ gist: GIST_MAC, appairee: true, code: null, expireLe: null, echus: [] }));
    const worktrees = repertoireTemporaire(t);
    const lignes: string[] = [];
    const cuisines = tenirLesCuisinesRejointes((rejointe: CuisineRejointe, gist: string) =>
      cuisinerPourLaPrincipale({
        station: MAC,
        depot: rejointe.depot,
        gist,
        canal: github.canal,
        lireLeTableau: lecteurDuTableau(github.tableau),
        cooks: rejointe.cooks,
        clone: join(worktrees, "clone"),
        worktrees,
        claude: FAUX_CLAUDE,
        env: process.env,
        gh: "gh-jamais-lance",
        bacASable: () => DISPONIBLE,
        dire: (ligne) => lignes.push(ligne),
        maintenant: instant,
        pasMs: 5,
        attenteMs: 60_000,
        entreDeuxReclamationsMs: 10,
        cook: {
          preparer: async (_mission: Mission, worktree: string) => void mkdirSync(worktree, { recursive: true }),
          lancer: (mission: Mission, worktree: string, flux: string) => superviser({ commande: FAUX_CLAUDE, args: mission.args, cwd: worktree, env: { ...process.env, FAUX_CLAUDE: "livre" }, plafonds: mission.limits, graceMs: 2000, flux }),
          pousser: async (_worktree: string, branche: string) => pousserSurLOrigine(repertoire, branche),
          ranger: async (worktree: string) => rmSync(worktree, { recursive: true, force: true }),
        },
      }),
    );
    const mac = tenirProjetsDeLApp({
      racine,
      canal: github.canal,
      station: "mac",
      env: { BRIGADE_GH_BIN: "gh-jamais-lance", HOME: repertoireTemporaire(t) },
      servis: { projets: () => [], refus: () => null },
      apresEcriture: () => assert.fail("rien ne s'écrit dans sa configuration : elle n'ouvre aucune cuisine"),
      dire: (ligne) => lignes.push(ligne),
      cadenceMs: 3_600_000,
      maintenant: instant,
      // La box sert le projet, et le publie dans sa présence.
      lireLesAppairees: async () => lectureDesAppairees(instant(), { id: GIST_BOX, nom: "box", sert: { [runtime.projet]: DEPOT } }, { id: GIST_MAC, nom: "mac" }),
      cadenceDesAppareesMs: 0,
      plateforme: "darwin",
      surLesRejointes: (rejointes, gist) => cuisines.tenir(rejointes, gist),
    });
    try {
      // Une lecture de ce que l'app demande : aucun autre geste.
      await mac.relire();
      await jusqua(() => servi(16));
    } finally {
      mac.arreter();
      await cuisines.arreter();
      tourne = false;
      await principale;
    }

    // Le Mac l'a rejoint, et le publie pour la box : ses cooks, et ce qu'il fournit — un Mac, `macos`.
    const gist = gists.get(GIST_MAC) as Fichiers;
    assert.deepEqual(rejointesLues(gist[FICHIER_REJOINTES]), [{ nom: runtime.projet, depot: DEPOT, principale: "box", cooks: 1, fournit: ["code", "raisonnement", "navigateur-headless", "macos"] }]);
    const suivi = (JSON.parse(gist[FICHIER_SUIVI] ?? "null") as { projets: SuiviDuProjet[] } | null)?.projets ?? [];
    assert.deepEqual(suivi.map(({ etat: dit, cuitSur, rejoindre }) => ({ dit, cuitSur, rejoindre })), [{ dit: "secondaire", cuitSur: "box", rejoindre: { issue: "rejointe", principale: "box" } }]);
    // #16 a été pris par le Mac, et par lui seul, sur sa réclamation par GitHub.
    assert.deepEqual(journal.duTicket(16).filter((e) => e.type === "ticket.taken").map((e) => e.author), [`station:${MAC}`]);
    const demandes = journal.tout().flatMap((e) => (e.type === "remote.asked" && e.payload.station === MAC ? [[e.payload.verb, e.payload.via]] : []));
    assert.deepEqual(demandes.slice(0, 1), [["claim", "github"]]);
    assert.ok(lignes.some((ligne) => /prend #16 de la principale/.test(ligne)), lignes.join("\n"));
  },
);

test("ajout-depuis-le-projet.test.ts ne laisse rien dans le répertoire temporaire", rienNeReste);
