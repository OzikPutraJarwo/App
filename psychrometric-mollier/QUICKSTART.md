# 🎯 Quick Start Guide - Fitur Baru Psychrometric Mollier Chart

## 🚀 Fitur yang Telah Ditambahkan

### 1️⃣ **Undo/Redo** (Batalkan & Ulangi Aksi)
**Kapan Digunakan**: Ketika Anda ingin membatalkan atau mengulangi aksi sebelumnya

**Cara Pakai**:
- 🔘 Klik tombol **"Undo"** di toolbar kiri
- ⌨️ Tekan **`Ctrl+Z`** (Windows/Linux) atau **`Cmd+Z`** (Mac)
- 🔘 Klik tombol **"Redo"** untuk mengulangi
- ⌨️ Tekan **`Ctrl+Y`** atau **`Ctrl+Shift+Z`** untuk redo

**Contoh Penggunaan**:
```
1. Tambah point di koordinat (25, 50%)
2. Oops, salah posisi! → Klik Undo
3. Point kembali, coba posisi baru (25, 60%)
4. Berubah pikiran? → Klik Redo untuk kembali ke (25, 50%)
```

**Tips**: History menyimpan hingga 50 aksi terakhir. Buttons otomatis disabled jika tidak ada aksi untuk dibatalkan.

---

### 2️⃣ **Export Data** (Simpan Hasil ke File)
**Kapan Digunakan**: Ketika ingin menganalisis data di Excel atau spreadsheet lain

**Cara Pakai**:

**Export ke CSV**:
- 🔘 Klik tombol **"CSV"** di bagian bawah (chart actions)
- File akan di-download dengan nama `psychrometric-data.csv`
- Bisa dibuka di Excel, Google Sheets, atau aplikasi spreadsheet lainnya

**Export ke Excel**:
- 🔘 Klik tombol **"Excel"** di bagian bawah
- File akan di-download dengan nama `psychrometric-data.xlsx`
- Langsung bisa dibuka dan diedit di Microsoft Excel

**Data yang Diekspor** (untuk setiap point):
| Kolom | Satuan |
|-------|--------|
| Name | - |
| Tdb (Dry Bulb Temp) | °C |
| W (Humidity Ratio) | kg/kg' |
| RH (Relative Humidity) | % |
| Twb (Wet Bulb Temp) | °C |
| Tdp (Dew Point) | °C |
| h (Enthalpy) | kJ/kg |
| v (Specific Volume) | m³/kg |
| AH (Absolute Humidity) | g/m³ |
| ρ (Density) | kg/m³ |
| Color | Hex code |

---

### 3️⃣ **Zoom & Pan** (Perbesar & Geser Chart)
**Kapan Digunakan**: Saat ingin melihat area spesifik chart lebih detail

**Cara Pakai**:

**Zoom In/Out**:
- 🖱️ Geser **mouse wheel** ke atas untuk zoom in
- 🖱️ Geser **mouse wheel** ke bawah untuk zoom out

**Pan (Geser View)**:
- 🖱️ **Drag chart** dengan mouse ke arah mana pun
- View akan bergerak mengikuti mouse

**Reset Zoom**:
- 🔘 Klik tombol **"Reset Zoom"** di toolbar
- Chart akan kembali ke tampilan awal (fit to view)

**Contoh Penggunaan**:
```
1. Zoom in ke area dengan RH 40-60%
2. Drag untuk fokus ke temperature range 20-30°C
3. Klik Reset Zoom untuk lihat keseluruhan chart
```

**Tips**: Zoom level tidak mempengaruhi data (tidak masuk history undo/redo). Anda bisa zoom sebanyak yang diperlukan tanpa khawatir.

---

### 4️⃣ **Drag Points** (Edit Parameter secara Visual)
**Kapan Digunakan**: Saat ingin mengubah posisi point dengan cepat

**Cara Pakai**:

**Memindahkan Point**:
1. 🖱️ Arahkan cursor ke **point** (lingkaran di chart)
   - Cursor akan berubah menjadi **✋ grab hand**
2. 🖱️ **Klik dan drag** point ke posisi baru
   - Cursor berubah menjadi **✌️ grabbing hand**
3. 🖱️ **Lepaskan mouse** di posisi yang diinginkan
   - Point akan tersimpan otomatis dengan undo/redo history

**Real-time Updates**:
- Saat drag, semua parameter (Tdb, W, RH, Twb, dll) **update secara otomatis**
- Di panel kanan, Anda bisa lihat nilai-nilai berubah secara live
- Label point juga bergerak mengikuti point position

**Smart Features**:
- ✅ Point tidak bisa keluar dari batas chart
- ✅ Otomatis recalculate semua thermodynamic properties
- ✅ Drag otomatis ter-record di history (bisa di-undo)
- ✅ Works untuk Psychrometric dan Mollier chart types

**Contoh Penggunaan**:
```
1. Click point dengan RH 50%
2. Drag ke bawah → RH meningkat (lebih lembab)
3. Drag ke kanan → Tdb meningkat (lebih panas)
4. Bisa lihat h, v, Twb, dan properties lain berubah real-time
```

**Tips**: Gunakan keyboard shortcuts sambil drag untuk kontrol lebih baik:
- Tekan `Shift+Drag` untuk gerakan lebih halus (jika browser support)
- Tekan `Escape` untuk cancel drag dan kembali ke posisi awal

---

## 📋 Keyboard Shortcuts Reference

| Shortcut | Fungsi | Platform |
|----------|--------|----------|
| `Ctrl+Z` | Undo | Windows/Linux |
| `Cmd+Z` | Undo | Mac |
| `Ctrl+Y` | Redo | Windows/Linux |
| `Cmd+Y` | Redo | Mac |
| `Ctrl+Shift+Z` | Redo (Alternative) | Windows/Linux |
| `Cmd+Shift+Z` | Redo (Alternative) | Mac |
| Mouse Wheel ↑ | Zoom In | Semua |
| Mouse Wheel ↓ | Zoom Out | Semua |

---

## 💡 Workflow Examples

### Scenario 1: Quick Parameter Adjustment
```
1. Tambah point manual dengan Input tab → Tdb=20, RH=50%
2. Tidak puas dengan posisi?
   → Drag point ke Tdb=22, RH=55% (visual adjustment)
3. Mau kembali?
   → Klik Undo, point back to original position
4. Sekarang adjust dengan precision?
   → Edit nama/properties di right panel
```

### Scenario 2: Data Analysis & Export
```
1. Input beberapa kondisi udara:
   - Outside air: Tdb=35, RH=60%
   - Return air: Tdb=24, RH=50%
   - Supply air target: Tdb=18, RH=45%
   
2. Zoom in ke area interest (20-26°C range)
3. Fine-tune setiap point dengan drag
4. Export to Excel untuk analysis lebih lanjut
5. Buat chart/diagram di Excel dengan data yang di-export
```

### Scenario 3: Experimental Design
```
1. Design comfort zone (reference point: 22-26°C, 30-60% RH)
2. Add points untuk berbagai design scenarios
3. Undo/redo untuk compare different options
4. Zoom in ke area comfort zone untuk detail check
5. Export final design ke Excel
6. Adjust zone boundaries jika diperlukan
```

---

## ⚠️ Important Notes

### Automatic Features
- ✅ **Auto-save History**: Setiap aksi otomatis ter-record
- ✅ **Auto-calculation**: Semua property recalculate secara otomatis
- ✅ **Auto-position**: Labels otomatis reposition untuk avoid overlap

### Limitations
- History: Limited to 50 snapshots (design choice untuk performance)
- Export: Excel export memerlukan XLSX library (sudah included)
- Drag: Point dalam zone tidak bisa di-drag (drag zone itself)
- Zoom: Reset zoom hanya untuk data layer, tidak termasuk axes

### Best Practices
1. **Use Drag for Quick Changes**: Faster than manual input
2. **Use Input for Precise Values**: Saat butuh nilai exact
3. **Use Export for Archiving**: Save final results ke Excel
4. **Use Undo/Redo Liberally**: Eksperimen tanpa khawatir
5. **Zoom Before Drag**: Easier to position when zoomed in

---

## 🐛 Troubleshooting

| Problem | Solution |
|---------|----------|
| Undo/Redo button disabled | Tidak ada aksi untuk dibatalkan, lakukan aksi terlebih dahulu |
| Export tidak berfungsi | Pastikan browser allow download, tidak ada points = file kosong |
| Zoom terlalu besar | Klik "Reset Zoom" untuk kembali normal |
| Point tidak bisa di-drag | Pastikan dalam mode "Explore", tidak dalam "Point" atau "Zone" mode |
| Performance lambat | Kurangi zoom level atau reset view |

---

## 📞 Need Help?

Lihat file dokumentasi lengkap:
- **FEATURES.md** - Detailed feature documentation
- **IMPLEMENTATION.md** - Technical implementation details

---

**Happy analyzing! 🎉**
