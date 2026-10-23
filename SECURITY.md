# 🔐 Bảo Mật — Trạng Thái, Sự Cố Đã Phát Hiện & Cách Khắc Phục

> Tài liệu này ghi lại **kết quả kiểm tra ngày 2026-10-22** trên chính hệ thống đang chạy
> (`https://vtt132109.github.io/tvts/`), không phải đánh giá lý thuyết. Cập nhật
> **2026-10-23**: quy trình ca rảnh không chờ duyệt + đăng nhập Google ở màn hình admin
> + cấp quyền trước bằng email qua `/staff_emails`.
>
> **Đọc mục 1 trước.** Có một sự cố đang mở cần xử lý bằng tay trong Firebase Console —
> không thể sửa bằng code trong repo này.

---

## ✅ CẬP NHẬT KIẾN TRÚC (2026-10-22)

Repo đã chuyển sang mô hình **3 nhánh dữ liệu Firebase + 2 node cấp quyền** và đăng nhập mới:

| Nhánh | Đọc | Ghi | Dữ liệu |
|---|---|---|---|
| `tvts_production_data` | Cán bộ có UID trong `/staff` hoặc email trong `/staff_emails` | Cán bộ có UID trong `/staff` hoặc email trong `/staff_emails` | Đầy đủ: SĐT, email, ngân hàng, hash mật khẩu/PIN, sao lưu |
| `tvts_public` | Mọi người | Cán bộ có UID trong `/staff` hoặc email trong `/staff_emails` | Chỉ MSSV, họ tên, vai trò, ca rảnh, lịch — **không PII** |
| `tvts_requests` | Cán bộ; sinh viên đọc `swaps` | Sinh viên ghi yêu cầu gắn `uid`; ca rảnh cán bộ nhận tự động, đổi ca cán bộ duyệt | Đăng ký ca & đề xuất đổi ca |

- **Cán bộ:** Google Login ngay trên màn hình xác thực admin + UID trong `/staff` hoặc email trong `/staff_emails`. Không còn mật khẩu Firebase dùng chung.
- **Cấp quyền trước bằng email:** ngay trong app — `Admin → ☁️ Trung tâm đồng bộ → 👥 Cấp Quyền Cán Bộ Theo Email`. App ghi `staff_emails/<email đã mã hóa>: true`; người đó đăng nhập Google bằng đúng email là vào được, không cần UID trước. Có nút thu hồi (🗑️) trong danh sách.
- **Tài khoản khởi động (bootstrap):** `database.rules.json` chứa `owner@example.com`. **Phải thay bằng email Google của Trưởng ban trước khi Publish** — người này là người duy nhất cấp quyền được khi `/staff_emails` còn trống. Sau khi tự cấp quyền cho mình (hoặc thêm đồng nghiệp), mọi thao tác tiếp theo làm trong app.
- **Sinh viên:** không có trang đăng nhập; tự tạo phiên **Anonymous** khi gửi yêu cầu.
- **Web API Key** là mã công khai, được công bố trong `tvts_public/clientConfig`.

**Việc còn phải làm thủ công trong Firebase Console:** bật Google + Anonymous, thêm domain vào Authorized domains, Publish `database.rules.json` (đã thay `owner@example.com`), nhập Web API Key trong admin. Sau đó cấp quyền cho các cán bộ khác ngay trong app. Xem mục 2.

> Các mục 1 và 3 ghi lại **sự cố lịch sử** (database từng mở công khai, file mật khẩu từng bị commit). Mục 4 đã được thay bằng kiến trúc Google/Anonymous ở trên.

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

### Bước 1 — Publish Rules đầy đủ (bắt buộc)

Firebase Console → **Realtime Database → Rules** → dán toàn bộ file `database.rules.json` trong repo → **Publish**. Rules này:

- `tvts_production_data`: chỉ tài khoản có UID trong `/staff` hoặc email trong `/staff_emails` được đọc/ghi.
- `tvts_public`: mọi người được đọc; chỉ cán bộ trong `/staff` hoặc `/staff_emails` được ghi.
- `tvts_requests`: sinh viên ẩn danh chỉ ghi yêu cầu gắn với `uid` của mình; cán bộ đọc toàn bộ. Ca rảnh được **gộp tự động** (không duyệt từng yêu cầu); đề xuất đổi ca vẫn chờ cán bộ duyệt.
- `staff`: mỗi tài khoản đã đăng nhập chỉ được đọc đúng `staff/<uid>` của mình, đủ để app xác minh quyền cán bộ mà không mở cả danh sách `/staff`. Ghi vào `/staff` chỉ làm được trong Firebase Console (Rules đặt `.write: false`).
- `staff_emails`: mỗi tài khoản Google chỉ được đọc đúng key email của mình; UID staff được đọc cả danh sách để quản trị. Ghi vào `/staff_emails` chỉ làm được trong Firebase Console (`.write: false`). Giá trị phải là boolean `true`; key email viết thường và thay tất cả dấu chấm bằng `%2E`, ví dụ `ten@gmail%2Ecom`. Rules chỉ chấp nhận token Google đã xác thực email (`email_verified === true` và `sign_in_provider === 'google.com'`), không nhận email/password hay token chưa xác thực.

Kiểm tra lại bằng lệnh ở mục 1: `tvts_production_data` phải nhận **401/403 thay vì 200**.

> Nếu chưa kịp cấu hình Google, có thể dán tạm rules **deny-all** dưới đây để chặn rò rỉ ngay, rồi làm Bước 2-4 và quay lại Rules đầy đủ:
>
> ```json
> { "rules": { ".read": false, ".write": false } }
> ```

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
(không còn tài khoản thật nào trong đó). Nếu muốn giữ tài khoản cán bộ thật, đổi mật khẩu
trên một máy sạch rồi đẩy lại Cloud: payload mới chỉ chứa **hash có muối**, không còn plaintext.

### Bước 4 — Bật Google + Anonymous (code đã hỗ trợ)

1. **Authentication → Sign-in method:** bật **Google** và **Anonymous**.
2. **Authentication → Settings → Authorized domains:** thêm tên miền GitHub Pages (ví dụ `vtt132109.github.io`).
3. **Realtime Database → Data:** thêm `staff/<UID Google của quản trị chính>: true`. Để cấp quyền trước cho người khác, thêm `staff_emails/<email đã mã hóa>: true` (email viết thường, thay tất cả dấu chấm bằng `%2E`, ví dụ `ten@gmail%2Ecom`). Chỉ dùng boolean `true`.
4. **Admin → ☁️ Cloud:** nhập Web API Key → Lưu Cấu Hình. Sau đó bấm **Đăng nhập bằng Google** ngay ở màn hình xác thực admin (hoặc trong modal Cloud) → chọn đúng tài khoản cán bộ → **Đẩy Lên Cloud** một lần để tạo `tvts_public`.

Sinh viên **không cần tài khoản**: trang sinh viên tự tạo phiên ẩn danh khi gửi yêu cầu.

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
**Trạng thái mới (2026-10-23):** dữ liệu Cloud đã được bảo vệ bằng Firebase Auth — Google cho cán bộ, Anonymous cho sinh viên, Rules 3 nhánh dữ liệu + `/staff`/`/staff_emails`. Tài khoản PIN nội bộ vẫn chỉ là lớp mở dashboard phía client và **không bảo vệ dữ liệu Cloud**.

| Hướng | Cách làm | Đánh đổi |
|---|---|---|
| **A. Firebase Auth (đã triển khai)** | Google Login ngay trên màn hình xác thực admin + UID trong `/staff` hoặc email trong `/staff_emails`; Rules 3 nhánh dữ liệu; sinh viên dùng Anonymous + `tvts_requests` | Cần cấu hình Firebase Console một lần; dashboard nội bộ vẫn dùng PIN cục bộ |
| **B. Không dùng cloud, chỉ file** | Tắt `DEFAULT_CONFIG.enabled`, đồng bộ bằng xuất/nhập JSON thủ công | Mất đồng bộ đa thiết bị, nhưng không còn bề mặt tấn công nào |

Rules đã có trong `database.rules.json`; deploy bằng:

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
| Mật khẩu/PIN mặc định `0000/9999` trong JS được deploy | **Một phần:** vẫn dùng cho dashboard nội bộ phía client; dữ liệu Cloud đã chuyển sang Google + `/staff`, không còn phụ thuộc mật khẩu mặc định |
| Dữ liệu công khai chứa SĐT/email/số tài khoản/hash | **Đã sửa:** `tvts_public` chỉ nhận `id`, `studentId`, `fullName`, `role`, `faculty`, `className`, ca rảnh, lịch; **lịch/sự kiện được quét sạch PII ở mọi cấp**; test `9.1-9.32`, `10.17-10.20` chặn tái diễn |
| Cán bộ dùng chung tài khoản Firebase Email/Password | **Đã sửa:** UI admin dùng **Google Login**; quyền Cloud kiểm tra UID trong `/staff` hoặc email trong `/staff_emails`; Email/Password chỉ còn fallback trong code/test |
| Sinh viên phải có tài khoản mới đăng ký/đổi ca được | **Đã sửa:** không có trang đăng nhập; app tự tạo phiên **Anonymous** và gửi vào `tvts_requests` |
| Yêu cầu đăng ký/đổi ca không đến được cán bộ | **Đã sửa:** cán bộ đăng nhập Google là app tự kéo và gộp ca rảnh ngay (nút **📥 Kéo Ca Rảnh & Yêu Cầu** khi cần kéo tay); **không tự xếp lịch, không tự đẩy** Cloud. Đề xuất đổi ca vẫn chờ duyệt |
| Rules cũ chỉ có một node, không phân quyền sinh viên | **Đã có:** `database.rules.json` 3 nhánh dữ liệu + `/staff`/`/staff_emails`; **cần Publish thủ công** trên Firebase Console (mục 2, Bước 1) |

> ⚠️ **Hệ quả của việc đồng bộ hash:** máy cán bộ có thể **tạo tài khoản từ Cloud**, nên nếu Firebase Rules còn cho ghi công khai thì kẻ tấn công có thể chèn tài khoản vào `tvts_production_data/adminUsers`. **Bắt buộc** Publish `database.rules.json` (mục 2, Bước 1) trước khi dùng tính năng này trên môi trường thật.

---

## 6. 🔎 Cách tự kiểm tra định kỳ

```powershell
# 1. Database riêng tư còn mở công khai không? (mong đợi 401/403)
curl.exe -s -o NUL -w "%{http_code}`n" "https://vtt123-76e07-default-rtdb.firebaseio.com/tvts_production_data.json?shallow=true"

# 2. Nhánh công khai phải KHÔNG chứa PII (mong đợi rỗng)
curl.exe -s "https://vtt123-76e07-default-rtdb.firebaseio.com/tvts_public.json" | Select-String -Pattern 'phone|email|bankAccount|passwordHash|pinHash'

# 3. Có file PII/tài khoản nào bị track lại không? (mong đợi rỗng)
git ls-files | Select-String -Pattern '\.(csv|xlsx|xls)$|admin_accounts'

# 4. Bộ test hồi quy (mong đợi 375/375)
node tests/run_all_tests.js
```
