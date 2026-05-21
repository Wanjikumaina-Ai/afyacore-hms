import { useQuery } from "@tanstack/react-query";
import {
  Package,
  Search,
  Plus,
  Filter,
  AlertTriangle,
  ChevronRight,
  MoreVertical,
  TrendingDown,
} from "lucide-react";
import { useState } from "react";

export default function InventoryPage() {
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["inventory", search],
    queryFn: async () => {
      const res = await fetch(`/api/inventory?search=${search}`);
      if (!res.ok) throw new Error("Failed to fetch inventory");
      return res.json();
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0F172A]">
            Inventory & Supplies
          </h1>
          <p className="text-sm text-[#64748B]">
            Manage pharmacy stock, reagents, and hospital supplies
          </p>
        </div>
        <button className="flex items-center gap-2 rounded-lg bg-[#0F172A] px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-[#1E293B]">
          <Plus size={18} />
          Add New Item
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-[10px] font-bold uppercase text-slate-400">
            Total SKU Items
          </p>
          <p className="text-2xl font-black text-[#0F172A] mt-1">
            {data?.items?.length || 0}
          </p>
        </div>
        <div className="rounded-xl border border-red-100 bg-red-50 p-5 shadow-sm">
          <p className="text-[10px] font-bold uppercase text-red-400">
            Low Stock Alerts
          </p>
          <div className="flex items-center gap-2 mt-1">
            <AlertTriangle size={18} className="text-red-500" />
            <p className="text-2xl font-black text-red-600">
              {data?.items?.filter((i) => i.quantity <= i.reorder_level)
                .length || 0}
            </p>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-[10px] font-bold uppercase text-slate-400">
            Stock Value
          </p>
          <p className="text-2xl font-black text-emerald-600 mt-1">KSh 1.2M</p>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            size={18}
          />
          <input
            type="text"
            placeholder="Search items by name, SKU or category..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm outline-none focus:border-[#0F172A] focus:bg-white focus:ring-1 focus:ring-[#0F172A]"
          />
        </div>
        <button className="flex h-10 items-center gap-2 rounded-lg border border-slate-200 px-4 text-sm font-medium text-slate-600 hover:bg-slate-50">
          <Filter size={18} />
          All Categories
        </button>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <th className="px-6 py-3">Item Name / SKU</th>
                <th className="px-6 py-3">Category</th>
                <th className="px-6 py-3 text-center">Stock Level</th>
                <th className="px-6 py-3 text-right">Price (KSh)</th>
                <th className="px-6 py-3">Expiry</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {isLoading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i}>
                    <td
                      colSpan="6"
                      className="px-6 py-4 animate-pulse bg-slate-50/30 h-16"
                    ></td>
                  </tr>
                ))
              ) : data?.items?.length === 0 ? (
                <tr>
                  <td
                    colSpan="6"
                    className="px-6 py-12 text-center text-slate-400"
                  >
                    No inventory items found
                  </td>
                </tr>
              ) : (
                data?.items?.map((item) => (
                  <tr
                    key={item.id}
                    className="hover:bg-slate-50 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="font-bold text-[#0F172A]">
                          {item.item_name}
                        </span>
                        <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest">
                          {item.sku || "NO-SKU"}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-600">
                        {item.category}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col items-center gap-1">
                        <span
                          className={`text-sm font-black ${item.quantity <= item.reorder_level ? "text-red-600" : "text-[#0F172A]"}`}
                        >
                          {item.quantity} {item.unit || "Units"}
                        </span>
                        {item.quantity <= item.reorder_level && (
                          <span className="flex items-center gap-0.5 text-[9px] font-bold uppercase text-red-500">
                            <TrendingDown size={10} /> Critical
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex flex-col items-end">
                        <span className="font-bold text-[#0F172A]">
                          {parseFloat(item.selling_price).toLocaleString()}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          Cost: {parseFloat(item.buying_price).toLocaleString()}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-[11px] font-medium text-slate-500">
                      {item.expiry_date
                        ? new Date(item.expiry_date).toLocaleDateString()
                        : "N/A"}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button className="h-8 w-8 rounded-lg border border-slate-200 text-slate-400 hover:text-[#0F172A]">
                        <MoreVertical size={16} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
