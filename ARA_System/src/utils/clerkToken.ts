// Clerk's declared GetTokenOptions omits the forceRefresh flag this util
// relies on, so the args stay loosely typed to match the real runtime getter.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ClerkTokenGetter = (...args: any[]) => Promise<string | null>;

export async function getFreshClerkToken(getToken: ClerkTokenGetter): Promise<string | null> {
  return getToken({ forceRefresh: true });
}
