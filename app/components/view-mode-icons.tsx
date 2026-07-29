import { useId } from "react";
import { cn } from "~/lib/utils";

type IconProps = { className?: string };

/** Solid view: a filled disc. */
export function SolidIcon({ className }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={24}
      height={24}
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
    </svg>
  );
}

/** Shaded view: a circle outline with diagonal hatching in the lower-left. */
export function ShadedIcon({ className }: IconProps) {
  const id = useId();
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={24}
      height={24}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <g clipPath={`url(#shade-${id})`}>
        <line x1="0" y1="4" x2="20" y2="24" />
        <line x1="0" y1="7" x2="17" y2="24" />
        <line x1="0" y1="10" x2="14" y2="24" />
        <line x1="0" y1="11" x2="13" y2="24" />
      </g>
      <defs>
        <clipPath id={`shade-${id}`}>
          <path d="M12 12 L3 12 A9 9 0 0 0 12 21 Z" />
        </clipPath>
      </defs>
    </svg>
  );
}

/** Wireframe view: a sphere silhouette with latitude and longitude lines. */
export function WireframeIcon({ className }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={24}
      height={24}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn(className)}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <ellipse cx="12" cy="12" rx="9" ry="3.4" />
      <ellipse cx="12" cy="12" rx="3.4" ry="9" />
    </svg>
  );
}
