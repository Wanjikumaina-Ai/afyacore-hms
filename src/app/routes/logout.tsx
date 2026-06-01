/**
 * src/app/routes/logout.tsx
 *
 * POST /logout — destroys the session cookie and redirects to /login.
 * Use from any page with:  <Form method="post" action="/logout"><button>Sign out</button></Form>
 */
import { redirect } from 'react-router';
import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { destroySession, makeLogoutCookie } from '~/lib/auth.server';

export async function action({ request }: ActionFunctionArgs) {
  await destroySession(request);
  throw redirect('/login?out=1', { headers: { 'Set-Cookie': makeLogoutCookie() } });
}

// GET /logout also works (e.g. direct link)
export async function loader({ request }: LoaderFunctionArgs) {
  await destroySession(request);
  throw redirect('/login?out=1', { headers: { 'Set-Cookie': makeLogoutCookie() } });
}

export default function Logout() { return null; }
