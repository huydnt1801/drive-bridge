# Driver Bridge

Ứng dụng Next.js quản lý ảnh và video do ứng dụng upload trên nhiều tài khoản Google Drive. Không dùng database hoặc đăng nhập ứng dụng; connection và refresh token mã hóa được lưu trong một file trên persistent disk.

## Yêu cầu

- Node.js 20+
- Một server/instance duy nhất có persistent disk
- Google Cloud project đã bật Google Drive API
- OAuth 2.0 Web application với callback `http://localhost:3000/api/oauth/google/callback` (hoặc URL production tương ứng)

## Cấu hình

Tạo `.env.local`:

```env
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3000/api/oauth/google/callback
DRIVER_BRIDGE_ENCRYPTION_KEY=replace-with-a-long-random-secret
DRIVER_BRIDGE_DATA_FILE=./data/connections.json
```

Khóa mã hóa phải được giữ ổn định. Nếu thay khóa, refresh token đã lưu sẽ không thể giải mã. Folder chứa file dữ liệu cần được mount vào persistent volume và chỉ user chạy ứng dụng được phép đọc.

## Chạy ứng dụng

```bash
npm install
npm run dev
```

Mở `http://localhost:3000`, chọn **Kết nối Drive**, nhập tên và URL/ID của một folder trong My Drive rồi hoàn tất OAuth.

Production:

```bash
npm run build
npm start
```

## Hành vi quan trọng

- Không có auth: bất kỳ ai truy cập URL đều có thể upload và xóa dữ liệu. Chỉ triển khai trong mạng nội bộ hoặc đặt sau lớp bảo vệ của hạ tầng.
- Gallery chỉ hiển thị ảnh/video được Driver Bridge đánh dấu khi upload.
- Xóa media là xóa vĩnh viễn, không chuyển vào thùng rác.
- Gỡ connection sẽ xóa vĩnh viễn **toàn bộ folder đã cấu hình và mọi nội dung bên trong**, sau đó thu hồi token và xóa connection.
- Upload dùng resumable sessions và chunk 8 MiB, tối đa ba file đồng thời.
- Gallery hợp nhất trực tiếp từ mọi Drive, không có index; phân trang sâu có thể tạo nhiều Google API request.

## API

- `GET/POST /api/connections`
- `GET/DELETE /api/connections/:id`
- `GET /api/media`
- `GET/DELETE /api/media/:connectionId/:fileId`
- `POST/PUT /api/uploads`

Các response JSON dùng envelope `{ data, metadata, error }`. Media stream và response `204` là ngoại lệ tự nhiên.
