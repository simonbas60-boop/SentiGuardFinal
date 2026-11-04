import { Eye, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { useLocation } from "react-router-dom";

import PageHeader from "../components/common/PageHeader";
import { deleteAlert, getAlerts } from "../services/alertService";
import { BACKEND_BASE_URL } from "../services/api";

export default function Alerts() {
  const location = useLocation();
  const selectedRow = useRef(null);
  const [alerts, setAlerts] = useState([]);
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");

  async function loadAlerts() {
    try {
      setAlerts(await getAlerts());
    } catch (error) {
      console.error(error);
      toast.error("Could not load alert history.");
    }
  }

  useEffect(() => {
    const initialTimer = window.setTimeout(loadAlerts, 0);
    const timer = window.setInterval(loadAlerts, 5000);

    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    selectedRow.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [alerts]);

  const filteredAlerts = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return alerts.filter((item) => {
      const source = item.source || "Live Camera";
      const isUploaded = source.startsWith("Uploaded Video");
      const isDensity = source.startsWith("Crowd Density Detection");
      const isLive = !isUploaded && !isDensity;

      const matchesSource =
        sourceFilter === "all" ||
        (sourceFilter === "live" && isLive) ||
        (sourceFilter === "uploaded" && isUploaded) ||
        (sourceFilter === "density" && isDensity);
      const matchesSearch =
        !normalizedSearch ||
        [item.alert, item.action || item.emotion, item.time, source, item.people]
          .join(" ")
          .toLowerCase()
          .includes(normalizedSearch);

      return matchesSource && matchesSearch;
    });
  }, [alerts, search, sourceFilter]);

  async function handleDelete(item) {
    const filename = String(item.image || "").split("/").pop();
    if (!filename) return;

    if (!window.confirm("Delete this alert and its snapshot?")) return;

    try {
      await deleteAlert(filename);
      await loadAlerts();
      toast.success("Alert deleted.");
    } catch (error) {
      toast.error(error.response?.data?.message || "Alert could not be deleted.");
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Incident records"
        title="Alert history"
        description="Review recorded crowd behavior, uploaded-video, and crowd-density warnings with saved evidence snapshots."
      />

      <section className="overflow-hidden rounded-2xl border border-slate-800 bg-[#0c1728]">
        <div className="flex flex-col gap-3 border-b border-slate-800 p-4 sm:flex-row">
          <label className="flex flex-1 items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/60 px-3">
            <Search size={17} className="text-slate-600" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search alerts, action, source or time"
              className="w-full bg-transparent py-2.5 text-sm text-slate-200 outline-none placeholder:text-slate-600"
            />
          </label>

          <select
            value={sourceFilter}
            onChange={(event) => setSourceFilter(event.target.value)}
            className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-slate-200 outline-none focus:border-cyan-400/50"
          >
            <option value="all">All sources</option>
            <option value="live">Live camera</option>
            <option value="uploaded">Uploaded videos</option>
            <option value="density">Crowd density</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-left text-sm">
            <thead className="bg-slate-900/60 text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-5 py-3 font-medium">Time</th>
                <th className="px-5 py-3 font-medium">Alert</th>
                <th className="px-5 py-3 font-medium">Source</th>
                <th className="px-5 py-3 font-medium">People</th>
                <th className="px-5 py-3 font-medium">Action</th>
                <th className="px-5 py-3 font-medium">Risk</th>
                <th className="px-5 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filteredAlerts.map((item) => (
                <tr
                  key={item.id}
                  ref={
                    location.state?.selectedAlert === item.id ? selectedRow : null
                  }
                  className={`transition hover:bg-slate-800/30 ${
                    location.state?.selectedAlert === item.id
                      ? "bg-cyan-400/10"
                      : ""
                  }`}
                >
                  <td className="whitespace-nowrap px-5 py-4 text-slate-500">
                    {item.time}
                  </td>
                  <td className="px-5 py-4 font-medium text-slate-100">
                    {item.alert}
                  </td>
                  <td className="max-w-64 truncate px-5 py-4 text-slate-500">
                    {item.source || "Live Camera"}
                  </td>
                  <td className="px-5 py-4 text-slate-300">
                    {String(item.source || "").startsWith("Crowd Density Detection")
                      ? "—"
                      : item.people}
                  </td>
                  <td className="px-5 py-4 text-slate-300">{item.action || item.emotion || "Unknown"}</td>
                  <td className="px-5 py-4">
                    <span className="rounded-full border border-rose-400/20 bg-rose-400/10 px-2.5 py-1 text-xs font-medium text-rose-300">
                      {item.risk}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex justify-end gap-2">
                      <a
                        href={`${BACKEND_BASE_URL}/${item.image}`}
                        target="_blank"
                        rel="noreferrer"
                        className="grid h-9 w-9 place-items-center rounded-lg border border-slate-700 text-slate-400 transition hover:bg-slate-800 hover:text-cyan-300"
                        title="View snapshot"
                      >
                        <Eye size={16} />
                      </a>
                      <button
                        type="button"
                        onClick={() => handleDelete(item)}
                        className="grid h-9 w-9 place-items-center rounded-lg border border-rose-400/20 text-rose-400 transition hover:bg-rose-400/10"
                        title="Delete alert"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredAlerts.length === 0 && (
          <div className="px-6 py-16 text-center">
            <p className="font-medium text-slate-300">No matching alerts</p>
            <p className="mt-2 text-sm text-slate-600">
              Change the search or source filter to see more records.
            </p>
          </div>
        )}
      </section>
    </>
  );
}
