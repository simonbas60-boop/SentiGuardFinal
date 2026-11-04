import {
  BellRing,
  Check,
  Copy,
  ExternalLink,
  Megaphone,
  Power,
  PowerOff,
  QrCode,
  Radio,
  Smartphone,
  Users,
  Wifi,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useState,
} from "react";
import toast from "react-hot-toast";
import {
  QRCodeSVG,
} from "qrcode.react";

import {
  activateEmergency,
  clearEmergency,
  getEmergencyStatus,
} from "../services/emergencyService";


function defaultNetworkHost() {
  const saved = localStorage.getItem(
    "sentiguard_event_host",
  );

  if (saved) {
    return saved;
  }

  return window.location.hostname;
}


export default function EmergencyBroadcast() {
  const [
    status,
    setStatus,
  ] = useState({
    active: false,
    message: "",
    connected_clients: 0,
    revision: 0,
    updated_at: null,
  });

  const [
    message,
    setMessage,
  ] = useState(
    "Emergency situation detected. Please remain calm and follow instructions from event staff.",
  );

  const [
    networkHost,
    setNetworkHost,
  ] = useState(
    defaultNetworkHost,
  );

  const [
    working,
    setWorking,
  ] = useState(false);

  const [
    copied,
    setCopied,
  ] = useState(false);

  const frontendPort = (
    window.location.port
    || (
      window.location.protocol
        === "https:"
        ? "443"
        : "80"
    )
  );

  const attendeeUrl = useMemo(
    () => {
      const frontendOrigin = `${window.location.protocol}//${networkHost}${
        (
          frontendPort === "80"
          && window.location.protocol === "http:"
        )
        || (
          frontendPort === "443"
          && window.location.protocol === "https:"
        )
          ? ""
          : `:${frontendPort}`
      }`;

      const backendOrigin = `${window.location.protocol}//${networkHost}:5000`;

      return `${frontendOrigin}/event-alert?api=${encodeURIComponent(
        backendOrigin,
      )}`;
    },
    [
      frontendPort,
      networkHost,
    ],
  );

  useEffect(() => {
    let active = true;

    async function refresh() {
      try {
        const data =
          await getEmergencyStatus();

        if (active) {
          setStatus(
            data,
          );
        }
      } catch (error) {
        console.error(
          "Emergency status error:",
          error,
        );
      }
    }

    refresh();

    const timer =
      window.setInterval(
        refresh,
        2000,
      );

    return () => {
      active = false;
      window.clearInterval(
        timer,
      );
    };
  }, []);

  function saveNetworkHost(
    value,
  ) {
    const clean = value
      .trim()
      .replace(
        /^https?:\/\//,
        "",
      )
      .replace(
        /\/.*$/,
        "",
      )
      .replace(
        /:\d+$/,
        "",
      );

    setNetworkHost(
      clean,
    );

    if (clean) {
      localStorage.setItem(
        "sentiguard_event_host",
        clean,
      );
    }
  }

  async function activate() {
    if (
      !message.trim()
    ) {
      toast.error(
        "Enter an emergency message.",
      );
      return;
    }

    const confirmed =
      window.confirm(
        "Activate the emergency broadcast for all currently connected attendee pages?",
      );

    if (!confirmed) {
      return;
    }

    setWorking(
      true,
    );

    try {
      const result =
        await activateEmergency(
          message.trim(),
        );

      setStatus(
        result.state,
      );

      toast.error(
        "Emergency broadcast activated.",
        {
          duration: 4500,
        },
      );
    } catch (error) {
      toast.error(
        error.response?.data?.message
          || "Could not activate emergency broadcast.",
      );
    } finally {
      setWorking(
        false,
      );
    }
  }

  async function clear() {
    const confirmed =
      window.confirm(
        "Clear the emergency alarm for connected attendees?",
      );

    if (!confirmed) {
      return;
    }

    setWorking(
      true,
    );

    try {
      const result =
        await clearEmergency(
          "Emergency alert cleared. Please continue to follow event staff instructions.",
        );

      setStatus(
        result.state,
      );

      toast.success(
        "Emergency broadcast cleared.",
      );
    } catch (error) {
      toast.error(
        error.response?.data?.message
          || "Could not clear emergency broadcast.",
      );
    } finally {
      setWorking(
        false,
      );
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(
        attendeeUrl,
      );

      setCopied(
        true,
      );

      window.setTimeout(
        () => {
          setCopied(
            false,
          );
        },
        1800,
      );
    } catch {
      toast.error(
        "Could not copy the attendee link.",
      );
    }
  }

  const localOnlyHost = [
    "localhost",
    "127.0.0.1",
  ].includes(
    networkHost,
  );

  return (
    <div className="space-y-6">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-400">
            <Radio size={16} />
            Emergency Broadcast
          </div>

          <h1 className="mt-2 text-2xl font-bold text-white sm:text-3xl">
            QR Event Emergency Alarm
          </h1>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
            Attendees scan the QR code, keep the Event Alert page open and enable the alarm once. The administrator can then activate or clear the emergency broadcast in real time.
          </p>
        </div>

        <div
          className={`inline-flex items-center gap-2 self-start rounded-full border px-4 py-2 text-sm font-semibold ${
            status.active
              ? "border-rose-400/25 bg-rose-400/10 text-rose-300"
              : "border-emerald-400/20 bg-emerald-400/10 text-emerald-300"
          }`}
        >
          <span
            className={`h-2.5 w-2.5 rounded-full ${
              status.active
                ? "animate-pulse bg-rose-400"
                : "bg-emerald-400"
            }`}
          />
          {status.active
            ? "EMERGENCY ACTIVE"
            : "NORMAL"}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <InfoCard
          icon={Users}
          title="Connected Attendees"
          value={
            status.connected_clients
              ?? 0
          }
          caption="Open QR alert streams"
        />

        <InfoCard
          icon={Wifi}
          title="Broadcast State"
          value={
            status.active
              ? "ACTIVE"
              : "READY"
          }
          caption={`Revision ${status.revision || 0}`}
        />

        <InfoCard
          icon={BellRing}
          title="Alarm Control"
          value={
            status.active
              ? "ON"
              : "OFF"
          }
          caption={
            status.updated_at
              ? `Updated ${status.updated_at}`
              : "No broadcast yet"
          }
        />
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.12fr_0.88fr]">
        <div className="rounded-2xl border border-slate-800 bg-[#0c1728] p-6">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-rose-400/10 text-rose-300">
              <Megaphone size={22} />
            </div>

            <div>
              <h2 className="font-semibold text-white">
                Admin emergency control
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                This action immediately updates connected attendee pages.
              </p>
            </div>
          </div>

          <label className="mt-6 block">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Emergency message
            </span>

            <textarea
              value={message}
              onChange={(event) =>
                setMessage(
                  event.target.value,
                )
              }
              rows={5}
              maxLength={500}
              className="mt-2 w-full resize-none rounded-xl border border-slate-800 bg-slate-950/70 px-4 py-3 text-sm leading-6 text-slate-200 outline-none transition placeholder:text-slate-700 focus:border-cyan-400/40"
              placeholder="Emergency instruction for attendees..."
            />

            <div className="mt-2 flex justify-between text-xs text-slate-600">
              <span>
                Keep the instruction short and actionable.
              </span>
              <span>
                {message.length}/500
              </span>
            </div>
          </label>

          {status.active && (
            <div className="mt-5 rounded-xl border border-rose-400/25 bg-rose-400/10 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-rose-300">
                Current live message
              </p>

              <p className="mt-2 text-sm leading-6 text-rose-100">
                {status.message}
              </p>
            </div>
          )}

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              disabled={
                working
                || status.active
              }
              onClick={
                activate
              }
              className="flex items-center justify-center gap-2 rounded-xl bg-rose-500 px-4 py-3.5 text-sm font-semibold text-white transition hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Power size={18} />
              Activate Emergency
            </button>

            <button
              type="button"
              disabled={
                working
                || !status.active
              }
              onClick={
                clear
              }
              className="flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-3.5 text-sm font-semibold text-slate-200 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <PowerOff size={18} />
              Clear Alert
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-[#0c1728] p-6">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-cyan-400/10 text-cyan-300">
              <QrCode size={22} />
            </div>

            <div>
              <h2 className="font-semibold text-white">
                Attendee QR code
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Phones must be able to reach this PC over the same Wi-Fi.
              </p>
            </div>
          </div>

          <label className="mt-5 block">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              PC network IP / host
            </span>

            <input
              value={networkHost}
              onChange={(event) =>
                saveNetworkHost(
                  event.target.value,
                )
              }
              className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950/70 px-4 py-3 text-sm text-slate-200 outline-none transition focus:border-cyan-400/40"
              placeholder="192.168.1.25"
            />
          </label>

          {localOnlyHost && (
            <div className="mt-3 rounded-xl border border-amber-400/20 bg-amber-400/10 p-3 text-xs leading-5 text-amber-200">
              `localhost` / `127.0.0.1` will not work from attendee phones.
              Run `ipconfig` on Windows and enter the PC's IPv4 address above.
            </div>
          )}

          <div className="mt-5 flex justify-center rounded-2xl bg-white p-5">
            <QRCodeSVG
              value={
                attendeeUrl
              }
              size={215}
              level="M"
              includeMargin
            />
          </div>

          <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/60 p-3">
            <p className="break-all text-xs leading-5 text-slate-500">
              {attendeeUrl}
            </p>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={
                copyLink
              }
              className="flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-sm font-semibold text-slate-300 hover:bg-slate-800"
            >
              {copied ? (
                <Check size={17} />
              ) : (
                <Copy size={17} />
              )}
              {copied
                ? "Copied"
                : "Copy Link"}
            </button>

            <a
              href={
                attendeeUrl
              }
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2 rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-3 py-3 text-sm font-semibold text-cyan-300 hover:bg-cyan-400/15"
            >
              <ExternalLink size={17} />
              Open Page
            </a>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-[#0c1728] p-5">
        <div className="flex items-start gap-4">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-400/10 text-violet-300">
            <Smartphone size={20} />
          </div>

          <div>
            <h3 className="font-semibold text-white">
              Demo procedure
            </h3>

            <p className="mt-2 text-sm leading-6 text-slate-500">
              1. Start Flask on <code className="text-slate-300">0.0.0.0:5000</code>. 2. Start Vite with <code className="text-slate-300">--host 0.0.0.0</code>. 3. Put the PC and phones on the same Wi-Fi. 4. Enter the PC IPv4 address above. 5. Attendees scan and tap “Enable Emergency Alerts”. 6. Use Activate/Clear from this page.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}


function InfoCard({
  icon: Icon,
  title,
  value,
  caption,
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-[#0c1728] p-5">
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-cyan-400/10 text-cyan-300">
          <Icon size={20} />
        </div>

        <div>
          <p className="text-xs font-medium text-slate-500">
            {title}
          </p>

          <p className="mt-0.5 text-xl font-semibold text-white">
            {value}
          </p>
        </div>
      </div>

      <p className="mt-3 text-xs text-slate-600">
        {caption}
      </p>
    </div>
  );
}
