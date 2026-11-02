// Un projet servi sur l'état GitHub seul (`brigade-github.ts`, #2060) : deux
// stations égales sur un faux GitHub, l'interrupteur par projet, et ce que le
// chemin d'avant garde quand il est éteint.
//
// Les contrats de l'épique (#2056, #2057, #2058) sont ici des doublures qui
// lisent et écrivent le seul faux GitHub : la prise la plus ancienne gagne,
// l'état se lit des labels et des prises, une PR se merge approuvée et à jour.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { brancherBrigadeGithub, LABEL_EN_PASS, LABEL_PRIS, stationGitHub, surGitHubSeul, type Contrats, type EtatGitHub, type GitHubDuTour, type StationGitHub } from "../src/brigade-github.ts";
import { reglagesDuTexte, ReglageRefuse, texteDuFichier } from "../src/reglages-projet/reglages.ts";
import { jusqua } from "./outils.ts";

type Ticket = { number: number; title: string; labels: Set<string>; ouvert: boolean; prises: Array<{ station: string; rang: number }>; commentaires: string[] };
type PR = { number: number; issue: number; branche: string; approuveePar: string | null; enRetard: boolean; mergeePar: string | null };

// Le faux GitHub, partagé par les stations : chaque appel est noté sous le nom
// de la station qui le fait, et rend la main avant de répondre, pour que deux
// stations s'entrelacent comme sur le vrai.
class FauxGitHub {
  tickets = new Map<number, Ticket>();
  prs: PR[] = [];
  appels: Array<{ station: string; quoi: string }> = [];
  cuissons: Array<{ station: string; issue: number }> = [];
  private rang = 0;

  feu(number: number): void {
    this.tickets.set(number, { number, title: `ticket ${number}`, labels: new Set(["fire"]), ouvert: true, prises: [], commentaires: [] });
  }

  ticket(number: number): Ticket {
    const ticket = this.tickets.get(number);
    if (ticket === undefined) throw new Error(`#${number} inconnu`);
    return ticket;
  }

  appelsDe(station: string): number {
    return this.appels.filter((appel) => appel.station === station).length;
  }

  pour(station: string): { github: GitHubDuTour; contrats: Contrats } {
    const noter = async (quoi: string) => {
      this.appels.push({ station, quoi });
      await new Promise((suite) => setImmediate(suite));
    };
    const pr = (number: number) => {
      const trouvee = this.prs.find((p) => p.number === number);
      if (trouvee === undefined) throw new Error(`PR ${number} inconnue`);
      return trouvee;
    };
    const github: GitHubDuTour = {
      fires: async () => {
        await noter("fires");
        return [...this.tickets.values()].filter((t) => t.ouvert && t.labels.has("fire")).map((t) => ({ number: t.number, title: t.title, labels: [...t.labels] }));
      },
      prDuTicket: async (issue) => {
        await noter("prDuTicket");
        return this.prs.find((p) => p.issue === issue && p.mergeePar === null)?.number ?? null;
      },
      labelliser: async (issue, labels) => {
        await noter("labelliser");
        for (const label of labels) this.ticket(issue).labels.add(label);
      },
      delabelliser: async (issue, label) => {
        await noter("delabelliser");
        this.ticket(issue).labels.delete(label);
      },
      commenter: async (issue, corps) => {
        await noter("commenter");
        this.ticket(issue).commentaires.push(corps);
      },
      ouvrirPR: async ({ branche, corps }) => {
        await noter("ouvrirPR");
        const [, ferme] = /Closes #(\d+)/.exec(corps) ?? [];
        const number = 1000 + this.prs.length;
        this.prs.push({ number, issue: Number(ferme), branche, approuveePar: null, enRetard: true, mergeePar: null });
        return `https://github.com/faux/depot/pull/${number}`;
      },
    };
    const contrats: Contrats = {
      prendre: async (issue) => {
        await noter("prendre");
        const ticket = this.ticket(issue);
        if (!ticket.prises.some((prise) => prise.station === station)) ticket.prises.push({ station, rang: ++this.rang });
        await new Promise((suite) => setImmediate(suite));
        return [...ticket.prises].sort((a, b) => a.rang - b.rang)[0]?.station ?? null;
      },
      lacher: async (issue) => {
        await noter("lacher");
        const ticket = this.ticket(issue);
        ticket.prises = ticket.prises.filter((prise) => prise.station !== station);
      },
      etatDuTicket: async (issue): Promise<EtatGitHub | null> => {
        await noter("etatDuTicket");
        const ticket = this.ticket(issue);
        if (ticket.labels.has("waiting")) return "attente";
        if (ticket.labels.has(LABEL_EN_PASS)) return "en-pass";
        return ticket.labels.has(LABEL_PRIS) || ticket.prises.length > 0 ? "pris" : null;
      },
      relire: async (number) => {
        await noter("relire");
        pr(number).approuveePar ??= station;
      },
      fusionnable: async (number) => {
        await noter("fusionnable");
        const lue = pr(number);
        // En retard : la mise à jour est demandée, et rien ne se merge.
        if (lue.enRetard) {
          lue.enRetard = false;
          return false;
        }
        return lue.approuveePar !== null;
      },
      fusionner: async (number) => {
        await noter("fusionner");
        const lue = pr(number);
        if (lue.mergeePar !== null) return false;
        lue.mergeePar = station;
        this.ticket(lue.issue).ouvert = false;
        return true;
      },
    };
    return { github, contrats };
  }

  station(nom: string, options: { places?: number; cuisiner?: (issue: number) => Promise<{ branche: string } | { echec: string }> } = {}): StationGitHub {
    return stationGitHub({
      nom,
      places: options.places ?? 1,
      base: "main",
      ...this.pour(nom),
      cuisiner:
        options.cuisiner ??
        (async (issue) => {
          this.cuissons.push({ station: nom, issue });
          return { branche: `cook/${issue}-${nom}` };
        }),
      avertir: (texte) => assert.fail(texte),
    });
  }

  mergee(issue: number): PR | undefined {
    return this.prs.find((p) => p.issue === issue && p.mergeePar !== null);
  }
}

const ALLUME = () => ({ githubOnlyState: true });
const ANCIEN_INTERDIT = async () => assert.fail("le chemin d'avant ne doit pas être appelé");

function brancher(t: TestContext, station: StationGitHub, options: Partial<Parameters<typeof brancherBrigadeGithub>[0]> = {}) {
  const branche = brancherBrigadeGithub({ reglages: ALLUME, ancien: ANCIEN_INTERDIT, station, intervalleMs: 5, avertir: (texte) => assert.fail(texte), ...options });
  t.after(() => branche.arreter());
  return branche;
}

test("two stations claim the same ticket at once: the earliest claim cooks it, the other lets go", async () => {
  const faux = new FauxGitHub();
  faux.feu(1);
  const [a, b] = [faux.station("A"), faux.station("B")];
  await Promise.all([a.tour(), b.tour()]);
  await Promise.all([a.calme(), b.calme()]);
  const premiere = [...faux.ticket(1).prises].sort((x, y) => x.rang - y.rang)[0]?.station;
  assert.deepEqual(faux.cuissons, [{ station: premiere, issue: 1 }]);
  assert.deepEqual([...faux.ticket(1).labels].sort(), ["fire", LABEL_EN_PASS]);
  assert.equal(faux.prs.length, 1);
});

for (const [arretee, restante] of [
  ["A", "B"],
  ["B", "A"],
] as const) {
  test(`two stations on a fake GitHub: station ${arretee} stops, station ${restante} still takes, cooks and merges a ticket`, async (t) => {
    const faux = new FauxGitHub();
    faux.feu(1);
    const stations = { A: faux.station("A"), B: faux.station("B") };
    const branches = { A: brancher(t, stations.A), B: brancher(t, stations.B) };
    await jusqua(() => faux.mergee(1) !== undefined);

    await branches[arretee].arreter();
    await stations[arretee].calme();
    const avant = faux.appelsDe(arretee);

    faux.feu(2);
    await jusqua(() => faux.mergee(2) !== undefined);
    assert.deepEqual(
      faux.cuissons.filter((cuisson) => cuisson.issue === 2),
      [{ station: restante, issue: 2 }],
    );
    assert.equal(faux.mergee(2)?.mergeePar, restante);
    assert.equal(faux.mergee(2)?.approuveePar, restante);
    assert.equal(faux.ticket(2).ouvert, false);
    // L'arrêtée n'a plus rien lu ni écrit.
    assert.equal(faux.appelsDe(arretee), avant);
  });

  test(`station ${arretee} delivers a ticket and stops before it is merged: station ${restante} reviews and merges it`, async (t) => {
    const faux = new FauxGitHub();
    faux.feu(3);
    const stations = { A: faux.station("A"), B: faux.station("B") };
    // Elle prend, cuisine et livre en pass, puis ne tourne plus.
    await stations[arretee].tour();
    await stations[arretee].calme();
    assert.deepEqual([...faux.ticket(3).labels].sort(), ["fire", LABEL_EN_PASS]);
    const avant = faux.appelsDe(arretee);

    brancher(t, stations[restante]);
    await jusqua(() => faux.mergee(3) !== undefined);
    assert.equal(faux.mergee(3)?.mergeePar, restante);
    assert.equal(faux.mergee(3)?.approuveePar, restante);
    assert.deepEqual(faux.cuissons, [{ station: arretee, issue: 3 }]);
    assert.equal(faux.appelsDe(arretee), avant);
  });
}

test("a branch behind its base is updated, not merged, then merged once up to date", async () => {
  const faux = new FauxGitHub();
  faux.feu(4);
  const a = faux.station("A");
  await a.tour();
  await a.calme();
  await a.tour();
  assert.equal(faux.mergee(4), undefined, "en retard au premier passage : la mise à jour est demandée");
  assert.ok(!faux.appels.some((appel) => appel.quoi === "fusionner"));
  await a.tour();
  assert.equal(faux.mergee(4)?.mergeePar, "A");
});

test("a cook that delivers nothing gives the ticket back on the issue, which another station then takes", async () => {
  const faux = new FauxGitHub();
  faux.feu(5);
  const a = faux.station("A", { cuisiner: async () => ({ echec: "gates red" }) });
  await a.tour();
  await a.calme();
  assert.deepEqual(faux.ticket(5).prises, []);
  assert.deepEqual([...faux.ticket(5).labels], ["fire"]);
  assert.match(faux.ticket(5).commentaires.join("\n"), /Station \*\*A\*\*: the cook stopped without a delivery — gates red/);
  const b = faux.station("B");
  await b.tour();
  await b.calme();
  assert.deepEqual(faux.cuissons, [{ station: "B", issue: 5 }]);
});

test("WAITING, base red and off-kitchen tickets are neither taken nor merged", async () => {
  const faux = new FauxGitHub();
  faux.feu(6);
  faux.ticket(6).labels.add("waiting");
  faux.feu(7);
  faux.ticket(7).labels.add("hors-cuisine");
  const { github, contrats } = faux.pour("A");
  const a = stationGitHub({
    nom: "A",
    places: 2,
    base: "main",
    github,
    contrats: { ...contrats, etatDuTicket: async (issue) => (issue === 8 ? "base-rouge" : contrats.etatDuTicket(issue)) },
    cuisiner: async () => assert.fail("rien ne se cuisine"),
  });
  faux.feu(8);
  await a.tour();
  assert.deepEqual(faux.appels.filter((appel) => ["prendre", "relire", "fusionner"].includes(appel.quoi)), []);
});

test("switch off: each turn is the old path, called as is, and nothing reaches GitHub through the new one", async (t) => {
  for (const reglages of [null, {}, { githubOnlyState: false }]) {
    const faux = new FauxGitHub();
    faux.feu(1);
    const tours: unknown[][] = [];
    const ancien = async (...args: unknown[]) => {
      tours.push(args);
    };
    const branche = brancher(t, faux.station("A"), { reglages: () => reglages, ancien });
    await jusqua(() => tours.length >= 3);
    await branche.arreter();
    assert.equal(branche.chemin(), "ancien");
    // Appelé sans rien d'autre que ce qu'il appelait déjà : aucun argument.
    assert.ok(tours.every((args) => args.length === 0));
    assert.deepEqual(faux.appels, [], JSON.stringify(reglages));
  }
});

test("the switch is reread at each turn: turned on, the next turn takes the GitHub-only path", async (t) => {
  const faux = new FauxGitHub();
  faux.feu(1);
  let reglages: { githubOnlyState?: boolean } | null = null;
  let anciens = 0;
  const branche = brancher(t, faux.station("A"), {
    reglages: () => reglages,
    ancien: async () => {
      anciens += 1;
    },
  });
  await jusqua(() => anciens >= 2);
  assert.deepEqual(faux.appels, []);
  reglages = { githubOnlyState: true };
  const dernier = anciens;
  await jusqua(() => faux.mergee(1) !== undefined);
  assert.equal(branche.chemin(), "github");
  assert.ok(anciens <= dernier + 1, "au plus le tour déjà en cours");
});

test("switch on: a ticket goes from fire to merged with no call to the relay, the mailbox or the log", async (t) => {
  const faux = new FauxGitHub();
  faux.feu(1);
  // Le chemin d'avant, tel que la station le tient : il passe par le relais de
  // prise, la boîte aux lettres du Kitchen board et le journal.
  const appels = { relais: 0, boite: 0, journal: 0 };
  const ancien = async () => {
    appels.relais += 1;
    appels.boite += 1;
    appels.journal += 1;
  };
  const branche = brancher(t, faux.station("A"), { ancien });
  await jusqua(() => faux.mergee(1) !== undefined);
  await branche.arreter();
  assert.deepEqual(appels, { relais: 0, boite: 0, journal: 0 });
  assert.equal(branche.chemin(), "github");

  // Et le module n'en importe aucun : rien que le client GitHub et le type
  // des réglages.
  const source = readFileSync(join(import.meta.dirname, "../src/brigade-github.ts"), "utf8");
  const imports = [...source.matchAll(/^import .* from "([^"]+)";$/gm)].map(([, module]) => module);
  assert.deepEqual(imports, ["./github.ts", "./reglages-projet/reglages.ts"]);
});

test("a settings reread that fails keeps the path of the turn before", async (t) => {
  const faux = new FauxGitHub();
  let lectures = 0;
  const dits: string[] = [];
  const branche = brancher(t, faux.station("A"), {
    reglages: () => {
      lectures += 1;
      if (lectures > 1) throw new Error("origin/main unreadable");
      return { githubOnlyState: true };
    },
    avertir: (texte) => dits.push(texte),
  });
  await jusqua(() => lectures >= 3);
  await branche.arreter();
  assert.equal(branche.chemin(), "github");
  assert.match(dits[0] ?? "", /non relu — origin\/main unreadable ; il reste allumé/);
});

test("the switch is on for brigade, in its project settings file, and off for a project whose file does not set it", () => {
  const brigade = reglagesDuTexte(readFileSync(join(import.meta.dirname, "../../.claude/brigade/projet.json"), "utf8"));
  assert.equal(surGitHubSeul(brigade), true);
  // Le fichier de brigade est tel que l'écriture le rendrait.
  assert.equal(texteDuFichier(brigade), readFileSync(join(import.meta.dirname, "../../.claude/brigade/projet.json"), "utf8"));

  const autre = reglagesDuTexte(JSON.stringify({ version: 1, integrationBranch: "main" }));
  assert.equal(surGitHubSeul(autre), false);
  assert.equal(surGitHubSeul(null), false);
  assert.equal(surGitHubSeul(reglagesDuTexte(JSON.stringify({ version: 1, integrationBranch: "main", githubOnlyState: false }))), false);
  assert.throws(
    () => reglagesDuTexte(JSON.stringify({ version: 1, integrationBranch: "main", githubOnlyState: "yes" })),
    (erreur: unknown) => erreur instanceof ReglageRefuse && erreur.cle === "githubOnlyState",
  );
});
