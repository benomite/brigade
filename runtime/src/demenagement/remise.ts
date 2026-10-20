// Le déménagement de la cuisine d'un projet, d'une station à une autre : ce
// que celle qu'il quitte remet à celle qui le reprend.
//
// Tout ce qui fait le projet vit dans son journal — ses tickets et leur rail,
// ses grants, les décisions du chef, son histoire (`journal.ts`). C'est donc
// lui qui voyage, tout entier, en instantané (`sauvegarde.ts`), avec le numéro
// du ticket qui a préparé son dépôt (`preparation-depot/`). Les deux stations
// ne se joignent pas : celle qu'il quitte publie la remise dans son gist, celle
// qui le reprend l'y lit — le seul canal qu'elles ont (`appairage/canal.ts`).
//
// Avant l'instantané, la cuisine est fermée et ses cooks arrêtés : le verrou
// du projet prouve qu'aucune cuisine ne le tient plus ici, et chaque cook
// encore en vol — un relais le porte encore — est arrêté, puis attendu mort.
// Sa fin s'écrit au journal (`cook.exited`, `stop`, `cause: move`) : son
// ticket revient au rail, sans échec ni panne, et la station qui reprend le
// projet le reprend. Le dernier fait de l'instantané est le déménagement
// lui-même (`kitchen.moved`) : la station qui le pose sait qu'elle l'a reçu.
//
// Ce qui ne voyage pas : les flux bruts des cooks (`runs/`), les worktrees et
// le clone — la station qui reprend clone le dépôt, et un cook arrêté en vol
// repart de la base, ou de sa branche sur l'origine (`travail-conserve.ts`).
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import type { Fichiers } from "../appairage/canal.ts";
import type { Base } from "../base.ts";
import { cheminJournal, ouvrirJournal } from "../journal.ts";
import { FICHIER as FICHIER_PREPARATION } from "../preparation-depot/ouvrir.ts";
import { cooksEnCours, mesuresDesCooksEnCours } from "../projections/guardrails.ts";
import { controler, prendreInstantane } from "../sauvegarde.ts";
import { arreterParLeRelais, fichiersDuRelais, lireTrace, relaisVivant } from "../superviseur.ts";
import { prendreVerrou, VerrouTenu, type Verrou } from "../verrou.ts";

export const FORMAT = 1;

// Dans le gist de la station que la cuisine quitte : le manifeste de la remise,
// et le journal, compressé, en parts.
export const fichierDeRemise = (projet: string) => `brigade-remise-${projet}.json`;
export const partDeRemise = (projet: string, rang: number) => `brigade-remise-${projet}-${rang}.txt`;

// Un fichier de gist se lit entier jusqu'à un mégaoctet : chaque part en reste loin.
const TAILLE_DES_PARTS = 512 * 1024;
// Ce qu'un déménagement porte au plus par le gist : le journal compressé, en base64.
export const TAILLE_MAX = 10 * 1024 * 1024;
// Un cook arrêté meurt dans la grâce de son relais (dix secondes) : passé ce
// délai, la remise attend la lecture suivante.
const ATTENTE_DES_COOKS_MS = 60_000;

const AUTEUR = "station";

// Ce que la station qu'il quitte remet. `journal` nul : elle n'en avait aucun —
// le projet arrive neuf, et la station qui le reprend le prépare comme un ajout.
export type Remise = {
  projet: string;
  de: string;
  vers: string;
  demandeLe: string;
  journal: { evenements: number; dernierSeq: number; parts: number; empreinte: string } | null;
  // Le fichier du ticket qui a préparé son dépôt, tel quel, ou null.
  preparation: string | null;
};

// La remise ne se fait pas encore : rien n'est écrit, elle se réessaie à la
// lecture suivante.
export class RemiseRetenue extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RemiseRetenue";
  }
}

const empreinte = (octets: Buffer) => createHash("sha256").update(octets).digest("hex");
const entier = (valeur: unknown): valeur is number => Number.isSafeInteger(valeur) && (valeur as number) >= 0;

// Le dernier déménagement que ce journal porte.
function dernierDemenagement(base: Base): { from: string; to: string; askedAt: string } | null {
  const ligne = base.lire<{ payload: string }>("SELECT payload FROM events WHERE type = 'kitchen.moved' ORDER BY seq DESC LIMIT 1")[0];
  if (ligne === undefined) return null;
  try {
    const { from, to, askedAt } = JSON.parse(ligne.payload) as Record<string, unknown>;
    return typeof from === "string" && typeof to === "string" && typeof askedAt === "string" ? { from, to, askedAt } : null;
  } catch {
    return null;
  }
}

// Le déménagement demandé à cet instant vers cette station est-il déjà au
// journal de ce répertoire d'état ? Sur la station qu'il quitte : elle l'a
// remis. Sur celle qui le reprend : elle l'a reçu.
export function dejaDemenage(repertoireEtat: string, demande: { vers: string; demandeLe: string }): boolean {
  if (!existsSync(cheminJournal(repertoireEtat))) return false;
  let journal;
  try {
    journal = ouvrirJournal(repertoireEtat, { lectureSeule: true });
  } catch {
    return false;
  }
  try {
    return dejaFaite(journal.base, demande.vers, demande.demandeLe);
  } finally {
    journal.fermer();
  }
}

// La station a-t-elle remis ce projet à une autre — le dernier déménagement de
// son journal part d'elle ? Elle ne rouvre pas alors sa cuisine d'elle-même :
// il cuit ailleurs, et ne revient que par un déménagement en sens inverse.
export function remisAilleurs(repertoireEtat: string, station: string): { to: string; askedAt: string } | null {
  if (!existsSync(cheminJournal(repertoireEtat))) return null;
  let journal;
  try {
    journal = ouvrirJournal(repertoireEtat, { lectureSeule: true });
  } catch {
    return null;
  }
  try {
    const dernier = dernierDemenagement(journal.base);
    return dernier !== null && dernier.from === station ? { to: dernier.to, askedAt: dernier.askedAt } : null;
  } finally {
    journal.fermer();
  }
}

// Attend la mort des relais de ces cooks — arrêtés, ils transmettent, et
// tuent passé leur grâce.
async function attendreLesRelais(flux: string[], attenteMs: number, projet: string, de: string): Promise<void> {
  const vivants = () => flux.filter((un) => {
    const trace = lireTrace(fichiersDuRelais(un));
    return trace !== null && relaisVivant(trace);
  });
  const limite = Date.now() + attenteMs;
  while (vivants().length > 0) {
    if (Date.now() > limite) throw new RemiseRetenue(`a cook of ${projet} is still running on ${de}, stopped and not dead yet: the handover waits for it`);
    await new Promise((resoudre) => setTimeout(resoudre, 50));
  }
}

export type OptionsRemise = {
  repertoireEtat: string;
  projet: string;
  // Les stations, par leur nom : celle qu'il quitte, celle qui le reprend.
  de: string;
  vers: string;
  demandeLe: string;
  maintenant?: () => Date;
  attenteMs?: number;
};

// Remet la cuisine d'un projet : rend les fichiers à publier dans le gist de la
// station qu'il quitte. Sa cuisine doit être fermée — son verrou libre —, sans
// quoi la remise est retenue (`RemiseRetenue`) et rien n'est écrit. Rejouée
// après une remise faite (le gist n'a pas pu être écrit), elle reprend
// l'instantané sans rien écrire de plus.
export async function remettre(options: OptionsRemise): Promise<Fichiers> {
  const { repertoireEtat, projet, de, vers, demandeLe } = options;
  const maintenant = options.maintenant ?? (() => new Date());
  const publier = (remise: Remise, parts: Fichiers = {}): Fichiers => ({ ...parts, [fichierDeRemise(projet)]: `${JSON.stringify({ brigade: "remise", format: FORMAT, ...remise }, null, 2)}\n` });
  if (!existsSync(cheminJournal(repertoireEtat))) return publier({ projet, de, vers, demandeLe, journal: null, preparation: null });

  let verrou: Verrou;
  try {
    verrou = prendreVerrou(repertoireEtat);
  } catch (erreur) {
    if (erreur instanceof VerrouTenu) throw new RemiseRetenue(`its kitchen is still open on ${de}: the handover waits for it to close`);
    throw erreur;
  }
  const provisoire = mkdtempSync(join(tmpdir(), "brigade-remise-"));
  try {
    const journal = ouvrirJournal(repertoireEtat, { maintenant });
    try {
      if (!dejaFaite(journal.base, vers, demandeLe)) {
        const cooks = cooksEnCours(journal.base);
        const flux = cooks.map((cook) => join(repertoireEtat, cook.stream));
        for (const un of flux) arreterParLeRelais(un);
        await attendreLesRelais(flux, options.attenteMs ?? ATTENTE_DES_COOKS_MS, projet, de);
        const mesures = new Map(mesuresDesCooksEnCours(journal.base).map((mesure) => [mesure.run, mesure]));
        const instant = maintenant().getTime();
        journal.base.transaction(() => {
          for (const cook of cooks) {
            const mesure = mesures.get(cook.run);
            journal.ajouter({
              project: projet,
              ticket: cook.ticket,
              author: AUTEUR,
              type: "cook.exited",
              payload: { run: cook.run, outcome: "stop", code: null, signal: null, turns: mesure?.turns ?? 0, tokens: mesure?.tokens ?? 0, durationMs: Math.max(0, instant - Date.parse(cook.launchedAt)), cause: "move" },
            });
          }
          journal.ajouter({ project: projet, ticket: null, author: AUTEUR, type: "kitchen.moved", payload: { from: de, to: vers, askedAt: demandeLe, cooks: cooks.map((cook) => cook.run) } });
        });
      }
    } finally {
      journal.fermer();
    }

    const instantane = join(provisoire, "log.db");
    prendreInstantane(repertoireEtat, instantane);
    const lu = controler(instantane);
    const tasse = gzipSync(readFileSync(instantane));
    const texte = tasse.toString("base64");
    if (texte.length > TAILLE_MAX) {
      throw new Error(`the log of ${projet} weighs ${(texte.length / 1024 / 1024).toFixed(1)} MB once compressed: more than the ${TAILLE_MAX / 1024 / 1024} MB a move carries through the gist`);
    }
    const nombre = Math.max(1, Math.ceil(texte.length / TAILLE_DES_PARTS));
    const parts: Fichiers = {};
    for (let rang = 0; rang < nombre; rang += 1) parts[partDeRemise(projet, rang)] = texte.slice(rang * TAILLE_DES_PARTS, (rang + 1) * TAILLE_DES_PARTS);
    let preparation: string | null = null;
    try {
      preparation = readFileSync(join(repertoireEtat, FICHIER_PREPARATION), "utf8");
    } catch {
      // Un projet écrit à la main, ou ajouté avant ce ticket : il n'en a pas.
    }
    return publier({ projet, de, vers, demandeLe, journal: { evenements: lu.evenements, dernierSeq: lu.dernierSeq, parts: nombre, empreinte: empreinte(tasse) }, preparation }, parts);
  } finally {
    verrou.relacher();
    rmSync(provisoire, { recursive: true, force: true });
  }
}

function dejaFaite(base: Base, vers: string, demandeLe: string): boolean {
  const dernier = dernierDemenagement(base);
  return dernier !== null && dernier.askedAt === demandeLe && dernier.to === vers;
}

// La remise de ce projet telle que le gist de la station qu'il quitte la
// porte, ou null s'il n'en porte aucune lisible.
export function lireRemise(fichiers: Fichiers | null, projet: string): Remise | null {
  const brut = fichiers?.[fichierDeRemise(projet)];
  if (brut === undefined) return null;
  try {
    const lu = JSON.parse(brut) as Record<string, unknown>;
    const { de, vers, demandeLe, journal, preparation } = lu;
    if (lu.brigade !== "remise" || lu.projet !== projet || typeof de !== "string" || typeof vers !== "string" || typeof demandeLe !== "string") return null;
    if (preparation !== null && typeof preparation !== "string") return null;
    if (journal === null) return { projet, de, vers, demandeLe, journal: null, preparation };
    const { evenements, dernierSeq, parts, empreinte: sienne } = (journal ?? {}) as Record<string, unknown>;
    if (!entier(evenements) || !entier(dernierSeq) || !entier(parts) || parts < 1 || typeof sienne !== "string") return null;
    return { projet, de, vers, demandeLe, journal: { evenements, dernierSeq, parts, empreinte: sienne }, preparation };
  } catch {
    return null;
  }
}

export type OptionsReception = {
  repertoireEtat: string;
  remise: Remise;
  // Les fichiers du gist de la station qu'il quitte : les parts y sont.
  fichiers: Fichiers;
  maintenant?: () => Date;
};

// Pose la remise dans le répertoire d'état du projet, sur la station qui le
// reprend. Un état qu'elle en gardait d'avant — le projet a déjà cuit ici —
// est mis de côté, à côté, jamais écrasé : la remise est plus récente. Rend ce
// que le journal posé porte, ou null si la remise n'en portait aucun.
export function recevoir(options: OptionsReception): { evenements: number; dernierSeq: number } | null {
  const { repertoireEtat, remise, fichiers } = options;
  const maintenant = options.maintenant ?? (() => new Date());
  if (remise.journal === null) return null;
  const { parts, empreinte: attendue, evenements, dernierSeq } = remise.journal;
  const morceaux: string[] = [];
  for (let rang = 0; rang < parts; rang += 1) {
    const morceau = fichiers[partDeRemise(remise.projet, rang)];
    if (morceau === undefined) throw new Error(`the handover of ${remise.projet} is incomplete on ${remise.de}'s gist: part ${rang + 1} of ${parts} is missing`);
    morceaux.push(morceau);
  }
  const tasse = Buffer.from(morceaux.join(""), "base64");
  if (empreinte(tasse) !== attendue) throw new Error(`the handover of ${remise.projet} on ${remise.de}'s gist is damaged: its log does not match its fingerprint`);
  const provisoire = mkdtempSync(join(tmpdir(), "brigade-reception-"));
  try {
    const instantane = join(provisoire, "log.db");
    writeFileSync(instantane, gunzipSync(tasse));
    const lu = controler(instantane);
    if (lu.evenements !== evenements || lu.dernierSeq !== dernierSeq || (lu.projet !== null && lu.projet !== remise.projet)) {
      throw new Error(`the log handed over by ${remise.de} does not say what its handover says (project ${lu.projet}, ${lu.evenements} events up to no. ${lu.dernierSeq}): nothing is put in place`);
    }
    // Le journal reçu finit par ce déménagement-là : sans quoi ce n'est pas lui.
    const recu = ouvrirJournal(provisoire, { lectureSeule: true });
    let dernier;
    try {
      dernier = dernierDemenagement(recu.base);
    } finally {
      recu.fermer();
    }
    if (dernier === null || dernier.askedAt !== remise.demandeLe || dernier.to !== remise.vers) {
      throw new Error(`the log handed over by ${remise.de} does not end with this move to ${remise.vers}: nothing is put in place`);
    }

    if (existsSync(repertoireEtat) && readdirSync(repertoireEtat).length > 0) {
      // Personne ne le tient ici : le prouver avant de le déplacer.
      let verrou: Verrou | null = null;
      try {
        verrou = prendreVerrou(repertoireEtat);
      } catch (erreur) {
        if (erreur instanceof VerrouTenu) throw new RemiseRetenue(`a kitchen of ${remise.projet} is still open here: the handover waits for it to close`);
        throw erreur;
      }
      try {
        const horodatage = maintenant().toISOString().slice(0, 19).replaceAll(":", "-");
        renameSync(repertoireEtat, join(dirname(repertoireEtat), `.${basename(repertoireEtat)}.avant-${horodatage}Z`));
      } finally {
        verrou.relacher();
      }
    }
    // L'état se monte à côté, puis prend le nom du projet d'un seul geste : une
    // réception interrompue ne laisse pas un état à moitié posé sous son nom.
    const pose = `${repertoireEtat}.reception`;
    rmSync(pose, { recursive: true, force: true });
    mkdirSync(pose, { recursive: true });
    copyFileSync(instantane, cheminJournal(pose));
    if (remise.preparation !== null) writeFileSync(join(pose, FICHIER_PREPARATION), remise.preparation);
    rmSync(repertoireEtat, { recursive: true, force: true });
    renameSync(pose, repertoireEtat);
    return { evenements: lu.evenements, dernierSeq: lu.dernierSeq };
  } finally {
    rmSync(provisoire, { recursive: true, force: true });
  }
}
