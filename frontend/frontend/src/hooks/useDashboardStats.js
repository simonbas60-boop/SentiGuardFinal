import { useCallback, useEffect, useState } from "react";

import { getDashboardStats } from "../services/dashboardService";

const initialStats = {
  people: 0,
  density: "Low",
  density_score: 0,
  congestion: "Normal",
  hot_zones: 0,
  risk: "Safe",
  action: "No Person",
  history: [],
  alert: "Normal",
  source: "Live Camera",
  analysis_mode: "behavior",
  crowd_limit: 1,
};

export default function useDashboardStats(interval = 2000) {
  const [stats, setStats] = useState(initialStats);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const data = await getDashboardStats();
      setStats({ ...initialStats, ...data });
      setError("");
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          "Unable to connect to the monitoring backend.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialTimer = window.setTimeout(refresh, 0);
    const timer = window.setInterval(refresh, interval);

    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
  }, [interval, refresh]);

  return { stats, loading, error, refresh };
}
