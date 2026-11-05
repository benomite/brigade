// Un ticket est cuisiné une seule fois quand l'ordinateur et la box servent le
// même projet (#2360, épique #2356) : la prise de #2056 donne le ticket à la
// station dont la prise est la plus ancienne, l'autre ne prend rien.
//
// Les deux stations sont les vraies — celle de l'ordinateur (`servir.ts`) et
// celle de la box (`stationDuDepot`, `brigade-github.ts`) — sur un même faux
// GitHub, chacune sur son propre clone d'un vrai dépôt git. Seuls le client
// GitHub et le lancement de `claude` sont faux. La station qui arrive seconde
// lit le ticket libre, puis ne peut poster sa prise qu'une fois celle de la
// première postée : c'est la course que la prise doit trancher.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test, type TestContext } from "node:test";
import { priseDeLaStation, stationDuDepot, type Lancer, type StationGitHub } from "../src/brigade-github.ts";
import { ouvrirDepot } from "../src/depot.ts";
import { tenant } from "../src/github-etat/prise.ts";
import type { GitHub } from "../src/github.ts";
import { ajouterProjetServi } from "../src/station-ordinateur/projets-servis.ts";
import { ouvrirLeService } from "../src/station-ordinateur/servir.ts";
import { commiter, depotGit, ENV_GIT, git, jusqua, repertoireTemporaire } from "./outils.ts";

const ORDINATEUR = "mac/claude";
const BOX = "box/claude";
const CALIBRE = ["fire", "model:sonnet", "effort:medium"];
const TICKET = 7;

type Commentaire = { id: number; body: string; createdAt: string; station: string };

// Un faux GitHub partagé par les deux stations, réduit à ce que le tour GitHub
// seul appelle. Chaque commentaire est daté par l'ordre où il arrive, et porte
// un id croissant, comme chez GitHub. Un poste de commentaire peut être retenu
// jusqu'à ce qu'une autre station ait posté sa prise.
class FauxGitHub {
  labels = new Set(CALIBRE);
  commentaires: Commentaire[] = [];
  prs: Array<{ number: number; branche: string; base: string; titre: string; corps: string }> = [];
  private horloge = 0;
  private retenus = new Map<string, { attendu: string; pret: Promise<void>; lever: () => void }>();

  // `station` ne poste rien avant que `attendue` ait posté sa prise.
  retenir(station: string, attendue: string): void {
    let lever = () => {};
    const pret = new Promise<void>((resoudre) => (lever = resoudre));
    this.retenus.set(station, { attendu: attendue, pret, lever });
  }

  prises(): string[] {
    return this.commentaires.filter((c) => c.body.startsWith("<!-- brigade:prise")).map((c) => c.station);
  }

  // Qui tient le ticket, lu comme le lit la prise.
  tient(): string | undefined {
    return tenant(
      this.commentaires.map(({ id, body, createdAt }) => ({ id, body, createdAt, association: "OWNER" })),
      [],
    )?.station;
  }

  client(station: string): GitHub {
    const issue = () => ({ number: TICKET, title: `ticket ${TICKET}`, labels: [...this.labels], state: "open" as const, createdAt: "", updatedAt: "", url: "" });
    const client: Partial<GitHub> = {
      tickets: async () => ({ inchange: false, issues: this.labels.has("fire") ? [issue()] : [], confirmer: () => {} }),
      issue: async () => ({ ...issue(), body: "" }),
      commentaires: async () => this.commentaires.map(({ id, body, createdAt }) => ({ id, body, author: "brigade", association: "OWNER", createdAt })),
      commenter: async (_numero, body) => {
        await this.retenus.get(station)?.pret;
        this.horloge += 1;
        this.commentaires.push({ id: this.horloge, body, createdAt: new Date(Date.UTC(2026, 10, 5) + this.horloge * 1000).toISOString(), station });
        for (const [autre, { attendu, lever }] of this.retenus) if (autre !== station && attendu === station && body.startsWith("<!-- brigade:prise")) lever();
      },
      retraitsDeLabels: async () => [],
      labelliser: async (_numero, labels) => void labels.forEach((label) => this.labels.add(label)),
      delabelliser: async (_numero, label) => void this.labels.delete(label),
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
      merger: async () => ({ fait: false, motif: "left to the pass" }),
      teteDeLaBase: async () => "b".repeat(40),
      issuesDepuis: async () => [],
    };
    return client as GitHub;
  }
}

// Les cooks lancés, par station : le cook commite dans son worktree et conclut.
function lanceur(cooks: string[], station: string): Lancer {
  return ({ cwd, flux, args }) => {
    if (!args.includes("--tools")) {
      cooks.push(station);
      commiter(cwd, "livraison.txt");
    }
    writeFileSync(flux, `${JSON.stringify({ type: "result", is_error: false, result: "done" })}\n`);
    return { fin: Promise.resolve({ code: 0, signal: null, turns: 1, tokens: 1, durationMs: 1, arret: null, erreur: null }) };
  };
}

// Une station sur ce projet : son tour, et l'attente que ses cooks aient fini.
type Station = { tour: () => Promise<void>; calme: () => Promise<void> };

function laStationDeLOrdinateur(t: TestContext, faux: FauxGitHub, cooks: string[], origine: string, dits: string[]): Station {
  const racine = repertoireTemporaire(t);
  ajouterProjetServi(racine, "acme/shop");
  const service = ouvrirLeService({
    racine,
    station: ORDINATEUR,
    env: ENV_GIT,
    maison: racine,
    gh: "gh-absent",
    claude: "claude-absent",
    dire: (ligne) => dits.push(ligne),
    cloner: async ({ clone }) => {
      mkdirSync(dirname(clone), { recursive: true });
      git(dirname(clone), "clone", "-q", origine, clone);
    },
    github: () => faux.client(ORDINATEUR),
    lancer: lanceur(cooks, ORDINATEUR),
  });
  t.after(() => service.arreter());
  return {
    tour: () => service.tourner(),
    calme: () => jusqua(() => service.enCuisine().length === 0),
  };
}

function laStationDeLaBox(t: TestContext, faux: FauxGitHub, cooks: string[], clone: string, dits: string[]): Station {
  const racine = repertoireTemporaire(t);
  const station = stationDuDepot({
    nom: BOX,
    places: 1,
    base: "v2",
    depotGitHub: "acme/shop",
    github: faux.client(BOX),
    depot: ouvrirDepot({ clone, base: "v2", worktrees: join(racine, "worktrees"), env: ENV_GIT }),
    prise: priseDeLaStation,
    claude: "claude-absent",
    env: ENV_GIT,
    cloison: null,
    plafonds: { durationMs: 60_000, tokens: 1_000, idleMs: 60_000 },
    graceMs: 1,
    reviewer: { model: "sonnet", effort: "medium" },
    flux: join(racine, "flux"),
    lancer: lanceur(cooks, BOX),
    avertir: (ligne) => dits.push(ligne),
  });
  if ("refus" in station) assert.fail(station.refus);
  const ouverte: StationGitHub = station;
  t.after(() => ouverte.calme());
  return { tour: () => ouverte.tour(), calme: () => ouverte.calme() };
}

for (const [premiere, seconde] of [
  [ORDINATEUR, BOX],
  [BOX, ORDINATEUR],
] as const) {
  test(`the computer's station and the box's both serve a project with one ticket: ${premiere} claims first, cooks it once, and ${seconde} takes nothing`, async (t) => {
    const faux = new FauxGitHub();
    const cooks: string[] = [];
    const dits: string[] = [];
    const { origine, clone } = depotGit(t);
    const stations = {
      [ORDINATEUR]: laStationDeLOrdinateur(t, faux, cooks, origine, dits),
      [BOX]: laStationDeLaBox(t, faux, cooks, clone, dits),
    };
    // La seconde lit le ticket libre, mais ne poste sa prise qu'après celle de la première.
    faux.retenir(seconde, premiere);
    await Promise.all([stations[premiere].tour(), stations[seconde].tour()]);
    await Promise.all([stations[premiere].calme(), stations[seconde].calme()]);

    // Une seule prise l'emporte : celle de la première, la plus ancienne.
    assert.equal(faux.tient(), premiere);
    assert.deepEqual(faux.prises().filter((station) => station === premiere), [premiere]);
    // Un seul cook est lancé, par la première ; la seconde ne cuisine, ne pousse ni n'ouvre rien.
    assert.deepEqual(cooks, [premiere]);
    assert.deepEqual(
      faux.prs.map(({ branche, corps }) => ({ branche, corps })),
      [{ branche: "cook/7-github", corps: `Closes #7\n\nCooked by station \`${premiere}\`.` }],
    );
    // Le ticket est en pass une fois, et la seconde n'a posté ni lâcher ni autre commentaire que sa prise perdue.
    assert.ok(faux.labels.has("in-pass"));
    assert.deepEqual(
      faux.commentaires.filter((c) => c.station === seconde).map((c) => c.body.split("\n")[0]),
      [`<!-- brigade:prise station=${seconde} -->`],
    );
    assert.deepEqual(dits.filter((ligne) => /error|erreur|failed/i.test(ligne)), []);
  });
}
