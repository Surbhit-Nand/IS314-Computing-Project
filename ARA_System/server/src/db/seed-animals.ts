// Seeds demo animal profiles so the listings, profile pages and photo gallery
// have realistic data to test against. Run with `npm run db:seed:animals`.
//
// Idempotent: an animal is skipped if a non-deleted profile with the same
// name already exists, so re-running never creates duplicates (matched on name
// alone, because migrations 0015/0016 changed the seeded rabbits' species).
//
// Dog/cat breeds must be names from the breeds table (breedSeedData.ts) - this
// script writes straight to the DB, bypassing the API's breed check. Rabbits
// and hamsters are species "other", with the typed species in `speciesName`
// ("Rabbit") and a free-text breed ("Lionhead").
//
// Photos are sourced from Wikimedia Commons (freely licensed). Each one was
// checked by eye against the profile's species/breed/colour, and every
// 3-photo animal uses a series of photos of the SAME animal from one
// photographer. photoUrls[0] is the main profile picture, as everywhere else.
// The Commons file name is passed to the helpers below, so each source page
// is https://commons.wikimedia.org/wiki/File:<name> (for licence/attribution).
//
// Each photo is copied into Cloudinary (folder "ara/animals", same as staff
// uploads) and the Cloudinary URL is stored, because Wikimedia rate-limits
// hotlinked images. If Cloudinary isn't configured or an upload fails, the
// Commons URL is stored instead.
//
// Before inserting, every NEW animal goes through the same checks as the
// Register form and the API (animalFieldRules.ts, resolveSpeciesAndBreed):
// name, estimated age, the three text fields, species/breed against the
// breeds table, plus gender, colour, size, priority and vaccination. If any
// animal fails, nothing is inserted. Every stored photo URL is then checked
// to load (HTTP 200, image type) and to be used by no other animal.
//
// Like registration through the API before it, this does not create AI search
// embeddings: run `npm run ai:backfill` to add them for new animals.
import { and, eq, isNull } from "drizzle-orm";
import {
	formatAnimalName,
	formatEstimatedAge,
	parseEstimatedAge,
	validateAnimalName,
	validateEstimatedAgeText,
	validateNarrativeText,
} from "../modules/animals/animalFieldRules.js";
import { findBreedName, findListedSpeciesName } from "../modules/animals/breeds.repository.js";
import { resolveSpeciesAndBreed } from "../modules/animals/speciesBreed.js";
import { cloudinary, isCloudinaryConfigured } from "../services/cloudinaryClient.js";
import { db } from "./client.js";
import { animals } from "./schema.js";

type SeedAnimal = Omit<
	typeof animals.$inferInsert,
	"id" | "publicId" | "status" | "deletedAt" | "createdAt" | "updatedAt"
>;

// "Ready to adopt" exactly as the vet module's medical clearance leaves an
// animal (setMedicalClearance in veterinary.repository.ts): medically cleared,
// veterinary status "medically_cleared", a clearance date and note, and the
// lifecycle status left at "intake". That is what publicAnimalVisibility()
// needs (cleared, not adopted, not deleted) and what shows as "Available for
// Adoption". medicalClearedByClerkUserId stays null - no real vet cleared
// these demo profiles, so none is named.
function readyToAdopt(
	animal: Omit<SeedAnimal, "medicallyCleared" | "veterinaryStatus" | "medicalClearanceDate" | "medicalClearanceNotes">,
	clearedOn: string,
	clearanceNote: string,
): SeedAnimal {
	return {
		...animal,
		medicallyCleared: true,
		veterinaryStatus: "medically_cleared",
		// Midday Fiji time on the clearance day.
		medicalClearanceDate: new Date(`${clearedOn}T12:00:00+12:00`),
		medicalClearanceNotes: clearanceNote,
	};
}

// Mirrors COLOUR_OPTIONS in src/features/animals/animalOptions.ts (the
// Colour dropdown) - keep the two in step. The server can't import from src/.
const COLOUR_OPTIONS = [
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

const COMMONS = "https://upload.wikimedia.org/wikipedia/commons";

// 960px is one of Wikimedia's standard (pre-cached) thumbnail widths;
// non-standard widths get rate-limited when hotlinked.
function thumb(hashPath: string, fileName: string) {
	return `${COMMONS}/thumb/${hashPath}/${fileName}/960px-${fileName}`;
}

// For originals already narrower than 960px, where no thumbnail exists.
function original(hashPath: string, fileName: string) {
	return `${COMMONS}/${hashPath}/${fileName}`;
}

const SEED_ANIMALS: SeedAnimal[] = [
	// ---------------------------------------------------------------- dogs
	{
		name: "Shadow",
		type: "dog",
		breed: "Labrador Retriever",
		estimatedAge: "3 years",
		gender: "Male",
		colour: "Black",
		size: "large",
		description:
			"Handsome black Labrador with a glossy coat, warm amber eyes and a big, happy grin. Solidly built with a broad head and a tail that never stops wagging.",
		behaviour:
			"Friendly, gentle and very food-motivated. Knows 'sit' and 'stay', walks well on a lead and loves a game of fetch. Good with children and calm dogs.",
		rescueHistory:
			"Found tied to a fence outside a vacant property in Nasinu after his family moved away. Brought into the SPCA Fiji center for a full health check, deworming and microchipping.",
		rescueDate: "2026-08-14",
		vaccinationStatus: "vaccinated",
		medicallyCleared: true,
		photoUrls: [thumb("4/4a", "Black_Labrador_Retriever_portrait.jpg")],
	},
	{
		name: "Koda",
		type: "dog",
		breed: "Siberian Husky",
		estimatedAge: "2 years",
		gender: "Male",
		colour: "Black and White",
		size: "large",
		description:
			"Striking Siberian Husky with a dark grey-and-white coat, classic facial mask and a thick, fluffy tail. Lean, athletic build and an alert, curious expression.",
		behaviour:
			"Energetic, playful and very vocal. Needs plenty of daily exercise and a secure yard as he is a keen escape artist. Gets along well with other large dogs.",
		rescueHistory:
			"Surrendered by an owner in Nadi who found his exercise needs and the heat difficult to manage. Brought in slightly underweight and is now on a cooling-friendly care routine.",
		rescueDate: "2026-09-03",
		vaccinationStatus: "not_vaccinated",
		medicallyCleared: false,
		photoUrls: [thumb("9/99", "3218-siberian-husky-dog_%2819881570453%29.jpg")],
	},
	{
		name: "Daisy",
		type: "dog",
		breed: "Beagle",
		estimatedAge: "4 years",
		gender: "Female",
		colour: "Mixed/Multi-colour",
		size: "medium",
		description:
			"Sweet tricolour Beagle with a tan face, white muzzle and chest, and a black saddle across her back. Has long velvety ears and expressive brown eyes.",
		behaviour:
			"Affectionate, sociable and gentle with people of all ages. Follows her nose everywhere, so needs a secure yard and supervised walks. Happily wears a harness.",
		rescueHistory:
			"Found wandering near the Lautoka market with a worn harness but no ID tag. No owner came forward after a two-week stray hold, so she was moved into the adoption program.",
		rescueDate: "2026-08-21",
		vaccinationStatus: "vaccinated",
		medicallyCleared: true,
		photoUrls: [
			thumb("4/4d", "A_beagle_sitting_on_the_floor.jpg"),
			thumb("3/39", "A_Beagle_sitting_on_a_doormat.jpg"),
			thumb("8/8a", "A_beagle_sitting_on_the_bed.jpg"),
		],
	},
	{
		name: "Bula",
		type: "dog",
		breed: "Mixed breed",
		estimatedAge: "4 months",
		gender: "Male",
		colour: "Blonde/Tan",
		size: "small",
		description:
			"Lively tan puppy with a dark muzzle, white chest and socks, and big ears that haven't quite decided whether to stand up yet. Still growing into his paws.",
		behaviour:
			"Playful, cheeky and loves to chew, so he will need puppy training and plenty of toys. Curious with new people and quick to come over for a cuddle.",
		rescueHistory:
			"One of a litter found under a roadside stall near Navua by a passing motorist. His siblings have already been rehomed; he has been dewormed and is due for his first vaccinations.",
		rescueDate: "2026-09-12",
		vaccinationStatus: "not_vaccinated",
		medicallyCleared: false,
		photoUrls: [
			thumb("a/af", "Brown_street_dog_01.jpg"),
			thumb("2/23", "Brown_street_dog_07.jpg"),
			thumb("1/17", "Brown_street_dog_03.jpg"),
		],
	},
	{
		name: "Peanut",
		type: "dog",
		breed: "Chihuahua",
		estimatedAge: "5 years",
		gender: "Male",
		colour: "Cream",
		size: "small",
		description:
			"Tiny, smooth-coated cream Chihuahua with large upright ears, a curled tail and a confident little strut. Weighs just under 3 kg.",
		behaviour:
			"Loyal and alert, bonds closely with one person. Can be wary of young children and larger dogs, so best suited to a quiet adult home.",
		rescueHistory:
			"Surrendered by an elderly owner in Suva who moved into assisted care. Arrived well socialised and in good condition, with a minor dental clean completed on intake.",
		rescueDate: "2026-08-06",
		vaccinationStatus: "vaccinated",
		medicallyCleared: true,
		photoUrls: [original("6/65", "Chihuahuasmoothcoat.jpg")],
	},
	{
		name: "Pepper",
		type: "dog",
		breed: "Poodle",
		estimatedAge: "6 years",
		gender: "Female",
		colour: "Black",
		size: "small",
		description:
			"Small black Poodle with a soft, tightly curled coat and a neat, alert stance. Low-shedding coat that needs regular grooming.",
		behaviour:
			"Clever, calm and eager to please. Enjoys short walks, puzzle toys and sitting beside people on the couch. Settles well into indoor routines.",
		rescueHistory:
			"Found matted and hungry near a bus stop in Ba. Groomed, treated for skin irritation and has since regained a healthy weight in care.",
		rescueDate: "2026-07-30",
		vaccinationStatus: "not_vaccinated",
		medicallyCleared: false,
		photoUrls: [thumb("1/11", "The_dog%2C_summer_2020.jpg")],
	},

	// ---------------------------------------------------------------- cats
	{
		name: "Marmalade",
		type: "cat",
		breed: "Domestic Shorthair",
		estimatedAge: "3 years",
		gender: "Male",
		colour: "Ginger",
		size: "small",
		description:
			"Sturdy ginger tabby with a cream chest, striped legs and a ringed tail. Has a calm, watchful face and soft amber eyes.",
		behaviour:
			"Laid-back and easy-going. Enjoys sitting outdoors watching the world go by, comes when called for meals and tolerates gentle handling well.",
		rescueHistory:
			"A regular visitor at a park in Lautoka, fed by locals until a resident noticed a wound on his leg. Brought in, treated, desexed, and has fully recovered.",
		rescueDate: "2026-08-10",
		vaccinationStatus: "vaccinated",
		medicallyCleared: true,
		photoUrls: [
			thumb("4/46", "Ginger_cat_on_the_street05.jpg"),
			thumb("3/3f", "Ginger_cat_on_the_street04.jpg"),
			thumb("d/d0", "Ginger_cat_on_the_street06.jpg"),
		],
	},
	{
		name: "Oreo",
		type: "cat",
		breed: "Domestic Shorthair",
		estimatedAge: "4 years",
		gender: "Male",
		colour: "Black and White",
		size: "small",
		description:
			"Classic tuxedo cat with a sleek black coat, crisp white bib and white paws. Has bright yellow-green eyes and a long, elegant tail.",
		behaviour:
			"Confident and independent, enjoys exploring garden paths but always comes back for dinner. Affectionate on his own terms and very relaxed around visitors.",
		rescueHistory:
			"Found living around a church garden in Labasa where the caretaker had been feeding him. Brought in for desexing and a health check before rehoming.",
		rescueDate: "2026-08-25",
		vaccinationStatus: "not_vaccinated",
		medicallyCleared: false,
		photoUrls: [
			thumb(
				"d/d2",
				"Tuxedo-patterned_black_and_white_cat_on_gravel_path_2011_%28cropped%29.jpg",
			),
			thumb(
				"2/2d",
				"Tuxedo_patterned_black_and_white_cat_sitting_on_garden_path_-_panoramio_%283204%29.jpg",
			),
			thumb(
				"a/ab",
				"Tuxedo-patterned_black_and_white_cat_on_track_-_panoramio_%283201%29.jpg",
			),
		],
	},
	{
		name: "Tiger",
		type: "cat",
		breed: "Domestic Shorthair",
		estimatedAge: "1 year",
		gender: "Female",
		colour: "Grey",
		size: "small",
		description:
			"Slender grey-brown tabby with bold dark stripes, a white chest and neat white paws. Has golden eyes and a curious, slightly cautious expression.",
		behaviour:
			"Shy at first but warms up quickly with patient, quiet handling. Playful with wand toys and loves sunny spots on the porch.",
		rescueHistory:
			"Spotted repeatedly around a school car park in Nausori and caught by volunteers during a community desexing drive. Healthy apart from a mild flea burden, which has been treated.",
		rescueDate: "2026-09-08",
		vaccinationStatus: "vaccinated",
		medicallyCleared: true,
		photoUrls: [
			thumb("0/03", "New_grey_tabby_cat_in_Tuntorp_2.jpg"),
			thumb("4/48", "New_grey_tabby_cat_in_Tuntorp_1.jpg"),
			thumb("d/df", "New_grey_tabby_cat_in_Tuntorp_3.jpg"),
		],
	},
	{
		name: "Mochi",
		type: "cat",
		breed: "Domestic Shorthair",
		estimatedAge: "6 years",
		gender: "Male",
		colour: "Mixed/Multi-colour",
		size: "small",
		description:
			"Chunky tabby-and-white cat with a striped back, snowy white face and chest, and soft green eyes. Has a round, cuddly build and a permanently unimpressed look.",
		behaviour:
			"Calm, gentle and a champion napper. Happiest loafing in a quiet corner and accepts chin scratches from anyone. Would suit a relaxed household.",
		rescueHistory:
			"Surrendered by a family in Savusavu who were relocating overseas and could not take him. Arrived in good health and is fully litter-box trained.",
		rescueDate: "2026-08-17",
		vaccinationStatus: "vaccinated",
		medicallyCleared: true,
		photoUrls: [
			thumb("4/48", "Mackerel_tabby_cat_with_green_eyes_and_Mazingar_ears-Hisashi-02.jpg"),
			thumb("3/30", "Mackerel_tabby_cat_with_green_eyes_and_Mazingar_ears-Hisashi-03.jpg"),
			thumb("0/07", "Mackerel_tabby_cat_with_green_eyes_and_Mazingar_ears-Hisashi-01.jpg"),
		],
	},
	{
		name: "Nala",
		type: "cat",
		breed: "Siamese",
		estimatedAge: "2 years",
		gender: "Female",
		colour: "Cream",
		size: "small",
		description:
			"Elegant seal-point Siamese with a cream body, dark chocolate face, ears, legs and tail, and brilliant sapphire-blue eyes.",
		behaviour:
			"Very chatty and people-focused, follows her carers from room to room. Loves interactive play and would do best in a home where someone is around often.",
		rescueHistory:
			"Found hiding in a hotel garden in Denarau after guests reported a crying cat. No microchip was found; she was health-checked and has settled well in foster care.",
		rescueDate: "2026-09-15",
		vaccinationStatus: "not_vaccinated",
		medicallyCleared: false,
		photoUrls: [thumb("c/ca", "Niobe050905-Siamese_Cat.jpeg")],
	},

	// ------------------------------------------------------------- rabbits
	// Species "other" + speciesName "Rabbit" - Rabbit is no longer a species
	// dropdown option.
	{
		name: "Honey",
		type: "other",
		speciesName: "Rabbit",
		breed: "Lionhead",
		estimatedAge: "1.5 years",
		gender: "Female",
		colour: "Blonde/Tan",
		size: "small",
		description:
			"Fluffy fawn Lionhead with a long woolly mane around her head and chest and short upright ears. Her coat glows golden in the sun.",
		behaviour:
			"Gentle and inquisitive, enjoys supervised time on the grass and nibbling fresh greens. Needs regular brushing to keep her mane tangle-free.",
		rescueHistory:
			"Found in a cardboard box left outside a vet clinic in Nadi. Given a full health check, nail trim and a thorough groom to remove matting.",
		rescueDate: "2026-08-28",
		vaccinationStatus: "vaccinated",
		medicallyCleared: true,
		photoUrls: [
			thumb("f/f5", "L%C3%B6wenkopfkaninchen_auf_der_Wiese_%284%29.JPG"),
			thumb("5/57", "L%C3%B6wenkopfkanichen_auf_der_Wiese.JPG"),
			thumb("3/3f", "L%C3%B6wenkopfkaninchen_auf_der_Wiese_%282%29.JPG"),
		],
	},
	{
		name: "Thumper",
		type: "other",
		speciesName: "Rabbit",
		breed: "Flemish Giant",
		estimatedAge: "8 months",
		gender: "Male",
		colour: "Brown",
		size: "small",
		description:
			"Young Flemish Giant with a soft agouti-brown coat, very long upright ears and big strong back feet. Already large for his age and still growing.",
		behaviour:
			"Calm and tolerant of handling, though his size means he is best lifted by adults. Enjoys roaming a fenced run and stretching out in fresh hay.",
		rescueHistory:
			"Rescued from a backyard breeding setup in Tavua along with several other rabbits after a welfare complaint. Treated for mites on intake and now in excellent condition.",
		rescueDate: "2026-09-01",
		vaccinationStatus: "not_vaccinated",
		medicallyCleared: false,
		photoUrls: [
			thumb("3/3d", "Lapin_geant_des_flandres_2.JPG"),
			thumb("9/9d", "Wildgraues_Jungtier_Deutscher_Riese.JPG"),
			thumb("3/34", "Lapin_geant_des_flandres.JPG"),
		],
	},
	{
		name: "Domino",
		type: "other",
		speciesName: "Rabbit",
		breed: "Dutch",
		estimatedAge: "2 years",
		gender: "Male",
		colour: "Black and White",
		size: "small",
		description:
			"Compact Dutch rabbit with the breed's classic markings: black hindquarters and ears, a white blaze down the face and a crisp white saddle and front paws.",
		behaviour:
			"Friendly and confident, approaches people at the pen door and enjoys being stroked. Litter-trained and comfortable living indoors.",
		rescueHistory:
			"Handed in by a primary school in Suva after the class pet program ended. Healthy on arrival, with a dental check showing no issues.",
		rescueDate: "2026-07-24",
		vaccinationStatus: "vaccinated",
		medicallyCleared: true,
		photoUrls: [original("4/48", "American_Grand_Champion_Dutch_Rabbit.jpg")],
	},
	{
		name: "Misty",
		type: "other",
		speciesName: "Rabbit",
		breed: "Netherland Dwarf",
		estimatedAge: "1 year",
		gender: "Female",
		colour: "Grey",
		size: "small",
		description:
			"Petite blue-grey Netherland Dwarf with a round face, short ears and a dense, velvety coat. One of the smallest rabbits currently in care.",
		behaviour:
			"Quick and curious but a little skittish with sudden movements. Best suited to a calm home where she can come out to explore at her own pace.",
		rescueHistory:
			"Found loose in a residential street in Lami, likely an escaped or released pet. No owner came forward, so she was health-checked and placed for adoption.",
		rescueDate: "2026-09-19",
		vaccinationStatus: "not_vaccinated",
		medicallyCleared: false,
		photoUrls: [thumb("9/9d", "HI3A0028.jpg")],
	},

	// ------------------------------------------------------------ hamsters
	// Species "other" + speciesName "Hamster" (what staff type when they pick
	// Other), matching the registration form.
	{
		name: "Snowball",
		type: "other",
		speciesName: "Hamster",
		breed: "Winter White Dwarf",
		estimatedAge: "7 months",
		gender: "Female",
		colour: "White",
		size: "small",
		description:
			"Tiny pearl-white winter white dwarf hamster with a soft, plush coat, shiny black eyes and a pink nose. Fits comfortably in the palm of a hand.",
		behaviour:
			"Gentle and rarely nips. Most active in the evening, when she enjoys her wheel and scattering seeds through her bedding. Settles well with calm handling.",
		rescueHistory:
			"Surrendered by a family in Nasinu whose child developed an allergy. Arrived with her original enclosure and is in very good health.",
		rescueDate: "2026-09-05",
		vaccinationStatus: "not_vaccinated",
		medicallyCleared: true,
		photoUrls: [
			thumb("d/de", "Pearl_Winter_White_Russian_Dwarf_Hamster_-_Front.jpg"),
			thumb("d/dc", "Pearl_Winter_White_Russian_Dwarf_Hamster_-_Face.jpg"),
			thumb("4/4c", "Pearl_Winter_White_Russian_Dwarf_Hamster_-_Side.jpg"),
		],
	},
	{
		name: "Nugget",
		type: "other",
		speciesName: "Hamster",
		breed: "Syrian",
		estimatedAge: "4 months",
		gender: "Female",
		colour: "Brown",
		size: "small",
		description:
			"Young golden Syrian hamster with a warm brown coat, cream belly, rounded ears and bright dark eyes. Loves standing up on her hind legs to investigate.",
		behaviour:
			"Curious and confident, quick to come to the front of her enclosure. Still getting used to being picked up, so best with older children or adults.",
		rescueHistory:
			"Found in a small cage left at a bus shelter in Lautoka. Health-checked, moved into a properly sized enclosure and has been thriving since.",
		rescueDate: "2026-09-22",
		vaccinationStatus: "not_vaccinated",
		medicallyCleared: false,
		photoUrls: [
			thumb(
				"6/60",
				"Juvenile_Female_Mesocricetus_auratus_in_Pet_Store_enclosure%2C_Illinois%2C_USA.jpg",
			),
		],
	},

	// =======================================================================
	// Ready to adopt (added Oct 2026 so the public listing looks fuller):
	// medically cleared via readyToAdopt(), so they show on the public
	// listing as "Available for Adoption". 10 small dogs, then 10 others.
	// =======================================================================

	// ---------------------------------------------------------- small dogs
	readyToAdopt(
		{
			name: "Biscuit",
			type: "dog",
			breed: "Shih Tzu",
			estimatedAge: "3 Years",
			gender: "Female",
			colour: "Mixed/Multi-colour",
			size: "small",
			description:
				"Sweet little Shih Tzu with a soft white coat, honey gold ears and a neatly trimmed teddy bear face. She weighs about 6 kg and has a cheerful plumed tail.",
			behaviour:
				"Gentle and people focused. Loves being brushed, sits politely for treats and is happy to nap beside you. Settles well with older children and calm adults.",
			rescueHistory:
				"Found sitting outside a bakery in Nausori town, matted but friendly. A full groom, health check and desexing later, she is ready for a quiet indoor home.",
			rescueDate: "2026-08-04",
			vaccinationStatus: "vaccinated",
			veterinaryPriority: "routine",
			photoUrls: [
				thumb("b/b6", "Shih_Tzu_Dog_In_Iran%2C_Canon_Photography%2C_Mostafa_Meraji_07.jpg"),
				thumb("3/31", "Shih_Tzu_Dog_In_Iran%2C_Canon_Photography%2C_Mostafa_Meraji_04.jpg"),
				thumb("a/a3", "Shih_Tzu_Dog_In_Iran%2C_Canon_Photography%2C_Mostafa_Meraji_06.jpg"),
			],
		},
		"2026-08-20",
		"Healthy weight, teeth cleaned and coat in good condition. Cleared for adoption.",
	),
	readyToAdopt(
		{
			name: "Pixel",
			type: "dog",
			breed: "Pomeranian",
			estimatedAge: "2 Years",
			gender: "Male",
			colour: "Ginger",
			size: "small",
			description:
				"Bright eyed orange sable Pomeranian with a fluffy ruff, tiny pointed ears and a fox like face. At just over 3 kg he is easy to carry and loves a lap.",
			behaviour:
				"Curious, alert and full of personality. Barks to say hello, then wants cuddles. Learns quickly with food rewards and enjoys short daily walks.",
			rescueHistory:
				"Handed in by a family in Nasinu who were moving overseas and could not take him. Arrived in good shape and has been living happily in a foster home.",
			rescueDate: "2026-09-02",
			vaccinationStatus: "vaccinated",
			veterinaryPriority: "routine",
			photoUrls: [
				thumb("7/76", "Pomeranian_Dog_-_Kolkata_2011-10-31_6425.JPG"),
				thumb("2/2f", "Pomeranian_Dog_-_Kolkata_2011-10-31_6415.JPG"),
				thumb("9/9b", "Pomeranian_Dog_-_Kolkata_2011-10-31_6417.JPG"),
			],
		},
		"2026-09-12",
		"Fit and healthy on examination. Cleared for adoption.",
	),
	readyToAdopt(
		{
			name: "Frankie",
			type: "dog",
			breed: "Dachshund",
			estimatedAge: "4 Years",
			gender: "Male",
			colour: "Brown",
			size: "small",
			description:
				"Classic smooth coated red Dachshund with a long body, short sturdy legs and a glossy chestnut coat. He has a proud stance and a very waggy tail.",
			behaviour:
				"Confident and playful with a strong nose for adventure. Enjoys sniffing walks and toys that squeak. Best without stairs to protect his long back.",
			rescueHistory:
				"Picked up by a ranger near the Lautoka wharf after he was seen chasing birds for several days. No microchip was found and nobody came to claim him.",
			rescueDate: "2026-07-21",
			vaccinationStatus: "vaccinated",
			veterinaryPriority: "moderate",
			photoUrls: [
				thumb(
					"b/be",
					"%EB%8B%A5%EC%8A%A4%ED%9B%88%ED%8A%B8%28%EB%8B%A8%EB%AA%A8%EC%A2%85%29_%28Dachshund_%28Short%29%29.jpg",
				),
			],
		},
		"2026-08-06",
		"Spine and joints checked, no concerns. Cleared for adoption.",
	),
	readyToAdopt(
		{
			name: "Dumpling",
			type: "dog",
			breed: "Pug",
			estimatedAge: "1 Year",
			gender: "Male",
			colour: "Blonde/Tan",
			size: "small",
			description:
				"Fawn Pug with a black velvet mask, curled tail and a big happy grin. He is solid and chunky at around 8 kg and always seems to be smiling.",
			behaviour:
				"Affectionate clown who follows his people everywhere. Friendly with other dogs and children. Needs shade and cool water on hot days because of his short nose.",
			rescueHistory:
				"Found tied to a fence beside a church in Lami during heavy rain. Volunteers dried him off, and he has charmed every staff member since.",
			rescueDate: "2026-09-10",
			vaccinationStatus: "vaccinated",
			veterinaryPriority: "moderate",
			photoUrls: [thumb("3/33", "Pug_-_1_year_Old_%28cropped%29.jpg")],
		},
		"2026-09-24",
		"Breathing checked and healthy for his breed. Cleared for adoption.",
	),
	readyToAdopt(
		{
			name: "Pearl",
			type: "dog",
			breed: "Maltese",
			estimatedAge: "6 Years",
			gender: "Female",
			colour: "White",
			size: "small",
			description:
				"Petite snow white Maltese with dark round eyes and silky ears that frame her face. She weighs only 3 kg and has a calm, graceful way of moving.",
			behaviour:
				"Quiet and loving, she prefers gentle hands and a soft bed. Walks nicely on a lead and is content in an apartment. Ideal for a retired adopter.",
			rescueHistory:
				"Surrendered after her elderly owner in Suva went into care. She arrived with her own blanket and is used to living indoors with people.",
			rescueDate: "2026-08-15",
			vaccinationStatus: "vaccinated",
			veterinaryPriority: "routine",
			photoUrls: [thumb("f/fb", "Maltese_dog_enjoying_the_fall_leaves%2C_Nov._2004-1.jpg")],
		},
		"2026-08-28",
		"Dental clean done, otherwise healthy. Cleared for adoption.",
	),
	readyToAdopt(
		{
			name: "Toffee",
			type: "dog",
			breed: "Yorkshire Terrier",
			estimatedAge: "5 Years",
			gender: "Female",
			colour: "Mixed/Multi-colour",
			size: "small",
			description:
				"Little Yorkshire Terrier with a steel grey back, rich tan face and legs, and a long fringe that falls over her eyes. She is tiny at about 3 kg.",
			behaviour:
				"Spirited and loyal, with a big voice for her size. Loves lying in sunny spots on the floor and playing tug. Would do best as the only pet.",
			rescueHistory:
				"Found wandering near the Labasa market with an overgrown coat. After a haircut and a health check she bounced back quickly in our care.",
			rescueDate: "2026-07-30",
			vaccinationStatus: "vaccinated",
			veterinaryPriority: "routine",
			photoUrls: [
				thumb("4/4b", "Yorkshire_Terrier_Dog_8_2013-09-15.jpg"),
				thumb("b/b3", "Yorkshire_Terrier_Dog_18_2013-09-15.jpg"),
				thumb("b/bb", "Yorkshire_Terrier_Dog_11_2013-09-15.jpg"),
			],
		},
		"2026-08-14",
		"Groomed and examined, all clear. Cleared for adoption.",
	),
	readyToAdopt(
		{
			name: "Rocket",
			type: "dog",
			breed: "Jack Russell Terrier",
			estimatedAge: "3 Years",
			gender: "Male",
			colour: "White",
			size: "small",
			description:
				"Athletic Jack Russell Terrier with a mostly white coat, tan ears and a tan patch on his back. He is lean, quick and weighs about 7 kg.",
			behaviour:
				"High energy and clever. Needs daily runs, games of fetch and puzzle toys to stay happy. Gets on with children who like to play outdoors.",
			rescueHistory:
				"Spotted running along the Queens Road near Sigatoka and caught by a passing driver. He was thin but full of beans when he reached us.",
			rescueDate: "2026-08-22",
			vaccinationStatus: "vaccinated",
			veterinaryPriority: "routine",
			photoUrls: [thumb("f/f1", "Jack_Russell_Terrier_1.jpg")],
		},
		"2026-09-05",
		"Back to a healthy weight. Cleared for adoption.",
	),
	readyToAdopt(
		{
			name: "Lola",
			type: "dog",
			breed: "Poodle",
			estimatedAge: "2 Years",
			gender: "Female",
			colour: "Blonde/Tan",
			size: "small",
			description:
				"Apricot toy Poodle with a curly, low shedding coat and a sweet button nose. She weighs around 4 kg and loves to lounge on cushions.",
			behaviour:
				"Smart, eager to please and quick to learn tricks. Calm indoors and playful outside. A good choice for someone with mild allergies.",
			rescueHistory:
				"Brought in by a resort worker in Nadi who found her hiding under a staff bus. She was nervous at first but trusts people again now.",
			rescueDate: "2026-09-14",
			vaccinationStatus: "vaccinated",
			veterinaryPriority: "routine",
			photoUrls: [thumb("1/18", "Gold_Poodle.jpg")],
		},
		"2026-09-28",
		"Healthy, coat clipped and ears cleaned. Cleared for adoption.",
	),
	readyToAdopt(
		{
			name: "Pablo",
			type: "dog",
			breed: "Chihuahua",
			estimatedAge: "4 Years",
			gender: "Male",
			colour: "Black",
			size: "small",
			description:
				"Smooth coated black and tan Chihuahua with tan eyebrows, big upright ears and a dainty frame of about 2.5 kg.",
			behaviour:
				"Devoted to his favourite person and loves burrowing into blankets. A little shy with strangers, so a calm adult home suits him best.",
			rescueHistory:
				"Surrendered by a family in Ba when their landlord stopped allowing pets. He came with his bed and toys and settled in within days.",
			rescueDate: "2026-07-18",
			vaccinationStatus: "vaccinated",
			veterinaryPriority: "routine",
			photoUrls: [thumb("4/4f", "Buddy_the_Chihuahua_%285597083289%29.jpg")],
		},
		"2026-07-30",
		"Healthy with good teeth. Cleared for adoption.",
	),
	readyToAdopt(
		{
			name: "Bosun",
			type: "dog",
			breed: "Mixed breed",
			estimatedAge: "9 Years",
			gender: "Male",
			colour: "Black",
			size: "small",
			description:
				"Small senior mixed breed with a black coat, a frosted grey muzzle and soulful brown eyes. He weighs about 8 kg and moves at a gentle pace.",
			behaviour:
				"Easygoing and affectionate, he mostly wants a soft couch and a kind voice. House trained and quiet. Happy with short strolls twice a day.",
			rescueHistory:
				"Found sleeping on a fishing boat at the Levuka jetty after his owner passed away. The crew looked after him until our team could collect him.",
			rescueDate: "2026-08-08",
			vaccinationStatus: "vaccinated",
			veterinaryPriority: "moderate",
			photoUrls: [thumb("7/7b", "Cute_Small_Senior_Mixed-Breed_Dog.jpg")],
		},
		"2026-08-25",
		"Senior check done, mild arthritis managed with diet. Cleared for adoption.",
	),

	// -------------------------------------------------------------- others
	readyToAdopt(
		{
			name: "Willow",
			type: "cat",
			breed: "British Shorthair",
			estimatedAge: "1.5 Years",
			gender: "Female",
			colour: "Grey",
			size: "small",
			description:
				"Plush blue grey British Shorthair with round copper eyes, chubby cheeks and a dense, velvety coat. She has a calm and dignified look.",
			behaviour:
				"Quiet and independent, she likes to watch the room from a high shelf. Enjoys gentle chin rubs and a regular routine. Suits a peaceful home.",
			rescueHistory:
				"Left in a carrier outside a vet clinic in Suva with a note asking for help. She was healthy and has been calm and polite in our cattery.",
			rescueDate: "2026-09-06",
			vaccinationStatus: "vaccinated",
			veterinaryPriority: "routine",
			photoUrls: [thumb("1/11", "British_Shorthair._Female._18_months_old.jpg")],
		},
		"2026-09-18",
		"Desexed and in excellent health. Cleared for adoption.",
	),
	readyToAdopt(
		{
			name: "Patches",
			type: "cat",
			breed: "Domestic Shorthair",
			estimatedAge: "2 Years",
			gender: "Female",
			colour: "Mixed/Multi-colour",
			size: "small",
			description:
				"Striking calico with bold patches of black, ginger and white and a white bib and paws. She is slim, agile and very photogenic.",
			behaviour:
				"Friendly and curious, she loves exploring a safe garden and chasing leaves. Comes running for dinner and enjoys a cuddle in the evening.",
			rescueHistory:
				"Rescued from a drain at a construction site in Nausori after workers heard her crying. She was unhurt and quickly made herself at home.",
			rescueDate: "2026-08-12",
			vaccinationStatus: "vaccinated",
			veterinaryPriority: "routine",
			photoUrls: [
				thumb("b/b6", "Calico_cat%2C_Lebanon_7.jpg"),
				thumb("c/cd", "Calico_cat%2C_Lebanon_8.jpg"),
				thumb("b/bd", "Calico_cat%2C_Lebanon_2.jpg"),
			],
		},
		"2026-08-26",
		"Desexed, treated for fleas and healthy. Cleared for adoption.",
	),
	readyToAdopt(
		{
			name: "Jasper",
			type: "cat",
			breed: "Siberian",
			estimatedAge: "6 Months",
			gender: "Male",
			colour: "Brown",
			size: "small",
			description:
				"Fluffy brown tabby kitten with a long coat, tufted ears and a bushy striped tail. His green eyes and serious expression make him look very wise.",
			behaviour:
				"Playful and confident, he loves wand toys and climbing posts. Gets along with other cats and gentle dogs. Needs regular brushing of his long fur.",
			rescueHistory:
				"Found with his siblings in a cardboard box beside a supermarket in Savusavu. His brothers have been adopted and he is the last one waiting.",
			rescueDate: "2026-08-28",
			vaccinationStatus: "vaccinated",
			veterinaryPriority: "routine",
			photoUrls: [
				thumb("8/8e", "Siberian_black_tabby_blotched_cat_04.jpg"),
				thumb("b/b8", "Siberian_black_tabby_blotched_cat_01.jpg"),
				thumb("4/43", "Siberian_black_tabby_blotched_cat_03.jpg"),
			],
		},
		"2026-09-15",
		"Kitten vaccinations done and dewormed. Cleared for adoption.",
	),
	readyToAdopt(
		{
			name: "Ranger",
			type: "dog",
			breed: "Border Collie",
			estimatedAge: "3 Years",
			gender: "Male",
			colour: "Black and White",
			size: "medium",
			description:
				"Handsome black and white Border Collie with a white chest and blaze and alert, upright ears. Medium sized at about 18 kg with a soft double coat.",
			behaviour:
				"Very intelligent and keen to work. Loves fetch, agility style games and learning new commands. Needs an active family with space to run.",
			rescueHistory:
				"Came to us from a farm near Tavua where he was guarding goats alone after the family moved away. He is gentle with people and other dogs.",
			rescueDate: "2026-07-25",
			vaccinationStatus: "vaccinated",
			veterinaryPriority: "routine",
			photoUrls: [thumb("1/1f", "Border_collie_canon.jpg")],
		},
		"2026-08-09",
		"Healthy and fit. Cleared for adoption.",
	),
	readyToAdopt(
		{
			name: "Sunny",
			type: "dog",
			breed: "Labrador Retriever",
			estimatedAge: "5 Years",
			gender: "Female",
			colour: "Blonde/Tan",
			size: "large",
			description:
				"Big hearted yellow Labrador with a broad head, kind brown eyes and a thick otter tail. She is a solid 30 kg and carries herself with calm confidence.",
			behaviour:
				"Gentle, patient and great with children. Loves swimming, retrieving balls and lying at your feet. Already knows sit, stay and come.",
			rescueHistory:
				"Surrendered in Rakiraki when her owners could no longer afford her care. She arrived overweight but has slimmed down on regular walks.",
			rescueDate: "2026-08-18",
			vaccinationStatus: "vaccinated",
			veterinaryPriority: "routine",
			photoUrls: [thumb("f/f8", "Labrador-retriever.jpg")],
		},
		"2026-09-01",
		"Weight improving and joints healthy. Cleared for adoption.",
	),
	readyToAdopt(
		{
			name: "Hazel",
			type: "other",
			speciesName: "Rabbit",
			breed: "Mini Lop",
			estimatedAge: "1 Year",
			gender: "Female",
			colour: "Grey",
			size: "small",
			description:
				"Soft grey Mini Lop rabbit with long floppy ears and a round, compact body. She loves to stretch out flat on cool tiles when it is warm.",
			behaviour:
				"Gentle and inquisitive, she hops over to greet visitors and sits up on her hind legs to look around. Uses a litter tray and enjoys fresh greens.",
			rescueHistory:
				"Found in a hutch left behind at a rented house in Pacific Harbour. Neighbours fed her until our team could collect her.",
			rescueDate: "2026-09-08",
			vaccinationStatus: "vaccinated",
			veterinaryPriority: "routine",
			photoUrls: [
				thumb("f/fc", "Domestic_mini_lop_rabbit_lying_down_02.jpg"),
				thumb("e/e5", "Domestic_mini_lop_rabbit_standing_on_its_hind_feet.jpg"),
				thumb("e/e2", "Domestic_mini_lop_rabbit_lying_down_01.jpg"),
			],
		},
		"2026-09-22",
		"Desexed and teeth checked. Cleared for adoption.",
	),
	readyToAdopt(
		{
			name: "Velvet",
			type: "other",
			speciesName: "Rabbit",
			breed: "Rex",
			estimatedAge: "2 Years",
			gender: "Male",
			colour: "Mixed/Multi-colour",
			size: "small",
			description:
				"Rex rabbit with an incredibly plush coat, white with chestnut brown patches on his face and back, and tall upright ears.",
			behaviour:
				"Calm and steady, he enjoys being stroked and spending time on the grass in a safe run. Would love a companion rabbit later on.",
			rescueHistory:
				"Seen loose on a school field in Navua, probably released by a previous owner. Students helped staff gently corner and catch him.",
			rescueDate: "2026-08-26",
			vaccinationStatus: "vaccinated",
			veterinaryPriority: "routine",
			photoUrls: [thumb("7/7c", "Broken_Castor_Rex_Rabbit.JPG")],
		},
		"2026-09-09",
		"Desexed and healthy. Cleared for adoption.",
	),
	readyToAdopt(
		{
			name: "Nibbles",
			type: "other",
			speciesName: "Hamster",
			breed: "Roborovski Dwarf",
			estimatedAge: "8 Months",
			gender: "Male",
			colour: "Cream",
			size: "small",
			description:
				"Tiny sandy cream Roborovski dwarf hamster with a white belly, white eyebrow spots and a pink nose. He is one of the smallest hamster breeds.",
			behaviour:
				"Speedy and busy, he loves running on his wheel and burrowing in deep bedding. Better for watching than handling, so ideal for a patient adult.",
			rescueHistory:
				"Found in a small cage left at a bus stop in Nasinu. He was moved into a roomy enclosure and has been thriving ever since.",
			rescueDate: "2026-09-20",
			vaccinationStatus: "not_vaccinated",
			veterinaryPriority: "routine",
			photoUrls: [thumb("2/2d", "Phodopus_roborovskii_front.jpg")],
		},
		"2026-09-30",
		"Healthy weight and good condition. Cleared for adoption.",
	),
	readyToAdopt(
		{
			name: "Caramel",
			type: "other",
			speciesName: "Guinea Pig",
			breed: "American",
			estimatedAge: "1 Year",
			gender: "Female",
			colour: "Ginger",
			size: "small",
			description:
				"Smooth coated ginger guinea pig with a glossy golden orange coat, rounded ears and bright black eyes.",
			behaviour:
				"Chatty and sociable, she squeaks happily when she hears the vegetable bag. Enjoys hay, cuddles on a lap and would love a guinea pig friend.",
			rescueHistory:
				"Surrendered by a teacher in Lautoka after the class pet programme ended. She is well handled and very used to children.",
			rescueDate: "2026-09-03",
			vaccinationStatus: "not_vaccinated",
			veterinaryPriority: "routine",
			photoUrls: [thumb("b/bc", "Caviidae_Cavia_porcellus_1.jpg")],
		},
		"2026-09-16",
		"Teeth and weight good. Cleared for adoption.",
	),
	readyToAdopt(
		{
			name: "Kiwi",
			type: "other",
			speciesName: "Parrot",
			breed: "Conure",
			estimatedAge: "3 Years",
			gender: "Male",
			colour: "Mixed/Multi-colour",
			size: "small",
			description:
				"Dazzling Sun Conure with bright orange and yellow feathers, green and blue wing tips and a dark curved beak.",
			behaviour:
				"Social and loud in the mornings, he loves company and sitting on a shoulder. Steps up onto a finger and enjoys foraging toys and fresh fruit.",
			rescueHistory:
				"Handed in by a family in Korovou who found him too noisy for their flat. He is tame and needs an owner with time to spend with him.",
			rescueDate: "2026-09-11",
			vaccinationStatus: "not_vaccinated",
			veterinaryPriority: "routine",
			photoUrls: [thumb("2/2f", "Sun_Conure_%28Aratinga_solstitialis%29_-pet_on_finger.jpg")],
		},
		"2026-09-25",
		"Feathers and beak healthy. Cleared for adoption.",
	),
];

// Same "SPCA-<year>-<4 digits>" format as generateUniquePublicId in
// animals.service.ts.
async function generateUniquePublicId(): Promise<string> {
	const year = new Date().getFullYear();
	for (let attempt = 0; attempt < 20; attempt += 1) {
		const candidate = `SPCA-${year}-${Math.floor(1000 + Math.random() * 9000)}`;
		const [existing] = await db
			.select({ id: animals.id })
			.from(animals)
			.where(eq(animals.publicId, candidate));
		if (!existing) return candidate;
	}
	throw new Error("Could not generate a unique Animal ID");
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Downloads the image ourselves (Wikimedia throttles Cloudinary's shared
// remote-fetch servers) with backoff on 429, then uploads the bytes.
// Deterministic public_id (e.g. "ara/animals/seed-oreo-2") so a re-run
// reuses the existing Cloudinary asset instead of uploading a duplicate.
async function toCloudinary(sourceUrl: string, animalName: string, index: number) {
	if (!isCloudinaryConfigured()) return sourceUrl;

	const publicId = `seed-${animalName.toLowerCase()}-${index + 1}`;
	for (let attempt = 1; attempt <= 5; attempt += 1) {
		try {
			await sleep(1500);
			const response = await fetch(sourceUrl, {
				headers: { "User-Agent": "ARA-SPCA-Fiji-seed/1.0 (student project)" },
			});
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			const bytes = Buffer.from(await response.arrayBuffer());
			const dataUri = `data:${response.headers.get("content-type") ?? "image/jpeg"};base64,${bytes.toString("base64")}`;
			const result = await cloudinary.uploader.upload(dataUri, {
				folder: "ara/animals",
				public_id: publicId,
				overwrite: false,
			});
			return result.secure_url;
		} catch (error) {
			console.warn(`  attempt ${attempt} failed for ${publicId}: ${(error as Error).message}`);
			await sleep(10_000 * attempt);
		}
	}
	console.warn(`  falling back to Commons URL for ${publicId}`);
	return sourceUrl;
}

async function uploadPhotos(name: string, urls: string[]) {
	const photoUrls: string[] = [];
	for (const [index, url] of urls.entries()) {
		photoUrls.push(url.startsWith(COMMONS) ? await toCloudinary(url, name, index) : url);
	}
	return photoUrls;
}

// The same checks the Register form and the API apply, so nothing invalid
// reaches the shared database. Returns the problems found (empty = valid)
// and the values to store, normalised exactly as the API would (table
// spelling of breed/species, "2 Years" age text, capitalised name).
async function validateNewAnimal(seed: SeedAnimal): Promise<{ problems: string[]; values: SeedAnimal }> {
	const problems: string[] = [];
	const check = (problem: string | null) => {
		if (problem) problems.push(problem);
	};
	check(validateAnimalName(seed.name));
	check(validateEstimatedAgeText(seed.estimatedAge ?? ""));
	check(validateNarrativeText(seed.description ?? "", "Description"));
	check(validateNarrativeText(seed.behaviour ?? "", "Behaviour"));
	check(validateNarrativeText(seed.rescueHistory ?? "", "Rescue history"));
	if (seed.gender !== "Male" && seed.gender !== "Female") problems.push("Gender must be Male or Female.");
	if (!COLOUR_OPTIONS.includes(seed.colour ?? "")) problems.push(`Colour "${seed.colour}" isn't a Colour option.`);
	if (!seed.size) problems.push("Size is required.");
	if (!seed.veterinaryPriority) problems.push("Veterinary priority is required.");
	if (!seed.vaccinationStatus) problems.push("Vaccination status is required.");
	if (!seed.photoUrls?.length || seed.photoUrls.length > 3) problems.push("Needs 1-3 photos.");
	if (seed.type === "rabbit") problems.push('Species "rabbit" is no longer accepted - use "other".');

	let values = seed;
	if (seed.type !== "rabbit") {
		const species = await resolveSpeciesAndBreed(seed.type, seed.speciesName ?? "", seed.breed ?? "", {
			findBreedName,
			findListedSpeciesName,
		});
		if (species.error !== undefined) {
			problems.push(species.error);
		} else {
			const age = parseEstimatedAge(seed.estimatedAge);
			values = {
				...seed,
				name: formatAnimalName(seed.name),
				type: species.type,
				speciesName: species.speciesName,
				breed: species.breed,
				estimatedAge: age ? formatEstimatedAge(age.value, age.unit) : seed.estimatedAge,
			};
		}
	}
	return { problems, values };
}

// A stored photo must load as an image.
async function photoLoads(url: string): Promise<boolean> {
	try {
		const response = await fetch(url, { headers: { "User-Agent": "ARA-SPCA-Fiji-seed/1.0 (student project)" } });
		await response.arrayBuffer();
		return response.ok && (response.headers.get("content-type") ?? "").startsWith("image/");
	} catch {
		return false;
	}
}

let created = 0;
let repaired = 0;
let skipped = 0;
const pending: SeedAnimal[] = [];

for (const seed of SEED_ANIMALS) {
	const [existing] = await db
		.select({ id: animals.id, photoUrls: animals.photoUrls })
		.from(animals)
		.where(and(eq(animals.name, seed.name), isNull(animals.deletedAt)));

	if (existing) {
		// Already seeded - but if an earlier run had to fall back to Commons
		// URLs for some photos, retry moving just those onto Cloudinary.
		if (existing.photoUrls.some((url) => url.startsWith(COMMONS))) {
			const photoUrls = await uploadPhotos(seed.name, existing.photoUrls);
			await db.update(animals).set({ photoUrls, updatedAt: new Date() }).where(eq(animals.id, existing.id));
			repaired += 1;
			console.log(`repair  ${seed.name} (${seed.type}) - photos re-uploaded`);
		} else {
			skipped += 1;
			console.log(`skip    ${seed.name} - already exists`);
		}
		continue;
	}
	pending.push(seed);
}

// Validate every new animal before inserting any of them.
const validated: SeedAnimal[] = [];
const invalid: string[] = [];
for (const seed of pending) {
	const { problems, values } = await validateNewAnimal(seed);
	if (problems.length) invalid.push(`  ${seed.name}: ${problems.join(" | ")}`);
	else validated.push(values);
}
if (invalid.length) {
	console.error(`\nNothing inserted - ${invalid.length} new animal(s) failed validation:\n${invalid.join("\n")}`);
	process.exit(1);
}

// `npm run db:seed:animals -- --dry-run`: validate and list what would be
// inserted, without uploading photos or writing to the database.
if (process.argv.includes("--dry-run")) {
	console.log(`\nDry run - ${validated.length} new animal(s) pass validation and would be inserted:`);
	for (const seed of validated) {
		console.log(
			`  ${seed.name} | ${seed.type}${seed.speciesName ? ` (${seed.speciesName})` : ""} | ${seed.breed} | ` +
				`${seed.estimatedAge} | ${seed.size} | ${seed.colour} | ${seed.photoUrls?.length} photo(s)`,
		);
	}
	process.exit(0);
}

// Every photo URL already stored on any animal (deleted ones too), so a new
// animal never shows another animal's picture.
const usedPhotoUrls = new Set((await db.select({ photoUrls: animals.photoUrls }).from(animals)).flatMap((row) => row.photoUrls));
const photoProblems: string[] = [];

for (const seed of validated) {
	const uploaded = await uploadPhotos(seed.name, seed.photoUrls ?? []);
	const photoUrls: string[] = [];
	for (const url of uploaded) {
		if (usedPhotoUrls.has(url)) photoProblems.push(`${seed.name}: ${url} is already used by another animal - left out`);
		else if (!(await photoLoads(url))) photoProblems.push(`${seed.name}: ${url} did not load as an image - left out`);
		else {
			photoUrls.push(url);
			usedPhotoUrls.add(url);
		}
	}
	if (photoUrls.length === 0) {
		photoProblems.push(`${seed.name}: no photo could be verified - animal NOT inserted`);
		continue;
	}

	const publicId = await generateUniquePublicId();
	await db.insert(animals).values({ ...seed, photoUrls, publicId, status: "intake" });
	created += 1;
	console.log(`created ${publicId} ${seed.name} (${seed.type}, ${photoUrls.length} photo(s))`);
}

if (photoProblems.length) console.warn(`\nPhoto problems:\n  ${photoProblems.join("\n  ")}`);
console.log(`\nDone: ${created} created, ${repaired} repaired, ${skipped} skipped.`);
