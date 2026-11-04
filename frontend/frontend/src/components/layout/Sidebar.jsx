import {
  BarChart3,
  Bell,
  Images,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Settings,
  ShieldCheck,
  UploadCloud,
  UsersRound,
  Waves,
  X,
} from "lucide-react";
import {
  NavLink,
  useNavigate,
} from "react-router-dom";


const navigation = [
  {
    icon: LayoutDashboard,
    label: "Dashboard",
    path: "/dashboard",
  },

  {
    icon: UploadCloud,
    label: "Crowd Behavior Analysis",
    path: "/video-analysis",
  },
  {
    icon: Waves,
    label: "Crowd Density Detection",
    path: "/crowd-density",
  },
  {
    icon: UsersRound,
    label: "Head Count Detection",
    path: "/head-count",
  },
  {
    icon: BarChart3,
    label: "Analytics",
    path: "/analytics",
  },
  {
    icon: Bell,
    label: "Alerts",
    path: "/alerts",
  },
  {
    icon: Images,
    label: "Snapshots",
    path: "/snapshots",
  },
  {
    icon: Megaphone,
    label: "Emergency Broadcast",
    path: "/emergency-broadcast",
  },
  {
    icon: Settings,
    label: "Settings",
    path: "/settings",
  },
];


export default function Sidebar({
  mobileOpen,
  onClose,
}) {
  const navigate =
    useNavigate();

  function logout() {
    localStorage.removeItem(
      "token",
    );
    localStorage.removeItem(
      "role",
    );
    navigate("/");
  }

  return (
    <>
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={onClose}
          className="fixed inset-0 z-40 bg-slate-950/75 backdrop-blur-sm lg:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-slate-800/80 bg-[#0a1525] transition-transform duration-300 lg:translate-x-0 ${
          mobileOpen
            ? "translate-x-0"
            : "-translate-x-full"
        }`}
      >
        <div className="flex h-20 items-center justify-between border-b border-slate-800/80 px-6">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl border border-cyan-400/25 bg-cyan-400/10">
              <ShieldCheck
                className="text-cyan-300"
                size={25}
              />
            </div>

            <div>
              <h1 className="text-lg font-semibold tracking-tight text-white">
                SentiGuard
              </h1>

              <p className="text-xs text-slate-500">
                AI Control Center
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white lg:hidden"
          >
            <X size={20} />
          </button>
        </div>

        <div className="px-5 pt-6">
          <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
            Monitoring
          </p>
        </div>

        <nav className="mt-3 flex-1 space-y-1 overflow-y-auto px-4">
          {navigation.map(
            ({
              icon: Icon,
              label,
              path,
            }) => (
              <NavLink
                key={path}
                to={path}
                onClick={
                  onClose
                }
                className={({
                  isActive,
                }) =>
                  `group flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition ${
                    isActive
                      ? "bg-cyan-400/10 text-cyan-200 ring-1 ring-inset ring-cyan-400/20"
                      : "text-slate-400 hover:bg-slate-800/70 hover:text-slate-100"
                  }`
                }
              >
                {({
                  isActive,
                }) => (
                  <>
                    <Icon
                      size={19}
                      className={
                        isActive
                          ? "text-cyan-300"
                          : "text-slate-500 group-hover:text-slate-300"
                      }
                    />

                    <span>
                      {label}
                    </span>

                    {isActive && (
                      <span className="ml-auto h-1.5 w-1.5 rounded-full bg-cyan-300" />
                    )}
                  </>
                )}
              </NavLink>
            ),
          )}
        </nav>

        <div className="p-4">
          <div className="mb-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-200">
              <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,.65)]" />
              System Online
            </div>

            <p className="mt-2 text-xs leading-5 text-slate-500">
              AI monitoring and event emergency services are connected to the local backend.
            </p>
          </div>

          <button
            type="button"
            onClick={logout}
            className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-slate-400 transition hover:bg-rose-500/10 hover:text-rose-300"
          >
            <LogOut size={19} />
            Sign out
          </button>
        </div>
      </aside>
    </>
  );
}
