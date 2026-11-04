import { ShieldAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";

import { getRecommendation } from "../../services/recommendationService";

export default function RecommendationCard() {
  const [risk, setRisk] = useState("Safe");
  const [tips, setTips] = useState([]);
  const previousRisk = useRef("");

  useEffect(() => {
    async function loadRecommendation() {
      try {
        const data = await getRecommendation();
        setRisk(data.risk);
        setTips(data.recommendations || []);

        if (previousRisk.current && previousRisk.current !== data.risk) {
          if (data.risk === "Danger") toast.error("High crowd risk detected.");
          if (data.risk === "Warning") toast("Crowd level is increasing.");
          if (data.risk === "Safe") toast.success("Crowd status returned to safe.");
        }

        previousRisk.current = data.risk;
      } catch (error) {
        console.error("Recommendation request failed:", error);
      }
    }

    loadRecommendation();
    const timer = window.setInterval(loadRecommendation, 3000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <section className="rounded-2xl border border-slate-800 bg-[#0c1728] p-5">
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-violet-400/10 text-violet-300">
          <ShieldAlert size={20} />
        </div>
        <div>
          <h2 className="font-semibold text-white">AI recommendation</h2>
          <p className="text-xs text-slate-500">Current risk: {risk}</p>
        </div>
      </div>

      <div className="mt-5 space-y-3">
        {tips.length === 0 ? (
          <p className="text-sm text-slate-500">No recommendation available.</p>
        ) : (
          tips.map((tip, index) => (
            <div
              key={`${tip}-${index}`}
              className="flex gap-3 rounded-xl border border-slate-800 bg-slate-900/45 p-3"
            >
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-300" />
              <p className="text-sm leading-6 text-slate-400">{tip}</p>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
