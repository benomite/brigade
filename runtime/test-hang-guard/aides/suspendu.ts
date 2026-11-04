// A test file the guard's own test plays (its name is not `*.test.ts`: the suite does not play it).
import { spawn } from "node:child_process";
import test from "node:test";

test("never resolves", async () => {
  spawn(process.execPath, ["-e", "setTimeout(() => {}, 60000)"], { stdio: "ignore" });
  await new Promise(() => {});
});

// Past the 500 ms limit its test sets, within the 2 s it opted in for.
test("opted in for longer", { timeout: 2000 }, async () => {
  await new Promise((resolve) => setTimeout(resolve, 700));
});

test("quick", () => {});
