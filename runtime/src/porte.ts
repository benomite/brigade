// La porte d'un projet : le seul chemin de ses lancements vers l'extérieur. Un
// relais HTTP sur la boucle locale — tunnels `CONNECT` et requêtes en clair —
// qui ne laisse passer que la liste blanche, et dont le refus se lit : une
// réponse immédiate, qui nomme l'hôte et le geste qui l'ouvre. Mécanique pure :
// la liste et le journal lui sont donnés.
import { createServer, request, type IncomingMessage, type ServerResponse } from "node:http";
import { connect, type Socket } from "node:net";
import type { Duplex } from "node:stream";
import { autorise, DECLARATION_RESEAU, type Regle } from "./reseau.ts";

export type OptionsPorte = {
  // Zéro : un port libre, que la porte rend.
  port: number;
  projet: string;
  // La liste blanche en vigueur, relue à chaque demande.
  regles: () => Regle[];
  surRefus?: (hote: string, port: number) => void;
  // Ouvre la connexion vers l'hôte. Par défaut, le réseau de la machine.
  joindre?: (hote: string, port: number) => Socket;
};

export type Porte = { port: number; fermer(): Promise<void> };

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
    if (autorise(options.regles(), hote, port)) return true;
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

  serveur.on("connect", (demande: IncomingMessage, client: Duplex, tete: Buffer) => {
    client.on("error", () => {});
    const vers = cible(demande.url ?? "");
    if (vers === null) return void client.end(reponse("400 Bad Request", "brigade : cible illisible\n"));
    if (!passe(vers.hote, vers.port)) return void client.end(reponse("403 Forbidden", direRefus(projet, vers.hote, vers.port), [`${ENTETE_DE_REFUS}: ${vers.hote}`]));
    const amont = joindre(vers.hote, vers.port);
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
          }),
      });
    });
  });
}

// Un refus par hôte et par dix minutes au plus entre au journal : un cook qui
// insiste ne le remplit pas. Ce qui est tu se compte, et part avec le suivant.
const SILENCE_MS = 600_000;

export function compterLesRefus(noter: (refus: { host: string; port: number; count: number }) => void, maintenant: () => number = Date.now): (hote: string, port: number) => void {
  const vus = new Map<string, { dit: number; tus: number }>();
  return (hote, port) => {
    const cle = `${hote}:${port}`;
    const vu = vus.get(cle);
    if (vu !== undefined && maintenant() - vu.dit < SILENCE_MS) return void (vu.tus += 1);
    vus.set(cle, { dit: maintenant(), tus: 0 });
    noter({ host: hote, port, count: (vu?.tus ?? 0) + 1 });
  };
}
