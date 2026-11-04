import {
  ArcElement,
  Chart as ChartJS,
  Tooltip,
  Legend
} from "chart.js";

import { Doughnut } from "react-chartjs-2";
import { useEffect, useState } from "react";
import { getDashboardStats } from "../../services/dashboardService";

ChartJS.register(
  ArcElement,
  Tooltip,
  Legend
);

export default function EmotionChart() {

  const [emotion, setEmotion] = useState("Neutral");

  useEffect(() => {

    async function loadEmotion() {

      try {

        const data = await getDashboardStats();

        setEmotion(data.emotion);

      } catch (err) {

        console.error(err);

      }

    }

    loadEmotion();

    const timer = setInterval(loadEmotion, 2000);

    return () => clearInterval(timer);

  }, []);

  const colors = {
    Happy: "#22c55e",
    Neutral: "#3b82f6",
    Fear: "#f59e0b",
    Angry: "#ef4444"
  };

  const chartData = {

    labels: [emotion, "Remaining"],

    datasets: [

      {

        data: [100, 0],

        backgroundColor: [
          colors[emotion] || "#3b82f6",
          "#1e293b"
        ],

        borderWidth: 0

      }

    ]

  };

  return (

    <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6">

      <h2 className="text-xl font-semibold mb-5">

        Current Emotion

      </h2>

      <div className="h-72">

        <Doughnut
          data={chartData}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            cutout: "70%",
            plugins: {
              legend: {
                position: "bottom",
                labels: {
                  color: "white"
                }
              }
            }
          }}
        />

      </div>

      <div className="text-center mt-4 text-xl font-bold text-cyan-400">
        {emotion}
      </div>

    </div>

  );

}