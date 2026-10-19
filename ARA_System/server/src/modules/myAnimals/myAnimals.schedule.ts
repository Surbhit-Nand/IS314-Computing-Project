const CLINIC_TIME_ZONE = "Pacific/Fiji";

export function clinicDateTime(date: Date) {
	const parts = new Intl.DateTimeFormat("en-GB", {
		timeZone: CLINIC_TIME_ZONE,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hourCycle: "h23",
	})
		.formatToParts(date)
		.reduce<Record<string, string>>((result, part) => {
			if (part.type !== "literal") result[part.type] = part.value;
			return result;
		}, {});

	return {
		date: `${parts.year}-${parts.month}-${parts.day}`,
		time: `${parts.hour}:${parts.minute}`,
		year: Number(parts.year),
		month: Number(parts.month),
		day: Number(parts.day),
		hour: Number(parts.hour),
		minute: Number(parts.minute),
		second: Number(parts.second),
	};
}

export function addClinicDays(date: string, days: number): string {
	const value = new Date(`${date}T00:00:00.000Z`);
	value.setUTCDate(value.getUTCDate() + days);
	return value.toISOString().slice(0, 10);
}

export function isValidClinicDate(date: string): boolean {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
	const parsed = new Date(`${date}T00:00:00.000Z`);
	return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

export function clinicLocalToInstant(date: string, time: string): Date {
	const [year, month, day] = date.split("-").map(Number);
	const [hour, minute] = time.split(":").map(Number);
	const guess = Date.UTC(year, month - 1, day, hour, minute);
	const local = clinicDateTime(new Date(guess));
	const clinicWallClockAsUtc = Date.UTC(
		local.year,
		local.month - 1,
		local.day,
		local.hour,
		local.minute,
		local.second,
	);
	return new Date(guess + guess - clinicWallClockAsUtc);
}

export function clinicSlotTimes(date: string): string[] {
	const day = new Date(`${date}T00:00:00.000Z`).getUTCDay();
	if (day === 0) return [];
	const closingHour = day === 6 ? 13 : 17;
	const times: string[] = [];
	for (let minutes = 8 * 60; minutes + 30 <= closingHour * 60; minutes += 30) {
		times.push(`${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`);
	}
	return times;
}
