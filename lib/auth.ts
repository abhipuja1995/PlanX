import GoogleProvider from "next-auth/providers/google";
import type { NextAuthOptions } from "next-auth";
import { supabaseAdmin } from "@/lib/supabase";

export type UserRole = 'sales' | 'manager' | 'finance' | 'admin' | 'super_admin';

async function getRoleByEmail(email: string): Promise<UserRole | null> {
  const { data } = await supabaseAdmin
    .from('user_roles')
    .select('role')
    .eq('email', email)
    .single();
  return (data?.role as UserRole) ?? null;
}

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId:     process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async signIn({ profile }) {
      const email = (profile?.email ?? "").toLowerCase();
      if (!email.endsWith("@credresolve.com")) {
        return "/login?error=unauthorized_domain";
      }
      return true;
    },
    async jwt({ token }) {
      if (token.email && !token.role) {
        token.role = await getRoleByEmail(token.email);
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.email = token.email as string;
        // @ts-expect-error extending session type
        session.user.role = token.role ?? null;
      }
      return session;
    },
  },
};
