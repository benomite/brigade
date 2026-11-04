// Une seconde station du projet — l'ordinateur du chef — prend part à la
// cuisine servie sur l'état GitHub seul (#2219) : elle réclame par son gist
// comme aujourd'hui (`cuisiner.ts`), et la principale lui répond par les faits
// de GitHub (`sur-github-seul.ts`) au lieu de relayer à un journal qui ne tient
// plus le rail. Deux stations prennent, chacune ses tickets, jamais le même ;
// la seconde cuit et livre en pass ; interrupteur éteint, rien ne change.
//
// La prise (`github-etat/prise.ts`), le tour de la principale
// (`brigade-github.ts`), le tableau et la boucle de la station sont les vrais :
// seuls GitHub et le cook sont doublés.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import type { Canal, Fichiers } from "../../src/appairage/canal.ts";
import { FICHIER_LOCAL } from "../../src/appairage/presence.ts";
import { brancheDuTicket, priseDeLaStation, stationGitHub, type GitHubDuTour } from "../../src/brigade-github.ts";
import type { BacASableDeLaStation, Mission, Reponse } from "../../src/events/remote.ts";
import { LABEL_IN_PASS, LABEL_TAKEN } from "../../src/github-etat/etats.ts";
import { lireTenant } from "../../src/github-etat/prise.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { FICHIER_PROJETS } from "../../src/projets/demande.ts";
import { documentDesRejointes, FICHIER_REJOINTES } from "../../src/projets/rejoindre.ts";
import { tenirProjetsDeLApp } from "../../src/projets/tenir.ts";
import { reglesDuProjet } from "../../src/reseau.ts";
import type { Supervise } from "../../src/superviseur.ts";
import type { ClientDuTableau, IssueDuTableau } from "../../src/tableau/publication/client.ts";
import { publierLeTableau, tableauDuJournal } from "../../src/tableau/publication/publier.ts";
import { cuisinerPourLaPrincipale } from "../../src/tirer-par-github/cuisiner.ts";
import { poserLaDemande } from "../../src/tirer-par-github/demande.ts";
import { lecteurDuTableau } from "../../src/tirer-par-github/demander.ts";
import { repondreSurGitHubSeul } from "../../src/tirer-par-github/sur-github-seul.ts";
import { lectureDesAppairees } from "../aides/appairees.ts";
import { projetSurGit } from "../aides/projet-sur-git.ts";
import { aArreter, jusqua, repertoireTemporaire, temporaireDuFichier } from "../outils.ts";

const rienNeReste = temporaireDuFichier();

const [BOX, MAC] = ["box/claude", "mac/claude"];
const DEPOT = "acme/shop";
const CALIBRE = ["fire", "model:sonnet", "effort:medium"];
const PLAFONDS = { durationMs: 3_600_000, tokens: 1_000_000, idleMs: 3_600_000 };
const DISPONIBLE: BacASableDeLaStation = { available: true, version: "2.1.250", home: "/Users/chef", worktrees: "/Users/chef/brigade-cooks/shop", caches: [] };
let ids = 0;
const unId = () => `00000000-0000-4000-8000-${String(++ids).padStart(12, "0")}`;

// GitHub, doublé : les issues du dépôt, leurs commentaires et leurs PR. Chaque
// appel rend la main avant de répondre, pour que deux stations s'entrelacent
// comme sur le vrai.
class FauxGitHub {
  tickets = new Map<number, { number: number; title: string; labels: Set<string>; state: "open" | "closed"; corps: string }>();
  commentaires = new Map<number, Array<{ id: number; body: string; association: string; createdAt: string }>>();
  retraits = new Map<number, Array<{ label: string; createdAt: string }>>();
  prs: Array<{ number: number; issue: number; branche: string; sha: string; state: "open" | "closed"; merged: boolean; corps: string }> = [];
  appels = 0;
  private horloge = 0;

  feu(number: number, labels: string[] = CALIBRE): void {
    this.tickets.set(number, { number, title: `ticket ${number}`, labels: new Set(labels), state: "open", corps: "" });
  }

  private instant(): string {
    this.horloge += 1;
    return new Date(Date.UTC(2026, 10, 4) + this.horloge * 1000).toISOString();
  }

  // Le geste du chef : il retire un label de l'issue.
  retirer(numero: number, label: string): void {
    this.tickets.get(numero)!.labels.delete(label);
    this.retraits.set(numero, [...(this.retraits.get(numero) ?? []), { label, createdAt: this.instant() }]);
  }

  labels(numero: number): string[] {
    return [...this.tickets.get(numero)!.labels].sort();
  }

  client(): GitHubDuTour {
    const appel = async () => {
      this.appels += 1;
      await new Promise((suite) => setImmediate(suite));
    };
    const ticket = (numero: number) => this.tickets.get(numero) ?? assert.fail(`#${numero} inconnu`);
    return {
      fires: async () => {
        await appel();
        return [...this.tickets.values()].filter((t) => t.state === "open" && t.labels.has("fire")).map((t) => ({ number: t.number, title: t.title, labels: [...t.labels], state: t.state }));
      },
      prDuTicket: async (issue) => {
        await appel();
        const pr = this.prs.findLast((p) => p.issue === issue);
        return pr === undefined ? null : { number: pr.number, sha: pr.sha, state: pr.state, merged: pr.merged, enRetard: false, version: pr.sha };
      },
      corpsDuTicket: async (issue) => {
        await appel();
        return ticket(issue).corps;
      },
      prsOuvertes: async () => {
        await appel();
        return this.prs.filter((p) => p.state === "open").map((p) => ({ branche: p.branche, fichiers: [] }));
      },
      checksDeLaBase: async () => {
        await appel();
        return [{ outcome: "green" as const }];
      },
      etatDuRun: async () => ({ tentative: 1, termine: true }),
      relancerLesEchecs: async () => {},
      commentaires: async (numero) => {
        await appel();
        return [...(this.commentaires.get(numero) ?? [])];
      },
      retraitsDeLabels: async (numero) => {
        await appel();
        return [...(this.retraits.get(numero) ?? [])];
      },
      commenter: async (numero, body) => {
        await appel();
        const createdAt = this.instant();
        this.commentaires.set(numero, [...(this.commentaires.get(numero) ?? []), { id: this.horloge, body, association: "OWNER", createdAt }]);
      },
      labelliser: async (numero, labels) => {
        await appel();
        for (const label of labels) ticket(numero).labels.add(label);
      },
      delabelliser: async (numero, label) => {
        await appel();
        if (ticket(numero).labels.delete(label)) this.retraits.set(numero, [...(this.retraits.get(numero) ?? []), { label, createdAt: this.instant() }]);
      },
      ouvrirPR: async ({ branche, corps }) => {
        await appel();
        const number = 1000 + this.prs.length;
        this.prs.push({ number, issue: Number(/Closes #(\d+)/.exec(corps)?.[1]), branche, sha: this.instant(), state: "open", merged: false, corps });
        return `https://github.com/${DEPOT}/pull/${number}`;
      },
      ci: async () => [],
      mettreAJour: async () => {},
      merger: async () => ({ fait: false, motif: "not in this test" }),
    };
  }

  // La station qui tient le ticket, lue sur l'issue comme toute station la lit.
  async tenant(numero: number): Promise<string | null> {
    return (await lireTenant(numero, this.client()))?.station ?? null;
  }
}

// Le journal du projet de la principale, et un runtime qui tourne dessus, ses garde-fous posés.
function journalDuProjet(repertoire: string): void {
  const journal = ouvrirJournal(repertoire);
  try {
    journal.ajouter({ project: "shop", ticket: null, author: "runtime", type: "runtime.started", payload: { pid: 1, host: "box", node: "v26" } });
    journal.ajouter({ project: "shop", ticket: null, author: "runtime", type: "guard.configured", payload: { limits: PLAFONDS, breakerThreshold: 3 } });
  } finally {
    journal.fermer();
  }
}

// Les réponses que la principale a écrites au journal, dans l'ordre.
function reponsesAuJournal(repertoire: string): Array<{ id: string; station: string } & Reponse> {
  const journal = ouvrirJournal(repertoire, { lectureSeule: true });
  try {
    return journal.tout().flatMap((e) => (e.type === "remote.answered" ? [e.payload] : []));
  } finally {
    journal.fermer();
  }
}

test("deux stations sur l'état GitHub seul : la principale prend pour son cook, la seconde par sa réclamation — chacune ses tickets, aucun pris deux fois", async (t) => {
  const faux = new FauxGitHub();
  for (const numero of [1, 2, 3]) faux.feu(numero);
  const repertoire = repertoireTemporaire(t);
  journalDuProjet(repertoire);
  const gistmac: Fichiers = {};

  // La principale : son tour, dont le cook tient sa place jusqu'à la fin du test.
  let finir = () => {};
  const tenu = new Promise<void>((resoudre) => (finir = resoudre));
  const github = faux.client();
  const box = stationGitHub({
    nom: BOX,
    places: 1,
    base: "main",
    github,
    prise: priseDeLaStation(github, BOX),
    cuisiner: async (ticket) => {
      await tenu;
      return { branche: brancheDuTicket(ticket.number) };
    },
    juger: async () => ({ verdict: "approve", motif: "" }),
    avertir: (texte) => assert.fail(texte),
  });
  aArreter(t, async () => {
    finir();
    await box.calme();
  });
  // La seconde : ce qu'elle réclame par son gist, et la réponse de la principale.
  const reclamer = async () => {
    const id = unId();
    Object.assign(gistmac, poserLaDemande({ id, depot: DEPOT, le: new Date().toISOString(), demande: { verb: "claim", sandbox: DISPONIBLE } }));
    const { repondues, panne } = await repondreSurGitHubSeul({ repertoireEtat: repertoire, depot: DEPOT, base: "main", secondaires: [{ station: MAC, gist: "gistmac" }], lire: async () => ({ ...gistmac }), github: faux.client(), hotes: () => reglesDuProjet([]) });
    assert.equal(panne, null);
    assert.equal(repondues.length, 1);
    const reponse = reponsesAuJournal(repertoire).find((lue) => lue.id === id);
    assert.ok(reponse?.ok && reponse.verb === "claim", JSON.stringify(reponse));
    return reponse.mission;
  };

  // Au même instant, chacune veut le plus ancien : l'une l'emporte, l'autre prend le suivant.
  const [, premiere] = await Promise.all([box.tour(), reclamer()]);
  const [cuitIci] = box.enCuisine();
  assert.ok(cuitIci !== undefined && premiere !== null);
  assert.notEqual(premiere.ticket, cuitIci);
  // La seconde prend encore ce qui reste ; puis il n'y a plus rien.
  const seconde = await reclamer();
  assert.ok(seconde !== null);
  assert.equal(await reclamer(), null);

  // Chaque ticket a un seul tenant, celui qui le cuit — et les trois sont pris.
  assert.deepEqual([cuitIci, premiere.ticket, seconde.ticket].sort(), [1, 2, 3]);
  assert.equal(await faux.tenant(cuitIci), BOX);
  assert.equal(await faux.tenant(premiere.ticket), MAC);
  assert.equal(await faux.tenant(seconde.ticket), MAC);
  for (const numero of [1, 2, 3]) assert.ok(faux.labels(numero).includes(LABEL_TAKEN), `#${numero}`);
  // La mission est celle d'un cook du tour, dans le bac à sable du poste du chef.
  assert.equal(premiere.branch, brancheDuTicket(premiere.ticket));
  assert.equal(premiere.run, `${premiere.ticket}-github`);
  assert.equal(premiere.sandbox, true);
  assert.ok(premiere.args.includes("--settings"), JSON.stringify(premiere.args));
  assert.deepEqual(premiere.limits, PLAFONDS);
  assert.equal(premiere.resumes, null);
});

test("la réclamation d'un poste sans bac à sable ne prend rien, et le dit", async (t) => {
  const faux = new FauxGitHub();
  faux.feu(1);
  const repertoire = repertoireTemporaire(t);
  journalDuProjet(repertoire);
  const gistmac = poserLaDemande({ id: unId(), depot: DEPOT, le: new Date().toISOString(), demande: { verb: "claim", sandbox: { available: false, reason: "not macOS" } } });
  await repondreSurGitHubSeul({ repertoireEtat: repertoire, depot: DEPOT, base: "main", secondaires: [{ station: MAC, gist: "gistmac" }], lire: async () => gistmac, github: faux.client(), hotes: () => reglesDuProjet([]) });
  const [reponse] = reponsesAuJournal(repertoire);
  assert.ok(reponse?.ok && reponse.verb === "claim");
  assert.equal(reponse.mission, null);
  assert.match(reponse.held ?? "", /no ticket without the Claude Code sandbox on its workstation — not macOS/);
  assert.equal(await faux.tenant(1), null);
});

test("la réclamation d'une station ne prend rien quand 5 livraisons sont en pass, et prend à 4 (PASS_MAX, #2300)", async (t) => {
  const faux = new FauxGitHub();
  for (let n = 1; n <= 5; n += 1) faux.feu(n, [...CALIBRE, "in-pass"]);
  faux.feu(10);
  const repertoire = repertoireTemporaire(t);
  journalDuProjet(repertoire);
  const demander = async () => {
    const gist = poserLaDemande({ id: unId(), depot: DEPOT, le: new Date().toISOString(), demande: { verb: "claim", sandbox: DISPONIBLE } });
    await repondreSurGitHubSeul({ repertoireEtat: repertoire, depot: DEPOT, base: "main", secondaires: [{ station: MAC, gist: "gistmac" }], lire: async () => gist, github: faux.client(), hotes: () => reglesDuProjet([]) });
    return reponsesAuJournal(repertoire).at(-1);
  };
  const pleine = await demander();
  assert.ok(pleine?.ok && pleine.verb === "claim");
  assert.equal(pleine.mission, null);
  assert.equal(await faux.tenant(10), null);
  faux.tickets.get(5)!.labels.delete("in-pass");
  const sous = await demander();
  assert.ok(sous?.ok && sous.verb === "claim");
  assert.equal(sous.mission?.ticket, 5);
});

test("le chef retire `taken` : le bail du cook de la seconde est refusé, son cook s'arrête ; un cook sans livraison rend le ticket sur l'issue", async (t) => {
  const faux = new FauxGitHub();
  for (const numero of [1, 2]) faux.feu(numero);
  const repertoire = repertoireTemporaire(t);
  journalDuProjet(repertoire);
  let gistmac: Fichiers = {};
  const repondre = async (demande: Parameters<typeof poserLaDemande>[0]["demande"]) => {
    const id = unId();
    gistmac = poserLaDemande({ id, depot: DEPOT, le: new Date().toISOString(), demande });
    await repondreSurGitHubSeul({ repertoireEtat: repertoire, depot: DEPOT, base: "main", secondaires: [{ station: MAC, gist: "gistmac" }], lire: async () => gistmac, github: faux.client(), hotes: () => reglesDuProjet([]) });
    return reponsesAuJournal(repertoire).find((lue) => lue.id === id);
  };
  const premiere = await repondre({ verb: "claim", sandbox: DISPONIBLE });
  assert.ok(premiere?.ok && premiere.verb === "claim" && premiere.mission?.ticket === 1);
  const renouvele = await repondre({ verb: "renew", run: "1-github", proof: "abc", turns: 1, tokens: 10 });
  assert.equal(renouvele?.ok, true);

  faux.retirer(1, LABEL_TAKEN);
  const refuse = await repondre({ verb: "renew", run: "1-github", proof: "abd", turns: 2, tokens: 20 });
  assert.ok(refuse !== undefined && !refuse.ok);
  assert.equal(refuse.refusal, "stopped");
  assert.equal(refuse.stop, "stop");

  const seconde = await repondre({ verb: "claim", sandbox: DISPONIBLE });
  assert.ok(seconde?.ok && seconde.verb === "claim");
  // #1 est libre de nouveau ; c'est lui qu'elle reprend, le plus ancien.
  assert.equal(seconde.mission?.ticket, 1);
  const rendu = await repondre({ verb: "deliver", run: "1-github", ending: "failed", reason: "guard:idle", message: null, turns: 3, tokens: 30 });
  assert.ok(rendu?.ok && rendu.verb === "deliver");
  assert.equal(rendu.ending, "failed");
  assert.equal(await faux.tenant(1), null);
  assert.ok(!faux.labels(1).includes(LABEL_TAKEN));
  assert.ok((faux.commentaires.get(1) ?? []).some((c) => c.body.includes(`Station \`${MAC}\`: the cook stopped without a delivery — guard:idle`)));
  assert.equal(faux.prs.length, 0);
});

// Le Kitchen board, doublé : les issues que le tableau écrit et que la station lit.
function fauxTableau(): ClientDuTableau {
  const issues = new Map<number, IssueDuTableau>();
  return {
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
}

// La principale, telle que la station la tient (`projets/tenir.ts`) : le
// projet que l'app lui demande, que l'ordinateur du chef a rejoint.
// `allume` : l'interrupteur, dit tel quel ; `depot`, lu dans son clone — un vrai
// clone git, dont la branche d'intégration porte ou non `githubOnlyState`.
function principale(t: TestContext, faux: FauxGitHub, gistmac: Fichiers, allume: boolean | { depot: boolean }) {
  const racine = repertoireTemporaire(t);
  if (typeof allume === "object") projetSurGit(t, { reglages: { integrationBranch: "main", ...(allume.depot ? { githubOnlyState: true } : {}) }, parDefaut: "main", clone: join(racine, "clones", "shop") });
  writeFileSync(join(racine, FICHIER_LOCAL), JSON.stringify({ gist: "gistbox", appairee: true, code: null, expireLe: null, echus: [] }));
  const gistbox: Fichiers = {};
  const canal: Canal = {
    creer: async () => assert.fail("la principale ne crée aucun gist"),
    async ecrire(id, ecrits) {
      assert.equal(id, "gistbox");
      Object.assign(gistbox, ecrits);
      return "ecrit";
    },
    lire: async (id) => (id === "gistbox" ? { ...gistbox } : id === "gistmac" ? { ...gistmac } : null),
  };
  const configuration = () => (existsSync(join(racine, "projets")) ? readFileSync(join(racine, "projets"), "utf8") : "");
  const servis = () => (configuration().includes("shop acme/shop") ? ["shop"] : []);
  const lignes: string[] = [];
  const projets = tenirProjetsDeLApp({
    racine,
    canal,
    station: "box",
    env: {},
    servis: { projets: servis, depots: (): Record<string, string> => (servis().length === 0 ? {} : { shop: DEPOT }), refus: () => null },
    apresEcriture: () => {},
    dire: (ligne) => lignes.push(ligne),
    cadenceMs: 3_600_000,
    autoriser: async () => ({ autorisee: true }),
    cloner: async (_depot, clone) => void mkdirSync(join(clone, ".git"), { recursive: true }),
    verifierAcces: async () => ({ etat: "libre" as const }),
    ouvrirLaPreparation: async () => ({ ticket: 7, ouvert: false }),
    lireLesAppairees: async () => lectureDesAppairees(Date.now(), { id: "gistbox", nom: "box", sert: { shop: DEPOT } }, { id: "gistmac", nom: "mac", fichiers: gistmac }),
    cadenceDesAppareesMs: 0,
    ...(typeof allume === "object" ? {} : { surGitHubSeul: () => (allume ? { base: "main", hotes: () => reglesDuProjet([]) } : null) }),
    githubDuTour: () => ({ github: faux.client(), fermer: () => {} }),
  });
  aArreter(t, () => projets.arreter());
  gistbox[FICHIER_PROJETS] = JSON.stringify({ brigade: "projets", format: 1, projets: [{ nom: "shop", depot: DEPOT, base: "main", principale: true, cooks: 2, manager: { modele: "sonnet", effort: "medium" }, reviewer: { modele: "opus", effort: "high" }, ouvertLe: "2026-11-04T12:00:00.000Z", demandeLe: "2026-11-04T12:01:00.000Z" }] });
  return { racine, projets, lignes, etat: join(racine, "etat", "shop") };
}

// Ce que l'ordinateur du chef publie de la cuisine qu'il a rejointe (`rejoindre.ts`).
const rejointe = (): Fichiers => ({ [FICHIER_REJOINTES]: documentDesRejointes([{ nom: "shop", depot: DEPOT, principale: "box", cooks: 1, fournit: ["code", "macos"] }]) });

// Un cook doublé qui conclut tout de suite : son flux dit `done`.
const cookQuiConclut = (_mission: Mission, _worktree: string, flux: string): Supervise => {
  writeFileSync(flux, `${JSON.stringify({ type: "result", is_error: false, result: "done" })}\n`);
  return { pid: undefined, mesure: () => ({ turns: 1, tokens: 10 }), arreter: () => {}, abandonner: () => {}, fin: Promise.resolve({ code: 0, signal: null, turns: 1, tokens: 10, durationMs: 1, arret: null, erreur: null }) };
};

test("la seconde station cuit un ticket pour la principale par `cuisinerPourLaPrincipale`, sur l'état GitHub seul : prise à son nom sur l'issue, cook lancé chez elle, branche poussée, PR ouverte et en pass", async (t) => {
  const faux = new FauxGitHub();
  faux.feu(5);
  const gistmac = rejointe();
  const box = principale(t, faux, gistmac, true);
  await box.projets.relire();
  assert.ok(existsSync(box.etat));
  journalDuProjet(box.etat);

  // La principale : ses lectures, et le tableau qu'elle publie de son journal.
  const tableau = fauxTableau();
  const journal = ouvrirJournal(box.etat, { lectureSeule: true });
  aArreter(t, () => journal.fermer());
  const publication = publierLeTableau({ client: tableau, depot: DEPOT, lire: (lu) => tableauDuJournal(journal, "shop", lu, { depot: DEPOT }), dire: () => {} });
  let tourne = true;
  const lectures = (async () => {
    while (tourne) {
      await box.projets.relire();
      await publication.rafraichir(new Date());
      await new Promise((resoudre) => setTimeout(resoudre, 5));
    }
  })();

  // L'ordinateur du chef : sa boucle, telle que la station l'ouvre pour la cuisine rejointe.
  const worktrees = repertoireTemporaire(t);
  const poussees: string[] = [];
  const missions: Mission[] = [];
  const mac = cuisinerPourLaPrincipale({
    station: MAC,
    depot: DEPOT,
    gist: "gistmac",
    canal: {
      async ecrire(_id, fichiers) {
        Object.assign(gistmac, fichiers);
        return "ecrit";
      },
    },
    lireLeTableau: lecteurDuTableau(tableau),
    cooks: 1,
    clone: join(worktrees, "clone"),
    worktrees,
    claude: "claude-jamais-lance",
    env: process.env,
    gh: "gh-jamais-lance",
    bacASable: () => DISPONIBLE,
    dire: () => {},
    pasMs: 5,
    attenteMs: 1_500,
    entreDeuxReclamationsMs: 10,
    cook: {
      preparer: async (mission, worktree) => {
        missions.push(mission);
        mkdirSync(worktree, { recursive: true });
      },
      lancer: cookQuiConclut,
      pousser: async (_worktree, branche) => void poussees.push(branche),
      ranger: async (worktree) => rmSync(worktree, { recursive: true, force: true }),
    },
  });
  try {
    await jusqua(() => mac.issues().length > 0, 1_800);
  } finally {
    await mac.arreter();
    tourne = false;
    await lectures;
  }

  // Elle l'a réclamé, la principale le lui a pris sur l'issue, à son nom.
  assert.equal(missions[0]?.ticket, 5);
  assert.equal(missions[0]?.branch, "cook/5-github");
  assert.ok((faux.commentaires.get(5) ?? []).some((c) => c.body.startsWith(`<!-- brigade:prise station=${MAC} -->`)));
  // Son cook a conclu chez elle ; elle a poussé sa branche et l'a rendue — la principale a reçu la livraison.
  assert.deepEqual(poussees, ["cook/5-github"]);
  assert.deepEqual(mac.issues(), [{ rendue: { ok: true, verb: "deliver", ending: "done", reason: null } }]);
  // Sa PR est ouverte, et le ticket est en pass : n'importe quelle station la relit et la merge.
  assert.deepEqual(faux.prs.map((pr) => [pr.issue, pr.branche, pr.state]), [[5, "cook/5-github", "open"]]);
  assert.match(faux.prs[0]!.corps, /Cooked by station `mac\/claude`/);
  assert.deepEqual(faux.labels(5), ["effort:medium", "fire", LABEL_IN_PASS, "model:sonnet"]);
  // Le service le dit.
  assert.ok(box.lignes.includes("brigade : station — shop : mac/claude demande par GitHub (claim), répondu sur l'état GitHub seul : prend #5, sa prise est sur l'issue"), box.lignes.join("\n"));
  assert.ok(box.lignes.includes("brigade : station — shop : mac/claude demande par GitHub (deliver), répondu sur l'état GitHub seul : #5 livré, sa PR est en pass"), box.lignes.join("\n"));
});

test("interrupteur éteint : ce que la seconde réclame est relayé au journal du projet comme avant, et GitHub n'est pas touché", async (t) => {
  const faux = new FauxGitHub();
  faux.feu(5);
  const gistmac = rejointe();
  const box = principale(t, faux, gistmac, false);
  await box.projets.relire();
  journalDuProjet(box.etat);
  const id = unId();
  Object.assign(gistmac, poserLaDemande({ id, depot: DEPOT, le: new Date().toISOString(), demande: { verb: "claim", sandbox: DISPONIBLE } }));
  await box.projets.relire();
  await box.projets.relire();

  const journal = ouvrirJournal(box.etat, { lectureSeule: true });
  try {
    assert.deepEqual(
      journal.tout().filter((e) => e.type === "remote.asked").map((e) => [e.author, e.payload.id, e.payload.verb, e.payload.via]),
      [[`station:${MAC}`, id, "claim", "github"]],
    );
    // C'est le runtime du projet qui répond, pas la station.
    assert.equal(journal.tout().filter((e) => e.type === "remote.answered").length, 0);
  } finally {
    journal.fermer();
  }
  assert.equal(faux.appels, 0);
  assert.equal(await faux.tenant(5), null);
  assert.ok(box.lignes.includes("brigade : station — shop : mac/claude demande par GitHub (claim), relayé au journal du projet"), box.lignes.join("\n"));
});

test("l'interrupteur se lit sur la branche d'intégration du clone du projet : allumé, la principale répond par GitHub ; absent, elle relaie au journal", async (t) => {
  for (const depot of [true, false]) {
    const faux = new FauxGitHub();
    faux.feu(5);
    const gistmac = rejointe();
    const box = principale(t, faux, gistmac, { depot });
    await box.projets.relire();
    journalDuProjet(box.etat);
    Object.assign(gistmac, poserLaDemande({ id: unId(), depot: DEPOT, le: new Date().toISOString(), demande: { verb: "claim", sandbox: DISPONIBLE } }));
    await box.projets.relire();
    const reponses = reponsesAuJournal(box.etat);
    if (depot) {
      assert.ok(reponses[0]?.ok && reponses[0].verb === "claim" && reponses[0].mission?.ticket === 5, JSON.stringify(reponses));
      assert.equal(await faux.tenant(5), MAC);
    } else {
      assert.deepEqual(reponses, []);
      assert.equal(faux.appels, 0);
    }
  }
});

test("sur-github-seul.test.ts ne laisse rien dans le répertoire temporaire", rienNeReste);
