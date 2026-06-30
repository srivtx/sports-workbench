// Auth + base URL tests

import { test } from "node:test";
import assert from "node:assert/strict";
import { makeBaseUrl, makeAuthUrl } from "../src/client/auth.ts";

test("mainnet urls", () => {
  assert.equal(makeBaseUrl({}), "https://txline.txodds.com/api");
  assert.equal(makeAuthUrl({}), "https://txline.txodds.com/auth/guest/start");
});

test("devnet urls", () => {
  assert.equal(makeBaseUrl({ devnet: true }), "https://txline-dev.txodds.com/api");
  assert.equal(makeAuthUrl({ devnet: true }), "https://txline-dev.txodds.com/auth/guest/start");
});

test("override api base", () => {
  assert.equal(
    makeBaseUrl({ apiBase: "https://custom.example.com/api" }),
    "https://custom.example.com/api"
  );
});
