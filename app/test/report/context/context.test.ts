// Le contexte d'un signalement (report/context/context.ts) : les versions et le système — le journal n'y entre plus (#4678).
import assert from "node:assert/strict";
import { arch, release, type } from "node:os";
import { test } from "node:test";
import { contextOfReport } from "../../../src/report/context/context.ts";

test("versions et système viennent des sources de l'app", async () => {
  const context = await contextOfReport({ appVersion: "1.4.0", runtimeVersion: () => "2.7.1" });
  assert.equal(context.appVersion, "1.4.0");
  assert.equal(context.runtimeVersion, "2.7.1");
  assert.equal(context.system.name, type());
  assert.equal(context.system.release, release());
  assert.equal(context.system.arch, arch());
  assert.notEqual(context.system.version, "");
  assert.ok(!("logLines" in context));
});

test("une version du runtime illisible : « unknown », sans exception", async () => {
  const context = await contextOfReport({ appVersion: "1.4.0", runtimeVersion: () => { throw new Error("illisible"); } });
  assert.equal(context.runtimeVersion, "unknown");
});
