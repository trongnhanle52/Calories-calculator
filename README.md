# 🧾 Calo Count

Chụp một tấm ảnh khẩu phần ăn, để AI nhận diện từng món và cộng tổng lượng calo — hiển thị rõ ràng như một tấm "phiếu tính calo" kiểu hóa đơn quán ăn Việt Nam. Có đăng nhập riêng cho từng người dùng, lưu lịch sử bữa ăn, và cho phép sửa/xóa để tiện theo dõi.

## Tính năng chính

- **Chụp/tải ảnh khẩu phần ăn** trực tiếp từ camera điện thoại hoặc chọn ảnh có sẵn.
- **AI nhận diện món ăn** và ước tính calo cho từng món (dùng Google Gemini vision `gemini-flash-latest`), có **chế độ demo** với dữ liệu mẫu khi chưa cấu hình API key — app luôn chạy được ngay cả khi chưa có key thật.
- **Chỉnh sửa kết quả** trước khi lưu: đổi tên món, khẩu phần, số calo, thêm/bớt món.
- **Đăng ký / đăng nhập** bằng email + mật khẩu (NextAuth/Auth.js, mật khẩu băm bằng bcrypt).
- **Lịch sử bữa ăn**: xem danh sách, thống kê nhanh calo hôm nay, xem chi tiết, **sửa** hoặc **xóa** từng bữa.
- Giao diện được thiết kế riêng theo concept "phiếu tính tiền" (ticket giấy, mép răng cưa, số liệu canh phải kiểu monospace), hỗ trợ tiếng Việt có dấu đầy đủ và responsive trên di động.

## Công nghệ sử dụng

| Thành phần | Lựa chọn |
| --- | --- |
| Framework | [Next.js 16](https://nextjs.org) (App Router, TypeScript) |
| Giao diện | Tailwind CSS v4 + design system tự thiết kế ("Phiếu tính calo") |
| Xác thực | [NextAuth.js (Auth.js) v5](https://authjs.dev) — Credentials provider, JWT session, bcryptjs |
| Cơ sở dữ liệu | PostgreSQL qua [Prisma ORM 6](https://www.prisma.io) (dev cục bộ dùng `prisma dev`, production dùng bất kỳ Postgres nào) |
| AI nhận diện món ăn | [Google Gemini](https://ai.google.dev) vision API (`gemini-flash-latest`), có mock fallback |
| Lưu trữ ảnh | Local filesystem (`public/uploads/<userId>/...`) khi dev, hoặc [Vercel Blob](https://vercel.com/docs/storage/vercel-blob) khi có `BLOB_READ_WRITE_TOKEN` (bắt buộc khi deploy serverless) |

## Bắt đầu nhanh

### Yêu cầu

- Node.js 22.5+ và npm (bắt buộc — lệnh `prisma dev` dùng module lõi `node:sqlite`, không chạy được trên Node 20)

### Cài đặt

```bash
npm install
```

### Cấu hình biến môi trường

Sao chép `.env.example` thành `.env` rồi điền giá trị:

```bash
cp .env.example .env
```

| Biến | Bắt buộc? | Mô tả |
| --- | --- | --- |
| `DATABASE_URL` | Có | Connection string PostgreSQL. Dev cục bộ: lấy từ lệnh `npx prisma dev` (xem bên dưới). Production: connection string Postgres thật (Neon, Supabase, Vercel Postgres...). **Luôn thêm `&pgbouncer=true`** vào cuối URL — cần thiết khi dùng connection pooling (phổ biến ở các nhà cung cấp serverless), và vẫn an toàn khi dùng kết nối trực tiếp. |
| `BLOB_READ_WRITE_TOKEN` | Không | Token Vercel Blob để lưu ảnh khi deploy serverless. Để trống thì lưu ảnh vào `public/uploads` (chỉ phù hợp khi tự host, có ổ đĩa bền vững) |
| `AUTH_SECRET` | Có | Khóa bí mật ký JWT phiên đăng nhập. Tạo bằng: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
| `GEMINI_API_KEY` | Không | API key Google Gemini để bật nhận diện AI thật. **Để trống thì app tự chạy ở chế độ demo** với dữ liệu món ăn mẫu (xem bên dưới). |
| `GEMINI_MODEL` | Không | Model vision dùng để phân tích ảnh, mặc định `gemini-flash-latest`. |
| `ANALYZE_RATE_LIMIT_PER_MINUTE` | Không | Số lần phân tích ảnh tối đa mỗi user/phút, mặc định `5`. Chống spam làm bùng chi phí/quota Gemini. |
| `ANALYZE_RATE_LIMIT_PER_DAY` | Không | Số lần phân tích ảnh tối đa mỗi user/ngày, mặc định `30`. |
| `ESTIMATE_RATE_LIMIT_PER_MINUTE` | Không | Số lần tự động ước tính calo (khi nhập món thủ công) tối đa mỗi user/phút, mặc định `20`. |
| `ESTIMATE_RATE_LIMIT_PER_DAY` | Không | Số lần tự động ước tính calo tối đa mỗi user/ngày, mặc định `150`. |

### Khởi tạo cơ sở dữ liệu

Dự án dùng PostgreSQL. Cho môi trường dev cục bộ, cách nhanh nhất là dùng server Postgres cục bộ có sẵn của Prisma (không cần cài Docker/PostgreSQL thật):

```bash
npx prisma dev --db-port 51214 --name default --detach   # khởi động server Postgres cục bộ (chạy nền), in ra DATABASE_URL
```

Dán connection string vừa in ra vào `DATABASE_URL` trong `.env` (nhớ thêm `&pgbouncer=true` — xem lưu ý bên dưới), rồi tạo bảng:

```bash
npx prisma migrate deploy   # tạo toàn bộ bảng (User, Meal, FoodItem)
```

**Lưu ý quan trọng**: luôn thêm `&pgbouncer=true` vào cuối `DATABASE_URL` — nếu thiếu, một số request (vd. đăng ký/đăng nhập) có thể lỗi 500 với thông báo `prepared statement "s0" already exists`.

Server `prisma dev` chạy nền độc lập với terminal (do có `--detach`) nhưng **không tự khởi động lại sau khi reboot máy** — nếu tắt máy/mất điện, chạy lại bằng:

```bash
npx prisma dev start default
```

Muốn dùng Postgres thật (self-host VPS, Neon, Supabase...) thay vì server dev cục bộ thì chỉ cần đổi `DATABASE_URL` rồi chạy `npx prisma migrate deploy`.

### Chạy ứng dụng

```bash
npm run dev
```

Mở [http://localhost:3000](http://localhost:3000), bấm **Đăng ký** để tạo tài khoản đầu tiên rồi bắt đầu chụp ảnh khẩu phần ăn.

### Build cho production

```bash
npm run build
npm start
```

## Chế độ Demo AI (chưa có Gemini API key)

Nếu `GEMINI_API_KEY` để trống trong `.env`, mục **Phân tích ảnh** vẫn hoạt động bình thường nhưng sẽ trả về một bộ món ăn Việt Nam mẫu (được chọn ngẫu nhiên từ danh sách có sẵn trong `src/lib/ai/analyzeFood.ts`) kèm banner "CHẾ ĐỘ DEMO" để người dùng biết đây không phải kết quả phân tích ảnh thật. Điều này giúp trải nghiệm toàn bộ luồng sản phẩm (chụp → phân tích → sửa → lưu → xem lịch sử) mà không cần trả phí API ngay từ đầu.

Để bật nhận diện AI thật:

1. Tạo API key tại [aistudio.google.com/apikey](https://aistudio.google.com/apikey).
2. Điền vào `GEMINI_API_KEY` trong file `.env`.
3. Khởi động lại server (`npm run dev`).

Nếu ảnh không chứa món ăn/thức uống nào, app sẽ hiện popup thông báo "Không thấy món ăn" thay vì bịa ra dữ liệu — người dùng có thể chụp ảnh khác hoặc tự nhập món thủ công.

## Tự nhập món ăn & tự động tính calo

Khi phân tích ảnh thất bại (hoặc người dùng chủ động bấm "+ Thêm món ăn"), mỗi dòng món mới thêm sẽ tự động gọi Gemini (dạng text, không cần ảnh) để ước tính calo ngay khi người dùng nhập đủ **tên món** và **khẩu phần/số lượng** (có debounce ~0.7s sau khi ngừng gõ). Số calo ước tính vẫn có thể sửa tay bình thường — nếu người dùng tự gõ lại calo, ô đó sẽ không bị AI ghi đè nữa. Các món do phân tích ảnh trả về (hoặc dữ liệu demo) giữ nguyên giá trị gốc, không bị tính lại. Route `POST /api/estimate-calories` dùng module `src/lib/ai/estimateCalories.ts`, có rate limit riêng (`ESTIMATE_RATE_LIMIT_PER_MINUTE`/`ESTIMATE_RATE_LIMIT_PER_DAY`) và fallback về ước tính heuristic đơn giản khi chưa cấu hình `GEMINI_API_KEY` hoặc khi gọi API lỗi.

Nếu tên món nhập vào không phải món ăn thật (gõ bừa, ví dụ "dnsanbdas", hoặc tên một vật/con vật/địa danh không phải thực phẩm), Gemini sẽ trả về `found: false` và calo = 0 thay vì bịa số — dòng đó hiện viền đỏ và dòng cảnh báo nhỏ "⚠️ Không tìm thấy món ăn này. Kiểm tra lại tên hoặc nhập calo thủ công." ngay dưới ô khẩu phần, người dùng có thể sửa lại tên hoặc tự nhập calo tay. Ở chế độ fallback (không có `GEMINI_API_KEY`/API lỗi), heuristic offline chỉ phát hiện được các trường hợp rõ ràng (gõ theo hàng phím qwerty/asdf/zxcv, chuỗi không có nguyên âm, chuỗi phụ âm quá dài) — phân loại ngữ nghĩa chính xác cho mọi trường hợp cần Gemini thật.

## Lưu ý khi public cho nhiều người dùng

- **Giới hạn tốc độ**: `/api/analyze` và `/api/estimate-calories` đều có rate limit riêng theo user (`ANALYZE_RATE_LIMIT_*`/`ESTIMATE_RATE_LIMIT_*` trong `.env`) để tránh 1 tài khoản gọi Gemini dồn dập gây tốn phí hoặc bị khoá quota. Giới hạn này lưu **trong bộ nhớ của process** (không dùng store chia sẻ như Redis) — phù hợp khi chạy 1 instance duy nhất (VPS hoặc 1 server serverless không auto-scale nhiều instance đồng thời); sẽ mất khi restart server, và không chính xác 100% nếu nền tảng deploy chạy song song nhiều instance/region. Nếu scale lớn hơn, cân nhắc đổi sang rate limiter dùng Redis (Upstash Redis là lựa chọn phổ biến, có free tier, tương thích serverless).
- **Quota Gemini**: gói Free của Gemini API có giới hạn request/phút và request/ngày khá thấp (dùng chung theo API key/project, không phải riêng theo app). Khi có người dùng thật, nên nâng cấp sang gói trả phí (pay-as-you-go) tại [Google AI Studio](https://aistudio.google.com) để tránh bị lỗi 429 — app đã tự động chuyển sang chế độ demo (mock) khi gặp lỗi 429 để không làm gián đoạn trải nghiệm, nhưng người dùng vẫn nên nâng cấp quota sớm nếu app có nhiều người dùng thật.
- **Database & lưu ảnh**: dự án đã dùng PostgreSQL + hỗ trợ Vercel Blob (xem mục [Deploy lên Vercel](#deploy-lên-vercel) bên dưới) nên đã sẵn sàng cho serverless/nhiều instance — không còn phụ thuộc ổ đĩa local hay SQLite. Nếu chọn tự host trên 1 VPS thay vì Vercel, vẫn có thể để trống `BLOB_READ_WRITE_TOKEN` để lưu ảnh vào `public/uploads` như trước, miễn là chỉ chạy 1 instance ghi vào cùng ổ đĩa.

## Cấu trúc dự án

```
src/
  app/
    page.tsx                # Trang chủ (landing)
    login/, register/       # Trang đăng nhập / đăng ký
    dashboard/               # Trang chính: chụp ảnh, phân tích, thống kê nhanh
    history/                 # Danh sách lịch sử bữa ăn
    meals/[id]/               # Xem / sửa / xóa chi tiết một bữa ăn
    api/
      register/              # Đăng ký tài khoản
      auth/[...nextauth]/     # NextAuth handlers (đăng nhập/đăng xuất/phiên)
      analyze/                # Nhận ảnh, lưu file, gọi AI phân tích
      estimate-calories/      # Ước tính calo cho món nhập thủ công (text-only Gemini)
      meals/, meals/[id]/     # CRUD bữa ăn (list/create/get/update/delete)
  components/                # UI dùng chung (Ticket, Navbar, các form)
  lib/
    ai/analyzeFood.ts         # Gọi Gemini vision + mock fallback
    ai/estimateCalories.ts    # Gọi Gemini text-only để ước tính calo theo tên + khẩu phần
    rateLimit.ts               # Rate limiter theo user cho /api/analyze và /api/estimate-calories
    storage.ts                 # Lưu/xóa ảnh bữa ăn — tự chọn Vercel Blob hay đĩa cục bộ (public/uploads)
    prisma.ts                 # Prisma client singleton
  auth.ts                     # Cấu hình NextAuth (Credentials provider)
prisma/
  schema.prisma               # Data model: User, Meal, FoodItem (PostgreSQL)
```

## Quyết định kiến trúc đáng chú ý

- **Bảo vệ route ở server, không dùng middleware Edge**: Prisma + bcrypt không chạy được trong Edge runtime mặc định của Next.js middleware, nên mọi trang/route yêu cầu đăng nhập đều tự kiểm tra `auth()` phía server (Server Component / Route Handler) và `redirect()` nếu chưa đăng nhập, thay vì dùng `middleware.ts`.
- **Lưu trữ ảnh trừu tượng hóa qua `lib/storage.ts`**: tự động dùng Vercel Blob khi có `BLOB_READ_WRITE_TOKEN`, hoặc lưu vào `public/uploads/<userId>/...` khi không có (self-host có ổ đĩa bền vững). Việc xóa ảnh (`deleteMealImage`) tự nhận diện ảnh cũ thuộc backend nào (dựa vào URL bắt đầu bằng `http(s)://` hay là đường dẫn cục bộ) nên vẫn xóa đúng kể cả khi đổi backend giữa chừng.
- **Múi giờ**: thống kê "hôm nay" dùng giờ server, chưa xử lý theo múi giờ riêng từng người dùng — phù hợp cho self-host một khu vực, cần điều chỉnh nếu phục vụ nhiều múi giờ.

## Deploy lên Vercel

App đã sẵn sàng deploy lên [Vercel](https://vercel.com) (PostgreSQL + Vercel Blob thay cho SQLite + ổ đĩa local). Các bước:

1. **Đẩy code lên GitHub/GitLab/Bitbucket** rồi vào [vercel.com/new](https://vercel.com/new) import repo.
2. **Tạo database PostgreSQL**: dùng [Neon](https://neon.tech) hoặc [Supabase](https://supabase.com) (đều có free tier) — hoặc chọn **Storage → Create Database → Postgres (Neon)** ngay trong project Vercel. Copy connection string.
3. **Set biến môi trường** trong Vercel project (Settings → Environment Variables):
   - `DATABASE_URL` — connection string ở bước 2. **Nhớ thêm `&pgbouncer=true`** vào cuối nếu đó là connection string dạng pooled (Neon pooled endpoint có `-pooler` trong hostname, Supabase "Transaction pooler" dùng cổng 6543) — nếu thiếu có thể gặp lỗi 500 `prepared statement already exists` khi có nhiều request đồng thời.
   - `AUTH_SECRET` — tạo bằng `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.
   - `GEMINI_API_KEY` — API key thật (để trống thì app chạy demo mode).
   - Tuỳ chọn: `GEMINI_MODEL`, `ANALYZE_RATE_LIMIT_*`, `ESTIMATE_RATE_LIMIT_*` (xem bảng biến môi trường ở trên).
4. **Tạo Vercel Blob store** (Storage tab trong project) để lưu ảnh bữa ăn — Vercel tự động điền `BLOB_READ_WRITE_TOKEN` cho project sau khi kết nối store, không cần copy tay.
5. **Deploy**. Script `build` đã cấu hình sẵn `prisma migrate deploy && next build` (chạy trong `package.json`), và `postinstall` đã cấu hình `prisma generate` — nghĩa là mỗi lần deploy, database schema tự động cập nhật, không cần chạy migrate tay.
6. Sau khi deploy xong, vào domain Vercel cấp, bấm **Đăng ký** để tạo tài khoản đầu tiên.

**Lưu ý**: rate limiting hiện lưu trong bộ nhớ process (không dùng Redis) — trên Vercel mỗi serverless function invocation/instance có bộ nhớ riêng, nên giới hạn request/phút-ngày có thể không chính xác tuyệt đối khi có nhiều instance chạy song song. Vẫn hữu ích để giảm rủi ro cơ bản, nhưng nếu cần giới hạn chính xác tuyệt đối ở quy mô lớn, hãy đổi sang store chia sẻ (Redis/Upstash).

## Scripts

| Lệnh | Mô tả |
| --- | --- |
| `npm run dev` | Chạy dev server (Turbopack) |
| `npm run build` | Chạy `prisma migrate deploy` rồi build production — cách Vercel build project này |
| `npm start` | Chạy server production (sau khi build) |
| `npm run lint` | Kiểm tra ESLint |
| `postinstall` (tự động sau `npm install`) | `prisma generate` — sinh Prisma Client khớp với schema hiện tại |
| `npx prisma studio` | Xem/sửa dữ liệu PostgreSQL bằng giao diện Prisma Studio |
