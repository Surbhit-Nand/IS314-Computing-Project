// Express types a route param as `string | string[]` because a path pattern
// could in principle capture a param more than once. Our routes only ever
// use a single ":id" segment, so this just narrows it back down to a plain
// string (taking the first value in the unexpected array case).
export function getIdParam(value: string | string[]): string {
	return Array.isArray(value) ? value[0] : value;
}
