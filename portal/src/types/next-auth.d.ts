import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      username?: string;
      /**
       * Mailbox address used for IMAP/SMTP. Falls back to user.email when the
       * Keycloak `mailbox` attribute (mapped via the `mailbox` OIDC mapper)
       * is unset. Allows a user to log in with one address (e.g. their
       * primary Exchange email) but read mail from a different mailbox
       * (e.g. their Migadu mailbox on the portal's home domain).
       */
      mailbox?: string;
    };
    idToken?: string;
    accessToken?: string;
    accessTokenExpiresAt?: number;
    groups?: string[];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string;
    idToken?: string;
    refreshToken?: string;
    expiresAt?: number;
    preferredUsername?: string;
    groups?: string[];
    mailbox?: string;
  }
}

export {};
