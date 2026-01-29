# Psychrometric-Mollier Chart - Fitur Terbaru

## Fitur yang Ditambahkan

### 1. **Undo/Redo System** ✅
- **Fungsi**: Membatalkan atau mengulangi aksi sebelumnya dengan mudah
- **Cara Menggunakan**:
  - Klik tombol "Undo" atau tekan `Ctrl+Z` (Windows/Linux) / `Cmd+Z` (Mac) untuk membatalkan
  - Klik tombol "Redo" atau tekan `Ctrl+Y` (atau `Ctrl+Shift+Z`) untuk mengulangi
- **Fitur**:
  - Menyimpan hingga 50 state history terakhir
  - Buttons disabled otomatis ketika tidak ada aksi untuk dibatalkan/diulang
  - Keyboard shortcuts untuk akses cepat

### 2. **Export Data Points** ✅
- **Format Support**: CSV dan Excel (.xlsx)
- **Cara Menggunakan**:
  - Klik tombol "CSV" untuk export ke format CSV
  - Klik tombol "Excel" untuk export ke format Excel (.xlsx)
- **Data yang Diekspor**:
  - Nama Point
  - Dry Bulb Temperature (Tdb)
  - Humidity Ratio (W)
  - Relative Humidity (RH)
  - Wet Bulb Temperature (Twb)
  - Dew Point (Tdp)
  - Enthalpy (h)
  - Specific Volume (v)
  - Absolute Humidity (AH)
  - Density (ρ)
  - Color

### 3. **Zoom & Pan** ✅
- **Cara Menggunakan**:
  - **Zoom In/Out**: Gunakan mouse wheel (scroll) pada chart
  - **Pan**: Drag chart dengan mouse untuk memindahkan view
  - **Reset Zoom**: Klik tombol "Reset Zoom" untuk kembali ke view awal
- **Fitur**:
  - Smooth zoom dengan mouse wheel
  - Drag untuk pan ke berbagai arah
  - Automatic reset button untuk kembali ke tampilan normal

### 4. **Drag Point** ✅
- **Cara Menggunakan**:
  - Hover pada point untuk melihat cursor berubah ke "grab" hand
  - Drag point ke posisi baru di chart
  - Parameter point (Tdb, W, dan semua properties) akan update secara real-time
- **Fitur**:
  - Live parameter update saat dragging
  - Automatic history snapshot saat drag selesai
  - Smart label positioning saat point dipindahkan
  - Constraints: Point tidak bisa keluar dari batas chart

## Keyboard Shortcuts

| Shortcut | Fungsi |
|----------|--------|
| `Ctrl+Z` / `Cmd+Z` | Undo |
| `Ctrl+Y` / `Ctrl+Shift+Z` | Redo |
| Mouse Wheel | Zoom In/Out |
| Drag Mouse | Pan Chart |

## Implementation Details

### History Manager
- Sistem undo/redo menggunakan class `HistoryManager`
- Maximum 50 states history
- Automatic cleanup ketika history exceed maksimum
- Button state management otomatis

### Export Functions
- `exportToCSV()`: Export ke CSV format
- `exportToExcel()`: Export ke Excel format (requires XLSX library)
- Data formatting dengan decimal precision untuk readability

### Zoom & Pan
- Menggunakan D3.js zoom behavior
- Zoomable group (`zoomGroup`) untuk semua chart elements
- State preservation di `State.zoomScale` dan `State.zoomTranslate`

### Drag Points
- D3.drag behavior untuk interactive point dragging
- Real-time coordinate conversion (Psychrometric vs Mollier)
- Automatic property recalculation
- History snapshot pada drag end

## Tips Penggunaan

1. **Efficient Workflow**: Gunakan Undo/Redo untuk bereksperimen dengan berbagai posisi point
2. **Data Analysis**: Export data ke Excel untuk analisis lebih lanjut di spreadsheet
3. **Precise Editing**: Gunakan drag untuk quick positioning atau manual input untuk precision control
4. **Chart Navigation**: Gunakan zoom/pan untuk fokus pada area spesifik chart

## Catatan Teknis

- History tracking terintegrasi pada semua operasi CRUD (Create, Read, Update, Delete)
- Zoom state terpisah dari data state (tidak mempengaruhi undo/redo)
- Export menggunakan XLSX library yang sudah disertakan di folder `/assets`
- Drag functionality support untuk Psychrometric dan Mollier chart types
