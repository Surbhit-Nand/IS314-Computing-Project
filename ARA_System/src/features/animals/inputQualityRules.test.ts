import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as client from "./animalFieldRules.js";
import * as server from "../../../server/src/modules/animals/animalFieldRules.js";

// Run: npm test. Name, estimated age and gibberish rules, through BOTH copies
// of the shared rules (browser and API) so the form and server can't disagree.
const copies = [
  ["client", client],
  ["server", server],
] as const;

// The profile that was actually saved with junk - every field must fail.
const JUNK_SAMPLE = {
  name: "143242513526477869878",
  age: "211345r6tyu8",
  description:
    "w1234567890qgerahstfjcgykhj,vgmfdgesy45rdutkfugyreeertdykufhgcmnfdhuyjfgn sgrstdykg dfbgxhcj eWRETYKUYFJHBN  EWRGETSRYGCJH",
  behaviour:
    "34567687iukjnm3rw4t5ye6r7t8oykftdjhdsgfe3rwefsdvx SDYTUFMGCH VC grgetrsydgj retrjydu reatsrytdmu wretnryhcg",
  rescueHistory: "ertjvyukblinkl ertrnytg ae rtrsytjmhk ebtr yjfhkh reatrystduyfjhnb",
};

// Normal text that must keep passing: Fiji places and names, breed and vet
// words, numbers with units, "strengths", "rhythm", hyphenated ages.
const REAL_TEXT = [
  "Found near the Nausori bus stand and brought to the SPCA Fiji centre in Suva for a full health check.",
  "Rescued from a farm outside Lautoka after neighbours in Savusavu and Labasa reported him wandering.",
  "Microchipped, dewormed and vaccinated against parvovirus and distemper. Weighs about 3kg.",
  "A gentle dachshund cross who loves rhythm and routine, and shows real strengths with children.",
  "She was 10 weeks old when found, now 2.5kg heavier and on her 2nd round of vaccinations.",
  "Surrendered by Rajnesh and Jyoti Prasad from Nasinu when they moved to Sigatoka in the 1990s.",
  "Found at Rakiraki on 25/09/2026 at 7am, thin and dehydrated, with a 10-week-old litter nearby.",
  "The RSPCA partner clinic gave her vitamin B12 injections and a K9 behaviour assessment.",
  "Brought in by a Taveuni resident, Mr O'Brien, after the cyclone. He is a well-socialised, calm cat.",
  "Found sheltering under the Qamea jetty and at Seaqaqa market; fed by locals before rescue.",
  "Aqua is a 2-year-old male black cat who came into our care on 25 September 2026.",
];

const JUNK_TEXT: [string, RegExp][] = [
  ["asdfgh qwerty zxcvbn poiuyt lkjhgf mnbvcx sdfgh", /random typing/],
  ["qwrtplkjh bcdfghjklm nbvcxz plmkjn xcvbnm trwqsd", /random typing/],
  ["The dog is xkcdqwrtz and fjdkslqp and bvnmzxcq too", /random typing/],
  ["Lovely dog THATISVERYNICE and SOMETHINGELSE is here today", /odd capital letters/],
  ["Nice dog with aBcDeF style and gOOd behaviour in the home", /odd capital letters/],
  ["He is supercalifragilisticexpialidocious and very kind to all", /longer than 20 letters/],
  ["Dog 123abc456 loves walks and 9x8y7z treats every day ok", /mixes numbers and letters/],
];

describe("gibberish detection (Description / Behaviour / Rescue history)", () => {
  for (const [name, rules] of copies) {
    it(`${name}: rejects every field of the junk sample`, () => {
      assert.match(rules.validateNarrativeText(JUNK_SAMPLE.description, "Description") ?? "", /real words/);
      assert.match(rules.validateNarrativeText(JUNK_SAMPLE.behaviour, "Behaviour") ?? "", /real words/);
      assert.match(rules.validateNarrativeText(JUNK_SAMPLE.rescueHistory, "Rescue history") ?? "", /random typing/);
    });

    it(`${name}: rejects other keyboard mash`, () => {
      for (const [text, expected] of JUNK_TEXT) {
        assert.match(rules.validateNarrativeText(text, "Description") ?? "", expected, text);
      }
    });

    it(`${name}: lets normal text through`, () => {
      for (const text of REAL_TEXT) assert.equal(rules.validateNarrativeText(text, "Description"), null, text);
    });
  }
});

describe("validateAnimalName / formatAnimalName", () => {
  for (const [name, rules] of copies) {
    it(`${name}: accepts real names`, () => {
      for (const value of ["Bella", "Mr Whiskers", "O'Malley", "Mary-Jane", "Stu", "Pip", "Bo", "Rajnesh", "Smokey"]) {
        assert.equal(rules.validateAnimalName(value), null, value);
      }
    });

    it(`${name}: rejects digits, junk, bad shapes and lengths`, () => {
      const cases: [string, RegExp][] = [
        [JUNK_SAMPLE.name, /can't contain numbers/],
        ["Bella2", /can't contain numbers/],
        ["", /Name is required/],
        ["B", /2-30 characters/],
        ["A".repeat(31), /2-30 characters/],
        ["-Bella", /starting with a letter/],
        ["Bella!", /letters, spaces, hyphens and apostrophes/],
        ["aaaa", /real name/],
        ["qwerty", /real name/],
        ["asdf", /real name/],
        ["Asdf Jones", /real name/],
        ["abc", /real name/],
        ["Xkcd", /real name/],
      ];
      for (const [value, expected] of cases) assert.match(rules.validateAnimalName(value) ?? "", expected, value);
    });

    it(`${name}: capitalises the first letter of each word, keeping the rest`, () => {
      assert.equal(rules.formatAnimalName("  mr   whiskers "), "Mr Whiskers");
      assert.equal(rules.formatAnimalName("mary-jane"), "Mary-Jane");
      assert.equal(rules.formatAnimalName("McFluffy"), "McFluffy");
    });
  }
});

describe("estimated age (number + unit)", () => {
  for (const [name, rules] of copies) {
    it(`${name}: accepts realistic ages`, () => {
      const ok: [string, client.AgeUnit][] = [
        ["2", "years"],
        ["2.5", "years"],
        ["0.5", "years"],
        ["40", "years"],
        ["6", "months"],
        ["23", "months"],
        ["10", "weeks"],
        ["51", "weeks"],
      ];
      for (const [value, unit] of ok) assert.equal(rules.validateEstimatedAge(value, unit), null, `${value} ${unit}`);
    });

    it(`${name}: rejects zero, too many decimals, unrealistic values and missing parts`, () => {
      const bad: [string, client.AgeUnit | "", RegExp][] = [
        ["0", "years", /greater than 0/],
        ["-1", "years", /at most one decimal place/],
        ["2.55", "years", /at most one decimal place/],
        ["abc", "years", /at most one decimal place/],
        ["52", "weeks", /under 52 weeks/],
        ["24", "months", /under 24 months/],
        ["41", "years", /at most 40 years/],
        ["2", "", /choose weeks, months or years/],
        ["", "years", /enter the animal's estimated age/],
      ];
      for (const [value, unit, expected] of bad) {
        assert.match(rules.validateEstimatedAge(value, unit) ?? "", expected, `${value} ${unit}`);
      }
    });

    it(`${name}: stores and reads back the existing text format`, () => {
      assert.equal(rules.formatEstimatedAge("1", "years"), "1 Year");
      assert.equal(rules.formatEstimatedAge("2.5", "years"), "2.5 Years");
      assert.equal(rules.formatEstimatedAge("6", "months"), "6 Months");
      assert.equal(rules.formatEstimatedAge("1", "weeks"), "1 Week");
      assert.deepEqual(rules.parseEstimatedAge("2.5 Years"), { value: "2.5", unit: "years" });
      assert.deepEqual(rules.parseEstimatedAge("1 year"), { value: "1", unit: "years" });
      assert.deepEqual(rules.parseEstimatedAge(" 10 Weeks "), { value: "10", unit: "weeks" });
      // Can't be understood - staff re-enter it on Edit.
      for (const text of ["2", "fafjo", "irwirfer", JUNK_SAMPLE.age, "", null]) {
        assert.equal(rules.parseEstimatedAge(text), null, String(text));
      }
      assert.match(rules.validateEstimatedAgeText(JUNK_SAMPLE.age) ?? "", /must look like/);
      assert.equal(rules.validateEstimatedAgeText("3 years"), null);
    });
  }
});
