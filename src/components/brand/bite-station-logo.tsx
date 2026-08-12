import Image from "next/image";
import { cn } from "@/lib/utils";

/** Intrinsic size of public/bite-station-logo-transparent.png */
const LOGO_WIDTH = 961;
const LOGO_HEIGHT = 594;

type BiteStationLogoProps = {
  className?: string;
  /** Rendered height in CSS pixels (width follows original aspect ratio). */
  size?: number;
  priority?: boolean;
};

/**
 * Official app logo.
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
      src="/bite-station-logo-transparent.png"
      alt="//:ai"
      width={width}
      height={height}
      priority={priority}
      loading={priority ? undefined : "lazy"}
      unoptimized
      className={cn("shrink-0 object-contain", className)}
      style={{ width, height }}
      sizes={`${width}px`}
    />
  );
}

/** Compact brand lockup: logo only. */
export function BiteStationBrand({
  className,
  logoSize = 40,
  priority = false,
}: {
  className?: string;
  logoSize?: number;
  showTagline?: boolean;
  inverted?: boolean;
  priority?: boolean;
}) {
  return (
    <div className={cn("flex items-center", className)}>
      <BiteStationLogo size={logoSize} priority={priority} />
    </div>
  );
}
