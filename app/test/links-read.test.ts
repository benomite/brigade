import assert from "node:assert/strict";
import { test } from "node:test";
import { LinksRead } from "../src/links-read.ts";

test("les liens d'un ticket sont remplacés à chaque lecture de sa discussion", () => {
  const links = new LinksRead();
  const key = "parade#30";
  links.discussion(key, ["https://github.com/benomite/brigade/pull/31"]);
  assert.ok(links.connait(key, "https://github.com/benomite/brigade/pull/31"));
  links.discussion(key, []);
  assert.ok(!links.connait(key, "https://github.com/benomite/brigade/pull/31"));
  assert.ok(!links.connait("parade#31", "https://github.com/benomite/brigade/pull/31"));
});
