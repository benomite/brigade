// L'appairage d'un téléphone : un code à taper — ou à scanner —, sans
// terminal (#1160). Le téléphone ne fait tourner aucun cook (#1158) ; il est
// une station quand même, et il lit ce que le runtime lui montre.
//
// Une station qui tourne tire un code court, à usage unique, pour un quart
// d'heure (`emettre`) : le chef le lit sur son ordinateur, ou en scanne le QR.
// Le téléphone l'envoie avec son nom (`appairer`) : le code valide, il entre
// au registre des stations du chef comme un téléphone — `cuisine: false`,
// jamais candidat pour cuire un projet — et reçoit son jeton, ce qu'il montre
// ensuite à chaque demande (`authentifier`). Un code faux, expiré ou déjà servi
// est refusé, et rien n'entre au registre.
//
// Le téléphone entre au registre accepté, sans attendre : c'est le chef qui a
// tiré le code et qui le tape, ses deux appareils en main — l'appairage est
// son acceptation. Un serveur enrôlé, lui, attend la sienne
// (`enrolement/enrolement.ts`) : qui lance la commande n'est pas forcément le
// chef. Accepté, un téléphone ne cuit rien pour autant : aucune sélection du
// registre ne le rend.
//
// Un téléphone perdu se révoque (`revoquer`) : ses jetons ne valent plus, et il
// quitte le registre — d'aucun réseau il n'ouvre plus rien.
//
// Ni le code ni le jeton ne sont gardés autrement que par leur empreinte : qui
// lit la base n'en tire rien qui ouvre une porte.
//
// La base, `telephones.db`, est dans le répertoire du registre : la commande
// qui tire un code et le guichet de la station qui reçoit le téléphone
// (`guichet.ts`) l'ouvrent ensemble, sans se parler. Le guichet y écrit aussi
// où il écoute : la commande en tire l'adresse que le QR porte.
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { DUREE_DU_CODE_MS, normaliser, tirerCode } from "../appairage/document.ts";
import { Base } from "../base.ts";
import { ouvrirRegistre, type Registre, type StationGlobale } from "../stations-globales/registre.ts";
import { TELEPHONE } from "../stations-globales/sorte.ts";

// Ce qu'un code servi ou échu reste lisible : « déjà servi » ou « expiré »,
// plutôt qu'« inconnu », pour qui le retape.
const GARDE_MS = 7 * 24 * 3600_000;
// Le préfixe d'un jeton : il se reconnaît dans un fichier ou un journal, et
// se distingue d'un code.
const PREFIXE = "brgt_";

export const cheminTelephones = (repertoire: string) => join(repertoire, "telephones.db");

export type Emission = {
  // `ABCD-EFGH`, à taper sur le téléphone.
  code: string;
  expireLe: string;
  // Ce que le QR porte : le code, et l'adresse où le téléphone l'envoie
  // quand on la connaît.
  qr: string;
};

// Ce que le téléphone dit de lui en s'appairant.
export type DemandeDAppairage = {
  // Son nom de station : des minuscules, des chiffres et des tirets (`pixel-8`).
  nom: string;
  // Ce qu'il est, tel que la liste des stations l'affiche (`Android 16`).
  machine: string;
};

export type Appaire = { station: StationGlobale; jeton: string };

export type Telephones = {
  // `adresse` : l'URL du guichet que le téléphone joint, portée par le QR.
  emettre(options?: { adresse?: string }): Emission;
  // Le téléphone se présente avec son code : il entre au registre, accepté,
  // et reçoit son jeton — ou il est refusé, et rien n'est écrit.
  appairer(code: string, demande: DemandeDAppairage): Appaire;
  // Le téléphone que ce jeton désigne, s'il est toujours au registre, comme
  // téléphone ; null sinon.
  authentifier(jeton: string | undefined | null): StationGlobale | null;
  // La liste des stations du registre, téléphones compris : ce qu'un
  // téléphone appairé lit.
  stations(): StationGlobale[];
  // Le chef retire un téléphone — perdu, donné : ses jetons ne valent plus,
  // et il quitte le registre. Rend ce qu'il y était ; un nom qui n'est pas
  // celui d'un téléphone est refusé, et rien ne change.
  revoquer(nom: string): StationGlobale;
  // Le guichet dit où il écoute, quand il s'ouvre : la commande qui tire un
  // code en tire l'adresse que le QR porte (`appairage-cli.ts`).
  annoncer(ecoute: Ecoute): void;
  // Où écoute le dernier guichet ouvert sur ce registre ; null s'il ne s'en
  // est jamais ouvert.
  guichet(): Ecoute | null;
  fermer(): void;
};

// L'adresse où le guichet écoute, telle qu'il l'a ouverte : `0.0.0.0` ou `::`
// pour toutes celles de la machine.
export type Ecoute = { hote: string; port: number };

export class RevocationRefusee extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RevocationRefusee";
  }
}

export type Motif = "inconnu" | "expire" | "utilise" | "nom-pris";

export class CodeRefuse extends Error {
  readonly motif: Motif;

  constructor(motif: Motif, message: string) {
    super(message);
    this.name = "CodeRefuse";
    this.motif = motif;
  }
}

const hacher = (texte: string) => createHash("sha256").update(texte).digest("hex");

// Le QR : une adresse que l'app du téléphone reconnaît, le code en clair.
export function contenuDuQr(code: string, adresse?: string): string {
  const parametres = new URLSearchParams({ code });
  if (adresse !== undefined) parametres.set("url", adresse);
  return `brigade://pair?${parametres.toString()}`;
}

export type OptionsTelephones = {
  maintenant?: () => Date;
  dureeMs?: number;
  // Le registre où le téléphone entre : celui du répertoire, à défaut.
  registre?: Registre;
};

type Rangee = { empreinte: string; expire_le: string; utilise_le: string | null };

export function ouvrirTelephones(repertoire: string, options: OptionsTelephones = {}): Telephones {
  const maintenant = options.maintenant ?? (() => new Date());
  const dureeMs = options.dureeMs ?? DUREE_DU_CODE_MS;
  const absolu = resolve(repertoire);
  mkdirSync(absolu, { recursive: true });
  const registre = options.registre ?? ouvrirRegistre(absolu, { maintenant });
  const base = new Base(cheminTelephones(absolu), { attenteMs: 5000 });
  base.script(`
    CREATE TABLE IF NOT EXISTS codes (
      empreinte  TEXT PRIMARY KEY,
      emis_le    TEXT NOT NULL,
      expire_le  TEXT NOT NULL,
      utilise_le TEXT,
      station    TEXT
    ) STRICT;
    CREATE TABLE IF NOT EXISTS jetons (
      empreinte  TEXT PRIMARY KEY,
      station    TEXT NOT NULL,
      emis_le    TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS guichet (
      un        INTEGER PRIMARY KEY CHECK (un = 1),
      hote      TEXT NOT NULL,
      port      INTEGER NOT NULL,
      ouvert_le TEXT NOT NULL
    ) STRICT;
  `);

  return {
    emettre({ adresse } = {}) {
      const instant = maintenant();
      const code = tirerCode();
      const expireLe = new Date(instant.getTime() + dureeMs).toISOString();
      base.transaction(() => {
        base.executer("DELETE FROM codes WHERE expire_le < ?", new Date(instant.getTime() - GARDE_MS).toISOString());
        base.executer("INSERT INTO codes (empreinte, emis_le, expire_le) VALUES (?, ?, ?)", hacher(normaliser(code) ?? code), instant.toISOString(), expireLe);
      });
      return { code, expireLe, qr: contenuDuQr(code, adresse) };
    },
    appairer(code, demande) {
      const lu = typeof code === "string" ? normaliser(code) : null;
      if (lu === null) throw new CodeRefuse("inconnu", `code refused: “${String(code)}” is not a pairing code`);
      const instant = maintenant().toISOString();
      return base.transaction(() => {
        const emis = base.lire<Rangee>("SELECT empreinte, expire_le, utilise_le FROM codes WHERE empreinte = ?", hacher(lu))[0];
        if (!emis) throw new CodeRefuse("inconnu", "code refused: no pairing code was issued under it — ask your station for a new one");
        if (emis.utilise_le !== null) throw new CodeRefuse("utilise", `code refused: it was already used, at ${emis.utilise_le} — a code pairs one phone, once`);
        if (instant >= emis.expire_le) throw new CodeRefuse("expire", `code refused: it expired at ${emis.expire_le} — ask your station for a new one`);
        // Un téléphone ne prend jamais le nom d'un ordinateur : il lui
        // prendrait sa place au registre. Sous le nom d'un téléphone, il le
        // remplace — c'est le même, réinstallé — et le jeton d'avant ne vaut
        // plus.
        const connue = typeof demande?.nom === "string" ? registre.lire(demande.nom) : null;
        if (connue !== null && connue.sorte !== TELEPHONE) throw new CodeRefuse("nom-pris", `pairing refused: \`${connue.nom}\` is already a station that cooks — pair the phone under another name`);
        // Une demande mal formée lève ici : la transaction est annulée, le
        // code reste valable.
        registre.presenter({ nom: demande?.nom, machine: demande?.machine, capacites: [], cloisonnee: false, sorte: TELEPHONE });
        const station = registre.accepter(demande.nom, { capacites: [] });
        const jeton = `${PREFIXE}${randomBytes(32).toString("base64url")}`;
        base.executer("DELETE FROM jetons WHERE station = ?", station.nom);
        base.executer("INSERT INTO jetons (empreinte, station, emis_le) VALUES (?, ?, ?)", hacher(jeton), station.nom, instant);
        base.executer("UPDATE codes SET utilise_le = ?, station = ? WHERE empreinte = ?", instant, station.nom, emis.empreinte);
        return { station, jeton };
      });
    },
    authentifier(jeton) {
      if (typeof jeton !== "string" || !jeton.startsWith(PREFIXE)) return null;
      const [porte] = base.lire<{ station: string }>("SELECT station FROM jetons WHERE empreinte = ?", hacher(jeton));
      if (porte === undefined) return null;
      // Retiré du registre, ou revenu sous ce nom comme autre chose qu'un
      // téléphone, il n'a plus rien à y lire.
      const station = registre.lire(porte.station);
      return station !== null && station.sorte === TELEPHONE ? station : null;
    },
    stations: () => registre.liste(),
    revoquer(nom) {
      return base.transaction(() => {
        const station = typeof nom === "string" ? registre.lire(nom) : null;
        if (station === null) throw new RevocationRefusee(`no phone is paired under \`${String(nom)}\``);
        if (station.sorte !== TELEPHONE) throw new RevocationRefusee(`\`${station.nom}\` is a station that cooks, not a phone: nothing was revoked`);
        base.executer("DELETE FROM jetons WHERE station = ?", station.nom);
        return registre.retirer(station.nom);
      });
    },
    annoncer({ hote, port }) {
      base.executer("INSERT INTO guichet (un, hote, port, ouvert_le) VALUES (1, ?, ?, ?) ON CONFLICT (un) DO UPDATE SET hote = excluded.hote, port = excluded.port, ouvert_le = excluded.ouvert_le", hote, port, maintenant().toISOString());
    },
    guichet() {
      const [ecoute] = base.lire<Ecoute>("SELECT hote, port FROM guichet");
      return ecoute === undefined ? null : { hote: ecoute.hote, port: ecoute.port };
    },
    fermer() {
      base.fermer();
      if (!options.registre) registre.fermer();
    },
  };
}
