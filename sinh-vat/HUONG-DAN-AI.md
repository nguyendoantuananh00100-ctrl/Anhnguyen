# Gắn Gemini miễn phí cho Tranh Sống

Game chạy được ngay mà không cần bước nào ở đây: AI trên máy đã đoán được bức vẽ là con gì (345 loại). Gemini chỉ thêm phần "linh hồn": tên riêng, tính cách, chỉ số và lời thoại hợp với từng bức vẽ.

Có hai cách. Cách 1 nhanh nhất (5 phút) khi chỉ mình bạn chơi. Cách 2 dùng khi muốn gửi link cho bạn bè mà không lộ khóa.

## Cách 1: dán khóa thẳng vào game (chỉ lưu trên máy bạn)

1. Mở https://aistudio.google.com/apikey bằng tài khoản Google.
2. Bấm **Create API key** (Tạo khóa API). Nếu được hỏi chọn dự án, chọn dự án có sẵn hoặc để Google tạo mới.
3. Bấm biểu tượng sao chép để chép khóa (bắt đầu bằng `AIza...`).
4. Mở game, bấm **⚙️ AI & cài đặt**, dán khóa vào ô "Cách 1", bấm **Lưu và kiểm tra**. Thấy ✅ là xong.

Khóa chỉ nằm trong bộ nhớ trình duyệt trên điện thoại của bạn, không nằm trong mã nguồn. Đừng dán khóa lên máy của người khác.

## Cách 2: Cloudflare Worker (để chia sẻ link cho bạn bè)

Worker là một máy chủ nhỏ miễn phí, giữ khóa giúp bạn. Người chơi chỉ cần dán địa chỉ Worker, không thấy khóa.

1. Lấy khóa Gemini như bước 1–3 ở trên.
2. Đăng ký miễn phí tại https://dash.cloudflare.com/sign-up.
3. Vào **Workers & Pages** → **Create** → **Create Worker** → đặt tên, ví dụ `tranh-song` → **Deploy**.
4. Bấm **Edit code**, xóa hết mã mẫu, dán toàn bộ nội dung file [`worker.js`](worker.js) → **Deploy**.
5. Quay lại trang Worker → **Settings** → **Variables and Secrets** → **Add**: chọn loại **Secret**, tên `GEMINI_KEY`, giá trị là khóa của bạn → **Deploy**.
6. Chép địa chỉ Worker (dạng `https://tranh-song.ten-ban.workers.dev`), dán vào ô "Cách 2" trong cài đặt game, bấm **Lưu và kiểm tra**.

## Giới hạn và lưu ý

- Gói miễn phí của Gemini có giới hạn số lượt mỗi phút và mỗi ngày. Khi hết lượt, game báo "Hết lượt miễn phí tạm thời" và vẫn chơi tiếp bằng AI trên máy.
- Ở gói miễn phí, Google có thể dùng dữ liệu gửi lên để cải thiện dịch vụ. Game chỉ gửi hình sinh vật đã cắt ra, không gửi ảnh phòng.
- Nếu Google đổi tên mô hình, sửa ô "Tên mô hình Gemini" trong cài đặt (với Worker: thêm biến `MODEL`).
