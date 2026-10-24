// L'enrôlement d'un serveur : une commande et un code, rien d'autre à recopier.
//
// Côté chef, `preparer` tire un code à usage unique et rend la commande qui le
// porte. Le chef la lance sur le serveur : elle y installe brigade (un clone),
// présente la machine et ses capacités, et l'envoie à la machine du chef par
// `ssh` — la seule direction : le serveur joint le chef, jamais l'inverse
// (`runtime/deploy/brigade-enrolement`). Côté chef, `recevoir` valide le code
// avant d'écrire quoi que ce soit au registre : un code faux, expiré ou déjà
// servi est refusé, et la machine n'y apparaît pas.
//
// Une machine enrôlée entre au registre « en attente », comme toute machine
// qui se présente : seule l'acceptation du chef la rend utilisable. Le code ne
// donne que le droit de se présenter, une fois.
//
// Le code n'est gardé que par son empreinte : qui lit la base n'en tire aucun
// code encore valable.
import { createHash, randomInt } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { Base } from "../base.ts";
import { ouvrirRegistre, type Presentation, type Registre, type StationGlobale } from "../stations-globales/registre.ts";

// Le temps de lancer la commande, et que le clone se fasse sur un serveur lent.
export const DUREE_MS = 30 * 60_000;
// Ce qu'un enrôlement fini, servi ou échu, reste lisible : `utilise` plutôt
// qu'`inconnu`, pour qui relance une vieille commande.
const GARDE_MS = 7 * 24 * 3600_000;

// Le dépôt et la branche que la commande clone sur le serveur, à défaut.
export const DEPOT = "https://github.com/benomite/brigade.git";
export const BRANCHE = "v2";
// Où la commande installe brigade, sur le serveur.
export const RACINE_SUR_LE_SERVEUR = "$HOME/.local/share/brigade";
// Le geste qui reçoit la présentation, dans ce clone : c'est la machine du
// chef que le serveur joint, celle où ce module tourne.
export const RECEPTEUR = resolve(import.meta.dirname, "../../deploy/brigade-enrolement");

// Un code de dix signes pris dans l'alphabet de Crockford — ni I, ni L, ni O,
// ni U : il se lit et se tape sans ambiguïté. 2⁵⁰ codes.
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const LONGUEUR = 10;
const SIGNES = new RegExp(`^[${ALPHABET}]{${LONGUEUR}}$`);

export type Enrolement = {
  // À montrer au chef, et que le serveur affiche quand il s'est présenté.
  code: string;
  // À lancer telle quelle sur le serveur.
  commande: string;
  expireLe: string;
};

export type DemandeDEnrolement = {
  // Comment le serveur joint la machine du chef par `ssh` : `chef@box`, un
  // hôte de son `~/.ssh/config`.
  vers: string;
  // Le nom sous lequel le serveur se présentera ; sans lui, celui de sa
  // machine (`hostname`).
  nom?: string;
  depot?: string;
  branche?: string;
};

export type Enrolements = {
  preparer(demande: DemandeDEnrolement): Enrolement;
  // Le serveur se présente avec son code : présenté « en attente » au
  // registre, ou refusé sans que rien n'y soit écrit.
  recevoir(code: string, presentation: Presentation): StationGlobale;
  fermer(): void;
};

export type Motif = "inconnu" | "expire" | "utilise" | "nom-pris";

export class CodeRefuse extends Error {
  readonly motif: Motif;

  constructor(motif: Motif, message: string) {
    super(message);
    this.name = "CodeRefuse";
    this.motif = motif;
  }
}

// Une demande d'enrôlement qui ne s'écrirait pas sans risque dans une commande.
export class DemandeInvalide extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DemandeInvalide";
  }
}

export const cheminEnrolements = (repertoire: string) => join(repertoire, "enrolements.db");

// Le répertoire du registre des stations du chef, et de ses enrôlements.
export function repertoireDuRegistre(env: Record<string, string | undefined>): string {
  if (env.BRIGADE_REGISTRE_DIR) return env.BRIGADE_REGISTRE_DIR;
  const etat = env.XDG_STATE_HOME || (env.HOME ? join(env.HOME, ".local/state") : null);
  if (!etat) throw new DemandeInvalide("ni BRIGADE_REGISTRE_DIR ni HOME ne sont définis : le registre des stations n'a pas de répertoire");
  return join(etat, "brigade");
}

// Le code tel qu'il se compare : en capitales, sans tiret ni espace, les
// signes qu'on confond rendus à ceux de l'alphabet. Null s'il n'en est pas un.
export function lireCode(ecrit: string): string | null {
  if (typeof ecrit !== "string") return null;
  const lu = ecrit.toUpperCase().replace(/[\s-]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
  return SIGNES.test(lu) ? lu : null;
}

const empreinte = (code: string) => createHash("sha256").update(code).digest("hex");

const tirerCode = (): string => {
  const signes = Array.from({ length: LONGUEUR }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  return `${signes.slice(0, LONGUEUR / 2)}-${signes.slice(LONGUEUR / 2)}`;
};

// Ce qui s'écrit entre apostrophes dans la commande : rien qui en sorte, et
// rien qui se lise comme une option.
const DESTINATION = /^[A-Za-z0-9_][A-Za-z0-9._-]*(@[A-Za-z0-9_][A-Za-z0-9._-]*)?$/;
const NOM = /^[\p{Ll}\p{N}][\p{Ll}\p{N}-]*$/u;
const DEPOT_ACCEPTE = /^(https:\/\/|ssh:\/\/|file:\/\/|git@)[A-Za-z0-9._~:/@+-]+$/;
const BRANCHE_ACCEPTEE = /^[A-Za-z0-9_][A-Za-z0-9._/-]*$/;
const CHEMIN = /^\/[^'\n]*$/;

function verifier(valeur: string | undefined, motif: RegExp, quoi: string): string {
  if (typeof valeur !== "string" || !motif.test(valeur)) throw new DemandeInvalide(`${quoi} : « ${String(valeur)} » ne s'écrit pas dans une commande d'enrôlement`);
  return valeur;
}

// La commande, une ligne pour un shell POSIX : un clone de brigade s'il n'y en
// a pas, puis le geste qui présente la machine.
function commande(code: string, d: { vers: string; nom?: string; depot: string; branche: string; recepteur: string; registre: string }): string {
  const nom = d.nom === undefined ? "" : ` --name '${d.nom}'`;
  return [
    `d="${RACINE_SUR_LE_SERVEUR}";`,
    `{ [ -e "$d/.git" ] || git clone --quiet --depth 1 --branch '${d.branche}' '${d.depot}' "$d"; } &&`,
    `"$d/runtime/deploy/brigade-enrolement" present '${code}' --to '${d.vers}' --receiver '${d.recepteur}' --registry '${d.registre}'${nom}`,
  ].join(" ");
}

type Rangee = { empreinte: string; expire_le: string; utilise_le: string | null };

export type OptionsEnrolements = {
  maintenant?: () => Date;
  dureeMs?: number;
  // Le geste qui reçoit, tel que le serveur le lance chez le chef.
  recepteur?: string;
  // Le registre où la machine se présente : celui du répertoire, à défaut.
  registre?: Registre;
  // Ce répertoire tel que la commande le nomme au geste qui reçoit : le
  // répertoire lui-même, à défaut.
  registreNomme?: string;
};

export function ouvrirEnrolements(repertoire: string, options: OptionsEnrolements = {}): Enrolements {
  const maintenant = options.maintenant ?? (() => new Date());
  const dureeMs = options.dureeMs ?? DUREE_MS;
  const recepteur = options.recepteur ?? RECEPTEUR;
  const absolu = resolve(repertoire);
  const registreNomme = options.registreNomme ?? absolu;
  mkdirSync(absolu, { recursive: true });
  const registre = options.registre ?? ouvrirRegistre(absolu, { maintenant });
  const base = new Base(cheminEnrolements(absolu), { attenteMs: 5000 });
  base.script(`
    CREATE TABLE IF NOT EXISTS enrolements (
      empreinte  TEXT PRIMARY KEY,
      vers       TEXT NOT NULL,
      prepare_le TEXT NOT NULL,
      expire_le  TEXT NOT NULL,
      utilise_le TEXT,
      station    TEXT
    ) STRICT;
  `);

  return {
    preparer(demande) {
      const vers = verifier(demande.vers, DESTINATION, "destination");
      const nom = demande.nom === undefined ? undefined : verifier(demande.nom, NOM, "nom");
      const depot = verifier(demande.depot ?? DEPOT, DEPOT_ACCEPTE, "dépôt");
      const branche = verifier(demande.branche ?? BRANCHE, BRANCHE_ACCEPTEE, "branche");
      verifier(recepteur, CHEMIN, "geste de réception");
      verifier(registreNomme, CHEMIN, "registre");
      const code = tirerCode();
      const instant = maintenant();
      const expireLe = new Date(instant.getTime() + dureeMs).toISOString();
      base.transaction(() => {
        base.executer("DELETE FROM enrolements WHERE expire_le < ?", new Date(instant.getTime() - GARDE_MS).toISOString());
        base.executer("INSERT INTO enrolements (empreinte, vers, prepare_le, expire_le) VALUES (?, ?, ?, ?)", empreinte(lireCode(code) ?? ""), vers, instant.toISOString(), expireLe);
      });
      return { code, commande: commande(code, { vers, nom, depot, branche, recepteur, registre: registreNomme }), expireLe };
    },
    recevoir(code, presentation) {
      const lu = lireCode(code);
      if (lu === null) throw new CodeRefuse("inconnu", `code refusé : « ${String(code)} » n'est pas un code d'enrôlement`);
      const instant = maintenant().toISOString();
      return base.transaction(() => {
        const enrolement = base.lire<Rangee>("SELECT empreinte, expire_le, utilise_le FROM enrolements WHERE empreinte = ?", empreinte(lu))[0];
        if (!enrolement) throw new CodeRefuse("inconnu", "code refusé : aucun enrôlement n'a été préparé sous ce code — demande une commande neuve à ta home");
        if (enrolement.utilise_le !== null) throw new CodeRefuse("utilise", `code refusé : il a déjà servi, le ${enrolement.utilise_le} — un code ne présente qu'une machine, une fois`);
        if (instant >= enrolement.expire_le) throw new CodeRefuse("expire", `code refusé : il a expiré le ${enrolement.expire_le} — demande une commande neuve à ta home`);
        // Se présenter sous le nom d'une station acceptée lui prendrait son
        // acceptation, à machine et cloison égales : un enrôlement n'hérite
        // jamais de ce que le chef a accepté.
        const connue = typeof presentation?.nom === "string" ? registre.lire(presentation.nom) : null;
        if (connue?.statut === "acceptee") throw new CodeRefuse("nom-pris", `présentation refusée : \`${connue.nom}\` est déjà une station acceptée — relance la commande avec un autre nom (--name)`);
        // Une présentation mal formée lève ici : la transaction est annulée,
        // le code reste valable.
        const station = registre.presenter(presentation);
        base.executer("UPDATE enrolements SET utilise_le = ?, station = ? WHERE empreinte = ?", instant, station.nom, enrolement.empreinte);
        return station;
      });
    },
    fermer() {
      base.fermer();
      if (!options.registre) registre.fermer();
    },
  };
}
