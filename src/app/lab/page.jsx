import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  FlaskConical,
  Search,
  CheckCircle2,
  FlaskRound as Flask,
  Clock,
  User,
  Clipboard,
  Send,
} from "lucide-react";
import { useState } from "react";

export default function LabDashboard() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [results, setResults] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["lab-queue"],
    queryFn: async () => {
      const res = await fetch("/api/lab-requests?status=requested");
      if (!res.ok) throw new Error("Failed to fetch lab queue");
      return res.json();
    },
  });

  const submitResults = useMutation({
    mutationFn: async ({ id, results }) => {
      const res = await fetch("/api/lab-requests", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          results: { text: results },
          status: "completed",
        }),
      });
      if (!res.ok) throw new Error("Failed to submit results");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["lab-queue"]);
      setSelectedRequest(null);
      setResults("");
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0F172A]">
            Laboratory Information System
          </h1>
          <p className="text-sm text-[#64748B]">
            Manage specimen collection and result reporting
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* Pending Requests */}
        <div className="xl:col-span-1 space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
              <h3 className="flex items-center gap-2 font-bold text-[#0F172A]">
                <Clock size={18} className="text-purple-500" />
                Pending Requests
              </h3>
            </div>
            <div className="p-4">
              <div className="relative mb-4">
                <Search
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  size={16}
                />
                <input
                  type="text"
                  placeholder="Filter by patient..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-9 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-xs outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                />
              </div>
              <div className="space-y-2 max-h-[500px] overflow-y-auto">
                {isLoading ? (
                  <div className="py-10 text-center text-slate-400 text-xs">
                    Loading...
                  </div>
                ) : data?.requests?.length === 0 ? (
                  <div className="py-10 text-center text-slate-400 text-xs italic">
                    No pending requests
                  </div>
                ) : (
                  data?.requests
                    ?.filter(
                      (r) =>
                        r.first_name
                          .toLowerCase()
                          .includes(search.toLowerCase()) ||
                        r.last_name
                          .toLowerCase()
                          .includes(search.toLowerCase()),
                    )
                    .map((req) => (
                      <button
                        key={req.id}
                        onClick={() => setSelectedRequest(req)}
                        className={`w-full rounded-lg border p-3 text-left transition-all ${
                          selectedRequest?.id === req.id
                            ? "border-purple-500 bg-purple-50 ring-1 ring-purple-500"
                            : "border-slate-100 hover:border-slate-300"
                        }`}
                      >
                        <div className="flex justify-between items-start mb-1">
                          <span className="text-[10px] font-bold text-purple-600 uppercase">
                            Test: {req.test_name}
                          </span>
                          <span className="text-[10px] font-mono text-slate-400">
                            #{req.visit_number.slice(-4)}
                          </span>
                        </div>
                        <p className="text-sm font-bold text-[#0F172A]">
                          {req.first_name} {req.last_name}
                        </p>
                        <p className="text-[10px] text-slate-500 mt-1">
                          Requested:{" "}
                          {new Date(req.created_at).toLocaleTimeString()}
                        </p>
                      </button>
                    ))
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Result Entry Area */}
        <div className="xl:col-span-2">
          {selectedRequest ? (
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm h-full">
              <div className="border-b border-slate-100 p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                      <User size={24} />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-[#0F172A]">
                        {selectedRequest.first_name} {selectedRequest.last_name}
                      </h2>
                      <p className="text-xs text-slate-500">
                        {selectedRequest.patient_number} •{" "}
                        {selectedRequest.gender} •{" "}
                        {selectedRequest.visit_number}
                      </p>
                    </div>
                  </div>
                  <div className="rounded-lg border border-purple-100 bg-purple-50 px-4 py-2 text-center">
                    <p className="text-[10px] font-bold uppercase text-purple-600">
                      Specimen Status
                    </p>
                    <p className="text-sm font-bold text-purple-900">
                      Requested
                    </p>
                  </div>
                </div>
                <div className="flex gap-4 text-sm font-medium text-slate-600">
                  <div className="flex items-center gap-1.5">
                    <Flask size={16} />{" "}
                    <span className="font-bold text-purple-600">
                      {selectedRequest.test_name}
                    </span>
                  </div>
                </div>
              </div>

              <div className="p-6 space-y-6">
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                    <Clipboard size={14} /> Result Details & Interpretations
                  </label>
                  <textarea
                    value={results}
                    onChange={(e) => setResults(e.target.value)}
                    rows={12}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm outline-none focus:border-[#0F172A] focus:bg-white focus:ring-1 focus:ring-[#0F172A]"
                    placeholder="Enter test values, normal ranges, and clinical interpretation here..."
                  />
                </div>

                <div className="flex items-center justify-between border-t border-slate-100 pt-6">
                  <div className="flex gap-2">
                    <button className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">
                      Discard
                    </button>
                    <button className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">
                      Print Label
                    </button>
                  </div>
                  <button
                    onClick={() =>
                      submitResults.mutate({ id: selectedRequest.id, results })
                    }
                    disabled={submitResults.isLoading || !results}
                    className="flex items-center gap-2 rounded-lg bg-[#0F172A] px-8 py-2.5 text-sm font-semibold text-white transition-all hover:bg-[#1E293B] disabled:opacity-50"
                  >
                    <Send size={18} />
                    {submitResults.isLoading
                      ? "Submitting..."
                      : "Submit Final Results"}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-40 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/50">
              <FlaskConical size={60} className="text-slate-300 mb-4" />
              <h3 className="text-lg font-bold text-slate-400">
                Laboratory Workspace
              </h3>
              <p className="text-sm text-slate-400 max-w-xs text-center mt-1">
                Select a request from the sidebar to begin sample processing and
                result entry.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
