import Image from "next/image";

type BrandMarkProps = {
  variant?: "mark" | "lockup";
  tone?: "brand" | "inverse";
  accessibleLabel?: string | null;
  className?: string;
  priority?: boolean;
};

export function BrandMark({
  variant = "mark",
  tone = "brand",
  accessibleLabel = "Whistle",
  className,
  priority = false,
}: BrandMarkProps) {
  const isLockup = variant === "lockup";
  const source = isLockup
    ? tone === "inverse"
      ? "/brand/whistle-lockup-inverse.png"
      : "/brand/whistle-lockup.png"
    : "/brand/whistle-logo.png";

  return (
    <Image
      className={className}
      src={source}
      width={isLockup ? 1600 : 1024}
      height={isLockup ? 360 : 1024}
      alt={accessibleLabel ?? ""}
      aria-hidden={accessibleLabel ? undefined : true}
      priority={priority}
    />
  );
}
