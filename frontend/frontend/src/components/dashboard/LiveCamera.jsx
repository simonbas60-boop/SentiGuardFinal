import {
  Activity,
  Camera,
  LoaderCircle,
  Maximize2,
  Move,
  Power,
  Radio,
  Users,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { getCameraStreamUrl } from "../../services/cameraService";

const modes = [
  { id: "behavior", label: "Behavior Analysis", icon: Move, hint: "Movement / action tracking" },
  { id: "density", label: "Crowd Density", icon: Activity, hint: "Heat-wave density overlay" },
  { id: "head-count", label: "Head Count", icon: Users, hint: "Count-only + crowd limit" },
];

const modeNames = {
  behavior: "Behavior Analysis",
  density: "Crowd Density Heatmap",
  "head-count": "Head Count",
};

export default function LiveCamera({
  cameraOn,
  cameraBusy,
  modeBusy = false,
  mode = "behavior",
  onToggle,
  onModeChange,
  className = "",
}) {
  const containerRef = useRef(null);
  const [streamError, setStreamError] = useState(false);
  const [streamKey, setStreamKey] = useState(Date.now());

  useEffect(() => {
    if (cameraOn) {
      setStreamError(false);
      setStreamKey(Date.now());
    }
  }, [cameraOn, mode]);

  async function openFullscreen() {
    try {
      await containerRef.current?.requestFullscreen?.();
    } catch (error) {
      console.error("Fullscreen failed:", error);
    }
  }

  function retryStream() {
    setStreamError(false);
    setStreamKey(Date.now());
  }

  return (
    <section ref={containerRef} className={`overflow-hidden rounded-2xl border border-slate-800 bg-[#0c1728] ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-cyan-400/10 text-cyan-300"><Camera size={20} /></div>
          <div>
            <h2 className="font-semibold text-white">Camera 01</h2>
            <p className="text-xs text-slate-500">Default local camera source</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${cameraOn ? "border-emerald-400/15 bg-emerald-400/10 text-emerald-300" : "border-slate-700 bg-slate-900 text-slate-400"}`}>
            {cameraOn ? <Wifi size={14} /> : <WifiOff size={14} />}
            {cameraOn ? "Live" : "Offline"}
          </span>

          <button type="button" onClick={onToggle} disabled={cameraBusy || modeBusy} className={`inline-flex min-w-24 items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${cameraOn ? "border border-rose-400/25 bg-rose-400/10 text-rose-300 hover:bg-rose-400/20" : "bg-cyan-400 text-slate-950 hover:bg-cyan-300"}`}>
            {cameraBusy ? <LoaderCircle size={15} className="animate-spin" /> : <Power size={15} />}
            {cameraBusy ? "Please wait" : cameraOn ? "Turn off" : "Turn on"}
          </button>

          <button type="button" onClick={openFullscreen} disabled={!cameraOn} className="rounded-lg border border-slate-700 p-2 text-slate-400 transition hover:bg-slate-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-40" title="Open full screen">
            <Maximize2 size={17} />
          </button>
        </div>
      </div>

      <div className="border-b border-slate-800 bg-slate-950/30 px-4 py-3 sm:px-5">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {modes.map(({ id, label, icon: Icon, hint }) => {
            const selected = mode === id;
            return (
              <button
                key={id}
                type="button"
                aria-pressed={selected}
                data-analysis-mode={id}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onModeChange?.(id);
                }}
                disabled={cameraBusy}
                className={`relative z-10 flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition pointer-events-auto disabled:cursor-not-allowed disabled:opacity-60 ${selected ? "border-cyan-400/50 bg-cyan-400/15 text-cyan-100 ring-1 ring-cyan-400/15" : "border-slate-800 bg-slate-900/70 text-slate-400 hover:border-cyan-400/30 hover:bg-slate-800/90 hover:text-slate-100"}`}
              >
                <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${selected ? "bg-cyan-400/15 text-cyan-300" : "bg-slate-800 text-slate-500"}`}>
                  {modeBusy && selected ? <LoaderCircle size={16} className="animate-spin" /> : <Icon size={16} />}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-xs font-semibold">{label}</span>
                  <span className="mt-0.5 block truncate text-[10px] text-slate-500">{hint}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="relative aspect-video min-h-72 bg-slate-950">
        {cameraOn && !streamError ? (
          <img key={streamKey} src={getCameraStreamUrl(streamKey)} alt={`Live camera processed in ${modeNames[mode] || "AI"} mode`} onError={() => setStreamError(true)} className="h-full w-full object-contain" />
        ) : cameraOn && streamError ? (
          <div className="absolute inset-0 grid place-items-center p-8 text-center">
            <div>
              <Camera className="mx-auto text-slate-700" size={44} />
              <p className="mt-4 font-medium text-slate-300">Live stream connection failed</p>
              <p className="mt-2 text-sm text-slate-600">Check the backend and camera, then retry the stream.</p>
              <button type="button" onClick={retryStream} className="mt-5 rounded-xl bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950">Retry stream</button>
            </div>
          </div>
        ) : (
          <div className="absolute inset-0 grid place-items-center p-8 text-center">
            <div>
              <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl border border-slate-800 bg-slate-900 text-slate-600"><Power size={28} /></div>
              <p className="mt-5 font-medium text-slate-300">Camera monitoring is off</p>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">Select one of the three analysis modes above, then turn the camera on. Head Count uses the Settings crowd limit; Behavior Analysis does not.</p>
            </div>
          </div>
        )}

        {cameraOn && (
          <div className="pointer-events-none absolute left-4 top-4 flex items-center gap-2 rounded-lg bg-slate-950/80 px-3 py-1.5 text-xs font-medium text-white backdrop-blur">
            <Radio size={13} className="text-rose-400" /> LIVE · {modeNames[mode]?.toUpperCase() || "AI DETECTION"}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 px-5 py-3 text-xs text-slate-500">
        <span>Source: Camera index 0</span>
        <span>{cameraOn ? `Active mode: ${modeNames[mode]}` : "Detection engine stopped"}</span>
      </div>
    </section>
  );
}
