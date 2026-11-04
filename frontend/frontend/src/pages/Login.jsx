import { LockKeyhole, ShieldCheck, User } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";

import api from "../services/api";

export default function Login() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(event) {
    event.preventDefault();
    setLoading(true);

    try {
      const response = await api.post("/auth/login", { username, password });
      localStorage.setItem("token", response.data.token);
      localStorage.setItem("role", response.data.role);
      navigate("/dashboard");
    } catch (error) {
      toast.error(error.response?.data?.message || "Invalid username or password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-[#07111f] px-4 py-10">
      <div className="pointer-events-none absolute left-1/2 top-[-18rem] h-[36rem] w-[36rem] -translate-x-1/2 rounded-full bg-cyan-500/10 blur-3xl" />

      <section className="relative grid w-full max-w-5xl overflow-hidden rounded-3xl border border-slate-800 bg-[#0a1525] shadow-2xl shadow-black/30 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="hidden border-r border-slate-800 bg-slate-900/30 p-10 lg:flex lg:flex-col lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-cyan-400/10 text-cyan-300">
              <ShieldCheck size={27} />
            </div>
            <div>
              <p className="text-xl font-semibold text-white">SentiGuard</p>
              <p className="text-xs text-slate-500">AI Crowd Monitoring</p>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-400">
              Intelligent monitoring
            </p>
            <h1 className="mt-4 max-w-md text-4xl font-semibold leading-tight tracking-tight text-white">
              See crowd risk before it becomes an incident.
            </h1>
            <p className="mt-5 max-w-md text-sm leading-7 text-slate-500">
              Monitor live cameras, analyze recorded CCTV footage, detect people and track movement actions, and preserve alert evidence in one control center.
            </p>
          </div>

          <p className="text-xs text-slate-600">YOLOv8 · Action Tracking · Flask · React</p>
        </div>

        <div className="p-7 sm:p-10 lg:p-12">
          <div className="lg:hidden">
            <div className="flex items-center gap-3">
              <ShieldCheck className="text-cyan-300" size={30} />
              <span className="text-xl font-semibold text-white">SentiGuard</span>
            </div>
          </div>

          <div className="mt-8 lg:mt-14">
            <h2 className="text-2xl font-semibold tracking-tight text-white">
              Administrator sign in
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              Enter your account details to open the monitoring dashboard.
            </p>
          </div>

          <form onSubmit={handleLogin} className="mt-8 space-y-5">
            <label className="block">
              <span className="text-sm font-medium text-slate-300">Username</span>
              <div className="mt-2 flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-900 px-4 transition focus-within:border-cyan-400/50">
                <User size={18} className="text-slate-600" />
                <input
                  required
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="Enter username"
                  className="w-full bg-transparent py-3.5 text-slate-100 outline-none placeholder:text-slate-600"
                />
              </div>
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-300">Password</span>
              <div className="mt-2 flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-900 px-4 transition focus-within:border-cyan-400/50">
                <LockKeyhole size={18} className="text-slate-600" />
                <input
                  required
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter password"
                  className="w-full bg-transparent py-3.5 text-slate-100 outline-none placeholder:text-slate-600"
                />
              </div>
            </label>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-cyan-400 py-3.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Signing in..." : "Sign in to SentiGuard"}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
