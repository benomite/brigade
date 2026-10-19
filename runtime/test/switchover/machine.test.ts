// La recette de la bascule, sur une installation de test — jamais sur la box :
// une machine qui sert trois projets à l'ancienne, chacun par son unité, ses
// drop-ins, leurs portes, ses gestes et leurs règles sudoers, et trois vrais runtimes qui
// tournent — l'un avec un cook en vol. On y installe le paquet de la station,
// construit depuis ce dépôt, comme le guide l'installe : son vrai postinst
// joue la bascule, puis démarre la station (`../update/helpers/machine.ts`).
// Personne ne tape d'autre commande.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import { lireConfiguration } from "../../src/station/configuration.ts";
import { lirePortes } from "../../src/station/doors.ts";
import { lireEnService } from "../../src/update/in-service.ts";
import { aArreter, BASE, depotGit, ecrireSuite, ENV_GIT, FAUX_BWRAP, FAUX_CLAUDE, fauxGh, type FauxGh, git, issueGitHub, jusqua, lancer, mort, repertoireTemporaire, tuerLesRelais, vivant } from "../outils.ts";
import { construirePaquet, sansDpkgDeb, uneMachine } from "../update/helpers/machine.ts";
import { ancienneMachine, GESTES_ANCIENS, type AncienProjet } from "./helpers.ts";

const MAIN = join(import.meta.dirname, "../../src/main.ts");
const FAUX_GH_GISTS = join(import.meta.dirname, "../pairing/fake-gh-gists.ts");

// Les réponses du faux `gh` pour un dépôt : ses tickets, leur issue et leurs commentaires.
function issuesDe(gh: FauxGh, depot: string, liste: ReturnType<typeof issueGitHub>[]) {
  for (const issue of liste) {
    gh.repondre(`repos/${depot}/issues/${issue.number}`, { corps: issue });
    gh.repondre(`repos/${depot}/issues/${issue.number}/comments?per_page=100`, { corps: [] });
  }
  gh.repondre(`repos/${depot}/issues?labels=fire&state=open&per_page=100`, { corps: liste });
}

describe("la bascule d'une machine servie à l'ancienne, sur une installation de test", { skip: sansDpkgDeb }, () => {
  let dossier = "";
  let paquet = "";
  before(() => {
    dossier = mkdtempSync(join(tmpdir(), "bascule-machine-test-"));
    paquet = construirePaquet(dossier, "1.0.0");
  });
  after(() => rmSync(dossier, { recursive: true, force: true }));

  test("installer le paquet reprend les trois projets — journal, décisions et ticket en cours intacts —, retire l'ancien chemin, et la cuisine reprend seule après un arrêt mesuré", async (t) => {
    const compte = repertoireTemporaire(t);
    const gists = repertoireTemporaire(t);
    const essais = repertoireTemporaire(t);
    const suite = join(essais, "suite.txt");
    const feu = join(essais, "feu");
    // Le cook commite, puis attend qu'on le laisse conclure ; le reviewer relit vert.
    ecrireSuite(suite, ["commite-puis-attend"]);
    const cuisine = {
      ...ENV_GIT,
      HOME: compte,
      BRIGADE_CLAUDE_BIN: FAUX_CLAUDE,
      FAUX_CLAUDE: "relit-vert",
      FAUX_CLAUDE_SUITE: suite,
      FAUX_CLAUDE_FEU: feu,
      BRIGADE_MAX_LOAD_PER_CORE: "1000000",
      BRIGADE_MIN_FREE_MEMORY_MB: "0",
      BRIGADE_MIN_FREE_DISK_MB: "0",
    };
    // La station publie sa présence sur GitHub : une doublure, ici.
    const machine = uneMachine(t, { ...cuisine, BRIGADE_GH_BIN: FAUX_GH_GISTS, FAUX_GISTS: gists });
    const station = machine.station;

    // GitHub, pour les trois projets : #15 attend un cook sur brigade, rien sur les deux autres.
    const { origine, clone } = depotGit(t);
    mkdirSync(join(clone, ".claude/brigade"), { recursive: true });
    writeFileSync(join(clone, ".claude/brigade/gates.sh"), '#!/usr/bin/env bash\ntest -f "$1/travail.txt" && echo "gates : VERT"\n');
    chmodSync(join(clone, ".claude/brigade/gates.sh"), 0o755);
    git(clone, "add", ".");
    git(clone, "commit", "-q", "-m", "les gates du projet");
    git(clone, "push", "-q", "origin", BASE);
    const gh = fauxGh(t);
    const depot = "benomite/brigade";
    const pr = { number: 40, html_url: `https://github.com/${depot}/pull/40`, state: "open", merged: false, mergeable: true, base: { ref: BASE }, head: { sha: "tete" } };
    gh.issues([issueGitHub(15, { labels: ["fire", "model:sonnet", "effort:low"] })]);
    gh.repondre(`repos/${depot}/pulls`, { statut: 201, corps: pr });
    gh.repondre(`repos/${depot}/issues/15/comments`, { statut: 201, corps: { id: 1 } });
    gh.repondre(`repos/${depot}/pulls?head=benomite:cook/*`, { corps: [pr] });
    gh.repondre(`repos/${depot}/pulls/40`, { corps: pr });
    gh.repondre(`repos/${depot}/commits/*/check-runs?per_page=100`, { corps: { check_runs: [] } });
    gh.repondre(`repos/${depot}/commits/*/status?per_page=100`, { corps: { statuses: [] } });
    gh.repondre(`repos/${depot}/pulls/40/merge`, { corps: { merged: true } });
    issuesDe(gh, "benomite/calculus-workspace", []);
    issuesDe(gh, "benomite/espace", []);

    // La machine telle que l'ancien chemin l'a laissée : trois unités, leurs
    // drop-ins — la cloison des tests à la place de bwrap —, leurs gestes et
    // leurs règles.
    const reglages = { BRIGADE_GH_BIN: gh.bin, BRIGADE_SANDBOX_BIN: FAUX_BWRAP, BRIGADE_SANDBOX_HIDDEN: station };
    const projets: AncienProjet[] = [
      { nom: "brigade", depot, base: BASE, environnement: { ...reglages, BRIGADE_SANDBOX_HIDDEN: `${station}:${clone}`, BRIGADE_REPO_DIR: clone } },
      { nom: "calculus-workspace", depot: "benomite/calculus-workspace", base: "main", environnement: reglages },
      { nom: "espace", depot: "benomite/espace", base: "main", environnement: reglages },
    ];
    const ancienne = ancienneMachine(machine.racine, projets, { arbitre: null, paquet: false });
    for (const { nom } of projets) aArreter(t, () => tuerLesRelais(ancienne.etat(nom)));

    // Les trois runtimes de l'ancien chemin, chacun avec l'environnement que
    // son unité lui donne, tenus par la doublure de systemd sous leur unité.
    mkdirSync(join(machine.racine, "run/faux-systemd"), { recursive: true });
    const vies = projets.map((projet) => {
      const vie = lancer(t, MAIN, [], {
        ...cuisine,
        ...projet.environnement,
        BRIGADE_STATE_DIR: ancienne.etat(projet.nom),
        BRIGADE_PROJECT: projet.nom,
        BRIGADE_REPO_DIR: projet.environnement?.BRIGADE_REPO_DIR ?? join(ancienne.etat(projet.nom), "depot"),
        BRIGADE_GITHUB_REPO: projet.depot,
        BRIGADE_BASE_BRANCH: projet.base,
      });
      writeFileSync(join(machine.racine, "run/faux-systemd", `brigade@${projet.nom}.service.pid`), String(vie.process.pid));
      return vie;
    });
    const faits = (nom: string, type?: string) => ancienne.faits(nom).filter((e) => type === undefined || e.type === type);
    for (const { nom } of projets) await jusqua(() => faits(nom, "runtime.started").length === 1);
    // Le ticket en cours : un cook de l'ancien runtime, en vol, qui a commencé son travail.
    await jusqua(() => faits("brigade", "cook.launched").length === 1);
    const run = String((faits("brigade", "cook.launched")[0]?.payload as { run: string }).run);
    const fichierDuPid = join(ancienne.etat("brigade"), "runs", `${run}.cook.pid`);
    await jusqua(() => existsSync(fichierDuPid));
    const pid = Number(readFileSync(fichierDuPid, "utf8"));
    await jusqua(() => existsSync(join(ancienne.etat("brigade"), "worktrees", run, "travail.txt")));

    // Avant : ce que chaque journal porte, et la machine.
    const avant = Object.fromEntries(projets.map(({ nom }) => [nom, faits(nom)]));
    const machineAvant = ancienne.photo();

    // Le geste du chef : installer le paquet. Rien d'autre.
    const installation = await new Promise<{ code: number; sortie: string }>((resoudre) =>
      execFile("apt-get", ["install", "-y", "-q", paquet], { env: machine.env, encoding: "utf8" }, (erreur, stdout, stderr) => resoudre({ code: erreur ? Number(erreur.code ?? 1) : 0, sortie: stdout + stderr })),
    );
    assert.equal(installation.code, 0, installation.sortie);
    t.diagnostic(installation.sortie.split("\n").filter((ligne) => ligne.startsWith("bascule")).join("\n"));

    // Les anciens runtimes se sont arrêtés ; le cook en vol, non.
    for (const vie of vies) assert.equal(await vie.fin, 0);
    assert.equal(vivant(pid), true);

    // La station sert les trois projets, sous une seule installation.
    const servis = lireEnService(station);
    assert.deepEqual(servis?.servis, ["brigade", "calculus-workspace", "espace"]);
    assert.equal(servis?.pid, machine.service().pid);
    assert.deepEqual(
      lireConfiguration(readFileSync(join(station, "projets"), "utf8")).projets.map((p) => [p.nom, p.depot, p.base]),
      projets.map((p) => [p.nom, p.depot, p.base]),
    );
    // Chacun sort par sa porte, que tiennent les portes de la station : une
    // chacun, et la sienne seulement.
    const portes = lirePortes(join(station, "portes.json"));
    assert.deepEqual(Object.keys(portes.projets), ["brigade", "calculus-workspace", "espace"]);
    assert.equal(new Set([portes.station, ...Object.values(portes.projets)]).size, 4);
    for (const { nom } of projets) {
      await jusqua(() => faits(nom, "isolation.configured").some((e) => (e.payload as { proxy: { port: number } | null }).proxy?.port === portes.projets[nom]));
    }

    // L'arrêt de la cuisine, mesuré par l'installation elle-même : de l'arrêt
    // des anciennes unités à la station qui sert les trois projets.
    const mesure = /bascule : cuisine reprise par la station — brigade, calculus-workspace, espace ; arrêtée (\d+ s|\d+ min \d\d s), de \d\d:\d\d:\d\d à \d\d:\d\d:\d\d/.exec(installation.sortie);
    assert.ok(mesure, installation.sortie);
    t.diagnostic(`interruption de la cuisine : ${mesure[1]}`);

    // Journal, décisions et ticket en cours : tout ce que chaque journal
    // portait avant y est, à l'identique, et la station écrit à sa suite.
    for (const { nom } of projets) {
      await jusqua(() => faits(nom, "runtime.started").length === 2);
      assert.deepEqual(faits(nom).slice(0, avant[nom]?.length), avant[nom], nom);
    }
    // Le cook en vol est repris par la station, sans être relancé ni interrompu.
    await jusqua(() => faits("brigade", "cook.resumed").length === 1);
    assert.deepEqual(faits("brigade", "cook.interrupted"), []);
    writeFileSync(feu, "");
    await jusqua(() => faits("brigade", "ticket.served").length === 1);
    await mort(pid);
    // Aucun cook neuf n'est parti sur #15 : celui de l'ancien runtime l'a livré (le reviewer, lui, a relu).
    assert.deepEqual(faits("brigade", "cook.launched").map((e) => (e.payload as { run: string }).run).filter((lance) => !lance.startsWith("review-")), [run]);
    const juge = faits("brigade", "pass.judged")[0]?.payload as { verdict: string; sha: string } | undefined;
    assert.deepEqual([juge?.verdict, juge?.sha], ["green", git(origine, "rev-parse", `cook/${run}`)]);

    // Ce que l'ancien chemin avait posé n'existe plus : ni ses unités, ni leurs
    // drop-ins, ni ses gestes, ni leurs règles.
    const apres = ancienne.photo();
    const restes = Object.keys(apres).filter((chemin) => /^etc\/systemd\/system\/(brigade@|brigade-porte@|[^/]+\.wants\/brigade(-porte)?@|brigade-renouvellement|timers\.target\.wants\/brigade-renouvellement)/.test(chemin));
    assert.deepEqual(restes, []);
    for (const geste of GESTES_ANCIENS) {
      assert.equal(`usr/local/bin/${geste}` in apres, false, geste);
      assert.equal(`etc/sudoers.d/${geste}` in apres, false, geste);
    }
    assert.equal(apres["usr/local/bin/brigade"], `-> ${join(machine.racine, "usr/lib/brigade-station/brigade")}`);
    // Et rien de ce qui n'était pas à lui n'a bougé : l'arbitre, une règle sans rapport.
    for (const reste of ["etc/systemd/system/brigade-arbitre.service", "etc/sudoers.d/brigade", "etc/sudoers.d/sauvegardes"]) assert.equal(apres[reste], machineAvant[reste], reste);
  });
});
