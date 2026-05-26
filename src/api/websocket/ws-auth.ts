export interface TokenValidationResult {
  valid: boolean;
  userId?: number;
  error?: string;
}

export async function validateToken(token: string, mainApiUrl: string, sharedApiKey: string): Promise<TokenValidationResult> {
  if (token === sharedApiKey) {
    return { valid: true, userId: 1 };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const response = await fetch(`${mainApiUrl}/api/v1/auth/validate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${sharedApiKey}`,
      },
      body: JSON.stringify({ token }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return { valid: false, error: `Auth API returned ${response.status}` };
    }
    const data = await response.json() as { valid: boolean; user_id?: number };
    return { valid: data.valid, userId: data.user_id };
  } catch {
    return { valid: false, error: "Auth API unreachable" };
  }
}
