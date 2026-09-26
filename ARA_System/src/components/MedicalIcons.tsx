import type { ReactNode } from "react";

type IconProps = {
  size?: number;
  className?: string;
};

function Base({ size = 18, className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.8}
      viewBox="0 0 24 24"
      width={size}
    >
      {children}
    </svg>
  );
}

export function IconPaw(props: IconProps) {
  return (
    <Base {...props}>
      <ellipse cx="6.2" cy="9.2" rx="2.1" ry="2.7" />
      <ellipse cx="9.5" cy="5.4" rx="2.1" ry="2.5" />
      <ellipse cx="14.5" cy="5.4" rx="2.1" ry="2.5" />
      <ellipse cx="17.8" cy="9.2" rx="2.1" ry="2.7" />
      <path d="M6.9 12.8C6.9 12.8 5.2 14.9 5.2 17a3 3 0 0 0 3 3h7.6a3 3 0 0 0 3-3c0-2.1-1.7-4.2-1.7-4.2" />
    </Base>
  );
}

export function IconStethoscope(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M4.8 2.6v4.3a4.7 4.7 0 0 0 9.4 0V2.6" />
      <path d="M8 2.6h7" />
      <path d="M11 11.5v4.9" />
      <path d="M11 16.4a5.5 5.5 0 0 0 5.5 5.5" />
      <path d="M16.5 21.9h.1" />
    </Base>
  );
}

export function IconClipboard(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M9 4h6" />
      <path d="M9.2 3.4a1 1 0 0 0-1 1V6a1 1 0 0 0 1 1h5.6a1 1 0 0 0 1-1V4.4a1 1 0 0 0-1-1" />
      <path d="M7 6.5v13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-13" />
      <path d="M9 12h6" />
      <path d="M9 15.5h6" />
      <path d="M9 19h3" />
    </Base>
  );
}

export function IconShieldCheck(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M12 2.5 19 5.2v5.9c0 5-3.1 8.5-7 10.4-3.9-1.9-7-5.4-7-10.4V5.2z" />
      <path d="m8.7 11.6 2.3 2.3 4.3-4.7" />
    </Base>
  );
}

export function IconCalendar(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="3.5" y="5" width="17" height="16" rx="3" />
      <path d="M8 2.8V7" />
      <path d="M16 2.8V7" />
      <path d="M3.5 10.5h17" />
    </Base>
  );
}

export function IconClock(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.2 2" />
    </Base>
  );
}

export function IconHeart(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M12 20.3C12 20.3 4 14.8 4 9.6 4 6.7 6.2 4.7 8.8 4.7c1.5 0 2.6.8 3.2 2 .6-1.2 1.7-2 3.2-2 2.6 0 4.8 2 4.8 4.9 0 5.2-8 10.7-8 10.7z" />
    </Base>
  );
}

export function IconMedical(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="12" cy="12" r="9.2" />
      <path d="M12 8.2v7.6" />
      <path d="M8.2 12h7.6" />
    </Base>
  );
}

export function IconCheck(props: IconProps) {
  return (
    <Base {...props}>
      <path d="m5 12.5 4.5 4.5L19 7" />
    </Base>
  );
}

export function IconLock(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="5" y="11" width="14" height="9.5" rx="2.5" />
      <path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3" />
    </Base>
  );
}

export function IconArrowRight(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M4.5 12h15" />
      <path d="m13.5 6 6 6-6 6" />
    </Base>
  );
}

export function IconArrowLeft(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M19.5 12h-15" />
      <path d="m10.5 6-6 6 6 6" />
    </Base>
  );
}

export function IconPlus(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </Base>
  );
}

export function IconActivity(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M3 12h3.2L8.5 6l4.8 12 2.3-6H21" />
    </Base>
  );
}

export function IconSyringe(props: IconProps) {
  return (
    <Base {...props}>
      <path d="m18 2 4 4" />
      <path d="m17 7 3-3" />
      <path d="M19 9 8.7 19.3c-1 1-2.5 1-3.4 0l-.6-.6c-1-1-1-2.5 0-3.4L15 5" />
      <path d="m9 11 4 4" />
      <path d="m5 19-3 3" />
      <path d="m14 16 2.5 2.5" />
    </Base>
  );
}

export function IconPill(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M8.5 2.5c4.4 0 8 3.6 8 8a4.2 4.2 0 0 1-1.2 3L13.3 15a4.2 4.2 0 0 1-6-6L5.3 11" />
      <path d="M7.5 19.5 15.5 6.5" />
      <path d="m4.7 11.7 2.1-2.1" />
      <path d="m12.3 19.3 2.1-2.1" />
    </Base>
  );
}

export function IconBandage(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M10 10.01h.01" />
      <path d="M10 14.01h.01" />
      <path d="M14 10.01h.01" />
      <path d="M14 14.01h.01" />
      <path d="M18 6v11.5" />
      <path d="M6 6v4" />
      <path d="M6 15v1" />
      <path d="m15.5 17.5-9 9" />
      <path d="M16 3h.01" />
    </Base>
  );
}

export function IconScissors(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="6" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M20 4 8.12 15.88" />
      <path d="M14.47 14.48 20 20" />
      <path d="M8.12 8.12 12 12" />
    </Base>
  );
}

export function IconThermometer(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M14 4v10.5a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z" />
    </Base>
  );
}

export function IconInfo(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11.2v4.6" />
      <path d="M12 8.1h.01" />
    </Base>
  );
}

export function IconSparkle(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M12 3.5 13.6 8.4 18.5 10 13.6 11.6 12 16.5 10.4 11.6 5.5 10 10.4 8.4Z" />
      <path d="M18.5 16 19.3 18.2 21.5 19 19.3 19.8 18.5 22 17.7 19.8 15.5 19 17.7 18.2Z" />
    </Base>
  );
}

export function IconUser(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M5 20.5a7 7 0 0 1 14 0" />
    </Base>
  );
}

export function IconPawPrint(props: IconProps) {
  return (
    <Base {...props}>
      <ellipse cx="6.2" cy="9.2" rx="2.1" ry="2.7" />
      <ellipse cx="9.5" cy="5.4" rx="2.1" ry="2.5" />
      <ellipse cx="14.5" cy="5.4" rx="2.1" ry="2.5" />
      <ellipse cx="17.8" cy="9.2" rx="2.1" ry="2.7" />
      <path d="M6.9 12.8C6.9 12.8 5.2 14.9 5.2 17a3 3 0 0 0 3 3h7.6a3 3 0 0 0 3-3c0-2.1-1.7-4.2-1.7-4.2" />
    </Base>
  );
}

export function IconCalendarCheck(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="3.5" y="5" width="17" height="16" rx="3" />
      <path d="M8 2.8V7" />
      <path d="M16 2.8V7" />
      <path d="M3.5 10.5h17" />
      <path d="m9 14.5 2 2 4-4.5" />
    </Base>
  );
}

export function IconCalendarPlus(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="3.5" y="5" width="17" height="16" rx="3" />
      <path d="M8 2.8V7" />
      <path d="M16 2.8V7" />
      <path d="M3.5 10.5h17" />
      <path d="M12 13.5v5" />
      <path d="M9.5 16h5" />
    </Base>
  );
}

export function IconNotes(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M8 4h8a1 1 0 0 1 1 1v15l-2.7-2.2L11.6 21 6 16.5V5a1 1 0 0 1 1-1Z" />
      <path d="M9.5 8.5h5" />
      <path d="M9.5 11.5h5" />
    </Base>
  );
}

export function IconEdit(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M14.5 4.5 19.5 9.5 8.7 20.3a3.2 3.2 0 0 1-1.3.8l-3.4 1 .5-3.4a3.2 3.2 0 0 1 .8-1.3z" />
      <path d="m12.5 6.5 5 5" />
    </Base>
  );
}