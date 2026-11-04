import { motion } from "framer-motion";

const toneStyles = {
  cyan: "border-cyan-400/15 bg-cyan-400/10 text-cyan-300",
  emerald: "border-emerald-400/15 bg-emerald-400/10 text-emerald-300",
  amber: "border-amber-400/15 bg-amber-400/10 text-amber-300",
  rose: "border-rose-400/15 bg-rose-400/10 text-rose-300",
  violet: "border-violet-400/15 bg-violet-400/10 text-violet-300",
};

export default function StatCard({
  title,
  value,
  icon: Icon,
  tone = "cyan",
  caption,
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-slate-800/90 bg-[#0c1728] p-5 shadow-sm shadow-black/10"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-500">{title}</p>
          <div className="mt-2 truncate text-2xl font-semibold tracking-tight text-white">
            {value}
          </div>
          {caption && (
            <p className="mt-2 truncate text-xs text-slate-600">{caption}</p>
          )}
        </div>
        <div
          className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl border ${toneStyles[tone] || toneStyles.cyan}`}
        >
          <Icon size={21} />
        </div>
      </div>
    </motion.div>
  );
}
