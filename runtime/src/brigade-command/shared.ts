// What every subcommand shares: the machine it runs on, what it returns, the service names.
export type Ran = { code: number; stdout: string; stderr: string };
export type Machine = {
  platform: "linux" | "darwin";
  env: NodeJS.ProcessEnv;
  now: () => Date;
  run: (program: string, args: string[], input?: string) => Ran;
  freeBytes: (path: string) => number;
};
export type Result = { code: number; out: string; err: string };

export const ok = (out: string): Result => ({ code: 0, out: out.endsWith("\n") ? out : `${out}\n`, err: "" });
export const fail = (err: string, code = 1): Result => ({ code, out: "", err: `brigade: ${err}\n` });

// The service manager's names for the station and its update, the same on both systems.
export const UNIT = "brigade-station.service";
export const UPDATE_UNIT = "brigade-station-mise-a-jour.service";
export const LABEL = "com.brigade.station";
export const UPDATE_LABEL = "com.brigade.station-update";
export const MAC_LOG = "/var/log/brigade-station.log";

export const stationDir = (machine: Machine): string =>
  machine.env.BRIGADE_STATION_DIR || (machine.platform === "darwin" ? "/Library/Application Support/brigade" : "/var/lib/brigade");
export const updateDir = (machine: Machine): string => machine.env.BRIGADE_MISE_A_JOUR_DIR || "/var/lib/brigade-station";
