import assert from "node:assert/strict";
import { test } from "node:test";
import { LinksRead } from "../src/links-read.ts";

test("le lien d'une capture survit à la lecture de la discussion, et ne s'écrit qu'une fois", () => {
  const links = new LinksRead();
  const key = "parade#30";
  const file = "https://github.com/benomite/brigade/blob/abc/docs/captures/30/a.png";
  links.capture(key, file);
  links.capture(key, file);
  links.discussion(key, ["https://github.com/benomite/brigade/pull/31"]);
  assert.ok(links.connait(key, file));
  assert.ok(links.connait(key, "https://github.com/benomite/brigade/pull/31"));
  links.discussion(key, []);
  assert.ok(!links.connait(key, "https://github.com/benomite/brigade/pull/31"));
  assert.ok(!links.connait("parade#31", file));
});
