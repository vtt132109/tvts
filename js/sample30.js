/**
 * ==========================================================================
 * BỘ DỮ LIỆU CHUẨN 30 CỘNG TÁC VIÊN BAN TƯ VẤN TUYỂN SINH HCM-UTE (2026)
 * ==========================================================================
 * Dữ liệu đồng bộ từ danh sách CTV chính thức HCM-UTE:
 * - 12 CTV Chính Thức (Kinh nghiệm)
 * - 18 CTV Tập Sự
 * - Đầy đủ thông tin MSSV, Họ và tên, SĐT, Email, Ngân hàng, STK
 * - Sẵn sàng nạp tự động vào LocalStorage và CloudSync trên mọi máy tính.
 */

(() => {
  'use strict';

  const SAMPLE_HCM_UTE_STUDENTS = [
  {
    "id": "hcmute_22133044",
    "fullName": "Trần Thị Kim Phượng",
    "studentId": "22133044",
    "phone": "0967525417",
    "email": "22133044@student.hcmute.edu.vn",
    "faculty": "Công nghệ thông tin",
    "major": "Kỹ thuật dữ liệu",
    "bankName": "BIDV",
    "bankAccount": "8860146471",
    "role": "old",
    "monthlyAvailableShifts": {
      "1": [
        "T2_S",
        "T3_S",
        "T4_S",
        "T5_C",
        "T6_S"
      ],
      "2": [
        "T2_S",
        "T3_S",
        "T4_S",
        "T5_C",
        "T6_S"
      ],
      "3": [
        "T2_S",
        "T3_S",
        "T4_S",
        "T5_C",
        "T6_S"
      ],
      "4": [
        "T2_S",
        "T3_S",
        "T4_S",
        "T5_C",
        "T6_S"
      ]
    },
    "availableShifts": [
      "T2_S",
      "T3_S",
      "T4_S",
      "T5_C",
      "T6_S"
    ],
    "createdAt": 1792149555548
  },
  {
    "id": "hcmute_23119143",
    "fullName": "Nguyễn Thanh Hoài",
    "studentId": "23119143",
    "phone": "0943763522",
    "email": "23119143@student.hcmute.edu.vn",
    "faculty": "Điện - điện tử",
    "major": "Khoa Điện-Điện Tử",
    "bankName": "Vietcombank",
    "bankAccount": "1040490656",
    "role": "old",
    "monthlyAvailableShifts": {
      "1": [
        "T2_C",
        "T3_S",
        "T4_C",
        "T5_S",
        "T6_C"
      ],
      "2": [
        "T2_C",
        "T3_S",
        "T4_C",
        "T5_S",
        "T6_C"
      ],
      "3": [
        "T2_C",
        "T3_S",
        "T4_C",
        "T5_S",
        "T6_C"
      ],
      "4": [
        "T2_C",
        "T3_S",
        "T4_C",
        "T5_S",
        "T6_C"
      ]
    },
    "availableShifts": [
      "T2_C",
      "T3_S",
      "T4_C",
      "T5_S",
      "T6_C"
    ],
    "createdAt": 1792149615548
  },
  {
    "id": "hcmute_23136025",
    "fullName": "Võ Ngọc Đặng",
    "studentId": "23136025",
    "phone": "0338181433",
    "email": "23136025@student.hcmute.edu.vn",
    "faculty": "Kinh tế",
    "major": "Kinh doanh quốc tế",
    "bankName": "Vietcombank",
    "bankAccount": "1039544983",
    "role": "old",
    "monthlyAvailableShifts": {
      "1": [
        "T2_S",
        "T3_C",
        "T4_S",
        "T5_S",
        "T6_S"
      ],
      "2": [
        "T2_S",
        "T3_C",
        "T4_S",
        "T5_S",
        "T6_S"
      ],
      "3": [
        "T2_S",
        "T3_C",
        "T4_S",
        "T5_S",
        "T6_S"
      ],
      "4": [
        "T2_S",
        "T3_C",
        "T4_S",
        "T5_S",
        "T6_S"
      ]
    },
    "availableShifts": [
      "T2_S",
      "T3_C",
      "T4_S",
      "T5_S",
      "T6_S"
    ],
    "createdAt": 1792149675548
  },
  {
    "id": "hcmute_23146340",
    "fullName": "Đặng Đình Thái Sang",
    "studentId": "23146340",
    "phone": "0374346825",
    "email": "23146340@student.hcmute.edu.vn",
    "faculty": "Cơ khí chế tạo máy",
    "major": "CNKT Cơ điện tử",
    "bankName": "Vietcombank",
    "bankAccount": "1040490803",
    "role": "old",
    "monthlyAvailableShifts": {
      "1": [
        "T2_S",
        "T2_C",
        "T3_S",
        "T4_S",
        "T6_S"
      ],
      "2": [
        "T2_S",
        "T2_C",
        "T3_S",
        "T4_S",
        "T6_S"
      ],
      "3": [
        "T2_S",
        "T2_C",
        "T3_S",
        "T4_S",
        "T6_S"
      ],
      "4": [
        "T2_S",
        "T2_C",
        "T3_S",
        "T4_S",
        "T6_S"
      ]
    },
    "availableShifts": [
      "T2_S",
      "T2_C",
      "T3_S",
      "T4_S",
      "T6_S"
    ],
    "createdAt": 1792149735548
  },
  {
    "id": "hcmute_23157024",
    "fullName": "Nguyễn Lê Nhật Hạ",
    "studentId": "23157024",
    "phone": "0826628163",
    "email": "nyannyanmeo@gmail.com",
    "faculty": "Xây dựng",
    "major": "Kiến trúc",
    "bankName": "Vietcombank",
    "bankAccount": "1018913810",
    "role": "old",
    "monthlyAvailableShifts": {
      "1": [
        "T2_C",
        "T3_C",
        "T4_C",
        "T5_C",
        "T6_C"
      ],
      "2": [
        "T2_C",
        "T3_C",
        "T4_C",
        "T5_C",
        "T6_C"
      ],
      "3": [
        "T2_C",
        "T3_C",
        "T4_C",
        "T5_C",
        "T6_C"
      ],
      "4": [
        "T2_C",
        "T3_C",
        "T4_C",
        "T5_C",
        "T6_C"
      ]
    },
    "availableShifts": [
      "T2_C",
      "T3_C",
      "T4_C",
      "T5_C",
      "T6_C"
    ],
    "createdAt": 1792149795548
  },
  {
    "id": "hcmute_23161210",
    "fullName": "Nguyễn Hoàng Tùng",
    "studentId": "23161210",
    "phone": "0981952614",
    "email": "23161210@student.hcmute.edu.vn",
    "faculty": "Điện - điện tử",
    "major": "Công nghệ kỹ thuật điện tử viễn thông",
    "bankName": "Vietcombank",
    "bankAccount": "1040683002",
    "role": "old",
    "monthlyAvailableShifts": {
      "1": [
        "T2_S",
        "T3_S",
        "T4_S",
        "T5_S",
        "T6_S"
      ],
      "2": [
        "T2_S",
        "T3_S",
        "T4_S",
        "T5_S",
        "T6_S"
      ],
      "3": [
        "T2_S",
        "T3_S",
        "T4_S",
        "T5_S",
        "T6_S"
      ],
      "4": [
        "T2_S",
        "T3_S",
        "T4_S",
        "T5_S",
        "T6_S"
      ]
    },
    "availableShifts": [
      "T2_S",
      "T3_S",
      "T4_S",
      "T5_S",
      "T6_S"
    ],
    "createdAt": 1792149855548
  },
  {
    "id": "hcmute_24104049",
    "fullName": "Hồ Hồng Quân",
    "studentId": "24104049",
    "phone": "0867087933",
    "email": "24104049@student.hcmute.edu.vn",
    "faculty": "Cơ khí chế tạo máy",
    "major": "Kỹ thuật công nghiệp",
    "bankName": "Vietcombank",
    "bankAccount": "1050241295",
    "role": "old",
    "monthlyAvailableShifts": {
      "1": [
        "T3_S",
        "T3_C",
        "T4_S",
        "T5_S",
        "T6_C"
      ],
      "2": [
        "T3_S",
        "T3_C",
        "T4_S",
        "T5_S",
        "T6_C"
      ],
      "3": [
        "T3_S",
        "T3_C",
        "T4_S",
        "T5_S",
        "T6_C"
      ],
      "4": [
        "T3_S",
        "T3_C",
        "T4_S",
        "T5_S",
        "T6_C"
      ]
    },
    "availableShifts": [
      "T3_S",
      "T3_C",
      "T4_S",
      "T5_S",
      "T6_C"
    ],
    "createdAt": 1792149915548
  },
  {
    "id": "hcmute_24126277",
    "fullName": "Nguyễn Ngọc Kiều Vy",
    "studentId": "24126277",
    "phone": "0937775483",
    "email": "24126277@student.hcmute.edu.vn",
    "faculty": "Kinh tế",
    "major": "Thương mại điện tử",
    "bankName": "Vietcombank",
    "bankAccount": "1032428059",
    "role": "old",
    "monthlyAvailableShifts": {
      "1": [
        "T2_S",
        "T3_C",
        "T4_C",
        "T5_S",
        "T6_S"
      ],
      "2": [
        "T2_S",
        "T3_C",
        "T4_C",
        "T5_S",
        "T6_S"
      ],
      "3": [
        "T2_S",
        "T3_C",
        "T4_C",
        "T5_S",
        "T6_S"
      ],
      "4": [
        "T2_S",
        "T3_C",
        "T4_C",
        "T5_S",
        "T6_S"
      ]
    },
    "availableShifts": [
      "T2_S",
      "T3_C",
      "T4_C",
      "T5_S",
      "T6_S"
    ],
    "createdAt": 1792149975548
  },
  {
    "id": "hcmute_24127030",
    "fullName": "Đoàn Nguyễn Bảo Khánh",
    "studentId": "24127030",
    "phone": "0947282006",
    "email": "24127030@student.hcmute.edu.vn",
    "faculty": "Xây dựng",
    "major": "KTXD Công trình giao thông",
    "bankName": "Vietcombank",
    "bankAccount": "1050250151",
    "role": "old",
    "monthlyAvailableShifts": {
      "1": [
        "T2_C",
        "T3_S",
        "T4_S",
        "T5_C",
        "T6_C"
      ],
      "2": [
        "T2_C",
        "T3_S",
        "T4_S",
        "T5_C",
        "T6_C"
      ],
      "3": [
        "T2_C",
        "T3_S",
        "T4_S",
        "T5_C",
        "T6_C"
      ],
      "4": [
        "T2_C",
        "T3_S",
        "T4_S",
        "T5_C",
        "T6_C"
      ]
    },
    "availableShifts": [
      "T2_C",
      "T3_S",
      "T4_S",
      "T5_C",
      "T6_C"
    ],
    "createdAt": 1792150035548
  },
  {
    "id": "hcmute_24147061",
    "fullName": "Luo Wei Tài",
    "studentId": "24147061",
    "phone": "0933289541",
    "email": "24147061@student.hcmute.edu.vn",
    "faculty": "Giao thông và năng lượng",
    "major": "Công nghệ kỹ thuật nhiệt",
    "bankName": "Vietcombank",
    "bankAccount": "1050243609",
    "role": "old",
    "monthlyAvailableShifts": {
      "1": [
        "T2_S",
        "T4_S",
        "T4_C",
        "T5_C",
        "T6_S"
      ],
      "2": [
        "T2_S",
        "T4_S",
        "T4_C",
        "T5_C",
        "T6_S"
      ],
      "3": [
        "T2_S",
        "T4_S",
        "T4_C",
        "T5_C",
        "T6_S"
      ],
      "4": [
        "T2_S",
        "T4_S",
        "T4_C",
        "T5_C",
        "T6_S"
      ]
    },
    "availableShifts": [
      "T2_S",
      "T4_S",
      "T4_C",
      "T5_C",
      "T6_S"
    ],
    "createdAt": 1792150095548
  },
  {
    "id": "hcmute_24158128",
    "fullName": "Nguyễn Tiến Thịnh",
    "studentId": "24158128",
    "phone": "0377833220",
    "email": "24158128@student.hcmute.edu.vn",
    "faculty": "In và truyền thông",
    "major": "Công nghệ kỹ thuật in",
    "bankName": "Vietcombank",
    "bankAccount": "1050247175",
    "role": "old",
    "monthlyAvailableShifts": {
      "1": [
        "T2_S",
        "T3_S",
        "T4_S",
        "T5_C",
        "T6_S"
      ],
      "2": [
        "T2_S",
        "T3_S",
        "T4_S",
        "T5_C",
        "T6_S"
      ],
      "3": [
        "T2_S",
        "T3_S",
        "T4_S",
        "T5_C",
        "T6_S"
      ],
      "4": [
        "T2_S",
        "T3_S",
        "T4_S",
        "T5_C",
        "T6_S"
      ]
    },
    "availableShifts": [
      "T2_S",
      "T3_S",
      "T4_S",
      "T5_C",
      "T6_S"
    ],
    "createdAt": 1792150155548
  },
  {
    "id": "hcmute_24161409",
    "fullName": "Phạm Minh Thiện",
    "studentId": "24161409",
    "phone": "0918907851",
    "email": "24161409@student.hcmute.edu.vn",
    "faculty": "Điện - điện tử",
    "major": "Chương trình đào tạo Kỹ thuật Thiết kế vi mạch",
    "bankName": "Vietcombank",
    "bankAccount": "1050243143",
    "role": "old",
    "monthlyAvailableShifts": {
      "1": [
        "T2_C",
        "T3_S",
        "T4_C",
        "T5_S",
        "T6_C"
      ],
      "2": [
        "T2_C",
        "T3_S",
        "T4_C",
        "T5_S",
        "T6_C"
      ],
      "3": [
        "T2_C",
        "T3_S",
        "T4_C",
        "T5_S",
        "T6_C"
      ],
      "4": [
        "T2_C",
        "T3_S",
        "T4_C",
        "T5_S",
        "T6_C"
      ]
    },
    "availableShifts": [
      "T2_C",
      "T3_S",
      "T4_C",
      "T5_S",
      "T6_C"
    ],
    "createdAt": 1792150215548
  },
  {
    "id": "hcmute_24163025",
    "fullName": "Vũ Trung Hiếu",
    "studentId": "24163025",
    "phone": "0399431883",
    "email": "24163025@student.hcmute.edu.vn",
    "faculty": "Chính trị - luật",
    "major": "Luật",
    "bankName": "Vietcombank",
    "bankAccount": "1050241154",
    "role": "new",
    "monthlyAvailableShifts": {
      "1": [
        "T2_S",
        "T3_C",
        "T4_S",
        "T5_S",
        "T6_S"
      ],
      "2": [
        "T2_S",
        "T3_C",
        "T4_S",
        "T5_S",
        "T6_S"
      ],
      "3": [
        "T2_S",
        "T3_C",
        "T4_S",
        "T5_S",
        "T6_S"
      ],
      "4": [
        "T2_S",
        "T3_C",
        "T4_S",
        "T5_S",
        "T6_S"
      ]
    },
    "availableShifts": [
      "T2_S",
      "T3_C",
      "T4_S",
      "T5_S",
      "T6_S"
    ],
    "createdAt": 1792150275548
  },
  {
    "id": "hcmute_24164016",
    "fullName": "Phan Thị Xuân Hoài",
    "studentId": "24164016",
    "phone": "0365380945",
    "email": "24164016@student.hcmute.edu.vn",
    "faculty": "Viện Sư phạm kỹ thuật",
    "major": "Tâm lý học giáo dục",
    "bankName": "Vietcombank",
    "bankAccount": "1050248669",
    "role": "new",
    "monthlyAvailableShifts": {
      "1": [
        "T2_S",
        "T2_C",
        "T3_S",
        "T4_S",
        "T6_S"
      ],
      "2": [
        "T2_S",
        "T2_C",
        "T3_S",
        "T4_S",
        "T6_S"
      ],
      "3": [
        "T2_S",
        "T2_C",
        "T3_S",
        "T4_S",
        "T6_S"
      ],
      "4": [
        "T2_S",
        "T2_C",
        "T3_S",
        "T4_S",
        "T6_S"
      ]
    },
    "availableShifts": [
      "T2_S",
      "T2_C",
      "T3_S",
      "T4_S",
      "T6_S"
    ],
    "createdAt": 1792150335548
  },
  {
    "id": "hcmute_25124095",
    "fullName": "Nguyễn Minh Hằng",
    "studentId": "25124095",
    "phone": "0387892318",
    "email": "25124095@student.hcmute.edu.vn",
    "faculty": "Kinh tế",
    "major": "Quản lý công nghiệp",
    "bankName": "Vietcombank",
    "bankAccount": "1060422679",
    "role": "new",
    "monthlyAvailableShifts": {
      "1": [
        "T2_C",
        "T3_C",
        "T4_C",
        "T5_C",
        "T6_C"
      ],
      "2": [
        "T2_C",
        "T3_C",
        "T4_C",
        "T5_C",
        "T6_C"
      ],
      "3": [
        "T2_C",
        "T3_C",
        "T4_C",
        "T5_C",
        "T6_C"
      ],
      "4": [
        "T2_C",
        "T3_C",
        "T4_C",
        "T5_C",
        "T6_C"
      ]
    },
    "availableShifts": [
      "T2_C",
      "T3_C",
      "T4_C",
      "T5_C",
      "T6_C"
    ],
    "createdAt": 1792150395548
  },
  {
    "id": "hcmute_25125084",
    "fullName": "Đỗ Thị Xuân Mai",
    "studentId": "25125084",
    "phone": "0375103571",
    "email": "25125084@student.hcmute.edu.vn",
    "faculty": "Kinh tế",
    "major": "Kế toán",
    "bankName": "Vietcombank",
    "bankAccount": "1060422808",
    "role": "new",
    "monthlyAvailableShifts": {
      "1": [
        "T2_S",
        "T3_S",
        "T4_S",
        "T5_S",
        "T6_S"
      ],
      "2": [
        "T2_S",
        "T3_S",
        "T4_S",
        "T5_S",
        "T6_S"
      ],
      "3": [
        "T2_S",
        "T3_S",
        "T4_S",
        "T5_S",
        "T6_S"
      ],
      "4": [
        "T2_S",
        "T3_S",
        "T4_S",
        "T5_S",
        "T6_S"
      ]
    },
    "availableShifts": [
      "T2_S",
      "T3_S",
      "T4_S",
      "T5_S",
      "T6_S"
    ],
    "createdAt": 1792150455548
  },
  {
    "id": "hcmute_25125099",
    "fullName": "Phạm Thị Khánh Ngọc",
    "studentId": "25125099",
    "phone": "0835794905",
    "email": "25125099@student.hcmute.edu.vn",
    "faculty": "Kinh tế",
    "major": "Kế toán",
    "bankName": "Vietcombank",
    "bankAccount": "1042506731",
    "role": "new",
    "monthlyAvailableShifts": {
      "1": [
        "T3_S",
        "T3_C",
        "T4_S",
        "T5_S",
        "T6_C"
      ],
      "2": [
        "T3_S",
        "T3_C",
        "T4_S",
        "T5_S",
        "T6_C"
      ],
      "3": [
        "T3_S",
        "T3_C",
        "T4_S",
        "T5_S",
        "T6_C"
      ],
      "4": [
        "T3_S",
        "T3_C",
        "T4_S",
        "T5_S",
        "T6_C"
      ]
    },
    "availableShifts": [
      "T3_S",
      "T3_C",
      "T4_S",
      "T5_S",
      "T6_C"
    ],
    "createdAt": 1792150515548
  },
  {
    "id": "hcmute_25132107",
    "fullName": "Trương Thị Bảo Ngọc",
    "studentId": "25132107",
    "phone": "0898459758",
    "email": "25132107@student.hcmute.edu.vn",
    "faculty": "Kinh tế",
    "major": "Logistics và quản lý chuỗi cung ứng",
    "bankName": "Vietcombank",
    "bankAccount": "1060423565",
    "role": "new",
    "monthlyAvailableShifts": {
      "1": [
        "T2_S",
        "T3_C",
        "T4_C",
        "T5_S",
        "T6_S"
      ],
      "2": [
        "T2_S",
        "T3_C",
        "T4_C",
        "T5_S",
        "T6_S"
      ],
      "3": [
        "T2_S",
        "T3_C",
        "T4_C",
        "T5_S",
        "T6_S"
      ],
      "4": [
        "T2_S",
        "T3_C",
        "T4_C",
        "T5_S",
        "T6_S"
      ]
    },
    "availableShifts": [
      "T2_S",
      "T3_C",
      "T4_C",
      "T5_S",
      "T6_S"
    ],
    "createdAt": 1792150575548
  },
  {
    "id": "hcmute_25149043",
    "fullName": "Nguyễn Quốc Trí",
    "studentId": "25149043",
    "phone": "0946612168",
    "email": "25149043@student.hcmute.edu.vn",
    "faculty": "Xây dựng",
    "major": "Công nghệ kỹ thuật xây dựng",
    "bankName": "BIDV",
    "bankAccount": "8846439132",
    "role": "new",
    "monthlyAvailableShifts": {
      "1": [
        "T2_C",
        "T3_S",
        "T4_S",
        "T5_C",
        "T6_C"
      ],
      "2": [
        "T2_C",
        "T3_S",
        "T4_S",
        "T5_C",
        "T6_C"
      ],
      "3": [
        "T2_C",
        "T3_S",
        "T4_S",
        "T5_C",
        "T6_C"
      ],
      "4": [
        "T2_C",
        "T3_S",
        "T4_S",
        "T5_C",
        "T6_C"
      ]
    },
    "availableShifts": [
      "T2_C",
      "T3_S",
      "T4_S",
      "T5_C",
      "T6_C"
    ],
    "createdAt": 1792150635548
  },
  {
    "id": "hcmute_25151251",
    "fullName": "Lê Phước Lộc",
    "studentId": "25151251",
    "phone": "0777064721",
    "email": "25151251@student.hcmute.edu.vn",
    "faculty": "Điện - điện tử",
    "major": "Công nghệ kỹ thuật điều khiển tự động hoá",
    "bankName": "Vietcombank",
    "bankAccount": "1060421463",
    "role": "new",
    "monthlyAvailableShifts": {
      "1": [
        "T2_S",
        "T4_S",
        "T4_C",
        "T5_C",
        "T6_S"
      ],
      "2": [
        "T2_S",
        "T4_S",
        "T4_C",
        "T5_C",
        "T6_S"
      ],
      "3": [
        "T2_S",
        "T4_S",
        "T4_C",
        "T5_C",
        "T6_S"
      ],
      "4": [
        "T2_S",
        "T4_S",
        "T4_C",
        "T5_C",
        "T6_S"
      ]
    },
    "availableShifts": [
      "T2_S",
      "T4_S",
      "T4_C",
      "T5_C",
      "T6_S"
    ],
    "createdAt": 1792150695548
  },
  {
    "id": "hcmute_25154006",
    "fullName": "Trần Bảo Anh",
    "studentId": "25154006",
    "phone": "0916105378",
    "email": "25154006@student.hcmute.edu.vn",
    "faculty": "Giao thông và năng lượng",
    "major": "Giao thông và năng lượng",
    "bankName": "Vietcombank",
    "bankAccount": "1060421498",
    "role": "new",
    "monthlyAvailableShifts": {
      "1": [
        "T2_S",
        "T3_S",
        "T4_S",
        "T5_C",
        "T6_S"
      ],
      "2": [
        "T2_S",
        "T3_S",
        "T4_S",
        "T5_C",
        "T6_S"
      ],
      "3": [
        "T2_S",
        "T3_S",
        "T4_S",
        "T5_C",
        "T6_S"
      ],
      "4": [
        "T2_S",
        "T3_S",
        "T4_S",
        "T5_C",
        "T6_S"
      ]
    },
    "availableShifts": [
      "T2_S",
      "T3_S",
      "T4_S",
      "T5_C",
      "T6_S"
    ],
    "createdAt": 1792150755548
  },
  {
    "id": "hcmute_25158109",
    "fullName": "Võ Hoàng Thông",
    "studentId": "25158109",
    "phone": "0376939521",
    "email": "25158109@student.hcmute.edu.vn",
    "faculty": "In và truyền thông",
    "major": "Công nghệ kỹ thuật in",
    "bankName": "Vietcombank",
    "bankAccount": "1060425834",
    "role": "new",
    "monthlyAvailableShifts": {
      "1": [
        "T2_C",
        "T3_S",
        "T4_C",
        "T5_S",
        "T6_C"
      ],
      "2": [
        "T2_C",
        "T3_S",
        "T4_C",
        "T5_S",
        "T6_C"
      ],
      "3": [
        "T2_C",
        "T3_S",
        "T4_C",
        "T5_S",
        "T6_C"
      ],
      "4": [
        "T2_C",
        "T3_S",
        "T4_C",
        "T5_S",
        "T6_C"
      ]
    },
    "availableShifts": [
      "T2_C",
      "T3_S",
      "T4_C",
      "T5_S",
      "T6_C"
    ],
    "createdAt": 1792150815548
  },
  {
    "id": "hcmute_25160030",
    "fullName": "Trịnh Thị Mỹ Quỳnh",
    "studentId": "25160030",
    "phone": "0782806556",
    "email": "25160030@student.hcmute.edu.vn",
    "faculty": "Xây dựng",
    "major": "Quản lý và vận hành hạ tầng",
    "bankName": "Vietcombank",
    "bankAccount": "1060425917",
    "role": "new",
    "monthlyAvailableShifts": {
      "1": [
        "T2_S",
        "T3_C",
        "T4_S",
        "T5_S",
        "T6_S"
      ],
      "2": [
        "T2_S",
        "T3_C",
        "T4_S",
        "T5_S",
        "T6_S"
      ],
      "3": [
        "T2_S",
        "T3_C",
        "T4_S",
        "T5_S",
        "T6_S"
      ],
      "4": [
        "T2_S",
        "T3_C",
        "T4_S",
        "T5_S",
        "T6_S"
      ]
    },
    "availableShifts": [
      "T2_S",
      "T3_C",
      "T4_S",
      "T5_S",
      "T6_S"
    ],
    "createdAt": 1792150875548
  },
  {
    "id": "hcmute_25161100",
    "fullName": "Huỳnh Quốc Bảo",
    "studentId": "25161100",
    "phone": "0868266433",
    "email": "25161100@student.hcmute.edu.vn",
    "faculty": "Điện - điện tử",
    "major": "Chương trình đào tạo Kỹ thuật Thiết kế vi mạch",
    "bankName": "Vietcombank",
    "bankAccount": "1060425930",
    "role": "new",
    "monthlyAvailableShifts": {
      "1": [
        "T2_S",
        "T2_C",
        "T3_S",
        "T4_S",
        "T6_S"
      ],
      "2": [
        "T2_S",
        "T2_C",
        "T3_S",
        "T4_S",
        "T6_S"
      ],
      "3": [
        "T2_S",
        "T2_C",
        "T3_S",
        "T4_S",
        "T6_S"
      ],
      "4": [
        "T2_S",
        "T2_C",
        "T3_S",
        "T4_S",
        "T6_S"
      ]
    },
    "availableShifts": [
      "T2_S",
      "T2_C",
      "T3_S",
      "T4_S",
      "T6_S"
    ],
    "createdAt": 1792150935548
  },
  {
    "id": "hcmute_25161229",
    "fullName": "Phan Gia Bảo",
    "studentId": "25161229",
    "phone": "0329313318",
    "email": "25161229@student.hcmute.edu.vn",
    "faculty": "Điện - điện tử",
    "major": "Khoa Điện-Điện Tử",
    "bankName": "Vietcombank",
    "bankAccount": "1049482488",
    "role": "new",
    "monthlyAvailableShifts": {
      "1": [
        "T2_C",
        "T3_C",
        "T4_C",
        "T5_C",
        "T6_C"
      ],
      "2": [
        "T2_C",
        "T3_C",
        "T4_C",
        "T5_C",
        "T6_C"
      ],
      "3": [
        "T2_C",
        "T3_C",
        "T4_C",
        "T5_C",
        "T6_C"
      ],
      "4": [
        "T2_C",
        "T3_C",
        "T4_C",
        "T5_C",
        "T6_C"
      ]
    },
    "availableShifts": [
      "T2_C",
      "T3_C",
      "T4_C",
      "T5_C",
      "T6_C"
    ],
    "createdAt": 1792150995548
  },
  {
    "id": "hcmute_25161393",
    "fullName": "Vũ Tiến Tài",
    "studentId": "25161393",
    "phone": "0787873909",
    "email": "25161393@student.hcmute.edu.vn",
    "faculty": "Điện - điện tử",
    "major": "Điện tử viễn thông",
    "bankName": "Vietcombank",
    "bankAccount": "1060426130",
    "role": "new",
    "monthlyAvailableShifts": {
      "1": [
        "T2_S",
        "T3_S",
        "T4_S",
        "T5_S",
        "T6_S"
      ],
      "2": [
        "T2_S",
        "T3_S",
        "T4_S",
        "T5_S",
        "T6_S"
      ],
      "3": [
        "T2_S",
        "T3_S",
        "T4_S",
        "T5_S",
        "T6_S"
      ],
      "4": [
        "T2_S",
        "T3_S",
        "T4_S",
        "T5_S",
        "T6_S"
      ]
    },
    "availableShifts": [
      "T2_S",
      "T3_S",
      "T4_S",
      "T5_S",
      "T6_S"
    ],
    "createdAt": 1792151055548
  },
  {
    "id": "hcmute_25165009",
    "fullName": "Nguyễn Thị Khánh Huyền",
    "studentId": "25165009",
    "phone": "0386395758",
    "email": "25165009@student.hcmute.edu.vn",
    "faculty": "In và truyền thông",
    "major": "Công nghệ Truyền Thông",
    "bankName": "Vietcombank",
    "bankAccount": "1060421841",
    "role": "new",
    "monthlyAvailableShifts": {
      "1": [
        "T3_S",
        "T3_C",
        "T4_S",
        "T5_S",
        "T6_C"
      ],
      "2": [
        "T3_S",
        "T3_C",
        "T4_S",
        "T5_S",
        "T6_C"
      ],
      "3": [
        "T3_S",
        "T3_C",
        "T4_S",
        "T5_S",
        "T6_C"
      ],
      "4": [
        "T3_S",
        "T3_C",
        "T4_S",
        "T5_S",
        "T6_C"
      ]
    },
    "availableShifts": [
      "T3_S",
      "T3_C",
      "T4_S",
      "T5_S",
      "T6_C"
    ],
    "createdAt": 1792151115548
  },
  {
    "id": "hcmute_25165036",
    "fullName": "Võ Thị Ngọc Trân",
    "studentId": "25165036",
    "phone": "0392335954",
    "email": "25165036@student.hcmute.edu.vn",
    "faculty": "In và truyền thông",
    "major": "Công nghệ Truyền Thông",
    "bankName": "Vietcombank",
    "bankAccount": "1060426549",
    "role": "new",
    "monthlyAvailableShifts": {
      "1": [
        "T2_S",
        "T3_C",
        "T4_C",
        "T5_S",
        "T6_S"
      ],
      "2": [
        "T2_S",
        "T3_C",
        "T4_C",
        "T5_S",
        "T6_S"
      ],
      "3": [
        "T2_S",
        "T3_C",
        "T4_C",
        "T5_S",
        "T6_S"
      ],
      "4": [
        "T2_S",
        "T3_C",
        "T4_C",
        "T5_S",
        "T6_S"
      ]
    },
    "availableShifts": [
      "T2_S",
      "T3_C",
      "T4_C",
      "T5_S",
      "T6_S"
    ],
    "createdAt": 1792151175548
  },
  {
    "id": "hcmute_25168006",
    "fullName": "Mai Trương Thanh Hằng",
    "studentId": "25168006",
    "phone": "0773432494",
    "email": "25168006@student.hcmute.edu.vn",
    "faculty": "Khoa học ứng dụng",
    "major": "Vật Lý Kỹ Thuật",
    "bankName": "Vietcombank",
    "bankAccount": "1060426614",
    "role": "new",
    "monthlyAvailableShifts": {
      "1": [
        "T2_C",
        "T3_S",
        "T4_S",
        "T5_C",
        "T6_C"
      ],
      "2": [
        "T2_C",
        "T3_S",
        "T4_S",
        "T5_C",
        "T6_C"
      ],
      "3": [
        "T2_C",
        "T3_S",
        "T4_S",
        "T5_C",
        "T6_C"
      ],
      "4": [
        "T2_C",
        "T3_S",
        "T4_S",
        "T5_C",
        "T6_C"
      ]
    },
    "availableShifts": [
      "T2_C",
      "T3_S",
      "T4_S",
      "T5_C",
      "T6_C"
    ],
    "createdAt": 1792151235548
  },
  {
    "id": "hcmute_25168021",
    "fullName": "Đàm Gia Nghi",
    "studentId": "25168021",
    "phone": "0886175647",
    "email": "25168021@student.hcmute.edu.vn",
    "faculty": "Khoa học ứng dụng",
    "major": "Vật Lý Kỹ Thuật",
    "bankName": "Vietcombank",
    "bankAccount": "1060421882",
    "role": "new",
    "monthlyAvailableShifts": {
      "1": [
        "T2_S",
        "T4_S",
        "T4_C",
        "T5_C",
        "T6_S"
      ],
      "2": [
        "T2_S",
        "T4_S",
        "T4_C",
        "T5_C",
        "T6_S"
      ],
      "3": [
        "T2_S",
        "T4_S",
        "T4_C",
        "T5_C",
        "T6_S"
      ],
      "4": [
        "T2_S",
        "T4_S",
        "T4_C",
        "T5_C",
        "T6_S"
      ]
    },
    "availableShifts": [
      "T2_S",
      "T4_S",
      "T4_C",
      "T5_C",
      "T6_S"
    ],
    "createdAt": 1792151295548
  }
];

  // Tương thích ngược với tên biến cũ
  const SAMPLE_30_STUDENTS = SAMPLE_HCM_UTE_STUDENTS;

  function loadSample30Students(targetKey = 'ts_scheduler_students') {
    try {
      localStorage.setItem(targetKey, JSON.stringify(SAMPLE_HCM_UTE_STUDENTS));
      return { success: true, count: SAMPLE_HCM_UTE_STUDENTS.length };
    } catch (err) {
      console.error('Lỗi khi nạp danh sách 30 CTV mẫu:', err);
      return { success: false, error: err.message };
    }
  }

  function getSample30Students() {
    return JSON.parse(JSON.stringify(SAMPLE_HCM_UTE_STUDENTS));
  }

  // Export toàn cục
  window.SAMPLE_30_STUDENTS = SAMPLE_HCM_UTE_STUDENTS;
  window.SAMPLE_HCM_UTE_STUDENTS = SAMPLE_HCM_UTE_STUDENTS;
  window.SampleDataManager = {
    STUDENTS: SAMPLE_HCM_UTE_STUDENTS,
    loadSample30Students,
    getSample30Students
  };
})();
