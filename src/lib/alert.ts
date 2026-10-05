/**
 * 조리 완료 알림(화면을 보고 있을 때만): 짧은 '띵동' 소리 + 진동.
 * - 소리는 Web Audio 로 합성한다(음원 파일 없음).
 * - 브라우저는 사용자가 한 번 탭해야 소리·진동을 허용한다 → unlockAlerts() 를 탭 이벤트에서 부른다.
 * - iPhone 은 웹 진동을 지원하지 않고, 무음 모드에서는 소리도 나지 않는다.
 */

type AudioCtor = typeof AudioContext;

let ctx: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor: AudioCtor | undefined =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext;
  if (!Ctor) return null;
  ctx ??= new Ctor();
  return ctx;
}

/** 탭(사용자 동작) 안에서 호출해 소리를 쓸 수 있게 한다. */
export async function unlockAlerts(): Promise<void> {
  const c = getContext();
  if (!c) return;
  try {
    if (c.state !== "running") await c.resume();
    // 아주 짧은 무음을 재생해 iOS 에서도 오디오를 깨운다
    const buffer = c.createBuffer(1, 1, 22050);
    const src = c.createBufferSource();
    src.buffer = buffer;
    src.connect(c.destination);
    src.start(0);
  } catch {
    // 허용되지 않으면 다음 탭에서 다시 시도된다
  }
}

export function alertsReady(): boolean {
  return ctx?.state === "running";
}

function tone(c: AudioContext, freq: number, start: number, duration: number) {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.35, start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain).connect(c.destination);
  osc.start(start);
  osc.stop(start + duration + 0.05);
}

/** '띵동' 두 번 + 진동 (지원하는 기기만) */
export async function playReadyAlert(): Promise<void> {
  const c = getContext();
  if (c) {
    try {
      if (c.state !== "running") await c.resume();
      const t = c.currentTime + 0.05;
      for (const offset of [0, 0.9]) {
        tone(c, 1046.5, t + offset, 0.35); // 도(높은)
        tone(c, 784, t + offset + 0.32, 0.5); // 솔
      }
    } catch {
      // 소리가 막혀 있어도 화면 변경과 진동은 그대로 동작한다
    }
  }
  try {
    navigator.vibrate?.([250, 120, 250, 120, 500]);
  } catch {
    // 진동 미지원
  }
}

export const vibrationSupported = () => typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
