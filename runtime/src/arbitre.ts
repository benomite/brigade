// L'arbitre entre projets : un seul par machine, au-dessus des runtimes. Il ne
// décide rien du travail — seulement du droit de lancer un cook de plus, en
// tenant compte de tous les projets.
//
// Rien de ce qu'il compte n'est à lui : chaque runtime lui redit son état à
// chaque échange, et il n'en garde que le dernier mot, en mémoire. Un arbitre
// qui redémarre repart vide. Sur disque, il ne tient que les réglages du chef
// — les projets connus et leur poids —, relus à chaque décision.
import { mkdirSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { Base } from "./base.ts";
import { lire } from "./plafonds.ts";
import { ConfigInvalide, DejaEnCours, NOM_DE_PROJET } from "./runtime.ts";
import { prendreVerrou, VerrouTenu } from "./verrou.ts";

// Ce que les cooks de tickets d'un projet ont consommé, en tokens, sur 24 h et
// sur 7 jours glissants. Ce n'est pas la consommation du compte.
export type Consommation = { jour: number; semaine: number };

// Ce qu'un runtime redit de son projet. `cooks` : ses cooks de tickets en
// cours, entrées comprises. `demande` : des tickets pourraient partir.
// `machine` : il les retient parce que la machine sature. `nonArbitres` :
// ceux de ses cooks partis pendant que l'arbitre était injoignable.
export type Mot = { cooks: number; demande: boolean; machine: boolean; nonArbitres: number; consommation: Consommation };

// Un projet tel que la règle le voit. `entendu` : il a parlé depuis le
// démarrage de l'arbitre — sinon ses cooks sont inconnus, et sa part réservée.
export type Vue = { projet: string; poids: number; cooks: number; demande: boolean; machine: boolean; entendu: boolean };

// Pourquoi une place est refusée : le compte est plein, le reste est dû aux
// autres projets, ou la machine sature et le projet a déjà sa part de ce qui
// tourne.
export type Motif = "compte" | "part" | "machine";
export type Decision = { accorde: boolean; motif: Motif | null };

type Partage = {
  // Les cooks en cours, tous projets entendus.
  cooks: number;
  // Les projets qui retiennent des tickets parce que la machine sature.
  saturePar: string[];
  parts: Map<string, number>;
};

// Les parts de chacun. Un projet compte s'il a des cooks, de la demande, ou
// s'il n'a pas reparlé ; `pour` compte toujours — c'est lui qui demande.
// Machine saturée, le plafond effectif est le nombre de cooks en cours.
function partager(plafond: number, vues: Vue[], pour?: string): Partage {
  const cooks = vues.reduce((somme, vue) => somme + (vue.entendu ? vue.cooks : 0), 0);
  const saturePar = vues.filter((vue) => vue.entendu && vue.machine && vue.demande).map((vue) => vue.projet);
  const actifs = vues.filter((vue) => !vue.entendu || vue.cooks > 0 || vue.demande || vue.projet === pour);
  const poids = actifs.reduce((somme, vue) => somme + vue.poids, 0);
  const effectif = saturePar.length > 0 ? cooks : plafond;
  return { cooks, saturePar, parts: new Map(actifs.map((vue) => [vue.projet, Math.max(1, Math.floor((effectif * vue.poids) / poids))])) };
}

// Ce projet peut-il lancer un cook de plus ? L'arbitre ne lit pas la machine :
// la station qui demande l'a déjà lue, et ne demande que si elle tient.
export function decider(plafond: number, vues: Vue[], projet: string): Decision {
  const { cooks, saturePar, parts } = partager(plafond, vues, projet);
  if (cooks >= plafond) return { accorde: false, motif: "compte" };
  const tenus = vues.find((vue) => vue.projet === projet)?.cooks ?? 0;
  if (tenus < (parts.get(projet) ?? 1)) return { accorde: true, motif: null };
  if (saturePar.length > 0) return { accorde: false, motif: "machine" };
  // Personne n'emprunte tant qu'un projet connu n'a pas reparlé : ses cooks
  // sont inconnus, et les places qui semblent libres peuvent être les siennes.
  if (vues.some((vue) => !vue.entendu)) return { accorde: false, motif: "part" };
  // Au-delà de sa part, il emprunte — sauf ce qui reste dû à ceux qui demandent.
  const du = vues.reduce((somme, vue) => {
    if (vue.projet === projet || !vue.demande) return somme;
    return somme + Math.max(0, (parts.get(vue.projet) ?? 0) - vue.cooks);
  }, 0);
  return plafond - cooks > du ? { accorde: true, motif: null } : { accorde: false, motif: "part" };
}

// Combien de cooks de plus ce projet pourrait lancer, les autres ne bougeant
// pas. Machine saturée, c'est ce qui manque à sa part de ce qui tourne.
export function encore(plafond: number, vues: Vue[], projet: string): number {
  const { cooks, saturePar, parts } = partager(plafond, vues, projet);
  const tenus = vues.find((vue) => vue.projet === projet)?.cooks ?? 0;
  if (saturePar.length > 0) return Math.max(0, Math.min(plafond - cooks, (parts.get(projet) ?? 1) - tenus));
  let combien = 0;
  let rejouees = vues.some((vue) => vue.projet === projet) ? vues : [...vues, { projet, poids: 1, cooks: 0, demande: true, machine: false, entendu: true }];
  while (decider(plafond, rejouees, projet).accorde) {
    combien++;
    rejouees = rejouees.map((vue) => (vue.projet === projet ? { ...vue, cooks: vue.cooks + 1 } : vue));
  }
  return combien;
}

// Un projet que l'arbitre connaît. `partiLe` : il ne tient aucune part — son
// runtime s'est arrêté proprement, ou le chef l'a pesé avant qu'il ne parle.
export type Connu = { projet: string; poids: number; connuLe: string; partiLe: string | null };

export type Reglages = {
  projets(): Connu[];
  // Règle le poids d'un projet. Inconnu, il entre sans tenir de part.
  peser(projet: string, poids: number, instant: string): void;
  // Oublie un projet ; rend faux s'il n'était pas connu.
  retirer(projet: string): boolean;
  // Le projet a parlé : il est connu, et tient sa part.
  entendre(projet: string, instant: string): void;
  // Le projet s'en va proprement : il rend sa part.
  partir(projet: string, instant: string): void;
  fermer(): void;
};

export const cheminReglages = (repertoire: string) => join(repertoire, "arbitre.db");

// Les réglages durables de l'arbitre. La commande du chef y écrit depuis son
// propre process : chaque écriture est une transaction, et attend son tour.
export function ouvrirReglages(repertoire: string): Reglages {
  mkdirSync(repertoire, { recursive: true });
  const base = new Base(cheminReglages(repertoire), { attenteMs: 5000 });
  base.script(`
    CREATE TABLE IF NOT EXISTS projets (
      projet   TEXT PRIMARY KEY,
      poids    INTEGER NOT NULL DEFAULT 1,
      connu_le TEXT NOT NULL,
      parti_le TEXT
    ) STRICT;
  `);
  const connu = (projet: string) => base.lire<Connu>("SELECT projet, poids, connu_le AS connuLe, parti_le AS partiLe FROM projets WHERE projet = ?", projet)[0];
  return {
    projets: () => base.lire<Connu>("SELECT projet, poids, connu_le AS connuLe, parti_le AS partiLe FROM projets ORDER BY projet"),
    peser(projet, poids, instant) {
      base.executer("INSERT INTO projets (projet, poids, connu_le, parti_le) VALUES (?, ?, ?, ?) ON CONFLICT (projet) DO UPDATE SET poids = excluded.poids", projet, poids, instant, instant);
    },
    retirer: (projet) => base.executer("DELETE FROM projets WHERE projet = ?", projet).changements > 0,
    entendre(projet, instant) {
      // Lu d'abord : un projet qui parle à chaque tick n'écrit rien.
      const deja = connu(projet);
      if (deja && deja.partiLe === null) return;
      base.executer("INSERT INTO projets (projet, connu_le) VALUES (?, ?) ON CONFLICT (projet) DO UPDATE SET parti_le = NULL", projet, instant);
    },
    partir(projet, instant) {
      base.executer("UPDATE projets SET parti_le = ? WHERE projet = ? AND parti_le IS NULL", instant, projet);
    },
    fermer: () => base.fermer(),
  };
}

// `entendu` : il a parlé depuis le démarrage de l'arbitre. `muet` : connu, il
// n'a pas reparlé — sa part est réservée. `absent` : il ne tient aucune part.
export type Presence = "entendu" | "muet" | "absent";

export type ProjetArbitre = {
  projet: string;
  poids: number;
  presence: Presence;
  // Son dernier mot (entendu), le démarrage de l'arbitre (muet), son départ (absent).
  depuis: string;
  // Nuls tant que le projet n'a pas reparlé.
  cooks: number | null;
  nonArbitres: number | null;
  demande: boolean | null;
  consommation: Consommation | null;
  // Sa part du plafond effectif ; nulle s'il n'en tient aucune.
  part: number | null;
  // Ce que l'arbitre l'autorise encore à lancer ; nul s'il n'a pas reparlé.
  encore: number | null;
};

export type EtatArbitre = {
  plafond: number;
  demarreLe: string;
  // Les cooks en cours, tous projets entendus.
  cooks: number;
  // Les projets qui retiennent des tickets parce que la machine sature.
  saturePar: string[];
  projets: ProjetArbitre[];
};

export type Arbitre = {
  // Le projet redit son état.
  dire(projet: string, mot: Mot): void;
  // Il le redit, et demande une place : accordée, elle est comptée aussitôt.
  demander(projet: string, mot: Mot): Decision;
  // Son runtime s'arrête proprement.
  quitter(projet: string): void;
  etat(): EtatArbitre;
  fermer(): void;
};

export type OptionsArbitre = {
  repertoire: string;
  // Le plafond de cooks du compte, tous projets confondus.
  plafond: number;
  maintenant?: () => Date;
};

export function ouvrirArbitre(options: OptionsArbitre): Arbitre {
  const { repertoire, plafond } = options;
  const maintenant = () => (options.maintenant?.() ?? new Date()).toISOString();
  mkdirSync(repertoire, { recursive: true });
  let verrou;
  try {
    verrou = prendreVerrou(repertoire);
  } catch (erreur) {
    if (erreur instanceof VerrouTenu) throw new DejaEnCours(`un arbitre tient déjà ${repertoire}`);
    throw erreur;
  }
  let reglages: Reglages;
  try {
    reglages = ouvrirReglages(repertoire);
  } catch (erreur) {
    verrou.relacher();
    throw erreur;
  }
  const demarreLe = maintenant();
  // Le dernier mot de chaque projet, depuis ce démarrage-ci.
  const mots = new Map<string, Mot & { le: string }>();

  // Les réglages se relisent à chaque fois : un projet que le chef vient de
  // retirer, ou qui est parti, ne garde pas son dernier mot.
  const connus = (): Connu[] => {
    const projets = reglages.projets();
    const presents = new Set(projets.filter((connu) => connu.partiLe === null).map((connu) => connu.projet));
    for (const projet of [...mots.keys()]) if (!presents.has(projet)) mots.delete(projet);
    return projets;
  };
  const vues = (projets: Connu[]): Vue[] =>
    projets
      .filter((connu) => connu.partiLe === null)
      .map(({ projet, poids }) => {
        const mot = mots.get(projet);
        return { projet, poids, cooks: mot?.cooks ?? 0, demande: mot?.demande ?? false, machine: mot?.machine ?? false, entendu: mot !== undefined };
      });
  const dire = (projet: string, mot: Mot) => {
    const instant = maintenant();
    reglages.entendre(projet, instant);
    mots.set(projet, { ...mot, le: instant });
  };

  let ferme = false;
  return {
    dire,
    demander(projet, mot) {
      dire(projet, mot);
      const decision = decider(plafond, vues(connus()), projet);
      const dit = mots.get(projet);
      // Comptée tout de suite : la demande suivante, d'où qu'elle vienne, la voit prise.
      if (decision.accorde && dit) mots.set(projet, { ...dit, cooks: dit.cooks + 1 });
      return decision;
    },
    quitter(projet) {
      reglages.partir(projet, maintenant());
      mots.delete(projet);
    },
    etat() {
      const projets = connus();
      const vus = vues(projets);
      const { cooks, saturePar, parts } = partager(plafond, vus);
      return {
        plafond,
        demarreLe,
        cooks,
        saturePar,
        projets: projets.map(({ projet, poids, partiLe }) => {
          const mot = mots.get(projet);
          const presence: Presence = partiLe !== null ? "absent" : mot ? "entendu" : "muet";
          return {
            projet,
            poids,
            presence,
            depuis: partiLe ?? mot?.le ?? demarreLe,
            cooks: mot?.cooks ?? null,
            nonArbitres: mot?.nonArbitres ?? null,
            demande: mot?.demande ?? null,
            consommation: mot?.consommation ?? null,
            // Entendu sans cook ni demande, il n'a pas de part à lui : celle qu'il aurait s'il demandait.
            part: presence === "absent" ? null : (parts.get(projet) ?? partager(plafond, vus, projet).parts.get(projet) ?? null),
            encore: mot ? encore(plafond, vus, projet) : null,
          };
        }),
      };
    },
    fermer() {
      if (ferme) return;
      ferme = true;
      reglages.fermer();
      verrou.relacher();
    },
  };
}

export type ConfigArbitre = { repertoire: string; port: number; plafond: number };

const PORT = "un numéro de port, de 1 à 65535";
export const estUnPort = (valeur: number) => Number.isSafeInteger(valeur) && valeur >= 1 && valeur <= 65535;

// La configuration de l'arbitre, lue dans l'environnement. Rien n'a de défaut :
// le plafond du compte est le quota du chef, il ne se devine pas.
export function configArbitre(env: NodeJS.ProcessEnv): ConfigArbitre {
  const exiger = (variable: string) => {
    if (!env[variable]) throw new ConfigInvalide(`${variable} n'est pas défini`);
  };
  exiger("BRIGADE_ARBITER_STATE_DIR");
  exiger("BRIGADE_ARBITER_PORT");
  exiger("BRIGADE_ARBITER_MAX_COOKS");
  return {
    repertoire: env.BRIGADE_ARBITER_STATE_DIR ?? "",
    port: lire(env, "BRIGADE_ARBITER_PORT", 0, PORT, estUnPort),
    plafond: lire(env, "BRIGADE_ARBITER_MAX_COOKS", 0, "un entier supérieur à zéro", (valeur) => Number.isSafeInteger(valeur) && valeur > 0),
  };
}

const CORPS_MAX = 64 * 1024;
const entier = (valeur: unknown): valeur is number => typeof valeur === "number" && Number.isSafeInteger(valeur) && valeur >= 0;

// Ce qu'un runtime a envoyé, ou null si ce n'est pas un état lisible.
function lireMot(corps: string): (Mot & { veut: boolean }) | null {
  let lu: Record<string, unknown>;
  try {
    lu = JSON.parse(corps);
  } catch {
    return null;
  }
  if (typeof lu !== "object" || lu === null) return null;
  const { cooks, demande, machine, nonArbitres, veut } = lu;
  const consommation = lu.consommation as Partial<Consommation> | null | undefined;
  if (!entier(cooks) || !entier(nonArbitres) || typeof demande !== "boolean" || typeof machine !== "boolean" || typeof veut !== "boolean") return null;
  if (typeof consommation !== "object" || consommation === null || !entier(consommation.jour) || !entier(consommation.semaine)) return null;
  return { cooks, demande, machine, nonArbitres, consommation: { jour: consommation.jour, semaine: consommation.semaine }, veut };
}

export type ServeurArbitre = { port: number; fermer(): Promise<void> };

// L'arbitre sur son port, boucle locale seulement :
//   POST   /projets/<projet>   un runtime redit son état ; `veut` : il demande une place
//   DELETE /projets/<projet>   il s'arrête proprement
//   GET    /etat               ce que le chef lit
// Les réglages ne passent pas par ici : un cook joint la boucle locale.
export function servirArbitre(arbitre: Arbitre, port: number): Promise<ServeurArbitre> {
  const rendre = (reponse: ServerResponse, code: number, corps?: unknown) => {
    reponse.writeHead(code, { "content-type": "application/json", connection: "close" });
    reponse.end(corps === undefined ? "" : JSON.stringify(corps));
  };
  const traiter = (requete: IncomingMessage, corps: string, reponse: ServerResponse) => {
    const chemin = (requete.url ?? "").split("?")[0] ?? "";
    if (requete.method === "GET" && chemin === "/etat") return rendre(reponse, 200, arbitre.etat());
    const nomme = /^\/projets\/([^/]+)$/.exec(chemin)?.[1];
    if (nomme === undefined || (requete.method !== "POST" && requete.method !== "DELETE")) return rendre(reponse, 404, { erreur: "inconnu" });
    let projet: string;
    try {
      projet = decodeURIComponent(nomme);
    } catch {
      return rendre(reponse, 400, { erreur: "nom de projet illisible" });
    }
    if (!NOM_DE_PROJET.test(projet)) return rendre(reponse, 400, { erreur: "nom de projet invalide" });
    if (requete.method === "DELETE") {
      arbitre.quitter(projet);
      return rendre(reponse, 204);
    }
    const mot = lireMot(corps);
    if (mot === null) return rendre(reponse, 400, { erreur: "état illisible" });
    const { veut, ...dit } = mot;
    if (veut) return rendre(reponse, 200, arbitre.demander(projet, dit));
    arbitre.dire(projet, dit);
    return rendre(reponse, 200, { accorde: null, motif: null });
  };
  const serveur = createServer((requete, reponse) => {
    let corps = "";
    requete.setEncoding("utf8");
    requete.on("data", (morceau: string) => {
      corps += morceau;
      if (corps.length > CORPS_MAX) requete.destroy();
    });
    requete.on("end", () => {
      try {
        traiter(requete, corps, reponse);
      } catch (erreur) {
        console.error(`brigade : l'arbitre a buté — ${erreur instanceof Error ? (erreur.stack ?? erreur.message) : String(erreur)}`);
        rendre(reponse, 500, { erreur: "l'arbitre a buté" });
      }
    });
  });
  return new Promise((resoudre, rejeter) => {
    serveur.once("error", rejeter);
    serveur.listen(port, "127.0.0.1", () => {
      serveur.off("error", rejeter);
      resoudre({
        port: (serveur.address() as AddressInfo).port,
        fermer: () =>
          new Promise<void>((ferme) => {
            serveur.close(() => ferme());
            serveur.closeAllConnections();
          }),
      });
    });
  });
}
