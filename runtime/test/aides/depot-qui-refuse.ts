// Un dépôt distant qui refuse tout, sur 127.0.0.1 : à chaque requête de git, la
// réponse de GitHub à un accès refusé — 401 (aucun identifiant : git veut les
// demander) ou 403 (l'identifiant n'a pas ce droit). En https, son certificat
// est fait par `openssl` à la volée, et git ne le vérifie pas
// (`GIT_SSL_NO_VERIFY`, à poser dans son environnement).
import type { TestContext } from "node:test";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer as http, type IncomingMessage, type ServerResponse } from "node:http";
import { createServer as https } from "node:https";
import { join } from "node:path";
import { repertoireTemporaire } from "../outils.ts";

export type DepotQuiRefuse = { url: string; requetes: string[] };

export async function depotQuiRefuse(t: TestContext, options: { statut: 401 | 403; tls?: boolean }): Promise<DepotQuiRefuse> {
  const requetes: string[] = [];
  const repondre = (requete: IncomingMessage, reponse: ServerResponse) => {
    requetes.push(`${requete.method} ${requete.url}`);
    if (options.statut === 401) reponse.writeHead(401, { "WWW-Authenticate": 'Basic realm="GitHub"' }).end();
    else reponse.writeHead(403, { "Content-Type": "text/plain" }).end("Permission to benomite/parade.git denied to station.\n");
  };
  let serveur;
  if (options.tls === true) {
    const dossier = repertoireTemporaire(t);
    const [cle, certificat] = [join(dossier, "cle.pem"), join(dossier, "certificat.pem")];
    execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", cle, "-out", certificat, "-days", "1", "-subj", "/CN=127.0.0.1"], { stdio: "ignore" });
    serveur = https({ key: readFileSync(cle), cert: readFileSync(certificat) }, repondre);
  } else serveur = http(repondre);
  await new Promise<void>((resolu) => serveur.listen(0, "127.0.0.1", resolu));
  t.after(() => new Promise<void>((resolu) => {
    serveur.close(() => resolu());
    serveur.closeAllConnections();
  }));
  const { port } = serveur.address() as { port: number };
  return { url: `${options.tls === true ? "https" : "http"}://127.0.0.1:${port}/benomite/parade.git`, requetes };
}
