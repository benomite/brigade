// #3996, critère 1 : un push qui n'est pas une livraison pour la pass — un cook qui s'arrête — ne correspond à aucun
// déclencheur de workflow. Par la station, sur le vrai dépôt : le ticket a une PR ouverte (la CI y joue sur chaque push de
// sa branche), le cook reprend la branche, écrit, puis dit qu'il est bloqué. Ce que la station pousse alors est lu sur
// l'origine, et confronté aux `on:` des workflows de `.github/workflows/` comme GitHub les lit : un événement `push` sur la
// branche, et un événement `pull_request` `synchronize` si la branche poussée est la tête d'une PR ouverte.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { brancheDuTicket, stationDuDepot, type Lancer } from "../../src/brigade-github.ts";
import { ouvrirDepot } from "../../src/depot.ts";
import { FauxGitHub, STATION_DU_DEPOT, fauxClient } from "../faux-github.ts";
import { BASE, depotGit, ENV_GIT, git, repertoireTemporaire } from "../outils.ts";

const TICKET = 12;
const BRANCHE = brancheDuTicket(TICKET);
const WORKFLOWS = join(import.meta.dirname, "../../../.github/workflows");

const decommenter = (ligne: string) => ligne.replace(/(^|\s)#.*$/, "").trimEnd();
const retrait = (ligne: string) => ligne.length - ligne.trimStart().length;
const sansGuillemets = (texte: string) => texte.trim().replace(/^(["'])(.*)\1$/, "$2");
const motif = (glob: string) =>
  new RegExp(`^${glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*/g, "\u0000").replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]").replace(/\u0000/g, ".*")}$`);
const retenu = (motifs: string[], valeur: string) => {
  let retenue = false;
  for (const m of motifs) {
    const exclu = m.startsWith("!");
    if (motif(exclu ? m.slice(1) : m).test(valeur)) retenue = !exclu;
  }
  return retenue;
};

// Ce que dit un workflow d'un événement : `null` s'il ne l'écoute pas, sinon ses filtres (liste vide : sans filtre).
function evenement(source: string, nom: string): Record<string, string[]> | null {
  const lignes = source.split("\n").map(decommenter);
  const debut = lignes.findIndex((l) => /^["']?on["']?\s*:/.test(l));
  if (debut < 0) return {};
  const entete = (lignes[debut] ?? "").replace(/^["']?on["']?\s*:\s*/, "");
  if (entete !== "") {
    const noms = entete.replace(/^[[{]|[\]}]$/g, "").split(",").map((n) => sansGuillemets(n.split(":")[0] ?? ""));
    return noms.includes(nom) ? {} : null;
  }
  const corps: string[] = [];
  for (const l of lignes.slice(debut + 1)) {
    if (l.trim() === "") continue;
    if (retrait(l) === 0) break;
    corps.push(l);
  }
  const niveau = Math.min(...corps.map(retrait));
  let courant: Record<string, string[]> | null = null;
  let trouve: Record<string, string[]> | null = null;
  let cle = "";
  for (const l of corps) {
    const texte = l.trim();
    if (retrait(l) === niveau) {
      const m = /^-?\s*([\w-]+)\s*:?\s*(.*)$/.exec(texte);
      if (m?.[1] === nom) {
        courant = {};
        trouve = courant;
        if (m[2]?.startsWith("{")) for (const part of m[2].slice(1, -1).split(/,(?![^[]*\])/)) {
          const [k, v = ""] = part.split(":");
          if (k !== undefined) courant[k.trim()] = v.replace(/^[\s[]|[\s\]]$/g, "").split(",").map(sansGuillemets).filter(Boolean);
        }
      } else courant = null;
    } else if (courant !== null) {
      const m = /^([\w-]+)\s*:\s*(.*)$/.exec(texte);
      if (m?.[1] !== undefined) {
        cle = m[1];
        courant[cle] = (m[2] ?? "").replace(/^\[|\]$/g, "").split(",").map(sansGuillemets).filter(Boolean);
      } else if (texte.startsWith("- ") && cle !== "") (courant[cle] ??= []).push(sansGuillemets(texte.slice(2)));
    }
  }
  return trouve;
}

// Le push de `ref` déclenche-t-il ce workflow ? `tetePR` : la PR ouverte dont la tête est cette branche, visant `base`.
function declenche(source: string, ref: string, tetePR: { base: string; fichiers: string[] } | null): string | null {
  const branche = ref.startsWith("refs/heads/") ? ref.slice("refs/heads/".length) : null;
  const tag = ref.startsWith("refs/tags/") ? ref.slice("refs/tags/".length) : null;
  const push = evenement(source, "push");
  if (push !== null) {
    const [pour, sauf, pourTags, sauveTags] = [push.branches ?? [], push["branches-ignore"] ?? [], push.tags ?? [], push["tags-ignore"] ?? []];
    const sansFiltre = pour.length + sauf.length + pourTags.length + sauveTags.length === 0;
    if (branche !== null && (sansFiltre || (pour.length > 0 ? retenu(pour, branche) : (pourTags.length === 0 && sauf.length > 0 && !retenu(sauf, branche))))) return "push";
    if (tag !== null && (sansFiltre || retenu(pourTags, tag))) return "push";
  }
  const pr = evenement(source, "pull_request");
  if (pr !== null && tetePR !== null) {
    const types = pr.types ?? [];
    const base = pr.branches ?? [];
    const [chemins, sauf] = [pr.paths ?? [], pr["paths-ignore"] ?? []];
    const touche = chemins.length > 0 ? tetePR.fichiers.some((f) => retenu(chemins, f)) : sauf.length > 0 ? tetePR.fichiers.some((f) => !retenu(sauf, f)) : true;
    if ((types.length === 0 || types.includes("synchronize")) && (base.length === 0 || retenu(base, tetePR.base)) && touche) return "pull_request";
  }
  return null;
}


test("what the station pushes when a cook stops matches no CI workflow trigger, though the ticket's PR is open on the branch", async (t) => {
  const lieux = depotGit(t);
  const depot = ouvrirDepot({ clone: lieux.clone, base: BASE, worktrees: join(repertoireTemporaire(t), "worktrees"), env: ENV_GIT });
  // La branche déjà livrée, et sa PR ouverte.
  git(lieux.clone, "checkout", "-q", "-b", BRANCHE);
  writeFileSync(join(lieux.clone, "livraison.txt"), "livrée\n");
  git(lieux.clone, "add", ".");
  git(lieux.clone, "commit", "-q", "-m", "feat: the delivery");
  git(lieux.clone, "push", "-q", "origin", BRANCHE);
  const tete = git(lieux.clone, "rev-parse", "HEAD");
  git(lieux.clone, "checkout", "-q", BASE);
  git(lieux.clone, "branch", "-q", "-D", BRANCHE);
  const faux = new FauxGitHub();
  faux.feu(TICKET, ["fire", "model:opus", "effort:medium"], "## Acceptance criteria\n\n- It works");
  faux.prs.push({ number: 77, issue: TICKET, branche: BRANCHE, sha: tete, state: "open", merged: false, enRetard: false, mergeePar: null, fichiers: ["livraison.txt"] });
  const avant = git(lieux.origine, "for-each-ref", "--format=%(refname) %(objectname)");
  // Le cook reprend la branche, écrit de l'ouvrage, puis s'arrête sur une question.
  const lancer: Lancer = ({ cwd, flux }) => {
    writeFileSync(join(cwd, "en-cours.txt"), "à moitié fait\n");
    writeFileSync(flux, `${JSON.stringify({ type: "result", is_error: false, result: "I stopped.\n<livrable>\n<bloque>Which of the two formats?</bloque>\n</livrable>" })}\n`);
    return { fin: Promise.resolve({ code: 0, signal: null, turns: 30, tokens: 1, durationMs: 1, arret: null, erreur: null }) };
  };
  const station = stationDuDepot({ ...STATION_DU_DEPOT, base: BASE, github: fauxClient(faux), depot, flux: repertoireTemporaire(t), lancer, avertir: () => {} });
  if ("refus" in station) throw new Error(station.refus);
  for (let tour = 0; tour < 4; tour += 1) {
    await station.tour();
    await station.calme();
  }
  const apres = git(lieux.origine, "for-each-ref", "--format=%(refname) %(objectname)");
  const poussees = apres.split("\n").filter((ligne) => ligne !== "" && !avant.split("\n").includes(ligne)).map((ligne) => ligne.split(" ")[0] ?? "");
  assert.ok(poussees.length > 0, "the station pushed the stopped cook's work somewhere on the origin");
  const ouvertes = faux.prs.filter((pr) => pr.state === "open").map((pr) => `refs/heads/${pr.branche}`);
  const workflows = readdirSync(WORKFLOWS).filter((nom) => /\.ya?ml$/.test(nom));
  assert.ok(workflows.length > 0);
  for (const ref of poussees) {
    for (const nom of workflows) {
      const evt = declenche(readFileSync(join(WORKFLOWS, nom), "utf8"), ref, ouvertes.includes(ref) ? { base: "main", fichiers: ["livraison.txt", "en-cours.txt"] } : null);
      assert.equal(evt, null, `${nom} must not run on the push of ${ref} (a ${evt} event): it is not a delivery for the pass`);
    }
  }
});
