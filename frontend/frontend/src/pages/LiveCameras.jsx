import {
  Activity,
  Gauge,
  Move,
  Radio,
  ShieldAlert,
  Users,
  Waves,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import StatCard from "../components/cards/StatCard";
import PageHeader from "../components/common/PageHeader";
import LiveCamera from "../components/dashboard/LiveCamera";
import RecommendationCard from "../components/dashboard/RecommendationCard";
import useDashboardStats from "../hooks/useDashboardStats";
import { playAlarm, stopAlarm } from "../services/alertService";
import { getCameraStatus, setCameraMode, startCamera, stopCamera } from "../services/cameraService";
import { getSettings } from "../services/settingsService";

const modeInfo = {
  behavior: { title: "Behavior Analysis", detail: "Action tracking is independent from the configured crowd limit." },
  density: { title: "Crowd Density", detail: "Visual occupancy is rendered as a live heat-wave / heatmap overlay." },
  "head-count": { title: "Head Count", detail: "Count-only detection uses Settings > Crowd limit for alerts." },
};

export default function LiveCameras() {
  const { stats, error, refresh } = useDashboardStats(900);
  const [alarmEnabled, setAlarmEnabled] = useState(false);
  const [crowdLimit, setCrowdLimit] = useState(1);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraBusy, setCameraBusy] = useState(false);
  const [modeBusy, setModeBusy] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [mode, setMode] = useState("behavior");
  const wasAlarmCondition = useRef(false);
  const modeRequestRef = useRef(0);

  useEffect(() => {
    let pageMounted = true;
    async function loadCameraPage() {
      try {
        const [settings, cameraStatus] = await Promise.all([getSettings(), getCameraStatus()]);
        if (!pageMounted) return;
        setAlarmEnabled(Boolean(settings.alarm_enabled));
        setCrowdLimit(Math.max(Number(settings.crowd_limit) || 1, 1));
        setCameraOn(Boolean(cameraStatus.active));
        setMode(cameraStatus.mode || "behavior");
      } catch (requestError) {
        if (pageMounted) console.error("Could not load camera page settings:", requestError);
      }
    }
    loadCameraPage();
    return () => {
      pageMounted = false;
      stopAlarm();
      stopCamera().catch((requestError) => console.error("Could not stop camera during page cleanup:", requestError));
    };
  }, []);

  useEffect(() => {
    const people = Number(stats.people) || 0;
    const currentRisk = String(stats.risk || "Safe");
    let alarmCondition = false;
    if (cameraOn) {
      alarmCondition = mode === "head-count" ? people >= crowdLimit : ["Warning", "Danger"].includes(currentRisk);
    }
    if (!cameraOn || !alarmEnabled) {
      stopAlarm();
      wasAlarmCondition.current = false;
      return;
    }
    if (alarmCondition && !wasAlarmCondition.current) playAlarm();
    if (!alarmCondition) stopAlarm();
    wasAlarmCondition.current = alarmCondition;
  }, [alarmEnabled, cameraOn, crowdLimit, mode, stats.people, stats.risk]);

  async function handleCameraToggle() {
    if (cameraBusy || modeBusy) return;
    setCameraBusy(true);
    setCameraError("");
    try {
      if (cameraOn) {
        await stopCamera();
        setCameraOn(false);
        stopAlarm();
        wasAlarmCondition.current = false;
      } else {
        const result = await startCamera(mode);
        setCameraOn(Boolean(result.active));
        if (result.mode) setMode(result.mode);
      }
      await refresh();
    } catch (requestError) {
      setCameraOn(false);
      setCameraError(requestError.response?.data?.message || "The camera operation could not be completed.");
    } finally {
      setCameraBusy(false);
    }
  }

  async function handleModeChange(nextMode) {
    if (!modeInfo[nextMode] || nextMode === mode || cameraBusy) return;

    // When the camera is off the mode selector is a pure UI choice.
    // Do not put the selector into a busy/disabled state just to choose a mode.
    if (!cameraOn) {
      setCameraError("");
      stopAlarm();
      wasAlarmCondition.current = false;
      setMode(nextMode);
      return;
    }

    // While live, switch optimistically so the selected tab responds immediately.
    // The request id prevents an older response from overwriting a newer click.
    const previousMode = mode;
    const requestId = ++modeRequestRef.current;
    setMode(nextMode);
    setModeBusy(true);
    setCameraError("");
    stopAlarm();
    wasAlarmCondition.current = false;

    try {
      const result = await setCameraMode(nextMode);
      if (requestId !== modeRequestRef.current) return;
      setMode(result.mode || nextMode);
      await refresh();
    } catch (requestError) {
      if (requestId !== modeRequestRef.current) return;
      setMode(previousMode);
      setCameraError(requestError.response?.data?.message || "Could not switch analysis mode. Check that the backend is running on port 5000.");
    } finally {
      if (requestId === modeRequestRef.current) setModeBusy(false);
    }
  }

  const visibleStats = cameraOn ? stats : {
    ...stats,
    people: 0,
    density: mode === "behavior" ? "Behavior Only" : "Low",
    density_score: 0,
    congestion: "Normal",
    hot_zones: 0,
    action: "No Person",
    risk: "Safe",
    alert: "Camera Off",
  };

  const cards = useMemo(() => {
    if (mode === "density") {
      return [
        { title: "Visual density index", value: `${Number(visibleStats.density_score || 0).toFixed(1)}%`, icon: Gauge, tone: "cyan", caption: "Visual occupancy, not people/m²" },
        { title: "Density level", value: visibleStats.density || "Low", icon: Waves, tone: visibleStats.density === "Critical" ? "rose" : visibleStats.density === "High" ? "amber" : "emerald", caption: "Heat-wave intensity" },
        { title: "Congestion", value: visibleStats.congestion || "Normal", icon: Activity, tone: "amber", caption: `${Number(visibleStats.hot_zones || 0)} hot zones` },
        { title: "Risk level", value: visibleStats.risk, icon: ShieldAlert, tone: visibleStats.risk === "Danger" ? "rose" : visibleStats.risk === "Warning" ? "amber" : "emerald", caption: visibleStats.alert },
      ];
    }
    if (mode === "head-count") {
      const people = Number(visibleStats.people) || 0;
      return [
        { title: "Current head count", value: people, icon: Users, tone: "cyan", caption: cameraOn ? "Count-only YOLO detection" : "Camera is off" },
        { title: "Crowd limit", value: crowdLimit, icon: Gauge, tone: "amber", caption: "Synced from Settings" },
        { title: "Remaining capacity", value: Math.max(crowdLimit - people, 0), icon: Activity, tone: people >= crowdLimit ? "rose" : "emerald", caption: people >= crowdLimit ? "Limit reached" : "Before alert threshold" },
        { title: "Risk level", value: visibleStats.risk, icon: ShieldAlert, tone: visibleStats.risk === "Danger" ? "rose" : "emerald", caption: visibleStats.alert },
      ];
    }
    return [
      { title: "Tracked people", value: visibleStats.people, icon: Users, tone: "cyan", caption: "Context only — not an alert threshold" },
      { title: "Current action", value: visibleStats.action, icon: Move, tone: "amber", caption: "Stationary / Walking / Running" },
      { title: "Count rule", value: "Ignored", icon: Gauge, tone: "emerald", caption: "Behavior is not linked to Crowd limit" },
      { title: "Behavior risk", value: visibleStats.risk, icon: ShieldAlert, tone: visibleStats.risk === "Warning" ? "amber" : visibleStats.risk === "Danger" ? "rose" : "emerald", caption: visibleStats.alert },
    ];
  }, [cameraOn, crowdLimit, mode, visibleStats]);

  return (
    <>
      <PageHeader eyebrow="Live monitoring" title="Live Camera Analysis" description="Use one camera with three independent analysis modes: Behavior Analysis, Crowd Density heatmap, and Head Count. Only Head Count is linked to the configured crowd limit." />

      {(error || cameraError) && <div className="mb-6 rounded-xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-300">{cameraError || error}</div>}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => <StatCard key={card.title} {...card} />)}
      </section>

      <div className="mt-6 grid grid-cols-1 gap-6 2xl:grid-cols-[1.6fr_0.7fr]">
        <LiveCamera cameraOn={cameraOn} cameraBusy={cameraBusy} modeBusy={modeBusy} mode={mode} onToggle={handleCameraToggle} onModeChange={handleModeChange} />

        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-800 bg-[#0c1728] p-5">
            <div className="flex items-center gap-3">
              <div className={`grid h-10 w-10 place-items-center rounded-xl ${cameraOn ? "bg-emerald-400/10 text-emerald-300" : "bg-slate-800 text-slate-500"}`}><Radio size={20} /></div>
              <div><h2 className="font-semibold text-white">Camera health</h2><p className="text-xs text-slate-500">Local camera index 0</p></div>
            </div>
            <div className="mt-5 space-y-4 text-sm">
              <div className="flex justify-between border-b border-slate-800 pb-3"><span className="text-slate-500">Monitoring</span><span className={`font-medium ${cameraOn ? "text-emerald-300" : "text-slate-400"}`}>{cameraOn ? "Running" : "Stopped"}</span></div>
              <div className="flex justify-between border-b border-slate-800 pb-3"><span className="text-slate-500">Active analysis</span><span className="text-right font-medium text-cyan-200">{modeInfo[mode].title}</span></div>
              <div className="border-b border-slate-800 pb-3"><span className="text-slate-500">Mode rule</span><p className="mt-1 text-xs leading-5 text-slate-400">{modeInfo[mode].detail}</p></div>
              <div className="flex justify-between"><span className="text-slate-500">Browser alarm</span><span className="font-medium text-slate-200">{alarmEnabled ? "Enabled" : "Disabled"}</span></div>
            </div>
          </section>

          <section className={`rounded-2xl border p-5 ${!cameraOn ? "border-slate-800 bg-slate-900/50" : visibleStats.risk === "Danger" ? "border-rose-400/25 bg-rose-400/10" : visibleStats.risk === "Warning" ? "border-amber-400/25 bg-amber-400/10" : "border-emerald-400/20 bg-emerald-400/10"}`}>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Current AI alert</p>
            <h2 className="mt-2 text-lg font-semibold text-white">{visibleStats.alert}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              {cameraOn ? mode === "head-count" ? `The alert threshold is ${crowdLimit} people and stays synced with Settings.` : mode === "density" ? "Density risk comes from visual occupancy and congestion, not the head-count threshold." : "Behavior risk is based on movement behavior and never uses the head-count threshold." : "No frames are being captured or analyzed while the camera is off."}
            </p>
          </section>

          <RecommendationCard />
        </div>
      </div>
    </>
  );
}
