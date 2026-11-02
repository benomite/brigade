// A test file the guard's own test plays (its name is not `*.test.ts`: the suite does not play it).
import { spawn } from "node:child_process";
import test from "node:test";

test("never resolves", async () => {
  spawn(process.execPath, ["-e", "setTimeout(() => {}, 60000)"], { stdio: "ignore" });
  await new Promise(() => {});
});

test("opted in for longer", { timeout: 5000 }, async () => {
  await new Promise((resolve) => setTimeout(resolve, 1500));
});

test("quick", () => {});
