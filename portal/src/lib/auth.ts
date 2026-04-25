import NextAuth from "next-auth";
import Keycloak from "next-auth/providers/keycloak";

const issuer = process.env.KEYCLOAK_ISSUER ?? "";
const clientId = process.env.KEYCLOAK_CLIENT_ID ?? "";
const clientSecret = process.env.KEYCLOAK_CLIENT_SECRET ?? "";

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  providers: [
    Keycloak({
      issuer,
      clientId,
      clientSecret,
    }),
  ],
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account?.access_token) {
        token.accessToken = account.access_token;
        token.idToken = account.id_token;
        token.refreshToken = account.refresh_token;
        token.expiresAt = account.expires_at;
      }
      if (profile) {
        const p = profile as { preferred_username?: string; groups?: string[] };
        token.preferredUsername = p.preferred_username;
        token.groups = Array.isArray(p.groups) ? p.groups : [];
      }
      return token;
    },
    async session({ session, token }) {
      if (token.preferredUsername && session.user) {
        session.user.username = token.preferredUsername as string;
      }
      session.idToken = token.idToken as string | undefined;
      session.groups = (token.groups as string[] | undefined) ?? [];
      return session;
    },
  },
  session: {
    strategy: "jwt",
    maxAge: 8 * 60 * 60,
  },
});
