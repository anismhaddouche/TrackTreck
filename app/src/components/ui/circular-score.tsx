import { cn } from "@/lib/utils";

export interface CircularScoreProps {
  score: number;
  size?: "sm" | "md" | "lg" | "xl";
  strokeWidth?: number;
  showLabel?: boolean;
  subLabel?: string;
  className?: string;
}

export function CircularScore({
  score,
  size = "md",
  strokeWidth,
  showLabel = false,
  subLabel = "Qualité",
  className,
}: CircularScoreProps) {
  const clampedScore = Math.max(0, Math.min(100, Math.round(score)));

  // Size specifications: pixel dimension, font sizes, stroke width
  const sizeMap = {
    sm: {
      dimension: 36,
      radius: 14,
      stroke: strokeWidth ?? 3.5,
      textSize: "text-[11px] font-bold",
      subTextSize: "text-[7px]",
    },
    md: {
      dimension: 56,
      radius: 22,
      stroke: strokeWidth ?? 5,
      textSize: "text-sm font-bold",
      subTextSize: "text-[9px]",
    },
    lg: {
      dimension: 96,
      radius: 38,
      stroke: strokeWidth ?? 7,
      textSize: "text-2xl font-extrabold tracking-tight",
      subTextSize: "text-[11px] font-medium tracking-wide uppercase",
    },
    xl: {
      dimension: 128,
      radius: 52,
      stroke: strokeWidth ?? 9,
      textSize: "text-3xl font-black tracking-tight",
      subTextSize: "text-xs font-semibold tracking-wider uppercase",
    },
  }[size];

  const circumference = 2 * Math.PI * sizeMap.radius;
  const strokeDashoffset = circumference - (clampedScore / 100) * circumference;

  // Dynamic color theme based on score thresholds
  const colorTheme =
    clampedScore >= 80
      ? {
          stroke: "stroke-emerald-500 dark:stroke-emerald-400",
          text: "text-emerald-700 dark:text-emerald-300",
          bg: "stroke-emerald-500/15 dark:stroke-emerald-500/20",
          glow: "drop-shadow-[0_0_8px_rgba(16,185,129,0.25)]",
        }
      : clampedScore >= 60
        ? {
            stroke: "stroke-sky-500 dark:stroke-sky-400",
            text: "text-sky-700 dark:text-sky-300",
            bg: "stroke-sky-500/15 dark:stroke-sky-500/20",
            glow: "drop-shadow-[0_0_8px_rgba(14,165,233,0.25)]",
          }
        : clampedScore >= 40
          ? {
              stroke: "stroke-amber-500 dark:stroke-amber-400",
              text: "text-amber-700 dark:text-amber-300",
              bg: "stroke-amber-500/15 dark:stroke-amber-500/20",
              glow: "drop-shadow-[0_0_8px_rgba(245,158,11,0.2)]",
            }
          : {
              stroke: "stroke-rose-500 dark:stroke-rose-400",
              text: "text-rose-700 dark:text-rose-300",
              bg: "stroke-rose-500/15 dark:stroke-rose-500/20",
              glow: "drop-shadow-[0_0_8px_rgba(244,63,94,0.2)]",
            };

  return (
    <div
      className={cn(
        "relative inline-flex items-center justify-center select-none",
        className,
      )}
      style={{ width: sizeMap.dimension, height: sizeMap.dimension }}
      role="progressbar"
      aria-valuenow={clampedScore}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`Score de complétude: ${clampedScore}%`}
    >
      <svg
        className={cn("transform -rotate-90", colorTheme.glow)}
        width={sizeMap.dimension}
        height={sizeMap.dimension}
        viewBox={`0 0 ${sizeMap.dimension} ${sizeMap.dimension}`}
      >
        {/* Background track circle */}
        <circle
          cx={sizeMap.dimension / 2}
          cy={sizeMap.dimension / 2}
          r={sizeMap.radius}
          className={colorTheme.bg}
          strokeWidth={sizeMap.stroke}
          fill="transparent"
        />

        {/* Animated fill circle */}
        <circle
          cx={sizeMap.dimension / 2}
          cy={sizeMap.dimension / 2}
          r={sizeMap.radius}
          className={cn(
            "transition-all duration-700 ease-out",
            colorTheme.stroke,
          )}
          strokeWidth={sizeMap.stroke}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          fill="transparent"
        />
      </svg>

      {/* Centered Score Label */}
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
        <span className={cn(sizeMap.textSize, colorTheme.text, "leading-none")}>
          {clampedScore}
          {size !== "sm" && <span className="text-[0.65em] font-medium opacity-80">%</span>}
        </span>
        {showLabel && size !== "sm" && (
          <span className={cn(sizeMap.subTextSize, "text-muted-foreground mt-0.5 opacity-90")}>
            {subLabel}
          </span>
        )}
      </div>
    </div>
  );
}
