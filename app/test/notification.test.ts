// La notification de l'urgence (notification.ts) : ce que l'app retient des clics du chef, et le clic
// dans la vue, qui ouvre le projet sur sa ligne d'urgence et son geste.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { signalDe, type Alert } from "../src/alerts.ts";
import { ALLUMAGE } from "../src/allumage.ts";
import { pourLaBar } from "../src/bar.ts";
import { EXEMPLE, type Project } from "../src/config.ts";
import { PALETTE } from "../src/couleurs.ts";
import { KITCHEN_ACTIONS } from "../src/kitchen.ts";
import { BANNIERE } from "../src/facts.ts";
import { CONFIRMES, DIRECTS } from "../src/actions.ts";
import { EFFORTS, MODELES } from "../src/projects/projects.ts";
import { memoireDansFichier } from "../src/notification.ts";
import { ONGLETS, RUBRIQUES } from "../src/onglets.ts";
import { jouerLaVue, repos } from "./aides/fausse-vue.ts";

const DAY = "2026-10-15";
const heure = (h: string) => `${DAY}T${h}.000Z`;

// Un répertoire à soi, retiré en fin de test.
function repertoire(t: TestContext, name: string): string {
  const cree = mkdtempSync(join(tmpdir(), `brigade-app-${name}-`));
  t.after(() => rmSync(cree, { recursive: true, force: true }));
  return cree;
}

describe("l'app fermée, puis rouverte", () => {
  test("le fichier des clics : absent ou illisible, il ne retient rien ; écrit, il se relit ; une écriture ratée se dit", (t) => {
    const dossier = repertoire(t, "urgences");
    const chemin = join(dossier, "urgences.json");
    assert.deepEqual(memoireDansFichier(chemin).lire(), {});
    writeFileSync(chemin, "pas du json");
    assert.deepEqual(memoireDansFichier(chemin).lire(), {});
    writeFileSync(chemin, JSON.stringify({ acquittees: { parade: heure("08:35:00"), baloo: 3 } }));
    assert.deepEqual(memoireDansFichier(chemin).lire(), { parade: heure("08:35:00") });

    memoireDansFichier(chemin).ecrire({ parade: heure("10:35:00") });
    assert.deepEqual(JSON.parse(readFileSync(chemin, "utf8")), { acquittees: { parade: heure("10:35:00") } });
    assert.deepEqual(memoireDansFichier(chemin).lire(), { parade: heure("10:35:00") });

    // Un dossier là où le fichier devrait être : rien n'est écrit, et c'est dit.
    const dits: string[] = [];
    memoireDansFichier(dossier, (line) => void dits.push(line)).ecrire({ parade: heure("10:35:00") });
    assert.equal(dits.length, 1);
    assert.match(dits[0] ?? "", /^brigade: the clicked urgent notifications could not be remembered — /);
  });
});

describe("le clic, dans la vue", () => {
  const PARADE: Project = { nom: "parade", dossier: "/tmp/parade" };
  const BALOO: Project = { nom: "baloo", dossier: "/tmp/baloo" };
  const ouvrir = () =>
    jouerLaVue({
      demarrage: () => ({
        configuration: pourLaBar({ chemin: "/tmp/app.json", projets: [PARADE, BALOO] }, () => true),
        palette: PALETTE,
        exemple: EXEMPLE,
        onglets: ONGLETS,
        rubriques: RUBRIQUES,
        gestes: { allumage: ALLUMAGE, cuisine: KITCHEN_ACTIONS, directs: DIRECTS, confirmes: CONFIRMES },
        banniere: BANNIERE,
        calibrage: { modeles: MODELES, efforts: EFFORTS },
        code: undefined,
      }),
      espace: () => [],
    });
  const URGENTE: Alert = { sujet: "urgence", verifie: true, ton: "rouge", dit: "the whole kitchen is waiting for your merge of #535 — at a standstill for 5 h 28", releve: "#535  livraison verte — à merger à la main", geste: "do what #535 waits for, as the box writes it", bouton: "ask the second", appel: { demande: true }, prix: "none" };
  const ORDINAIRE: Alert = { sujet: "cuisine", verifie: true, ton: "rouge", dit: "kitchen stopped by your “stop”: no cook goes, until “resume”", geste: "resume the kitchen", appel: { geste: "reprendre" }, prix: "—" };

  test("depuis un autre projet : celui de l'urgence s'ouvre, sa ligne d'urgence en tête, choisie, et son geste prend le clavier et se lance", async () => {
    const vue = await ouvrir();
    vue.element("projets").children[2]?.click();
    await repos();
    assert.equal(vue.dernier("espace")[0], "baloo");
    vue.dire("surAlertes", { projet: "parade", alertes: [URGENTE, ORDINAIRE], signal: signalDe([URGENTE, ORDINAIRE]) });

    vue.dire("surUrgence", "parade");
    await repos();
    assert.equal(vue.dernier("espace")[0], "parade");
    assert.equal(vue.element("espace").textContent, "parade");
    const [first, seconde] = vue.element("alertes").children;
    assert.equal(vue.element("alertes").hidden, false);
    assert.equal(first?.dataset.sujet, "urgence");
    assert.equal(first.dataset.choisie, "oui");
    assert.equal(seconde?.dataset.choisie, undefined);
    const action = first.dessous("button").find((pose) => pose.dataset.geste !== undefined) ?? assert.fail("pas de geste sur la ligne d'urgence");
    assert.equal(action.textContent, "ask the second");
    assert.equal(action.disabled, false);
    assert.ok(action.focalise > 0, "le geste de l'urgence n'a pas pris le clavier");

    action.click();
    await repos();
    assert.deepEqual(vue.dernier("demanderAlerte"), ["parade", "urgence", URGENTE.dit]);
  });

  test("la bande relue garde la ligne choisie ; un autre projet ouvert, elle ne l'est plus", async () => {
    const vue = await ouvrir();
    vue.dire("surAlertes", { projet: "parade", alertes: [URGENTE], signal: signalDe([URGENTE]) });
    vue.dire("surUrgence", "parade");
    await repos();
    vue.dire("surAlertes", { projet: "parade", alertes: [URGENTE, ORDINAIRE], signal: signalDe([URGENTE, ORDINAIRE]) });
    assert.equal(vue.element("alertes").children[0]?.dataset.choisie, "oui");

    vue.element("projets").children[2]?.click();
    await repos();
    vue.element("projets").children[1]?.click();
    await repos();
    assert.equal(vue.element("alertes").children[0]?.dataset.choisie, undefined);
  });

  test("le projet déjà ouvert : il ne se rouvre pas, sa ligne d'urgence est choisie", async () => {
    const vue = await ouvrir();
    vue.element("projets").children[1]?.click();
    await repos();
    const ouvertures = vue.appels.filter(({ geste: action }) => action === "espace").length;
    vue.dire("surAlertes", { projet: "parade", alertes: [URGENTE], signal: signalDe([URGENTE]) });

    vue.dire("surUrgence", "parade");
    await repos();
    assert.equal(vue.appels.filter(({ geste: action }) => action === "espace").length, ouvertures);
    assert.equal(vue.element("alertes").children[0]?.dataset.choisie, "oui");
  });

  test("un projet qui n'est plus dans le fichier : rien ne s'ouvre", async () => {
    const vue = await ouvrir();
    const avant = vue.appels.length;
    vue.dire("surUrgence", "parti");
    await repos();
    assert.equal(vue.appels.length, avant);
  });
});
