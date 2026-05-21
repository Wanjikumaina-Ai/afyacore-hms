/**
 * FILE: src/app/api/auth/expo-web-success/route.js
 *
 * Session-check endpoint used by useUser() hooks on both web and mobile.
 * Returns the current logged-in user from the session cookie, or { user: null }.
 */

import { auth } from '@/auth.js';

export async function GET(request) {
  const session = await auth(request);
  if (!session?.user) return Response.json({ user: null });
  return Response.json({ user: session.user });
}
