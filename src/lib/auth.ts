import type { AuthOptions, Session } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { prisma } from './prisma';
import type { Role, UserStatus } from '@prisma/client';
import { distanceMeters } from './geo';

const GEOFENCED_ROLES: Role[] = ['EMPLOYEE', 'HR_ADMIN'];

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email: string;
      firstName: string;
      lastName: string;
      role: Role;
      companyId: string | null;
      status: UserStatus;
    };
  }
  interface User {
    id: string;
    role: Role;
    companyId: string | null;
    status: UserStatus;
    firstName: string;
    lastName: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    role: Role;
    companyId: string | null;
    status: UserStatus;
    firstName: string;
    lastName: string;
  }
}

// Credentials provider only supports the JWT session strategy (NextAuth limitation) —
// the JWT is still verified server-side on every request via getServerSession/getToken,
// so this remains real session-based auth, not a client-only route guard.
export const authOptions: AuthOptions = {
  session: { strategy: 'jwt', maxAge: 8 * 60 * 60 },
  pages: { signIn: '/login' },
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Username', type: 'text' },
        password: { label: 'Password', type: 'password' },
        lat: { label: 'Latitude', type: 'text' },
        lng: { label: 'Longitude', type: 'text' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        // Generic failure below regardless of which check fails — never leak whether the username exists.
        // The underlying User.email column now stores plain usernames for this deployment
        // (e.g. "superadmin") rather than real email addresses.
        const user = await prisma.user.findUnique({
          where: { email: credentials.email.toLowerCase().trim() },
          include: { company: true },
        });
        if (!user) return null;
        if (user.status !== 'ACTIVE') return null;

        const valid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!valid) return null;

        // Login geofence (Super Admin-configured, per company) — only enforced for
        // EMPLOYEE/HR_ADMIN. Distance is computed from browser-reported coordinates,
        // which are client-supplied and not cryptographically verifiable; this is a
        // best-effort location gate, not a hard security boundary.
        if (GEOFENCED_ROLES.includes(user.role) && user.company?.geofenceEnabled) {
          const { geofenceLat, geofenceLng, geofenceRadiusMeters } = user.company;
          const lat = credentials.lat ? Number(credentials.lat) : NaN;
          const lng = credentials.lng ? Number(credentials.lng) : NaN;

          if (Number.isNaN(lat) || Number.isNaN(lng)) {
            throw new Error(
              'Location access is required to sign in. Please allow location permissions and try again.',
            );
          }
          if (geofenceLat != null && geofenceLng != null && geofenceRadiusMeters != null) {
            const distance = distanceMeters(lat, lng, geofenceLat, geofenceLng);
            if (distance > geofenceRadiusMeters) {
              throw new Error('You are outside the allowed login location for your company.');
            }
          }
        }

        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });

        return {
          id: user.id,
          email: user.email,
          role: user.role,
          companyId: user.companyId,
          status: user.status,
          firstName: user.firstName,
          lastName: user.lastName,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.companyId = user.companyId;
        token.status = user.status;
        token.firstName = user.firstName;
        token.lastName = user.lastName;
      }
      return token;
    },
    async session({ session, token }): Promise<Session> {
      session.user.id = token.id;
      session.user.role = token.role;
      session.user.companyId = token.companyId;
      session.user.status = token.status;
      session.user.firstName = token.firstName;
      session.user.lastName = token.lastName;
      return session;
    },
  },
};
