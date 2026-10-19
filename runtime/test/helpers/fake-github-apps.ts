// Un faux GitHub pour les Apps : trois Apps — une par rôle —, leurs clés dans
// un répertoire tel que le runtime l'attend, et un serveur local qui vérifie le
// JWT de chaque requête avant de rendre un jeton d'installation. Ni réseau, ni
// vraie App.
import { createPublicKey, generateKeyPairSync, verify } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import type { TestContext } from "node:test";
import { ROLES, type Role } from "../../src/identites.ts";
import { aArreter, repertoireTemporaire } from "../outils.ts";

export type FauxGitHubApps = {
  // Pour BRIGADE_GITHUB_API_URL et BRIGADE_GITHUB_APPS_DIR.
  url: string;
  repertoire: string;
  id(role: Role): string;
  // La clé privée du rôle, telle que GitHub la donne à télécharger.
  cle(role: Role): string;
  // L'heure du faux GitHub. Par défaut, celle de la machine.
  horloge(lire: () => number): void;
  // Les jetons demandés, dans l'ordre : pour qui, et avec quel corps.
  echanges(): Array<{ role: Role; corps: unknown }>;
  // Les jetons rendus à un rôle, dans l'ordre.
  jetons(role: Role): string[];
  // Tous les JWT reçus.
  jwts(): string[];
  // Tout ce qui suit répond ce statut, avec ce message — jusqu'à `null`.
  panne(statut: number | null, message?: string): void;
  refuser(statut: number, message: string): void;
  desinstaller(role: Role): void;
};

// Fabriquer une clé RSA coûte : une paire par rôle, pour tout le fichier.
let paires: Record<Role, { privee: string; publique: string }> | undefined;
function cles() {
  paires ??= Object.fromEntries(
    ROLES.map((role) => {
      const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
      return [role, { privee: privateKey.export({ type: "pkcs1", format: "pem" }).toString(), publique: publicKey.export({ type: "spki", format: "pem" }).toString() }];
    }),
  ) as Record<Role, { privee: string; publique: string }>;
  return paires;
}

const ID: Record<Role, string> = { cook: "1001", pass: "1002", manager: "1003" };

export async function fauxGitHubApps(t: TestContext): Promise<FauxGitHubApps> {
  const paire = cles();
  const repertoire = join(repertoireTemporaire(t), "apps");
  mkdirSync(repertoire);
  for (const role of ROLES) {
    writeFileSync(join(repertoire, `${role}.id`), `${ID[role]}\n`);
    writeFileSync(join(repertoire, `${role}.pem`), paire[role].privee, { mode: 0o600 });
  }

  let maintenant = () => Date.now();
  let panne: { statut: number; message: string } | null = null;
  const absentes = new Set<Role>();
  const echanges: Array<{ role: Role; corps: unknown }> = [];
  const jetons: Record<Role, string[]> = { cook: [], pass: [], manager: [] };
  const jwts: string[] = [];

  // Le rôle que le JWT prouve, ou null : signature, émetteur et dates.
  const authentifier = (autorisation: string | undefined): Role | null => {
    const jwt = /^Bearer (.+)$/.exec(autorisation ?? "")?.[1];
    if (!jwt) return null;
    jwts.push(jwt);
    const [tete, charge, signature] = jwt.split(".");
    if (!tete || !charge || !signature) return null;
    let lu: { iss?: unknown; iat?: unknown; exp?: unknown };
    try {
      lu = JSON.parse(Buffer.from(charge, "base64url").toString());
      if (JSON.parse(Buffer.from(tete, "base64url").toString()).alg !== "RS256") return null;
    } catch {
      return null;
    }
    const role = ROLES.find((candidat) => ID[candidat] === String(lu.iss));
    if (!role) return null;
    if (!verify("RSA-SHA256", Buffer.from(`${tete}.${charge}`), createPublicKey(paire[role].publique), Buffer.from(signature, "base64url"))) return null;
    const secondes = maintenant() / 1000;
    // GitHub refuse un JWT émis dans le futur, échu, ou valable plus de dix minutes.
    if (typeof lu.iat !== "number" || typeof lu.exp !== "number" || lu.iat > secondes || lu.exp < secondes || lu.exp - lu.iat > 600) return null;
    return role;
  };

  const serveur = createServer((requete, reponse) => {
    let recu = "";
    requete.on("data", (morceau) => (recu += morceau));
    requete.on("end", () => {
      const repondre = (statut: number, corps: unknown) => {
        reponse.writeHead(statut, { "content-type": "application/json" });
        reponse.end(JSON.stringify(corps));
      };
      const role = authentifier(requete.headers.authorization);
      if (panne) return repondre(panne.statut, { message: panne.message });
      if (!role) return repondre(401, { message: "A JSON web token could not be decoded" });
      const chemin = requete.url ?? "";
      if (requete.method === "GET" && chemin === "/app") return repondre(200, { slug: `brigade-${role}` });
      if (requete.method === "GET" && /^\/repos\/[^/]+\/[^/]+\/installation$/.test(chemin)) {
        return absentes.has(role) ? repondre(404, { message: "Not Found" }) : repondre(200, { id: Number(ID[role]) + 7000 });
      }
      if (requete.method === "POST" && chemin === `/app/installations/${Number(ID[role]) + 7000}/access_tokens`) {
        if (absentes.has(role)) return repondre(404, { message: "Not Found" });
        echanges.push({ role, corps: JSON.parse(recu || "null") });
        const jeton = `ghs_${role}_${jetons[role].length + 1}_secret`;
        jetons[role].push(jeton);
        return repondre(201, { token: jeton, expires_at: new Date(maintenant() + 3_600_000).toISOString() });
      }
      repondre(404, { message: "Not Found" });
    });
  });
  await new Promise<void>((resoudre) => serveur.listen(0, "127.0.0.1", resoudre));
  aArreter(t, () => new Promise((resoudre) => (serveur.closeAllConnections(), serveur.close(resoudre))));

  return {
    url: `http://127.0.0.1:${(serveur.address() as AddressInfo).port}`,
    repertoire,
    id: (role) => ID[role],
    cle: (role) => paire[role].privee,
    horloge: (lire) => void (maintenant = lire),
    echanges: () => [...echanges],
    jetons: (role) => [...jetons[role]],
    jwts: () => [...jwts],
    panne: (statut, message = "Service Unavailable") => void (panne = statut === null ? null : { statut, message }),
    refuser: (statut, message) => void (panne = { statut, message }),
    desinstaller: (role) => void absentes.add(role),
  };
}
