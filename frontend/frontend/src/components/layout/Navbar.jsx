import { Bell, Menu, Search, UserCircle2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { getAlerts } from "../../services/alertService";

const pageMeta = {
  "/dashboard": ["Dashboard", "System overview and current operating status"],
  "/live-cameras": ["Live Camera Analysis", "Behavior, density heatmap and head-count modes"],
  "/analytics": ["Analytics", "Detection patterns and incident insights"],
  "/video-analysis": ["Crowd Behavior Analysis", "Analyze recorded CCTV crowd behavior and movement"],
  "/crowd-density": ["Crowd Density Detection", "Visual crowd congestion and density monitoring"],
  "/head-count": ["Head Count Detection", "Recorded CCTV count-only analysis linked to crowd limit"],
  "/alerts": ["Alert History", "Review AI-detected security events"],
  "/snapshots": ["Snapshots", "Browse captured incident evidence"],
  "/settings": ["Settings", "Configure AI monitoring behavior"],
};

export default function Navbar({ onMenuClick }) {
  const location = useLocation();
  const navigate = useNavigate();
  const dropdownRef = useRef(null);
  const [alerts, setAlerts] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [readNotifications, setReadNotifications] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("readNotifications") || "[]");
    } catch {
      return [];
    }
  });

  const [title, subtitle] = pageMeta[location.pathname] || [
    "SentiGuard",
    "AI crowd monitoring system",
  ];

  useEffect(() => {
    async function loadAlerts() {
      try {
        setAlerts(await getAlerts());
      } catch (error) {
        console.error("Notification request failed:", error);
      }
    }

    loadAlerts();
    const timer = window.setInterval(loadAlerts, 2000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    localStorage.setItem(
      "readNotifications",
      JSON.stringify(readNotifications),
    );
  }, [readNotifications]);

  useEffect(() => {
    function closeOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowNotifications(false);
      }
    }

    document.addEventListener("mousedown", closeOutside);
    return () => document.removeEventListener("mousedown", closeOutside);
  }, []);

  const unreadCount = alerts.filter(
    (item) => !readNotifications.includes(item.id),
  ).length;

  function openAlert(item) {
    setReadNotifications((current) =>
      current.includes(item.id) ? current : [...current, item.id],
    );
    setShowNotifications(false);
    navigate("/alerts", { state: { selectedAlert: item.id } });
  }

  return (
    <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-[#07111f]/90 backdrop-blur-xl">
      <div className="flex h-20 items-center gap-4 px-4 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={onMenuClick}
          className="rounded-xl border border-slate-800 p-2.5 text-slate-400 hover:bg-slate-800 hover:text-white lg:hidden"
        >
          <Menu size={21} />
        </button>

        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold text-white sm:text-xl">
            {title}
          </h2>
          <p className="hidden truncate text-sm text-slate-500 sm:block">
            {subtitle}
          </p>
        </div>

        

        <div ref={dropdownRef} className="relative">
          <button
            type="button"
            onClick={() => setShowNotifications((current) => !current)}
            className="relative grid h-11 w-11 place-items-center rounded-xl border border-slate-800 bg-slate-900/60 text-slate-400 transition hover:border-slate-700 hover:text-white"
          >
            <Bell size={20} />
            {unreadCount > 0 && (
              <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white ring-2 ring-[#07111f]">
                {Math.min(unreadCount, 99)}
              </span>
            )}
          </button>

          {showNotifications && (
            <div className="absolute right-0 top-14 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-700/80 bg-[#0d1829] shadow-2xl shadow-black/30">
              <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
                <p className="font-semibold text-white">Notifications</p>
                <button
                  type="button"
                  onClick={() => navigate("/alerts")}
                  className="text-xs font-medium text-cyan-300 hover:text-cyan-200"
                >
                  View all
                </button>
              </div>

              <div className="max-h-96 overflow-y-auto p-2">
                {alerts.length === 0 ? (
                  <p className="px-3 py-8 text-center text-sm text-slate-500">
                    No alerts recorded.
                  </p>
                ) : (
                  alerts.slice(0, 6).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => openAlert(item)}
                      className={`w-full rounded-xl px-3 py-3 text-left transition hover:bg-slate-800/80 ${
                        readNotifications.includes(item.id)
                          ? ""
                          : "bg-cyan-400/5"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <span className="mt-1.5 h-2 w-2 rounded-full bg-rose-400" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-slate-100">
                            {item.alert}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {String(item.source || "").startsWith("Crowd Density Detection")
                              ? `${item.action || "Density warning"} · Risk ${item.risk}`
                              : `${item.people} people · ${item.action || item.emotion || "Unknown"}`}
                          </p>
                          <p className="mt-1 truncate text-[11px] text-slate-600">
                            {item.source || "Live Camera"} · {item.time}
                          </p>
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <div className="hidden items-center gap-3 border-l border-slate-800 pl-4 sm:flex">
          <UserCircle2 size={36} className="text-cyan-300" />
          <div className="leading-tight">
            <p className="text-sm font-medium text-slate-100">Administrator</p>
            <p className="mt-1 text-xs text-emerald-400">Online</p>
          </div>
        </div>
      </div>
    </header>
  );
}
