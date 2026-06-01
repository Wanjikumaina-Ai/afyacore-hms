/**
 * src/app/routes/_index.tsx
 * "/" → routes user to correct screen based on system state.
 */
import { redirect } from 'react-router';
import type { LoaderFunctionArgs } from 'react-router';
import { isLicensed } from '~/lib/license';
import { getSession } from '~/lib/auth.server';

export async function loader({ request }: LoaderFunctionArgs) {
  if (!isLicensed().licensed) throw redirect('/activate');
  const user = await getSession(request);
  if (!user) throw redirect('/login');
  if (user.must_change_password) throw redirect('/change-password');
  throw redirect('/dashboard');
}

export default function Index() { return null; }
