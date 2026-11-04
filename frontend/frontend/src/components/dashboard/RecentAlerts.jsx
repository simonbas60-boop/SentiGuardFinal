import {
  AlertTriangle,
  ShieldAlert,
  CheckCircle2,
} from "lucide-react";

const alerts = [
  {
    id: 1,
    title: "High Crowd Density",
    camera: "Camera 01",
    time: "10:34 AM",
    color: "text-red-500",
    icon: AlertTriangle,
  },
  {
    id: 2,
    title: "Panic Level Increased",
    camera: "Camera 02",
    time: "10:36 AM",
    color: "text-orange-400",
    icon: ShieldAlert,
  },
  {
    id: 3,
    title: "System Normal",
    camera: "Camera 03",
    time: "10:40 AM",
    color: "text-green-500",
    icon: CheckCircle2,
  },
];

export default function RecentAlerts() {
  return (
    <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6 shadow-lg">

      <h2 className="text-xl font-semibold mb-6">
        Recent Alerts
      </h2>

      <div className="space-y-5">

        {alerts.map((alert) => {

          const Icon = alert.icon;

          return (

            <div
              key={alert.id}
              className="flex items-center justify-between border-b border-slate-700 pb-4"
            >

              <div className="flex gap-4">

                <Icon
                  className={alert.color}
                  size={26}
                />

                <div>

                  <h3 className="font-semibold">
                    {alert.title}
                  </h3>

                  <p className="text-sm text-slate-400">
                    {alert.camera}
                  </p>

                </div>

              </div>

              <span className="text-sm text-slate-500">
                {alert.time}
              </span>

            </div>

          );

        })}

      </div>

    </div>
  );
}