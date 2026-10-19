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
import { and, eq, isNull } from "drizzle-orm";
import { cloudinary, isCloudinaryConfigured } from "../services/cloudinaryClient.js";
import { db } from "./client.js";
import { animals } from "./schema.js";

type SeedAnimal = Omit<
	typeof animals.$inferInsert,
	"id" | "publicId" | "status" | "deletedAt" | "createdAt" | "updatedAt"
>;

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

let created = 0;
let repaired = 0;
let skipped = 0;

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

	const photoUrls = await uploadPhotos(seed.name, seed.photoUrls ?? []);
	const publicId = await generateUniquePublicId();
	await db.insert(animals).values({ ...seed, photoUrls, publicId, status: "intake" });
	created += 1;
	console.log(`created ${publicId} ${seed.name} (${seed.type}, ${photoUrls.length} photo(s))`);
}

console.log(`\nDone: ${created} created, ${repaired} repaired, ${skipped} skipped.`);
