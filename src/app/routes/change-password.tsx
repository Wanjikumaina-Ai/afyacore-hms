/**
 * src/app/routes/change-password.tsx
 *
 * Forced on first login (must_change_password = 1).
 * Also reachable from user profile settings at any time.
 *
 * Password rules:
 *   - Min 8 characters
 *   - At least one uppercase letter
 *   - At least one lowercase letter
 *   - At least one number
 *   - New password must differ from current
 *   - Confirm must match
 */
import {
  data, redirect, Form,
  useActionData, useLoaderData, useNavigation,
} from 'react-router';
import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { isLicensed } from '~/lib/license';
import { getSession, loginUser, changePassword } from '~/lib/auth.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const license = isLicensed();
  if (!license.licensed) throw redirect('/activate');
  const user = await getSession(request);
  if (!user) throw redirect('/login');
  return { name: user.name, isForced: user.must_change_password === 1 };
}

export async function action({ request }: ActionFunctionArgs) {
  const license = isLicensed();
  if (!license.licensed) throw redirect('/activate');
  const user = await getSession(request);
  if (!user) throw redirect('/login');

  const form = await request.formData();
  const currentPassword = String(form.get('currentPassword') ?? '');
  const newPassword     = String(form.get('newPassword') ?? '');
  const confirmPassword = String(form.get('confirmPassword') ?? '');

  // Verify current password
  const check = await loginUser(user.username, currentPassword);
  if (!check.success) {
    return data({ error: 'Current password is incorrect.' }, { status: 400 });
  }

  // Strength checks
  if (newPassword.length < 8)
    return data({ error: 'Password must be at least 8 characters.' }, { status: 400 });
  if (!/[A-Z]/.test(newPassword))
    return data({ error: 'Password must contain at least one uppercase letter.' }, { status: 400 });
  if (!/[a-z]/.test(newPassword))
    return data({ error: 'Password must contain at least one lowercase letter.' }, { status: 400 });
  if (!/\d/.test(newPassword))
    return data({ error: 'Password must contain at least one number.' }, { status: 400 });
  if (newPassword === currentPassword)
    return data({ error: 'New password must be different from your current password.' }, { status: 400 });
  if (newPassword !== confirmPassword)
    return data({ error: 'Passwords do not match.' }, { status: 400 });

  await changePassword(user.id, newPassword);
  throw redirect('/dashboard');
}

export default function ChangePasswordPage() {
  const { name, isForced } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === 'submitting';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-600 mb-4 shadow-lg shadow-blue-600/30">
            <svg className="w-9 h-9 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">AfyaCore HMS</h1>
        </div>

        <div className="bg-white/5 backdrop-blur border border-white/10 rounded-2xl p-8 shadow-2xl">
          <h2 className="text-lg font-semibold text-white mb-1">
            {isForced ? 'Set your password' : 'Change password'}
          </h2>
          <p className="text-slate-400 text-sm mb-6">
            {isForced
              ? <>Welcome, <span className="text-white font-medium">{name}</span>. Please set a secure personal password before continuing.</>
              : <>Update password for <span className="text-white font-medium">{name}</span>.</>
            }
          </p>

          <Form method="post" className="space-y-4">
            <div>
              <label htmlFor="currentPassword" className="block text-sm font-medium text-slate-300 mb-2">
                Current Password
              </label>
              <input
                id="currentPassword" name="currentPassword" type="password"
                autoComplete="current-password" autoFocus
                placeholder={isForced ? 'Afya@{your-username}  or  Admin@1234' : 'Current password'}
                className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/15 text-white
                           placeholder:text-slate-500 text-sm
                           focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              />
            </div>

            <div>
              <label htmlFor="newPassword" className="block text-sm font-medium text-slate-300 mb-2">
                New Password
              </label>
              <input
                id="newPassword" name="newPassword" type="password"
                autoComplete="new-password"
                placeholder="Min 8 chars · upper · lower · number"
                className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/15 text-white
                           placeholder:text-slate-500 text-sm
                           focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              />
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-300 mb-2">
                Confirm New Password
              </label>
              <input
                id="confirmPassword" name="confirmPassword" type="password"
                autoComplete="new-password"
                placeholder="Repeat new password"
                className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/15 text-white
                           placeholder:text-slate-500 text-sm
                           focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              />
            </div>

            <ul className="text-xs text-slate-500 space-y-0.5 pl-1 pt-1">
              <li>• At least 8 characters</li>
              <li>• One uppercase, one lowercase, one number</li>
              <li>• Cannot be the same as your current password</li>
            </ul>

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
                         disabled:cursor-not-allowed text-white font-semibold text-sm mt-2
                         transition-colors shadow-lg shadow-blue-600/20
                         focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-transparent"
            >
              {isSubmitting ? 'Saving…' : isForced ? 'Set Password & Continue' : 'Update Password'}
            </button>
          </Form>
        </div>
        <p className="text-center text-slate-600 text-xs mt-6">AfyaCore HMS · Licensed Software</p>
      </div>
    </div>
  );
}
