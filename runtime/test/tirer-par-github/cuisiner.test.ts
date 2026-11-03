// La station qui a rejoint la cuisine d'une autre y cuit (#1789) : elle réclame
// un ticket par son gist, lance le cook de la mission dans son worktree,
// renouvelle son bail, pousse sa branche et la rend — la principale décide de
// tout, et sa pass juge la livraison. De bout en bout sur une vraie cuisine,
// GitHub doublé en mémoire ; puis le cook d'une mission sur un vrai dépôt git,
// lancé par le faux `claude`.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import type { Canal, Fichiers } from "../../src/appairage/canal.ts";
import type { BacASableDeLaStation, Demande, Mission, Reponse } from "../../src/events/remote.ts";
import { MARQUEUR } from "../../src/fiche.ts";
import { configRail } from "../../src/alimenter.ts";
import type { Arret } from "../../src/superviseur.ts";
import { lireReglages } from "../../src/plafonds.ts";
import { lireStations } from "../../src/stations-declarees.ts";
import { superviserADistance } from "../../src/superviseur-distant.ts";
import { superviser, type Fin, type Supervise } from "../../src/superviseur.ts";
import type { ClientDuTableau, IssueDuTableau } from "../../src/tableau/publication/client.ts";
import { publierLeTableau, tableauDuJournal } from "../../src/tableau/publication/publier.ts";
import { cuisinerPourLaPrincipale, cuisinerUneMission, entreDeuxRenouvellementsMs, tenirLesCuisinesRejointes, type CuisinePourLaPrincipale } from "../../src/tirer-par-github/cuisiner.ts";
import { lecteurDuTableau } from "../../src/tirer-par-github/demander.ts";
import { relayerLesDemandes } from "../../src/tirer-par-github/relayer.ts";
import { chef, cuisine, issue, PLAFONDS, pousserSurLOrigine } from "../aides/cuisine.ts";
import { BASE, DEPOT, depotGit, FAUX_CLAUDE, git, jusqua, repertoireTemporaire, temporaireDuFichier } from "../outils.ts";
import { posixOnly } from "../support/plateforme.ts";

const rienNeReste = temporaireDuFichier();

const [BOX, MAC] = ["box/claude", "mac/claude"];
const GIST_MAC = "gistmac";
const DISPONIBLE: BacASableDeLaStation = { available: true, version: "2.1.250", home: "/Users/chef", worktrees: "/Users/chef/brigade-cooks/brigade", caches: [] };
const posix = (quoi: string) => ({ skip: posixOnly(`${quoi}; skipped because the fake claude is a bash script, though Windows launches it through Git Bash and no failure of it there is known`) });

// GitHub, doublé : le gist du Mac et les issues du dépôt.
function fauxGitHub() {
  const gists = new Map<string, Fichiers>([[GIST_MAC, {}]]);
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
  return { gists, canal, tableau };
}

// Le faux `claude`, lancé comme la station lance le cook d'une mission.
const lancerLeFaux = (scenario: string) => (mission: Mission, worktree: string, flux: string) =>
  superviser({ commande: FAUX_CLAUDE, args: mission.args, cwd: worktree, env: { ...process.env, FAUX_CLAUDE: scenario }, plafonds: mission.limits, graceMs: 2000, flux });

describe("la station qui a rejoint la cuisine y cuit, par GitHub seulement", posix("runs a full kitchen whose joined station claims a ticket through GitHub, runs the mission's cook on the fake claude, pushes its branch and delivers it to the main station's pass"), () => {
  test("elle réclame, la réclamation arrive au journal de la principale, qui lui prête le ticket ; elle en lance le cook, pousse sa branche et la rend — la pass de la principale la juge et la sert", async (t) => {
    const lieu = cuisine(t, { stations: lireStations({ BRIGADE_STATIONS: `${BOX}:1:code,${MAC}:1:chrome-connecté:distante+ensemble` }), presenceMs: 120_000, plafonds: { durationMs: 3_600_000, idleMs: 3_600_000 }, pass: true, scenario: "livre" });
    const { gh, journal, repertoire, runtime, heure, etat, types, dernier } = lieu;
    const github = fauxGitHub();
    const instant = () => heure.maintenant().getTime();
    const servi = (ticket: number) => types(ticket).includes("ticket.served");
    chef(repertoire, "grant.activated");
    // #14 cuit sur la box ; #16 demande ce que seul le Mac fournit.
    gh.poser(issue(14));
    gh.ficher(16, "2026-10-08T09:00:00Z", [MARQUEUR, "- requiert : chrome-connecté"].join("\n"));
    gh.poser(issue(16));
    await jusqua(() => servi(14) && etat(16) === "86");

    // La principale : ce que `projets/tenir.ts` relaie à chaque lecture, et le tableau qu'elle publie.
    const publication = publierLeTableau({ client: github.tableau, depot: DEPOT, lire: (lu) => tableauDuJournal(journal, runtime.projet, lu, { depot: DEPOT }), dire: () => {} });
    let tourne = true;
    const principale = (async () => {
      while (tourne) {
        await relayerLesDemandes({ repertoireEtat: repertoire, depot: DEPOT, secondaires: [{ station: MAC, gist: GIST_MAC }], lire: github.canal.lire, maintenant: instant });
        await publication.rafraichir(heure.maintenant());
        await new Promise((resoudre) => setTimeout(resoudre, 5));
      }
    })();

    // Le Mac : sa boucle, telle que la station l'ouvre pour la cuisine rejointe.
    const worktrees = repertoireTemporaire(t);
    const lignes: string[] = [];
    const mac = cuisinerPourLaPrincipale({
      station: MAC,
      depot: DEPOT,
      gist: GIST_MAC,
      canal: github.canal,
      lireLeTableau: lecteurDuTableau(github.tableau),
      cooks: 1,
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
        preparer: async (_mission, worktree) => void mkdirSync(worktree, { recursive: true }),
        lancer: lancerLeFaux("livre"),
        // Sa branche, poussée sur l'origine du projet.
        pousser: async (_worktree, branche) => pousserSurLOrigine(repertoire, branche),
        ranger: async (worktree) => rmSync(worktree, { recursive: true, force: true }),
      },
    });
    try {
      await jusqua(() => servi(16));
    } finally {
      await mac.arreter();
      tourne = false;
      await principale;
    }

    // Ce que le Mac a demandé est arrivé au journal de la principale, par GitHub : réclamer, puis rendre.
    const demandes = journal.tout().flatMap((e) => (e.type === "remote.asked" && e.payload.station === MAC ? [[e.payload.verb, e.payload.via]] : []));
    assert.deepEqual(demandes.slice(0, 1), [["claim", "github"]]);
    assert.ok(demandes.some(([verb]) => verb === "deliver"), JSON.stringify(demandes));
    // Le ticket a été pris par le Mac, et par lui seul.
    assert.deepEqual(journal.duTicket(16).filter((e) => e.type === "ticket.taken").map((e) => e.author), [`station:${MAC}`]);
    // Son cook a été lancé ici, et sa livraison est celle d'un cook : sa branche, son livrable.
    const rapport = dernier("cook.reported", 16);
    assert.equal(rapport?.ending, "done");
    assert.match(String(rapport?.branch), /^cook\//);
    assert.equal(mac.issues().length, 1);
    assert.deepEqual(mac.issues()[0], { rendue: { ok: true, verb: "deliver", ending: "done", reason: null } });
    assert.ok(lignes.some((ligne) => /prend #16 de la principale/.test(ligne)), lignes.join("\n"));
    assert.ok(lignes.some((ligne) => /#16 : son cook est lancé ici/.test(ligne)), lignes.join("\n"));
  });
});

const MISSION: Mission = {
  ticket: 21,
  title: "Un ticket",
  run: "run-21",
  branch: "cook/run-21",
  base: BASE,
  repository: "acme/brigade",
  model: "sonnet",
  effort: "low",
  prompt: "Cuisine le ticket #21.",
  args: ["-p", "Cuisine le ticket #21."],
  limits: PLAFONDS,
  leaseMs: 600_000,
  leaseUntil: "2026-10-27T12:00:00.000Z",
  resumes: null,
};

test("le cook d'une mission, sur un vrai dépôt : son worktree part de la base, le cook y commite, sa branche est poussée sur l'origine et rendue avec son compte-rendu — puis le worktree est rangé", posix("cooks one mission on a real repository with the fake claude committing in its worktree, and expects the branch pushed to the origin, delivered with its report and the worktree removed"), async (t) => {
  const { origine, clone } = depotGit(t);
  const worktree = join(repertoireTemporaire(t), "worktrees", MISSION.run);
  const demandes: Demande[] = [];
  const rendue: Reponse = { ok: true, verb: "deliver", ending: "done", reason: null };
  const issue = await cuisinerUneMission({
    mission: MISSION,
    worktree,
    clone,
    claude: FAUX_CLAUDE,
    env: { ...process.env, FAUX_CLAUDE: "livre" },
    gh: "gh-jamais-lance",
    demander: async (demande) => (demandes.push(demande), rendue),
    dire: () => {},
  });

  assert.deepEqual(issue, { rendue });
  assert.equal(demandes.length, 1);
  const [livraison] = demandes;
  assert.ok(livraison?.verb === "deliver");
  assert.equal(livraison.run, MISSION.run);
  assert.equal(livraison.ending, "delivered");
  assert.equal(livraison.reason, null);
  assert.match(String(livraison.message), /travail\.txt/);
  assert.ok(livraison.turns > 0);
  // La branche du cook est sur l'origine, faite du commit du cook sur la base.
  assert.equal(git(origine, "show", `${MISSION.branch}:travail.txt`).trim(), "le travail du cook");
  assert.equal(git(origine, "rev-parse", `${MISSION.branch}~1`).trim(), git(origine, "rev-parse", BASE).trim());
  assert.equal(existsSync(worktree), false, "le worktree est rangé");
});

test("la principale a arrêté le cook — son bail est tombé : la station l'arrête ici aussi, et ne rend rien", async () => {
  const demandes: Demande[] = [];
  let arrete = false;
  let finir: (fin: Fin) => void = () => {};
  const cook: Supervise = {
    pid: undefined,
    mesure: () => ({ turns: 2, tokens: 50 }),
    arreter: () => {
      arrete = true;
      finir({ code: null, signal: "SIGTERM", turns: 2, tokens: 50, durationMs: 1, arret: { reason: "stop", limit: null, observed: null }, erreur: null });
    },
    abandonner: () => {},
    fin: new Promise<Fin>((resoudre) => void (finir = resoudre)),
  };
  const ranges: string[] = [];
  const issue = await cuisinerUneMission({
    mission: MISSION,
    worktree: "/nulle-part/run-21",
    clone: "/nulle-part/clone",
    claude: "claude",
    env: {},
    gh: "gh",
    demander: async (demande) => {
      demandes.push(demande);
      return { ok: false, verb: demande.verb, refusal: "stopped", said: "the lease ran out: the ticket went back to the rail", stop: "lease" };
    },
    dire: () => {},
    renouvelerToutesLesMs: 1,
    preparer: async () => {},
    lancer: () => cook,
    pousser: async () => assert.fail("rien n'est poussé"),
    ranger: async (worktree) => void ranges.push(worktree),
  });
  assert.equal(arrete, true);
  assert.deepEqual(issue, { abandonnee: "the lease ran out: the ticket went back to the rail" });
  assert.deepEqual(demandes.map((demande) => demande.verb), ["renew"]);
  assert.deepEqual(ranges, ["/nulle-part/run-21"]);
});

// #2095 : sur la station du Mac, chaque cook de plus de dix minutes finissait
// `guard:idle` à 0 tour et 0 token, alors que son flux montrait des dizaines de
// messages. La chronologie est celle de #2078 et #2085 : la box prête le
// ticket, la station lit la mission et prépare le worktree (un peu plus d'une
// minute), le cook travaille ; chaque renouvellement passe par le gist, que la
// box lit toutes les trente secondes, et sa réponse revient par le tableau. Les
// réglages sont ceux de la box par défaut. L'horloge est simulée : le test ne
// dépend pas de la vitesse de la machine.
test("sous les réglages par défaut de la box, le cook d'une station qui travaille plus de dix minutes lui rapporte sa mesure avant qu'elle ne le tienne pour inactif", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const attendre = (ms: number) => new Promise<void>((resoudre) => setTimeout(resoudre, ms));
  const { plafonds } = lireReglages({});
  const mission: Mission = { ...MISSION, leaseMs: configRail({ BRIGADE_GITHUB_REPO: "acme/brigade" }).dureeBailMs, limits: plafonds };
  const [REMISE_MS, RELAIS_MS, RETOUR_MS] = [90_000, 60_000, 60_000];
  const TRAVAIL_MS = 30 * 60_000;

  // La box : son cook distant, lancé au prêt du ticket.
  const arrets: Arret[] = [];
  const box = superviserADistance({ plafonds, surArret: (arret) => void arrets.push(arret) });

  // Le cook de la station : il travaille, chaque mesure en compte un tour de plus.
  let tours = 0;
  let finir: (fin: Fin) => void = () => {};
  const cook: Supervise = {
    pid: undefined,
    mesure: () => ({ turns: ++tours, tokens: tours * 1_000 }),
    arreter: () => finir({ code: null, signal: "SIGTERM", turns: tours, tokens: tours * 1_000, durationMs: 1, arret: { reason: "stop", limit: null, observed: null }, erreur: null }),
    abandonner: () => {},
    fin: new Promise<Fin>((resoudre) => void (finir = resoudre)),
  };
  let empreintes = 0;
  const issue = cuisinerUneMission({
    mission,
    worktree: "/nulle-part/run-21",
    clone: "/nulle-part/clone",
    claude: "claude",
    env: {},
    gh: "gh",
    demander: async (demande) => {
      if (demande.verb !== "renew") {
        box.rendre(1);
        return { ok: true, verb: "deliver", ending: "failed", reason: null };
      }
      await attendre(RELAIS_MS);
      box.mesurer({ turns: demande.turns, tokens: demande.tokens });
      await attendre(RETOUR_MS);
      const arret = arrets[0];
      if (arret) return { ok: false, verb: "renew", refusal: "stopped", said: `stopped on the box (${arret.reason})`, stop: arret.reason };
      return { ok: true, verb: "renew", leaseUntil: "2026-10-27T12:00:00.000Z" };
    },
    dire: () => {},
    preparer: () => attendre(REMISE_MS),
    lancer: () => cook,
    empreinte: async () => `empreinte-${++empreintes}`,
    pousser: async () => {},
    ranger: async () => {},
  });

  const vider = async () => {
    for (let i = 0; i < 20; i += 1) await new Promise((resoudre) => setImmediate(resoudre));
  };
  for (let ecoule = 0; ecoule < TRAVAIL_MS && arrets.length === 0; ecoule += 5_000) {
    t.mock.timers.tick(5_000);
    await vider();
  }
  const mesure = box.mesure();
  cook.arreter();
  for (let i = 0; i < 10; i += 1) {
    t.mock.timers.tick(RELAIS_MS + RETOUR_MS);
    await vider();
  }
  await issue;

  assert.deepEqual(arrets, [], `la box a arrêté le cook à ${mesure.turns} tour(s) et ${mesure.tokens} token(s)`);
  assert.ok(mesure.turns > 0 && mesure.tokens > 0, JSON.stringify(mesure));
});

test("un bail plus court que quatre fois l'inactivité se renouvelle à son tiers, comme avant", () => {
  assert.equal(entreDeuxRenouvellementsMs({ leaseMs: 600_000, limits: PLAFONDS }), PLAFONDS.idleMs / 4);
  assert.equal(entreDeuxRenouvellementsMs({ leaseMs: 30_000, limits: PLAFONDS }), 10_000);
  assert.equal(entreDeuxRenouvellementsMs({ leaseMs: 1_200, limits: PLAFONDS }), 1_000);
});

test("une boucle par cuisine rejointe : ouverte, rouverte quand ce qu'elle en dit change, fermée quand elle ne la rejoint plus", async () => {
  const journal: string[] = [];
  const ouvrir = (rejointe: { depot: string; cooks: number }, gist: string): CuisinePourLaPrincipale => {
    journal.push(`ouvre ${rejointe.depot} ${rejointe.cooks} ${gist}`);
    return { issues: () => [], arreter: async () => void journal.push(`ferme ${rejointe.depot} ${rejointe.cooks}`) };
  };
  const cuisines = tenirLesCuisinesRejointes(ouvrir);
  cuisines.tenir([{ depot: "benomite/brigade", cooks: 2 }], GIST_MAC);
  cuisines.tenir([{ depot: "benomite/brigade", cooks: 2 }], GIST_MAC);
  cuisines.tenir([{ depot: "benomite/brigade", cooks: 3 }, { depot: "acme/shop", cooks: 1 }], GIST_MAC);
  cuisines.tenir([{ depot: "acme/shop", cooks: 1 }], GIST_MAC);
  await cuisines.arreter();
  assert.deepEqual(journal, ["ouvre benomite/brigade 2 gistmac", "ferme benomite/brigade 2", "ouvre benomite/brigade 3 gistmac", "ouvre acme/shop 1 gistmac", "ferme benomite/brigade 3", "ferme acme/shop 1"]);
});

test("le côté de la station qui a rejoint n'ouvre aucun journal et ne passe par aucun geste de la box", () => {
  const source = readFileSync(join(import.meta.dirname, "../../src/tirer-par-github/cuisiner.ts"), "utf8");
  assert.doesNotMatch(source, /from "\.\.\/(journal|tirer|distantes)\.ts"|ouvrirJournal|BRIGADE_STATE_DIR/);
});

test("cuisiner.test.ts ne laisse rien dans le répertoire temporaire", rienNeReste);
