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

// Ce qui dit que la station l'a. Une seule preuve suffit.
export type Fourni = {
  // Une commande que la machine trouve dans son PATH.
  commandes: readonly string[];
  // Une capacité que le projet déclare pour une station d'ici (`BRIGADE_STATIONS`).
  capacites: readonly string[];
  // Un dossier non vide (les navigateurs de Playwright), selon l'environnement.
  dossiers?: (env: Record<string, string | undefined>, maison: string) => string[];
  // Une variable qui nomme un dossier qui existe (`ANDROID_HOME`).
  variables?: readonly string[];
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
};

const sdk = (id: string, nom: string, partie: string, installe: (station: string) => string, indices: Indices, commandes: readonly string[], plus: Partial<Fourni> = {}): Besoin => ({
  id,
  nom,
  indices,
  fourni: { commandes, capacites: [id], ...plus },
  installe,
  couverture: `the tests that need it are skipped on this station, so ${partie} is no longer built nor tested here`,
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
    fourni: { commandes: ["postgres", "pg_ctl", "pg_ctlcluster"], capacites: ["postgres", "postgresql"] },
    installe: (station) => `A PostgreSQL server (the \`postgresql\` package) is installed on ${station} and runs there as a service`,
    couverture: "the tests that use the database run against a substitute or are skipped, so queries and migrations are no longer checked against a real Postgres",
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
    fourni: { commandes: ["mysqld", "mariadbd"], capacites: ["mysql", "mariadb"] },
    installe: (station) => `A MySQL-compatible server (the \`mariadb-server\` package) is installed on ${station} and runs there as a service`,
    couverture: "the tests that use the database run against a substitute or are skipped, so queries and migrations are no longer checked against a real MySQL",
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
    fourni: { commandes: ["redis-server"], capacites: ["redis"] },
    installe: (station) => `A Redis server (the \`redis-server\` package) is installed on ${station} and runs there as a service`,
    couverture: "the tests that use Redis run against a fake, so its real behaviour (expiry, queues, pub/sub) is no longer checked",
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
    fourni: { commandes: ["docker", "podman"], capacites: ["docker"] },
    installe: (station) => `Docker Engine (the \`docker.io\` package) is installed on ${station} and the station's account joins the \`docker\` group, which lets every cook of the box start containers`,
    couverture: "the tests that start containers are skipped on this station, so what runs inside them is no longer checked here",
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
  sdk("xcode", "Xcode", "the Apple app", (station) => `Xcode is installed on ${station}, which must then be a Mac: Xcode runs on nothing else`, { fichiers: [{ motif: /\.(?:xcodeproj|xcworkspace)$/, raison: "is an Xcode project" }] }, ["xcodebuild"]),
  sdk("swift", "the Swift toolchain", "the Swift package", (station) => `The Swift toolchain is installed on ${station}`, { fichiers: [{ motif: /(?:^|\/)Package\.swift$/, raison: "declares a Swift package" }] }, ["swift"]),
];

// Le préfixe des identifiants de choix, et des blocages qui les attendent.
export const PREFIXE = "need:";
export const idDuChoix = (besoin: string) => `${PREFIXE}${besoin}`;

export const besoinNomme = (id: string): Besoin | null => BESOINS.find((besoin) => besoin.id === id) ?? null;
