// Maps a notification's entity type to the tracking page that shows it.
// Pure (no import.meta / fetch) so it stays unit-testable under node:test.
export type NotificationTargetView = "my-applications" | "my-reports" | "vet-appointments" | "user-dashboard";

export function notificationTargetView(entityType: string | null | undefined): NotificationTargetView {
	switch (entityType) {
		case "adoption_application":
			return "my-applications";
		case "rescue_report":
			return "my-reports";
		case "vet_appointment":
			return "vet-appointments";
		default:
			return "user-dashboard";
	}
}
