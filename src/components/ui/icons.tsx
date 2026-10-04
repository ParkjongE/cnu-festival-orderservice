import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement>;

const base = (props: P): P => ({
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2.4,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
  ...props,
});

/** 준비 중: 냄비 */
export function PotIcon(props: P) {
  return (
    <svg {...base(props)}>
      <path d="M4 11h16v4a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5v-4Z" />
      <path d="M2 11h20M9 7c0-1 1-1.5 1-2.5M14 7c0-1 1-1.5 1-2.5" />
    </svg>
  );
}

/** 수령 가능: 종 */
export function BellIcon(props: P) {
  return (
    <svg {...base(props)}>
      <path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16Z" />
      <path d="M10 21h4" />
    </svg>
  );
}

/** 수령 완료: 체크 */
export function CheckIcon(props: P) {
  return (
    <svg {...base(props)}>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  );
}

export function XIcon(props: P) {
  return (
    <svg {...base(props)}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

export function QuestionIcon(props: P) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5v.4M12 17h.01" />
    </svg>
  );
}

export function MoonIcon(props: P) {
  return (
    <svg {...base(props)}>
      <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" />
    </svg>
  );
}

export function SignalOffIcon(props: P) {
  return (
    <svg {...base(props)}>
      <path d="M2 8.5a15 15 0 0 1 4-2.4M10 5a15 15 0 0 1 12 3.5M5 12.5a10 10 0 0 1 3-1.8M15 11a10 10 0 0 1 4 1.5M8.5 16a5 5 0 0 1 7 0M12 20h.01M3 3l18 18" />
    </svg>
  );
}

export function InfoIcon(props: P) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </svg>
  );
}

export function PlusIcon(props: P) {
  return (
    <svg {...base(props)}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function MinusIcon(props: P) {
  return (
    <svg {...base(props)}>
      <path d="M5 12h14" />
    </svg>
  );
}

export function SearchIcon(props: P) {
  return (
    <svg {...base(props)}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4-4" />
    </svg>
  );
}

export function UndoIcon(props: P) {
  return (
    <svg {...base(props)}>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
    </svg>
  );
}

export function ChevronIcon(props: P) {
  return (
    <svg {...base(props)}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

/** 포스터의 뾰족한 별 */
export function StarBurst({ className, ...props }: P) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden {...props}>
      <path
        fill="currentColor"
        d="M20 0l3.6 12.4L35.6 6l-6.4 12.1L40 20l-10.8 1.9L35.6 34l-12-6.4L20 40l-3.6-12.4L4.4 34l6.4-12.1L0 20l10.8-1.9L4.4 6l12 6.4Z"
      />
    </svg>
  );
}

export function SmallStar({ className, ...props }: P) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden {...props}>
      <path fill="currentColor" d="m10 1 2.6 6.1 6.4.5-4.9 4.2 1.5 6.4L10 14.8l-5.6 3.4 1.5-6.4L1 7.6l6.4-.5Z" />
    </svg>
  );
}
