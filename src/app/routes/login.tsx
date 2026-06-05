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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-emerald-50 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Animated background elements */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-blue-200/20 rounded-full blur-3xl -mr-48 -mt-48 animate-pulse"></div>
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-emerald-200/20 rounded-full blur-3xl -ml-48 -mb-48 animate-pulse" style={{animationDelay: '1s'}}></div>

      <div className="w-full max-w-4xl relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
          {/* Left side - Branding & Info */}
          <div className="hidden lg:flex flex-col justify-center">
            <div className="space-y-8">
              <div>
                <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-gradient-to-br from-blue-600 to-emerald-600 mb-6 shadow-xl shadow-blue-600/20">
                  <svg className="w-11 h-11 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round"
                      d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
                  </svg>
                </div>
                <h1 className="text-5xl font-bold text-slate-900 mb-2">AfyaCore HMS</h1>
                <p className="text-xl text-slate-600 font-semibold">{hospitalName}</p>
              </div>

              <div className="space-y-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
                    <svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900">Lightning Fast</h3>
                    <p className="text-slate-600 text-sm">Instant access to patient records and hospital operations</p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
                    <svg className="w-6 h-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900">Secure & Reliable</h3>
                    <p className="text-slate-600 text-sm">Enterprise-grade security with complete data protection</p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
                    <svg className="w-6 h-6 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900">Easy to Manage</h3>
                    <p className="text-slate-600 text-sm">Intuitive controls for seamless hospital management</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right side - Login Form */}
          <div className="w-full max-w-md mx-auto">
            <div className="bg-white rounded-2xl shadow-2xl shadow-slate-200/50 p-8 backdrop-blur-sm border border-slate-100">
              <h2 className="text-3xl font-bold text-slate-900 mb-2">Welcome back</h2>
              <p className="text-slate-600 text-sm mb-8">Sign in to your account to continue</p>

              <Form method="post" className="space-y-6">
                {/* Banners */}
                {activated && (
                  <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 animate-in fade-in slide-in-from-top">
                    <svg className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <div>
                      <p className="text-emerald-900 text-sm font-medium">License activated successfully</p>
                      <p className="text-emerald-700 text-xs mt-1">
                        Demo credentials: <strong>admin</strong> / <strong>Admin@1234</strong>
                      </p>
                    </div>
                  </div>
                )}

                {loggedOut && (
                  <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 animate-in fade-in slide-in-from-top">
                    <svg className="w-5 h-5 text-blue-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 5v8a2 2 0 01-2 2h-5l-5 4v-4H4a2 2 0 01-2-2V5a2 2 0 012-2h12a2 2 0 012 2zm-11-1a1 1 0 11-2 0 1 1 0 012 0z" clipRule="evenodd" />
                    </svg>
                    <p className="text-blue-900 text-sm font-medium">You have been signed out</p>
                  </div>
                )}

                {/* Username Field */}
                <div>
                  <label htmlFor="username" className="block text-sm font-semibold text-slate-900 mb-2">
                    Username
                  </label>
                  <input
                    id="username"
                    name="username"
                    type="text"
                    autoComplete="username"
                    autoFocus
                    className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900
                               placeholder:text-slate-400 text-sm font-medium
                               focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                               focus:bg-white transition-all duration-200 shadow-sm hover:border-slate-300"
                    placeholder="Enter your username"
                  />
                </div>

                {/* Password Field */}
                <div>
                  <label htmlFor="password" className="block text-sm font-semibold text-slate-900 mb-2">
                    Password
                  </label>
                  <input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900
                               placeholder:text-slate-400 text-sm font-medium
                               focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                               focus:bg-white transition-all duration-200 shadow-sm hover:border-slate-300"
                    placeholder="Enter your password"
                  />
                </div>

                {/* Error Message */}
                {actionData?.error && (
                  <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3 animate-in shake">
                    <svg className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                    <p className="text-red-900 text-sm font-medium">{actionData.error}</p>
                  </div>
                )}

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-emerald-600 hover:from-blue-700 hover:to-emerald-700 disabled:opacity-60
                             disabled:cursor-not-allowed text-white font-bold text-sm
                             transition-all duration-200 shadow-lg shadow-blue-600/30 hover:shadow-lg hover:shadow-blue-600/40
                             focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                             active:scale-95 transform"
                >
                  {isSubmitting ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Signing in…
                    </span>
                  ) : (
                    'Sign in'
                  )}
                </button>
              </Form>
            </div>

            <p className="text-center text-slate-500 text-xs mt-6">
              <span className="inline-flex items-center gap-1">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                </svg>
                AfyaCore HMS · Secure & Licensed Software
              </span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
