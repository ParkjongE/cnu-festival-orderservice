/** '준비 중…' 의 점 세 개가 차례로 깜빡인다 (모션 감소 설정 시 정지, globals.css 의 .cooking-dots) */
export function CookingDots() {
  return (
    <span aria-hidden className="cooking-dots -ml-1 inline-flex">
      <span>.</span>
      <span>.</span>
      <span>.</span>
    </span>
  );
}
