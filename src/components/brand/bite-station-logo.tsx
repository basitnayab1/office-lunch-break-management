import Image from "next/image";
import { cn } from "@/lib/utils";

type BiteStationLogoProps = {
  className?: string;
  /** Rendered width/height in CSS pixels (keeps original square proportions). */
  size?: number;
  priority?: boolean;
};

/**
 * Official Bite Station logo (uploaded asset — do not redesign).
 */
export function BiteStationLogo({
  className,
  size = 48,
  priority = false,
}: BiteStationLogoProps) {
  return (
    <Image
      src="/bite-station-logo.png"
      alt="Bite Station"
      width={size}
      height={size}
      priority={priority}
      unoptimized
      className={cn("shrink-0 object-contain", className)}
      style={{ width: size, height: size }}
    />
  );
}

/** Compact brand lockup: logo + “Bite Station” label. */
export function BiteStationBrand({
  className,
  logoSize = 40,
  showTagline = false,
  inverted = false,
  priority = false,
}: {
  className?: string;
  logoSize?: number;
  showTagline?: boolean;
  inverted?: boolean;
  priority?: boolean;
}) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <BiteStationLogo size={logoSize} priority={priority} />
      <div className="min-w-0">
        <p
          className={cn(
            "truncate text-sm font-semibold tracking-wide",
            inverted ? "text-white" : "text-[var(--brand)]"
          )}
        >
          Bite Station
        </p>
        {showTagline ? (
          <p
            className={cn(
              "text-[11px] uppercase tracking-[0.16em]",
              inverted ? "text-white/75" : "text-[var(--ink-muted)]"
            )}
          >
            Eat · Relax · Recharge
          </p>
        ) : null}
      </div>
    </div>
  );
}
