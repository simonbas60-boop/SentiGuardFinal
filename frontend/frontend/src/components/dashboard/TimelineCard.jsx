import { Clock3 } from "lucide-react";
import { useEffect, useState } from "react";

import { getTimeline } from "../../services/timelineService";

function riskStyle(risk) {
  if (risk === "Danger") return "bg-rose-400";
  if (risk === "Warning") return "bg-amber-400";
  return "bg-emerald-400";
}

export default function TimelineCard() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    async function loadTimeline() {
      try {
        setItems(await getTimeline());
      } catch (error) {
        console.error("Timeline request failed:", error);
      }
    }

    loadTimeline();
    const timer = window.setInterval(loadTimeline, 5000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <section className="rounded-2xl border border-slate-800 bg-[#0c1728] p-5">
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-cyan-400/10 text-cyan-300">
          <Clock3 size={20} />
        </div>
        <div>
          <h2 className="font-semibold text-white">Incident timeline</h2>
          <p className="text-xs text-slate-500">Latest 10 saved alert events</p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {items.length === 0 ? (
          <p className="text-sm text-slate-500">No incidents recorded.</p>
        ) : (
          items.map((item, index) => (
            <div
              key={`${item.time}-${index}`}
              className="flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-900/45 p-4"
            >
              <span
                className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${riskStyle(
                  item.risk,
                )}`}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-slate-200">{item.risk}</p>
                  <time className="text-xs text-slate-600">{item.time}</time>
                </div>
                <p className="mt-1 text-sm text-slate-500">
                  {item.people} people · {item.action || item.emotion || "Unknown"}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
