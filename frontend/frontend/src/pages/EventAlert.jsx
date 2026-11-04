import {
  BellRing,
  CheckCircle2,
  Radio,
  ShieldAlert,
  ShieldCheck,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";


function normalizeApiOrigin() {
  const params = new URLSearchParams(
    window.location.search,
  );

  const provided = params.get(
    "api",
  );

  if (provided) {
    return provided.replace(
      /\/$/,
      "",
    );
  }

  return `${window.location.protocol}//${window.location.hostname}:5000`;
}


export default function EventAlert() {
  const apiOrigin = useMemo(
    () => normalizeApiOrigin(),
    [],
  );

  const [
    emergency,
    setEmergency,
  ] = useState({
    active: false,
    message:
      "Connecting to the SentiGuard emergency channel...",
    revision: 0,
    connected_clients: 0,
  });

  const [
    streamConnected,
    setStreamConnected,
  ] = useState(false);

  const [
    alertsEnabled,
    setAlertsEnabled,
  ] = useState(false);

  const [
    notificationMode,
    setNotificationMode,
  ] = useState(
    "In-page alarm",
  );

  const alarmRef = useRef(
    null,
  );

  const lastNotificationRevisionRef =
    useRef(-1);

  useEffect(() => {
    const alarm = new Audio(
      "/alarm.mp3",
    );

    alarm.loop = true;
    alarm.preload = "auto";
    alarm.volume = 1.0;

    alarmRef.current = alarm;

    return () => {
      try {
        alarm.pause();
        alarm.currentTime = 0;
      } catch {
        // Ignore browser cleanup failures.
      }
    };
  }, []);

  useEffect(() => {
    const source = new EventSource(
      `${apiOrigin}/api/emergency/stream`,
    );

    source.addEventListener(
      "open",
      () => {
        setStreamConnected(
          true,
        );
      },
    );

    source.addEventListener(
      "emergency",
      (event) => {
        try {
          const data = JSON.parse(
            event.data,
          );

          setEmergency(
            data,
          );
        } catch (error) {
          console.error(
            "Invalid emergency event:",
            error,
          );
        }
      },
    );

    source.onerror = () => {
      setStreamConnected(
        false,
      );
      // EventSource automatically reconnects.
    };

    return () => {
      source.close();
    };
  }, [apiOrigin]);

  useEffect(() => {
    const alarm = (
      alarmRef.current
    );

    if (!alarm) {
      return;
    }

    if (
      emergency.active
      && alertsEnabled
    ) {
      alarm
        .play()
        .catch((error) => {
          console.debug(
            "Emergency alarm playback blocked:",
            error,
          );
        });

      if (
        navigator.vibrate
      ) {
        navigator.vibrate([
          500,
          200,
          500,
          200,
          900,
        ]);
      }

      const revision = Number(
        emergency.revision || 0,
      );

      if (
        revision
          !== lastNotificationRevisionRef.current
      ) {
        lastNotificationRevisionRef.current =
          revision;

        if (
          window.isSecureContext
          && "Notification" in window
          && Notification.permission
            === "granted"
        ) {
          try {
            new Notification(
              "SentiGuard Emergency Alert",
              {
                body:
                  emergency.message,
                icon:
                  "/favicon.ico",
              },
            );
          } catch {
            // In-page alarm remains the fallback.
          }
        }
      }
    } else {
      alarm.pause();
      alarm.currentTime = 0;

      if (
        navigator.vibrate
      ) {
        navigator.vibrate(0);
      }
    }
  }, [
    alertsEnabled,
    emergency.active,
    emergency.message,
    emergency.revision,
  ]);

  async function enableAlerts() {
    const alarm = (
      alarmRef.current
    );

    if (alarm) {
      const originalVolume = (
        alarm.volume
      );

      try {
        alarm.volume = 0;
        alarm.currentTime = 0;

        await alarm.play();

        alarm.pause();
        alarm.currentTime = 0;
      } catch (error) {
        console.debug(
          "Alarm priming was blocked:",
          error,
        );
      } finally {
        alarm.volume = (
          originalVolume
        );
      }
    }

    if (
      window.isSecureContext
      && "Notification" in window
    ) {
      try {
        const permission =
          await Notification.requestPermission();

        if (
          permission
          === "granted"
        ) {
          setNotificationMode(
            "Alarm + browser notification",
          );
        } else {
          setNotificationMode(
            "In-page alarm",
          );
        }
      } catch {
        setNotificationMode(
          "In-page alarm",
        );
      }
    } else {
      setNotificationMode(
        "In-page alarm",
      );
    }

    setAlertsEnabled(
      true,
    );
  }

  function disableAlerts() {
    setAlertsEnabled(
      false,
    );

    if (
      alarmRef.current
    ) {
      alarmRef.current.pause();
      alarmRef.current.currentTime = 0;
    }

    if (
      navigator.vibrate
    ) {
      navigator.vibrate(0);
    }
  }

  const emergencyActive = Boolean(
    emergency.active,
  );

  return (
    <main
      className={`min-h-screen transition-colors duration-300 ${
        emergencyActive
          ? "bg-[#3d080b]"
          : "bg-[#07111f]"
      }`}
    >
      <div className="mx-auto flex min-h-screen max-w-2xl flex-col px-5 py-8 sm:px-8">
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className={`grid h-12 w-12 place-items-center rounded-2xl border ${
                emergencyActive
                  ? "border-rose-300/30 bg-rose-300/10"
                  : "border-cyan-400/25 bg-cyan-400/10"
              }`}
            >
              {emergencyActive ? (
                <ShieldAlert
                  className="text-rose-200"
                  size={27}
                />
              ) : (
                <ShieldCheck
                  className="text-cyan-300"
                  size={27}
                />
              )}
            </div>

            <div>
              <h1 className="text-lg font-semibold text-white">
                SentiGuard
              </h1>
              <p className="text-xs text-slate-400">
                Event Emergency Channel
              </p>
            </div>
          </div>

          <div
            className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${
              streamConnected
                ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300"
                : "border-amber-400/20 bg-amber-400/10 text-amber-300"
            }`}
          >
            {streamConnected ? (
              <Wifi size={14} />
            ) : (
              <WifiOff size={14} />
            )}
            {streamConnected
              ? "Connected"
              : "Reconnecting"}
          </div>
        </header>

        <section
          className={`mt-10 rounded-[28px] border p-6 shadow-2xl sm:p-8 ${
            emergencyActive
              ? "border-rose-300/30 bg-rose-950/70 shadow-rose-950/30"
              : "border-slate-800 bg-[#0c1728] shadow-slate-950/20"
          }`}
        >
          {emergencyActive ? (
            <>
              <div className="flex items-center gap-3 text-rose-200">
                <BellRing
                  size={28}
                  className={
                    alertsEnabled
                      ? "animate-pulse"
                      : ""
                  }
                />
                <span className="text-sm font-semibold uppercase tracking-[0.18em]">
                  Emergency Alert
                </span>
              </div>

              <h2 className="mt-5 text-3xl font-bold leading-tight text-white sm:text-4xl">
                Follow event staff
                instructions immediately.
              </h2>

              <p className="mt-5 text-base leading-7 text-rose-100/90 sm:text-lg">
                {emergency.message}
              </p>

              {!alertsEnabled && (
                <div className="mt-6 rounded-2xl border border-amber-300/25 bg-amber-300/10 p-4 text-sm leading-6 text-amber-100">
                  Emergency is active, but this phone has not enabled the audible alarm yet.
                  Tap the button below.
                </div>
              )}
            </>
          ) : (
            <>
              <div className="flex items-center gap-3 text-emerald-300">
                <CheckCircle2
                  size={27}
                />
                <span className="text-sm font-semibold uppercase tracking-[0.18em]">
                  Normal Status
                </span>
              </div>

              <h2 className="mt-5 text-3xl font-bold text-white">
                No emergency alert
              </h2>

              <p className="mt-4 text-base leading-7 text-slate-400">
                {emergency.message}
              </p>

              <p className="mt-4 text-sm leading-6 text-slate-500">
                Keep this page open while attending the event so SentiGuard can display emergency broadcasts from the administrator.
              </p>
            </>
          )}
        </section>

        <section className="mt-6 rounded-2xl border border-slate-800 bg-[#0c1728] p-5">
          <div className="flex items-start gap-4">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-cyan-400/10 text-cyan-300">
              {alertsEnabled ? (
                <Volume2 size={21} />
              ) : (
                <VolumeX size={21} />
              )}
            </div>

            <div className="flex-1">
              <h3 className="font-semibold text-white">
                Emergency alarm
              </h3>

              <p className="mt-1 text-sm leading-6 text-slate-500">
                {alertsEnabled
                  ? `Enabled · ${notificationMode}`
                  : "Tap once to allow the warning sound on this device."}
              </p>

              {!alertsEnabled ? (
                <button
                  type="button"
                  onClick={
                    enableAlerts
                  }
                  className="mt-4 w-full rounded-xl bg-cyan-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
                >
                  Enable Emergency Alerts
                </button>
              ) : (
                <button
                  type="button"
                  onClick={
                    disableAlerts
                  }
                  className="mt-4 w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm font-semibold text-slate-300 transition hover:border-slate-600 hover:bg-slate-800"
                >
                  Disable Alarm
                </button>
              )}
            </div>
          </div>
        </section>

        <section className="mt-5 flex items-start gap-3 rounded-2xl border border-slate-800/70 bg-slate-950/30 p-4 text-xs leading-5 text-slate-600">
          <Radio
            size={17}
            className="mt-0.5 shrink-0"
          />
          <p>
            Demo mode: the audible alert is designed for attendees who keep this web page open. Full background push notifications require HTTPS/PWA push setup.
          </p>
        </section>

        <p className="mt-auto pt-10 text-center text-xs text-slate-700">
          SentiGuard Event Safety · Keep this page available during the event
        </p>
      </div>
    </main>
  );
}
