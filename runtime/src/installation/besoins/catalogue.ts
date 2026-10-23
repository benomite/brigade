// Ce qu'un projet peut demander à la station pour que ses tests tournent, et
// que la station n'a pas toujours : une base de données, Docker, un
// navigateur, un SDK (#1393). Pour chacun, ce qui dans le dépôt dit que le
// projet en a besoin (son setup, sa configuration de test, ses manifestes),
// ce qui dit que la station l'a (une commande sur la machine, ou une capacité
// déclarée), et ce qui suit de chaque issue — les phrases que le chef lit.
//
// Le catalogue ne nomme que ce qui ne s'installe pas sans geste du chef : un
// gestionnaire de paquets, la cuisine l'installe seule
// (`installation/reparations/`). Sans E/S.

// Ce que le dépôt dit d'un besoin. Chaque indice, trouvé, devient une phrase
// de la cause : « `apps/api/package.json` depends on `pg` ».
export type Indices = {
  // Une commande que le setup du worktree, ou un script de test du
  // `package.json`, lance.
  commandes?: readonly string[];
  // Une adresse de service (`postgres://`) dans le setup, un `.env` d'exemple
  // ou la CI.
  adresses?: RegExp;
  // Une dépendance, par écosystème.
  npm?: readonly string[];
  gem?: readonly string[];
  pip?: readonly string[];
  go?: readonly string[];
  cargo?: readonly string[];
  // Un groupe Maven ou Gradle (`org.testcontainers`).
  jvm?: readonly string[];
  // L'image d'un service que la CI démarre pour ses tests.
  images?: readonly string[];
  // Le fournisseur d'une source de données Prisma.
  prisma?: string;
  // Un fichier dont la seule présence le dit, et ce qu'elle dit.
  fichiers?: ReadonlyArray<{ motif: RegExp; raison: string }>;
  // Un fichier dont le contenu le dit.
  contenus?: ReadonlyArray<{ fichier: RegExp; motif: RegExp; raison: string }>;
};

// Une commande jouée par la sonde sous le compte de la station — celui sous
// lequel la cuisine cuit — : son code de sortie (null quand elle ne se lance
// pas, ou qu'elle dépasse son temps) et ce qu'elle a écrit.
export type Jouer = (commande: string, args: readonly string[]) => { code: number | null; sortie: string };

// Ce qui dit que la station l'a. Une seule preuve suffit — sauf pour un
// service : que la machine en ait les binaires ne dit pas que le compte de la
// cuisine s'en sert (un Postgres qui refuse sa connexion), c'est l'essai qui
// tranche.
export type Fourni = {
  // Une commande que la machine trouve dans son PATH.
  commandes: readonly string[];
  // Une capacité que le projet déclare pour une station d'ici (`BRIGADE_STATIONS`).
  capacites: readonly string[];
  // Un dossier non vide (les navigateurs de Playwright), selon l'environnement.
  dossiers?: (env: Record<string, string | undefined>, maison: string) => string[];
  // Une variable qui nomme un dossier qui existe (`ANDROID_HOME`).
  variables?: readonly string[];
  // Ce que la station doit réussir, sous le compte de la cuisine, pour que la
  // machine fournisse le besoin : vrai quand elle s'en sert. Une capacité
  // déclarée suffit sans lui ; une commande, un dossier ou une variable ne
  // disent alors que l'essai vaut d'être tenté.
  essai?: (jouer: Jouer) => boolean;
};

export type Besoin = {
  id: string;
  // Comment les phrases le nomment : « a Postgres database ».
  nom: string;
  indices: Indices;
  fourni: Fourni;
  // Ce qui s'installe sur la station si le chef l'y fait fournir : le début
  // d'une phrase, qui nomme la station.
  installe: (station: string) => string;
  // Ce que perdent les tests si le chef les fait adapter.
  couverture: string;
  // Ce que dit, sur une ligne de sa sortie, un setup de worktree qui ne peut
  // pas s'en servir sur la station : un serveur qui refuse le compte, un
  // démon qui ne répond pas (#1533). Une commande qu'il ne trouve pas
  // (`psql: command not found`) le dit aussi, par ses `commandes`.
  erreurs?: readonly RegExp[];
  // Ce que le setup du projet fait pour l'apporter lui-même, si le chef le
  // choisit (#1534) : la fin d'une phrase, et ce dont il se sert sur la
  // station — une commande de sa machine, ou un Docker qui répond au compte de
  // la cuisine. Quand elle l'a déjà, rien n'est à y installer. Aucun : il doit
  // de toute façon aller chercher ce qu'il lui faut.
  apporte: { comment: string; commandes?: readonly string[]; conteneur?: boolean };
};

const reussi = ({ code }: { code: number | null }) => code === 0;

// Le nom de la base que l'essai crée puis supprime : à lui seul, d'un process
// et d'un instant à l'autre — un identifiant SQL qui ne demande aucun guillemet.
export const baseDEssai = () => `brigade_essai_${process.pid}_${Math.random().toString(36).slice(2, 10)}`;

// Postgres : se connecter, créer une base, puis la supprimer — quoi qu'il en
// soit. `-w` : jamais de mot de passe demandé, la connexion se fait comme
// celle des tests, avec ce que le compte a (PGHOST, PGUSER, ~/.pgpass).
// `-d` : la base de maintenance, que tout serveur a, et un délai de connexion.
export function essaiPostgres(jouer: Jouer, base: string = baseDEssai()): boolean {
  const sql = (requete: string) => reussi(jouer("psql", ["-X", "-w", "-q", "-v", "ON_ERROR_STOP=1", "-d", "dbname=postgres connect_timeout=5", "-c", requete]));
  if (!sql("SELECT 1")) return false;
  try {
    return sql(`CREATE DATABASE ${base}`);
  } finally {
    sql(`DROP DATABASE IF EXISTS ${base}`);
  }
}

// MySQL ou MariaDB : de même, avec le premier client que la machine a.
export function essaiMysql(jouer: Jouer, base: string = baseDEssai()): boolean {
  for (const client of ["mysql", "mariadb"]) {
    const sql = (requete: string) => jouer(client, ["--connect-timeout=5", "--batch", "-e", requete]);
    const connexion = sql("SELECT 1");
    // Ce client ne se lance pas : l'autre, peut-être.
    if (connexion.code === null) continue;
    if (!reussi(connexion)) return false;
    try {
      return reussi(sql(`CREATE DATABASE ${base}`));
    } finally {
      sql(`DROP DATABASE IF EXISTS ${base}`);
    }
  }
  return false;
}

const sdk = (id: string, nom: string, partie: string, installe: (station: string) => string, indices: Indices, commandes: readonly string[], plus: Partial<Fourni> = {}): Besoin => ({
  id,
  nom,
  indices,
  fourni: { commandes, capacites: [id], ...plus },
  installe,
  couverture: `the tests that need it are skipped on this station, so ${partie} is no longer built nor tested here`,
  apporte: { comment: `it downloads ${nom} into the cook's account before the tests, and puts it on their \`PATH\`` },
});

export const BESOINS: readonly Besoin[] = [
  {
    id: "postgres",
    nom: "a Postgres database",
    indices: {
      commandes: ["psql", "pg_isready", "createdb", "dropdb", "initdb", "pg_ctl", "pg_restore"],
      adresses: /\bpostgres(?:ql)?:\/\//,
      npm: ["pg", "postgres", "pg-promise", "slonik", "@databases/pg"],
      gem: ["pg"],
      pip: ["psycopg2", "psycopg2-binary", "psycopg", "asyncpg"],
      go: ["github.com/lib/pq", "github.com/jackc/pgx"],
      cargo: ["postgres", "tokio-postgres"],
      jvm: ["org.postgresql"],
      images: ["postgres", "postgis/postgis"],
      prisma: "postgresql",
    },
    fourni: { commandes: ["postgres", "pg_ctl", "pg_ctlcluster", "psql"], capacites: ["postgres", "postgresql"], essai: (jouer) => essaiPostgres(jouer) },
    installe: (station) => `A PostgreSQL server (the \`postgresql\` package) is installed on ${station} and runs there as a service`,
    couverture: "the tests that use the database run against a substitute or are skipped, so queries and migrations are no longer checked against a real Postgres",
    erreurs: [
      // `psql: error: connection to server on socket "/var/run/postgresql/.s.PGSQL.5432" failed: FATAL:  role "claude" does not exist`
      /\bconnection to server (?:on socket|at) .*\bfailed\b/i,
      /\bcould not connect to (?:the )?(?:database )?server\b/i,
      /\bFATAL:\s+(?:role "[^"]*" does not exist|password authentication failed|Peer authentication failed|Ident authentication failed|no pg_hba\.conf entry)/i,
      /\bpermission denied to create database\b/i,
      /\bECONNREFUSED\b.*:5432\b/,
      /\bCan't reach database server at\b.*:5432\b/,
    ],
    apporte: {
      comment: "it starts a throwaway Postgres server of its own for the tests, under the cook's account, in the worktree (`initdb` and `pg_ctl` on a free port), or in a container",
      // Debian n'a dans le PATH que `pg_ctlcluster` : `initdb` et `pg_ctl` sont dans `/usr/lib/postgresql/<version>/bin`.
      commandes: ["initdb", "pg_ctl", "pg_ctlcluster", "postgres"],
      conteneur: true,
    },
  },
  {
    id: "mysql",
    nom: "a MySQL database",
    indices: {
      commandes: ["mysql", "mysqladmin", "mariadb"],
      adresses: /\b(?:mysql|mariadb):\/\//,
      npm: ["mysql", "mysql2"],
      gem: ["mysql2"],
      pip: ["mysqlclient", "pymysql"],
      go: ["github.com/go-sql-driver/mysql"],
      jvm: ["com.mysql", "org.mariadb.jdbc"],
      images: ["mysql", "mariadb"],
      prisma: "mysql",
    },
    fourni: { commandes: ["mysqld", "mariadbd", "mysql", "mariadb"], capacites: ["mysql", "mariadb"], essai: (jouer) => essaiMysql(jouer) },
    installe: (station) => `A MySQL-compatible server (the \`mariadb-server\` package) is installed on ${station} and runs there as a service`,
    couverture: "the tests that use the database run against a substitute or are skipped, so queries and migrations are no longer checked against a real MySQL",
    erreurs: [/\bERROR (?:2002|2003|1044|1045) \(/, /\bCan't connect to (?:local )?(?:MySQL|MariaDB) server\b/i, /\bECONNREFUSED\b.*:3306\b/, /\bCan't reach database server at\b.*:3306\b/],
    apporte: {
      comment: "it starts a throwaway MySQL-compatible server of its own for the tests, under the cook's account, in the worktree (`mysqld --initialize-insecure` on a free port), or in a container",
      commandes: ["mysqld", "mariadbd"],
      conteneur: true,
    },
  },
  {
    id: "redis",
    nom: "a Redis server",
    indices: {
      commandes: ["redis-server", "redis-cli"],
      adresses: /\brediss?:\/\//,
      npm: ["redis", "ioredis"],
      gem: ["redis"],
      pip: ["redis"],
      images: ["redis"],
    },
    // Le serveur répond.
    fourni: { commandes: ["redis-server", "redis-cli"], capacites: ["redis"], essai: (jouer) => /\bPONG\b/.test(jouer("redis-cli", ["ping"]).sortie) },
    installe: (station) => `A Redis server (the \`redis-server\` package) is installed on ${station} and runs there as a service`,
    couverture: "the tests that use Redis run against a fake, so its real behaviour (expiry, queues, pub/sub) is no longer checked",
    erreurs: [/\bCould not connect to Redis\b/i, /\bECONNREFUSED\b.*:6379\b/],
    apporte: { comment: "it starts a Redis server of its own for the tests, under the cook's account, on a free port (`redis-server`), or in a container", commandes: ["redis-server"], conteneur: true },
  },
  {
    id: "docker",
    nom: "Docker",
    indices: {
      commandes: ["docker", "docker-compose", "podman"],
      npm: ["testcontainers", "@testcontainers/postgresql", "@testcontainers/mysql", "@testcontainers/redis"],
      pip: ["testcontainers"],
      go: ["github.com/testcontainers/testcontainers-go"],
      jvm: ["org.testcontainers"],
    },
    // Le démon répond au compte : il tourne, et le compte a le droit de lui parler.
    fourni: { commandes: ["docker", "podman"], capacites: ["docker"], essai: (jouer) => ["docker", "podman"].some((commande) => reussi(jouer(commande, ["info"]))) },
    installe: (station) => `Docker Engine (the \`docker.io\` package) is installed on ${station} and the station's account joins the \`docker\` group, which lets every cook of the box start containers`,
    couverture: "the tests that start containers are skipped on this station, so what runs inside them is no longer checked here",
    erreurs: [/\bCannot connect to the Docker daemon\b/i, /\bpermission denied while trying to connect to the Docker daemon\b/i],
    apporte: { comment: "its tests get what they start in containers without a Docker daemon: the services run as processes of the cook's account, or in a rootless engine of its own" },
  },
  {
    id: "browser",
    nom: "a browser",
    indices: {
      npm: ["@playwright/test", "playwright", "puppeteer", "cypress", "selenium-webdriver", "webdriverio", "karma-chrome-launcher"],
      gem: ["selenium-webdriver", "cuprite", "apparition"],
      pip: ["playwright", "pytest-playwright", "selenium"],
      fichiers: [
        { motif: /(?:^|\/)playwright\.config\.[cm]?[jt]s$/, raison: "configures Playwright tests" },
        { motif: /(?:^|\/)cypress(?:\.config\.[cm]?[jt]s|\.json)$/, raison: "configures Cypress tests" },
        { motif: /(?:^|\/)wdio\.conf\.[cm]?[jt]s$/, raison: "configures WebdriverIO tests" },
      ],
    },
    fourni: {
      commandes: ["chromium", "chromium-browser", "google-chrome", "google-chrome-stable", "chrome", "firefox", "microsoft-edge", "msedge"],
      capacites: ["navigateur-headless", "chrome-connecté", "browser", "navigateur"],
      // Les navigateurs que Playwright a déjà téléchargés pour le compte de la station.
      dossiers: (env, maison) => [env.PLAYWRIGHT_BROWSERS_PATH ?? "", `${maison}/.cache/ms-playwright`, `${maison}/Library/Caches/ms-playwright`].filter((dossier) => dossier !== "" && dossier !== "0"),
    },
    installe: (station) => `A headless Chromium and the system libraries it needs are installed on ${station}`,
    couverture: "the end-to-end tests that drive a browser are skipped on this station, so pages are no longer checked as a user sees them",
    // Le navigateur téléchargé ne suffit pas toujours : Chromium demande des
    // bibliothèques du système que le compte de la cuisine n'installe pas.
    apporte: { comment: "it downloads the browser its tests drive into the cook's account (`npx playwright install chromium`, or the download of its test runner)" },
  },
  sdk("go", "the Go toolchain", "the Go code", (station) => `The Go toolchain is installed on ${station}`, { fichiers: [{ motif: /(?:^|\/)go\.mod$/, raison: "declares a Go module" }] }, ["go"]),
  sdk("rust", "the Rust toolchain", "the Rust code", (station) => `The Rust toolchain (\`rustup\` and \`cargo\`) is installed on ${station}, for the station's account`, { fichiers: [{ motif: /(?:^|\/)Cargo\.toml$/, raison: "declares a Rust crate" }] }, ["cargo"]),
  sdk(
    "java",
    "a Java JDK",
    "the Java code",
    (station) => `A Java JDK (the \`default-jdk\` package) is installed on ${station}`,
    { fichiers: [{ motif: /(?:^|\/)(?:pom\.xml|build\.gradle(?:\.kts)?)$/, raison: "builds with Maven or Gradle" }] },
    ["javac"],
  ),
  sdk(
    "dotnet",
    "the .NET SDK",
    "the .NET code",
    (station) => `The .NET SDK is installed on ${station}`,
    { fichiers: [{ motif: /\.(?:csproj|fsproj|sln)$/, raison: "is a .NET project" }], contenus: [{ fichier: /(?:^|\/)global\.json$/, motif: /"sdk"\s*:/, raison: "pins a .NET SDK" }] },
    ["dotnet"],
  ),
  sdk("flutter", "the Flutter SDK", "the Flutter app", (station) => `The Flutter SDK is installed on ${station}`, { contenus: [{ fichier: /(?:^|\/)pubspec\.yaml$/, motif: /^\s*sdk:\s*flutter\b/m, raison: "depends on the Flutter SDK" }] }, ["flutter"]),
  sdk(
    "android",
    "the Android SDK",
    "the Android app",
    (station) => `The Android SDK and a Java JDK are installed on ${station}`,
    {
      fichiers: [{ motif: /(?:^|\/)AndroidManifest\.xml$/, raison: "is an Android app" }],
      contenus: [{ fichier: /(?:^|\/)build\.gradle(?:\.kts)?$/, motif: /\bcom\.android\.(?:application|library)\b/, raison: "applies the Android Gradle plugin" }],
    },
    ["sdkmanager"],
    { variables: ["ANDROID_HOME", "ANDROID_SDK_ROOT"] },
  ),
  {
    ...sdk("xcode", "Xcode", "the Apple app", (station) => `Xcode is installed on ${station}, which must then be a Mac: Xcode runs on nothing else`, { fichiers: [{ motif: /\.(?:xcodeproj|xcworkspace)$/, raison: "is an Xcode project" }] }, ["xcodebuild"]),
    apporte: { comment: "it downloads Xcode into the cook's account before the tests, which works only on a Mac" },
  },
  sdk("swift", "the Swift toolchain", "the Swift package", (station) => `The Swift toolchain is installed on ${station}`, { fichiers: [{ motif: /(?:^|\/)Package\.swift$/, raison: "declares a Swift package" }] }, ["swift"]),
];

// Le préfixe des identifiants de choix, et des blocages qui les attendent.
export const PREFIXE = "need:";
export const idDuChoix = (besoin: string) => `${PREFIXE}${besoin}`;

export const besoinNomme = (id: string): Besoin | null => BESOINS.find((besoin) => besoin.id === id) ?? null;
