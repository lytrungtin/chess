# PRD — Bot Áp Lực

Thứ tự quyết định dùng chung cho caro và tướng. Đây là tính năng lõi, không phải giao diện.

## Vấn đề

Người chơi muốn đấu một đối thủ có lý do cho từng nước, không phải nước ngẫu nhiên và cũng không cần máy chủ. Bot phải:

- không bỏ lỡ thắng ngay,
- không để đối thủ thắng ngay,
- không đổ quân vào hướng yếu.

## Người dùng

Người chơi một mình trên trình duyệt, tiếng Việt, không đăng nhập.

## Mục tiêu

- Mọi nước của bot thuộc đúng một nhãn: thắng, chặn, đòn đôi, chặn đòn đôi, áp lực (caro) hoặc chiếu hết, thoát chiếu, ép chiếu, ăn quân, áp lực (tướng).
- Nhãn và một câu giải thích hiện trên thẻ, cùng lúc với nước đi.
- Không gọi mạng. Một nước trả lời trong khoảng nửa giây.

## Không làm

- Không học từ ván người chơi.
- Không mở sách khai cuộc.
- Không chứng minh nước tối ưu trên bàn 15×15 hay trên cờ tướng đủ quân.
- Không có luật chiếu vĩnh viễn của giải đấu.

## Luồng quyết định

1. Nếu ta có nước kết thúc ván ngay → đánh, nhãn thắng / chiếu hết.
2. Nếu địch có nước kết thúc ngay → chặn hoặc thoát, trước mọi nước đẹp.
3. Nếu ta tạo được hai mối địch không chặn cùng lúc → tạo, nhãn song ba / ép chiếu.
4. Nếu địch sắp có đòn đôi → chặn ô đó.
5. Còn lại → áp lực theo quãng, có trần để không all-in.

Caro làm thắng, chặn và đòn đôi bằng khớp hình, rồi đọc hai nước đáp trên nước ép. Tướng làm 1 bằng quét chiếu hết một nước, 2–5 bằng tìm kiếm có điểm.

## Tiêu chí nhận

| # | Việc | Đạt khi |
|---|---|---|
| 1 | Thắng ngay | Có nước năm quân hoặc chiếu hết thì bot đánh nước đó |
| 2 | Chặn ngay | Địch có nước thắng ngay thì bot chặn, kể cả khi ta cũng có hình đẹp |
| 3 | Đòn đôi | Caro: hai ô thắng hoặc hai ba hở thì lấy. Tướng: điểm > nửa mức chiếu hết thì nhãn ép chiếu |
| 4 | Không all-in | Caro không đuổi hàng yếu khi có đe dọa gần. Tướng không ăn mã bằng pháo nếu xe ăn lại |
| 5 | Giải thích | Thẻ có nhãn và một câu tiếng Việt đúng nhãn |
| 6 | Tốc độ | Khai cuộc tướng < 650 ms trên máy thử |

## Đo

- `scripts/caro-bot.test.ts`: tâm bàn, thắng có lỗ, chặn, song ba, tự đấu không bỏ thắng.
- `scripts/xiangqi.test.ts`: chiếu hết, quân treo, không đổi pháo lấy mã, khai cuộc trong ngân sách thời gian.
