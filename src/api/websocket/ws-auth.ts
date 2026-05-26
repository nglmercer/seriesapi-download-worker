export interface TokenValidationResult {
  valid: boolean;
  userId?: number;
  error?: string;
}

export async function validateToken(token: string, mainApiUrl: string, sharedApiKey: string): Promise<TokenValidationResult> {
  try {
    const response = await fetch(`${mainApiUrl}/api/v1/auth/validate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${sharedApiKey}`,
      },
      body: JSON.stringify({ token }),
    });
    if (!response.ok) {
      return { valid: false, error: `Auth API returned ${response.status}` };
    }
    const data = await response.json() as { valid: boolean; user_id?: number };
    return { valid: data.valid, userId: data.user_id };
  } catch (err) {
    return { valid: false, error: err instanceof Error ? err.message : "Auth API unreachable" };
  }
}
