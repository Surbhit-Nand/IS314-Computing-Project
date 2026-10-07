// Autocomplete suggestions for the typed Species box shown when staff pick
// Other. Suggestions only - any properly formatted name is accepted (see
// validateSpeciesName in animalFieldRules.ts). Dog and cat breeds come from
// the breeds table via GET /api/animals/breeds/:species instead.
export const OTHER_ANIMAL_SUGGESTIONS = [
  "Rabbit",
  "Hamster",
  "Guinea Pig",
  "Mouse",
  "Rat",
  "Snake",
  "Lizard",
  "Ferret",
  "Bird",
  "Parrot",
  "Chicken",
  "Duck",
  "Goat",
  "Pig",
  "Tortoise",
  "Turtle",
];

// General colour list, kept species-agnostic since coat colours mostly
// overlap across dogs/cats/rabbits/etc.
export const COLOUR_OPTIONS = [
  "Black",
  "White",
  "Brown",
  "Ginger",
  "Blonde/Tan",
  "Grey",
  "Cream",
  "Black and White",
  "Mixed/Multi-colour",
  "Other",
];
