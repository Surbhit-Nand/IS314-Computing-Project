import type { AnimalType } from "../../types/animal";

// Common breeds per species for the Breed dropdown (replaces free text, per
// lecturer feedback that free text let garbage input through). "Other" is
// always included as a fallback for anything not listed.
export const BREED_OPTIONS: Record<AnimalType, string[]> = {
  dog: [
    "Fijian mixed breed",
    "Labrador Retriever",
    "Golden Retriever",
    "German Shepherd",
    "Rottweiler",
    "Poodle",
    "Beagle",
    "Bulldog",
    "Chihuahua",
    "Husky",
    "Other",
  ],
  cat: [
    "Domestic Shorthair",
    "Domestic Mediumhair",
    "Domestic Longhair",
    "British Shorthair",
    "Siamese",
    "Persian",
    "Russian Blue",
    "Ragdoll",
    "Maine Coon",
    "Other",
  ],
  rabbit: [
    "Holland Lop",
    "Netherland Dwarf",
    "Mini Rex",
    "Lionhead",
    "Flemish Giant",
    "Dutch",
    "English Angora",
    "Mixed breed",
    "Other",
  ],
  other: ["Hamster", "Guinea Pig", "Bird", "Mixed/Unknown", "Other"],
};

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
