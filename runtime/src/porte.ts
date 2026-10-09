// La porte d'un projet : le seul chemin de ses lancements vers l'extérieur. Un
// relais HTTP sur la boucle locale — tunnels `CONNECT` et requêtes en clair —
// qui ne laisse passer que la liste blanche, et dont le refus se lit : une
// réponse immédiate, qui nomme l'hôte et le geste qui l'ouvre. Mécanique pure :
// la liste et le journal lui sont donnés.
import { createServer, request, type IncomingMessage, type ServerResponse } from "node:http";
import { connect, type Socket } from "node:net";
import type { Duplex } from "node:stream";
import { autorise, DECLARATION_RESEAU, REGLES_DE_BASE, type Regle } from "./reseau.ts";

export type OptionsPorte = {
  // Zéro : un port libre, que la porte rend.
  port: number;
  projet: string;
  // La liste blanche en vigueur, demandée à chaque connexion. `fraiches` :
  // relue à l'instant — la porte le demande avant de refuser.
  regles: (fraiches?: boolean) => Regle[];
  surRefus?: (hote: string, port: number) => void;
  // Ouvre la connexion vers l'hôte. Par défaut, le réseau de la machine.
  joindre?: (hote: string, port: number) => Socket;
};

export type Porte = { port: number; fermer(): Promise<void> };

// Garde la liste blanche `delaiMs` entre deux lectures : une connexion qui
// passe ne coûte pas une ouverture du journal. Demandée fraîche, elle est
// relue quand même. Illisible, la dernière lue tient — le socle si aucune ne
// l'a été : une lecture ratée ne ferme rien, et n'ouvre rien d'autre.
export function garderLaListe(lire: () => Regle[], options: { delaiMs: number; maintenant?: () => number; avertir?: (message: string) => void }): (fraiches?: boolean) => Regle[] {
  const maintenant = options.maintenant ?? Date.now;
  const avertir = options.avertir ?? ((message: string) => console.error(message));
  let lues: { regles: Regle[]; le: number } | null = null;
  return (fraiches = false) => {
    if (!fraiches && lues !== null && maintenant() - lues.le < options.delaiMs) return lues.regles;
    let courantes: Regle[];
    try {
      courantes = lire();
    } catch (erreur) {
      avertir(`brigade : liste blanche illisible, la porte s'en tient ${lues === null ? "au socle" : "à la dernière lue"} — ${erreur instanceof Error ? erreur.message : String(erreur)}`);
      courantes = lues?.regles ?? REGLES_DE_BASE;
    }
    lues = { regles: courantes, le: maintenant() };
    return courantes;
  };
}

// L'en-tête qui dit qu'un refus vient de la porte, et pour quel hôte.
export const ENTETE_DE_REFUS = "x-brigade-refus";

export const direRefus = (projet: string, hote: string, port: number) =>
  `brigade : « ${hote}:${port} » est refusé — hors de la liste blanche du réseau du projet « ${projet} ». Pour l'ouvrir : une ligne « ${hote} » dans ${DECLARATION_RESEAU}, mergée sur la branche d'intégration.\n`;

// `hôte:port`, ou `[adresse]:port` — la cible d'un `CONNECT`.
function cible(brute: string): { hote: string; port: number } | null {
  const [, hote, port] = /^\[?([^\]]+?)\]?:([0-9]{1,5})$/.exec(brute) ?? [];
  return hote === undefined ? null : { hote, port: Number(port) };
}

export function ouvrirPorte(options: OptionsPorte): Promise<Porte> {
  const { projet } = options;
  const joindre = options.joindre ?? ((hote, port) => connect({ host: hote, port }));
  const passe = (hote: string, port: number): boolean => {
    // Avant de refuser, la liste est relue : un hôte publié à l'instant — la
    // base vient d'être rapatriée, le setup part — n'attend pas la relecture.
    if (autorise(options.regles(), hote, port) || autorise(options.regles(true), hote, port)) return true;
    try {
      options.surRefus?.(hote, port);
    } catch {
      // Un refus qui ne peut pas se noter reste un refus.
    }
    return false;
  };
  const reponse = (statut: string, texte: string, entetes: string[] = []) =>
    [`HTTP/1.1 ${statut}`, ...entetes, "Content-Type: text/plain; charset=utf-8", `Content-Length: ${Buffer.byteLength(texte)}`, "Connection: close", "", texte].join("\r\n");

  const serveur = createServer((demande: IncomingMessage, rendu: ServerResponse) => {
    const dire = (statut: number, texte: string, entetes: Record<string, string> = {}) => rendu.writeHead(statut, { "content-type": "text/plain; charset=utf-8", ...entetes }).end(texte);
    // Une demande adressée à la porte elle-même : elle dit qui elle est.
    if (!/^http:\/\//i.test(demande.url ?? "")) return dire(200, `brigade : porte du projet « ${projet} »\n`);
    let url: URL;
    try {
      url = new URL(demande.url ?? "");
    } catch {
      return dire(400, "brigade : adresse illisible\n");
    }
    const port = Number(url.port || 80);
    if (!passe(url.hostname, port)) return dire(403, direRefus(projet, url.hostname, port), { [ENTETE_DE_REFUS]: url.hostname });
    const amont = request({ method: demande.method, host: url.hostname, port, path: `${url.pathname}${url.search}`, headers: demande.headers, createConnection: () => joindre(url.hostname, port) }, (recu) => {
      rendu.writeHead(recu.statusCode ?? 502, recu.headers);
      recu.pipe(rendu);
      // Un amont qui meurt au milieu du corps ne laisse pas le client attendre
      // la suite : sa réponse est coupée, pas suspendue.
      recu.on("error", () => rendu.destroy());
      recu.on("aborted", () => rendu.destroy());
    });
    amont.on("error", (erreur) => (rendu.headersSent ? rendu.destroy() : dire(502, `brigade : « ${url.hostname}:${port} » est en liste blanche mais ne répond pas — ${erreur.message}\n`)));
    // Un client parti avant la fin n'attend plus rien : l'amont est lâché.
    rendu.on("close", () => amont.destroy());
    demande.pipe(amont);
  });

  // Les tunnels ouverts : le serveur ne les compte plus parmi ses connexions,
  // et la porte ne se fermerait pas tant qu'un seul vit.
  const tunnels = new Set<Duplex>();
  const suivre = (prise: Duplex) => {
    tunnels.add(prise);
    prise.once("close", () => tunnels.delete(prise));
  };

  serveur.on("connect", (demande: IncomingMessage, client: Duplex, tete: Buffer) => {
    client.on("error", () => {});
    suivre(client);
    const vers = cible(demande.url ?? "");
    if (vers === null) return void client.end(reponse("400 Bad Request", "brigade : cible illisible\n"));
    if (!passe(vers.hote, vers.port)) return void client.end(reponse("403 Forbidden", direRefus(projet, vers.hote, vers.port), [`${ENTETE_DE_REFUS}: ${vers.hote}`]));
    const amont = joindre(vers.hote, vers.port);
    suivre(amont);
    let ouvert = false;
    amont.once("connect", () => {
      ouvert = true;
      client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      amont.write(tete);
      amont.pipe(client);
      client.pipe(amont);
    });
    amont.on("error", (erreur) => {
      if (ouvert) client.destroy();
      else client.end(reponse("502 Bad Gateway", `brigade : « ${vers.hote}:${vers.port} » est en liste blanche mais ne répond pas — ${erreur.message}\n`));
    });
    client.on("close", () => amont.destroy());
  });

  return new Promise((resoudre, rejeter) => {
    serveur.once("error", rejeter);
    // La boucle locale seulement : la porte n'est celle de personne d'autre.
    serveur.listen(options.port, "127.0.0.1", () => {
      const adresse = serveur.address();
      resoudre({
        port: typeof adresse === "object" && adresse !== null ? adresse.port : options.port,
        fermer: () =>
          new Promise((ferme) => {
            serveur.close(() => ferme());
            serveur.closeAllConnections();
            for (const prise of tunnels) prise.destroy();
          }),
      });
    });
  });
}

// Un refus par hôte et par dix minutes au plus entre au journal : un cook qui
// insiste ne le remplit pas. Ce qui est tu se compte, et part avec le suivant.
const SILENCE_MS = 600_000;
// Et cent hôtes au plus par dix minutes : un cook qui boucle sur des noms
// toujours neufs ne remplit ni le journal ni la mémoire de la porte. Au-delà,
// les refus sont comptés ensemble, et dits d'une ligne à la fenêtre suivante.
const HOTES_MAX = 100;
// L'hôte sous lequel se disent les refus comptés ensemble.
export const AUTRES_HOTES = "*";

export function compterLesRefus(noter: (refus: { host: string; port: number; count: number }) => void, maintenant: () => number = Date.now): (hote: string, port: number) => void {
  const vus = new Map<string, { dit: number; tus: number }>();
  let fenetre = { debut: maintenant(), dits: 0, tus: 0 };
  return (hote, port) => {
    const instant = maintenant();
    if (instant - fenetre.debut >= SILENCE_MS) {
      if (fenetre.tus > 0) noter({ host: AUTRES_HOTES, port: 0, count: fenetre.tus });
      for (const [cle, vu] of vus) if (instant - vu.dit >= SILENCE_MS && vu.tus === 0) vus.delete(cle);
      fenetre = { debut: instant, dits: 0, tus: 0 };
    }
    const cle = `${hote}:${port}`;
    const vu = vus.get(cle);
    if (vu !== undefined && instant - vu.dit < SILENCE_MS) return void (vu.tus += 1);
    // Un hôte de trop n'est pas retenu : il ne coûte qu'un compteur.
    if (fenetre.dits >= HOTES_MAX) return void (fenetre.tus += 1);
    fenetre.dits += 1;
    vus.set(cle, { dit: instant, tus: 0 });
    noter({ host: hote, port, count: (vu?.tus ?? 0) + 1 });
  };
}
