// Les services locaux qu'un projet déclare : ce que ses tests joignent sur la
// boucle locale du Mac (un Postgres sur localhost:5432). Le bac à sable d'un
// cook ne joint que la liste réseau du projet ; un service local s'ajoute
// donc à ses règles, un hôte et un port à la fois — jamais la boucle locale
// entière. La station ne démarre ni n'installe rien : le service tourne déjà.
//
// Le dépôt les déclare dans `.claude/brigade/services-locaux`, un service par
// ligne, `hôte:port`, l'hôte étant `localhost` ou `127.0.0.1` ; `#` ouvre un
// commentaire. Relu à chaque lancement, sur la branche d'intégration, comme
// la liste réseau.
//
// Pur : rien n'est lu ni écrit.

export const DECLARATION_SERVICES_LOCAUX = ".claude/brigade/services-locaux";

export type ServiceLocal = { hote: "localhost" | "127.0.0.1"; port: number };

const LIGNE = /^(localhost|127\.0\.0\.1):([1-9][0-9]{0,4})$/;

// Lit la déclaration du dépôt. `services` : les lignes qui ouvrent quelque
// chose ; `problemes` : celles qui n'ouvrent rien, ligne par ligne.
export function lireServicesLocaux(texte: string): { services: ServiceLocal[]; problemes: string[] } {
  const services: ServiceLocal[] = [];
  const problemes: string[] = [];
  texte.split("\n").forEach((brute, rang) => {
    const ligne = brute.trim().toLowerCase();
    if (ligne === "" || ligne.startsWith("#")) return;
    const [, hote, port] = LIGNE.exec(ligne) ?? [];
    if (hote === undefined || Number(port) > 65535) {
      problemes.push(`ligne ${rang + 1} de \`${DECLARATION_SERVICES_LOCAUX}\` (« ${brute.trim().slice(0, 80)} ») : « localhost:port » ou « 127.0.0.1:port » est attendu, port de 1 à 65535`);
      return;
    }
    if (!services.some((service) => service.hote === hote && service.port === Number(port))) services.push({ hote: hote as ServiceLocal["hote"], port: Number(port) });
  });
  return { services, problemes };
}

// Les entrées que ces services ajoutent à `allowedDomains` du bac à sable :
// exactement leur hôte et leur port.
export const entreesReseau = (services: ServiceLocal[]): string[] => services.map((service) => `${service.hote}:${service.port}`);

// Les services d'un dépôt, d'après le contenu de sa déclaration. Absente ou
// illisible, aucun : rien ne s'ouvre sur un doute. Les lignes invalides sont
// écartées, les autres tiennent.
export function servicesDuDepot(lire: () => string | null | undefined): ServiceLocal[] {
  try {
    return lireServicesLocaux(lire() ?? "").services;
  } catch {
    return [];
  }
}
