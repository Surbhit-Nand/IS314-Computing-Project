// Retry helper for transient outbound failures (Neon cold-start wakeups,
// brief Clerk API blips). Retries ONLY network-level errors and 502/503/504 -
// application errors (4xx, auth, validation, SQL errors) throw immediately
// with no retry, and the last error is rethrown after attempts run out so
// callers' existing error handling behaves exactly as before.
export type RetryOptions = {
	attempts?: number;
	baseDelayMs?: number;
};

function isTransient(error: unknown): boolean {
	if (error instanceof TypeError) {
		// Undici/node reports unreachable hosts, timeouts, and aborted
		// connections as TypeErrors ("fetch failed", ConnectTimeoutError...).
		return true;
	}
	const status = (error as { status?: unknown })?.status;
	if (typeof status === "number" && [502, 503, 504].includes(status)) {
		return true;
	}
	const code = (error as { code?: unknown })?.code;
	return (
		typeof code === "string" &&
		["ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN"].includes(code)
	);
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function retryTransient<T>(
	fn: () => Promise<T>,
	options: RetryOptions = {},
): Promise<T> {
	const attempts = Math.max(1, options.attempts ?? 3);
	const baseDelayMs = options.baseDelayMs ?? 300;
	let lastError: unknown;
	for (let attempt = 1; attempt <= attempts; attempt += 1) {
		try {
			return await fn();
		} catch (error) {
			lastError = error;
			if (!isTransient(error) || attempt === attempts) {
				throw error;
			}
			// Exponential backoff with jitter: ~300ms, ~700ms, ~1.5s...
			const backoff = baseDelayMs * 2 ** (attempt - 1) + Math.random() * 100;
			await delay(backoff);
		}
	}
	throw lastError;
}
