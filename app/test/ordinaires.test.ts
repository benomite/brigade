// Le réglage « prendre aussi les tickets ordinaires » de la station Mac (#852) : écrit dans le
// fichier des projets, conservé à la relecture, remplacé hors d'un Mac par la raison pour laquelle ce
// poste n'en prend pas, et — quand la station dit son
// bac à sable indisponible — le message, avec la raison. Le fichier est un vrai fichier écrit par
// le test ; la vue est jouée telle qu'elle est, devant un faux document (aides/fausse-vue.ts).
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { ALLUMAGE } from "../src/allumage.ts";
import { pourLaBar } from "../src/bar.ts";
import { changerOrdinaires, EXEMPLE, lireConfiguration, type Project } from "../src/config.ts";
import { PALETTE } from "../src/couleurs.ts";
import { KITCHEN_ACTIONS } from "../src/kitchen.ts";
import { BANNIERE } from "../src/facts.ts";
import { CONFIRMES, DIRECTS } from "../src/actions.ts";
import { EFFORTS, MODELES } from "../src/projects/projects.ts";
import { ONGLETS, RUBRIQUES } from "../src/onglets.ts";
import { blocDesOrdinaires, explanation, sansSandbox, type FactsStation } from "../src/ordinaires.ts";
import { suivreConfiguration } from "../src/suivi.ts";
import type { Terminal } from "../src/terminaux.ts";
import { type Faux, jouerLaVue, ouvrirRead, repos } from "./aides/fausse-vue.ts";

function fichier(t: TestContext, contenu: unknown): { racine: string; chemin: string } {
  const racine = realpathSync(mkdtempSync(join(tmpdir(), "brigade-app-")));
  t.after(() => rmSync(racine, { recursive: true, force: true }));
  const chemin = join(racine, "app.json");
  writeFileSync(chemin, JSON.stringify(contenu));
  return { racine, chemin };
}
const lu = (chemin: string) => JSON.parse(readFileSync(chemin, "utf8")) as { projets: Record<string, unknown>[] };

const MAC = {};
const station = (sandbox: FactsStation["bacASable"]): FactsStation => ({ station: "mac/claude", distante: true, plafond: 2, ordinaires: true, bacASable: sandbox, prendOrdinaires: sandbox?.disponible === true });
const INDISPONIBLE = { disponible: false, raison: "Seatbelt (/usr/bin/sandbox-exec) is missing", version: null, depuis: "2026-10-16T10:00:00Z" };
const EXPLANATION = explanation("this computer");
const DISPONIBLE = { disponible: true, raison: null, version: "2.1.0", depuis: "2026-10-16T10:00:00Z" };

describe("le bloc des tickets ordinaires", () => {
  test("il existe pour un Mac dont la station cuit le projet, avec son réglage et la ligne d'explication", () => {
    assert.deepEqual(blocDesOrdinaires({ ...MAC }, "darwin", undefined, true), { reglable: true, actif: false, limite: null, explication: EXPLANATION });
    assert.deepEqual(blocDesOrdinaires({ ...MAC, ordinaires: true, limiteCooks: 3 }, "darwin", [station(DISPONIBLE)], true), { reglable: true, actif: true, limite: 3, explication: EXPLANATION });
    assert.equal(EXPLANATION, "Cooks on this computer run in Claude Code's sandbox: they write only in their own worktree, and reach only the network hosts on the project's list.");
  });

  test("hors d'un Mac, il n'est pas réglable : il dit, au nom de ce poste, qu'il ne prend aucun ticket ordinaire, et pourquoi — option cochée ou non", () => {
    for (const ordinaires of [true, false]) {
      assert.deepEqual(blocDesOrdinaires({ ...MAC, ordinaires, limiteCooks: 2 }, "win32", [station(DISPONIBLE)], true), {
        reglable: false,
        actif: false,
        limite: null,
        explication: "This computer takes no ordinary ticket: a cook of an ordinary ticket runs only in Claude Code's sandbox, which the station sets up only on macOS.",
      });
    }
    assert.equal(blocDesOrdinaires({ ...MAC }, "linux", undefined, true)?.explication, sansSandbox("this computer"));
    assert.match(sansSandbox("this computer"), /^This computer takes no ordinary ticket/);
  });

  test("il n'existe pas pour un projet que la station de ce poste ne cuit pas, quelle que soit la plateforme", () => {
    for (const plateforme of ["darwin", "win32", "linux"]) {
      assert.equal(blocDesOrdinaires({}, plateforme, undefined, false), undefined, plateforme);
    }
  });

  test("bac à sable indisponible : le message dit que le Mac ne prend pas de ticket ordinaire, avec la raison — option cochée ou non", () => {
    for (const ordinaires of [true, false]) {
      const bloc = blocDesOrdinaires({ ...MAC, ordinaires }, "darwin", [station(INDISPONIBLE)], true);
      assert.equal(bloc?.indisponible, "The sandbox is unavailable on this computer — Seatbelt (/usr/bin/sandbox-exec) is missing. This computer takes no ordinary ticket.");
    }
    assert.equal(blocDesOrdinaires({ ...MAC }, "darwin", [station(DISPONIBLE)], true)?.indisponible, undefined);
    // Elle n'en a rien dit : l'app ne devine pas.
    assert.equal(blocDesOrdinaires({ ...MAC }, "darwin", [station(null)], true)?.indisponible, undefined);
  });
});

describe("les tickets ordinaires dans le fichier des projets", () => {
  test("le réglage s'écrit, se relit à la lecture suivante, et rien d'autre du fichier ne bouge", (t) => {
    const { racine, chemin } = fichier(t, { note: "à moi", projets: [{ nom: "a", dossier: "/" }, { nom: "b", dossier: "/" }] });
    assert.equal(changerOrdinaires(chemin, "a", true, 3, racine), undefined);
    assert.deepEqual(lu(chemin).projets[0], { nom: "a", dossier: "/", ordinaires: true, limiteCooks: 3 });
    assert.deepEqual(lu(chemin).projets[1], { nom: "b", dossier: "/" });
    const relu = lireConfiguration(chemin).projets[0];
    assert.equal(relu?.ordinaires, true);
    assert.equal(relu?.limiteCooks, 3);

    // Sans limite : celle qui était écrite s'en va.
    assert.equal(changerOrdinaires(chemin, "a", false, null, racine), undefined);
    assert.deepEqual(lu(chemin).projets[0], { nom: "a", dossier: "/", ordinaires: false });
  });

  test("une valeur qui n'en est pas une, ou un projet absent, n'écrit rien — et le dit", (t) => {
    const { racine, chemin } = fichier(t, { projets: [{ nom: "a", dossier: "/" }] });
    const avant = readFileSync(chemin, "utf8");
    assert.match(changerOrdinaires(chemin, "a", "oui", 2, racine) ?? "", /^nothing was written: .*true or false/);
    for (const limit of [0, -1, 1.5, "2", Number.NaN]) assert.match(changerOrdinaires(chemin, "a", true, limit, racine) ?? "", /^nothing was written: .*whole number/, String(limit));
    assert.equal(changerOrdinaires(chemin, "z", true, 2, racine), "“z” is not in this file: nothing was changed there");
    assert.equal(readFileSync(chemin, "utf8"), avant);
  });

  test("un fichier écrit à la main avec un réglage mal formé est refusé, en le disant", (t) => {
    const { racine, chemin } = fichier(t, { projets: [{ nom: "a", dossier: "/", ordinaires: "oui" }] });
    assert.match(lireConfiguration(chemin).refus ?? "", /^project #1 \(a\): “ordinaires” must be true or false/);
    writeFileSync(chemin, JSON.stringify({ projets: [{ nom: "a", dossier: racine, limiteCooks: 0 }] }));
    assert.match(lireConfiguration(chemin).refus ?? "", /^project #1 \(a\): “limiteCooks” must be a whole number/);
  });

  test("suivi, le fichier dit tout de suite le réglage écrit", (t) => {
    const { racine, chemin } = fichier(t, { projets: [{ nom: "a", dossier: "/" }] });
    const dits: Project[][] = [];
    const suivie = suivreConfiguration({ chemin, maison: racine, surChangement: (configuration) => void dits.push(configuration.projets) });
    t.after(() => suivie.fermer());
    assert.equal(suivie.changerOrdinaires("a", true, 2), undefined);
    assert.equal(suivie.configuration().projets[0]?.ordinaires, true);
    assert.equal(dits.at(-1)?.[0]?.limiteCooks, 2);
  });
});

describe("les tickets ordinaires dans la vue", () => {
  const PARADE: Project = { nom: "parade", dossier: "/tmp/parade" };
  const SECOND: Terminal = { id: 1, projet: "parade", genre: "second", titre: "second · claude", note: "", arrete: false };

  const jouer = (project: Project, bloc: ReturnType<typeof blocDesOrdinaires>, regler: (...args: unknown[]) => string | undefined = () => undefined, workstation?: { nom: string; mac: boolean }) =>
    jouerLaVue({
      demarrage: () => ({
        ...(workstation === undefined ? {} : { poste: workstation }),
        configuration: pourLaBar({ chemin: "/tmp/app.json", projets: [project] }, () => true, () => true),
        palette: PALETTE,
        exemple: EXEMPLE,
        onglets: ONGLETS,
        rubriques: RUBRIQUES,
        gestes: { allumage: ALLUMAGE, cuisine: KITCHEN_ACTIONS, directs: DIRECTS, confirmes: CONFIRMES },
        banniere: BANNIERE,
        calibrage: { modeles: MODELES, efforts: EFFORTS },
        code: undefined,
      }),
      espace: () => [SECOND],
      ordinaires: () => bloc,
      reglerOrdinaires: regler,
    });
  const ouvrir = async (vue: Awaited<ReturnType<typeof jouer>>) => {
    (vue.element("projets").children.at(1) ?? assert.fail("pas de case")).click();
    await repos();
    await ouvrirRead(vue, "Settings");
  };
  const champs = (bloc: Faux) => bloc.dessous("input");
  // L'option est l'interrupteur de l'app (composants/switch) ; la limite est le seul champ.
  const toggle = (bloc: Faux) => bloc.dessous("button").find(({ role }) => role === "switch");

  // Les lignes du bloc : le nom de chaque réglage, sans son étiquette de niveau (« this computer », que la rangée pose à
  // côté de son nom — composants/setting), et sa valeur.
  const nameDe = (name: Faux | undefined) => name?.textContent.slice(0, name.textContent.length - (name.children.find(({ className }) => className === "niveau")?.textContent.length ?? 0));
  const lines = (bloc: Faux) => bloc.dessous("div").filter(({ className }) => className === "reglage").map((line) => [nameDe(line.children[0]), line.children[1]?.children[0]?.textContent]);
  const refusal = (bloc: Faux) => bloc.dessous("p").filter(({ className }) => className === "dit refus").map(({ textContent }) => textContent);

  test("dans Settings, sous cette machine : deux lignes — les prendre, et combien de cooks à la fois —, l'explication au survol", async () => {
    const vue = await jouer(PARADE, blocDesOrdinaires({ ...PARADE, ordinaires: true, limiteCooks: 2 }, "darwin", undefined, true));
    await ouvrir(vue);
    const bloc = vue.element("ordinaires");
    assert.equal(bloc.hidden, false);
    const [limit] = champs(bloc);
    const option = toggle(bloc);
    assert.equal(option?.ariaChecked, "true");
    assert.equal(limit?.value, "2");
    assert.deepEqual(lines(bloc), [["ordinary tickets", "taken"], ["cooks at once", "2"]]);
    // Ni titre ni paragraphe : l'explication est au survol de la valeur.
    assert.deepEqual(bloc.dessous("h3"), []);
    assert.ok(bloc.dessous("button").some(({ ariaLabel }) => ariaLabel === EXPLANATION));
    assert.deepEqual(refusal(bloc), []);
    assert.equal(limit?.ariaLabel, "Cooks this computer runs at once");
    assert.equal(option?.ariaLabel, "Take the ordinary tickets on this computer");
  });

  test("régler l'option ou la limite l'envoie au process principal, qui l'écrit", async () => {
    const vue = await jouer(PARADE, blocDesOrdinaires(PARADE, "darwin", undefined, true));
    await ouvrir(vue);
    const [limit] = champs(vue.element("ordinaires"));
    const option = toggle(vue.element("ordinaires"));
    assert.equal(option?.ariaChecked, "false");
    assert.equal(limit?.value, "");
    if (option === undefined || limit === undefined) return assert.fail("pas de champs");
    option.click();
    await repos();
    assert.deepEqual(vue.dernier("reglerOrdinaires"), ["parade", true, null]);
    limit.value = "4";
    limit.declencher("change");
    await repos();
    assert.deepEqual(vue.dernier("reglerOrdinaires"), ["parade", true, 4]);
  });

  test("un réglage refusé dit pourquoi, sous sa ligne", async () => {
    const vue = await jouer(PARADE, blocDesOrdinaires(PARADE, "darwin", undefined, true), () => "nothing was written: EACCES");
    await ouvrir(vue);
    const option = toggle(vue.element("ordinaires"));
    if (option === undefined) return assert.fail("pas d'interrupteur");
    option.click();
    await repos();
    assert.deepEqual(refusal(vue.element("ordinaires")), ["nothing was written: EACCES"]);
  });

  test("bac à sable indisponible : le message est à côté de l'option, avec la raison, et dit que le Mac ne prend pas de ticket ordinaire", async () => {
    const vue = await jouer(PARADE, blocDesOrdinaires({ ...PARADE, ordinaires: true }, "darwin", [station(INDISPONIBLE)], true));
    await ouvrir(vue);
    const dits = refusal(vue.element("ordinaires"));
    assert.equal(dits.length, 1);
    assert.match(dits[0] ?? "", /sandbox is unavailable.*Seatbelt \(\/usr\/bin\/sandbox-exec\) is missing.*takes no ordinary ticket/);
  });

  test("sous Windows, rien ne se règle : ni option ni limite, ni ligne qui l'explique", async () => {
    const vue = await jouer(PARADE, blocDesOrdinaires({ ...PARADE, ordinaires: true }, "win32", undefined, true), undefined, { nom: "this computer", mac: false });
    await ouvrir(vue);
    const bloc = vue.element("ordinaires");
    assert.equal(bloc.hidden, true);
    assert.equal(champs(bloc).length, 0);
    assert.ok(!vue.element("reglages-machine").dessous("div").some(({ dataset }) => dataset.cle === "ordinaires"));
  });

  test("projet que la station de ce poste ne cuit pas, rien n'est posé : pas d'option", async () => {
    const vue = await jouer(PARADE, blocDesOrdinaires(PARADE, "win32", undefined, false));
    await ouvrir(vue);
    assert.equal(vue.element("ordinaires").hidden, true);
    assert.equal(champs(vue.element("ordinaires")).length, 0);
  });
});
