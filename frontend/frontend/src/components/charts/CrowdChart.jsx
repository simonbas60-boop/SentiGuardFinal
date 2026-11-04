import {
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from "chart.js";
import { Line } from "react-chartjs-2";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler,
);

export default function CrowdChart({ history = [], title = "Live Crowd Trend" }) {
  const data = {
    labels: history.map((_, index) => index + 1),
    datasets: [
      {
        label: "People count",
        data: history,
        borderColor: "#22d3ee",
        backgroundColor: "rgba(34, 211, 238, 0.08)",
        fill: true,
        tension: 0.35,
        pointRadius: 2,
        pointHoverRadius: 5,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { intersect: false, mode: "index" },
    plugins: {
      legend: {
        labels: { color: "#94a3b8", boxWidth: 10, usePointStyle: true },
      },
    },
    scales: {
      x: {
        ticks: { color: "#64748b" },
        grid: { color: "rgba(51, 65, 85, 0.35)" },
      },
      y: {
        beginAtZero: true,
        ticks: { color: "#64748b", precision: 0 },
        grid: { color: "rgba(51, 65, 85, 0.35)" },
      },
    },
  };

  return (
    <section className="rounded-2xl border border-slate-800 bg-[#0c1728] p-5">
      <div className="mb-5">
        <h2 className="font-semibold text-white">{title}</h2>
        <p className="mt-1 text-xs text-slate-500">Latest 20 detection samples</p>
      </div>
      <div className="h-72">
        <Line data={data} options={options} />
      </div>
    </section>
  );
}
