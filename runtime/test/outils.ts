// Outils communs aux tests. Aucun test ne lit BRIGADE_STATE_DIR : chacun crée
// son répertoire d'état temporaire, détruit à la fin du test.
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TestContext } from "node:test";
import type { Fait } from "../src/evenements.ts";
import type { Journal } from "../src/journal.ts";
import type { Projection } from "../src/projection.ts";

export function repertoireTemporaire(t: TestContext): string {
  const repertoire = mkdtempSync(join(tmpdir(), "brigade-test-"));
  t.after(() => rmSync(repertoire, { recursive: true, force: true }));
  return repertoire;
}

// Un fait d'un domaine que le runtime ne connaît pas encore (rail, pass…) : le
// journal doit le porter sans le comprendre.
export function faitInconnu(type: string, payload: Record<string, unknown> = {}): Fait {
  return { type, payload } as unknown as Fait;
}

// Horloge qui avance d'une seconde à chaque lecture, pour des horodatages
// distincts et prévisibles.
export function horloge(depart = "2026-10-08T10:00:00.000Z"): () => Date {
  let instant = Date.parse(depart);
  return () => {
    const date = new Date(instant);
    instant += 1000;
    return date;
  };
}

// L'état complet des projections : le contenu de chacune de leurs tables.
export function photographier(journal: Journal, projections: Projection[]): Record<string, unknown[]> {
  const photo: Record<string, unknown[]> = {};
  for (const projection of projections) {
    for (const table of projection.tables) {
      photo[`${projection.nom}/${table}`] = journal.base.lire(`SELECT * FROM ${table} ORDER BY rowid`);
    }
  }
  return photo;
}

export type Enfant = {
  process: ChildProcess;
  sortie: () => string;
  // Résout dès que la sortie (stdout + stderr) contient `texte`.
  attendre: (texte: string) => Promise<void>;
  // Résout à la mort du process, avec son code de sortie (null s'il est mort d'un signal).
  fin: Promise<number | null>;
};

// Lance un fichier TypeScript dans un vrai process Node, tué à la fin du test
// s'il vit encore. L'environnement est celui qu'on lui donne, rien de plus :
// un BRIGADE_STATE_DIR posé dans le shell du dev ne lui parvient jamais.
export function lancer(t: TestContext, fichier: string, args: string[] = [], env: Record<string, string> = {}): Enfant {
  const enfant = spawn(process.execPath, [fichier, ...args], {
    env: { PATH: process.env.PATH ?? "", ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let sortie = "";
  const attentes: Array<() => void> = [];
  const noter = (morceau: Buffer) => {
    sortie += morceau.toString();
    for (const verifier of attentes) verifier();
  };
  enfant.stdout.on("data", noter);
  enfant.stderr.on("data", noter);
  const fin = new Promise<number | null>((resoudre) => enfant.on("close", (code) => resoudre(code)));
  t.after(() => {
    enfant.kill("SIGKILL");
  });
  return {
    process: enfant,
    sortie: () => sortie,
    fin,
    attendre: (texte) =>
      new Promise<void>((resoudre, rejeter) => {
        const verifier = () => {
          if (sortie.includes(texte)) resoudre();
        };
        attentes.push(verifier);
        verifier();
        void fin.then(() => {
          if (!sortie.includes(texte)) rejeter(new Error(`process terminé sans « ${texte} » : ${sortie}`));
        });
      }),
  };
}

export const DEPOT = "benomite/brigade";
export const CHEMIN_TICKETS = `repos/${DEPOT}/issues?labels=fire&state=open&per_page=100`;

// Une issue telle que l'API de GitHub la rend.
export function issueGitHub(
  number: number,
  options: { title?: string; labels?: string[]; state?: "open" | "closed"; created_at?: string; updated_at?: string; pull_request?: object } = {},
) {
  return {
    number,
    title: `Ticket ${number}`,
    state: "open",
    created_at: `2026-10-01T00:00:${String(number).padStart(2, "0")}Z`,
    updated_at: "2026-10-08T09:00:00Z",
    html_url: `https://github.com/${DEPOT}/issues/${number}`,
    ...options,
    labels: (options.labels ?? ["fire"]).map((name) => ({ name })),
  };
}

type ReponseGh = { statut?: number; etag?: string; suivant?: string; corps: unknown };

export type FauxGh = {
  // Le chemin du binaire, pour BRIGADE_GH_BIN.
  bin: string;
  repondre(chemin: string, reponse: ReponseGh): void;
  // La liste des tickets, et l'issue de chacun.
  issues(liste: ReturnType<typeof issueGitHub>[], etag?: string): void;
  // Les arguments de chaque appel reçu, dans l'ordre.
  appels(): string[][];
};

const FAUX_GH = `#!${process.execPath}
const fs = require("node:fs");
const path = require("node:path");
const args = process.argv.slice(2);
fs.appendFileSync(path.join(__dirname, "appels.jsonl"), JSON.stringify(args) + "\\n");
const fichier = path.join(__dirname, "reponses.json");
if (!fs.existsSync(fichier)) {
  console.error("gh: connexion impossible");
  process.exit(1);
}
const reponse = JSON.parse(fs.readFileSync(fichier, "utf8"))[args.at(-1)];
const condition = args.includes("-H") ? args[args.indexOf("-H") + 1] : "";
const repondre = (statut, entetes, corps) => {
  process.stdout.write(["HTTP/2.0 " + statut, ...entetes, "", corps].join("\\r\\n"));
  if (statut !== 200) console.error("gh: HTTP " + statut);
  process.exitCode = statut === 200 ? 0 : 1;
};
if (!reponse) repondre(404, [], "{}");
else if (reponse.etag && condition === "If-None-Match: " + reponse.etag) repondre(304, [], "");
else {
  const entetes = ["Content-Type: application/json"];
  if (reponse.etag) entetes.push("Etag: " + reponse.etag);
  if (reponse.suivant) entetes.push('Link: <' + reponse.suivant + '>; rel="next"');
  repondre(reponse.statut ?? 200, entetes, JSON.stringify(reponse.corps));
}
`;

// Un faux `gh` : il rejoue les réponses qu'on lui dicte, et note ses appels.
// Tant qu'on ne lui a rien dicté, il échoue comme un `gh` sans réseau.
export function fauxGh(t: TestContext): FauxGh {
  const repertoire = repertoireTemporaire(t);
  const bin = join(repertoire, "gh");
  writeFileSync(bin, FAUX_GH, { mode: 0o755 });
  const reponses: Record<string, ReponseGh> = {};
  const repondre = (chemin: string, reponse: ReponseGh) => {
    reponses[chemin] = reponse;
    // Écriture atomique : le faux `gh` peut lire pendant qu'on dicte.
    writeFileSync(join(repertoire, "reponses.tmp"), JSON.stringify(reponses));
    renameSync(join(repertoire, "reponses.tmp"), join(repertoire, "reponses.json"));
  };
  return {
    bin,
    repondre,
    issues(liste, etag) {
      for (const issue of liste) repondre(`repos/${DEPOT}/issues/${issue.number}`, { corps: issue });
      repondre(CHEMIN_TICKETS, { etag, corps: liste });
    },
    appels() {
      const fichier = join(repertoire, "appels.jsonl");
      if (!existsSync(fichier)) return [];
      return readFileSync(fichier, "utf8").trimEnd().split("\n").map((ligne) => JSON.parse(ligne) as string[]);
    },
  };
}

// Attend qu'une condition devienne vraie, sans dormir plus que nécessaire.
export async function jusqua(condition: () => boolean, delaiMs = 5000): Promise<void> {
  const limite = Date.now() + delaiMs;
  while (!condition()) {
    if (Date.now() > limite) throw new Error("condition jamais remplie");
    await new Promise((resoudre) => setTimeout(resoudre, 5));
  }
}
