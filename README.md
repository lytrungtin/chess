# Cờ — Caro và Tướng, bot Áp Lực

Hai bàn cờ trên một trang. Cùng một cách nghĩ: **thắng ngay thì đánh, bị đe dọa ngay thì chặn, rồi mới ép**. Không all-in vào một hàng yếu.

| Tab | Luật | Bot |
|---|---|---|
| Caro | 19×19, năm quân liền thắng | Heuristic đe dọa: thắng, chặn, song ba, áp lực |
| Tướng | Cờ tướng đủ luật | Negamax + alpha-beta, đọc sâu ở nước chính |

## Chơi

1. Mở tab **Caro** hoặc **Tướng**.
2. Mặc định đấu bot. Đỏ / X đi trước.
3. Bấm quân, rồi bấm ô đích. Chấm tròn là đi trống, vòng đỏ là ăn.
4. Thẻ bên phải ghi lý do nước vừa đi của bot.
5. Có thể đổi bên, chơi hai người, đi lại, bật tiếng. Tỷ số với bot nhớ trên máy.

## Tài liệu

| Tài liệu | Nội dung |
|---|---|
| [Nguyên lý hoạt động](docs/nguyen-ly.md) | Áp Lực đến từ bài kéo co ngân sách, ánh xạ sang cờ |
| [PRD — bot Áp Lực](docs/prd/bot-ap-luc.md) | Thứ tự quyết định dùng chung |
| [PRD — cờ caro](docs/prd/caro.md) | Luật, giao diện, tiêu chí nhận |
| [PRD — cờ tướng](docs/prd/tuong.md) | Luật, giao diện, tiêu chí nhận |
| [TDD](docs/tdd.md) | Định lý, thiết kế kỹ thuật, độ phức tạp, đánh đổi |

## Cấu trúc mã

```text
src/lib/caro/rules.ts      luật 19×19, năm quân
src/lib/caro/bot.ts        thứ tự Áp Lực trên hình cờ
src/lib/xiangqi/rules.ts   luật tướng, xét chiếu theo tia
src/lib/xiangqi/bot.ts     negamax, quiesce, đọc sâu có chọn
src/components/            giao diện hai bàn
src/routes/index.tsx       chuyển Caro | Tướng
scripts/caro-bot.test.ts
scripts/xiangqi.test.ts
```

Bot không gọi mạng. Mọi nước tính trên trình duyệt.

## Giới hạn cố ý

- Caro là heuristic, không chứng minh nước tối ưu.
- Tướng đọc hết hai nước đáp, rồi chỉ đọc thêm đến bốn nước ở sáu nước điểm cao.
- Thế chiếu dài hơn tầm đọc, hoặc nước đầu trông yếu, có thể lỡ.
- Lặp thế ba lần thì hòa. Không có luật chiếu vĩnh viễn của giải đấu.
