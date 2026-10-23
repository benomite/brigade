// L'étage commun des leçons (`commun/`) : une leçon promue dans le carnet d'au
// moins deux projets de la même installation est proposée au chef, avec ses
// projets ; acceptée, les cooks de tous les projets la reçoivent ; refusée,
// elle reste propre à chaque projet et n'est plus proposée. Une installation
// d'un seul projet n'a pas d'étage commun.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { blocDesLecons } from "../../src/apprentissage/injection.ts";
import { parseCarnet, writeCarnet, type Lesson } from "../../src/carnet/carnet.ts";
import { consigne } from "../../src/claude.ts";
import { principal } from "../../src/commun/commun-cli.ts";
import { cleDe, etageVide, fichierDeLEtage, leconsCommunes, lireEtage, lireSeuilCommun, propositions, trancher, VARIABLE_SEUIL_COMMUN } from "../../src/commun/etage.ts";
import { idsDeLEtageCommun, leconsDeLEtageCommun, noterUnTicketServi } from "../../src/commun/installation.ts";
import { trierRetro } from "../../src/apprentissage/retro.ts";
import { carnetVide } from "../../src/apprentissage/lecons.ts";
import { Sortie } from "../../src/appel.ts";
import { ConfigInvalide } from "../../src/runtime.ts";
import { CLONES, CONFIGURATION } from "../../src/station/configuration.ts";
import { cuisine, issue } from "../aides/cuisine.ts";
import { sansMotFrancais } from "../aides/glossaire.ts";
import { BASE, DEPOT, git, jusqua, repertoireTemporaire } from "../outils.ts";

const COMMUNE = "Un test attend un fait, jamais une durée.";

const promue = (id: string, text: string): Lesson => ({ id, text, state: "promoted", entered: "2026-10-01", retros: ["retro-1"], origin: { kind: "retro" } });

// Une station : sa configuration, et le clone de chaque projet, dont la base
// porte son carnet — ses leçons promues. `null` : la base n'a pas de carnet.
function station(t: TestContext, projets: Record<string, Lesson[] | null>): string {
  const racine = repertoireTemporaire(t);
  writeFileSync(join(racine, CONFIGURATION), Object.keys(projets).map((nom) => `${nom} acme/${nom} ${BASE}\n`).join(""));
  for (const [nom, lecons] of Object.entries(projets)) {
    const clone = join(racine, CLONES, nom);
    mkdirSync(clone, { recursive: true });
    git(clone, "init", "-q", `--initial-branch=${BASE}`);
    writeFileSync(join(clone, "LISEZMOI"), `${nom}\n`);
    if (lecons !== null) {
      mkdirSync(join(clone, ".claude/brigade"), { recursive: true });
      writeFileSync(join(clone, ".claude/brigade/carnet.md"), writeCarnet({ lessons: lecons }));
    }
    git(clone, "add", ".");
    git(clone, "commit", "-q", "-m", "amorce");
    git(clone, "update-ref", `refs/remotes/origin/${BASE}`, "HEAD");
  }
  return racine;
}

function jouer(racine: string, args: string[] = [], env: Record<string, string> = {}) {
  const sortie: string[] = [];
  const erreurs: string[] = [];
  let code = 0;
  try {
    principal({ args, env: { BRIGADE_STATION_DIR: racine, ...env }, dire: (l) => sortie.push(l), redire: (l) => erreurs.push(l) });
  } catch (erreur) {
    if (!(erreur instanceof Sortie)) throw erreur;
    code = erreur.code;
  }
  sansMotFrancais([...sortie, ...erreurs].map((ligne) => ligne.replaceAll(COMMUNE, "…")));
  return { sortie, erreurs, code };
}

const prompt = (args: string[]) => args[args.indexOf("-p") + 1] ?? "";

// Le cook d'un ticket du projet `projet` de la station `racine` : ce que sa
// consigne porte, et ce que son lancement dit avoir reçu.
async function cookDe(t: TestContext, racine: string, projet: string) {
  const { cooks, dernier } = cuisine(t, { projet, issues: [issue(17)], commun: () => leconsDeLEtageCommun(racine) });
  await jusqua(() => cooks().length === 1);
  return { texte: prompt(cooks()[0]?.args ?? []), recues: dernier("cook.launched", 17)?.lessons };
}

describe("la proposition à l'étage commun", () => {
  test("une même leçon promue dans deux projets est proposée au chef, avec le nom des deux ; promue dans un seul, rien", (t) => {
    const racine = station(t, {
      alpha: [promue("L4", COMMUNE), promue("L5", "Seulement chez alpha.")],
      // Mot pour mot, aux blancs près : la même leçon, sous un autre id.
      beta: [promue("L7", COMMUNE.replace(" ", "  "))],
      gamma: null,
    });
    const { sortie, code } = jouer(racine);

    assert.equal(code, 0);
    const cle = cleDe(COMMUNE);
    assert.ok(sortie.includes(`${cle}  ${COMMUNE}`), sortie.join("\n"));
    assert.ok(sortie.includes("          promoted in alpha (L4), beta (L7)"), sortie.join("\n"));
    assert.equal(sortie.filter((ligne) => ligne.includes("Seulement chez alpha")).length, 0);
    assert.equal(sortie.filter((ligne) => ligne.trimStart().startsWith("promoted in")).length, 1);
  });

  test("une leçon promue dans un seul projet, ou provisoire ou sortie dans l'autre, n'est pas proposée", (t) => {
    const sortie = { ...promue("L2", COMMUNE), state: "retired" as const, exit: { date: "2026-10-03", reason: "manual" as const } };
    const racine = station(t, { alpha: [promue("L4", COMMUNE)], beta: [sortie], gamma: [] });
    const lu = jouer(racine);

    assert.equal(lu.code, 0);
    assert.ok(lu.sortie.includes("no lesson is proposed"));
    assert.equal(lu.sortie.filter((ligne) => ligne.includes(COMMUNE)).length, 0);
  });

  test("le seuil est un réglage, deux par défaut : à trois, une leçon de deux projets n'est plus proposée ; trois projets la font revenir", (t) => {
    const racine = station(t, { alpha: [promue("L4", COMMUNE)], beta: [promue("L7", COMMUNE)], gamma: [promue("L1", "Autre chose.")] });
    const reglage = { [VARIABLE_SEUIL_COMMUN]: "3" };

    assert.ok(jouer(racine).sortie.includes(`${cleDe(COMMUNE)}  ${COMMUNE}`));
    const a3 = jouer(racine, [], reglage);
    assert.equal(a3.code, 0);
    assert.ok(a3.sortie.includes("no lesson is proposed"), a3.sortie.join("\n"));
    assert.equal(jouer(racine, ["yes", cleDe(COMMUNE)], reglage).code, 1);

    const a3projets = station(t, { alpha: [promue("L4", COMMUNE)], beta: [promue("L7", COMMUNE)], gamma: [promue("L1", COMMUNE)] });
    assert.ok(jouer(a3projets, [], reglage).sortie.includes("          promoted in alpha (L4), beta (L7), gamma (L1)"));
  });

  test("le seuil : deux par défaut, au moins deux, une valeur illisible refusée en nommant la variable", () => {
    assert.equal(lireSeuilCommun({}), 2);
    assert.equal(lireSeuilCommun({ [VARIABLE_SEUIL_COMMUN]: "" }), 2);
    assert.equal(lireSeuilCommun({ [VARIABLE_SEUIL_COMMUN]: "3" }), 3);
    for (const mauvais of ["1", "0", "-2", "2.5", "deux"]) {
      assert.throws(() => lireSeuilCommun({ [VARIABLE_SEUIL_COMMUN]: mauvais }), (erreur: unknown) => erreur instanceof ConfigInvalide && erreur.message.includes(VARIABLE_SEUIL_COMMUN), mauvais);
    }
  });

  test("la commande refuse un seuil illisible, code 1, et un appel qui ne se lit pas, code 2", (t) => {
    const racine = station(t, { alpha: [], beta: [] });
    const illisible = jouer(racine, [], { [VARIABLE_SEUIL_COMMUN]: "1" });
    assert.equal(illisible.code, 1);
    assert.match(illisible.erreurs.join("\n"), new RegExp(VARIABLE_SEUIL_COMMUN));
    assert.equal(jouer(racine, ["peut-etre", "abcdef12"]).code, 2);
    assert.equal(jouer(racine, ["yes"]).code, 2);
    assert.equal(jouer(racine, ["yes", "abcdef12"]).code, 1);
  });
});

describe("le « oui » du chef", () => {
  test("la leçon entre à l'étage commun, n'est plus proposée, et le cook d'un troisième projet la reçoit dans sa consigne", async (t) => {
    const racine = station(t, { alpha: [promue("L4", COMMUNE)], beta: [promue("L7", COMMUNE)], gamma: [] });
    const cle = cleDe(COMMUNE);
    const oui = jouer(racine, ["yes", cle]);

    assert.equal(oui.code, 0, oui.erreurs.join("\n"));
    assert.deepEqual(oui.sortie, [`“yes” to ${cle}: lesson C1 joins the common tier — the cooks of every project receive it`]);
    const apres = jouer(racine);
    assert.ok(apres.sortie.includes("no lesson is proposed"));
    assert.ok(apres.sortie.some((ligne) => ligne.startsWith(`C1  ${COMMUNE}  (accepted `) && ligne.endsWith("from alpha, beta)")), apres.sortie.join("\n"));
    // Un second geste n'écrit rien, et rend le premier.
    assert.deepEqual(jouer(racine, ["no", cle]).sortie, [`already answered — “yes” to ${cle}: lesson C1 joins the common tier — the cooks of every project receive it`]);
    assert.equal(lireEtage(racine).lecons.length, 1);

    const { texte, recues } = await cookDe(t, racine, "gamma");
    assert.ok(texte.includes(`- C1 : ${COMMUNE}`), texte);
    assert.match(texte, /étage commun/);
    assert.deepEqual(recues, ["C1"]);
  });
});

describe("le « non » du chef", () => {
  test("la leçon reste dans le carnet des deux projets seulement, aucun cook d'un autre projet ne la reçoit, et elle n'est plus proposée", async (t) => {
    const racine = station(t, { alpha: [promue("L4", COMMUNE)], beta: [promue("L7", COMMUNE)], gamma: [] });
    const cle = cleDe(COMMUNE);
    const non = jouer(racine, ["no", cle]);

    assert.equal(non.code, 0, non.erreurs.join("\n"));
    assert.deepEqual(non.sortie, [`“no” to ${cle}: the lesson stays in alpha, beta only, and is not proposed again`]);
    assert.ok(jouer(racine).sortie.includes("no lesson is proposed"));
    assert.equal(jouer(racine, ["yes", cle]).sortie[0], `already answered — “no” to ${cle}: the lesson stays in alpha, beta only, and is not proposed again`);
    assert.deepEqual(leconsDeLEtageCommun(racine), []);

    // Les carnets des deux projets la tiennent toujours, promue.
    for (const nom of ["alpha", "beta"]) {
      const carnet = parseCarnet(git(join(racine, CLONES, nom), "show", `origin/${BASE}:.claude/brigade/carnet.md`) + "\n");
      assert.deepEqual(carnet.lessons.map((l) => [l.text, l.state]), [[COMMUNE, "promoted"]]);
    }
    const { texte, recues } = await cookDe(t, racine, "gamma");
    assert.doesNotMatch(texte, /étage commun/);
    assert.equal(texte.includes(COMMUNE), false);
    assert.deepEqual(recues, []);
  });

  test("refusée, elle n'est pas reproposée quand un troisième projet la promeut à son tour", () => {
    const carnets = (n: number) => ["alpha", "beta", "gamma"].slice(0, n).map((projet) => ({ projet, carnet: { lessons: [promue("L1", COMMUNE)] } }));
    const [proposee] = propositions(carnets(2), 2, etageVide());
    assert.ok(proposee);
    const { etage } = trancher(etageVide(), proposee, "refused", "2026-10-21");

    assert.deepEqual(propositions(carnets(3), 2, etage), []);
    assert.deepEqual(leconsCommunes(etage, 3), []);
  });
});

describe("une installation d'un seul projet", () => {
  test("aucune proposition, et la consigne de ses cooks reste ce qu'elle était — même si l'étage a gardé une leçon acceptée", async (t) => {
    const racine = station(t, { alpha: [promue("L4", COMMUNE)] });
    const lu = jouer(racine);
    assert.equal(lu.code, 0);
    assert.deepEqual(lu.sortie, ["no common tier: this installation serves a single project"]);
    assert.equal(jouer(racine, ["yes", cleDe(COMMUNE)]).code, 1);
    assert.equal(existsSync(fichierDeLEtage(racine)), false);

    // Un étage resté d'une installation qui avait deux projets ne sert plus.
    const { etage } = trancher(etageVide(), { cle: cleDe(COMMUNE), texte: COMMUNE, projets: [{ projet: "alpha", id: "L4" }, { projet: "beta", id: "L7" }] }, "accepted", "2026-10-21");
    writeFileSync(fichierDeLEtage(racine), JSON.stringify(etage));
    assert.deepEqual(leconsDeLEtageCommun(racine), []);

    const { texte, recues } = await cookDe(t, racine, "alpha");
    assert.equal(texte, consigne({ ticket: 17, titre: issue(17).title, depot: DEPOT, base: BASE }));
    assert.deepEqual(recues, []);
  });

  test("hors d'une station, aucun étage commun", () => {
    assert.deepEqual(leconsDeLEtageCommun(undefined), []);
    assert.deepEqual(leconsDeLEtageCommun(""), []);
  });
});

describe("la consigne", () => {
  test("les leçons de l'étage commun ont leur bloc, après les provisoires du projet ; sans elles, rien ne change", () => {
    const provisoires = [{ id: "L2", texte: "Lire le CLAUDE.md." }];
    const communes = [{ id: "C1", texte: COMMUNE, etage: "commun" as const }];
    const bloc = blocDesLecons([...provisoires, ...communes]).join("\n");

    assert.ok(bloc.indexOf("- L2 : Lire le CLAUDE.md.") < bloc.indexOf(`- C1 : ${COMMUNE}`));
    assert.match(bloc, /leçons provisoires/);
    assert.match(bloc, /étage commun/);
    assert.deepEqual(blocDesLecons(provisoires), blocDesLecons([...provisoires]));
    assert.doesNotMatch(blocDesLecons(provisoires).join("\n"), /étage commun/);
    assert.doesNotMatch(blocDesLecons(communes).join("\n"), /leçons provisoires/);
  });
});

describe("le retrait d'une leçon de l'étage par le chef", () => {
  test("`retire C1` : aucun cook d'aucun projet ne la reçoit plus, elle n'est jamais reproposée, un second geste n'écrit rien", async (t) => {
    const racine = station(t, { alpha: [promue("L4", COMMUNE)], beta: [promue("L7", COMMUNE)], gamma: [] });
    const cle = cleDe(COMMUNE);
    assert.equal(jouer(racine, ["yes", cle]).code, 0);
    assert.deepEqual((await cookDe(t, racine, "gamma")).recues, ["C1"]);

    const retrait = jouer(racine, ["retire", "C1"]);
    assert.equal(retrait.code, 0, retrait.erreurs.join("\n"));
    assert.deepEqual(retrait.sortie, ["C1 retired: no cook of any project receives it, and it is not proposed again"]);
    for (const projet of ["alpha", "beta", "gamma"]) {
      const { texte, recues } = await cookDe(t, racine, projet);
      assert.equal(texte.includes(COMMUNE), false, projet);
      assert.deepEqual(recues, []);
    }
    assert.deepEqual(leconsDeLEtageCommun(racine), []);
    assert.ok(jouer(racine).sortie.includes("no lesson is proposed"));
    assert.ok(jouer(racine).sortie.some((ligne) => ligne.startsWith(`C1  ${COMMUNE}  (retired `)));
    // Même quand un troisième projet la promeut à son tour.
    assert.deepEqual(propositions([{ projet: "alpha", carnet: { lessons: [promue("L4", COMMUNE)] } }, { projet: "gamma", carnet: { lessons: [promue("L1", COMMUNE)] } }], 2, lireEtage(racine)), []);
    const avant = lireEtage(racine);
    assert.match(jouer(racine, ["retire", "C1"]).sortie[0]!, /^already out — C1 is retired/);
    assert.deepEqual(lireEtage(racine), avant);
    // Les carnets des projets ne bougent pas.
    const carnet = parseCarnet(git(join(racine, CLONES, "alpha"), "show", `origin/${BASE}:.claude/brigade/carnet.md`) + "\n");
    assert.deepEqual(carnet.lessons.map((l) => l.state), ["promoted"]);
  });

  test("un id inconnu ou mal écrit est refusé, rien n'est écrit", (t) => {
    const racine = station(t, { alpha: [], beta: [] });
    assert.equal(jouer(racine, ["retire", "C9"]).code, 1);
    assert.equal(jouer(racine, ["retire", "nope"]).code, 2);
    assert.equal(jouer(racine, ["retire"]).code, 2);
    assert.equal(existsSync(fichierDeLEtage(racine)), false);
  });
});

describe("l'expiration d'une leçon de l'étage", () => {
  const EXPIRATION = 3;
  const accepter = (t: TestContext) => {
    const racine = station(t, { alpha: [promue("L4", COMMUNE)], beta: [promue("L7", COMMUNE)] });
    assert.equal(jouer(racine, ["yes", cleDe(COMMUNE)]).code, 0);
    return racine;
  };

  test("sans reconfirmation pendant `expiration` tickets servis, elle expire : plus servie, marquée expirée, jamais reproposée", async (t) => {
    const racine = accepter(t);
    assert.deepEqual(noterUnTicketServi(racine, [], EXPIRATION, "2026-10-21"), []);
    assert.deepEqual(noterUnTicketServi(racine, [], EXPIRATION, "2026-10-21"), []);
    assert.deepEqual(leconsDeLEtageCommun(racine).map((l) => l.id), ["C1"]);
    assert.deepEqual(noterUnTicketServi(racine, [], EXPIRATION, "2026-10-22"), ["C1"]);

    const lecon = lireEtage(racine).lecons[0]!;
    assert.equal(lecon.etat, "expired");
    assert.deepEqual(lecon.sortie, { date: "2026-10-22", reason: "expiry" });
    assert.deepEqual(leconsDeLEtageCommun(racine), []);
    assert.deepEqual(idsDeLEtageCommun(racine), []);
    assert.equal((await cookDe(t, racine, "alpha")).texte.includes(COMMUNE), false);
    assert.ok(jouer(racine).sortie.includes("no lesson is proposed"));
    assert.ok(jouer(racine).sortie.some((ligne) => ligne.startsWith(`C1  ${COMMUNE}  (expired 2026-10-22)`)));
    // Plus rien à expirer ensuite.
    assert.deepEqual(noterUnTicketServi(racine, [], EXPIRATION, "2026-10-23"), []);
    assert.equal(lireEtage(racine).lecons[0]!.sortie?.date, "2026-10-22");
  });

  test("une rétro qui la reconfirme remet le compte à zéro ; une retirée n'expire pas", (t) => {
    const racine = accepter(t);
    noterUnTicketServi(racine, [], EXPIRATION, "2026-10-21");
    noterUnTicketServi(racine, [{ kind: "reconfirm", id: "C1" }], EXPIRATION, "2026-10-21");
    noterUnTicketServi(racine, [], EXPIRATION, "2026-10-21");
    assert.deepEqual(noterUnTicketServi(racine, [], EXPIRATION, "2026-10-21"), []);
    assert.deepEqual(noterUnTicketServi(racine, [], EXPIRATION, "2026-10-21"), ["C1"]);

    const autre = accepter(t);
    assert.equal(jouer(autre, ["retire", "C1"]).code, 0);
    for (let i = 0; i < 5; i++) assert.deepEqual(noterUnTicketServi(autre, [], EXPIRATION, "2026-10-21"), []);
    assert.equal(lireEtage(autre).lecons[0]!.etat, "retired");
  });

  test("la rétro d'un cook peut citer l'id d'une leçon de l'étage, pas un id inconnu", () => {
    const tri = trierRetro("reconfirm C1\nreconfirm C2", carnetVide(), ["C1"]);
    assert.deepEqual(tri.kept, [{ kind: "reconfirm", id: "C1" }]);
    assert.deepEqual(tri.dropped.map((d) => d.reason), ["unknown-id"]);
    assert.deepEqual(trierRetro("reconfirm C1", carnetVide()).kept, []);
  });
});
