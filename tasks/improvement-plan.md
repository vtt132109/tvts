# Kế Hoạch Cải Tiến Toàn Diện (lập 2026-11-01)

Dựa trên rà soát code + các thay đổi đã push (`4429a61..7ad2b68`). Kế hoạch cũ `tasks/plan.md` đã hoàn tất, giữ để tham khảo.

Nguyên tắc: mỗi bước nhỏ, có test chạy được, commit riêng; không đụng dữ liệu thật trên Cloud; việc cần quyền Firebase/GitHub ghi rõ là **[BẠN]**.

---

## Giai đoạn 0 — Đưa bản vừa push vào chạy thật **[BẠN]**

| # | Việc | Xong khi |
|---|---|---|
| 0.1 | Chờ GitHub Actions deploy xong | Job `test`, `e2e`, `deploy` xanh |
| 0.2 | Mở admin, đẩy dữ liệu công khai | `tvts_public/mssvIndex` có đủ MSSV roster |
| 0.3 | Publish `database.rules.json` | Firebase Console báo thành công |
| 0.4 | Thử tay bằng tài khoản sinh viên: đăng ký 0 ca, đăng ký có ca, gửi đổi ca, MSSV ngoài roster | 4 ca đúng kỳ vọng (ca cuối bị từ chối) |
| 0.5 | Nếu 0 ca bị từ chối (Firebase bỏ mảng rỗng nên mất `shifts`) → làm bước 1.1 | — |

Rủi ro: Publish Rules trước 0.2 sẽ chặn sinh viên mới. Hoàn tác: Publish lại Rules cũ từ commit `4429a61`.

## Giai đoạn 1 — Sửa lỗi & lỗ hổng còn lại (ưu tiên cao)

| # | Việc | Cách làm | Kiểm chứng |
|---|---|---|---|
| 1.1 | Đăng ký **0 ca** có thể bị Rules từ chối | Client luôn gửi cờ rõ ràng (`shiftCount: 0`) thay vì dựa vào `shifts` rỗng; Rules chỉ yêu cầu `shiftCount` | Test rules + test client; thử tay 0.4 |
| 1.2 | Chiếm MSSV khi biết MSSV người khác | Chọn 1 trong 2 (**[BẠN] quyết**): (a) đăng nhập Google email trường rồi map email↔MSSV; (b) mã xác nhận ngắn do BĐH phát qua nhóm. Giữ "Giải phóng MSSV" làm đường cứu | Test: phiên lạ không ghi đè được |
| 1.3 | `mssvIndex` PATCH nên không bao giờ xoá MSSV cũ | Thêm hành động admin "Đồng bộ lại chỉ mục" (PUT thay thế) khi xoá CTV | Test: xoá CTV → MSSV hết quyền chiếm |
| 1.4 | PIN từng lộ + lịch sử git | **[BẠN]** đổi PIN; quyết định `git filter-repo` theo SECURITY.md mục 11 (destructive, cần đồng ý) | `git log --all -- .antigravity/memory` sạch (nếu viết lại) |
| 1.5 | Xác minh các mô tả cũ trong `SECURITY.md` ("Thiết lập lần đầu", đăng nhập cục bộ) | Đối chiếu với `admin.js`/`admin.html`, sửa theo thực tế | Đọc lại, không mâu thuẫn code |
| 1.6 | Rà `admin.html` 28 `onclick=` + 102 `innerHTML` để tìm chỗ chưa escape dữ liệu người dùng | Grep từng chỗ có biến nội suy; thêm test XSS cho chỗ thiếu | `tests/auth.test.js` + test mới |

## Giai đoạn 2 — Bảo mật chiều sâu

| # | Việc | Ghi chú |
|---|---|---|
| 2.1 | Thêm CSP (không `unsafe-inline` cho script) | Cần đổi 32 inline handler sang `addEventListener` trước → làm sau 3.x |
| 2.2 | SRI (`integrity`) cho Firebase SDK từ gstatic | Ghim đúng phiên bản 10.12.5 |
| 2.3 | Bật Firebase App Check | **[BẠN]** bật trên Console; code đã có hỗ trợ (suite 8) |
| 2.4 | Giới hạn tần suất ghi (chống spam đăng ký) | Rules: so `submittedAt` với `now`; hoặc kiểm tra kích thước payload |
| 2.5 | Giảm chép cứng email: cân nhắc node `owner` trong DB | Chỉ làm nếu chấp nhận bước Console thủ công; hiện đã có `scripts/set_owner_email.js` + test 12.22 |

## Giai đoạn 3 — Bảo trì mã nguồn (làm từng mảnh, không big-bang)

Điều kiện chung trước mỗi mảnh: `npm test` + `npm run test:e2e` xanh; sau mảnh: chạy lại cả hai và chụp ảnh admin desktop/mobile.

| # | Mảnh tách khỏi `admin.js` (10.8k dòng) | Ưu tiên |
|---|---|---|
| 3.1 | Hàm thuần không đụng DOM (thống kê, lọc, định dạng) → `js/admin_stats.js` | Cao, rủi ro thấp |
| 3.2 | Chấm công & sự kiện (payroll) | Trung bình |
| 3.3 | Hồ sơ tháng, sao lưu, nhập CSV | Trung bình |
| 3.4 | Giao diện xếp lịch + gán tay | Thấp (đụng nhiều DOM) |
| 3.5 | `cloud_sync.js` (3.4k): tách `cloud_rest.js` (REST/Auth), `cloud_public.js` (payload công khai) | Trung bình |
| 3.6 | `style.css` 7.3k: tách theo trang (`admin.css`, `student.css`, `base.css`) | Thấp, tách được độc lập |
| 3.7 | Thay inline `onclick` bằng event delegation (mở đường cho CSP 2.1) | Sau 3.1–3.3 |

Giữ nguyên: `escapeHtml` trùng ở từng file là **có chủ đích** (test XSS đọc thân hàm). Chỉ đổi nếu viết lại test canh tương đương.

Không đổi sang bundler/framework: dự án thiết kế là web tĩnh không phụ thuộc thư viện; chi phí chuyển đổi lớn hơn lợi ích.

## Giai đoạn 4 — Chất lượng & tự động hoá

| # | Việc | Xong khi |
|---|---|---|
| 4.1 | Mở rộng E2E: luồng sinh viên (MSSV → chọn ca → lưu → xem lịch), 0 ca, đổi ca; luồng admin (xếp lịch 6 chế độ) | `test:e2e` ≥ 25 ca, chạy < 3 phút |
| 4.2 | Test Rules thật bằng Firebase Emulator (`@firebase/rules-unit-testing`) thay vì chỉ so khớp chuỗi | Test mô phỏng uid khác nhau: chiếm MSSV, đổi ca, đăng ký |
| 4.3 | Kiểm tra dung lượng payload công khai (`allMonthSchedules` tăng theo tháng) | Cảnh báo khi > ngưỡng; kế hoạch lưu trữ tháng cũ |
| 4.4 | Thêm Dependabot cho `@playwright/test` và GitHub Actions | PR tự động |
| 4.5 | Cache-busting `?v=` đang sửa tay ở 2 file HTML | Script tăng `?v=` tự động hoặc băm nội dung |
| 4.6 | Lighthouse/a11y trên cả 2 trang (đã có `a11y_modal.js`) | Điểm a11y ≥ 90, không lỗi tương phản |

## Giai đoạn 5 — Trải nghiệm & vận hành

| # | Việc | Ghi chú |
|---|---|---|
| 5.1 | Hiển thị rõ lỗi Cloud cho sinh viên bằng tiếng Việt, có nút "Thử lại" | Hiện chỉ toast cảnh báo |
| 5.2 | Chế độ offline: hàng đợi gửi lại đăng ký khi mất mạng | IndexedDB (`store.js`) đã có |
| 5.3 | Nhật ký thao tác admin (đã có `audit.js`): thêm lọc/xuất | Theo nhu cầu BĐH |
| 5.4 | Sao lưu tự động hàng tháng ra file + nhắc | Đã có sao lưu web 6 tháng |
| 5.5 | Hướng dẫn vận hành 1 trang cho BĐH (phát hành tháng mới, giải phóng MSSV, đổi cán bộ) | Gom từ README/SECURITY |

---

## Thứ tự đề xuất

1. **0.x** (bạn làm) → **1.1, 1.3, 1.5, 1.6** (mình làm) → **1.4** (bạn)
2. **4.2** (test Rules thật) trước khi siết thêm Rules ở **1.2**
3. **1.2** sau khi bạn chọn phương án
4. **3.1 → 3.2 → 3.3**, rồi **3.7 → 2.1**
5. **4.1, 4.4–4.6**, **2.2–2.4**, giai đoạn 5 theo nhu cầu

## Cần bạn quyết định

1. Xác thực MSSV theo cách (a) email trường hay (b) mã xác nhận? (bước 1.2)
2. Có viết lại lịch sử git để xoá PIN cũ không? (bước 1.4, destructive)
3. Có sẵn sàng bật App Check trên Firebase Console không? (bước 2.3)

## Rủi ro chung

- Rules và client phải triển khai đúng thứ tự; luôn giữ bản Rules cũ để hoàn tác.
- Không có trình duyệt thật trong phiên này thì không tách mảnh DOM-nặng (3.4); dùng E2E làm lưới an toàn.
- Mọi thay đổi dữ liệu Cloud (xoá chỉ mục, giải phóng MSSV) chỉ làm khi bạn yêu cầu.
