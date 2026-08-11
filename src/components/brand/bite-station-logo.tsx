import Image from "next/image";
import { cn } from "@/lib/utils";

/** Intrinsic pixel size of public/bite-station-logo-display.png */
const LOGO_WIDTH = 480;
const LOGO_HEIGHT = 320;

type BiteStationLogoProps = {
  className?: string;
  /** Rendered height in CSS pixels (width follows original aspect ratio). */
  size?: number;
  priority?: boolean;
};

/**
 * Official Bite Station logo (uploaded PNG).
 * Uses next/image optimization in production; keeps original proportions.
 */
export function BiteStationLogo({
  className,
  size = 48,
  priority = false,
}: BiteStationLogoProps) {
  const height = size;
  const width = Math.round((size * LOGO_WIDTH) / LOGO_HEIGHT);

  return (
    <Image
      src="/bite-station-logo-display.png"
      alt="Bite Station"
      width={width}
      height={height}
      priority={priority}
      loading={priority ? undefined : "lazy"}
      className={cn("shrink-0 object-contain", className)}
      style={{ width, height }}
      sizes={`${width}px`}
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
