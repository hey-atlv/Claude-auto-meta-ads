# Master Database Cấu Trúc Nội Dung Quảng Cáo Facebook

**Link GG Sheets gốc:** https://docs.google.com/spreadsheets/d/1BA1M0Qx3AOb5ERvIsrxxnTWlGeCHwHroVRSEpNQOlME/edit?usp=sharing
**File Excel export:** `Meta_Ads_Master_Database_Content.xlsx`

Tài liệu này mô tả cấu trúc của 2 sheet chứa database hiệu suất quảng cáo Facebook. Khi đọc dữ liệu từ file này (qua import hoặc api), luôn luôn đọc giá trị tĩnh (không xử lý công thức), bỏ qua các hàng sub-group label.

## 1. THUẬT NGỮ TƯƠNG ĐƯƠNG (TERMINOLOGY)

**Cách gọi sau đây là tương đương và chỉ chung một đối tượng/trường dữ liệu:**
*   `content` = `tên content` = `ID content` = `ID Content 1` = `tên bài quảng cáo`

---

## 2. SHEET 1: `ID FB` — Danh mục content

*   **Row 1**: Header tên cột
*   **Row 2**: Sub-group label (VD: `MEGA GANGNAM`) → **bỏ qua, không phải data**
*   **Row 3 trở đi**: Data thực, mỗi dòng = 1 content/video

### Cấu trúc 21 cột (A-U)

| Cột | Tên trường | Kiểu dữ liệu | Mô tả |
|-----|-----------|--------------|-------|
| A | STT | Số | Số thứ tự |
| B | ID content 1 | Text | Tên/mã định danh content chính. Cấu trúc: `YYMMDD-[loại]-[tên mẫu]-[thông tin]-[ngày quay]-[định dạng]` |
| C | ID Content 2 | Text | Tên phiên bản 2 (thường để trống) |
| D | Link | URL | Link task trên Trello |
| E | Team | Text | Team sản xuất. Giá trị: `Team sản xuất SG` (miền Nam), `Team sản xuất HN` (miền Bắc) |
| F | Brand | Text | Mã brand. `G` = Gangnam, `S` = Seryn |
| G | Biên tập | Text | Username người biên tập nội dung |
| H | Media hậu kỳ | Text | Mã team dựng video hậu kỳ |
| I | Design hậu kỳ | Text | Mã tool/người thiết kế |
| J | Team sản xuất | Text | Team phụ trách sản xuất |
| K | Content sản xuất | Text | Username người viết/dẫn content |
| L | Media sản xuất | Text | Mã team quay phim |
| M | Ngày sản xuất | Số (YYMMDD)| Ngày quay/sản xuất, format 6 chữ số. Ví dụ: `250225` = 25/02/2025 |
| N | MS mẫu | Text | Mã số người mẫu. Tiền tố `N_` = Nữ, `B_` = Nam |
| O | Page | Text | Loại dịch vụ/nhóm content |
| P | Tên CGSĐ | Text | Tên nhân vật/người mẫu xuất hiện trong content |
| Q | Nhóm trẻ hoá | Text | Nhóm dịch vụ thẩm mỹ (VD: `Xoá nhăn`) |
| R | Định dạng | Text | Loại format video (`TVC`, `Live ngắn`...) |
| S | Miền | Text | Vùng địa lý target (VD: `Nam`, `Bắc`) |
| T | Độ tuổi | Text | Độ tuổi target (VD: `35-44`) |
| U | Mẫu | Text | Mô tả số lượng/giới tính mẫu |

Lưu ý: Giá trị `#N/A` ở cột Định dạng và Page — treat as null/unknown.

---

## 3. SHEET 2: `Roas content` — Hiệu suất performance

*   **Row 1**: Nhóm thời gian (merged cells)
*   **Row 2**: Phân vùng địa lý (merged cells)
*   **Row 3**: Tên metric (flat header)
*   **Row 4 trở đi**: Data thực

Chứa 199 cột: `[Col 1-3] Định danh content` | `[Col 4-198] Performance data = 13 khối × 15 cột` | `[Col 199] Tên CGSĐ`

### 3 cột định danh (Col 1-3)
1. **Kênh**: Nền tảng/loại kênh (`Facebook`, `PR`, `FB+PR_FB`)
2. **Phân loại**: Phân loại chi tiết (VD: `Tổng kênh Facebook`, `Facebook CGSĐ`, `FB+PR_FB | Roas theo Mã số mẫu`)
3. **Tên content**: Tên content cụ thể. **Trống = dòng tổng hợp (summary row)**

### 13 khối performance (Col 4-198)
Mỗi khối = 15 cột = 3 vùng địa lý (TỔNG CỘNG, TRONG NƯỚC, NƯỚC NGOÀI) × 5 metrics.

| Khối | Tên khối | Cột bắt đầu |
|------|----------|-------------|
| 0 | TỔNG NĂM 2026 | 4 |
| 1 | THÁNG 1 | 19 |
| 2-12 | THÁNG 2 - THÁNG 12 | (Tháng n) * 15 + 4 |

**5 metrics cho mỗi vùng địa lý:**
*   `+0`: Chi phí (VNĐ)
*   `+1`: SL data
*   `+2`: Giá data (CPL = Chi phí / SL data) (VNĐ)
*   `+3`: Roas trong tháng (Ví dụ: 1.56 => x1.56%)
*   `+4`: Roas 3 tháng

**Ví dụ công thức cột:** `Số cột thực = (khối × 15) + offset + 4`

### Cột cuối (Col 199)
*   **Tên CGSĐ**: Dùng để join với sheet `ID FB` cột P.

---

## 4. CÁCH JOIN VÀ QUY TẮC PHÂN TÍCH

1. **JOIN 2 SHEET**:
    *   `ID FB` (Cột P) <-> `Roas content` (Col 199): Theo Tên CGSĐ.
    *   `ID FB` (Cột N) <-> `Roas content` (Phân loại `FB+PR_FB | Roas theo Mã số mẫu`): Theo mã mẫu.
2. **Bỏ qua dòng tổng hợp**: Khi Col 3 (Tên content) trống, đó là row summary → phải bỏ qua khi phân tích ở user-level.
3. **Ngày sản xuất**: Số 6 chữ số (YYMMDD) ở ID FB cần được parse thành Date format trước khi dùng.
4. **Roas Format**: Giá trị ROAS là bội số (ví dụ: 1.56), không phải phần trăm. Chi phí là VNĐ. Giá trị ô `0` hoặc rỗng `""` nghĩa là tháng đó chưa có số (không phải là lỗ). Lỗ và có tiêu tiền sẽ có ROAS = 0 *và* có Chi phí.
