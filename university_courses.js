/* Course names supplied for MathApp's university catalog. */
(function(root) {
  const courses = [
    ['mth-141','MTH 141','College Calculus I','Giải tích 1'],
    ['mth-142','MTH 142','College Calculus II','Giải tích 2'],
    ['cse-191','CSE 191','Discrete Structures','Toán rời rạc'],
    ['mth-309','MTH 309','Introductory Linear Algebra','Đại số tuyến tính'],
    ['eas-305','EAS 305','Applied Probability','Xác suất ứng dụng'],
    ['sta-301','STA 301','Probability & Statistics','Xác suất và Thống kê'],
    ['cse-496','CSE 496','Algorithms and Complexity','Thuật toán và Độ phức tạp'],
    ['mth-411','MTH 411','Probability Theory','Lý thuyết xác suất nâng cao'],
    ['mth-435','MTH 435','Introduction to Cryptography','Mật mã học cơ sở'],
    ['mth-311','MTH 311','Introduction to Higher Mathematics','Toán học cao cấp']
  ].map(([id,code,name,nameVi])=>Object.freeze({id,code,name,nameVi}));
  root.MathAppUniversity = Object.freeze({courses:Object.freeze(courses),course:id=>courses.find(item=>item.id===id)||null});
})(typeof window !== 'undefined' ? window : globalThis);
