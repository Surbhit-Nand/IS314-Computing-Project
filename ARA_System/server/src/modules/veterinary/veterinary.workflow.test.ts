import assert from "node:assert/strict";
import { it } from "node:test";
process.env.CLERK_SECRET_KEY = "test-clerk-secret-key";
process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:1/isolated_test_only";
const { medicallyClear } = await import("./veterinary.service.js");
type MedicalRecord = NonNullable<Awaited<ReturnType<typeof import("./veterinary.service.js").getRecord>>>;

it("medical clearance still requires Initial Assessment and completed Required Treatments", async () => {
  const record = { animal: { id: "animal" }, examinations: [], carePlan: [] } as unknown as MedicalRecord;
  let cleared = 0;
  const dependencies: NonNullable<Parameters<typeof medicallyClear>[3]> = {
    findMedicalRecord: async () => record,
    changeCarePlan: async () => { throw new Error("No milestone should change before validation"); },
    clearAnimal: async () => { cleared++; return { animal: record.animal, clearedBy: "vet", clearedAt: new Date() }; },
    ensureMissingAnimalSearchEmbedding: async () => true,
  };
  await assert.rejects(medicallyClear("animal", "vet", undefined, dependencies), /Initial examination is required/);
  record.examinations = [{}] as MedicalRecord["examinations"];
  record.carePlan = [{ requirementType: "Wound Treatment", status: "in_progress" }] as MedicalRecord["carePlan"];
  await assert.rejects(medicallyClear("animal", "vet", undefined, dependencies), /Complete or mark not required/);
  assert.equal(cleared, 0);
  record.carePlan[0].status = "completed";
  await medicallyClear("animal", "vet", undefined, dependencies);
  assert.equal(cleared, 1);
});
