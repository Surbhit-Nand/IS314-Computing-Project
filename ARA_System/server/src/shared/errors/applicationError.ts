// Application-level error types shared between modules, services and routes.
//
// These carry no HTTP concepts: a route decides what status code an error maps
// to. That keeps provider-agnostic failures (an AI provider being down) from
// leaking provider types into route files.

// Raised when an optional, assistive dependency cannot do its job - today, the
// embedding provider behind AI animal search. It exists so callers can tell
// "the outside service is unavailable" apart from "the request was wrong" or
// "the database failed":
//
//   - routes   -> 503 with a friendly message, so the frontend can offer the
//                  normal listing and filters instead of an error page
//   - services -> log it and carry on, so a staff member's animal registration
//                  is never blocked by an AI outage
//
// The API key, the provider name and the raw provider response never appear in
// the message.
export class AiSearchUnavailableError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "AiSearchUnavailableError";
	}
}