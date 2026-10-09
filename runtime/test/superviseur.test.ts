// La supervision d'un sous-processus, contre le faux `claude` : aucun quota,
// et des délais en millisecondes.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import type { Plafonds } from "../src/evenements/garde-fous.ts";
import { superviser, type Arret } from "../src/superviseur.ts";
import { aArreter, ENV_ENFANT, FAUX_CLAUDE, jusqua, repertoireTemporaire, temporaireDuFichier, vivant } from "./outils.ts";

const rienNeReste = temporaireDuFichier();

const LARGES: Plafonds = { turns: 1000, durationMs: 60_000, tokens: 1_000_000, idleMs: 60_000 };

function cook(t: TestContext, scenario: string, plafonds: Partial<Plafonds> = {}, graceMs = 2000) {
  const flux = join(repertoireTemporaire(t), "run.jsonl");
  const arrets: Arret[] = [];
  const supervise = superviser({
    commande: FAUX_CLAUDE,
    args: ["-p", "peu importe"],
    env: { ...ENV_ENFANT, FAUX_CLAUDE: scenario },
    plafonds: { ...LARGES, ...plafonds },
    graceMs,
    flux,
    surArret: (arret) => arrets.push(arret),
  });
  aArreter(t, () => supervise.abandonner());
  return { ...supervise, flux, arrets };
}

// Résout dès que le cook a écrit dans son flux : il est lancé, et ce qu'il
// fait avant de parler (poser un gestionnaire de signal) est fait.
async function aParle(flux: string): Promise<void> {
  while (!existsSync(flux) || readFileSync(flux, "utf8") === "") await new Promise((resoudre) => setTimeout(resoudre, 5));
}

// Le délai au bout duquel un cook resté bloqué fait échouer son test au lieu
// de le laisser pendre. Ce n'est pas une mesure : il couvre le démarrage d'un
// process sur une machine chargée, que rien dans le test ne maîtrise.
const FILET_MS = 10_000;

// Le vrai minuteur, pour attendre un vrai process pendant que l'horloge du
// superviseur est tenue par le test.
const vraiMinuteur = setTimeout;
const souffler = () => new Promise((resoudre) => vraiMinuteur(resoudre, 5));

// Chaque test attend un vrai process et de vrais délais : ils tournent de
// front, pour que la suite reste de l'ordre de la seconde.
describe("superviser", { concurrency: true }, () => {
  test("le flux brut et la sortie d'erreur sont masqués à l'écriture, même quand une valeur arrive en deux morceaux", async (t) => {
    const flux = join(repertoireTemporaire(t), "run.jsonl");
    // La valeur est coupée entre deux écritures, que le tube livre séparément.
    const script = 'printf \'{"type":"result","result":"la clé est sk-de\'; sleep 0.2; printf \'v-12345678"}\\nfin sans saut de ligne sk-dev-12345678\'; printf "erreur : sk-dev-12345678\\n" >&2';
    const supervise = superviser({
      commande: "bash",
      args: ["-c", script],
      env: ENV_ENFANT,
      plafonds: LARGES,
      graceMs: 2000,
      flux,
      masquer: (texte) => texte.replaceAll("sk-dev-12345678", "[secret:CLE]"),
    });
    aArreter(t, () => supervise.abandonner());

    await supervise.fin;

    assert.equal(readFileSync(flux, "utf8"), '{"type":"result","result":"la clé est [secret:CLE]"}\nfin sans saut de ligne [secret:CLE]');
    assert.equal(readFileSync(`${flux}.stderr`, "utf8"), "erreur : [secret:CLE]\n");
  });

  test("sans aucun masque de secrets, ce qui a la forme d'un jeton de Claude est masqué à l'écriture, coupé en deux morceaux ou non, et la fin dit combien de fois", async (t) => {
    const flux = join(repertoireTemporaire(t), "run.jsonl");
    // Fabriqué, et assemblé ici : la forme n'est écrite en clair nulle part.
    const jeton = ["sk", "ant", "oat01", "0".repeat(90)].join("-");
    const script = `printf '{"type":"result","result":"le jeton est ${jeton.slice(0, 30)}'; sleep 0.2; printf '${jeton.slice(30)}"}\\nfin sans saut de ligne ${jeton}'; printf "erreur : ${jeton}\\n" >&2`;
    const supervise = superviser({ commande: "bash", args: ["-c", script], env: ENV_ENFANT, plafonds: LARGES, graceMs: 2000, flux });
    aArreter(t, () => supervise.abandonner());

    const fin = await supervise.fin;

    assert.equal(readFileSync(flux, "utf8"), '{"type":"result","result":"le jeton est [jeton Claude masqué]"}\nfin sans saut de ligne [jeton Claude masqué]');
    assert.equal(readFileSync(`${flux}.stderr`, "utf8"), "erreur : [jeton Claude masqué]\n");
    assert.equal(fin.masques, 3);
  });

  test("un cook qui finit rend son code, ses tours et ses tokens, sans qu'aucun garde-fou n'intervienne", async (t) => {
    const { fin, arrets } = cook(t, "fini");

    const resultat = await fin;

    assert.deepEqual({ ...resultat, durationMs: 0 }, { code: 0, signal: null, turns: 2, tokens: 20, durationMs: 0, arret: null, erreur: null });
    assert.ok(resultat.durationMs > 0);
    assert.deepEqual(arrets, []);
  });

  test("ce qu'un cook a consommé se mesure pendant qu'il tourne", async (t) => {
    const { mesure, flux } = cook(t, "muet-apres-un-tour");
    assert.deepEqual(mesure(), { turns: 0, tokens: 0 });

    await aParle(flux);
    while (mesure().turns === 0) await new Promise((resoudre) => setTimeout(resoudre, 5));

    assert.deepEqual(mesure(), { turns: 1, tokens: 10 });
  });

  test("le flux brut du cook est gardé tel quel dans son fichier", async (t) => {
    const { fin, flux } = cook(t, "fini");
    await fin;

    const lignes = readFileSync(flux, "utf8").trimEnd().split("\n").map((ligne) => JSON.parse(ligne).type);
    assert.deepEqual(lignes, ["assistant", "assistant", "result"]);
  });

  test("ce que le cook écrit sur sa sortie d'erreur est gardé à côté du flux", async (t) => {
    const { fin, flux } = cook(t, "plaintif");
    await fin;

    assert.equal(readFileSync(`${flux}.stderr`, "utf8"), "attention\n");
  });

  test("un cook qui échoue rend son code de sortie", async (t) => {
    const resultat = await cook(t, "echec").fin;

    assert.deepEqual([resultat.code, resultat.arret], [1, null]);
  });

  test("un message livré en plusieurs lignes compte pour un tour, et son usage une seule fois", async (t) => {
    const resultat = await cook(t, "morcele").fin;

    assert.deepEqual([resultat.turns, resultat.tokens], [1, 12]);
  });

  test("les tokens comptent l'entrée, la sortie et l'écriture de cache — pas les lectures de cache", async (t) => {
    const resultat = await cook(t, "cache").fin;

    assert.deepEqual([resultat.turns, resultat.tokens], [1, 7]);
  });

  test("un cook qui dépasse son plafond de tours est arrêté, avec le motif", async (t) => {
    const { fin, arrets } = cook(t, "bavard", { turns: 3 });

    const resultat = await fin;

    assert.deepEqual(resultat.arret, { reason: "turns", limit: 3, observed: 4 });
    assert.deepEqual(arrets, [resultat.arret]);
    assert.equal(resultat.signal, "SIGTERM");
  });

  test("un cook qui dépasse son plafond de tokens est arrêté, avec le motif", async (t) => {
    const resultat = await cook(t, "bavard", { tokens: 25 }).fin;

    assert.deepEqual(resultat.arret, { reason: "tokens", limit: 25, observed: 30 });
  });

  test("un cook qui dépasse son plafond de durée est arrêté, même s'il produit", async (t) => {
    const resultat = await cook(t, "bavard", { durationMs: 150 }).fin;

    assert.equal(resultat.arret?.reason, "duration");
    assert.equal(resultat.arret?.limit, 150);
    assert.ok((resultat.arret?.observed ?? 0) >= 150);
  });

  test("un cook muet est détecté comme inactif et arrêté", async (t) => {
    const resultat = await cook(t, "muet", { idleMs: 150 }).fin;

    assert.equal(resultat.arret?.reason, "idle");
    assert.equal(resultat.arret?.limit, 150);
    assert.equal(resultat.turns, 0);
  });

  test("la commande d'arrêt arrête le cook, une seule fois", async (t) => {
    const { fin, arreter, arrets } = cook(t, "bavard");

    arreter();
    arreter();

    assert.deepEqual((await fin).arret, { reason: "stop", limit: null, observed: null });
    assert.equal(arrets.length, 1);
  });

  test("un cook sourd à SIGTERM est tué après le délai de grâce", async (t) => {
    const { fin, arreter, flux } = cook(t, "sourd", {}, 100);
    await aParle(flux);

    arreter();

    assert.equal((await fin).signal, "SIGKILL");
  });

  test("un petit-enfant sourd à SIGTERM meurt avec le groupe de son cook", async (t) => {
    const { fin, flux, pid, arreter } = cook(t, "petit-enfant-sourd");
    await aParle(flux);
    const { petitEnfant } = JSON.parse(readFileSync(flux, "utf8").trim());
    assert.equal(vivant(petitEnfant), true);

    arreter();
    const resultat = await fin;

    assert.equal(resultat.signal, "SIGTERM");
    // La fin est rendue à la fermeture des tubes, et un process tué ferme les
    // siens avant de quitter la table des process : sous charge, le
    // petit-enfant y figure encore un instant. On attend qu'il en sorte — plus
    // aucun signal ne part après la fin, donc seul celui envoyé au groupe peut
    // l'en faire sortir, et un petit-enfant épargné y resterait jusqu'au filet.
    await jusqua(() => !vivant(petitEnfant), FILET_MS).catch(() => {});
    assert.equal(vivant(petitEnfant), false);
    assert.equal(vivant(pid), false);
  });

  test("le motif est remis avant que le signal parte : le cook vit encore quand on le note", async (t) => {
    let vivaitEncore: boolean | null = null;
    const flux = join(repertoireTemporaire(t), "run.jsonl");
    const supervise = superviser({
      commande: FAUX_CLAUDE,
      args: [],
      env: { ...ENV_ENFANT, FAUX_CLAUDE: "bavard" },
      plafonds: { ...LARGES, turns: 1 },
      graceMs: 2000,
      flux,
      surArret: () => {
        vivaitEncore = vivant(supervise.pid);
      },
    });
    aArreter(t, () => supervise.abandonner());

    await supervise.fin;

    assert.equal(vivaitEncore, true);
  });

  test("un motif qui ne peut pas être noté n'empêche pas l'arrêt", async (t) => {
    const flux = join(repertoireTemporaire(t), "run.jsonl");
    const supervise = superviser({
      commande: FAUX_CLAUDE,
      args: [],
      env: { ...ENV_ENFANT, FAUX_CLAUDE: "bavard" },
      plafonds: { ...LARGES, turns: 1 },
      graceMs: 2000,
      flux,
      surArret: () => {
        throw new Error("journal en panne");
      },
    });
    aArreter(t, () => supervise.abandonner());

    const resultat = await supervise.fin;

    assert.equal(resultat.arret?.reason, "turns");
    assert.equal(resultat.signal, "SIGTERM");
  });

  test("un flux brut qui ne peut pas s'écrire ne rend pas les plafonds aveugles", async (t) => {
    // Un répertoire là où le fichier du flux devrait s'ouvrir.
    const flux = join(repertoireTemporaire(t), "flux");
    mkdirSync(flux);
    const supervise = superviser({
      commande: FAUX_CLAUDE,
      args: [],
      env: { ...ENV_ENFANT, FAUX_CLAUDE: "bavard" },
      plafonds: { ...LARGES, turns: 3, idleMs: FILET_MS },
      graceMs: 2000,
      flux,
    });
    aArreter(t, () => supervise.abandonner());

    const resultat = await supervise.fin;

    assert.deepEqual(resultat.arret, { reason: "turns", limit: 3, observed: 4 });
  });

  test("une sortie d'erreur qui ne peut pas s'écrire ne bloque pas le cook", async (t) => {
    const flux = join(repertoireTemporaire(t), "run.jsonl");
    mkdirSync(`${flux}.stderr`);
    const supervise = superviser({
      commande: FAUX_CLAUDE,
      args: [],
      env: { ...ENV_ENFANT, FAUX_CLAUDE: "plaintif-abondant" },
      plafonds: { ...LARGES, idleMs: FILET_MS },
      graceMs: 2000,
      flux,
    });
    aArreter(t, () => supervise.abandonner());

    const resultat = await supervise.fin;

    assert.deepEqual([resultat.code, resultat.arret, resultat.turns], [0, null, 1]);
  });

  test("un binaire introuvable est une fin en erreur, pas un cook qui pend", async (t) => {
    const supervise = superviser({
      commande: join(repertoireTemporaire(t), "pas-de-claude-ici"),
      args: [],
      plafonds: LARGES,
      graceMs: 2000,
      flux: join(repertoireTemporaire(t), "run.jsonl"),
    });

    const resultat = await supervise.fin;

    assert.equal(resultat.code, null);
    assert.match(resultat.erreur ?? "", /ENOENT/);
  });

  test("abandonner tue le cook sur-le-champ, sans noter de motif", async (t) => {
    const { fin, abandonner, arrets } = cook(t, "sourd");

    abandonner();

    const resultat = await fin;
    assert.equal(resultat.signal, "SIGKILL");
    assert.equal(resultat.arret, null);
    assert.deepEqual(arrets, []);
  });
});

// L'inactivité se juge à l'horloge du test, pas à celle du mur : le temps que
// met un cook à démarrer sur une machine chargée ne compte pas pour un silence.
// Un seul test à la fois — l'horloge tenue est celle de tout le process.
describe("superviser, à l'horloge du test", () => {
  test("un cook qui se tait après avoir parlé est détecté comme inactif", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const { fin, mesure, arrets } = cook(t, "muet-apres-un-tour", { idleMs: 1000 });
    while (mesure().turns === 0) await souffler();

    t.mock.timers.tick(999);
    assert.deepEqual(arrets, []);
    t.mock.timers.tick(1);

    const resultat = await fin;
    assert.deepEqual([resultat.arret?.reason, resultat.turns], ["idle", 1]);
  });

  test("un cook qui produit n'est pas pris pour un inactif", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const { fin, mesure, pid } = cook(t, "au-signal", { idleMs: 1000, turns: 3 });
    assert.ok(pid);
    let fini = false;
    void fin.then(() => (fini = true));

    // Presque tout le délai s'écoule après chaque tour, trois fois de suite :
    // près de trois délais en tout, et seul un tour qui relance la veille
    // explique que le cook aille jusqu'à son plafond.
    for (let tour = 1; tour <= 3; tour += 1) {
      while (!fini && mesure().turns < tour) await souffler();
      t.mock.timers.tick(999);
      if (!fini) process.kill(pid, "SIGUSR1");
    }

    assert.equal((await fin).arret?.reason, "turns");
  });
});

test("superviseur.test.ts ne laisse rien dans le répertoire temporaire", rienNeReste);
