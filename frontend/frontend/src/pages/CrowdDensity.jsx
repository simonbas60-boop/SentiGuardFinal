import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Gauge,
  Layers3,
  Move,
  Pause,
  Play,
  RotateCcw,
  UploadCloud,
  Waves,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";

import PageHeader from "../components/common/PageHeader";
import {
  deleteCrowdDensitySession,
  getCrowdDensityStatus,
  getCrowdDensityStreamUrl,
  stopCrowdDensityAnalysis,
  uploadCrowdDensityVideo,
} from "../services/crowdDensityService";
import {
  playAlarm,
  stopAlarm,
  unlockAlarm,
} from "../services/alertService";
import { getSettings } from "../services/settingsService";

const EMPTY_SESSION = {
  id: "",
  status: "idle",
  progress: 0,
  density_score: 0,
  raw_occupancy: 0,
  density_level: "Low",
  motion_score: 0,
  motion_level: "Calibrating",
  congestion_score: 0,
  congestion_status: "Ready",
  hot_zones: 0,
  trend: "Calibrating",
  average_density: 0,
  max_density: 0,
  max_congestion: 0,
  current_time: 0,
  duration: 0,
};

function levelTone(level) {
  if (level === "Critical") {
    return "border-rose-400/25 bg-rose-400/10 text-rose-300";
  }

  if (level === "High") {
    return "border-amber-400/25 bg-amber-400/10 text-amber-300";
  }

  if (level === "Moderate") {
    return "border-yellow-400/25 bg-yellow-400/10 text-yellow-200";
  }

  return "border-emerald-400/25 bg-emerald-400/10 text-emerald-300";
}

function StatCard({
  icon: Icon,
  label,
  value,
  caption,
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-[0_18px_45px_rgba(2,8,23,.18)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
            {label}
          </p>
          <p className="mt-3 text-2xl font-semibold tracking-tight text-white">
            {value}
          </p>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            {caption}
          </p>
        </div>

        <div className="grid h-10 w-10 place-items-center rounded-xl border border-cyan-400/15 bg-cyan-400/10 text-cyan-300">
          <Icon size={20} />
        </div>
      </div>
    </div>
  );
}

function TrendIcon({ trend }) {
  if (trend === "Increasing") {
    return <ArrowUpRight size={17} className="text-rose-300" />;
  }

  if (trend === "Decreasing") {
    return <ArrowDownRight size={17} className="text-emerald-300" />;
  }

  return <ArrowRight size={17} className="text-slate-400" />;
}

function formatSeconds(value) {
  const seconds = Number(value || 0);
  const minutes = Math.floor(seconds / 60);
  const remain = Math.floor(seconds % 60);

  return `${minutes}:${String(remain).padStart(2, "0")}`;
}

export default function CrowdDensity() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [session, setSession] = useState(EMPTY_SESSION);
  const [streamActive, setStreamActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [alarmEnabled, setAlarmEnabled] = useState(true);
  const inputRef = useRef(null);
  const lastNotifiedRiskRef = useRef("Low");
  const alarmRiskActiveRef = useRef(false);

  useEffect(() => {
    let mounted = true;

    getSettings()
      .then((settings) => {
        if (!mounted) {
          return;
        }

        setAlarmEnabled(
          Boolean(settings.alarm_enabled),
        );
      })
      .catch((requestError) => {
        console.error(
          "Could not load browser alarm setting:",
          requestError,
        );
      });

    return () => {
      mounted = false;
      stopAlarm();
      alarmRiskActiveRef.current = false;
    };
  }, []);

  const streamUrl = useMemo(() => {
    if (!session.id || !streamActive) {
      return "";
    }

    return getCrowdDensityStreamUrl(session.id);
  }, [alarmEnabled, session.id, streamActive]);

  useEffect(() => {
    if (!session.id || !streamActive) {
      return undefined;
    }

    let cancelled = false;

    async function refreshStatus() {
      try {
        const next = await getCrowdDensityStatus(session.id);

        if (cancelled) {
          return;
        }

        setSession(next);

        const nextRisk = next.risk_level || "Low";
        const previousRisk = lastNotifiedRiskRef.current;
        const riskIsHigh = ["High", "Critical"].includes(
          nextRisk,
        );

        if (alarmEnabled && riskIsHigh) {
          if (!alarmRiskActiveRef.current) {
            await playAlarm();
          }

          alarmRiskActiveRef.current = true;
        } else {
          if (alarmRiskActiveRef.current || !alarmEnabled) {
            stopAlarm();
          }

          alarmRiskActiveRef.current = false;
        }

        if (
          ["High", "Critical"].includes(nextRisk)
          && nextRisk !== previousRisk
        ) {
          const message =
            nextRisk === "Critical"
              ? "Critical crowd density detected. Alert and snapshot recorded."
              : "High crowd density detected. Alert and snapshot recorded.";

          toast.error(message, {
            duration: 4500,
          });
        }

        lastNotifiedRiskRef.current = nextRisk;

        if (
          ["completed", "failed", "stopped"].includes(next.status)
        ) {
          setStreamActive(false);
          stopAlarm();
          alarmRiskActiveRef.current = false;
        }
      } catch (requestError) {
        if (!cancelled) {
          console.error(requestError);
        }
      }
    }

    refreshStatus();

    const timer = window.setInterval(
      refreshStatus,
      500,
    );

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [session.id, streamActive]);

  useEffect(() => {
    return () => {
      stopAlarm();
      alarmRiskActiveRef.current = false;

      if (session.id && streamActive) {
        stopCrowdDensityAnalysis(session.id).catch(() => {});
      }
    };
  }, [session.id, streamActive]);

  async function handleUpload() {
    if (!selectedFile) {
      setError("Choose a recorded CCTV video first.");
      return;
    }

    // This button click is a browser user gesture. Prime the existing
    // /alarm.mp3 here so High/Critical alerts can play later.
    if (alarmEnabled) {
      await unlockAlarm();
    }

    stopAlarm();
    alarmRiskActiveRef.current = false;
    lastNotifiedRiskRef.current = "Low";

    setUploading(true);
    setError("");

    try {
      if (session.id) {
        await deleteCrowdDensitySession(session.id).catch(() => {});
      }

      const uploaded = await uploadCrowdDensityVideo(
        selectedFile,
      );

      setSession(uploaded);
      setStreamActive(true);
    } catch (requestError) {
      setError(
        requestError.response?.data?.message
          || "Video upload failed.",
      );
    } finally {
      setUploading(false);
    }
  }

  async function handleStop() {
    if (!session.id) {
      return;
    }

    try {
      await stopCrowdDensityAnalysis(session.id);
      stopAlarm();
      alarmRiskActiveRef.current = false;
      setStreamActive(false);
      setSession((current) => ({
        ...current,
        status: "stopped",
      }));
    } catch (requestError) {
      setError(
        requestError.response?.data?.message
          || "Could not stop the analysis.",
      );
    }
  }

  async function handleReset() {
    if (session.id) {
      await deleteCrowdDensitySession(
        session.id,
      ).catch(() => {});
    }

    stopAlarm();
    alarmRiskActiveRef.current = false;

    setSelectedFile(null);
    setSession(EMPTY_SESSION);
    setStreamActive(false);
    setError("");
    lastNotifiedRiskRef.current = "Low";

    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  const progress = Math.min(
    Number(session.progress || 0),
    100,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Visual Crowd Congestion Analysis"
        title="Crowd Density Detection"
        description="Estimate how crowded or congested a scene is without relying on an exact person count. The analysis uses visual occupancy, motion, hot zones, and trend."
      />

      {["High", "Critical"].includes(session.risk_level) && (
        <div
          className={`rounded-2xl border p-4 ${
            session.risk_level === "Critical"
              ? "border-rose-400/30 bg-rose-400/10"
              : "border-amber-400/30 bg-amber-400/10"
          }`}
        >
          <div className="flex items-start gap-3">
            <AlertTriangle
              size={21}
              className={
                session.risk_level === "Critical"
                  ? "mt-0.5 shrink-0 text-rose-300"
                  : "mt-0.5 shrink-0 text-amber-300"
              }
            />
            <div>
              <p className="font-semibold text-white">
                {session.risk_level === "Critical"
                  ? "Critical Crowd Density Warning"
                  : "High Crowd Density Warning"}
              </p>
              <p className="mt-1 text-sm leading-6 text-slate-300">
                Risk: {session.risk_level} · Density:{" "}
                {Number(session.density_score || 0).toFixed(1)}% ·{" "}
                {session.congestion_status}. The event is recorded in Alerts,
                a snapshot is saved, and the notification bell is updated.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-cyan-400/15 bg-cyan-400/[0.06] p-4">
        <div className="flex gap-3">
          <AlertTriangle
            size={20}
            className="mt-0.5 shrink-0 text-cyan-300"
          />
          <p className="text-sm leading-6 text-slate-300">
            This page reports a <strong className="text-white">Visual Crowd Density Index</strong>,
            not physical people/m². Real physical density requires camera calibration
            and known ground-area measurements. Browser alarm is{" "}
            <strong className={alarmEnabled ? "text-emerald-300" : "text-slate-400"}>
              {alarmEnabled ? "ON" : "OFF"}
            </strong>.
          </p>
        </div>
      </div>

      <section className="grid gap-6 xl:grid-cols-[1.45fr_.75fr]">
        <div className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-950 shadow-[0_24px_70px_rgba(2,8,23,.32)]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-5 py-4">
            <div>
              <p className="text-sm font-semibold text-white">
                Density Heatmap
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Original footage blended with visual crowd-density hot zones
              </p>
            </div>

            <span
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${levelTone(
                session.density_level,
              )}`}
            >
              {session.density_level}
            </span>
          </div>

          <div className="relative aspect-video bg-[#030a13]">
            {streamUrl ? (
              <img
                src={streamUrl}
                alt="Crowd density analysis stream"
                className="h-full w-full object-contain"
              />
            ) : (
              <div className="grid h-full place-items-center px-6 text-center">
                <div>
                  <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl border border-slate-800 bg-slate-900 text-cyan-300">
                    <Waves size={29} />
                  </div>
                  <p className="mt-5 text-base font-semibold text-white">
                    No density analysis running
                  </p>
                  <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
                    Upload a recorded CCTV video to generate a visual density
                    heatmap and congestion score.
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-slate-800 px-5 py-4">
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="text-slate-500">
                Analysis progress
              </span>
              <span className="font-medium text-slate-300">
                {progress.toFixed(1)}%
              </span>
            </div>

            <div className="h-2 overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full rounded-full bg-cyan-400 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>

            <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
              <span>
                {formatSeconds(session.current_time)} / {formatSeconds(session.duration)}
              </span>
              <span className="capitalize">
                {session.status}
              </span>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
            <p className="text-sm font-semibold text-white">
              Recorded CCTV Input
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              MP4, AVI, MOV, MKV, M4V and WEBM are supported.
            </p>

            <input
              ref={inputRef}
              type="file"
              accept="video/*"
              onChange={(event) => {
                setSelectedFile(
                  event.target.files?.[0] || null,
                );
                setError("");
              }}
              className="mt-5 block w-full text-sm text-slate-400 file:mr-4 file:rounded-xl file:border-0 file:bg-slate-800 file:px-4 file:py-2.5 file:text-sm file:font-medium file:text-slate-200 hover:file:bg-slate-700"
            />

            {selectedFile && (
              <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                <p className="truncate text-sm font-medium text-slate-200">
                  {selectedFile.name}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {(selectedFile.size / (1024 * 1024)).toFixed(1)} MB
                </p>
              </div>
            )}

            {error && (
              <p className="mt-4 rounded-xl border border-rose-400/20 bg-rose-400/10 px-3 py-2 text-sm text-rose-300">
                {error}
              </p>
            )}

            <div className="mt-5 flex gap-3">
              {!streamActive ? (
                <button
                  type="button"
                  onClick={handleUpload}
                  disabled={uploading || !selectedFile}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {uploading ? (
                    <Activity className="animate-pulse" size={18} />
                  ) : (
                    <Play size={18} />
                  )}
                  {uploading ? "Uploading..." : "Analyze Density"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleStop}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-amber-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-300"
                >
                  <Pause size={18} />
                  Stop
                </button>
              )}

              <button
                type="button"
                onClick={handleReset}
                className="grid h-12 w-12 place-items-center rounded-xl border border-slate-700 text-slate-400 transition hover:border-slate-600 hover:bg-slate-800 hover:text-white"
                title="Reset density analysis"
              >
                <RotateCcw size={18} />
              </button>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
            <p className="text-sm font-semibold text-white">
              Congestion Interpretation
            </p>

            <div className="mt-4 space-y-3 text-sm">
              {[
                ["0–29", "Low", "Comfortable visual occupancy"],
                ["30–54", "Moderate", "Noticeable crowd presence"],
                ["55–74", "High", "Heavy crowd / monitor closely"],
                ["75–100", "Critical", "Very dense visual congestion"],
              ].map(([range, level, text]) => (
                <div
                  key={level}
                  className="grid grid-cols-[64px_88px_1fr] items-center gap-3 rounded-xl bg-slate-950/60 px-3 py-2.5"
                >
                  <span className="text-xs font-mono text-slate-500">
                    {range}
                  </span>
                  <span className="text-xs font-semibold text-slate-300">
                    {level}
                  </span>
                  <span className="text-xs text-slate-500">
                    {text}
                  </span>
                </div>
              ))}
            </div>

            <p className="mt-4 text-xs leading-5 text-slate-600">
              Thresholds are system calibration values and can be tuned later
              using your real CCTV environment.
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Gauge}
          label="Density Score"
          value={`${Number(session.density_score || 0).toFixed(1)}%`}
          caption={`Visual density: ${session.density_level} · Risk: ${session.risk_level || "Low"}`}
        />

        <StatCard
          icon={Move}
          label="Motion Level"
          value={session.motion_level}
          caption={`${Number(session.motion_score || 0).toFixed(0)}% movement index`}
        />

        <StatCard
          icon={Layers3}
          label="Hot Zones"
          value={session.hot_zones}
          caption="High-density regions in the scene"
        />

        <StatCard
          icon={Waves}
          label="Congestion"
          value={session.congestion_status}
          caption={`${Number(session.congestion_score || 0).toFixed(1)} score · ${session.alert_count || 0} recorded alerts`}
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-white">
                Density Trend
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Direction of recent crowd-density change
              </p>
            </div>

            <div className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2">
              <TrendIcon trend={session.trend} />
              <span className="text-sm font-semibold text-slate-200">
                {session.trend}
              </span>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-3">
            {[
              ["Average", `${Number(session.average_density || 0).toFixed(1)}%`],
              ["Maximum", `${Number(session.max_density || 0).toFixed(1)}%`],
              ["Peak Congestion", `${Number(session.max_congestion || 0).toFixed(1)}`],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4"
              >
                <p className="text-xs text-slate-500">
                  {label}
                </p>
                <p className="mt-2 text-lg font-semibold text-white">
                  {value}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
          <p className="text-sm font-semibold text-white">
            How SentiGuard Calculates It
          </p>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {[
              {
                icon: UploadCloud,
                title: "Visual Occupancy",
                text: "Foreground activity estimates how much of the CCTV scene is occupied.",
              },
              {
                icon: Move,
                title: "Motion",
                text: "Optical flow measures whether the crowd is still, slow, normal or fast.",
              },
              {
                icon: Waves,
                title: "Congestion",
                text: "High density combined with reduced movement produces a congestion warning.",
              },
            ].map(({ icon: Icon, title, text }) => (
              <div
                key={title}
                className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4"
              >
                <Icon
                  size={19}
                  className="text-cyan-300"
                />
                <p className="mt-3 text-sm font-semibold text-slate-200">
                  {title}
                </p>
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  {text}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
