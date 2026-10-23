// Le remède demandé par l'app, joué par la station elle-même — celle de
// l'ordinateur du chef comme une station distante : la même boucle
// (`projets/tenir.ts`), le même gist, le même point d'entrée. Contre un gist en
// mémoire, une autorisation et un clone doublés ; le remède est celui des
// tests — il retire la ligne écrite à la main de la configuration.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import type { Canal, Fichiers } from "../../src/appairage/canal.ts";
import { FICHIER_LOCAL } from "../../src/appairage/presence.ts";
import { DEBUT, FIN } from "../../src/projets/bloc.ts";
import { FICHIER_PROJETS, FICHIER_SUIVI, type SuiviDuProjet } from "../../src/projets/demande.ts";
import { tenirProjetsDeLApp } from "../../src/projets/tenir.ts";
import { demanderLeRemede, documentDesDemandes, FICHIER_REMEDES, FICHIER_REMEDES_SUIVI, lireDemandes, lireReponses, repondeurDeRemedes } from "../../src/remedes/distant.ts";
import type { IssueDuRemede } from "../../src/remedes/executer.ts";
import { creerRegistre, type Remede } from "../../src/remedes/registre.ts";
import { aArreter, repertoireTemporaire, temporaireDuFichier } from "../outils.ts";

const rienNeReste = temporaireDuFichier();

const GIST = "gist1";
const INSTANT = Date.parse("2026-10-15T12:02:00Z");
const PARADE = {
  nom: "parade",
  depot: "acme/parade",
  base: "main",
  principale: true,
  cooks: 2,
  manager: { modele: "sonnet", effort: "medium" },
  reviewer: { modele: "opus", effort: "high" },
  ouvertLe: "2026-10-15T12:00:00.000Z",
  demandeLe: "2026-10-15T12:01:00.000Z",
};
const MODES = [
  { mode: "l'ordinateur du chef", locale: true },
  { mode: "une station distante", locale: false },
];

// Le remède des tests : la ligne du projet écrite à la main quitte la configuration.
const RETIRER_LA_LIGNE: Remede = {
  id: "remove-hand-written-line",
  leve: ["hand-written-line"],
  description: "Removes the hand-written line for this project from the station's configuration.",
  destructif: true,
  executer: ({ projet, racine }) => {
    const fichier = join(racine, "projets");
    writeFileSync(fichier, readFileSync(fichier, "utf8").split("\n").filter((ligne) => !ligne.startsWith(`${projet} `)).join("\n"));
  },
};

function uneStation(t: TestContext, locale: boolean, remedes: Remede[] = [RETIRER_LA_LIGNE]) {
  const racine = repertoireTemporaire(t);
  writeFileSync(join(racine, FICHIER_LOCAL), JSON.stringify({ gist: GIST, appairee: true, code: null, expireLe: null, echus: [] }));
  const fichiers: Fichiers = {};
  const canal: Canal = {
    creer: async () => assert.fail("aucun gist ne se crée"),
    async ecrire(id, ecrits) {
      assert.equal(id, GIST);
      Object.assign(fichiers, ecrits);
      return "ecrit";
    },
    lire: async (id) => (id === GIST ? { ...fichiers } : null),
  };
  const configuration = () => (existsSync(join(racine, "projets")) ? readFileSync(join(racine, "projets"), "utf8") : "");
  // Ce que la station sert : ce que le bloc de sa configuration nomme.
  const servis = () => {
    const texte = configuration();
    const debut = texte.indexOf(DEBUT);
    const fin = texte.indexOf(FIN);
    return debut === -1 || fin === -1 ? [] : texte.slice(debut + DEBUT.length, fin).split("\n").filter((ligne) => ligne.trim() !== "").map((ligne) => ligne.split(" ")[0] ?? "");
  };
  let heure = INSTANT;
  const joues: string[] = [];
  const registre = creerRegistre(remedes.map((remede) => ({ ...remede, executer: (contexte) => (joues.push(remede.id), remede.executer(contexte)) })));
  const projets = tenirProjetsDeLApp({
    racine,
    canal,
    station: locale ? "mac" : "box",
    env: {},
    servis: { projets: servis, refus: () => null },
    apresEcriture: () => {},
    dire: () => {},
    cadenceMs: 3_600_000,
    maintenant: () => heure,
    locale,
    ...(locale ? { verifierBacASable: () => ({ ok: true as const, version: "1.0.0" }) } : {}),
    autoriser: async () => ({ autorisee: true }),
    cloner: async (_depot, clone) => void mkdirSync(join(clone, ".git"), { recursive: true }),
    verifierAcces: async () => ({ etat: "libre" as const }),
    ouvrirLaPreparation: async () => ({ ticket: 7, ouvert: false }),
    remedes: registre,
  });
  aArreter(t, () => projets.arreter());
  fichiers[FICHIER_PROJETS] = JSON.stringify({ brigade: "projets", format: 1, projets: [PARADE] });
  const suivi = () => (JSON.parse(fichiers[FICHIER_SUIVI] ?? "null") as { projets: SuiviDuProjet[] } | null)?.projets[0];
  // L'app demande, et attend : chacune de ses attentes laisse passer une cadence de la station.
  const demander = (demande: { project: string; refusal: string; remedy: string }, options: { delaiMs?: number } = {}): Promise<IssueDuRemede> =>
    demanderLeRemede({
      canal,
      gist: GIST,
      demande,
      id: `demande-${joues.length}-${heure}`,
      maintenant: () => heure,
      intervalleMs: 1_000,
      ...options,
      attendre: async (ms) => {
        heure += ms;
        await projets.relire();
      },
    });
  return { racine, fichiers, projets, configuration, suivi, demander, joues, avancer: (ms: number) => void (heure += ms) };
}

for (const { mode, locale } of MODES) {
  test(`${mode} : le refus servi porte le remède ; l'app le demande, la station le joue, réévalue, et répond que le refus est levé`, async (t) => {
    const station = uneStation(t, locale);
    writeFileSync(join(station.racine, "projets"), "parade acme/parade main\n");
    await station.projets.relire();
    const refuse = station.suivi();
    assert.equal(refuse?.etat, "refuse");
    assert.deepEqual(refuse?.refus?.code, "hand-written-line");
    assert.deepEqual(refuse?.refus && "remedy" in refuse.refus ? refuse.refus.remedy : null, { id: "remove-hand-written-line", description: RETIRER_LA_LIGNE.description, destructive: true });

    const issue = await station.demander({ project: "parade", refusal: "hand-written-line", remedy: "remove-hand-written-line" });
    assert.deepEqual(issue, { outcome: "lifted" });
    assert.deepEqual(station.joues, ["remove-hand-written-line"]);
    // La ligne à la main est partie, celle de la station est écrite : le projet est servi.
    assert.equal(station.configuration().includes(`${DEBUT}\nparade acme/parade main\n${FIN}`), true);
    assert.equal(station.suivi()?.etat, "servi");
    assert.equal(station.suivi()?.ici, locale);
    // La demande est retirée par l'app ; à la cadence suivante, la réponse la suit.
    assert.deepEqual(lireDemandes(station.fichiers[FICHIER_REMEDES]), []);
    await station.projets.relire();
    assert.deepEqual(lireReponses(station.fichiers[FICHIER_REMEDES_SUIVI]), []);
    assert.deepEqual(station.joues, ["remove-hand-written-line"]);
  });

  test(`${mode} : un remède qui ne lève pas le refus — la réponse dit pourquoi il tient, en une phrase`, async (t) => {
    const station = uneStation(t, locale, [{ ...RETIRER_LA_LIGNE, executer: () => {} }]);
    writeFileSync(join(station.racine, "projets"), "parade acme/parade main\n");
    await station.projets.relire();
    const issue = await station.demander({ project: "parade", refusal: "hand-written-line", remedy: "remove-hand-written-line" });
    assert.equal(issue.outcome, "holds");
    if (issue.outcome !== "holds") return;
    assert.match(issue.reason, /^The action was done, but the station still refuses this project: this project is already set up by hand on the station, which blocks the app's setup\.$/);
    assert.equal(issue.refusal.code, "hand-written-line");
    assert.equal(station.suivi()?.etat, "refuse");
  });

  test(`${mode} : un remède inconnu, ou que le refus n'offre pas — une erreur explicite, et rien ne change`, async (t) => {
    const station = uneStation(t, locale);
    writeFileSync(join(station.racine, "projets"), "parade acme/parade main\n");
    await station.projets.relire();
    const avant = station.configuration();
    assert.deepEqual(await station.demander({ project: "parade", refusal: "hand-written-line", remedy: "no-such-remedy" }), { outcome: "error", error: "the station knows no remedy called no-such-remedy: nothing was done" });
    assert.deepEqual(await station.demander({ project: "parade", refusal: "door-not-open", remedy: "remove-hand-written-line" }), {
      outcome: "error",
      error: "the station now refuses parade for another reason (hand-written-line, not door-not-open): nothing was done",
    });
    assert.deepEqual(station.joues, []);
    assert.equal(station.configuration(), avant);
    assert.equal(station.suivi()?.etat, "refuse");
  });
}

test("les deux modes rendent la même issue pour la même demande", async (t) => {
  const issues: IssueDuRemede[][] = [];
  for (const { locale } of MODES) {
    const station = uneStation(t, locale);
    writeFileSync(join(station.racine, "projets"), "parade acme/parade main\n");
    await station.projets.relire();
    issues.push([
      await station.demander({ project: "parade", refusal: "hand-written-line", remedy: "no-such-remedy" }),
      await station.demander({ project: "parade", refusal: "hand-written-line", remedy: "remove-hand-written-line" }),
      await station.demander({ project: "parade", refusal: "hand-written-line", remedy: "remove-hand-written-line" }),
    ]);
  }
  assert.deepEqual(issues[0], issues[1]);
  assert.deepEqual(issues[0]?.map((issue) => issue.outcome), ["error", "lifted", "error"]);
});

test("une demande restée dans le gist n'est jouée qu'une fois, même par une station qui redémarre ; une demande trop vieille n'est pas jouée", async () => {
  const joues: string[] = [];
  let heure = INSTANT;
  const executer = async (demande: { project: string }): Promise<IssueDuRemede> => (joues.push(demande.project), { outcome: "lifted" });
  const fichiers: Fichiers = {
    [FICHIER_REMEDES]: documentDesDemandes([
      { id: "a", askedAt: new Date(INSTANT - 60_000).toISOString(), project: "parade", refusal: "hand-written-line", remedy: "remove-hand-written-line" },
      { id: "vieille", askedAt: new Date(INSTANT - 3_600_000).toISOString(), project: "vieux", refusal: "hand-written-line", remedy: "remove-hand-written-line" },
    ]),
  };
  const repondeur = repondeurDeRemedes({ executer, maintenant: () => heure });
  Object.assign(fichiers, (await repondeur.repondre(fichiers)) ?? {});
  assert.deepEqual(joues, ["parade"]);
  const reponses = lireReponses(fichiers[FICHIER_REMEDES_SUIVI]);
  assert.deepEqual(reponses.map(({ id, outcome }) => [id, outcome]), [["a", "lifted"], ["vieille", "error"]]);
  assert.match(reponses[1]?.outcome === "error" ? reponses[1].error : "", /more than 10 minutes ago: nothing was done/);
  // Relue, rien ne change : pas de réécriture.
  heure += 30_000;
  assert.equal(await repondeur.repondre(fichiers), null);
  // Une station redémarrée relit ses réponses dans le gist : rien n'est rejoué.
  assert.equal(await repondeurDeRemedes({ executer, maintenant: () => heure }).repondre(fichiers), null);
  assert.deepEqual(joues, ["parade"]);
  // L'app retire ses demandes : les réponses les suivent.
  fichiers[FICHIER_REMEDES] = documentDesDemandes([]);
  Object.assign(fichiers, (await repondeur.repondre(fichiers)) ?? {});
  assert.deepEqual(lireReponses(fichiers[FICHIER_REMEDES_SUIVI]), []);
});

test("une station qui ne répond pas : l'app retire sa demande au bout du délai, et le dit", async (t) => {
  const station = uneStation(t, false);
  writeFileSync(join(station.racine, "projets"), "parade acme/parade main\n");
  await station.projets.relire();
  // La station s'arrête : plus aucune cadence.
  station.projets.arreter();
  const issue = await station.demander({ project: "parade", refusal: "hand-written-line", remedy: "remove-hand-written-line" }, { delaiMs: 5_000 });
  assert.deepEqual(issue, { outcome: "error", error: "the station did not answer within 5 s: the request is withdrawn, and nothing is known to have been done" });
  assert.deepEqual(lireDemandes(station.fichiers[FICHIER_REMEDES]), []);
  assert.deepEqual(station.joues, []);
});

test("modes.test.ts ne laisse rien dans le répertoire temporaire", rienNeReste);
