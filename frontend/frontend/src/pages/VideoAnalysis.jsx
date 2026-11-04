import {
  Activity,
  Move,
  FileVideo2,
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
import {
  deleteAnalysisSession,
  getAnalysisStatus,
  getAnalysisStreamUrl,
  stopAnalysis,
  uploadAnalysisVideo,
} from "../services/videoAnalysisService";
import {
  playAlertOnce,
  stopAlertSound,
  unlockAlarm,
} from "../services/alertService";
import { getSettings } from "../services/settingsService";
import { BACKEND_BASE_URL } from "../services/api";

const acceptedVideoTypes = ".mp4,.avi,.mov,.mkv,.m4v,.webm";

function formatDuration(seconds) {
  const safeSeconds = Number(seconds || 0);
  const minutes = Math.floor(safeSeconds / 60);
  const remaining = Math.floor(safeSeconds % 60);
  return `${minutes}:${String(remaining).padStart(2, "0")}`;
}

function statusStyle(status) {
  if (status === "completed") {
    return "border-emerald-400/20 bg-emerald-400/10 text-emerald-300";
  }
  if (status === "failed") {
    return "border-rose-400/20 bg-rose-400/10 text-rose-300";
  }
  if (status === "analyzing") {
    return "border-cyan-400/20 bg-cyan-400/10 text-cyan-300";
  }
  return "border-slate-700 bg-slate-800/70 text-slate-300";
}

export default function VideoAnalysis() {
  const inputRef = useRef(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [session, setSession] = useState(null);
  const [streamUrl, setStreamUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [alarmEnabled, setAlarmEnabled] = useState(true);
  const lastAlertSequenceRef = useRef(0);

  useEffect(() => {
    let mounted = true;

    getSettings()
      .then((settings) => {
        if (mounted) {
          setAlarmEnabled(
            Boolean(
              settings.alarm_enabled
            ),
          );
        }
      })
      .catch((error) => {
        console.error(
          "Could not load alarm setting:",
          error,
        );
      });

    return () => {
      mounted = false;
      stopAlertSound();
    };
  }, []);

  useEffect(() => {
    if (!session?.id) return undefined;

    async function refreshStatus() {
      try {
        const data = await getAnalysisStatus(session.id);

        const nextSequence = Number(
          data.alert_sequence || 0,
        );
        const previousSequence = Number(
          lastAlertSequenceRef.current || 0,
        );

        if (
          nextSequence
          > previousSequence
        ) {
          const alertTitle =
            data.last_monitor_alert
            || data.last_saved_alert
            || data.alert
            || "Behavior alert detected";

          if (alarmEnabled) {
            await playAlertOnce();
          }

          const evidenceText =
            data.last_alert_saved
              ? " Evidence snapshot and alert record saved."
              : " Live monitor alert.";

          if (
            data.last_alert_type
            === "fight"
          ) {
            toast.error(
              `${alertTitle}.${evidenceText}`,
              {
                duration: 4500,
              },
            );
          } else if (
            data.last_alert_type
            === "running"
          ) {
            toast(
              `${alertTitle}.${evidenceText}`,
              {
                duration: 4000,
                icon: "⚠️",
              },
            );
          } else {
            toast.error(
              `${alertTitle}.${evidenceText}`,
              {
                duration: 4500,
              },
            );
          }
        }

        lastAlertSequenceRef.current = (
          nextSequence
        );

        setSession(data);
      } catch (error) {
        console.error("Video status request failed:", error);
      }
    }

    refreshStatus();
    const timer = window.setInterval(refreshStatus, 500);
    return () => window.clearInterval(timer);
  }, [alarmEnabled, session?.id]);

  function chooseFile(file) {
    if (!file) return;

    const extension = file.name.split(".").pop()?.toLowerCase();
    const allowed = ["mp4", "avi", "mov", "mkv", "m4v", "webm"];

    if (!allowed.includes(extension)) {
      toast.error("Choose an MP4, AVI, MOV, MKV, M4V or WEBM file.");
      return;
    }

    setSelectedFile(file);
  }

  async function handleUpload() {
    if (!selectedFile) {
      toast.error("Choose a CCTV video first.");
      return;
    }

    if (alarmEnabled) {
      await unlockAlarm();
    }

    stopAlertSound();
    lastAlertSequenceRef.current = 0;

    setUploading(true);
    setUploadProgress(0);

    try {
      const createdSession = await uploadAnalysisVideo(
        selectedFile,
        setUploadProgress,
      );
      setSession(createdSession);
      lastAlertSequenceRef.current = Number(
        createdSession.alert_sequence || 0,
      );
      setStreamUrl(getAnalysisStreamUrl(createdSession.id));
      toast.success("Video uploaded. AI analysis started.");
    } catch (error) {
      toast.error(
        error.response?.data?.message || "Video upload could not be completed.",
      );
    } finally {
      setUploading(false);
    }
  }

  async function handleStop() {
    if (!session?.id) return;

    try {
      await stopAnalysis(session.id);
      stopAlertSound();
      setStreamUrl("");
      toast.success("Analysis stop requested.");
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not stop analysis.");
    }
  }

  async function handleReset() {
    try {
      if (session?.id) {
        await deleteAnalysisSession(session.id);
      }
    } catch (error) {
      console.error("Session cleanup failed:", error);
    }

    stopAlertSound();
    lastAlertSequenceRef.current = 0;

    setSession(null);
    setSelectedFile(null);
    setStreamUrl("");
    setUploadProgress(0);
    if (inputRef.current) inputRef.current.value = "";
  }

  const isActive = session?.status === "analyzing" || session?.status === "ready";

  return (
    <>
      <PageHeader
        eyebrow="Recorded CCTV behavior monitoring"
        title="Crowd Behavior Analysis"
        description="Analyze recorded CCTV footage for Stationary, Walking and Running behavior. An alert, snapshot and warning sound are generated only when 100% of the currently tracked crowd is Running."
      />

      {!session && (
        <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-2xl border border-slate-800 bg-[#0c1728] p-6">
            <div
              onDragEnter={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                chooseFile(event.dataTransfer.files?.[0]);
              }}
              className={`grid min-h-80 place-items-center rounded-2xl border-2 border-dashed p-8 text-center transition ${
                dragging
                  ? "border-cyan-300 bg-cyan-400/10"
                  : "border-slate-700 bg-slate-900/40"
              }`}
            >
              <div>
                <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-cyan-400/10 text-cyan-300">
                  <UploadCloud size={30} />
                </div>
                <h2 className="mt-5 text-xl font-semibold text-white">
                  Import CCTV recording
                </h2>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
                  Drag and drop a video here, or browse from your computer. The maximum file size is 500 MB.
                </p>

                <input
                  ref={inputRef}
                  type="file"
                  accept={acceptedVideoTypes}
                  onChange={(event) => chooseFile(event.target.files?.[0])}
                  className="hidden"
                />

                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="mt-6 rounded-xl border border-slate-700 bg-slate-800 px-5 py-2.5 text-sm font-medium text-slate-100 transition hover:border-cyan-400/40 hover:text-cyan-200"
                >
                  Browse video
                </button>

                {selectedFile && (
                  <div className="mx-auto mt-6 flex max-w-lg items-center gap-3 rounded-xl border border-slate-700 bg-slate-950/50 px-4 py-3 text-left">
                    <FileVideo2 className="shrink-0 text-violet-300" size={22} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-200">
                        {selectedFile.name}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {(selectedFile.size / 1024 / 1024).toFixed(1)} MB
                      </p>
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  disabled={!selectedFile || uploading}
                  onClick={handleUpload}
                  className="mt-5 inline-flex min-w-44 items-center justify-center gap-2 rounded-xl bg-cyan-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <UploadCloud size={17} />
                  {uploading ? `Uploading ${uploadProgress}%` : "Upload and analyze"}
                </button>
              </div>
            </div>
          </div>

          <aside className="rounded-2xl border border-slate-800 bg-[#0c1728] p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-400">
              Processing flow
            </p>
            <h2 className="mt-2 text-xl font-semibold text-white">
              What this page does
            </h2>

            <ol className="mt-6 space-y-5">
              {[
                ["1", "Upload", "Store the selected CCTV recording securely in the backend upload folder."],
                ["2", "Detect", "Track Stationary, Walking and Running behavior from YOLO person movement."],
                ["3", "Classify", "Calculate the current Running Crowd Ratio and trigger only when it reaches 100%."],
                ["4", "Record", "When Running Crowd reaches 100%, play the warning sound and save one alert snapshot for that event."],
              ].map(([number, title, text]) => (
                <li key={number} className="flex gap-4">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-800 text-xs font-semibold text-cyan-300">
                    {number}
                  </span>
                  <div>
                    <p className="font-medium text-slate-200">{title}</p>
                    <p className="mt-1 text-sm leading-6 text-slate-500">{text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </aside>
        </section>
      )}

      {session && (
        <>
          {session.last_saved_alert
            && session.last_saved_alert !== "None"
            && session.last_alert_type !== "None" && (
              <div
                className={`mb-5 rounded-2xl border p-4 ${
                  session.last_alert_type === "running"
                    ? "border-rose-400/30 bg-rose-400/10"
                    : session.last_alert_type === "running"
                      ? "border-amber-400/30 bg-amber-400/10"
                      : "border-orange-400/30 bg-orange-400/10"
                }`}
              >
                <div className="flex items-start gap-3">
                  <ShieldAlert
                    size={21}
                    className={
                      session.last_alert_type === "running"
                        ? "mt-0.5 shrink-0 text-rose-300"
                        : "mt-0.5 shrink-0 text-amber-300"
                    }
                  />
                  <div>
                    <p className="font-semibold text-white">
                      {session.last_saved_alert}
                    </p>
                    <p className="mt-1 text-sm text-slate-300">
                      Live monitor alert ·{" "}
                      {session.last_alert_saved
                        ? "Evidence saved"
                        : "Evidence limit reached"}
                      {" · "}
                      Recorded alerts {session.alert_count || 0}
                      {" · "}
                      Browser sound {alarmEnabled ? "ON" : "OFF"}
                    </p>
                  </div>
                </div>
              </div>
            )}

          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              title="People detected"
              value={session.people}
              icon={Users}
              tone="cyan"
              caption={`Maximum: ${session.max_people}`}
            />
            <StatCard
              title="Average crowd"
              value={session.average_people}
              icon={Activity}
              tone="emerald"
              caption="Count is context only — no crowd-limit alert"
            />
            <StatCard
              title="Action"
              value={session.action}
              icon={Move}
              tone="amber"
              caption="Current tracked movement"
            />
            <StatCard
              title="Risk level"
              value={session.risk}
              icon={ShieldAlert}
              tone={
                session.risk === "Danger"
                  ? "rose"
                  : session.risk === "Warning"
                    ? "amber"
                    : "emerald"
              }
              caption={session.alert}
            />
          </section>

          <section className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              title="Running Crowd Ratio"
              value={`${Number(session.running_crowd_ratio || 0).toFixed(1)}%`}
              icon={Move}
              tone={
                Number(session.running_crowd_ratio || 0) >= 100
                  ? "rose"
                  : "amber"
              }
              caption={
                session.running_crowd_confirmed
                  ? "100% Running alert confirmed"
                  : "Alert threshold: 100%"
              }
            />
            <StatCard
              title="Running Activity"
              value={`${Number(session.running_activity_pct || 0).toFixed(1)}%`}
              icon={Move}
              tone="amber"
              caption={`${Number(session.running_duration || 0).toFixed(1)} sec · ${session.running_events || 0} alert events`}
            />
            <StatCard
              title="100% Running Moments"
              value={`${Number(session.full_running_activity_pct || 0).toFixed(1)}%`}
              icon={Users}
              tone="cyan"
              caption="Video moments where all tracked people were Running"
            />
            <StatCard
              title="Summary Risk"
              value={session.status === "completed" ? (session.summary_risk || session.risk) : session.risk}
              icon={ShieldAlert}
              tone={
                (session.status === "completed"
                  ? (session.summary_risk || session.risk)
                  : session.risk) === "Danger"
                  ? "rose"
                  : "emerald"
              }
              caption="Danger only after confirmed 100% Running"
            />
          </section>

          <section className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[1fr_1fr]">
            <div className="rounded-2xl border border-slate-800 bg-[#0c1728] p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-semibold text-white">
                    Behavior distribution
                  </h2>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    Stationary, Walking and Running only.
                  </p>
                </div>
                <span className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs text-slate-400">
                  {session.status === "completed" ? "Final" : "Live summary"}
                </span>
              </div>

              <div className="mt-5 space-y-4">
                {[
                  ["Stationary", session.behavior_distribution?.Stationary || 0],
                  ["Walking", session.behavior_distribution?.Walking || 0],
                  ["Running", session.behavior_distribution?.Running || 0],
                ].map(([label, value]) => (
                  <div key={label}>
                    <div className="mb-1.5 flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-300">
                        {label}
                      </span>
                      <span className="text-slate-500">
                        {Number(value).toFixed(1)}%
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                      <div
                        className="h-full rounded-full bg-cyan-400 transition-all duration-500"
                        style={{ width: `${Math.min(Number(value), 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-[#0c1728] p-5">
              <h2 className="font-semibold text-white">
                Temporary alert rule
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Crowd Limit does not generate an alert in Behavior Analysis.
                An alert is generated only when every currently tracked person is classified as Running.
              </p>

              <div className="mt-5 rounded-xl border border-amber-400/20 bg-amber-400/10 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-300">
                  Alert condition
                </p>
                <p className="mt-2 text-lg font-semibold text-white">
                  Running Crowd Ratio = 100%
                </p>
                <p className="mt-2 text-xs leading-5 text-slate-400">
                  At least 2 tracked people and 2 consecutive AI-analysis moments are required before the alarm is confirmed.
                </p>
              </div>
            </div>
          </section>

          <div className="mt-6 grid grid-cols-1 gap-6 2xl:grid-cols-[1.5fr_0.75fr]">
            <section className="overflow-hidden rounded-2xl border border-slate-800 bg-[#0c1728]">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-5 py-4">
                <div className="min-w-0">
                  <h2 className="truncate font-semibold text-white">
                    {session.original_name}
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    {session.width}×{session.height} · {session.fps} FPS · {formatDuration(session.duration)}
                  </p>
                </div>

                <span
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold capitalize ${statusStyle(
                    session.status,
                  )}`}
                >
                  {session.status}
                </span>
              </div>

              <div className="relative aspect-video min-h-80 bg-slate-950">
                {streamUrl ? (
                  <img
                    src={streamUrl}
                    alt="Processed uploaded CCTV video"
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <div className="absolute inset-0 grid place-items-center text-center">
                    <div>
                      <FileVideo2 className="mx-auto text-slate-700" size={48} />
                      <p className="mt-4 font-medium text-slate-300">
                        {session.message}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="border-t border-slate-800 px-5 py-4">
                <div className="mb-2 flex justify-between text-xs text-slate-500">
                  <span>{session.message}</span>
                  <span>{session.progress}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full rounded-full bg-cyan-400 transition-all duration-500"
                    style={{ width: `${session.progress || 0}%` }}
                  />
                </div>
              </div>
            </section>

            <div className="space-y-6">
              <section className="rounded-2xl border border-slate-800 bg-[#0c1728] p-5">
                <h2 className="font-semibold text-white">Analysis details</h2>
                <div className="mt-5 divide-y divide-slate-800 text-sm">
                  {[
                    ["Video time", formatDuration(session.current_time)],
                    ["Duration", formatDuration(session.duration)],
                    ["Frames processed", `${session.processed_frames} / ${session.total_frames}`],
                    ["AI frames", session.ai_frames ?? 0],
                    ["Current alert", session.alert],
                    ["Recorded alerts", session.alert_count ?? 0],                    ["Running events", session.running_events ?? 0],
                    ["Running crowd ratio", `${Number(session.running_crowd_ratio || 0).toFixed(1)}%`],                    ["Alert sound", alarmEnabled ? "ON" : "OFF"],
                    ["Source", "Crowd Behavior Analysis"],
                  ].map(([label, value]) => (
                    <div key={label} className="flex justify-between gap-4 py-3 first:pt-0 last:pb-0">
                      <span className="text-slate-500">{label}</span>
                      <span className="max-w-48 truncate text-right font-medium text-slate-200">
                        {value}
                      </span>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-2xl border border-slate-800 bg-[#0c1728] p-5">
                <h2 className="font-semibold text-white">Controls</h2>
                <div className="mt-4 grid gap-3">
                  {isActive && (
                    <button
                      type="button"
                      onClick={handleStop}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-400/25 bg-rose-400/10 px-4 py-3 text-sm font-semibold text-rose-300 transition hover:bg-rose-400/15"
                    >
                      <Square size={16} fill="currentColor" /> Stop analysis
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleReset}
                    disabled={isActive}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm font-medium text-slate-200 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <RotateCcw size={16} /> Analyze another video
                  </button>
                </div>
              </section>
            </div>
          </div>
        </>
      )}
    </>
  );
}
