import {
  Activity,
  ArrowUpRight,
  BellRing,
  Move,
  Camera,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import StatCard from "../components/cards/StatCard";
import CrowdChart from "../components/charts/CrowdChart";
import PageHeader from "../components/common/PageHeader";
import RecommendationCard from "../components/dashboard/RecommendationCard";
import TimelineCard from "../components/dashboard/TimelineCard";
import useDashboardStats from "../hooks/useDashboardStats";
import { getAlerts } from "../services/alertService";
import { getAnalytics } from "../services/analyticsService";

const initialAnalytics = {
  people_today: 0,
  high_alerts: 0,
  average_people: 0,
  dominant_action: "No Data",
};

function riskClasses(risk) {
  if (risk === "Danger") {
    return "border-rose-400/20 bg-rose-400/10 text-rose-300";
  }
  if (risk === "Warning") {
    return "border-amber-400/20 bg-amber-400/10 text-amber-300";
  }
  return "border-emerald-400/20 bg-emerald-400/10 text-emerald-300";
}

export default function Dashboard() {
  const { stats, error } = useDashboardStats();
  const [analytics, setAnalytics] = useState(initialAnalytics);
  const [recentAlerts, setRecentAlerts] = useState([]);

  useEffect(() => {
    async function loadOverview() {
      try {
        const [analyticsData, alertsData] = await Promise.all([
          getAnalytics(),
          getAlerts(),
        ]);
        setAnalytics(analyticsData);
        setRecentAlerts(alertsData.slice(0, 5));
      } catch (requestError) {
        console.error("Dashboard overview request failed:", requestError);
      }
    }

    loadOverview();
    const timer = window.setInterval(loadOverview, 5000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <>
      <PageHeader
        eyebrow="Control center"
        title="Monitoring overview"
        description="A clean operational summary of live crowd activity, AI findings, and recent security events."
        actions={
          <>
            <Link
              to="/live-cameras"
              className="inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
            >
              <Camera size={17} /> Open live camera
            </Link>
            <Link
              to="/video-analysis"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:border-slate-600 hover:bg-slate-800"
            >
              Analyze video <ArrowUpRight size={16} />
            </Link>
          </>
        }
      />

      {error && (
        <div className="mb-6 rounded-xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Current people"
          value={stats.people}
          icon={Users}
          tone="cyan"
          caption="Live camera detection"
        />
        <StatCard
          title="Crowd density"
          value={stats.density}
          icon={Activity}
          tone="emerald"
          caption={`Limit status: ${stats.risk}`}
        />
        <StatCard
          title="Current action"
          value={stats.action}
          icon={Move}
          tone="amber"
          caption="YOLO motion tracking"
        />
        <StatCard
          title="High alerts today"
          value={analytics.high_alerts}
          icon={BellRing}
          tone="rose"
          caption="Saved security incidents"
        />
      </section>

      <section
        className={`mt-6 flex flex-col gap-4 rounded-2xl border p-5 sm:flex-row sm:items-center sm:justify-between ${riskClasses(
          stats.risk,
        )}`}
      >
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 shrink-0" size={22} />
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] opacity-75">
              Current system decision
            </p>
            <h2 className="mt-1 text-lg font-semibold">{stats.alert}</h2>
            <p className="mt-1 text-sm opacity-75">
              Source: {stats.source || "Live Camera"} · Risk level: {stats.risk}
            </p>
          </div>
        </div>
        <span className="flex items-center gap-2 text-sm font-medium">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-current" />
          Live monitoring active
        </span>
      </section>

      <div className="mt-6 grid grid-cols-1 gap-6 2xl:grid-cols-[1.45fr_0.85fr]">
        <CrowdChart history={stats.history || []} />

        <section className="rounded-2xl border border-slate-800 bg-[#0c1728] p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-white">Today at a glance</h2>
              <p className="mt-1 text-xs text-slate-500">
                Summary from saved AI alerts
              </p>
            </div>
          </div>

          <div className="mt-5 divide-y divide-slate-800">
            {[
              ["Total detections", analytics.people_today],
              ["Average crowd", analytics.average_people],
              ["Dominant action", analytics.dominant_action],
              ["Current risk", stats.risk],
            ].map(([label, value]) => (
              <div
                key={label}
                className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0"
              >
                <span className="text-sm text-slate-500">{label}</span>
                <span className="text-sm font-semibold text-slate-100">
                  {value}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section className="overflow-hidden rounded-2xl border border-slate-800 bg-[#0c1728]">
          <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
            <div>
              <h2 className="font-semibold text-white">Recent alerts</h2>
              <p className="mt-1 text-xs text-slate-500">
                Latest saved incidents from all video sources
              </p>
            </div>
            <Link
              to="/alerts"
              className="text-sm font-medium text-cyan-300 hover:text-cyan-200"
            >
              View all
            </Link>
          </div>

          <div className="divide-y divide-slate-800">
            {recentAlerts.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-slate-500">
                No alerts have been recorded.
              </p>
            ) : (
              recentAlerts.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-4 px-5 py-4"
                >
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-rose-400" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-100">
                      {item.alert}
                    </p>
                    <p className="mt-1 truncate text-xs text-slate-500">
                      {item.source || "Live Camera"} · {item.people} people · {item.action || item.emotion || "Unknown"}
                    </p>
                  </div>
                  <time className="hidden text-xs text-slate-600 sm:block">
                    {item.time}
                  </time>
                </div>
              ))
            )}
          </div>
        </section>

        <RecommendationCard />
      </div>

      <div className="mt-6">
        <TimelineCard />
      </div>
    </>
  );
}
