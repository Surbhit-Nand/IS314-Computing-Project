import { createAnimal, findPublicAnimals } from "./animals.repository.js";

export async function listPublicAnimals() {
	return findPublicAnimals();
}

export async function registerAnimal(input: Parameters<typeof createAnimal>[0]) {
	return createAnimal({
		...input,
		medicallyCleared: false,
		status: "intake",
	});
}
