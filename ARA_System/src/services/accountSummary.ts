import { fetchMyAdoptionApplications } from "./adoptionsApi";
import { fetchMyRescueReports } from "./rescueApi";
import { fetchMyAnimals, fetchMyAnimalRecord } from "./myAnimalsApi";
import { isUpcomingAppointment } from "../utils/appointments";
import type { SiteHeaderView } from "../components/SiteHeader";

export type AccountActivity = {
  id: string; title: string; detail: string; status: string;
  date: string; view: SiteHeaderView; tone: string;
};
const label = (value: string) => value.replaceAll("_", " ");
export const accountDate = (value: string) => new Date(value).toLocaleString("en-FJ", {
  timeZone: "Pacific/Fiji", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
});

/** Uses the same authorized endpoints as the account's detail screens. */
export async function fetchAccountSummary(token: string) {
  const [applications, reports, records] = await Promise.allSettled([
    fetchMyAdoptionApplications(token),
    fetchMyRescueReports(token),
    fetchMyAnimals(token).then(async (animals) => ({
      animals,
      records: await Promise.allSettled(animals.map((animal) => fetchMyAnimalRecord(token, animal.id))),
    })),
  ]);
  const activity: AccountActivity[] = [];
  if (applications.status === "fulfilled") for (const entry of applications.value) {
    activity.push({ id: `application-${entry.id}`, title: "Adoption application",
      detail: entry.animal?.name ?? "Animal application", status: label(entry.status),
      date: entry.updatedAt, view: "my-applications", tone: entry.status === "under_review" ? "pending" : "active" });
  }
  if (reports.status === "fulfilled") for (const entry of reports.value) {
    activity.push({ id: `report-${entry.id}`, title: "Rescue alert", detail: `${entry.reference} · ${entry.location}`,
      status: label(entry.status), date: entry.updatedAt, view: "my-reports", tone: "active" });
  }
  const loadedRecords = records.status === "fulfilled" ? records.value.records.flatMap((result) => result.status === "fulfilled" ? [result.value] : []) : [];
  const recordsComplete = records.status === "fulfilled" && records.value.records.every((result) => result.status === "fulfilled");
  const upcoming = recordsComplete ? loadedRecords.flatMap((record) =>
    record.appointments.filter((appointment) => isUpcomingAppointment(appointment)).map((appointment) => ({ ...appointment, animalName: record.animal.name })),
  ).sort((a, b) => Date.parse(a.appointmentDate) - Date.parse(b.appointmentDate)) : null;
  for (const record of loadedRecords) for (const entry of record.appointments) {
    activity.push({ id: `appointment-${entry.id}`, title: "Veterinary appointment", detail: `${record.animal.name} · ${accountDate(entry.appointmentDate)}`,
      status: entry.status === "booked" && !isUpcomingAppointment(entry) ? "Past appointment" : label(entry.status),
      date: entry.createdAt, view: "my-animals", tone: entry.status === "cancelled" ? "cancelled" : "confirmed" });
  }
  return {
    applications: applications.status === "fulfilled" ? applications.value.length : null,
    pending: applications.status === "fulfilled" ? applications.value.filter((entry) => ["submitted", "under_review"].includes(entry.status)).length : null,
    reports: reports.status === "fulfilled" ? reports.value.length : null,
    animals: records.status === "fulfilled" ? records.value.animals.length : null,
    upcoming,
    activity: activity.sort((a, b) => Date.parse(b.date) - Date.parse(a.date)).slice(0, 5),
    incomplete: [applications, reports, records].some((result) => result.status === "rejected") || !recordsComplete,
  };
}
