/**
 * src/app/routes/activate.tsx
 *
 * Shown on first launch when no data/license.json exists.
 * User pastes the key generated with scripts/generate-license.cjs.
 * On success: license saved, default admin created, redirect to /login.
 */
import { useState } from 'react';
import {
  data, redirect, Form,
  useActionData, useNavigation,
} from 'react-router';
import type { ActionFunctionArgs } from 'react-router';
import { validateLicenseKey, saveLicense, readStoredLicense } from '~/lib/license';
import { ensureDefaultAdmin } from '~/lib/auth.server';

export async function loader() {
  const stored = readStoredLicense();
  if (stored) {
    const check = validateLicenseKey(stored.key);
    if (check.valid) throw redirect('/login');
  }
  return null;
}

export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  const key = String(form.get('licenseKey') ?? '').trim();
  if (!key) return data({ error: 'Please enter your license key.' }, { status: 400 });

  const result = validateLicenseKey(key);
  if (!result.valid) return data({ error: result.error ?? 'Invalid license key.' }, { status: 400 });

  saveLicense(key, result);
  await ensureDefaultAdmin(result.hospitalName!);
  throw redirect('/login?activated=1');
}

export default function ActivatePage() {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === 'submitting';
  const [key, setKey] = useState('');

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-600 mb-4 shadow-lg shadow-blue-600/30">
            <svg className="w-9 h-9 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">AfyaCore HMS</h1>
          <p className="text-slate-400 text-sm mt-1">Hospital Management System</p>
        </div>

        <div className="bg-white/5 backdrop-blur border border-white/10 rounded-2xl p-8 shadow-2xl">
          <h2 className="text-lg font-semibold text-white mb-1">Activate License</h2>
          <p className="text-slate-400 text-sm mb-6">
            Enter the license key provided for this facility to get started.
          </p>

          <Form method="post" className="space-y-5">
            <div>
              <label htmlFor="licenseKey" className="block text-sm font-medium text-slate-300 mb-2">
                License Key
              </label>
              <textarea
                id="licenseKey"
                name="licenseKey"
                rows={4}
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="AFYA-XXXXXXXX-XXXXXXXX-..."
                className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/15 text-white
                           placeholder:text-slate-500 font-mono text-sm resize-none
                           focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                autoComplete="off"
                spellCheck={false}
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
              disabled={isSubmitting || !key.trim()}
              className="w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50
                         disabled:cursor-not-allowed text-white font-semibold text-sm
                         transition-colors shadow-lg shadow-blue-600/20
                         focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-transparent"
            >
              {isSubmitting ? 'Activating…' : 'Activate & Continue'}
            </button>
          </Form>
        </div>
        <p className="text-center text-slate-600 text-xs mt-6">AfyaCore HMS · Licensed Software</p>
      </div>
    </div>
  );
}
