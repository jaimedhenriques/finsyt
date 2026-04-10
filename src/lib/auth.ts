import NextAuth from 'next-auth';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import GitHub from 'next-auth/providers/github';
import Google from 'next-auth/providers/google';
import Credentials from 'next-auth/providers/credentials';
import { db } from '@/db';
import { users, accounts, sessions, verificationTokens } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Buffer.from(hash).toString('hex');
}

async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  const hash = await hashPassword(password);
  return hash === hashedPassword;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  session: {
    strategy: 'jwt',
  },
  pages: {
    signIn: '/auth/signin',
    newUser: '/dashboard',
    error: '/auth/signin',
  },
  providers: [
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    }),
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) {
          return null;
        }

        const { email, password } = parsed.data;

        const user = await db
          .select()
          .from(users)
          .where(eq(users.email, email))
          .limit(1);

        if (!user[0] || !user[0].password) {
          return null;
        }

        const isValid = await verifyPassword(password, user[0].password);
        if (!isValid) {
          return null;
        }

        return {
          id: user[0].id,
          email: user[0].email,
          name: user[0].name,
          image: user[0].image,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user) {
        token.id = user.id;
      }

      // Fetch latest user data on sign in or update
      if (trigger === 'signIn' || trigger === 'update') {
        const dbUser = await db
          .select()
          .from(users)
          .where(eq(users.id, token.id as string))
          .limit(1);

        if (dbUser[0]) {
          token.plan = dbUser[0].plan;
          token.trialEndDate = dbUser[0].trialEndDate?.toISOString() ?? null;
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
        session.user.plan = token.plan as string;
        session.user.trialEndDate = token.trialEndDate as string | null;
      }
      return session;
    },
  },
  events: {
    async createUser({ user }) {
      // Automatically start 15-day free trial for new users
      const now = new Date();
      const trialEnd = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000);

      await db
        .update(users)
        .set({
          plan: 'free_trial',
          trialStartDate: now,
          trialEndDate: trialEnd,
        })
        .where(eq(users.id, user.id!));
    },
  },
});

// Helper function to register a new user with email/password
export async function registerUser(
  email: string,
  password: string,
  name?: string
): Promise<{ success: boolean; error?: string; userId?: string }> {
  try {
    // Check if user already exists
    const existingUser = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existingUser[0]) {
      return { success: false, error: 'User already exists' };
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Calculate trial dates
    const now = new Date();
    const trialEnd = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000);

    // Create user
    const newUser = await db
      .insert(users)
      .values({
        email,
        password: hashedPassword,
        name: name || email.split('@')[0],
        plan: 'free_trial',
        trialStartDate: now,
        trialEndDate: trialEnd,
      })
      .returning();

    return { success: true, userId: newUser[0].id };
  } catch (error) {
    console.error('Registration error:', error);
    return { success: false, error: 'Failed to register user' };
  }
}

// Helper to check trial status
export function getTrialStatus(trialEndDate: Date | null): {
  isActive: boolean;
  daysRemaining: number;
  isExpired: boolean;
} {
  if (!trialEndDate) {
    return { isActive: false, daysRemaining: 0, isExpired: true };
  }

  const now = new Date();
  const endDate = new Date(trialEndDate);
  const diffTime = endDate.getTime() - now.getTime();
  const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  return {
    isActive: daysRemaining > 0,
    daysRemaining: Math.max(0, daysRemaining),
    isExpired: daysRemaining <= 0,
  };
}

// Extend NextAuth types
declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      image?: string | null;
      plan?: string;
      trialEndDate?: string | null;
    };
  }

  interface User {
    plan?: string;
    trialEndDate?: string | null;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    plan?: string;
    trialEndDate?: string | null;
  }
}
