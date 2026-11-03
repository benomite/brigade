// L'allure des appels à GitHub : sous ses limites secondaires, quoi que les
// projets lui demandent — sur une horloge simulée, que le test avance d'une
// minuterie à l'autre, et une allure partagée par deux process (deux ouvertures
// de la même base), un par projet.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { test, type TestContext } from "node:test";
import {
  allureDeLaStation,
  BUDGETS_PAR_DEFAUT,
  estUneEcriture,
  lireLesBudgets,
  MINUTE_MS,
  ouvrirAllure,
  PLAFONDS_DE_GITHUB,
  retenueDuCompte,
  VARIABLES_DE_L_ALLURE,
  type Allure,
  type Budgets,
  type Passage,
} from "../src/github-allure.ts";
import { ouvrirLimitesDuCompte } from "../src/github-limite.ts";
import { ConfigInvalide } from "../src/runtime.ts";
import { repertoireTemporaire } from "./outils.ts";

const SECONDE = 1000;
const DEPART = Date.parse("2026-11-03T15:00:00Z");

// Tout ce qui est en attente de promesses se résout avant que l'horloge avance.
const vider = async () => {
  for (let i = 0; i < 10; i++) await new Promise<void>((resoudre) => setImmediate(resoudre));
};

// Une horloge simulée : ses minuteries ne se déclenchent que quand le test l'avance.
function uneHorloge() {
  let instant = DEPART;
  let suivante = 0;
  const minuteries = new Map<number, { quand: number; faire: () => void }>();
  const programmer = (ms: number, faire: () => void) => {
    const id = suivante++;
    minuteries.set(id, { quand: instant + Math.max(0, ms), faire });
    return () => void minuteries.delete(id);
  };
  return {
    maintenant: () => instant,
    programmer,
    dormir: (ms: number) => new Promise<void>((resoudre) => void programmer(ms, resoudre)),
    // Avance de minuterie en minuterie jusqu'à ce que `fini` soit vrai — au
    // plus jusqu'à `borne` : au-delà, quelque chose est resté coincé.
    async jusqua(fini: () => boolean, borne: number) {
      for (;;) {
        await vider();
        if (fini()) return;
        let prochaine: [number, { quand: number; faire: () => void }] | undefined;
        for (const entree of minuteries) if (prochaine === undefined || entree[1].quand < prochaine[1].quand) prochaine = entree;
        if (prochaine === undefined) throw new Error("plus rien n'attend, et ce n'est pas fini");
        if (prochaine[1].quand > borne) throw new Error(`pas fini à ${new Date(borne).toISOString()}`);
        minuteries.delete(prochaine[0]);
        instant = Math.max(instant, prochaine[1].quand);
        prochaine[1].faire();
      }
    },
  };
}

type Horloge = ReturnType<typeof uneHorloge>;

// Ce qui sort de l'allure : chaque requête à son départ, et le plus de requêtes en vol à la fois.
function unGitHub(horloge: Horloge) {
  const departs: Array<{ instant: number; projet: string; ecriture: boolean }> = [];
  let enVol = 0;
  let auPlus = 0;
  let finies = 0;
  return {
    departs,
    enVolAuPlus: () => auPlus,
    finies: () => finies,
    appeler(allure: Allure, passage: Passage, dureeMs: number) {
      return allure.passer(passage, async () => {
        departs.push({ instant: horloge.maintenant(), projet: passage.projet, ecriture: passage.ecriture });
        auPlus = Math.max(auPlus, ++enVol);
        await horloge.dormir(dureeMs);
        enVol--;
        finies++;
      });
    },
  };
}

// Le plus d'écritures parties sur une minute glissante.
function auPlusParMinute(instants: number[]): number {
  const tries = [...instants].sort((a, b) => a - b);
  let auPlus = 0;
  for (let debut = 0, fin = 0; debut < tries.length; debut++) {
    while (fin < tries.length && (tries[fin] as number) < (tries[debut] as number) + MINUTE_MS) fin++;
    auPlus = Math.max(auPlus, fin - debut);
  }
  return auPlus;
}

// Deux process de la même station, un par projet : deux ouvertures de la même allure.
function deuxProcess(t: TestContext, horloge: Horloge, budgets: Partial<Budgets>) {
  const station = repertoireTemporaire(t);
  const ouvrir = () => allureDeLaStation(station, { budgets, maintenant: horloge.maintenant, programmer: horloge.programmer });
  const allures = [ouvrir(), ouvrir()] as const;
  t.after(() => allures.forEach((allure) => allure.fermer()));
  return allures;
}

// Quatre cents requêtes, tour après tour de file : une garde large, pour une suite chargée.
const LOURD = { timeout: 180_000 };

test("deux projets qui lancent 200 écritures d'un coup : jamais plus d'écritures par minute glissante ni de requêtes en vol que le budget", LOURD, async (t) => {
  const budgets = { ecrituresParMinute: 60, ecrituresParHeure: 500, simultanees: 4 };
  // Des réponses rapides : c'est le débit qui borne. Des réponses lentes : c'est le nombre en vol.
  for (const dureeMs of [SECONDE, 5 * SECONDE]) {
    const horloge = uneHorloge();
    const [alpha, beta] = deuxProcess(t, horloge, budgets);
    const github = unGitHub(horloge);
    const tout: Array<Promise<void>> = [];
    for (let i = 0; i < 200; i++) {
      tout.push(github.appeler(alpha, { projet: "alpha", ecriture: true }, dureeMs));
      tout.push(github.appeler(beta, { projet: "beta", ecriture: true }, dureeMs));
    }
    await horloge.jusqua(() => github.finies() === 400, DEPART + 2 * 60 * MINUTE_MS);
    await Promise.all(tout);

    assert.equal(github.departs.length, 400);
    const parMinute = auPlusParMinute(github.departs.map(({ instant }) => instant));
    assert.ok(parMinute <= budgets.ecrituresParMinute, `${parMinute} écritures sur une minute, pour un budget de ${budgets.ecrituresParMinute}`);
    assert.ok(github.enVolAuPlus() <= budgets.simultanees, `${github.enVolAuPlus()} requêtes en vol, pour un budget de ${budgets.simultanees}`);
    // Et le budget qui borne est atteint : l'allure ne bride pas plus que demandé.
    if (dureeMs === SECONDE) assert.equal(parMinute, budgets.ecrituresParMinute);
    else assert.equal(github.enVolAuPlus(), budgets.simultanees);
  }
});

test("l'allure saturée, chaque projet avance : la place qui se libère va au projet servi le moins récemment", LOURD, async (t) => {
  const horloge = uneHorloge();
  const [alpha, beta] = deuxProcess(t, horloge, { ecrituresParMinute: 60, ecrituresParHeure: 500, simultanees: 2 });
  const github = unGitHub(horloge);
  const tout: Array<Promise<void>> = [];
  for (let i = 0; i < 200; i++) tout.push(github.appeler(alpha, { projet: "alpha", ecriture: true }, SECONDE));
  for (let i = 0; i < 200; i++) tout.push(github.appeler(beta, { projet: "beta", ecriture: true }, SECONDE));
  // Un troisième projet arrive en retard, avec trois écritures, et un geste du chef.
  let gamma: Array<Promise<void>> = [];
  horloge.programmer(5 * MINUTE_MS, () => {
    gamma = [0, 1, 2].map(() => github.appeler(alpha, { projet: "gamma", ecriture: true }, SECONDE));
    gamma.push(github.appeler(beta, { projet: "chef", ecriture: true, geste: true }, SECONDE));
  });
  await horloge.jusqua(() => github.finies() === 404, DEPART + 30 * MINUTE_MS);
  await Promise.all([...tout, ...gamma]);

  // Tant que les deux attendent, l'écart entre leurs départs reste d'une requête.
  const servis = { alpha: 0, beta: 0 };
  for (const { projet } of github.departs) {
    if (projet !== "alpha" && projet !== "beta") continue;
    servis[projet]++;
    assert.ok(Math.abs(servis.alpha - servis.beta) <= 1, `alpha ${servis.alpha}, beta ${servis.beta} : un projet en affame un autre`);
  }
  // Le retardataire et le geste passent dans les quelques départs qui suivent leur arrivée, pas après les 200 autres.
  const arrivee = github.departs.findIndex(({ instant }) => instant >= DEPART + 5 * MINUTE_MS);
  const rangs = github.departs.flatMap(({ projet }, rang) => (projet === "gamma" || projet === "chef" ? [rang - arrivee] : []));
  assert.equal(rangs.length, 4);
  assert.equal(github.departs[arrivee]?.projet, "chef", "le geste du chef passe le premier");
  assert.ok(Math.max(...rangs) <= 8, `départs ${rangs.join(", ")} après l'arrivée`);
});

test("tant que la limite du compte dure, ses écritures attendent ; la reprise passée, elles partent seules — lectures et gestes, eux, ne sont pas retenus", async (t) => {
  const horloge = uneHorloge();
  const limites = ouvrirLimitesDuCompte({ maintenant: horloge.maintenant });
  t.after(() => limites.fermer());
  const allure = ouvrirAllure({ maintenant: horloge.maintenant, programmer: horloge.programmer });
  t.after(() => allure.fermer());
  const github = unGitHub(horloge);
  const reprise = DEPART + 90 * SECONDE;
  limites.constater("gh", { sorte: "secondary-writes", depuis: DEPART, reprise });
  const retenue = retenueDuCompte(limites, horloge.maintenant);

  const tout = [
    ...[0, 1, 2].map(() => github.appeler(allure, { projet: "alpha", ecriture: true, retenue }, SECONDE)),
    github.appeler(allure, { projet: "alpha", ecriture: false, retenue }, SECONDE),
    github.appeler(allure, { projet: "chef", ecriture: true, geste: true, retenue }, SECONDE),
  ];
  await horloge.jusqua(() => github.finies() === 2, reprise - SECONDE);
  assert.deepEqual(
    github.departs.map(({ projet, ecriture }) => `${projet}:${ecriture ? "écriture" : "lecture"}`).sort(),
    ["alpha:lecture", "chef:écriture"],
  );
  assert.ok(github.departs.every(({ instant }) => instant === DEPART));

  await horloge.jusqua(() => github.finies() === 5, reprise + MINUTE_MS);
  await Promise.all(tout);
  const ecritures = github.departs.filter(({ projet }) => projet === "alpha").filter(({ ecriture }) => ecriture);
  assert.equal(ecritures.length, 3);
  for (const { instant } of ecritures) assert.ok(instant >= reprise && instant < reprise + SECONDE, `partie à ${instant - DEPART} ms, la reprise est à 90 000 ms`);
});

test("une requête abandonnée sort de la file, et une allure fermée ne laisse rien en attente", async () => {
  const horloge = uneHorloge();
  const allure = ouvrirAllure({ budgets: { simultanees: 1 }, maintenant: horloge.maintenant, programmer: horloge.programmer });
  const github = unGitHub(horloge);
  const premiere = github.appeler(allure, { projet: "alpha", ecriture: false }, 10 * SECONDE);
  const abandon = new AbortController();
  const abandonnee = github.appeler(allure, { projet: "alpha", ecriture: false, signal: abandon.signal }, SECONDE);
  const fermee = github.appeler(allure, { projet: "alpha", ecriture: false }, SECONDE);
  await vider();
  abandon.abort(new Error("fermé"));
  await assert.rejects(abandonnee, /fermé/);
  allure.fermer();
  await assert.rejects(fermee, /fermée/);
  await horloge.jusqua(() => github.finies() === 1, DEPART + MINUTE_MS);
  await premiere;
  assert.equal(github.departs.length, 1);
  await assert.rejects(allure.entrer({ projet: "alpha", ecriture: false }), /fermée/);
});

test("les budgets ont un défaut sous les limites de GitHub, et un réglage de la station les change, sans les porter au-delà", () => {
  assert.deepEqual(lireLesBudgets({}), BUDGETS_PAR_DEFAUT);
  for (const cle of Object.keys(BUDGETS_PAR_DEFAUT) as Array<keyof Budgets>) assert.ok(BUDGETS_PAR_DEFAUT[cle] < PLAFONDS_DE_GITHUB[cle]);
  assert.deepEqual(lireLesBudgets({ BRIGADE_GITHUB_WRITES_PER_MINUTE: "20", BRIGADE_GITHUB_WRITES_PER_HOUR: "200", BRIGADE_GITHUB_CONCURRENT_REQUESTS: "3" }), { ecrituresParMinute: 20, ecrituresParHeure: 200, simultanees: 3 });
  for (const cle of Object.keys(VARIABLES_DE_L_ALLURE) as Array<keyof Budgets>)
    for (const valeur of ["0", "deux", String(PLAFONDS_DE_GITHUB[cle] + 1), "2.5"]) assert.throws(() => lireLesBudgets({ [VARIABLES_DE_L_ALLURE[cle]]: valeur }), ConfigInvalide);
});

test("une écriture se reconnaît à ses arguments de `gh api`", () => {
  assert.equal(estUneEcriture(["repos/o/r/issues/1"]), false);
  assert.equal(estUneEcriture(["-H", "If-None-Match: x", "repos/o/r/issues"]), false);
  assert.equal(estUneEcriture(["-X", "GET", "-f", "q=1", "search/issues"]), false);
  assert.equal(estUneEcriture(["-X", "PATCH", "repos/o/r/issues/1"]), true);
  assert.equal(estUneEcriture(["-f", "body=x", "repos/o/r/issues/1/comments"]), true);
  assert.equal(estUneEcriture(["--input", "-", "repos/o/r/issues"]), true);
  assert.equal(estUneEcriture(["-f", "query=query($id: ID!) { node(id: $id) { id } }", "graphql"]), false);
  assert.equal(estUneEcriture(["-f", "query=mutation($id: ID!) { pinIssue(input: { issueId: $id }) { issue { isPinned } } }", "graphql"]), true);
});

// Les modules qui lancent `gh api` sans passer par l'allure : ils ne font que lire.
const LECTEURS_SEULS = [
  "appairage/stations-du-chef.ts",
  "enregistrement-station/stations-du-compte.ts",
  "limite-github.ts",
  "projets/echec-du-clone.ts",
];
const MARQUES_D_ECRITURE = /"(-X|--method|--input|-f|-F|--field|--raw-field|POST|PATCH|PUT|DELETE)"/;

function sources(repertoire: string): string[] {
  return readdirSync(repertoire, { withFileTypes: true }).flatMap((entree) =>
    entree.isDirectory() ? sources(join(repertoire, entree.name)) : entree.name.endsWith(".ts") ? [join(repertoire, entree.name)] : [],
  );
}

test("toute écriture du runtime sur GitHub passe par l'allure : un module qui lance `gh api` la prend, ou ne fait que lire", () => {
  const racine = join(import.meta.dirname, "..", "src");
  const lanceurs = sources(racine).filter((fichier) => /"api"/.test(readFileSync(fichier, "utf8")));
  const sansAllure: string[] = [];
  for (const fichier of lanceurs) {
    const nom = relative(racine, fichier).split("\\").join("/");
    const texte = readFileSync(fichier, "utf8");
    if (/\ballureDuProcess\(\)|options\.allure\b/.test(texte) && /\.passer\(/.test(texte)) continue;
    if (LECTEURS_SEULS.includes(nom)) {
      assert.doesNotMatch(texte, MARQUES_D_ECRITURE, `${nom} lance \`gh api\` sans l'allure, et écrit`);
      continue;
    }
    sansAllure.push(nom);
  }
  assert.deepEqual(sansAllure, [], "ces modules lancent `gh api` sans passer par l'allure (`github-allure.ts`)");
  // La liste ne garde que des modules qui existent, et qui lancent `gh api`.
  for (const nom of LECTEURS_SEULS) assert.ok(lanceurs.some((fichier) => relative(racine, fichier).split("\\").join("/") === nom), `${nom} ne lance plus \`gh api\``);
  // Et aucune commande de `gh` qui écrit sans passer par `gh api` (`gh issue create`, `gh pr merge`…).
  for (const fichier of sources(racine)) {
    const texte = readFileSync(fichier, "utf8");
    const commande = /\[\s*"(issue|pr|gist|label|release|workflow|secret|variable)"\s*,\s*"[a-z-]+"/.exec(texte);
    assert.equal(commande, null, `${relative(racine, fichier)} lance \`gh ${commande?.[1]}\` sans l'allure`);
  }
});
