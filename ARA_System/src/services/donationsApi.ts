// Frontend client for the donations API. Mirrors the pattern used by
// animalsApi.ts: a single base URL, a shared response reader that turns
// "API not running" HTML responses into a friendly error, and one
// exported function per backend endpoint.

const apiBaseUrl = import.meta.env.VITE_API_URL ?? "http://localhost:8787";

async function readApiResponse<T>(response: Response): Promise<T> {
	const contentType = response.headers.get("content-type") ?? "";
	if (!contentType.includes("application/json")) {
		throw new Error(
			"The ARA API is not running. Start it with `npm run server:dev`.",
		);
	}
	return (await response.json()) as T;
}

export type PaymentMethod = "card" | "qr";

export type DonationRequest = {
	amountCents: number;
	currency?: string;
	donorName?: string;
	donorEmail?: string;
	message?: string;
	paymentMethod?: PaymentMethod;
};

export type DonationResponse = {
	id: string;
	amountCents: number;
	currency: string;
	status: "pending" | "completed" | "failed" | "refunded";
	paymentMethod: PaymentMethod;
	createdAt: string;
};

// Submits a donation. The backend accepts anonymous donations, so no
// Clerk token is attached here - if the user is signed in, the backend
// will pick up their user id from the session cookie automatically.
export async function submitDonation(payload: DonationRequest): Promise<DonationResponse> {
	const response = await fetch(`${apiBaseUrl}/api/donations`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(payload),
	});
	const result = await readApiResponse<DonationResponse | { error?: string }>(response);
	if (!response.ok) {
		throw new Error((result as { error?: string }).error ?? "Donation could not be processed.");
	}
	return result as DonationResponse;
}
