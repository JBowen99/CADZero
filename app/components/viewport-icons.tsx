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
      <path d="M12 5 L20.5 12 L12 19 L3.5 12 Z" />
      <path d="M14.13 6.75 L5.63 13.75 M16.25 8.5 L7.75 15.5 M18.38 10.25 L9.88 17.25" />
      <path d="M9.88 6.75 L18.38 13.75 M7.75 8.5 L16.25 15.5 M5.63 10.25 L14.13 17.25" />
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
      <path d="M12 13.5 L12 5" />
      <path d="M12 13.5 L19 19" />
      <path d="M12 13.5 L5 19" />
    </svg>
  );
}

/** View cube: a wireframe cube viewed from the front-top, centered. */
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
      <path d="M12 4.5 L18 8.25 L18 15.75 L12 19.5 L6 15.75 L6 8.25 Z" />
      <path d="M12 12 L12 19.5 M12 12 L6 8.25 M12 12 L18 8.25" />
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
