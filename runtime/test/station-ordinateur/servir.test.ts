// La station d'un ordinateur sert les projets de sa liste sur GitHub seul
// (`station-ordinateur/servir.ts`, #2357) : liste vide, rien n'est cloné ni
// tourné ; un projet de la liste est cloné dans ses lieux, et le tour GitHub
// seul de la box le sert sous son nom — sans le relais de prise, ni journal.
//
// Le tour est le vrai (`brigade-github.ts`), sur un vrai dépôt git : seuls le
// client GitHub et le lancement de `claude` sont faux.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { test } from "node:test";
import type { Lancer, StationGitHub } from "../../src/brigade-github.ts";
import type { GitHub } from "../../src/github.ts";
import { lieuxDuProjet } from "../../src/station/configuration.ts";
import { ajouterProjetServi, retirerProjetServi } from "../../src/station-ordinateur/projets-servis.ts";
import { ouvrirLeService, servirLesProjetsChoisis, type OptionsDuService, type ProjetAServir, type TourDuProjet } from "../../src/station-ordinateur/servir.ts";
import { commiter, depotGit, ENV_GIT, git, jusqua, repertoireTemporaire } from "../outils.ts";

const STATION = "mac/claude";
const CALIBRE = ["fire", "model:sonnet", "effort:medium"];

// Un faux GitHub, réduit à ce que le tour GitHub seul appelle : ses tickets,
// leurs commentaires et leurs labels, et les PR ouvertes.
class FauxGitHub {
  labels = new Map<number, Set<string>>();
  commentaires = new Map<number, Array<{ body: string; createdAt: string }>>();
  prs: Array<{ number: number; branche: string; base: string; titre: string; corps: string }> = [];
  private horloge = Date.parse("2026-11-05T10:00:00Z");

  feu(numero: number): void {
    this.labels.set(numero, new Set(CALIBRE));
  }

  client(): GitHub {
    const issue = (numero: number) => ({ number: numero, title: `ticket ${numero}`, labels: [...(this.labels.get(numero) ?? [])], state: "open" as const, createdAt: "", updatedAt: "", url: "" });
    const client: Partial<GitHub> = {
      tickets: async () => ({ inchange: false, issues: [...this.labels.keys()].filter((n) => this.labels.get(n)?.has("fire")).map(issue), confirmer: () => {} }),
      issue: async (numero) => ({ ...issue(numero), body: "" }),
      commentaires: async (numero) => (this.commentaires.get(numero) ?? []).map(({ body, createdAt }) => ({ body, author: "brigade", association: "OWNER", createdAt })),
      commenter: async (numero, body) => {
        this.horloge += 1000;
        this.commentaires.set(numero, [...(this.commentaires.get(numero) ?? []), { body, createdAt: new Date(this.horloge).toISOString() }]);
      },
      retraitsDeLabels: async () => [],
      labelliser: async (numero, labels) => {
        for (const label of labels) this.labels.get(numero)?.add(label);
      },
      delabelliser: async (numero, label) => {
        this.labels.get(numero)?.delete(label);
      },
      ci: async () => [{ name: "tests", conclusion: "success", outcome: "green", url: null }] as never,
      prDeBranche: async (branche) => {
        const pr = this.prs.findLast((p) => p.branche === branche);
        return pr === undefined ? null : { number: pr.number, url: "", base: pr.base, sha: "a".repeat(40), state: "open", merged: false, enRetard: false, mergeePar: null };
      },
      prsOuvertes: async () => this.prs.map(({ number, branche }) => ({ number, branche, fichiers: [] })),
      ouvrirPR: async (pr) => {
        const number = 100 + this.prs.length;
        this.prs.push({ number, ...pr });
        return `https://github.com/acme/shop/pull/${number}`;
      },
      mettreAJour: async () => {},
      merger: async () => ({ fait: true }),
      teteDeLaBase: async () => "b".repeat(40),
      issuesDepuis: async () => [],
    };
    return client as GitHub;
  }
}

// Le cook : il commite dans son worktree, et conclut.
const cookQuiLivre: Lancer = ({ cwd, flux }) => {
  commiter(cwd, "livraison.txt");
  writeFileSync(flux, `${JSON.stringify({ type: "result", is_error: false, result: "done" })}\n`);
  return { fin: Promise.resolve({ code: 0, signal: null, turns: 1, tokens: 1, durationMs: 1, arret: null, erreur: null }) };
};

// Les fichiers sous un répertoire, relatifs à lui.
const fichiersSous = (racine: string): string[] => (existsSync(racine) ? (readdirSync(racine, { recursive: true, encoding: "utf8" }) as string[]).map((chemin) => relative(racine, join(racine, chemin))) : []);

function options(racine: string, plus: Partial<OptionsDuService> = {}): OptionsDuService & { dits: string[] } {
  const dits: string[] = [];
  return { racine, station: STATION, env: ENV_GIT, maison: racine, gh: "gh-absent", claude: "claude-absent", dire: (ligne) => dits.push(ligne), dits, ...plus };
}

// Un tour qui ne fait que compter ses tours.
function tourCompte(): { tours: string[]; ouvrir: (projet: ProjetAServir) => Pick<StationGitHub, "tour" | "enCuisine" | "calme"> } {
  const tours: string[] = [];
  return {
    tours,
    ouvrir: (projet) => ({ tour: async () => void tours.push(projet.depot), enCuisine: () => [], calme: async () => {} }),
  };
}

test("an empty list (a fresh install): nothing is cloned, no turn runs, and the log says it serves none", async (t) => {
  const racine = repertoireTemporaire(t);
  const clones: string[] = [];
  const { tours, ouvrir } = tourCompte();
  const o = options(racine, { cloner: async ({ depot }) => void clones.push(depot), ouvrirLeTour: ouvrir });
  const service = ouvrirLeService(o);
  await service.tourner();
  await service.tourner();
  assert.deepEqual(clones, []);
  assert.deepEqual(tours, []);
  assert.deepEqual(service.servis(), []);
  assert.deepEqual(o.dits, [`brigade : station ${STATION} — no project is chosen for this station: it serves none`]);
  await service.arreter();
});

test("one project in the list is cloned into the station's own places, and a GitHub-only turn takes, cooks and delivers its ticket under the station's name", async (t) => {
  const racine = repertoireTemporaire(t);
  const { origine } = depotGit(t);
  const faux = new FauxGitHub();
  faux.feu(7);
  ajouterProjetServi(racine, "acme/shop");
  const clones: string[] = [];
  const o = options(racine, {
    // Le clone de la station, depuis l'origine locale qui tient lieu de GitHub.
    cloner: async ({ depot, clone }) => {
      clones.push(depot);
      mkdirSync(dirname(clone), { recursive: true });
      git(dirname(clone), "clone", "-q", origine, clone);
    },
    github: () => faux.client(),
    lancer: cookQuiLivre,
  });
  const service = ouvrirLeService(o);
  t.after(() => service.arreter());
  await service.tourner();
  assert.deepEqual(service.servis(), ["acme/shop"]);
  await jusqua(() => faux.prs.length > 0 && service.enCuisine().length === 0);

  const { clone } = lieuxDuProjet(racine, "shop", racine);
  assert.deepEqual(clones, ["acme/shop"]);
  assert.ok(existsSync(join(clone, ".git")), "the project is cloned into the station's own places");
  // La prise est au nom de la station, sur l'issue ; sa livraison est poussée et sa PR ouverte, le ticket en pass.
  assert.match(faux.commentaires.get(7)?.[0]?.body ?? "", /^<!-- brigade:prise station=mac\/claude -->/);
  assert.equal(git(origine, "rev-parse", "--verify", "refs/heads/cook/7-github").length, 40);
  assert.deepEqual(
    faux.prs.map(({ branche, base, corps }) => ({ branche, base, corps })),
    [{ branche: "cook/7-github", base: "v2", corps: "Closes #7\n\nCooked by station `mac/claude`." }],
  );
  assert.deepEqual([...(faux.labels.get(7) ?? [])].sort(), [...CALIBRE, "in-pass"].sort());
  // Le journal de service dit le tour sous le nom de la station, et d'aucune autre.
  const dits = o.dits.join("\n");
  assert.match(dits, /^brigade : station mac\/claude — serves acme\/shop from GitHub only, under its own name/m);
  assert.match(dits, /^brigade : station mac\/claude — GitHub-only turn on acme\/shop: /m);
  assert.deepEqual(o.dits.filter((ligne) => !ligne.startsWith(`brigade : station ${STATION} — `)), []);
  // Aucun journal de projet n'est ouvert sous la station : ni `log.db`, ni verrou.
  assert.deepEqual(fichiersSous(racine).filter((fichier) => /(^|\/)(log|lock)\.db/.test(fichier)), []);
});

test("a project added then removed through the list starts then stops being served on the next turn, and the list survives a restart", async (t) => {
  const racine = repertoireTemporaire(t);
  const { tours, ouvrir } = tourCompte();
  const o = options(racine, { cloner: async ({ clone }) => void mkdirSync(join(clone, ".git"), { recursive: true }), ouvrirLeTour: ouvrir });
  // Sans branche lue sur le clone, aucun tour ne s'ouvre : celle du faux clone est posée.
  const sansBase = ouvrirLeService(o);
  ajouterProjetServi(racine, "acme/shop");
  await sansBase.tourner();
  assert.deepEqual(tours, []);
  assert.match(o.dits.join("\n"), /acme\/shop is not served this turn, it is tried again at the next — its integration branch cannot be read/);
  await sansBase.arreter();

  const { clone } = lieuxDuProjet(racine, "shop", racine);
  writeFileSync(join(clone, "CLAUDE.md"), "- **Branche d'intégration** : `main`\n");
  const service = ouvrirLeService(o);
  await service.tourner();
  assert.deepEqual(tours, ["acme/shop"]);
  retirerProjetServi(racine, "acme/shop");
  await service.tourner();
  assert.deepEqual(tours, ["acme/shop"]);
  assert.deepEqual(service.servis(), []);
  assert.match(o.dits.join("\n"), /acme\/shop left this station's served projects: it takes no more of its tickets/);
  ajouterProjetServi(racine, "acme/shop");
  await service.arreter();

  // Redémarrée, la station relit la liste du disque : le projet est servi au premier tour.
  const redemarree = ouvrirLeService(o);
  await redemarree.tourner();
  assert.deepEqual(tours, ["acme/shop", "acme/shop"]);
  await redemarree.arreter();
});

test("a project this station's kitchen already serves is not served a second time from GitHub only", async (t) => {
  const racine = repertoireTemporaire(t);
  const { tours, ouvrir } = tourCompte();
  ajouterProjetServi(racine, "acme/shop");
  const o = options(racine, { cloner: async () => assert.fail("no clone"), ouvrirLeTour: ouvrir, dejaServis: () => ["Acme/Shop"] });
  const service = ouvrirLeService(o);
  await service.tourner();
  assert.deepEqual(tours, []);
  assert.match(o.dits.join("\n"), /acme\/shop is already served by this station's kitchen of the project/);
  await service.arreter();
});

test("the loop runs a turn at once, then one per interval, until it stops", async (t) => {
  const racine = repertoireTemporaire(t);
  const { tours, ouvrir } = tourCompte();
  ajouterProjetServi(racine, "acme/shop");
  const { clone } = lieuxDuProjet(racine, "shop", racine);
  mkdirSync(join(clone, ".git"), { recursive: true });
  writeFileSync(join(clone, "CLAUDE.md"), "- **Branche d'intégration** : `main`\n");
  // Sur une minuterie simulée : chaque intervalle passe sans être attendu (#2464).
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const intervalles = async (n: number, jusquA = () => false) => {
    for (let i = 0; i < n && !jusquA(); i++) {
      t.mock.timers.tick(5);
      await new Promise((suite) => setImmediate(suite));
    }
  };
  const service = servirLesProjetsChoisis(options(racine, { ouvrirLeTour: ouvrir, intervalleMs: 5 }));
  t.after(() => service.arreter());
  await intervalles(1000, () => tours.length >= 3);
  assert.ok(tours.length >= 3, `${tours.length}`);
  await service.arreter();
  const arretee = tours.length;
  await intervalles(10);
  assert.equal(tours.length, arretee);
});

// Le délai entre l'instant où un ticket devient prenable et sa prise (#2832) :
// un cook rendu, une livraison ou un merge libère une place, une zone ou une
// dépendance, et le tour du projet le dit par `presser(true)` (#2802). Sur la
// station de l'ordinateur, la boucle ne tenait que les 30 s de #2333 : chaque
// ticket ainsi libéré attendait sa prise 30 s, ou la fin du tour en cours puis
// 30 s. La prise vient au tour qui suit le fait, tout de suite.
test("the loop: a fact that makes a ticket claimable brings its claim at once, not 30 s later, between turns or during one (#2832)", async (t) => {
  const racine = repertoireTemporaire(t);
  ajouterProjetServi(racine, "acme/shop");
  const { clone } = lieuxDuProjet(racine, "shop", racine);
  mkdirSync(join(clone, ".git"), { recursive: true });
  writeFileSync(join(clone, "CLAUDE.md"), "- **Branche d'intégration** : `main`\n");
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  // Le tour du projet : il prend le ticket prenable à cet instant, et note sa prise.
  let prenable: number | null = null;
  let tours = 0;
  const prises: number[] = [];
  let tenir: Promise<void> = Promise.resolve();
  const tour: TourDuProjet = {
    // Le rail se lit au début du tour : un fait pendant lui est au tour suivant.
    tour: async () => {
      tours += 1;
      const lu = prenable;
      await tenir;
      if (lu === null) return;
      prises.push(Date.now() - lu);
      prenable = null;
    },
    enCuisine: () => [],
    calme: async () => {},
  };
  const fini = async () => {
    for (let i = 0; i < 20; i++) await new Promise((suite) => setImmediate(suite));
  };
  // L'horloge avance d'une seconde à la fois, jusqu'à ce que `fait` soit vrai — deux intervalles au plus.
  const jusquA = async (fait: () => boolean) => {
    await fini();
    t.mock.timers.tick(0);
    await fini();
    for (let s = 0; s < 240 && !fait(); s++) {
      t.mock.timers.tick(1000);
      await fini();
    }
  };
  const service = servirLesProjetsChoisis(options(racine, { ouvrirLeTour: () => tour }));
  t.after(() => service.arreter());
  await jusquA(() => tours === 1);
  assert.ok(tour.presser !== undefined, "the loop lets the project's turn press it");

  // Entre deux tours : le cook de 10 s rend son ticket, sa place est libre.
  t.mock.timers.tick(10_000);
  prenable = Date.now();
  tour.presser(true);
  await jusquA(() => prises.length === 1);
  // Pendant un tour : un merge à son milieu libère la place, le tour finit 5 s
  // plus tard ; le ticket se prend au tour qui suit aussitôt — ces 5 s, pas 35.
  let finirLeTour = () => {};
  tenir = new Promise((suite) => (finirLeTour = suite));
  const avant = tours;
  await jusquA(() => tours > avant);
  prenable = Date.now();
  tour.presser(true);
  t.mock.timers.tick(5_000);
  tenir = Promise.resolve();
  finirLeTour();
  await jusquA(() => prises.length === 2);
  assert.deepEqual(
    prises.map((ms) => ms / 1000),
    [0, 5],
    "seconds between a ticket becoming claimable and its claim",
  );
});

test("the station's own GitHub-only path never goes through the claim relay: no module of it imports the relay, the mailbox or a project log", () => {
  const src = join(import.meta.dirname, "../../src/station-ordinateur");
  for (const fichier of readdirSync(src).filter((nom) => nom.endsWith(".ts"))) {
    const imports = [...readFileSync(join(src, fichier), "utf8").matchAll(/^import .* from "([^"]+)";$/gm)].map(([, module]) => module ?? "");
    assert.deepEqual(
      imports.filter((module) => /tirer-par-github|relais|relayer|distantes|appairage|tableau|journal|porte-journal|alimenter/.test(module)),
      [],
      fichier,
    );
  }
  // Et le tour qu'il fait tourner est celui de la box.
  assert.match(readFileSync(join(src, "servir.ts"), "utf8"), /from "\.\.\/brigade-github\.ts"/);
});
