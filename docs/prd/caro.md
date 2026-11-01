# PRD — Cờ caro

## Vấn đề

Cần một bàn caro chơi được ngay, đấu bot hoặc hai người, bot giải thích nước đi.

## Luật

- Bàn 50×50, giao điểm không dùng — mỗi ô một quân.
- X đi trước. Năm quân liền theo hàng, cột hoặc chéo là thắng.
- Ô trống nằm giữa một dãy được tính khi quân lấp vào. `X . X X X` thành năm nếu đánh vào lỗ.
- Hết ô trống mà chưa ai thắng thì hòa.
- Không cấm nước, không bắt buộc chặn (luật tự do).

## Người dùng và việc họ làm

| Việc | Kỳ vọng |
|---|---|
| Đánh một ô trống đúng lượt | Quân hiện, lượt đổi |
| Đấu bot | Bot đi sau khoảng một nhịp, có thẻ lý do |
| Chơi hai người | Không có bot, nút chọn bên bị khóa |
| Đi lại | Gỡ nước cuối; đấu bot thì gỡ cả nước bot |
| Ván mới | Xóa bàn, giữ tỷ số |
| Tắt tiếng | Mặc định tắt |

Tỷ số thắng / thua / hòa với bot giữ trong `localStorage`, khóa `caro-ap-luc-v1`.

## Giao diện

- Nền nỉ `#241e18`, bàn giấy `#f3eadc`, X son `#a33b2b`, O chàm `#1d3e66`.
- Ô cuối có chấm. Ô thắng được đánh dấu.
- Thanh nghĩ chạy khi bot đang đọc.
- Danh sách nguyên lý bên cạnh, mục đúng loại nước vừa đi được tô.

## Không làm

- Không xếp hạng máy chủ.
- Không luật cấm nước, không renju.
- Không chọn độ khó. Bot đọc trước mười nước đáp, có năm giây để nghĩ.

## Tiêu chí nhận

| # | Việc | Đạt khi |
|---|---|---|
| 1 | Năm quân | Hàng, cột, chéo, kể cả có lỗ được lấp, kết thúc ván |
| 2 | Hòa | Bàn đầy, không ai năm quân |
| 3 | Bot khai cuộc | Ô giữa nếu bàn trống |
| 4 | Bot không bỏ thắng | Tự đấu: hễ có năm quân thì đánh |
| 5 | Hai người | Không sinh nước bot |
| 6 | Di động | 390 px không tràn trang; bàn 50×50 cuộn trong khung, ô 30 px |

## Ngoài phạm vi phiên này

Gợi ý nước cho người, hoàn tác nhiều bước có cây biến, lưu ván.
