// Le réglage « prendre aussi les tickets ordinaires » de la station Mac (#852) : écrit dans le
// fichier des projets, conservé à la relecture, absent hors d'un Mac, et — quand la station dit son
// bac à sable indisponible — le message, avec la raison. Le fichier est un vrai fichier écrit par
// le test ; la vue est jouée telle qu'elle est, devant un faux document (aides/fausse-vue.ts).
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { ALLUMAGE } from "../src/allumage.ts";
import { pourLaBarre } from "../src/barre.ts";
import { BOUTONS } from "../src/boutons.ts";
import { changerOrdinaires, EXEMPLE, lireConfiguration, type Projet } from "../src/config.ts";
import { PALETTE } from "../src/couleurs.ts";
import { KITCHEN_ACTIONS } from "../src/kitchen.ts";
import { BANNIERE } from "../src/facts.ts";
import { CONFIRMES, DIRECTS, GRANTS } from "../src/gestes.ts";
import { GESTES_DES_GRANTS } from "../src/grants.ts";
import { EFFORTS, MODELES } from "../src/projets/projets.ts";
import { GESTES_DU_MANAGER } from "../src/manager.ts";
import { ONGLETS, RUBRIQUES } from "../src/onglets.ts";
import { blocDesOrdinaires, EXPLICATION, type FactsStation } from "../src/ordinaires.ts";
import { suivreConfiguration } from "../src/suivi.ts";
import type { Terminal } from "../src/terminaux.ts";
import { type Faux, jouerLaVue, ouvrirLecture, repos } from "./aides/fausse-vue.ts";

function fichier(t: TestContext, contenu: unknown): { racine: string; chemin: string } {
  const racine = realpathSync(mkdtempSync(join(tmpdir(), "brigade-app-")));
  t.after(() => rmSync(racine, { recursive: true, force: true }));
  const chemin = join(racine, "app.json");
  writeFileSync(chemin, JSON.stringify(contenu));
  return { racine, chemin };
}
const lu = (chemin: string) => JSON.parse(readFileSync(chemin, "utf8")) as { projets: Record<string, unknown>[] };

const MAC = { stations: ["mac/claude"] };
const station = (bacASable: FactsStation["bacASable"]): FactsStation => ({ station: "mac/claude", distante: true, plafond: 2, ordinaires: true, bacASable, prendOrdinaires: bacASable?.disponible === true });
const INDISPONIBLE = { disponible: false, raison: "Seatbelt (/usr/bin/sandbox-exec) is missing", version: null, depuis: "2026-10-16T10:00:00Z" };
const DISPONIBLE = { disponible: true, raison: null, version: "2.1.0", depuis: "2026-10-16T10:00:00Z" };

describe("le bloc des tickets ordinaires", () => {
  test("il existe pour un Mac qui joue une station du projet, avec son réglage et la ligne d'explication", () => {
    assert.deepEqual(blocDesOrdinaires({ ...MAC }, "darwin", undefined), { actif: false, limite: null, explication: EXPLICATION });
    assert.deepEqual(blocDesOrdinaires({ ...MAC, ordinaires: true, limiteCooks: 3 }, "darwin", [station(DISPONIBLE)]), { actif: true, limite: 3, explication: EXPLICATION });
    assert.match(EXPLICATION, /sandbox.*write only in their own worktree.*network hosts on the project's list/);
  });

  test("il n'existe pas pour une station qui n'est pas un Mac, ni pour un projet dont ce poste ne joue aucune station", () => {
    for (const plateforme of ["linux", "win32", "android"]) assert.equal(blocDesOrdinaires({ ...MAC, ordinaires: true }, plateforme, [station(DISPONIBLE)]), undefined, plateforme);
    assert.equal(blocDesOrdinaires({}, "darwin", undefined), undefined);
    assert.equal(blocDesOrdinaires({ stations: [] }, "darwin", undefined), undefined);
  });

  test("bac à sable indisponible : le message dit que le Mac ne prend pas de ticket ordinaire, avec la raison — option cochée ou non", () => {
    for (const ordinaires of [true, false]) {
      const bloc = blocDesOrdinaires({ ...MAC, ordinaires }, "darwin", [station(INDISPONIBLE)]);
      assert.equal(bloc?.indisponible, "The sandbox is unavailable on this Mac — Seatbelt (/usr/bin/sandbox-exec) is missing. The Mac takes no ordinary ticket.");
    }
    assert.equal(blocDesOrdinaires({ ...MAC }, "darwin", [station(DISPONIBLE)])?.indisponible, undefined);
    // Elle n'en a rien dit : l'app ne devine pas.
    assert.equal(blocDesOrdinaires({ ...MAC }, "darwin", [station(null)])?.indisponible, undefined);
    // Une autre station que celles que ce poste joue ne parle pas pour lui.
    assert.equal(blocDesOrdinaires({ stations: ["atelier/claude"] }, "darwin", [station(INDISPONIBLE)])?.indisponible, undefined);
  });
});

describe("les tickets ordinaires dans le fichier des projets", () => {
  test("le réglage s'écrit, se relit à la lecture suivante, et rien d'autre du fichier ne bouge", (t) => {
    const { racine, chemin } = fichier(t, { note: "à moi", projets: [{ nom: "a", dossier: "/", hote: "box", stations: ["mac/claude"] }, { nom: "b", dossier: "/" }] });
    assert.equal(changerOrdinaires(chemin, "a", true, 3, racine), undefined);
    assert.deepEqual(lu(chemin).projets[0], { nom: "a", dossier: "/", hote: "box", stations: ["mac/claude"], ordinaires: true, limiteCooks: 3 });
    assert.deepEqual(lu(chemin).projets[1], { nom: "b", dossier: "/" });
    const relu = lireConfiguration(chemin).projets[0];
    assert.equal(relu?.ordinaires, true);
    assert.equal(relu?.limiteCooks, 3);

    // Sans limite : celle qui était écrite s'en va.
    assert.equal(changerOrdinaires(chemin, "a", false, null, racine), undefined);
    assert.deepEqual(lu(chemin).projets[0], { nom: "a", dossier: "/", hote: "box", stations: ["mac/claude"], ordinaires: false });
  });

  test("une valeur qui n'en est pas une, ou un projet absent, n'écrit rien — et le dit", (t) => {
    const { racine, chemin } = fichier(t, { projets: [{ nom: "a", dossier: "/" }] });
    const avant = readFileSync(chemin, "utf8");
    assert.match(changerOrdinaires(chemin, "a", "oui", 2, racine) ?? "", /^nothing was written: .*true or false/);
    for (const limite of [0, -1, 1.5, "2", Number.NaN]) assert.match(changerOrdinaires(chemin, "a", true, limite, racine) ?? "", /^nothing was written: .*whole number/, String(limite));
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
    const dits: Projet[][] = [];
    const suivie = suivreConfiguration({ chemin, maison: racine, surChangement: (configuration) => void dits.push(configuration.projets) });
    t.after(() => suivie.fermer());
    assert.equal(suivie.changerOrdinaires("a", true, 2), undefined);
    assert.equal(suivie.configuration().projets[0]?.ordinaires, true);
    assert.equal(dits.at(-1)?.[0]?.limiteCooks, 2);
  });
});

describe("les tickets ordinaires dans la vue", () => {
  const PARADE: Projet = { nom: "parade", dossier: "/tmp/parade", box: { hote: "box" }, stations: ["mac/claude"] };
  const SECOND: Terminal = { id: 1, projet: "parade", genre: "second", titre: "second · claude", note: "", arrete: false };

  const jouer = (projet: Projet, bloc: ReturnType<typeof blocDesOrdinaires>, regler: (...args: unknown[]) => string | undefined = () => undefined) =>
    jouerLaVue({
      demarrage: () => ({
        configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [projet], hotes: ["box"] }),
        palette: PALETTE,
        exemple: EXEMPLE,
        onglets: ONGLETS,
        rubriques: RUBRIQUES,
        boutons: BOUTONS,
        gestes: { manager: GESTES_DU_MANAGER, allumage: ALLUMAGE, cuisine: KITCHEN_ACTIONS, grants: { gestes: GESTES_DES_GRANTS, nommes: GRANTS }, directs: DIRECTS, confirmes: CONFIRMES },
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
    await ouvrirLecture(vue, "General");
  };
  const champs = (bloc: Faux) => bloc.dessous("input");

  test("sous Paramètres : l'option, la limite de cooks et une seule ligne d'explication, à côté", async () => {
    const vue = await jouer(PARADE, blocDesOrdinaires({ ...PARADE, ordinaires: true, limiteCooks: 2 }, "darwin", undefined));
    await ouvrir(vue);
    const bloc = vue.element("ordinaires");
    assert.equal(bloc.hidden, false);
    const [option, limite] = champs(bloc);
    assert.equal(option?.checked, true);
    assert.equal(limite?.value, "2");
    assert.deepEqual(bloc.dessous("p").map(({ textContent }) => textContent), [EXPLICATION]);
  });

  test("régler l'option ou la limite l'envoie au process principal, qui l'écrit", async () => {
    const vue = await jouer(PARADE, blocDesOrdinaires(PARADE, "darwin", undefined));
    await ouvrir(vue);
    const [option, limite] = champs(vue.element("ordinaires"));
    assert.equal(option?.checked, false);
    assert.equal(limite?.value, "");
    if (option === undefined || limite === undefined) return assert.fail("pas de champs");
    option.checked = true;
    option.declencher("change");
    await repos();
    assert.deepEqual(vue.dernier("reglerOrdinaires"), ["parade", true, null]);
    limite.value = "4";
    limite.declencher("change");
    await repos();
    assert.deepEqual(vue.dernier("reglerOrdinaires"), ["parade", true, 4]);
  });

  test("un réglage refusé dit pourquoi, sous le bloc", async () => {
    const vue = await jouer(PARADE, blocDesOrdinaires(PARADE, "darwin", undefined), () => "nothing was written: EACCES");
    await ouvrir(vue);
    const [option] = champs(vue.element("ordinaires"));
    if (option === undefined) return assert.fail("pas de case");
    option.declencher("change");
    await repos();
    assert.ok(vue.element("ordinaires").dessous("p").some(({ className, textContent }) => className === "refus" && textContent === "nothing was written: EACCES"));
  });

  test("bac à sable indisponible : le message est à côté de l'option, avec la raison, et dit que le Mac ne prend pas de ticket ordinaire", async () => {
    const vue = await jouer(PARADE, blocDesOrdinaires({ ...PARADE, ordinaires: true }, "darwin", [station(INDISPONIBLE)]));
    await ouvrir(vue);
    const dits = vue.element("ordinaires").dessous("p").filter(({ className }) => className === "indisponible");
    assert.equal(dits.length, 1);
    assert.match(dits[0]?.textContent ?? "", /sandbox is unavailable.*Seatbelt \(\/usr\/bin\/sandbox-exec\) is missing.*takes no ordinary ticket/);
  });

  test("hors d'un Mac, rien n'est posé : pas d'option", async () => {
    const vue = await jouer(PARADE, blocDesOrdinaires(PARADE, "linux", undefined));
    await ouvrir(vue);
    assert.equal(vue.element("ordinaires").hidden, true);
    assert.equal(champs(vue.element("ordinaires")).length, 0);
  });
});
