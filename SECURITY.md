# 🔐 Bảo Mật — Trạng Thái, Sự Cố Đã Phát Hiện & Cách Khắc Phục

> Tài liệu này ghi lại **kết quả kiểm tra ngày 2026-10-22** trên chính hệ thống đang chạy
> (`https://vtt132109.github.io/tvts/`), không phải đánh giá lý thuyết.
>
> **Đọc mục 1 trước.** Có một sự cố đang mở cần xử lý bằng tay trong Firebase Console —
> không thể sửa bằng code trong repo này.

---

## 1. 🔴 SỰ CỐ ĐANG MỞ: Firebase Realtime Database đang cho phép đọc công khai

### Bằng chứng

```text
GET https://vtt123-76e07-default-rtdb.firebaseio.com/tvts_production_data.json?shallow=true
→ HTTP 200

{"updatedAt":true,"students":true,"adminUsers":true,"webBackups":true,
 "swapRequests":true,"regConfig":true,"scheduleResult":true,"events":true, ...}
```

Và node `adminUsers` trả về **4 tài khoản cán bộ**, mỗi bản ghi có đủ trường
`username`, `password`, `pin` (mật khẩu/PIN dạng đọc được, không phải hash):

| id | username | role |
|---|---|---|
| `usr_admin` | `admin` | Trưởng ban điều hành |
| `usr_diephoi` | `diephoi` | Điều phối viên tuyển sinh |
| `usr_1792146825856` | *(tài khoản thật)* | Trưởng ban điều hành |
| `usr_1792148046229` | *(tài khoản thật)* | Trưởng ban điều hành |

URL database nằm công khai trong `js/cloud_sync.js` (`DEFAULT_CONFIG.databaseUrl`), nên
bất kỳ ai mở DevTools trên trang web cũng lấy được URL này.

### Vì sao lại như vậy

`buildPayload()` trong `js/cloud_sync.js:207` đóng gói nguyên mảng `adminUsers`
(bao gồm `password` và `pin` dạng plaintext) rồi `PATCH` lên Firebase. Firebase
không có lớp xác thực nào chặn lại ⇒ dữ liệu nằm đó cho tới khi Rules được siết.

Ngoài ra `data/admin_accounts.json` từng được **commit** vào repo công khai (các commit
`4416a92`, `b1f9f86`, `2254d19`; đã xoá ở `d071f43`) và chứa một tài khoản thật kèm
mật khẩu + PIN. **Lịch sử git vẫn còn file này** — xem mục 3.

### Hậu quả

- Lộ mật khẩu/PIN của **toàn bộ cán bộ**, kể cả tài khoản Trưởng ban.
- Lộ danh sách sinh viên/CTV (`students`) và bản sao lưu (`webBackups`) — dữ liệu cá nhân.
- Bất kỳ ai cũng có thể **ghi đè** dữ liệu (xoá lịch trực, sửa điểm danh) nếu Rules đang mở cả `write`.

---

## 2. ✅ Việc phải làm ngay (theo thứ tự)

### Bước 1 — Chặn rò rỉ trong 2 phút (làm trước, nghĩ sau)

Firebase Console → **Realtime Database → Rules**, dán tạm:

```json
{
  "rules": {
    ".read": false,
    ".write": false
  }
}
```

Publish. Kiểm tra lại bằng lệnh ở mục 1: phải nhận **401/403 thay vì 200**.

> Đánh đổi: ứng dụng sẽ báo lỗi đồng bộ đám mây (có thông báo rõ trong UI), nhưng
> dữ liệu trên máy vẫn nguyên và dùng bình thường. Đây là trạng thái an toàn để
> chờ làm bước 2.

### Bước 2 — Đổi toàn bộ mật khẩu & PIN đã bị lộ

Bốn tài khoản trong bảng trên phải coi như **đã bị chiếm**. Đổi ngay trong
**Admin → 🔑 Cấp Quyền & Đổi MK**, rồi đăng xuất mọi thiết bị.

Quy tắc chọn mật khẩu mới:

- Không dùng lại `admin / 0000 / 9999 / 8888` hay bất kỳ PIN 4 số nào cho tài khoản thật.
- PIN ≥ 6 số nếu buộc phải dùng PIN; mật khẩu ≥ 12 ký tự.
- Không ghi mật khẩu vào file trong repo, kể cả file `.md` hay `.json` "tạm".

### Bước 3 — Xoá dữ liệu tài khoản trên Cloud

Sau khi đã đổi mật khẩu, xoá node cũ để không còn bản plaintext nằm lại:

```text
Firebase Console → Realtime Database → Data
Xoá node: tvts_production_data/adminUsers
```

Ứng dụng sẽ tự dựng lại danh sách từ `DEFAULT_ADMIN_USERS` ở máy đầu tiên đăng nhập
(không còn tài khoản thật nào trong đó).

### Bước 4 — Bật xác thực thật cho database (khuyến nghị)

Xem mục 4. Đây là thay đổi kiến trúc, cần chủ dự án quyết định vì ảnh hưởng tới
luồng "đăng nhập bằng PIN trên máy mới".

---

## 3. 🧹 Lịch sử git vẫn còn file mật khẩu

`data/admin_accounts.json` đã bị xoá khỏi HEAD nhưng vẫn nằm trong lịch sử của repo
công khai. Vì mật khẩu đã đổi ở Bước 2 nên giá trị lộ ra không còn dùng được — đó là
cách xử lý chính. Nếu muốn xoá hẳn khỏi lịch sử:

```bash
# Cần cài git-filter-repo (khuyến nghị) — thao tác này VIẾT LẠI lịch sử, phải force-push
git filter-repo --path data/admin_accounts.json --invert-paths
git push --force --all
git push --force --tags
```

Cảnh báo: mọi bản clone khác phải clone lại; các PR đang mở sẽ hỏng. Chỉ làm khi
không còn ai đang làm việc trên repo.

---

## 4. 🏗️ Vì sao "đăng nhập phía client" không phải là xác thực

Toàn bộ kiểm tra mật khẩu diễn ra trong trình duyệt:

```js
// js/admin.js:551
let matched = state.adminUsers.find(u => u.username.toLowerCase() === username && u.password === password);
```

Bất kỳ ai cũng có thể:

1. Mở DevTools, sửa `sessionStorage.setItem('ts_admin_authenticated', 'true')` → vào thẳng dashboard;
2. Hoặc đọc `localStorage` để lấy mật khẩu/PIN của người khác.

Đây là giới hạn cố hữu của web tĩnh, **không phải bug có thể vá bằng vài dòng code**.
Nếu dữ liệu tuyển sinh là dữ liệu thật của trường, cần một trong hai hướng:

| Hướng | Cách làm | Đánh đổi |
|---|---|---|
| **A. Firebase Auth (khuyến nghị)** | Bật Email/Password, tạo tài khoản cán bộ, đăng nhập qua REST Auth API, Rules chỉ cho UID trong `/staff` đọc/ghi | Phải tạo tài khoản trên Firebase Console; bỏ được "PIN dùng ngay trên máy mới" trừ khi vẫn giữ PIN cục bộ |
| **B. Không dùng cloud, chỉ file** | Tắt `DEFAULT_CONFIG.enabled`, đồng bộ bằng xuất/nhập JSON thủ công | Mất đồng bộ đa thiết bị, nhưng không còn bề mặt tấn công nào |

Nếu chọn A, có thể dùng file `database.rules.json` ở thư mục gốc:

```bash
firebase deploy --only database --project <project-id>
```

---

## 5. ✅ Những gì đã cố định trong code (đợt 2026-10-22)

| Việc | Trạng thái |
|---|---|
| `data/admin_accounts.json` (chứa tài khoản thật) | Đã xoá khỏi máy + khỏi git index; `.gitignore` đã chặn |
| `js/sample30.js` (dead code, không còn được nạp) | Đã xoá |
| Test `6.10` từng **luôn pass** vì thiếu `require('child_process')` | Đã sửa; có negative test chứng minh test thật sự fail khi file bị track lại |
| CI chạy test trên mỗi push/PR | Thêm `.github/workflows/ci.yml` |
| Stored XSS: `cfg.closedNotice` gán thẳng vào `innerHTML` ở cổng sinh viên | Đã `escapeHtml` cả 2 nhánh + test hồi quy `2.4` |
| PIN hiện nguyên văn trong bảng "Cấp Quyền & Đổi MK" | Che mặc định (`••••`), có nút 👁️ hiện/ẩn + test `6.11` |
| Mật khẩu/PIN bị serialize vào `sessionStorage` | Chỉ lưu `id/username/fullName/role` qua một cửa duy nhất `persistCurrentUser()` + test `6.12` |
| `bankName` + `bankAccount` của 30 CTV nằm trong JSON công khai | Đã bỏ khỏi `data/default_students.json` (không mã nào dùng); test `6.13` chặn tái diễn. **Bản đầy đủ nằm ngoài repo** |
| Khoá `"pin"`/`"password"` bị đẩy lên Cloud | **Đã sửa:** payload chỉ chứa **hash có muối** (`passwordHash/passwordSalt/pinHash/pinSalt`), không bao giờ có plaintext. Máy khác vẫn đăng nhập được bằng đúng mật khẩu/PIN + test `2.7-2.9`, `3.3d-3.3e`, `5.4-5.5b` |
| Tài khoản cấp ở máy A không dùng được ở máy B | **Đã sửa:** `applyPayload` tạo tài khoản từ Cloud **chỉ khi có hash hợp lệ** (bản ghi plaintext bị bỏ) + test `3.3d` |
| Mật khẩu/PIN lưu plaintext ngay trên máy | **Đã sửa:** băm SHA-256 + salt ngẫu nhiên + 3.000 vòng lặp; tài khoản cũ tự nâng cấp sau lần đăng nhập đầu + test vector FIPS `auth.test.js` |
| Dò mật khẩu/PIN không giới hạn | **Đã sửa:** khoá 60 giây sau 5 lần sai đúng định dạng + test trong `auth.test.js` |
| Phiên đăng nhập tồn tại vô hạn trong tab | **Đã sửa:** tự hết hạn sau 12 giờ + test |
| Mật khẩu/PIN mặc định `0000/9999` trong JS được deploy | **CHƯA sửa** — cần quyết định kiến trúc ở mục 4 |

> ⚠️ **Hệ quả của việc đồng bộ hash:** máy có thể **tạo tài khoản từ Cloud**, nên nếu Firebase Rules còn cho ghi công khai thì kẻ tấn công có thể chèn tài khoản của họ vào node `adminUsers`. **Bắt buộc** siết Rules (mục 2, Bước 1) trước khi dùng tính năng này trên môi trường thật.

---

## 6. 🔎 Cách tự kiểm tra định kỳ

```powershell
# 1. Database còn mở công khai không? (mong đợi 401/403)
curl.exe -s -o NUL -w "%{http_code}`n" "https://vtt123-76e07-default-rtdb.firebaseio.com/tvts_production_data.json?shallow=true"

# 2. Có file PII/tài khoản nào bị track lại không? (mong đợi rỗng)
git ls-files | Select-String -Pattern '\.(csv|xlsx|xls)$|admin_accounts'

# 3. Bộ test hồi quy (mong đợi 269/269)
node tests/run_all_tests.js
```
