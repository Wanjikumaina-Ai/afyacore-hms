/**
 * src/app/routes/users.tsx
 *
 * Admin-only user management page.
 * - Lists all staff accounts with role badges
 * - Create new user (username, full name, role) → temp password shown once
 * - Edit user name, role, active status
 * - Reset password → resets to Afya@{username}, forces change on next login
 *
 * Route guard: admin only.
 */
import { useState } from 'react';
import {
  data, redirect, Form,
  useLoaderData, useActionData, useNavigation,
} from 'react-router';
import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import {
  requireRole, listUsers, createUser,
  updateUser, resetUserPassword,
} from '~/lib/auth.server';
import { ALL_ROLES, roleLabel, ROLES } from '~/lib/roles';
import type { Role } from '~/lib/roles';
import type { UserRow } from '~/lib/auth.server';

export async function loader({ request }: LoaderFunctionArgs) {
  await requireRole(request, ['admin']);
  const users = await listUsers();
  return { users };
}

export async function action({ request }: ActionFunctionArgs) {
  await requireRole(request, ['admin']);
  const form = await request.formData();
  const intent = String(form.get('intent'));

  if (intent === 'create') {
    const username = String(form.get('username') ?? '').trim().toLowerCase();
    const name     = String(form.get('name') ?? '').trim();
    const role     = String(form.get('role') ?? '') as Role;

    if (!username || !name || !role) {
      return data({ error: 'All fields are required.', intent }, { status: 400 });
    }
    if (!ALL_ROLES.includes(role)) {
      return data({ error: 'Invalid role selected.', intent }, { status: 400 });
    }
    if (!/^[a-z0-9._-]{3,30}$/.test(username)) {
      return data({
        error: 'Username must be 3–30 characters: letters, numbers, dots, hyphens, underscores only.',
        intent,
      }, { status: 400 });
    }

    try {
      const { tempPassword } = await createUser({ username, name, role });
      return data({ success: true, intent, username, tempPassword });
    } catch (err: unknown) {
      return data({
        error: err instanceof Error ? err.message : 'Failed to create user.',
        intent,
      }, { status: 400 });
    }
  }

  if (intent === 'toggle_active') {
    const userId   = Number(form.get('userId'));
    const isActive = Number(form.get('is_active'));
    await updateUser(userId, { is_active: isActive === 1 ? 0 : 1 });
    throw redirect('/users');
  }

  if (intent === 'update_role') {
    const userId = Number(form.get('userId'));
    const role   = String(form.get('role')) as Role;
    await updateUser(userId, { role });
    throw redirect('/users');
  }

  if (intent === 'reset_password') {
    const userId = Number(form.get('userId'));
    const tempPassword = await resetUserPassword(userId);
    return data({ success: true, intent, tempPassword });
  }

  return data({ error: 'Unknown action.', intent }, { status: 400 });
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function UsersPage() {
  const { users } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === 'submitting';

  const [showCreate, setShowCreate] = useState(false);

  const justCreated = actionData && 'success' in actionData && actionData.intent === 'create';
  const justReset   = actionData && 'success' in actionData && actionData.intent === 'reset_password';

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">User Management</h1>
          <p className="text-slate-400 text-sm mt-1">{users.length} staff accounts</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500
                     text-white text-sm font-semibold transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Add Staff
        </button>
      </div>

      {/* Success: new user created */}
      {justCreated && 'tempPassword' in actionData && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-xl px-5 py-4 mb-6">
          <p className="text-green-300 font-medium text-sm">User created successfully.</p>
          <p className="text-green-400/80 text-xs mt-1">
            Username: <strong className="text-green-300">{(actionData as { username?: string }).username}</strong>
            &nbsp;·&nbsp;
            Temporary password: <strong className="text-green-300 font-mono">{(actionData as { tempPassword?: string }).tempPassword}</strong>
          </p>
          <p className="text-green-500/60 text-xs mt-1">Share these credentials with the staff member. They will be forced to change their password on first login.</p>
        </div>
      )}

      {/* Success: password reset */}
      {justReset && 'tempPassword' in actionData && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl px-5 py-4 mb-6">
          <p className="text-yellow-300 font-medium text-sm">Password reset successfully.</p>
          <p className="text-yellow-400/80 text-xs mt-1">
            New temporary password: <strong className="text-yellow-300 font-mono">{(actionData as { tempPassword?: string }).tempPassword}</strong>
          </p>
          <p className="text-yellow-500/60 text-xs mt-1">The user will be required to change this on next login.</p>
        </div>
      )}

      {/* Error */}
      {'error' in (actionData ?? {}) && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-5 py-3 mb-6">
          <p className="text-red-300 text-sm">{(actionData as { error: string }).error}</p>
        </div>
      )}

      {/* Create user modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-white">Add Staff Member</h2>
              <button onClick={() => setShowCreate(false)} className="text-slate-400 hover:text-white transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <Form method="post" className="space-y-4">
              <input type="hidden" name="intent" value="create" />

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Full Name</label>
                <input
                  name="name" type="text" required
                  placeholder="e.g. Dr. Jane Njoroge"
                  className="w-full px-4 py-2.5 rounded-xl bg-white/10 border border-white/15 text-white
                             placeholder:text-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Username</label>
                <input
                  name="username" type="text" required
                  placeholder="e.g. drnjoroge  (lowercase, no spaces)"
                  className="w-full px-4 py-2.5 rounded-xl bg-white/10 border border-white/15 text-white
                             placeholder:text-slate-500 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                />
                <p className="text-slate-500 text-xs mt-1">Initial password will be: Afya@{'{username}'}</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Role</label>
                <select
                  name="role" required
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-700 border border-white/15 text-white
                             text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                >
                  <option value="">Select a role…</option>
                  {ALL_ROLES.filter(r => r !== 'admin').map(r => (
                    <option key={r} value={r}>{roleLabel(r)}</option>
                  ))}
                </select>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="flex-1 py-2.5 rounded-xl border border-white/15 text-slate-300 hover:text-white
                             text-sm font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50
                             text-white text-sm font-semibold transition-colors"
                >
                  {isSubmitting ? 'Creating…' : 'Create Account'}
                </button>
              </div>
            </Form>
          </div>
        </div>
      )}

      {/* Users table */}
      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10">
              <th className="text-left px-5 py-3.5 text-slate-400 font-medium">Name</th>
              <th className="text-left px-5 py-3.5 text-slate-400 font-medium">Username</th>
              <th className="text-left px-5 py-3.5 text-slate-400 font-medium">Role</th>
              <th className="text-left px-5 py-3.5 text-slate-400 font-medium">Status</th>
              <th className="text-right px-5 py-3.5 text-slate-400 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user: UserRow, idx: number) => (
              <tr key={user.id} className={idx % 2 === 0 ? '' : 'bg-white/[0.02]'}>
                <td className="px-5 py-3.5 text-white font-medium">{user.name}</td>
                <td className="px-5 py-3.5 text-slate-400 font-mono">{user.username}</td>
                <td className="px-5 py-3.5">
                  <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium text-white ${ROLES[user.role as Role]?.badgeClass ?? 'bg-slate-500'}`}>
                    {roleLabel(user.role as Role)}
                  </span>
                </td>
                <td className="px-5 py-3.5">
                  <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${user.is_active ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'}`}>
                    {user.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-5 py-3.5">
                  <div className="flex items-center justify-end gap-2">
                    {/* Change role */}
                    <Form method="post" className="flex items-center gap-1">
                      <input type="hidden" name="intent" value="update_role" />
                      <input type="hidden" name="userId" value={user.id} />
                      <select
                        name="role"
                        defaultValue={user.role}
                        onChange={(e) => e.currentTarget.form?.requestSubmit()}
                        className="text-xs bg-slate-700 border border-white/10 text-slate-300 rounded-lg px-2 py-1 focus:outline-none"
                      >
                        {ALL_ROLES.map(r => (
                          <option key={r} value={r}>{roleLabel(r)}</option>
                        ))}
                      </select>
                    </Form>

                    {/* Reset password */}
                    <Form method="post">
                      <input type="hidden" name="intent" value="reset_password" />
                      <input type="hidden" name="userId" value={user.id} />
                      <button
                        type="submit"
                        className="text-xs px-2.5 py-1 rounded-lg bg-yellow-500/20 text-yellow-300
                                   hover:bg-yellow-500/30 transition-colors"
                      >
                        Reset pwd
                      </button>
                    </Form>

                    {/* Toggle active — cannot deactivate yourself */}
                    {user.username !== 'admin' && (
                      <Form method="post">
                        <input type="hidden" name="intent" value="toggle_active" />
                        <input type="hidden" name="userId" value={user.id} />
                        <input type="hidden" name="is_active" value={user.is_active} />
                        <button
                          type="submit"
                          className={`text-xs px-2.5 py-1 rounded-lg transition-colors ${
                            user.is_active
                              ? 'bg-red-500/20 text-red-300 hover:bg-red-500/30'
                              : 'bg-green-500/20 text-green-300 hover:bg-green-500/30'
                          }`}
                        >
                          {user.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                      </Form>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
