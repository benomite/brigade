// Ce que l'écran d'ajout propose au lieu de le demander : le calibrage d'un autre projet ou
// la valeur mesurée, la destination des sauvegardes sous la racine que la box accepte — et
// ce que le fichier des projets garde pour la fois suivante. Contre un faux `ssh`.
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { ajouterProjet, lireConfiguration } from "../src/config.ts";
import { EFFORTS, MODELES } from "../src/installation.ts";
import { destinationProposee, lireRacine, MESURE, proposerCalibrage, racineDuReglage } from "../src/proposition.ts";

function dossier(t: TestContext): string {
  const chemin = mkdtempSync(join(tmpdir(), "brigade-proposition-"));
  t.after(() => rmSync(chemin, { recursive: true, force: true }));
  return chemin;
}

const projet = (nom: string, calibrage?: Parameters<typeof proposerCalibrage>[0][number]["calibrage"]) => ({ nom, dossier: `/projets/${nom}`, ...(calibrage === undefined ? {} : { calibrage }) });

describe("le calibrage proposé", () => {
  test("sans autre projet, la valeur mesurée — qui est dans les listes que la box accepte", () => {
    const { calibrage, origine } = proposerCalibrage([projet("a")]);
    assert.deepEqual(calibrage, MESURE);
    for (const { modele, effort } of [MESURE.manager, MESURE.reviewer]) {
      assert.ok((MODELES as readonly string[]).includes(modele));
      assert.ok((EFFORTS as readonly string[]).includes(effort));
    }
    assert.match(origine, /value measured/);
  });

  test("avec des projets ajoutés ici, celui du dernier — et son nom dit d'où ça vient", () => {
    const opus = { manager: { modele: "opus", effort: "high" }, reviewer: { modele: "sonnet", effort: "low" } };
    const haiku = { manager: { modele: "haiku", effort: "low" }, reviewer: { modele: "haiku", effort: "low" } };
    const { calibrage, origine } = proposerCalibrage([projet("a", opus), projet("b", haiku), projet("c")]);
    assert.deepEqual(calibrage, haiku);
    assert.match(origine, /“b”/);
  });
});

describe("la destination proposée", () => {
  test("la racine, puis le nom — rien tant qu'il n'y a pas de nom", () => {
    assert.equal(destinationProposee("/var/backups/brigade", "calculus"), "/var/backups/brigade/calculus");
    assert.equal(destinationProposee("/var/backups/brigade", ""), undefined);
  });

  test("la racine se lit dans le réglage de la box, sans son slash final, et pas ailleurs", () => {
    assert.equal(racineDuReglage("ports=3128-3227\nsauvegardes=/var/backups/brigade/\n"), "/var/backups/brigade");
    assert.equal(racineDuReglage("# sauvegardes=/x\nports=1-2\n"), undefined);
    assert.equal(racineDuReglage("sauvegardes=relatif\n"), undefined);
    assert.equal(racineDuReglage(""), undefined);
  });

  test("lue sur la box par ssh : la racine, et d'où elle vient", async (t) => {
    const d = dossier(t);
    const ssh = join(d, "ssh");
    writeFileSync(ssh, `#!/bin/sh\necho "$@" > "${d}/args"\nprintf 'sauvegardes=/var/backups/brigade\\n'\n`);
    chmodSync(ssh, 0o755);
    const lue = await lireRacine({ ssh, delaiMs: 20_000, connexionS: 10 }, "box");
    assert.ok("racine" in lue);
    assert.equal(lue.racine, "/var/backups/brigade");
    assert.match(lue.origine, /“box” accepts.*\/etc\/brigade-installer\.conf/);
    assert.equal(readFileSync(join(d, "args"), "utf8").trim(), "-o BatchMode=yes -o ConnectTimeout=10 -- box cat /etc/brigade-installer.conf");
  });

  test("box pas jointe ou réglage sans racine : une raison, le champ reste à écrire", async (t) => {
    const d = dossier(t);
    const mort = join(d, "ssh-mort");
    writeFileSync(mort, "#!/bin/sh\nexit 255\n");
    const vide = join(d, "ssh-vide");
    writeFileSync(vide, "#!/bin/sh\nprintf 'ports=3128-3227\\n'\n");
    chmodSync(mort, 0o755);
    chmodSync(vide, 0o755);
    for (const ssh of [mort, vide]) {
      const lue = await lireRacine({ ssh, delaiMs: 20_000, connexionS: 10 }, "box");
      assert.ok("raison" in lue);
      assert.match(lue.raison, /type the destination/);
    }
  });
});

describe("le calibrage gardé dans le fichier des projets", () => {
  test("écrit avec le projet, relu pour le suivant ; un projet à la main n'en a pas", (t) => {
    const d = dossier(t);
    const chemin = join(d, "app.json");
    const calibrage = { manager: { modele: "opus", effort: "high" }, reviewer: { modele: "sonnet", effort: "medium" } };
    assert.equal(ajouterProjet(chemin, { nom: "a", dossier: d, hote: "box", calibrage }), undefined);
    assert.equal(ajouterProjet(chemin, { nom: "b", dossier: d, hote: "box" }), undefined);
    const { projets } = lireConfiguration(chemin);
    assert.deepEqual(projets[0]?.calibrage, calibrage);
    assert.equal(projets[1]?.calibrage, undefined);
    assert.deepEqual(proposerCalibrage(projets).calibrage, calibrage);
  });

  test("un calibrage incomplet dans le fichier n'est ni lu ni refusé", (t) => {
    const d = dossier(t);
    const chemin = join(d, "app.json");
    writeFileSync(chemin, JSON.stringify({ projets: [{ nom: "a", dossier: d, calibrage: { manager: { modele: "opus" } } }] }));
    const lue = lireConfiguration(chemin);
    assert.equal(lue.refus, undefined);
    assert.equal(lue.projets[0]?.calibrage, undefined);
  });
});
