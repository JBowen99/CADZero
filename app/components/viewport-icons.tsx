type IconProps = { className?: string };

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

/** Reference grid: a ground plane drawn in perspective with a cell grid. */
export function GridPlaneIcon({ className }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={24}
      height={24}
      className={className}
      aria-hidden="true"
      {...stroke}
    >
      <path d="M12 3 L21 10 L12 17 L3 10 Z" />
      <path d="M14.25 4.75 L5.25 11.75 M16.5 6.5 L7.5 13.5 M18.75 8.25 L9.75 15.25" />
      <path d="M9.75 4.75 L18.75 11.75 M7.5 6.5 L16.5 13.5 M5.25 8.25 L14.25 15.25" />
    </svg>
  );
}

/** Reference axes: X/Y/Z rays splayed at the same perspective angle. */
export function AxesIcon({ className }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={24}
      height={24}
      className={className}
      aria-hidden="true"
      {...stroke}
    >
      <path d="M12 14 L12 3.5" />
      <path d="M12 14 L20 19.5" />
      <path d="M12 14 L4 19.5" />
    </svg>
  );
}

/** View cube: a wireframe cube in the same perspective. */
export function CubeIcon({ className }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={24}
      height={24}
      className={className}
      aria-hidden="true"
      {...stroke}
    >
      <path d="M12 4.5 L18 9 L18 16.5 L12 21 L6 16.5 L6 9 Z" />
      <path d="M12 12 L12 4.5 M12 12 L18 16.5 M12 12 L6 16.5" />
    </svg>
  );
}

/** Frame model: corner brackets forming a viewfinder frame. */
export function FrameIcon({ className }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={24}
      height={24}
      className={className}
      aria-hidden="true"
      {...stroke}
    >
      <path d="M15 3 H21 V9 M21 15 V21 H15 M9 21 H3 V15 M3 9 V3 H9" />
    </svg>
  );
}
