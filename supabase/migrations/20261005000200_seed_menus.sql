-- 메뉴 시드 (메뉴판 기준). 재실행해도 같은 결과가 되도록 upsert 한다.
-- 주문 항목은 주문 당시 이름·가격을 스냅샷으로 저장하므로, 여기서 가격을 바꿔도 지난 주문은 변하지 않는다.
insert into public.menus (id, name, price_krw, sort_order, active) values
  ('lasagna',        '알랭 라자냐',        10000, 10, true),
  ('chicken_nanban', '본쿠라 치킨난반',    10000, 20, true),
  ('cheese_corn',    '멕시칸 치즈 옥수수',  5000, 30, true),
  ('zero_highball',  '무알콜 하이볼',       5000, 40, true)
on conflict (id) do update set
  name = excluded.name,
  price_krw = excluded.price_krw,
  sort_order = excluded.sort_order,
  active = excluded.active;
