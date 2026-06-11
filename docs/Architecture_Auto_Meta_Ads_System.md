# TÀI LIỆU KIẾN TRÚC HỆ THỐNG: APP AUTO META ADS SYSTEM

## 1. Kiến trúc Tổng thể (Overall Architecture)
Hệ thống sử dụng kiến trúc **Serverless Web Application** tối ưu cho sự linh hoạt và phát triển nhanh chóng, với nguyên tắc xử lý và hiển thị Client-Heavy kết hợp cùng Backend làm proxy đồng bộ.
- **Frontend Layer**: SPA (Single Page Application) sử dụng React (Vite) xử lý toàn bộ logic giao diện, phân tích biểu đồ và ánh xạ dữ liệu trực tiếp tại trình duyệt.
- **Backend / Proxy Layer**: Express API Server (`/api/proxy-sheets`) đóng vai trò trung gian ủy quyền để vượt rào cản CORS và bảo mật xác thực, kết nối tới Google Sheets API và Meta API.
- **Data Layer**: Sử dụng Firebase Firestore làm hệ quản trị cơ sở dữ liệu NoSQL (Operational & Analytical DB) với cơ chế đồng bộ realtime.
- **Single Source of Truth**: Tận dụng Google Sheets nội bộ (Master Database Content) làm nguồn chứa dữ liệu gốc, sau đó đồng bộ (Sync) về Firestore để tăng tốc truy vấn.

## 2. Quản lý Tích hợp Dữ liệu & Cơ chế Đồng bộ (Sync Service)
- **Chức năng**: Hệ thống không trích xuất trực tiếp toàn bộ khối lượng dữ liệu khổng lồ từ Meta API, mà đi qua quy trình nhập liệu chuẩn nội bộ từ Google Sheets (Master Database) gồm hiệu suất ROAS, cấu trúc chiến dịch và content.
- **Luồng Đồng bộ (`syncService`, `syncContentMatrixData`)**:
  - **Dọn dẹp và Tạo Batch (Batch Write)**: Chuyển đổi dữ liệu đọc từ Sheets (tài khoản, fanpage, chi phí ROAS, danh mục content) thành các chunk 400 documents để Firestore Write Batch xử lý một cách an toàn.
  - **Quản lý Hạn mức (Quota Limit)**: Xử lý các vòng lặp tạo Batch write kết hợp cơ chế Delay/Sleep và Timeout (10-15s) để chống lỗi nghẽn dòng chảy dữ liệu về Firestore (ngăn lỗi `offline`).
  - **Đồng bộ Lịch sử vs Định kỳ**: Có cờ (flag) `hasSyncedHistorical` để phân định lần đầu tiên sẽ nạp dữ liệu cũ, từ những lần sau chỉ thiết lập lọc từ Google Sheets quét dữ liệu mới nhất (dựa vào Date), tránh giới hạn 20.000 limit quota của Firebase Spark.

## 3. Thu thập & Xử lý Dữ liệu Nội dung (Content Master)
- **Quy tắc Ánh xạ Định danh (Content Mapping Constraints)**:
  - Đây là TRÁI TIM của hệ thống: Ánh xạ giữa **Tên Chiến dịch Meta (Campaign Name)** và **Tên Content (từ Sheet ID FB/Roas Content)** thông qua thư viện `src/lib/contentMatcher.ts` (`isCampaignMatchContent`).
  - **LUẬT KHÔNG THỂ THAY ĐỔI**: Việc lọc và map PHẢI làm theo chuẩn đơn giản hóa tuyệt đối: loại bỏ mọi khoảng trắng, dấu gạch ngang (`-`), gạch dưới (`_`), chuyển toàn bộ về chữ thường (`lowercase`) và đối chiếu bằng phương pháp Inclusion (`.includes`).
- **Nguồn cấp:** File `Meta_Ads_Master_Database_Content.xlsx` (Sheets `ID FB` chứa metadata mã mẫu/team media, Sheets `Roas content` chứa dữ liệu chi phí và doanh thu).
  
## 4. Tối ưu Chiến dịch & AI
- **Chức năng**: Đóng vai trò lớp Phân tích để đánh giá KPI, dự án sử dụng các hệ thống logic rule-based kết hợp thuật toán điểm chuẩn (SOP Evaluator) để phân định Chiến dịch Dừng/Mở/Scale.
- **Luồng xử lý**:
  - `sopEvaluator.ts` thu thập dữ liệu Performance Data sau khi quét và nối (join) với Cấu hình SOP của admin.
  - Cảnh báo Tự động (Alerts) bằng dòng trạng thái hiển thị màu sắc tùy chỉnh.

## 5. Báo cáo & Phân tích (Dashboard)
- **Chức năng**: Cung cấp giao diện trực quan hỗ trợ Lọc (Filter) và Drill-down từ cấp Tổng quan 1 năm -> cấp Fanpage -> cấp Ads Account -> cấp Content Video.
- **Công nghệ hiển thị**: React.js, Tailwind CSS với thư viện tạo biểu đồ (ví dụ Recharts hoặc D3 tùy module). Component tái sử dụng mạnh mẽ.
- **Logic Tính toán**: Aggregation dữ liệu trực tiếp ở Frontend hoặc qua Data Contexts, dựa trên cấu trúc NoSQL phẳng kéo từ Firestore.

## 6. Quản lý Người dùng & Phân quyền (RBAC)
- **Chức năng**: Cung cấp xác thực đăng nhập/đăng ký bằng Email thông qua Firebase Auth.
- **Ràng buộc Quyền Lực Nhất (Master Rule)**:
  - Email `lvahust@gmail.com` được định cấu hình bằng mã cứng (Hardcode Constraint) đóng vai trò là **Master Admin/Owner**.
  - Mọi thao tác lưu cấu hình, xóa Config, hay chỉnh sửa nguồn Data lớn (hiển thị menu Settings) đều ưu tiên đặc quyền cho email này, các tài khoản khác bị chặn bằng Firestore Rules cũng như UI ẩn.

## 7. Cấu trúc Dữ liệu Yết Hầu (Firestore Schema)
Dữ liệu lưu trữ NoSQL phẳng (Flat Documents):
- **`sheetsConfigs`**: Cấu hình Sync Google Sheets (id, spreadsheetId, sheetName, apiKey).
- **`contents`**: Dữ liệu danh mục Content bóc tách từ Sheet "ID FB" (id, team, media, brand, createdAt).
- **`roasSummary`**: Doanh thu liên kết content (id, month, spend, dataCount, cpl, roas, roas3M).
- **`adsData`**: Dữ liệu thu thập hiệu suất quảng cáo hàng ngày.
- **`syncHistory`**: Lịch sử giám sát tiến trình quét (Sync log). Thể loại: Manual / Auto.
- **`users`**: Hồ sơ thành viên.

## 8. Bảo mật & Giới hạn
- **Firestore Security Rules**: Tuân thủ triệt để Zero-Trust, API Key và Token chỉ được gọi qua Backend Proxy, dữ liệu nhạy cảm thiết lập cơ chế kiểm tra `request.auth.token.email`.
- **Ràng buộc Yêu cầu Phi chức năng**:
  - **Firebase Spark Plan Quota**: Hệ thống sinh ra với cảnh báo 20K block writes/day. Bất chấp Big Data, kiến trúc yêu cầu "Khôn khéo trong Reading, Giảm thiểu Writing" thông qua việc chỉ Update/Set dữ liệu Data thô (`adsData`) trong khoảng thời gian N ngày gần nhất (Delta Sync).

## 9. Đóng gói Công nghệ Đề xuất (Current State)
- **Frontend**: Vite + React 18+ (Cung cấp SPA tốc độ render tức thời), Tailwind CSS làm Styling.
- **Backend**: Express (Chạy trên Node.js gắn liền chung Host hoặc Serverless Functions).
- **Database + Auth**: Firebase Firestore + Firebase Auth.
