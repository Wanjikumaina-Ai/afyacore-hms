/**
 * src/app/routes/403.tsx
 *
 * Shown when requireRole() rejects the user's role.
 * The user is logged in but does not have permission for this section.
 */
import { Link } from 'react-router';
import type { LoaderFunctionArgs } from 'react-router';
import { getSession } from '~/lib/auth.server';
import { roleLabel } from '~/lib/roles';

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await getSession(request);
  return { roleName: user ? roleLabel(user.role) : null };
}

export default function ForbiddenPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4">
      <div className="text-center max-w-sm">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-red-600/20 border border-red-500/30 mb-6">
          <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M18.364 18.364A9 9 0 0 0 5.636 5.636m12.728 12.728A9 9 0 0 1 5.636 5.636m12.728 12.728L5.636 5.636" />
          </svg>
        </div>
        <h1 className="text-3xl font-bold text-white mb-2">Access Denied</h1>
        <p className="text-slate-400 text-sm mb-8">
          You do not have permission to view this section.
          Contact your system administrator if you believe this is an error.
        </p>
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-500
                     text-white text-sm font-semibold transition-colors"
        >
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
