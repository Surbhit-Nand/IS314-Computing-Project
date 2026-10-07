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

export const BREED_SEED_ROWS: { species: "dog" | "cat"; name: string }[] = [
	...[...DOG_BREEDS, ...GENERAL_BREEDS].map((name) => ({ species: "dog" as const, name })),
	...[...CAT_BREEDS, ...GENERAL_BREEDS].map((name) => ({ species: "cat" as const, name })),
];
