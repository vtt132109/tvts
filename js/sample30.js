/**
 * ==========================================================================
 * BỘ DỮ LIỆU MẪU 30 SINH VIÊN (DEMO BAN TƯ VẤN TUYỂN SINH)
 * ==========================================================================
 * Gồm: 12 Người Cũ (Kinh nghiệm) + 18 Người Mới (Tập sự)
 * Phân bổ ca rảnh thực tế từ Thứ 2 đến Thứ 6 (Sáng & Chiều)
 */

(() => {
  'use strict';

  const SAMPLE_30_STUDENTS = [
    // --- 12 NGƯỜI CŨ (OLD / EXPERIENCED) ---
    {
      id: 'old_01',
      fullName: 'Nguyễn Văn An',
      studentId: '2102001',
      phone: '0912345001',
      role: 'old',
      availableShifts: ['T2_S', 'T2_C', 'T3_S', 'T4_S', 'T5_C', 'T6_S'],
      createdAt: Date.now() - 300000
    },
    {
      id: 'old_02',
      fullName: 'Trần Thị Bích',
      studentId: '2102002',
      phone: '0912345002',
      role: 'old',
      availableShifts: ['T2_C', 'T3_S', 'T3_C', 'T4_C', 'T5_S', 'T6_C'],
      createdAt: Date.now() - 290000
    },
    {
      id: 'old_03',
      fullName: 'Lê Hoàng Cường',
      studentId: '2102003',
      phone: '0912345003',
      role: 'old',
      availableShifts: ['T2_S', 'T3_C', 'T4_S', 'T4_C', 'T5_S', 'T6_S'],
      createdAt: Date.now() - 280000
    },
    {
      id: 'old_04',
      fullName: 'Phạm Minh Đức',
      studentId: '2102004',
      phone: '0912345004',
      role: 'old',
      availableShifts: ['T2_S', 'T3_S', 'T4_C', 'T5_C', 'T6_S', 'T6_C'],
      createdAt: Date.now() - 270000
    },
    {
      id: 'old_05',
      fullName: 'Vũ Thị Hồng',
      studentId: '2102005',
      phone: '0912345005',
      role: 'old',
      availableShifts: ['T2_C', 'T3_C', 'T4_S', 'T5_S', 'T5_C', 'T6_C'],
      createdAt: Date.now() - 260000
    },
    {
      id: 'old_06',
      fullName: 'Đặng Quang Huy',
      studentId: '2102006',
      phone: '0912345006',
      role: 'old',
      availableShifts: ['T2_S', 'T2_C', 'T4_S', 'T5_S', 'T6_S'],
      createdAt: Date.now() - 250000
    },
    {
      id: 'old_07',
      fullName: 'Hoàng Kim Ngân',
      studentId: '2102007',
      phone: '0912345007',
      role: 'old',
      availableShifts: ['T3_S', 'T3_C', 'T4_C', 'T5_C', 'T6_C'],
      createdAt: Date.now() - 240000
    },
    {
      id: 'old_08',
      fullName: 'Ngô Thanh Phong',
      studentId: '2102008',
      phone: '0912345008',
      role: 'old',
      availableShifts: ['T2_S', 'T3_S', 'T4_S', 'T5_S', 'T6_C'],
      createdAt: Date.now() - 230000
    },
    {
      id: 'old_09',
      fullName: 'Bùi Tuyết Mai',
      studentId: '2102009',
      phone: '0912345009',
      role: 'old',
      availableShifts: ['T2_C', 'T3_C', 'T4_C', 'T5_C', 'T6_S'],
      createdAt: Date.now() - 220000
    },
    {
      id: 'old_10',
      fullName: 'Đỗ Hữu Nam',
      studentId: '2102010',
      phone: '0912345010',
      role: 'old',
      availableShifts: ['T2_S', 'T3_S', 'T4_C', 'T5_S', 'T6_S'],
      createdAt: Date.now() - 210000
    },
    {
      id: 'old_11',
      fullName: 'Lý Quốc Bảo',
      studentId: '2102011',
      phone: '0912345011',
      role: 'old',
      availableShifts: ['T2_C', 'T3_C', 'T4_S', 'T5_C', 'T6_C'],
      createdAt: Date.now() - 200000
    },
    {
      id: 'old_12',
      fullName: 'Phan Thúy Hằng',
      studentId: '2102012',
      phone: '0912345012',
      role: 'old',
      availableShifts: ['T2_S', 'T3_S', 'T4_S', 'T5_S', 'T6_S'],
      createdAt: Date.now() - 190000
    },

    // --- 18 NGƯỜI MỚI (NEW / TRAINEE) ---
    {
      id: 'new_01',
      fullName: 'Nguyễn Thảo Vy',
      studentId: '2302001',
      phone: '0978001001',
      role: 'new',
      availableShifts: ['T2_S', 'T3_S', 'T4_S', 'T5_S', 'T6_S'],
      createdAt: Date.now() - 180000
    },
    {
      id: 'new_02',
      fullName: 'Trần Gia Khang',
      studentId: '2302002',
      phone: '0978001002',
      role: 'new',
      availableShifts: ['T2_C', 'T3_C', 'T4_C', 'T5_C', 'T6_C'],
      createdAt: Date.now() - 170000
    },
    {
      id: 'new_03',
      fullName: 'Lê Minh Khôi',
      studentId: '2302003',
      phone: '0978001003',
      role: 'new',
      availableShifts: ['T2_S', 'T2_C', 'T3_S', 'T4_C', 'T5_S'],
      createdAt: Date.now() - 160000
    },
    {
      id: 'new_04',
      fullName: 'Phạm Quỳnh Anh',
      studentId: '2302004',
      phone: '0978001004',
      role: 'new',
      availableShifts: ['T3_S', 'T3_C', 'T4_S', 'T5_C', 'T6_C'],
      createdAt: Date.now() - 150000
    },
    {
      id: 'new_05',
      fullName: 'Hoàng Nhật Minh',
      studentId: '2302005',
      phone: '0978001005',
      role: 'new',
      availableShifts: ['T2_S', 'T3_C', 'T4_S', 'T4_C', 'T6_S'],
      createdAt: Date.now() - 140000
    },
    {
      id: 'new_06',
      fullName: 'Vũ Bảo Ngọc',
      studentId: '2302006',
      phone: '0978001006',
      role: 'new',
      availableShifts: ['T2_C', 'T3_S', 'T4_S', 'T5_C', 'T6_C'],
      createdAt: Date.now() - 130000
    },
    {
      id: 'new_07',
      fullName: 'Đoàn Tiến Dũng',
      studentId: '2302007',
      phone: '0978001007',
      role: 'new',
      availableShifts: ['T2_S', 'T3_C', 'T5_S', 'T5_C', 'T6_S'],
      createdAt: Date.now() - 120000
    },
    {
      id: 'new_08',
      fullName: 'Bùi Hà My',
      studentId: '2302008',
      phone: '0978001008',
      role: 'new',
      availableShifts: ['T2_C', 'T3_S', 'T4_C', 'T5_S', 'T6_C'],
      createdAt: Date.now() - 110000
    },
    {
      id: 'new_09',
      fullName: 'Ngô Hải Đăng',
      studentId: '2302009',
      phone: '0978001009',
      role: 'new',
      availableShifts: ['T2_S', 'T2_C', 'T3_S', 'T4_S', 'T6_S'],
      createdAt: Date.now() - 100000
    },
    {
      id: 'new_10',
      fullName: 'Dương Yến Nhi',
      studentId: '2302010',
      phone: '0978001010',
      role: 'new',
      availableShifts: ['T2_C', 'T3_C', 'T4_S', 'T5_S', 'T6_C'],
      createdAt: Date.now() - 90000
    },
    {
      id: 'new_11',
      fullName: 'Tạ Tuấn Hưng',
      studentId: '2302011',
      phone: '0978001011',
      role: 'new',
      availableShifts: ['T2_S', 'T3_S', 'T4_C', 'T5_C', 'T6_S'],
      createdAt: Date.now() - 80000
    },
    {
      id: 'new_12',
      fullName: 'Lâm Khánh Chi',
      studentId: '2302012',
      phone: '0978001012',
      role: 'new',
      availableShifts: ['T2_C', 'T3_C', 'T4_S', 'T5_C', 'T6_C'],
      createdAt: Date.now() - 70000
    },
    {
      id: 'new_13',
      fullName: 'Trịnh Gia Huy',
      studentId: '2302013',
      phone: '0978001013',
      role: 'new',
      availableShifts: ['T2_S', 'T3_S', 'T4_S', 'T5_S', 'T6_C'],
      createdAt: Date.now() - 60000
    },
    {
      id: 'new_14',
      fullName: 'Mai Trúc Linh',
      studentId: '2302014',
      phone: '0978001014',
      role: 'new',
      availableShifts: ['T2_C', 'T3_S', 'T4_C', 'T5_S', 'T6_S'],
      createdAt: Date.now() - 50000
    },
    {
      id: 'new_15',
      fullName: 'Cao Việt Hoàng',
      studentId: '2302015',
      phone: '0978001015',
      role: 'new',
      availableShifts: ['T2_S', 'T3_C', 'T4_S', 'T5_C', 'T6_C'],
      createdAt: Date.now() - 40000
    },
    {
      id: 'new_16',
      fullName: 'Đỗ Diệu Linh',
      studentId: '2302016',
      phone: '0978001016',
      role: 'new',
      availableShifts: ['T2_C', 'T3_S', 'T4_S', 'T5_S', 'T6_S'],
      createdAt: Date.now() - 30000
    },
    {
      id: 'new_17',
      fullName: 'Hồ Quang Dũng',
      studentId: '2302017',
      phone: '0978001017',
      role: 'new',
      availableShifts: ['T2_S', 'T3_C', 'T4_C', 'T5_C', 'T6_S'],
      createdAt: Date.now() - 20000
    },
    {
      id: 'new_18',
      fullName: 'Phan Thục Quyên',
      studentId: '2302018',
      phone: '0978001018',
      role: 'new',
      availableShifts: ['T2_C', 'T3_S', 'T4_S', 'T5_C', 'T6_C'],
      createdAt: Date.now() - 10000
    }
  ];

  // Danh sách 16 Cộng Tác Viên Tuyển Sinh HCM-UTE chuẩn theo ảnh thực tế
  const SAMPLE_HCM_UTE_STUDENTS = [
    // --- 5 NGƯỜI CŨ (KHÓA 22 & 23 - KINH NGHIỆM) ---
    {
      id: 'ute_old_01',
      fullName: 'Kim Phượng',
      studentId: '22133044',
      phone: '0901223044',
      role: 'old',
      availableShifts: ['T2_S', 'T3_S', 'T4_S', 'T5_S', 'T6_S', 'T6_C'],
      createdAt: Date.now() - 160000
    },
    {
      id: 'ute_old_02',
      fullName: 'Ngọc Đặng',
      studentId: '23136025',
      phone: '0901236025',
      role: 'old',
      availableShifts: ['T2_C', 'T3_C', 'T4_C', 'T5_C', 'T6_C', 'T2_S'],
      createdAt: Date.now() - 150000
    },
    {
      id: 'ute_old_03',
      fullName: 'Hoàng Tùng',
      studentId: '23161210',
      phone: '0901261210',
      role: 'old',
      availableShifts: ['T2_C', 'T3_S', 'T4_C', 'T5_S', 'T6_C', 'T3_C'],
      createdAt: Date.now() - 140000
    },
    {
      id: 'ute_old_04',
      fullName: 'Thanh Hoài',
      studentId: '23119143',
      phone: '0901219143',
      role: 'old',
      availableShifts: ['T2_S', 'T3_C', 'T4_S', 'T5_S', 'T6_S'],
      createdAt: Date.now() - 130000
    },
    {
      id: 'ute_old_05',
      fullName: 'Phúc Như',
      studentId: '23136075',
      phone: '0901236075',
      role: 'old',
      availableShifts: ['T2_C', 'T3_S', 'T4_C', 'T5_C', 'T6_S'],
      createdAt: Date.now() - 120000
    },

    // --- 11 NGƯỜI MỚI (KHÓA 24 & 25 - TẬP SỰ) ---
    {
      id: 'ute_new_01',
      fullName: 'Trung Hiếu',
      studentId: '24163025',
      phone: '0901263025',
      role: 'new',
      availableShifts: ['T2_S', 'T3_S', 'T4_S', 'T5_S', 'T6_S'],
      createdAt: Date.now() - 110000
    },
    {
      id: 'ute_new_02',
      fullName: 'Bảo Khánh',
      studentId: '24127030',
      phone: '0901227030',
      role: 'new',
      availableShifts: ['T2_S', 'T3_C', 'T4_S', 'T5_C', 'T6_S'],
      createdAt: Date.now() - 100000
    },
    {
      id: 'ute_new_03',
      fullName: 'Tiến Thịnh',
      studentId: '24158128',
      phone: '0901258128',
      role: 'new',
      availableShifts: ['T2_C', 'T3_S', 'T4_C', 'T5_S', 'T6_C'],
      createdAt: Date.now() - 90000
    },
    {
      id: 'ute_new_04',
      fullName: 'Xuân Hoài',
      studentId: '24164016',
      phone: '0901264016',
      role: 'new',
      availableShifts: ['T2_C', 'T3_C', 'T4_S', 'T4_C', 'T5_S', 'T6_S'],
      createdAt: Date.now() - 80000
    },
    {
      id: 'ute_new_05',
      fullName: 'Wei Tài',
      studentId: '24147061',
      phone: '0901247061',
      role: 'new',
      availableShifts: ['T2_C', 'T3_C', 'T4_S', 'T5_C', 'T6_C'],
      createdAt: Date.now() - 70000
    },
    {
      id: 'ute_new_06',
      fullName: 'Minh Thiện',
      studentId: '24161409',
      phone: '0901261409',
      role: 'new',
      availableShifts: ['T2_S', 'T3_S', 'T4_S', 'T5_S', 'T6_C'],
      createdAt: Date.now() - 60000
    },
    {
      id: 'ute_new_07',
      fullName: 'Minh Hằng',
      studentId: '25124095',
      phone: '0901224095',
      role: 'new',
      availableShifts: ['T2_S', 'T3_S', 'T4_S', 'T4_C', 'T5_S'],
      createdAt: Date.now() - 50000
    },
    {
      id: 'ute_new_08',
      fullName: 'Tiến Tài',
      studentId: '25161393',
      phone: '0901261393',
      role: 'new',
      availableShifts: ['T2_S', 'T3_C', 'T4_C', 'T5_S', 'T6_S'],
      createdAt: Date.now() - 40000
    },
    {
      id: 'ute_new_09',
      fullName: 'Mỹ Quỳnh',
      studentId: '25160030',
      phone: '0901260030',
      role: 'new',
      availableShifts: ['T2_C', 'T3_C', 'T4_C', 'T5_C', 'T6_C'],
      createdAt: Date.now() - 30000
    },
    {
      id: 'ute_new_10',
      fullName: 'Bảo Anh',
      studentId: '25154006',
      phone: '0901254006',
      role: 'new',
      availableShifts: ['T2_S', 'T3_S', 'T4_S', 'T5_C', 'T6_C'],
      createdAt: Date.now() - 20000
    },
    {
      id: 'ute_new_11',
      fullName: 'Quốc Bảo',
      studentId: '25161100',
      phone: '0901261100',
      role: 'new',
      availableShifts: ['T2_C', 'T3_S', 'T4_C', 'T5_S', 'T6_S'],
      createdAt: Date.now() - 10000
    }
  ];

  if (typeof window !== 'undefined') {
    window.SAMPLE_30_STUDENTS = SAMPLE_30_STUDENTS;
    window.SAMPLE_HCM_UTE_STUDENTS = SAMPLE_HCM_UTE_STUDENTS;
  }
})();
