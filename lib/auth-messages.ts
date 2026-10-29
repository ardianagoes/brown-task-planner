export const LINK_MESSAGES = {
  invalid: "This email link is invalid. Request a fresh link below.",
  expired: "This email link has expired or has already been used. Request a fresh link below.",
  pkce: "This older link needs the browser that requested it. Request a fresh link below to use another device.",
  session: "A verified session could not be established. Request a fresh email link.",
  recovery: "Open a fresh password-reset email before choosing a new password.",
  configuration: "Email authentication needs a server configuration update. Contact the app owner or use password sign-in.",
  unavailable: "Email verification is temporarily unavailable. Try again with a fresh link.",
} as const;
export type LinkReason = keyof typeof LINK_MESSAGES;
export type AuthMode = "login" | "signup" | "forgot" | "magic";
export function linkReason(value: string | undefined): LinkReason {
  return value && Object.hasOwn(LINK_MESSAGES, value) ? value as LinkReason : "invalid";
}
