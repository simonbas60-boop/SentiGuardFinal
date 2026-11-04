import { BellRing, Camera, Save, SlidersHorizontal } from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

import PageHeader from "../components/common/PageHeader";
import { getSettings, updateSettings } from "../services/settingsService";

export default function Settings() {
  const [crowdLimit, setCrowdLimit] = useState(2);
  const [snapshotInterval, setSnapshotInterval] = useState(10);
  const [alarm, setAlarm] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getSettings()
      .then((data) => {
        setCrowdLimit(data.crowd_limit);
        setSnapshotInterval(data.snapshot_interval);
        setAlarm(Boolean(data.alarm_enabled));
      })
      .catch(() => toast.error("Could not load monitoring settings."));
  }, []);

  async function handleSave(event) {
    event.preventDefault();

    const normalizedLimit = Number(crowdLimit);
    const normalizedInterval = Number(snapshotInterval);

    if (normalizedLimit < 1 || normalizedInterval < 1) {
      toast.error("Crowd limit and snapshot interval must be at least 1.");
      return;
    }

    setSaving(true);
    try {
      await updateSettings({
        crowd_limit: normalizedLimit,
        snapshot_interval: normalizedInterval,
        alarm_enabled: alarm,
      });
      toast.success("Monitoring settings saved.");
    } catch (error) {
      toast.error(error.response?.data?.message || "Settings could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="System configuration"
        title="Monitoring settings"
        description="Control the Head Count alert threshold, snapshot interval, and browser alarm playback. Behavior Analysis does not use the crowd limit."
      />

      <form
        onSubmit={handleSave}
        className="max-w-4xl overflow-hidden rounded-2xl border border-slate-800 bg-[#0c1728]"
      >
        <div className="border-b border-slate-800 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-cyan-400/10 text-cyan-300">
              <SlidersHorizontal size={20} />
            </div>
            <div>
              <h2 className="font-semibold text-white">Detection thresholds</h2>
              <p className="mt-1 text-xs text-slate-500">
                Crowd limit applies only to Head Count (live and uploaded). Snapshot interval and browser alarm remain shared alert settings.
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-6 p-6 md:grid-cols-2">
          <label>
            <span className="flex items-center gap-2 text-sm font-medium text-slate-300">
              <Camera size={16} className="text-cyan-300" /> Crowd limit
            </span>
            <p className="mt-2 text-xs leading-5 text-slate-600">
              Used only by Head Count Detection and Live Camera → Head Count. Behavior Analysis is intentionally independent from this value.
            </p>
            <input
              type="number"
              min="1"
              value={crowdLimit}
              onChange={(event) => setCrowdLimit(event.target.value)}
              className="mt-3 w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-slate-100 outline-none transition focus:border-cyan-400/50"
            />
          </label>

          <label>
            <span className="flex items-center gap-2 text-sm font-medium text-slate-300">
              <BellRing size={16} className="text-violet-300" /> Snapshot interval
            </span>
            <p className="mt-2 text-xs leading-5 text-slate-600">
              Minimum seconds between saved snapshots while the same risk continues.
            </p>
            <input
              type="number"
              min="1"
              value={snapshotInterval}
              onChange={(event) => setSnapshotInterval(event.target.value)}
              className="mt-3 w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-slate-100 outline-none transition focus:border-cyan-400/50"
            />
          </label>
        </div>

        <div className="border-t border-slate-800 px-6 py-5">
          <label className="flex cursor-pointer items-center justify-between gap-5 rounded-xl border border-slate-800 bg-slate-900/50 p-4">
            <div>
              <p className="text-sm font-medium text-slate-200">Browser alarm</p>
              <p className="mt-1 text-xs leading-5 text-slate-600">
                Play the local alarm sound when the live camera reports a new danger alert.
              </p>
            </div>
            <input
              type="checkbox"
              checked={alarm}
              onChange={(event) => setAlarm(event.target.checked)}
              className="h-5 w-5 accent-cyan-400"
            />
          </label>
        </div>

        <div className="flex justify-end border-t border-slate-800 bg-slate-900/30 px-6 py-4">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:opacity-50"
          >
            <Save size={17} /> {saving ? "Saving..." : "Save settings"}
          </button>
        </div>
      </form>
    </>
  );
}
