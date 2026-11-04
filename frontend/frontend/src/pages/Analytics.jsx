import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  Tooltip,
} from "chart.js";
import { Bar, Doughnut } from "react-chartjs-2";
import {
  Activity,
  BellRing,
  Move,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import StatCard from "../components/cards/StatCard";
import CrowdChart from "../components/charts/CrowdChart";
import PageHeader from "../components/common/PageHeader";
import useDashboardStats from "../hooks/useDashboardStats";
import { getAlerts } from "../services/alertService";
import { getAnalytics } from "../services/analyticsService";

ChartJS.register(
  ArcElement,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
);

const initialSummary = {
  people_today: 0,
  high_alerts: 0,
  average_people: 0,
  dominant_action: "No Data",
};

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      labels: { color: "#94a3b8", usePointStyle: true, boxWidth: 10 },
    },
  },
  scales: {
    x: {
      ticks: { color: "#64748b" },
      grid: { display: false },
    },
    y: {
      beginAtZero: true,
      ticks: { color: "#64748b", precision: 0 },
      grid: { color: "rgba(51, 65, 85, 0.35)" },
    },
  },
};

export default function Analytics() {
  const { stats } = useDashboardStats();
  const [summary, setSummary] = useState(initialSummary);
  const [alerts, setAlerts] = useState([]);

  useEffect(() => {
    async function loadAnalytics() {
      try {
        const [summaryData, alertData] = await Promise.all([
          getAnalytics(),
          getAlerts(),
        ]);
        setSummary(summaryData);
        setAlerts(alertData);
      } catch (error) {
        console.error("Analytics request failed:", error);
      }
    }

    loadAnalytics();
    const timer = window.setInterval(loadAnalytics, 5000);
    return () => window.clearInterval(timer);
  }, []);

  const actionData = useMemo(() => {
    const counts = alerts.reduce((result, item) => {
      const action = item.action || item.emotion || "Unknown";
      result[action] = (result[action] || 0) + 1;
      return result;
    }, {});

    const labels = Object.keys(counts);
    return {
      labels: labels.length ? labels : ["No data"],
      datasets: [
        {
          data: labels.length ? Object.values(counts) : [1],
          backgroundColor: [
            "#22d3ee",
            "#34d399",
            "#fbbf24",
            "#fb7185",
            "#a78bfa",
            "#60a5fa",
            "#f472b6",
          ],
          borderColor: "#0c1728",
          borderWidth: 4,
        },
      ],
    };
  }, [alerts]);

  const sourceData = useMemo(() => {
    const counts = alerts.reduce((result, item) => {
      const source = String(item.source || "Live Camera").startsWith(
        "Uploaded Video",
      )
        ? "Uploaded videos"
        : "Live camera";
      result[source] = (result[source] || 0) + 1;
      return result;
    }, {});

    return {
      labels: ["Live camera", "Uploaded videos"],
      datasets: [
        {
          label: "Alerts",
          data: [counts["Live camera"] || 0, counts["Uploaded videos"] || 0],
          backgroundColor: ["rgba(34, 211, 238, .65)", "rgba(167, 139, 250, .65)"],
          borderRadius: 8,
        },
      ],
    };
  }, [alerts]);

  return (
    <>
      <PageHeader
        eyebrow="AI insights"
        title="Crowd analytics"
        description="Review live detection trends and compare alert patterns from camera feeds and imported CCTV recordings."
      />

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="People today"
          value={summary.people_today}
          icon={Users}
          tone="cyan"
          caption="Total people in saved incidents"
        />
        <StatCard
          title="Average crowd"
          value={summary.average_people}
          icon={Activity}
          tone="emerald"
          caption="Per recorded alert"
        />
        <StatCard
          title="High alerts"
          value={summary.high_alerts}
          icon={BellRing}
          tone="rose"
          caption="Danger-level events"
        />
        <StatCard
          title="Top action"
          value={summary.dominant_action}
          icon={Move}
          tone="amber"
          caption="Most common tracked action"
        />
      </section>

      <div className="mt-6 grid grid-cols-1 gap-6 2xl:grid-cols-[1.4fr_0.8fr]">
        <CrowdChart history={stats.history || []} title="Real-time crowd movement" />

        <section className="rounded-2xl border border-slate-800 bg-[#0c1728] p-5">
          <h2 className="font-semibold text-white">Action distribution</h2>
          <p className="mt-1 text-xs text-slate-500">
            Based on saved alert records
          </p>
          <div className="mt-5 h-72">
            <Doughnut
              data={actionData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                cutout: "68%",
                plugins: {
                  legend: {
                    position: "bottom",
                    labels: {
                      color: "#94a3b8",
                      usePointStyle: true,
                      boxWidth: 10,
                      padding: 18,
                    },
                  },
                },
              }}
            />
          </div>
        </section>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <section className="rounded-2xl border border-slate-800 bg-[#0c1728] p-5">
          <h2 className="font-semibold text-white">Alerts by source</h2>
          <p className="mt-1 text-xs text-slate-500">
            Live camera compared with imported videos
          </p>
          <div className="mt-5 h-72">
            <Bar data={sourceData} options={chartOptions} />
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-800 bg-[#0c1728]">
          <div className="border-b border-slate-800 px-5 py-4">
            <h2 className="font-semibold text-white">Latest analyzed incidents</h2>
            <p className="mt-1 text-xs text-slate-500">
              Most recent alert records used in this report
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="bg-slate-900/60 text-xs uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-5 py-3 font-medium">Time</th>
                  <th className="px-5 py-3 font-medium">Event</th>
                  <th className="px-5 py-3 font-medium">Source</th>
                  <th className="px-5 py-3 font-medium">People</th>
                  <th className="px-5 py-3 font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {alerts.slice(0, 8).map((item) => (
                  <tr key={item.id} className="hover:bg-slate-800/30">
                    <td className="whitespace-nowrap px-5 py-4 text-slate-500">
                      {item.time}
                    </td>
                    <td className="px-5 py-4 font-medium text-slate-200">
                      {item.alert}
                    </td>
                    <td className="max-w-56 truncate px-5 py-4 text-slate-500">
                      {item.source || "Live Camera"}
                    </td>
                    <td className="px-5 py-4 text-slate-300">{item.people}</td>
                    <td className="px-5 py-4 text-slate-300">{item.action || item.emotion || "Unknown"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}
