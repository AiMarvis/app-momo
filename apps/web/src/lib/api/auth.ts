import { authClient } from "@/lib/api/client";

export type AuthActionState = "idle" | "loading" | "success" | "error";
export type OAuthProvider = "github" | "google";

export async function sendEmailCode(email: string): Promise<void> {
  await authClient.emailAuth({ email });
}

export async function verifyEmailCode(code: string): Promise<void> {
  await authClient.emailVerify({ code });
}

export async function resendEmailCode(): Promise<void> {
  await authClient.emailResend({});
}

export async function getOAuthURL(provider: OAuthProvider): Promise<string> {
  const response =
    provider === "google" ? await authClient.googleAuthURL({}) : await authClient.githubAuthURL({});

  return response.authUrl;
}

export async function createDesktopToken(state: string): Promise<string> {
  const response = await authClient.createDesktopToken({ state });
  return response.token;
}
