import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as client from "./animalFieldRules.js";
import * as server from "../../../server/src/modules/animals/animalFieldRules.js";

// Run: npm test. Every case goes through BOTH copies of the rules (browser and
// API) so the form and the server can never disagree about what's valid.
const copies = [
  ["client", client],
  ["server", server],
] as const;

const realNarratives = [
  "Sweet tricolour Beagle with a tan face, white muzzle and chest, and long velvety ears.",
  "Found wandering near the Lautoka market on 25/09/2026 with a worn harness but no ID tag.",
  "Calm and gentle. Loves short walks, puzzle toys and sitting beside people on the couch.",
  "Shy at first but warms up quickly - give her time and she'll follow you everywhere!",
];

const badNarratives: [string, RegExp][] = [
  ["", /is required/],
  ["Friendly dog.", /at least 30 characters/],
  ["x".repeat(1001), /1000 characters or fewer/],
  ["123", /at least 30 characters/],
  ["1234567890 1234567890 1234567890", /not just numbers or symbols/],
  ["!!!! ???? #### $$$$ %%%% &&&& ****", /not just numbers or symbols/],
  ["dog 12345 67890 12345 67890 12345 67890", /mostly numbers or symbols/],
  ["Thisisonelongwordwithnospacesatallreally", /at least 5 words/],
  ["He is a goooood boy who loves walks", /repeated characters/],
  ["test test test test test test test", /repeats the same word/],
  ["dog cat dog cat dog cat dog cat dog cat", /repeats the same few words/],
  ["B, B, B, B, B, B, B, B, B, B, B, B", /repeat|mostly numbers or symbols/],
  ["B B B B B B B B B B B B B B B B", /repeats the same word/],
];

describe("validateNarrativeText", () => {
  for (const [name, rules] of copies) {
    it(`${name}: accepts real descriptions`, () => {
      for (const text of realNarratives) assert.equal(rules.validateNarrativeText(text, "Description"), null, text);
    });

    it(`${name}: rejects short, numeric, symbolic and repetitive text`, () => {
      for (const [text, expected] of badNarratives) {
        assert.match(rules.validateNarrativeText(text, "Description") ?? "", expected, JSON.stringify(text));
      }
    });
  }
});

describe("validateSpeciesName / validateOtherBreedName", () => {
  for (const [name, rules] of copies) {
    it(`${name}: accepts real names`, () => {
      for (const value of ["Rabbit", "Snake", "guinea pig", "Sugar-Glider", "Ox"]) {
        assert.equal(rules.validateSpeciesName(value), null, value);
      }
      for (const value of ["Holland Lop", "Unknown", "Mixed breed", "Syrian Mix", "Dwarf"]) {
        assert.equal(rules.validateOtherBreedName(value), null, value);
      }
    });

    it(`${name}: rejects junk`, () => {
      const cases: [string, RegExp][] = [
        ["", /Species is required/],
        ["R", /2-40 characters/],
        ["a".repeat(41), /2-40 characters|real name/],
        ["Rabbit2", /can't contain numbers/],
        ["Guinea_Pig", /letters, spaces and hyphens/],
        ["aaaa", /real name/],
        // Only the "same letter 3+ times in a row" rule catches this one.
        ["Rabbbit", /real name/],
        ["abc", /real name/],
        ["qwerty", /real name/],
        ["xzq", /real name/],
      ];
      for (const [value, expected] of cases) {
        assert.match(rules.validateSpeciesName(value) ?? "", expected, value);
      }
      assert.match(rules.validateOtherBreedName("") ?? "", /Breed is required/);
      assert.match(rules.validateOtherBreedName("123") ?? "", /Breed can't contain numbers/);
      assert.match(rules.validateOtherBreedName("aaaa") ?? "", /Breed doesn't look like a real name/);
    });

    it(`${name}: capitalises for display and save`, () => {
      assert.equal(rules.formatNameText("  guinea   pig "), "Guinea Pig");
      assert.equal(rules.formatNameText("SUGAR-glider"), "Sugar-Glider");
      assert.equal(rules.formatNameText("mixed breed"), "Mixed Breed");
    });
  }

  it("both copies give identical answers", () => {
    const inputs = [...realNarratives, ...badNarratives.map(([text]) => text), "Rabbit", "abc", "guinea pig", "Unknown"];
    for (const input of inputs) {
      assert.equal(client.validateNarrativeText(input, "X"), server.validateNarrativeText(input, "X"));
      assert.equal(client.validateSpeciesName(input), server.validateSpeciesName(input));
      assert.equal(client.validateOtherBreedName(input), server.validateOtherBreedName(input));
      assert.equal(client.formatNameText(input), server.formatNameText(input));
    }
  });
});
