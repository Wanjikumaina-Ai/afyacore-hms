import { Search, Bell, User, Cloud, CloudOff, RefreshCw } from "lucide-react";
import { useState, useEffect } from "react";

export default function Header({ user }) {
  const [isOnline, setIsOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState(new Date());

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    setIsOnline(navigator.onLine);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const triggerSync = () => {
    setSyncing(true);
    setTimeout(() => {
      setSyncing(false);
      setLastSynced(new Date());
    }, 2000);
  };

  return (
    <header className="sticky top-0 z-40 flex h-16 w-full items-center justify-between border-b border-slate-200 bg-white/80 px-6 backdrop-blur-md">
      <div className="flex items-center gap-4">
        <div className="relative hidden md:block">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            size={18}
          />
          <input
            type="text"
            placeholder="Global search (Patients, ID, Bills...)"
            className="h-10 w-[350px] rounded-lg border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm outline-none focus:border-[#0F172A] focus:bg-white focus:ring-1 focus:ring-[#0F172A]"
          />
        </div>
      </div>

      <div className="flex items-center gap-6">
        {/* Sync Status */}
        <div className="flex items-center gap-3 border-r border-slate-200 pr-6">
          <div className="flex flex-col items-end">
            <div className="flex items-center gap-1.5">
              <div
                className={`h-2 w-2 rounded-full ${isOnline ? "bg-emerald-500" : "bg-red-500"}`}
              ></div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                {isOnline ? "Online" : "Offline"}
              </span>
            </div>
            <span className="text-[10px] text-slate-400">
              {syncing
                ? "Syncing data..."
                : `Synced: ${lastSynced.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
            </span>
          </div>
          <button
            onClick={triggerSync}
            className={`flex h-8 w-8 items-center justify-center rounded-full hover:bg-slate-100 ${syncing ? "animate-spin text-blue-600" : "text-slate-400"}`}
          >
            <RefreshCw size={16} />
          </button>
        </div>

        <div className="flex items-center gap-4">
          <button className="relative flex h-10 w-10 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100">
            <Bell size={20} />
            <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-red-500 border-2 border-white"></span>
          </button>

          <div className="flex items-center gap-3 border-l border-slate-200 pl-4">
            <div className="flex flex-col items-end">
              <span className="text-sm font-semibold text-[#0F172A]">
                {user?.name || "Staff Member"}
              </span>
              <span className="text-[10px] font-medium uppercase tracking-wider text-[#64748B]">
                {user?.role || "Staff"}
              </span>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 border border-slate-200">
              {user?.image ? (
                <img
                  src={user.image}
                  alt={user.name}
                  className="h-full w-full rounded-full object-cover"
                />
              ) : (
                <User size={20} className="text-slate-400" />
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
