import assert from "node:assert/strict";
import { test } from "node:test";
import { isUpcomingAppointment } from "./appointments";

test("upcoming appointments exclude cancellations, completed visits and elapsed dates", () => {
  const now = Date.parse("2026-10-18T00:00:00Z");
  const appointmentDate = "2026-10-20T00:00:00Z";
  assert.equal(isUpcomingAppointment({ status: "booked", appointmentDate }, now), true);
  for (const status of ["cancelled", "completed", "no_show"]) {
    assert.equal(isUpcomingAppointment({ status, appointmentDate }, now), false);
  }
  for (const date of ["2026-10-17T00:00:00Z", "2026-10-18T00:00:00Z", "invalid"]) {
    assert.equal(isUpcomingAppointment({ status: "booked", appointmentDate: date }, now), false);
  }
});
