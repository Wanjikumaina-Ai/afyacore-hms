/**
 * src/app/routes/login.tsx
 *
 * Sign-in page.
 * Shows after license activation and on every subsequent launch.
 * Displays the hospital name from the license file.
 */
import {
  data, redirect, Form,
  useActionData, useLoaderData, useNavigation,
} from 'react-router';
import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { isLicensed } from '~/lib/license';
import {
  getSession, loginUser, createSession, makeLoginCookie,
} from '~/lib/auth.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const license = isLicensed();
  if (!license.licensed) throw redirect('/activate');

  const user = await getSession(request);
  if (user) {
    if (user.must_change_password) throw redirect('/change-password');
    throw redirect('/dashboard');
  }

  const url = new URL(request.url);
  return {
    hospitalName: license.hospitalName!,
    activated: url.searchParams.get('activated') === '1',
    loggedOut: url.searchParams.get('out') === '1',
  };
}

export async function action({ request }: ActionFunctionArgs) {
  const license = isLicensed();
  if (!license.licensed) throw redirect('/activate');

  const form = await request.formData();
  const username = String(form.get('username') ?? '').trim().toLowerCase();
  const password = String(form.get('password') ?? '');

  if (!username || !password) {
    return data({ error: 'Username and password are required.' }, { status: 400 });
  }

  const result = await loginUser(username, password);
  if (!result.success) {
    return data({ error: result.error }, { status: 401 });
  }

  const token = await createSession(result.user.id);
  const cookie = makeLoginCookie(token);

  if (result.user.must_change_password) {
    throw redirect('/change-password', { headers: { 'Set-Cookie': cookie } });
  }
  throw redirect('/dashboard', { headers: { 'Set-Cookie': cookie } });
}

export default function LoginPage() {
  const { hospitalName, activated, loggedOut } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === 'submitting';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-600 mb-4 shadow-lg shadow-blue-600/30">
            <svg className="w-9 h-9 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">AfyaCore HMS</h1>
          <p className="text-blue-300 text-sm mt-1 font-medium">{hospitalName}</p>
        </div>

        {/* Banners */}
        {activated && (
          <div className="flex items-start gap-3 bg-green-500/10 border border-green-500/30 rounded-xl px-4 py-3 mb-5">
            <svg className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m4.5 12.75 6 6 9-13.5" />
            </svg>
            <div>
              <p className="text-green-300 text-sm font-medium">License activated successfully.</p>
              <p className="text-green-400/70 text-xs mt-0.5">
                Sign in with username <strong className="text-green-300">admin</strong> and
                password <strong className="text-green-300">Admin@1234</strong>
              </p>
            </div>
          </div>
        )}

        {loggedOut && (
          <div className="flex items-center gap-3 bg-slate-500/10 border border-slate-500/30 rounded-xl px-4 py-3 mb-5">
            <p className="text-slate-400 text-sm">You have been signed out.</p>
          </div>
        )}

        {/* Card */}
        <div className="bg-white/5 backdrop-blur border border-white/10 rounded-2xl p-8 shadow-2xl">
          <h2 className="text-lg font-semibold text-white mb-6">Sign in</h2>

          <Form method="post" className="space-y-5">
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-slate-300 mb-2">
                Username
              </label>
              <input
                id="username"
                name="username"
                type="text"
                autoComplete="username"
                autoFocus
                className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/15 text-white
                           placeholder:text-slate-500 text-sm
                           focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                placeholder="Enter your username"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-2">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/15 text-white
                           placeholder:text-slate-500 text-sm
                           focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                placeholder="Enter your password"
              />
            </div>

            {actionData?.error && (
              <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
                <svg className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
                </svg>
                <p className="text-red-300 text-sm">{actionData.error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-60
                         disabled:cursor-not-allowed text-white font-semibold text-sm
                         transition-colors shadow-lg shadow-blue-600/20
                         focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-transparent"
            >
              {isSubmitting ? 'Signing in…' : 'Sign in'}
            </button>
          </Form>
        </div>
        <p className="text-center text-slate-600 text-xs mt-6">AfyaCore HMS · Licensed Software</p>
      </div>
    </div>
  );
}
