// The dog and cat breeds seeded into the `breeds` table by
// `npm run db:seed:breeds`. Recognised breed names only, plus "Mixed breed"
// and "Unknown" for each species, since rescued animals often have no known
// pedigree. Add a breed here and re-run the seed script; existing rows are
// left alone (ON CONFLICT DO NOTHING), so re-running is always safe.
//
// "Domestic Shorthair/Mediumhair/Longhair" aren't pedigree breeds, but they
// are the standard shelter classification for non-pedigree cats by coat
// length, so they're included alongside "Mixed breed".

export const GENERAL_BREEDS = ["Mixed breed", "Unknown"] as const;

export const DOG_BREEDS = [
	"Akita",
	"Alaskan Malamute",
	"American Staffordshire Terrier",
	"Australian Cattle Dog",
	"Australian Shepherd",
	"Basset Hound",
	"Beagle",
	"Bernese Mountain Dog",
	"Bichon Frise",
	"Border Collie",
	"Boston Terrier",
	"Boxer",
	"Bull Terrier",
	"Bulldog",
	"Bullmastiff",
	"Cavalier King Charles Spaniel",
	"Chihuahua",
	"Chow Chow",
	"Cocker Spaniel",
	"Dachshund",
	"Dalmatian",
	"Dobermann",
	"English Springer Spaniel",
	"French Bulldog",
	"German Shepherd",
	"German Shorthaired Pointer",
	"Golden Retriever",
	"Great Dane",
	"Greyhound",
	"Jack Russell Terrier",
	"Labrador Retriever",
	"Maltese",
	"Miniature Schnauzer",
	"Pomeranian",
	"Poodle",
	"Pug",
	"Rhodesian Ridgeback",
	"Rottweiler",
	"Saint Bernard",
	"Samoyed",
	"Shar Pei",
	"Shetland Sheepdog",
	"Shih Tzu",
	"Siberian Husky",
	"Staffordshire Bull Terrier",
	"Weimaraner",
	"West Highland White Terrier",
	"Whippet",
	"Yorkshire Terrier",
] as const;

export const CAT_BREEDS = [
	"Abyssinian",
	"American Shorthair",
	"Bengal",
	"Birman",
	"Bombay",
	"British Shorthair",
	"Burmese",
	"Cornish Rex",
	"Devon Rex",
	"Domestic Longhair",
	"Domestic Mediumhair",
	"Domestic Shorthair",
	"Exotic Shorthair",
	"Himalayan",
	"Maine Coon",
	"Norwegian Forest Cat",
	"Oriental Shorthair",
	"Persian",
	"Ragdoll",
	"Russian Blue",
	"Scottish Fold",
	"Siamese",
	"Siberian",
	"Sphynx",
	"Tonkinese",
	"Turkish Angora",
] as const;

// Breed lists for typed "Other" species (migration 0017), keyed by the
// species' display spelling - staff typing "guinea pig" match "Guinea Pig".
// Each also gets "Mixed breed" and "Unknown". Includes every breed the
// existing Other animals already have (Holland Lop, Syrian, Dwarf...), so none
// of them open as unlisted. Species typed without a list here (e.g. Snake,
// Lizard) keep a typed Breed box.
export const OTHER_SPECIES_BREEDS: Record<string, readonly string[]> = {
	Rabbit: [
		"Dutch",
		"English Angora",
		"English Lop",
		"Flemish Giant",
		"French Lop",
		"Harlequin",
		"Himalayan",
		"Holland Lop",
		"Jersey Wooly",
		"Lionhead",
		"Mini Lop",
		"Mini Rex",
		"Netherland Dwarf",
		"New Zealand",
		"Polish",
		"Rex",
	],
	Hamster: [
		"Campbell's Dwarf",
		"Chinese",
		"Dwarf",
		"Roborovski Dwarf",
		"Syrian",
		"Syrian Mix",
		"Winter White Dwarf",
	],
	"Guinea Pig": [
		"Abyssinian",
		"American",
		"Coronet",
		"Peruvian",
		"Rex",
		"Sheltie",
		"Skinny Pig",
		"Teddy",
		"Texel",
		"White Crested",
	],
	Mouse: ["Fancy", "Hairless", "Long-haired", "Rex", "Satin"],
	Rat: ["Dumbo", "Fancy", "Hairless", "Rex", "Satin", "Tailless"],
	Ferret: ["Angora", "Standard"],
	Bird: ["Budgerigar", "Canary", "Cockatiel", "Dove", "Finch", "Lovebird", "Myna", "Pigeon"],
	Parrot: ["African Grey", "Amazon", "Cockatoo", "Conure", "Eclectus", "Lorikeet", "Macaw", "Quaker"],
	Chicken: [
		"Australorp",
		"Brahma",
		"Leghorn",
		"Orpington",
		"Plymouth Rock",
		"Rhode Island Red",
		"Silkie",
		"Sussex",
		"Wyandotte",
	],
	Duck: ["Call", "Indian Runner", "Khaki Campbell", "Mallard", "Muscovy", "Pekin", "Rouen"],
	Goat: ["Alpine", "Anglo-Nubian", "Boer", "Kiko", "Nigerian Dwarf", "Pygmy", "Saanen", "Toggenburg"],
	Pig: ["Berkshire", "Duroc", "Hampshire", "Kunekune", "Landrace", "Large White", "Pot-bellied", "Tamworth"],
	Tortoise: ["Greek", "Hermann's", "Leopard", "Red-footed", "Russian", "Sulcata"],
	Turtle: ["Box", "Map", "Musk", "Painted", "Red-eared Slider", "Yellow-bellied Slider"],
};

export const BREED_SEED_ROWS: { species: "dog" | "cat" | "other"; speciesName: string | null; name: string }[] = [
	...[...DOG_BREEDS, ...GENERAL_BREEDS].map((name) => ({ species: "dog" as const, speciesName: null, name })),
	...[...CAT_BREEDS, ...GENERAL_BREEDS].map((name) => ({ species: "cat" as const, speciesName: null, name })),
	...Object.entries(OTHER_SPECIES_BREEDS).flatMap(([speciesName, names]) =>
		[...names, ...GENERAL_BREEDS].map((name) => ({ species: "other" as const, speciesName, name })),
	),
];
