// "Make this computer cook" (#4744): on a computer that is not a station, the app offers to install one — the
// darwin-arm64 archive and its `install.sh`, in a terminal (`claude setup-token` needs a browser, the GitHub token is
// asked there). The embedded station's projects move along, without their `CLONE=` paths: the new station clones afresh
// as `brigade`, and work in flight in the old one is dropped (it will be cooked again).
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const STATION_COMMAND = "/usr/local/bin/brigade";
const RELEASE = { repository: "benomite/brigade", tag: "station", archive: "brigade-station-.*-darwin-arm64[.]tar[.]gz" };

export type Offer = { offered: false } | { offered: true; command: string };

// The lines of the embedded station's `projects`, as the new station gets them: same name, repository, base and
// places, no `CLONE=`. Comments and blank lines are dropped.
export function projectsToMove(text: string): string {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"))
    .map((line) => line.split(/\s+/).filter((word) => !word.startsWith("CLONE=")).join(" "));
  return lines.length === 0 ? "" : `${lines.join("\n")}\n`;
}

const quote = (text: string) => `'${text.replaceAll("'", `'\\''`)}'`;

// The one command to run (or paste): download the darwin-arm64 archive, unpack it, `sudo ./install.sh`.
export function installCommand(projectsFile?: string): string {
  const environment = projectsFile === undefined ? "" : `BRIGADE_PROJECTS_FILE=${quote(projectsFile)} `;
  return [
    "dir=$(mktemp -d)",
    'cd "$dir"',
    // The release keeps every version's archive: take the newest darwin-arm64 one, a single file for `tar`.
    `archive=$(gh release view ${RELEASE.tag} --repo ${RELEASE.repository} --json assets --jq '[.assets[].name | select(test("^${RELEASE.archive}$"))] | sort | last')`,
    `gh release download ${RELEASE.tag} --repo ${RELEASE.repository} --pattern "$archive"`,
    'tar -xzf "$archive"',
    `sudo ${environment}./install.sh`,
  ].join(" && ");
}

type Options = {
  // Is this computer a station: the command exists and `brigade status` answers.
  isStation: () => boolean;
  // `<embedded station dir>/kitchen/projects`'s content, or undefined when the file does not exist.
  embeddedProjects: () => string | undefined;
  // Writes the moved lines to a file the install can read, and says where.
  keepMoved: (text: string) => string;
};

export function offerToMakeCook(options: Options): Offer {
  if (options.isStation()) return { offered: false };
  const projects = options.embeddedProjects();
  const moved = projects === undefined ? "" : projectsToMove(projects);
  return { offered: true, command: installCommand(moved === "" ? undefined : options.keepMoved(moved)) };
}

// The real probes, for the main process.
export function offerOnThisComputer(embeddedStationDir: string, run: (command: string, args: string[]) => boolean): Offer {
  const projectsFile = join(embeddedStationDir, "kitchen", "projects");
  return offerToMakeCook({
    isStation: () => existsSync(STATION_COMMAND) && run(STATION_COMMAND, ["status"]),
    embeddedProjects: () => (existsSync(projectsFile) ? readFileSync(projectsFile, "utf8") : undefined),
    keepMoved: (text) => {
      const file = join(mkdtempSync(join(tmpdir(), "brigade-projects-")), "projects");
      writeFileSync(file, text);
      return file;
    },
  });
}
