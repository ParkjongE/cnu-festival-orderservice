"use client";

import { useEffect } from "react";

/**
 * 오래된 브라우저 안내.
 * Next.js 16·Tailwind 4 는 iOS Safari 16.4+, Chrome 111+ 에서 동작한다. 그보다 오래된 휴대폰에서는
 * 앱 스크립트가 실행되지 않아 '불러오는 중…'에 멈추므로, 앱과 상관없이 실행되는 옛 문법(ES5) 스크립트로
 * 기능을 검사해 안내 문구를 띄운다.
 * - 즉시: 정규식 후방 탐색(Safari 16.4 에서 추가) 미지원 → 오래된 브라우저로 판단
 * - 20초 후: 앱이 여전히 시작되지 않았으면(느린 네트워크 등) 새로고침 안내
 */
const CHECK_SCRIPT = `(function(){
  var el = document.getElementById('ytd-legacy');
  var msg = document.getElementById('ytd-legacy-msg');
  if (!el || !msg) return;
  var old = false;
  try { new RegExp('(?<=a)b'); } catch (e) { old = true; }
  if (old) { el.hidden = false; return; }
  setTimeout(function(){
    if (!window.__ytdReady) {
      msg.textContent = '화면을 불러오지 못하고 있어요. 새로고침하거나, 다른 브라우저로 열어주세요. 계속 안 되면 부스에서 번호를 확인해주세요.';
      el.hidden = false;
    }
  }, 20000);
})();`;

export function LegacyBrowserNotice() {
  useEffect(() => {
    (window as unknown as { __ytdReady?: boolean }).__ytdReady = true;
    document.getElementById("ytd-legacy")?.setAttribute("hidden", "");
  }, []);

  return (
    <>
      <div
        id="ytd-legacy"
        hidden
        role="alert"
        style={{
          position: "fixed",
          left: 12,
          right: 12,
          bottom: 12,
          zIndex: 50,
          padding: "14px 16px",
          border: "3px solid #191814",
          borderRadius: 12,
          background: "#f4d447",
          color: "#191814",
          fontSize: 16,
          fontWeight: 700,
          lineHeight: 1.45,
        }}
      >
        <span id="ytd-legacy-msg">
          이 휴대폰의 브라우저 버전이 오래돼 주문 확인 화면이 열리지 않을 수 있어요. 휴대폰을 업데이트하거나, 부스에서
          번호를 확인해주세요.
        </span>
      </div>
      <script dangerouslySetInnerHTML={{ __html: CHECK_SCRIPT }} />
    </>
  );
}
