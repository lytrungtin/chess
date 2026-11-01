# PRD — Cờ tướng

## Vấn đề

Thêm cờ tướng cạnh caro, không thay caro. Bot dùng cùng thứ tự Áp Lực, đo quãng bằng tìm kiếm thay vì khớp hình.

## Luật

Bàn 9 cột × 10 hàng giao điểm. Đỏ ở dưới (hàng 9), đen ở trên (hàng 0).

| Quân | Đi |
|---|---|
| Tướng | Một ô ngang hoặc dọc trong cung. Hai tướng không đối mặt trên cột trống |
| Sĩ | Một ô chéo trong cung |
| Tượng | Hai ô chéo, bị chặn ở mắt, không sang sông |
| Mã | Ngày, bị chặn ở chân |
| Xe | Hết tầm ngang dọc, không nhảy |
| Pháo | Đi như xe; ăn thì đúng một quân làm màn |
| Tốt | Tiến một ô. Qua sông được đi ngang. Đỏ qua sông khi hàng ≤ 4, đen khi hàng ≥ 5 |

- Đỏ đi trước.
- Hết nước khi đang bị chiếu, hoặc tướng bị bắt, là thua. Hết nước mà không bị chiếu cũng tính thua (bí).
- Cùng thế và cùng bên đi lặp ba lần thì hòa.
- Không có luật chiếu vĩnh viễn, không có nước bắt buộc khác luật trên.

Khai cuộc chuẩn: xe mã tượng sĩ tướng sĩ tượng mã xe; pháo hàng 2 và 7; tốt cột 0, 2, 4, 6, 8.

## Người dùng và việc họ làm

| Việc | Kỳ vọng |
|---|---|
| Chọn quân đúng lượt | Hiện chấm ô trống và vòng ô ăn |
| Đánh nước hợp lệ | Quân đi, lượt đổi, nước cuối có viền |
| Nước không hợp lệ | Không đổi bàn |
| Bị chiếu | Dòng trạng thái báo, cung được đánh dấu |
| Đấu bot | Bot đi, thẻ ghi chiếu hết / thoát chiếu / ép chiếu / ăn quân / áp lực |
| Cầm đen | Bot đi trước |
| Đi lại | Gỡ nước cuối; đấu bot thì gỡ cả cặp |
| Hai người | Không bot |

Tỷ số giữ trong `localStorage`, khóa `xiangqi-ap-luc-v1`.

## Giao diện

- Cùng token với caro.
- Bàn giấy, sông ghi 楚河 / 漢界, cung có chéo.
- Quân tròn: đỏ son chữ 帥仕相傌俥炮兵, đen mực chữ 將士象馬車砲卒.
- Khung đệm 6% để quân biên không bị cắt.

## Không làm

- Không sách khai cuộc, không tàn cuộc bảng.
- Không UCI, không máy chủ.
- Không đọc hết bàn sâu hơn hai nước — chỉ sâu thêm ở nước chính, trong 420 ms.

## Tiêu chí nhận

| # | Việc | Đạt khi |
|---|---|---|
| 1 | Khai cuộc | Đỏ có 44 nước, đen đối xứng |
| 2 | Chân mã | Mã (1,9) có 2 nước, không nhảy qua tượng |
| 3 | Tốt | Trước sông chỉ tiến; qua sông trên cột giữa có 3 nước |
| 4 | Tượng | Không sang sông, bị chặn mắt |
| 5 | Đối mặt | Hai tướng cột trống không được giữ nguyên |
| 6 | Chiếu hết một nước | Bot đánh, nhãn chiếu hết |
| 7 | Quân treo | Xe đen ở (0,7) bị ăn |
| 8 | Không all-in | Pháo không ăn mã đầu nếu xe ăn lại |
| 9 | Tốc độ | Khai cuộc < 650 ms |
| 10 | Di động | 390 px không tràn, quân biên bấm được |

## Ngoài phạm vi

Chiếu vĩnh viễn, cầu hòa, đồng hồ, xem lại cả ván từng nước.
