import {
  Activity,
  FileVideo2,
  Gauge,
  RotateCcw,
  ShieldAlert,
  Square,
  UploadCloud,
  Users,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";

import StatCard from "../components/cards/StatCard";
import PageHeader from "../components/common/PageHeader";
import { deleteHeadCountSession, getHeadCountStatus, getHeadCountStreamUrl, stopHeadCountAnalysis, uploadHeadCountVideo } from "../services/headCountService";
import { playAlertOnce, stopAlertSound, unlockAlarm } from "../services/alertService";
import { getSettings } from "../services/settingsService";

const acceptedVideoTypes = ".mp4,.avi,.mov,.mkv,.m4v,.webm";

function formatDuration(seconds) {
  const safeSeconds = Number(seconds || 0);
  const minutes = Math.floor(safeSeconds / 60);
  const remaining = Math.floor(safeSeconds % 60);
  return `${minutes}:${String(remaining).padStart(2, "0")}`;
}

function statusStyle(status) {
  if (status === "completed") return "border-emerald-400/20 bg-emerald-400/10 text-emerald-300";
  if (status === "failed") return "border-rose-400/20 bg-rose-400/10 text-rose-300";
  if (status === "analyzing") return "border-cyan-400/20 bg-cyan-400/10 text-cyan-300";
  if (status === "stopped") return "border-amber-400/20 bg-amber-400/10 text-amber-300";
  return "border-slate-700 bg-slate-800/70 text-slate-300";
}

export default function HeadCount() {
  const inputRef = useRef(null);
  const lastAlertSequenceRef = useRef(0);
  const [selectedFile, setSelectedFile] = useState(null);
  const [session, setSession] = useState(null);
  const [streamUrl, setStreamUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [alarmEnabled, setAlarmEnabled] = useState(true);
  const [configuredLimit, setConfiguredLimit] = useState(1);

  useEffect(() => {
    let mounted = true;
    getSettings().then((settings) => {
      if (!mounted) return;
      setAlarmEnabled(Boolean(settings.alarm_enabled));
      setConfiguredLimit(Math.max(Number(settings.crowd_limit) || 1, 1));
    }).catch((error) => console.error("Could not load head-count settings:", error));
    return () => { mounted = false; stopAlertSound(); };
  }, []);

  useEffect(() => {
    if (!session?.id) return undefined;
    async function refreshStatus() {
      try {
        const data = await getHeadCountStatus(session.id);
        setSession(data);
        setConfiguredLimit(Math.max(Number(data.crowd_limit) || 1, 1));
        const nextSequence = Number(data.alert_sequence || 0);
        if (nextSequence > Number(lastAlertSequenceRef.current || 0)) {
          if (alarmEnabled) await playAlertOnce();
          toast.error(`${data.last_alert || "Head Count Limit Reached"}. ${data.people} people detected; limit ${data.crowd_limit}.`, { duration: 4500 });
        }
        lastAlertSequenceRef.current = nextSequence;
      } catch (error) {
        console.error("Head-count status request failed:", error);
      }
    }
    refreshStatus();
    const timer = window.setInterval(refreshStatus, 600);
    return () => window.clearInterval(timer);
  }, [alarmEnabled, session?.id]);

  function chooseFile(file) {
    if (!file) return;
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (!["mp4", "avi", "mov", "mkv", "m4v", "webm"].includes(extension)) {
      toast.error("Choose an MP4, AVI, MOV, MKV, M4V or WEBM file.");
      return;
    }
    setSelectedFile(file);
  }

  async function handleUpload() {
    if (!selectedFile) return toast.error("Choose a CCTV video first.");
    if (alarmEnabled) await unlockAlarm();
    stopAlertSound();
    lastAlertSequenceRef.current = 0;
    setUploading(true);
    setUploadProgress(0);
    try {
      const createdSession = await uploadHeadCountVideo(selectedFile, setUploadProgress);
      setSession(createdSession);
      setConfiguredLimit(Math.max(Number(createdSession.crowd_limit) || 1, 1));
      setStreamUrl(getHeadCountStreamUrl(createdSession.id));
      toast.success("Video uploaded. Head-count analysis started.");
    } catch (error) {
      toast.error(error.response?.data?.message || "Video upload could not be completed.");
    } finally {
      setUploading(false);
    }
  }

  async function handleStop() {
    if (!session?.id) return;
    try {
      await stopHeadCountAnalysis(session.id);
      stopAlertSound();
      setStreamUrl("");
      toast.success("Head-count stop requested.");
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not stop analysis.");
    }
  }

  async function handleReset() {
    try { if (session?.id) await deleteHeadCountSession(session.id); } catch (error) { console.error("Head-count session cleanup failed:", error); }
    stopAlertSound();
    lastAlertSequenceRef.current = 0;
    setSession(null);
    setSelectedFile(null);
    setStreamUrl("");
    setUploadProgress(0);
    if (inputRef.current) inputRef.current.value = "";
  }

  const isActive = session?.status === "analyzing" || session?.status === "ready";
  const people = Number(session?.people || 0);
  const currentLimit = Math.max(Number(session?.crowd_limit || configuredLimit) || 1, 1);

  return (
    <>
      <PageHeader eyebrow="Recorded CCTV count-only monitoring" title="Head Count Detection" description="Upload recorded CCTV video for person counting only. This page is linked to Settings > Crowd limit; Behavior Analysis is kept separate from this threshold." />

      <div className="mb-6 rounded-2xl border border-cyan-400/20 bg-cyan-400/8 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div><p className="text-sm font-semibold text-cyan-200">Crowd-limit connection</p><p className="mt-1 text-sm leading-6 text-slate-400">An alert is generated when the detected head count reaches the configured limit. The same limit is used by Live Camera → Head Count.</p></div>
          <div className="rounded-xl border border-cyan-400/20 bg-slate-950/40 px-5 py-3 text-center"><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Current limit</p><p className="mt-1 text-2xl font-semibold text-cyan-200">{currentLimit}</p></div>
        </div>
      </div>

      {!session && (
        <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-2xl border border-slate-800 bg-[#0c1728] p-6">
            <div onDragEnter={(event) => { event.preventDefault(); setDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); chooseFile(event.dataTransfer.files?.[0]); }} className={`grid min-h-80 place-items-center rounded-2xl border-2 border-dashed p-8 text-center transition ${dragging ? "border-cyan-300 bg-cyan-400/10" : "border-slate-700 bg-slate-950/25"}`}>
              <div>
                <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-cyan-400/10 text-cyan-300"><Users size={30} /></div>
                <h2 className="mt-5 text-xl font-semibold text-white">Import CCTV video</h2>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">MP4, AVI, MOV, MKV, M4V and WEBM are supported. Dense person detection is used for count-only analysis.</p>
                <input ref={inputRef} type="file" accept={acceptedVideoTypes} onChange={(event) => chooseFile(event.target.files?.[0])} className="hidden" />
                <button type="button" onClick={() => inputRef.current?.click()} className="mt-5 inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-cyan-400/30 hover:text-cyan-200"><FileVideo2 size={17} /> Choose file</button>
                {selectedFile && <div className="mx-auto mt-5 max-w-md rounded-xl border border-slate-800 bg-slate-900/70 p-4 text-left"><p className="truncate text-sm font-medium text-slate-200">{selectedFile.name}</p><p className="mt-1 text-xs text-slate-500">{(selectedFile.size / 1024 / 1024).toFixed(1)} MB</p></div>}
                <button type="button" disabled={!selectedFile || uploading} onClick={handleUpload} className="mt-5 inline-flex min-w-48 items-center justify-center gap-2 rounded-xl bg-cyan-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-40"><UploadCloud size={17} />{uploading ? `Uploading ${uploadProgress}%` : "Upload and count"}</button>
              </div>
            </div>
          </div>

          <aside className="rounded-2xl border border-slate-800 bg-[#0c1728] p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-400">Processing flow</p><h2 className="mt-2 text-xl font-semibold text-white">Count-only pipeline</h2>
            <div className="mt-6 space-y-5">
              {[["1", "Upload", "Store the recorded CCTV video for this analysis session."], ["2", "Detect", "Run person-only YOLO detection without Stationary/Walking/Running behavior classification."], ["3", "Count", "Calculate current, maximum and average head count across the video."], ["4", "Alert", `When count reaches ${currentLimit}, use the Settings snapshot interval and browser alarm preference.`]].map(([number, title, text]) => (
                <div key={number} className="flex gap-4"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-800 text-xs font-semibold text-cyan-300">{number}</span><div><p className="font-medium text-slate-200">{title}</p><p className="mt-1 text-sm leading-6 text-slate-500">{text}</p></div></div>
              ))}
            </div>
          </aside>
        </section>
      )}

      {session && (
        <>
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard title="Current head count" value={people} icon={Users} tone="cyan" caption={`Maximum: ${session.max_people || 0}`} />
            <StatCard title="Average head count" value={Number(session.average_people || 0).toFixed(1)} icon={Activity} tone="emerald" caption="Across analyzed frames" />
            <StatCard title="Crowd limit" value={currentLimit} icon={Gauge} tone={people >= currentLimit ? "rose" : "amber"} caption="Synced from Settings" />
            <StatCard title="Risk level" value={session.risk || "Safe"} icon={ShieldAlert} tone={session.risk === "Danger" ? "rose" : "emerald"} caption={session.alert || "Normal"} />
          </section>

          {session.limit_reached && <div className="mt-5 rounded-2xl border border-rose-400/30 bg-rose-400/10 p-4"><div className="flex items-start gap-3"><ShieldAlert size={21} className="mt-0.5 shrink-0 text-rose-300" /><div><p className="font-semibold text-white">Head Count Limit Reached</p><p className="mt-1 text-sm text-slate-300">{people} people detected · limit {currentLimit} · browser sound {alarmEnabled ? "ON" : "OFF"} · saved alerts {session.alert_count || 0}</p></div></div></div>}

          <div className="mt-6 grid grid-cols-1 gap-6 2xl:grid-cols-[1.5fr_0.75fr]">
            <section className="overflow-hidden rounded-2xl border border-slate-800 bg-[#0c1728]">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-5 py-4"><div className="min-w-0"><h2 className="truncate font-semibold text-white">{session.original_name}</h2><p className="mt-1 text-xs text-slate-500">{session.width}×{session.height} · {session.fps} FPS · {formatDuration(session.duration)}</p></div><span className={`rounded-full border px-3 py-1.5 text-xs font-semibold capitalize ${statusStyle(session.status)}`}>{session.status}</span></div>
              <div className="relative aspect-video min-h-80 bg-slate-950">{streamUrl ? <img src={streamUrl} alt="Processed CCTV head-count video" className="h-full w-full object-contain" /> : <div className="absolute inset-0 grid place-items-center text-center"><div><FileVideo2 className="mx-auto text-slate-700" size={48} /><p className="mt-4 font-medium text-slate-300">{session.message}</p></div></div>}</div>
              <div className="border-t border-slate-800 px-5 py-4"><div className="mb-2 flex justify-between gap-4 text-xs text-slate-500"><span className="truncate">{session.message}</span><span>{session.progress || 0}%</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-cyan-400 transition-all duration-500" style={{ width: `${session.progress || 0}%` }} /></div></div>
            </section>

            <div className="space-y-6">
              <section className="rounded-2xl border border-slate-800 bg-[#0c1728] p-5"><h2 className="font-semibold text-white">Analysis details</h2><div className="mt-5 divide-y divide-slate-800 text-sm">{[["Video time", formatDuration(session.current_time)], ["Duration", formatDuration(session.duration)], ["Frames processed", `${session.processed_frames || 0} / ${session.total_frames || 0}`], ["AI count frames", session.ai_frames || 0], ["Current count", people], ["Maximum count", session.max_people || 0], ["Crowd limit", currentLimit], ["Saved alerts", session.alert_count || 0], ["Alert sound", alarmEnabled ? "ON" : "OFF"]].map(([label, value]) => <div key={label} className="flex justify-between gap-4 py-3 first:pt-0 last:pb-0"><span className="text-slate-500">{label}</span><span className="max-w-48 truncate text-right font-medium text-slate-200">{value}</span></div>)}</div></section>
              <section className="rounded-2xl border border-slate-800 bg-[#0c1728] p-5"><h2 className="font-semibold text-white">Controls</h2><div className="mt-4 grid gap-3">{isActive && <button type="button" onClick={handleStop} className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-400/25 bg-rose-400/10 px-4 py-3 text-sm font-semibold text-rose-300 transition hover:bg-rose-400/15"><Square size={16} fill="currentColor" /> Stop analysis</button>}<button type="button" onClick={handleReset} disabled={isActive} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm font-medium text-slate-200 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"><RotateCcw size={16} /> Analyze another video</button></div></section>
            </div>
          </div>
        </>
      )}
    </>
  );
}
