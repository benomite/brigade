// The pending choices a station publishes for the needs it lacks (formerly built by runtime/src/installation/besoins/,
// `choixPour` on the catalogue's `postgres`, `docker` and `browser`), for project "parade" on station "box", word for word.
export const ACTION_OF_CHOICE = "choose-need";

export const CHOICES_OF_NEEDS = {
  "postgres": {
    "id": "need:postgres",
    "need": "postgres",
    "message": "The tests of parade need a Postgres database, which box does not have.",
    "cause": "`.claude/brigade/worktree-setup.sh` runs `psql`.",
    "options": [
      {
        "id": "cook-elsewhere",
        "label": "Cook it on a station that has it",
        "consequence": "The tickets of parade whose tests need a Postgres database wait until a station that provides `postgres` is declared for parade; none is today, so they do not start."
      },
      {
        "id": "provide-here",
        "label": "Provide it on box",
        "consequence": "A PostgreSQL server (the `postgresql` package) is installed on box and runs there as a service, and the tests of parade run there with it: no ticket waits for another station."
      },
      {
        "id": "adapt-tests",
        "label": "Adapt the tests",
        "consequence": "A ticket of parade rewrites its tests so they pass without a Postgres database: the tests that use the database run against a substitute or are skipped, so queries and migrations are no longer checked against a real Postgres."
      },
      {
        "id": "setup-brings-it",
        "label": "The project's setup brings it itself",
        "consequence": "A ticket of parade makes its worktree setup bring a Postgres database itself — it starts a throwaway Postgres server of its own for the tests, under the cook's account, in the worktree (`initdb` and `pg_ctl` on a free port), or in a container —, and its tests run with it: what that takes is not on box yet, so the setup has to fetch it, or that ticket says what must be installed there."
      }
    ]
  },
  "docker": {
    "id": "need:docker",
    "need": "docker",
    "message": "The tests of parade need Docker, which box does not have.",
    "cause": "`apps/api/package.json` depends on `testcontainers`.",
    "options": [
      {
        "id": "cook-elsewhere",
        "label": "Cook it on a station that has it",
        "consequence": "The tickets of parade whose tests need Docker wait until a station that provides `docker` is declared for parade; none is today, so they do not start."
      },
      {
        "id": "provide-here",
        "label": "Provide it on box",
        "consequence": "Docker Engine (the `docker.io` package) is installed on box and the station's account joins the `docker` group, which lets every cook of the box start containers, and the tests of parade run there with it: no ticket waits for another station."
      },
      {
        "id": "adapt-tests",
        "label": "Adapt the tests",
        "consequence": "A ticket of parade rewrites its tests so they pass without Docker: the tests that start containers are skipped on this station, so what runs inside them is no longer checked here."
      },
      {
        "id": "setup-brings-it",
        "label": "The project's setup brings it itself",
        "consequence": "A ticket of parade makes its worktree setup bring Docker itself — its tests get what they start in containers without a Docker daemon: the services run as processes of the cook's account, or in a rootless engine of its own —, and its tests run with it: what that takes is not on box yet, so the setup has to fetch it, or that ticket says what must be installed there."
      }
    ]
  },
  "browser": {
    "id": "need:browser",
    "need": "browser",
    "message": "The tests of parade need a browser, which box does not have.",
    "cause": "`package.json` depends on `playwright`.",
    "options": [
      {
        "id": "cook-elsewhere",
        "label": "Cook it on a station that has it",
        "consequence": "The tickets of parade whose tests need a browser wait until a station that provides `navigateur-headless` is declared for parade; none is today, so they do not start."
      },
      {
        "id": "provide-here",
        "label": "Provide it on box",
        "consequence": "A headless Chromium and the system libraries it needs are installed on box, and the tests of parade run there with it: no ticket waits for another station."
      },
      {
        "id": "adapt-tests",
        "label": "Adapt the tests",
        "consequence": "A ticket of parade rewrites its tests so they pass without a browser: the end-to-end tests that drive a browser are skipped on this station, so pages are no longer checked as a user sees them."
      },
      {
        "id": "setup-brings-it",
        "label": "The project's setup brings it itself",
        "consequence": "A ticket of parade makes its worktree setup bring a browser itself — it downloads the browser its tests drive into the cook's account (`npx playwright install chromium`, or the download of its test runner) —, and its tests run with it: what that takes is not on box yet, so the setup has to fetch it, or that ticket says what must be installed there."
      }
    ]
  }
};

