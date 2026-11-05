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
import { lireStations } from "../../src/stations-declarees.ts";
import { superviser, type Fin, type Supervise } from "../../src/superviseur.ts";
import type { ClientDuTableau, IssueDuTableau } from "../../src/tableau/publication/client.ts";
import { publierLeTableau, tableauDuJournal } from "../../src/tableau/publication/publier.ts";
import { cuisinerPourLaPrincipale, cuisinerUneMission, intervalleDeRenouvellement, tenirLesCuisinesRejointes, type CuisinePourLaPrincipale } from "../../src/tirer-par-github/cuisiner.ts";
import { lecteurDuTableau } from "../../src/tirer-par-github/demander.ts";
import { relayerLesDemandes } from "../../src/tirer-par-github/relayer.ts";
import { chef, cuisine, issue, PLAFONDS, pousserSurLOrigine } from "../aides/cuisine.ts";
import { BASE, DEPOT, depotGit, FAUX_CLAUDE, fauxGh, git, issueGitHub, jusqua, repertoireTemporaire, temporaireDuFichier } from "../outils.ts";
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
      attenteMs: 2000,
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

// Un cook qui tourne tant que le test ne le finit pas, et dit ce qu'il a consommé.
function cookEnCours(mesure = { turns: 3, tokens: 900 }) {
  let finir: (fin: Fin) => void = () => {};
  const cook: Supervise = {
    pid: undefined,
    mesure: () => mesure,
    arreter: () => {},
    abandonner: () => {},
    fin: new Promise<Fin>((resoudre) => void (finir = resoudre)),
  };
  return { cook, finir: () => finir({ code: 0, signal: null, ...mesure, durationMs: 1, arret: null, erreur: null }) };
}

const viderLesPromesses = async () => {
  for (let tour = 0; tour < 20; tour++) await new Promise((resoudre) => setImmediate(resoudre));
};

test("aux réglages de la box — bail de 30 min, 10 min d'inactivité —, la station rapporte la mesure de son cook bien avant le plafond d'inactivité, et la principale ne l'arrête plus à 0 tour et 0 token (#2095)", async (t) => {
  // Au tiers du bail seul, le premier renouvellement partait à 10 min : le plafond même.
  const mission: Mission = { ...MISSION, leaseMs: 1_800_000, limits: { ...PLAFONDS, idleMs: 600_000 } };
  assert.ok(intervalleDeRenouvellement(mission) <= mission.limits.idleMs / 4, `${intervalleDeRenouvellement(mission)} ms entre deux renouvellements`);
  // Le bail reste la borne quand il est le plus court ; et jamais moins d'une seconde.
  assert.equal(intervalleDeRenouvellement({ leaseMs: 60_000, limits: { ...PLAFONDS, idleMs: 3_600_000 } }), 20_000);
  assert.equal(intervalleDeRenouvellement({ leaseMs: 60_000, limits: { ...PLAFONDS, idleMs: 100 } }), 1_000);

  // Sur l'horloge de la station : avant que le plafond d'inactivité ne s'écoule,
  // la principale a reçu plusieurs mesures du cook — celles qu'elle juge.
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const demandes: Demande[] = [];
  const { cook, finir } = cookEnCours();
  const issue = cuisinerUneMission({
    mission,
    worktree: "/nulle-part/run-21",
    clone: "/nulle-part/clone",
    claude: "claude",
    env: {},
    gh: "gh",
    demander: async (demande) => {
      demandes.push(demande);
      return demande.verb === "renew" ? { ok: true, verb: "renew", leaseUntil: "2026-10-27T12:30:00.000Z" } : { ok: true, verb: "deliver", ending: "failed", reason: null };
    },
    dire: () => {},
    preparer: async () => {},
    // Sans le `git` réel : ses process prennent du temps réel, que la boucle
    // sur l'horloge simulée n'attend pas — sous Windows, aucun ne finissait
    // avant elle, et aucun renouvellement ne partait.
    empreinte: async () => null,
    lancer: () => cook,
    pousser: async () => {},
    ranger: async () => {},
  });
  const pas = 50_000;
  for (let ecoule = 0; ecoule + pas < mission.limits.idleMs; ecoule += pas) {
    await viderLesPromesses();
    t.mock.timers.tick(pas);
  }
  await viderLesPromesses();
  const renouvellements = demandes.filter((demande) => demande.verb === "renew");
  assert.ok(renouvellements.length >= 3, `${renouvellements.length} renouvellement(s) avant le plafond d'inactivité`);
  assert.ok(renouvellements.every((demande) => demande.verb === "renew" && demande.turns === 3 && demande.tokens === 900));
  finir();
  await viderLesPromesses();
  t.mock.timers.tick(mission.limits.idleMs);
  await issue;
});

test("dans le bac à sable, le cook n'a aucun accès à GitHub : la station lui remet son ticket et ses commentaires, lus par son propre `gh`, là où la mission le dit — puis le retire (#2095)", posix("drives the station's own gh through the fake gh script to read the ticket handed to a sandboxed cook"), async (t) => {
  const gh = fauxGh(t);
  gh.repondre(`repos/${DEPOT}/issues/21`, { corps: { ...issueGitHub(21, { title: "Un ticket" }), body: "Les critères du ticket #21." } });
  gh.commentaires(21, "<!-- brigade:fiche -->\n- zone : runtime/src/");
  const worktree = join(repertoireTemporaire(t), "worktrees", MISSION.run);
  const mission: Mission = { ...MISSION, repository: DEPOT, sandbox: true, ticketFile: `${worktree}.ticket.md` };
  const lu: string[] = [];
  const { cook, finir } = cookEnCours();
  const issue = await cuisinerUneMission({
    mission,
    worktree,
    clone: "/nulle-part/clone",
    claude: "claude",
    env: {},
    gh: gh.bin,
    demander: async () => ({ ok: true, verb: "deliver", ending: "failed", reason: null }),
    dire: () => {},
    preparer: async () => void mkdirSync(worktree, { recursive: true }),
    lancer: () => {
      // Au lancement du cook, son ticket l'attend déjà.
      lu.push(readFileSync(`${worktree}.ticket.md`, "utf8"));
      finir();
      return cook;
    },
    pousser: async () => {},
    ranger: async (ici) => rmSync(ici, { recursive: true, force: true }),
  });
  assert.ok("rendue" in issue);
  assert.equal(lu.length, 1);
  assert.match(lu[0]!, /^# #21 — Un ticket\n\nLes critères du ticket #21\./);
  assert.match(lu[0]!, /- zone : runtime\/src\//);
  assert.equal(existsSync(`${worktree}.ticket.md`), false, "le ticket remis est retiré avec le worktree");
});

test("un ticket que la station ne peut pas remettre — illisible, ou nommé ailleurs qu'à côté du worktree — ne lance aucun cook : la mission est rendue en échec, en disant pourquoi", async (t) => {
  const worktree = join(repertoireTemporaire(t), "worktrees", MISSION.run);
  const cas: Array<{ mission: Mission; lire: () => Promise<string>; raison: RegExp }> = [
    { mission: { ...MISSION, sandbox: true, ticketFile: `${worktree}.ticket.md` }, lire: async () => Promise.reject(new Error("gh: HTTP 502")), raison: /^ticket: gh: HTTP 502/ },
    { mission: { ...MISSION, sandbox: true, ticketFile: "/Users/chef/.zshrc" }, lire: async () => "# #21", raison: /^ticket: the mission hands the ticket in \/Users\/chef\/\.zshrc, not beside the cook's worktree/ },
  ];
  for (const { mission, lire, raison } of cas) {
    const demandes: Demande[] = [];
    const issue = await cuisinerUneMission({
      mission,
      worktree,
      clone: "/nulle-part/clone",
      claude: "claude",
      env: {},
      gh: "gh",
      demander: async (demande) => (demandes.push(demande), { ok: true, verb: "deliver", ending: "failed", reason: null }),
      dire: () => {},
      preparer: async () => void mkdirSync(worktree, { recursive: true }),
      lireLeTicket: lire,
      lancer: () => assert.fail("aucun cook ne part sans son ticket"),
      pousser: async () => assert.fail("rien n'est poussé"),
      ranger: async (ici) => rmSync(ici, { recursive: true, force: true }),
    });
    assert.ok("rendue" in issue);
    const [livraison] = demandes;
    assert.ok(livraison?.verb === "deliver");
    assert.equal(livraison.ending, "failed");
    assert.match(String(livraison.reason), raison);
    assert.deepEqual([livraison.turns, livraison.tokens], [0, 0]);
  }
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

test("un push refusé : la station rend ce que git a dit en entier, sans le couper", posix("pushes with a stub that fails and expects the whole git output in the reason"), async (t) => {
  const { clone } = depotGit(t);
  const worktree = join(repertoireTemporaire(t), "worktrees", MISSION.run);
  const demandes: Demande[] = [];
  const dit = `remote: ${"refus ".repeat(80)}\n! [remote rejected] branche -> branche (hook declined)`;
  await cuisinerUneMission({
    mission: MISSION,
    worktree,
    clone,
    claude: FAUX_CLAUDE,
    env: { ...process.env, FAUX_CLAUDE: "livre" },
    gh: "gh-jamais-lance",
    demander: async (demande) => (demandes.push(demande), { ok: true, verb: "deliver", ending: "failed", reason: null }),
    dire: () => {},
    pousser: async () => {
      throw new Error(dit);
    },
  });
  const [livraison] = demandes;
  assert.ok(livraison?.verb === "deliver");
  assert.equal(livraison.ending, "failed");
  assert.ok(dit.length > 200);
  assert.equal(livraison.reason, `push: ${dit}`);
});
