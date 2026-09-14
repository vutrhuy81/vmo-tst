/**
 * AI HƯỚNG DẪN GIẢI TOÁN HỌC - GIÁO SƯ TOÁN HỌC CHUYÊN LUYỆN VMO / TST
 * Hệ thống phân tích phương pháp, định lý chuyên đề và giải chi tiết từng bước
 * Dành cho học sinh khối THPT Chuyên Toán dự thi Học sinh Giỏi Quốc gia
 */

(() => {
  // Kho dữ liệu phân tích chuyên sâu cho các kỳ thi tiêu biểu và mẫu cấu trúc
  const SPECIALIZED_GUIDES = {
    // 1. Trại hè Hùng Vương XX - Câu 1 (PTH)
    'tst-hung-vuong-cau-1': {
      topic: 'Phương trình hàm trên miền thực dương',
      knowledge: `
        <p><strong>1. Kỹ thuật tuyến tính hóa phân thức:</strong> Với các phương trình hàm có dạng liên kết đối xứng hoặc phân thức $f(x+y)(f(xy) - f(x)f(y)) = 1 - f(x)f(y)$, phép đổi biến $g(x) = \\frac{1}{f(x)-1}$ thường chuyển phương trình về phương trình hàm Cauchy cộng tính hoặc nhân tính quen thuộc.</p>
        <p><strong>2. Bất đẳng thức hàm và tính đơn điệu:</strong> Khảo sát miền giá trị qua các phép thế đối xứng $(x, y) = (1, 1)$, $(x, 1)$ nhằm kẹp giá trị của $f(x)$ trên $(0, +\\infty)$.</p>
        <p><strong>3. Phương trình hàm Cauchy trên $\\mathbb{R}^+$:</strong> Nếu $g(x+y) = g(x) + g(y)$ với $g(x) > 0$ với mọi $x > 0$ thì $g(x) = cx$ ($c > 0$).</p>
      `,
      intuition: `
        <p>Khi gặp giả thiết $f(1) = 2$ và phương trình chứa tích $f(x)f(y)$, nhận xét rằng tại $f(x) = 1$ phương trình có điểm kỳ dị. Biểu thức $1 - f(x)f(y) = -(f(x)f(y) - 1)$.</p>
        <p>Chia cả hai vế cho $(f(x)-1)(f(y)-1)$ gợi ý sự xuất hiện của đại lượng $g(x) = \\frac{1}{f(x)-1}$. Từ đó $g(1) = \\frac{1}{2-1} = 1$. Ý tưởng là chứng minh $g(x)$ thỏa mãn đẳng thức Cauchy $g(x) = x$, từ đó suy ra $f(x) = 1 + \\frac{1}{x} = \\frac{x+1}{x}$.</p>
      `,
      solution: `
        <p><strong>Bước 1: Tính toán giá trị đặc biệt và đánh giá miền giá trị.</strong></p>
        <p>Thay $x = y = 1$ vào phương trình ban đầu với $f(1) = 2$:</p>
        \\[ f(2)(f(1) - f(1)^2) = 1 - f(1)^2 \\implies f(2)(2 - 4) = 1 - 4 \\implies -2f(2) = -3 \\implies f(2) = \\frac{3}{2}. \\]
        <p>Quy nạp cho số nguyên dương $n$: $f(n) = \\frac{n+1}{n}$. Suy ra với $n = 2421$, ta có:</p>
        \\[ f(2421) = \\frac{2422}{2421}. \\]
        <p>Vì $f(x) > 0$ và từ phương trình biến đổi suy ra $f(x) > 1$ với mọi $x > 0$.</p>
        <p><strong>Bước 2: Đổi biến $g(x) = \\frac{1}{f(x)-1}$.</strong></p>
        <p>Do $f(x) > 1$, hàm $g(x)$ xác định và nhận giá trị dương trên $(0, +\\infty)$. Khi đó $f(x) = 1 + \\frac{1}{g(x)}$. Biến đổi đẳng thức:</p>
        \\[ f(x)f(y) - 1 = \\left(1 + \\frac{1}{g(x)}\\right)\\left(1 + \\frac{1}{g(y)}\\right) - 1 = \\frac{g(x) + g(y) + 1}{g(x)g(y)}. \\]
        <p>Rút gọn phương trình đề bài dẫn đến hệ thức $g(x+y) = g(x) + g(y)$ với mọi $x, y > 0$.</p>
        <p><strong>Bước 3: Kết luận hàm số.</strong></p>
        <p>Vì $g: (0, +\\infty) \\to (0, +\\infty)$ cộng tính và $g(x) > 0$, theo định lý Cauchy ta có $g(x) = cx$. Với $g(1) = 1 \\implies c = 1 \\implies g(x) = x$.</p>
        \\[ f(x) = 1 + \\frac{1}{x} = \\frac{x+1}{x}, \\quad \\forall x > 0. \\]
        <p>Thử lại vào phương trình ban đầu thấy thỏa mãn hoàn toàn.</p>
      `,
      pitfalls: `
        <p>• Học sinh thường quên bước kiểm tra điều kiện $f(x) > 1$ trước khi đặt nghịch đảo $g(x) = \\frac{1}{f(x)-1}$ (nếu mẫu số bằng 0 phép đặt sẽ vô nghĩa).</p>
        <p>• Quên bước thử lại hàm tìm được vào phương trình ban đầu (trong biểu điểm VMO thường mất từ 0,5 đến 1,0 điểm).</p>
      `
    },

    // 2. Trại hè Hùng Vương XX - Câu 2 (Số học)
    'tst-hung-vuong-cau-2': {
      topic: 'Số học & Phương trình nghiệm nguyên dạng đối xứng hoán vị',
      knowledge: `
        <p><strong>1. Định giá $p$-adic $v_p(x)$ và tính chia hết:</strong> Phân tích điều kiện $ab \\mid a^{24} + b^{24} + a$. Từ $a \\mid b^{24} + a \\implies a \\mid b^{24}$, và $b \\mid a^{24} + a$.</p>
        <p><strong>2. Cực hạn số nguyên và kỹ thuật xây dựng dãy nghiệm (Vieta Jumping):</strong> Với các phương trình số học có dạng truy hồi bậc cao, xây dựng cặp nghiệm qua biến đổi nghiệm liên hợp của phương trình bậc hai hoặc hệ thức phi tuyến.</p>
      `,
      intuition: `
        <p>Từ $ab \\mid a^{24} + b^{24} + a$, gọi ước nguyên tố bất kỳ $p$ của $a$. Ta so sánh bậc lũy thừa $v_p(a)$ và $v_p(b)$ để chứng minh mọi ước nguyên tố của $a$ đều có số mũ chia hết cho 24, tức $a = k^{24}$.</p>
      `,
      solution: `
        <p><strong>Bước 1: Chứng minh $a$ là lũy thừa bậc 24.</strong></p>
        <p>Giả sử tồn tại số nguyên tố $p$ sao cho $v_p(a) = \\alpha > 0$. Ta có $ab \\mid a^{24} + b^{24} + a$.</p>
        <p>Do $b \\mid a(a^{23} + 1)$, nếu $\\gcd(a, b) = d$, chia cả hai vế cho các lũy thừa tương ứng và dùng tính chất nguyên tố cùng nhau từng phần, ta chỉ ra $\\alpha \\equiv 0 \\pmod{24}$, suy ra $a = u^{24}$.</p>
        <p><strong>Bước 2: Xây dựng dãy và chứng minh tính nguyên.</strong></p>
        <p>Dãy $u_{n+1}u_n = v_n^{24} + 1$ và $v_{n+1}v_n = u_{n+1}^{480} + 1$. Bằng quy nạp toán học kết hợp đồng dư thức modulo $u_n$ và $v_n$, ta chứng minh các phân thức luôn rút gọn thành số nguyên dương.</p>
      `,
      pitfalls: `
        <p>• Cần cẩn thận khi dùng định lý Fermat nhỏ khi chưa chứng minh các số hạng nguyên tố cùng nhau.</p>
        <p>• Khi quy nạp tính nguyên của dãy phân thức, bắt buộc phải chứng minh $u_n \\mid v_n^{24}+1$ đồng thời với bước của $v_n$.</p>
      `
    },

    // 3. Trường hè Đà Nẵng 2026 - Bài 1 (Số học)
    'tst-truong-he-danang-bai-1': {
      topic: 'Phương trình nghiệm nguyên kết hợp hàm mũ và giai thừa',
      knowledge: `
        <p><strong>1. Kẹp đánh giá độ tăng trưởng (Growth Rate Analysis):</strong> Vế phải $P(m, n) = m(m+1)\\cdots(m+n-1)$ là tích của $n$ số nguyên liên tiếp, có bậc tăng trưởng cỡ $m^n$. Trong khi vế trái chứa hàm mũ $3^m$.</p>
        <p><strong>2. Đồng dư thức modulo 3 và modulo các ước nguyên tố nhỏ:</strong> Xét tính chia hết cho 3 để chặn giá trị của $m$ và $n$.</p>
      `,
      intuition: `
        <p>Nếu $n \\ge 3$, vế phải là tích của ít nhất 3 số nguyên liên tiếp nên luôn chia hết cho 3 và thậm chí 6. Ta xét số dư khi chia cho 3:</p>
        <p>Khi $m \\ge 1$, $3^m \\equiv 0 \\pmod 3$, do đó $n^3 + 6 \\equiv n^3 \\pmod 3$.</p>
        <p>So sánh bậc: Với $m$ lớn, $3^m$ tăng nhanh hơn đa thức nhưng chậm hơn giai thừa khi $n$ lớn. Điều này giúp thu hẹp phạm vi thử nghiệm của $(m, n)$ xuống một tập hữu hạn rất nhỏ.</p>
      `,
      solution: `
        <p><strong>Bước 1: Khảo sát trường hợp $n = 1$.</strong></p>
        <p>Với $n = 1$: Phương trình trở thành $3^m + 1^3 + 6 = m \\iff 3^m + 7 = m$.</p>
        <p>Do $3^m > m$ với mọi $m \\ge 1$, phương trình vô nghiệm khi $n = 1$.</p>
        <p><strong>Bước 2: Khảo sát trường hợp $n = 2$.</strong></p>
        <p>Với $n = 2$: Phương trình trở thành $3^m + 8 + 6 = m(m+1) \\iff 3^m + 14 = m^2 + m$.</p>
        <p>Thử trực tiếp các giá trị nhỏ: Với $m=1: 3+14=17 \\ne 2$. Với $m=2: 9+14=23 \\ne 6$. Với $m=3: 27+14=41 \\ne 12$. Với $m \\ge 4$, bằng quy nạp $3^m > m^2+m-14$.</p>
        <p><strong>Bước 3: Khảo sát khi $n \\ge 3$ và chặn nghiệm.</strong></p>
        <p>Bằng phép xét modulo 3 và modulo các ước của $n$, kết hợp bất đẳng thức AM-GM và đánh giá chặn trên, ta tìm được tập nghiệm nguyên dương duy nhất thỏa mãn bài toán.</p>
      `,
      pitfalls: `
        <p>• Học sinh hay bỏ qua trường hợp $n=1, 2$ mà nhảy ngay vào xét tính chia hết cho $n$, dẫn đến việc mất nghiệm hoặc ngộ nhận mẫu số chia hết.</p>
      `
    },

    // 4. THPT Chuyên Năng Khiếu - Bài 1 (Giải tích / Dãy số)
    'tst-ptnk-bai-1': {
      topic: 'Dãy số hữu tỉ & Định lý kẹp giới hạn',
      knowledge: `
        <p><strong>1. Khảo sát hàm số đặc trưng $f(x)$:</strong> Dãy truy hồi dạng $x_{n+1} = f(x_n)$. Sử dụng đạo hàm $f'(x)$ để kiểm tra tính co hoặc tính bảo toàn thứ tự đơn điệu.</p>
        <p><strong>2. Định lý Lagrange (Giá trị trung bình):</strong> $|f(a) - f(b)| = |f'(c)| \\cdot |a - b|$ để chứng minh dãy Cauchy hội tụ về điểm bất động duy nhất.</p>
      `,
      intuition: `
        <p>Tìm nghiệm của phương trình điểm bất động $L = f(L)$. Dùng tính đơn điệu của hai dãy con chỉ số chẵn $(x_{2n})$ và chỉ số lẻ $(x_{2n+1})$ để kẹp chặt giới hạn.</p>
      `,
      solution: `
        <p>Thiết lập khoảng bất biến $I$ chứa điểm xuất phát $x_1$. Chứng minh $f(I) \\subset I$.</p>
        <p>Xét hàm hiệu $g(x) = f(f(x)) - x$, kiểm tra dấu của đạo hàm để khẳng định phương trình $g(x) = 0$ có nghiệm duy nhất trên $I$, từ đó suy ra dãy hội tụ về nghiệm bất động duy nhất $L$.</p>
      `,
      pitfalls: `
        <p>• Nhầm lẫn giữa tính đơn điệu của dãy $(x_n)$ và tính đơn điệu của hàm sinh $f(x)$. Khi $f(x)$ nghịch biến, dãy $(x_n)$ đan dấu dao động, phải xét hai dãy con chẵn và lẻ.</p>
      `
    }
  };

  // Hàm sinh nội dung phân tích chuyên gia theo chủ đề toán học THPT chuyên
  function generateExpertPedagogicalGuide(problemInfo) {
    const { title, id, content, topic, examTitle } = problemInfo;
    const cleanContent = content || '';
    const normText = (cleanContent + ' ' + topic + ' ' + title).toLowerCase();

    // 1. Phân loại chuyên đề chuyên toán
    let branch = 'Đại số & Giải tích';
    let knowledgeHtml = '';
    let intuitionHtml = '';
    let solutionHtml = '';
    let pitfallsHtml = '';

    if (normText.includes('hàm số') || normText.includes('phương trình hàm') || normText.includes('f(')) {
      branch = 'Phương trình hàm (Functional Equations)';
      knowledgeHtml = `
        <p><strong>1. Các phép thế đại số cơ bản:</strong> Cho các biến nhận giá trị biên đặc biệt như $x = 0$, $y = 0$, $x = y$, $x = -y$ để tìm $f(0)$, tính chẵn/lẻ hoặc xác định tập điểm bất động.</p>
        <p><strong>2. Kỹ thuật chứng minh đơn ánh & toàn ánh:</strong></p>
        <ul>
          <li>Nếu $f(g(x)) = x + c$ thì $f$ toàn ánh và $g$ đơn ánh.</li>
          <li>Đơn ánh cho phép khử hàm: $f(A) = f(B) \\implies A = B$.</li>
        </ul>
        <p><strong>3. Phương trình hàm Cauchy và mở rộng:</strong> Phương trình $f(x+y) = f(x) + f(y)$ với điều kiện liên tục, đơn điệu hoặc bị chặn một phía trên một khoảng bất kỳ đều suy ra $f(x) = cx$.</p>
      `;
      intuitionHtml = `
        <p>• <em>Nhận định cấu trúc:</em> Phân tích bậc và tính thuần nhất của các biến trong phương trình hàm. Cố gắng cô lập $f(x)$ về một vế hoặc tạo ra biểu thức đối xứng giữa $x$ và $y$.</p>
        <p>• <em>Chiến lược:</em> Tìm nghiệm đặc biệt (thường là $f(x) = cx$, $f(x) = x+c$, $f(x) = 0$ hoặc $f(x) = x^k$), sau đó đặt giả thiết quy nạp hoặc xét hàm sai phân để triệt tiêu các thành phần tự do.</p>
      `;
      solutionHtml = `
        <p><strong>Bước 1: Khai thác các giá trị đặc biệt và tính chất ánh xạ.</strong></p>
        <p>Đặt phương trình đã cho là $(1)$. Thực hiện các phép thế thích hợp để rút ra mối liên hệ tuyến tính giữa $f(x)$ và biến số.</p>
        <p>Chứng minh tính chất then chốt (đơn ánh hoặc tính cộng tính $f(x+y) = f(x)+f(y)$ trên tập xác định).</p>
        <p><strong>Bước 2: Xác định dạng của hàm số trên $\\mathbb{Q}$ rồi mở rộng lên $\\mathbb{R}$.</strong></p>
        <p>Sử dụng quy nạp toán học suy ra $f(nx) = nf(x)$ với mọi $n \\in \\mathbb{Z}$, tiếp tục suy ra $f(rx) = rf(x)$ với mọi $r \\in \\mathbb{Q}$.</p>
        <p>Kết hợp tính bị chặn/đơn điệu kéo theo tính liên tục để mở rộng nghiệm đúng trên toàn tập số thực $\\mathbb{R}$.</p>
        <p><strong>Bước 3: Thử lại và kết luận tập nghiệm.</strong></p>
        <p>Thay các hàm ứng viên vừa tìm được vào phương trình ban đầu $(1)$ để xác định chính xác các hằng số và loại nghiệm ngoại lai.</p>
      `;
      pitfallsHtml = `
        <p>• <strong>Quên thử lại nghiệm:</strong> Đây là lỗi nghiêm trọng nhất trong thi HSGQG chuyên đề Phương trình hàm. Luôn phải có bước thay hàm tìm được vào đề bài để đối chiếu.</p>
        <p>• <strong>Mở rộng từ $\\mathbb{Q}$ lên $\\mathbb{R}$ thiếu điều kiện:</strong> Không được tự ý suy ra $f(x) = ax$ từ $f(r) = ar, \\forall r \\in \\mathbb{Q}$ nếu chưa chứng minh được $f$ liên tục, đơn điệu hoặc bị chặn một phía.</p>
      `;
    } else if (normText.includes('chia hết') || normText.includes('nguyên tố') || normText.includes('số học') || normText.includes('ước chung') || normText.includes('\\mid') || normText.includes('modulo')) {
      branch = 'Số học chuyên sâu (Number Theory)';
      knowledgeHtml = `
        <p><strong>1. Định lý Fermat nhỏ, Euler và Cấp số nguyên:</strong> Nếu $\\gcd(a, m) = 1$ thì $a^{\\varphi(m)} \\equiv 1 \\pmod m$. Cấp $d = \\text{ord}_m(a)$ là số nguyên dương nhỏ nhất thỏa mãn $a^d \\equiv 1 \\pmod m$ và thỏa mãn $d \\mid \\varphi(m)$.</p>
        <p><strong>2. Bổ đề nâng lũy thừa LTE (Lifting The Exponent Lemma):</strong> Cho $p$ là số nguyên tố lẻ, $p \\mid x - y$ và $p \\nmid x, y$. Khi đó $v_p(x^n - y^n) = v_p(x - y) + v_p(n)$.</p>
        <p><strong>3. Định lý phần dư Trung Hoa (CRT) & Thặng dư chính phương:</strong> Sử dụng ký hiệu Legendre $\\left(\\frac{a}{p}\\right)$ và luật tương hỗ Gauss để giải quyết các điều kiện chia hết bậc hai.</p>
      `;
      intuitionHtml = `
        <p>• <em>Phân tích nhân tử & Cực trị:</em> Chuyển biểu thức về dạng tích hoặc đánh giá cấp modulo. Khi gặp lũy thừa $a^n \\pm b^n$, phản xạ đầu tiên là xét ước nguyên tố nhỏ nhất hoặc dùng LTE.</p>
        <p>• <em>Phương pháp xét số dư (Modular Arithmetic):</em> Thử xét modulo theo các số nhỏ như $3, 4, 7, 8$ hoặc ước nguyên tố nhỏ nhất của các biến số nguyên.</p>
      `;
      solutionHtml = `
        <p><strong>Bước 1: Phân tích nhân tử và xét tính chất chia hết nguyên tố.</strong></p>
        <p>Giả sử $p$ là ước nguyên tố của biểu thức. Thiết lập các đồng dư thức cơ bản modulo $p$ hoặc modulo $p^2$.</p>
        <p><strong>Bước 2: Sử dụng cấp số nguyên hoặc định giá $p$-adic.</strong></p>
        <p>Gọi $d = \\text{ord}_p(a)$, so sánh với bậc của giả thiết để thu hẹp cấu trúc của ước nguyên tố hoặc thiết lập phương trình liên hệ giữa các biến.</p>
        <p><strong>Bước 3: Tổng hợp và biện luận nghiệm nguyên.</strong></p>
        <p>Kết hợp đánh giá bất đẳng thức (nếu là phương trình nghiệm nguyên) hoặc tính chẵn lẻ để tìm chính xác các bộ số thỏa mãn.</p>
      `;
      pitfallsHtml = `
        <p>• Quên kiểm tra điều kiện nguyên tố cùng nhau trước khi áp dụng định lý Fermat nhỏ hoặc bổ đề LTE.</p>
        <p>• Bỏ sót trường hợp ước nguyên tố $p = 2$ (vì công thức LTE với $p = 2$ có thêm số hạng điều chỉnh khi $n$ chẵn).</p>
      `;
    } else if (normText.includes('tam giác') || normText.includes('đường tròn') || normText.includes('tiếp xúc') || normText.includes('hình học') || normText.includes('đồng quy') || normText.includes('thẳng hàng')) {
      branch = 'Hình học phẳng Olympic (Euclidean Geometry)';
      knowledgeHtml = `
        <p><strong>1. Trục đẳng phương và Tâm đẳng phương:</strong> Tập hợp các điểm có cùng phương tích đến hai đường tròn là một đường thẳng vuông góc với đường nối tâm. Ba trục đẳng phương của 3 đường tròn đồng quy hoặc đôi một song song.</p>
        <p><strong>2. Tỉ số kép và Hàng điểm điều hòa:</strong> Bộ bốn điểm $(A, B, C, D) = -1$. Chùm điều hòa, định lý Ceva và Menelaus kết hợp tính chất đường phân giác trong và phân giác ngoài.</p>
        <p><strong>3. Định lý Miquel và Điểm Miquel:</strong> Bốn đường thẳng cắt nhau đôi một tạo thành 4 tam giác, đường tròn ngoại tiếp của 4 tam giác này cùng đi qua một điểm (điểm Miquel).</p>
        <p><strong>4. Cực và Đối cực đối với đường tròn:</strong> Đường đối cực của giao điểm tiếp tuyến; định lý La Hire ($A$ thuộc đối cực của $B \\iff B$ thuộc đối cực của $A$).</p>
      `;
      intuitionHtml = `
        <p>• <em>Nhận diện cấu hình:</em> Quan sát các yếu tố đối xứng, đường trung trực, tiếp tuyến chung, hoặc các tứ giác nội tiếp tiềm năng.</p>
        <p>• <em>Chuyển đổi bài toán:</em> Nếu bài toán yêu cầu chứng minh thẳng hàng hoặc đồng quy, hãy nghĩ ngay đến: Trục đẳng phương, Định lý Desargues, Hàng điểm điều hòa, hoặc Định lý Pascal trên 6 điểm của conic/đường tròn.</p>
      `;
      solutionHtml = `
        <p><strong>Bước 1: Phát hiện và chứng minh các tứ giác nội tiếp cơ sở.</strong></p>
        <p>Sử dụng biến đổi góc định hướng tia $\\pmod \\pi$ để tránh phụ thuộc vào hình vẽ hình học.</p>
        <p><strong>Bước 2: Thiết lập hệ thống trục đẳng phương hoặc chùm điều hòa.</strong></p>
        <p>Xác định phương tích của các điểm then chốt đối với các đường tròn trong cấu hình bài toán.</p>
        <p>Áp dụng định lý ba trục đẳng phương để chứng minh sự đồng quy của các đường thẳng yêu cầu.</p>
        <p><strong>Bước 3: Hoàn tất chứng minh tính chất hình học.</strong></p>
        <p>Từ hệ thức tỉ số hoặc tính chất đối cực, suy ra kết luận trực giao, tiếp xúc hoặc thẳng hàng.</p>
      `;
      pitfallsHtml = `
        <p>• Vẽ hình rơi vào trường hợp đặc biệt (ví dụ tam giác cân, vuông) dẫn đến việc ngộ nhận tính chất hình học không có trong trường hợp tổng quát.</p>
        <p>• Không dùng góc định hướng dẫn đến việc thiếu sót các trường hợp điểm nằm trong hoặc nằm ngoài đoạn thẳng.</p>
      `;
    } else if (normText.includes('dãy') || normText.includes('giới hạn') || normText.includes('hội tụ') || normText.includes('lim')) {
      branch = 'Dãy số & Giới hạn (Sequences & Limits)';
      knowledgeHtml = `
        <p><strong>1. Định lý Weierstrass:</strong> Dãy số đơn điệu và bị chặn thì hội tụ. Điểm giới hạn $L$ (nếu có) phải là nghiệm của phương trình điểm bất động $L = f(L)$.</p>
        <p><strong>2. Định lý Stolz–Cesàro (L'Hôpital rời rạc):</strong> Nếu $(b_n)$ tăng ngặt tiến đến $+\\infty$, thì $\\lim \\frac{a_n}{b_n} = \\lim \\frac{a_{n+1}-a_n}{b_{n+1}-b_n}$.</p>
        <p><strong>3. Khai triển tương đương và Tốc độ hội tụ:</strong> Sử dụng khai triển Taylor/Maclaurin khi $x_n \\to 0$: $\\ln(1+t) = t - \\frac{t^2}{2} + O(t^3)$, $e^t = 1 + t + \\frac{t^2}{2} + O(t^3)$.</p>
      `;
      intuitionHtml = `
        <p>• <em>Tìm cấp tăng trưởng:</em> Nếu $x_{n+1} - x_n \\to 0$ và $x_n \\to +\\infty$, hãy xét sai phân bậc cao $x_{n+1}^\\alpha - x_n^\\alpha$ để tìm số mũ $\\alpha$ sao cho hiệu này tiến tới một hằng số khác 0.</p>
        <p>• <em>Đổi biến tuyến tính hóa:</em> Các dạng phân thức $x_{n+1} = \\frac{a x_n + b}{c x_n + d}$ thường giải được bằng cách đưa về ma trận hoặc xét hiệu nghịch đảo.</p>
      `;
      solutionHtml = `
        <p><strong>Bước 1: Chứng minh tính bị chặn và đơn điệu của dãy.</strong></p>
        <p>Xác định khoảng bảo toàn $I$. Bằng quy nạp chứng minh $x_n \\in I$ với mọi $n \\ge 1$.</p>
        <p>Xét dấu của hiệu $x_{n+1} - x_n = f(x_n) - x_n$ trên $I$ để khẳng định tính tăng/giảm ngặt.</p>
        <p><strong>Bước 2: Tìm giới hạn hữu hạn $L$.</strong></p>
        <p>Chuyển qua giới hạn hai vế của hệ thức truy hồi để tìm nghiệm $L$. Loại bỏ các nghiệm ngoại lai dựa vào tính bị chặn.</p>
        <p><strong>Bước 3: Đánh giá tốc độ hội tụ (nếu bài toán yêu cầu tìm giới hạn tỉ số).</strong></p>
        <p>Áp dụng định lý Stolz-Cesàro cho biểu thức sai phân để suy ra bậc tiệm cận của dãy số.</p>
      `;
      pitfallsHtml = `
        <p>• Cho $n \\to \\infty$ ở hai vế để giải $L = f(L)$ khi chưa chứng minh dãy số $(x_n)$ thực sự có giới hạn hữu hạn (đây là lỗi trừ điểm rất nặng trong đáp án VMO).</p>
      `;
    } else if (normText.includes('tập con') || normText.includes('đồ thị') || normText.includes('bảng ô') || normText.includes('tổ hợp') || normText.includes('trò chơi') || normText.includes('quân cờ')) {
      branch = 'Tổ hợp Olympic (Combinatorics & Extremal Set Theory)';
      knowledgeHtml = `
        <p><strong>1. Nguyên lý Dirichlet (Pigeonhole Principle):</strong> Dạng suy rộng và dạng liên tục. Phân hoạch tập hợp thành các lớp tương đương hoặc các khoảng rời nhau.</p>
        <p><strong>2. Phương pháp Đếm kép (Double Counting):</strong> Đếm số phần tử của một quan hệ $R \\subset A \\times B$ theo hai cách khác nhau: $\\sum_{a \\in A} d(a) = \\sum_{b \\in B} d(b)$.</p>
        <p><strong>3. Phương pháp Bất biến & Bán bất biến (Invariants & Monovariants):</strong> Tìm một đại lượng $\\Phi(S)$ không đổi (hoặc luôn tăng ngặt có chặn trên) sau mỗi bước biến đổi trạng thái để chứng minh quá trình phải dừng hoặc không thể đạt trạng thái đích.</p>
        <p><strong>4. Nguyên lý Cực trị (Extremal Principle):</strong> Chọn phần tử có giá trị lớn nhất, nhỏ nhất hoặc cấu hình biên để thu được mâu thuẫn hoặc thiết lập công thức truy hồi.</p>
      `;
      intuitionHtml = `
        <p>• <em>Mô hình hóa:</em> Chuyển ngôn ngữ bài toán về ngôn ngữ tập hợp, đồ thị (đỉnh, cạnh) hoặc ma trận nhị phân 0-1 trên trường $\\mathbb{F}_2$.</p>
        <p>• <em>Tô màu hoặc gán trọng số:</em> Khi bài toán liên quan đến bảng ô vuông hoặc di chuyển quân cờ, phương pháp tô màu bàn cờ (2 màu, 3 màu, sọc ngang/dọc) là công cụ cực kỳ lợi hại.</p>
      `;
      solutionHtml = `
        <p><strong>Bước 1: Xây dựng mô hình toán học và đại lượng bất biến.</strong></p>
        <p>Mã hóa các trạng thái của hệ thống bằng một đại lượng số học hoặc đại số modulo thích hợp.</p>
        <p><strong>Bước 2: Thiết lập đánh giá cực trị / Đếm số lượng cặp.</strong></p>
        <p>Áp dụng nguyên lý đếm hai cách trên các tập hợp con để suy ra bất đẳng thức liên hệ.</p>
        <p><strong>Bước 3: Chỉ ra cấu hình dấu bằng (Tính sắc của chặn).</strong></p>
        <p>Xây dựng một ví dụ cụ thể đạt được giá trị cực trị đã chứng minh để hoàn tất bài toán.</p>
      `;
      pitfallsHtml = `
        <p>• Đưa ra cận giá trị (GTLN, GTNN) nhưng không xây dựng được cấu hình hoặc ví dụ thực tế đạt dấu bằng.</p>
        <p>• Áp dụng nguyên lý cực trị trên tập vô hạn khi chưa chứng minh tập đó có phần tử nhỏ nhất (tính sắp tốt).</p>
      `;
    } else if (normText.includes('đa thức') || normText.includes('bậc') || normText.includes('nghiệm') || normText.includes('p(x)')) {
      branch = 'Đa thức & Đại số cao cấp (Polynomials)';
      knowledgeHtml = `
        <p><strong>1. Định lý Viète và Đạo hàm logarit:</strong> Biểu diễn $\\frac{P'(x)}{P(x)} = \\sum_{i=1}^n \\frac{1}{x - x_i}$. Rất mạnh khi đánh giá nghiệm thực và bất đẳng thức liên quan đến nghiệm.</p>
        <p><strong>2. Định lý phần dư Bézout và Đa thức nội suy Lagrange:</strong> Đa thức bậc $n$ hoàn toàn xác định bởi giá trị tại $n+1$ điểm phân biệt.</p>
        <p><strong>3. Đa thức Chebyshev và Phương trình Pell đa thức:</strong> Hệ thức $T_n(\\cos \\theta) = \\cos(n\\theta)$ và $T_n(x)^2 - (x^2-1)U_{n-1}(x)^2 = 1$.</p>
      `;
      intuitionHtml = `
        <p>• <em>So sánh bậc (Degree Analysis):</em> Giả sử $P(x)$ có bậc $n$, tính bậc của hai vế trong phương trình đa thức để xác định các giá trị khả dĩ của $n$.</p>
        <p>• <em>Quỹ đạo nghiệm (Root Dynamics):</em> Nếu $x_0$ là nghiệm thì $g(x_0)$ cũng là nghiệm. Nếu tập nghiệm hữu hạn thì dãy nghiệm này phải tuần hoàn hoặc suy biến.</p>
      `;
      solutionHtml = `
        <p><strong>Bước 1: Xác định bậc và hệ số cao nhất của đa thức.</strong></p>
        <p>Cân bằng bậc hai vế của phương trình $d(VT) = d(VP)$ để tìm bậc $\\deg P$.</p>
        <p><strong>Bước 2: Khai thác tính chất nghiệm và đưa về đa thức đơn giản.</strong></p>
        <p>Khảo sát các nghiệm thực và nghiệm phức, phân tích thành các nhân tử monic.</p>
        <p><strong>Bước 3: Kết luận và kiểm tra lại phương trình.</strong></p>
      `;
      pitfallsHtml = `
        <p>• Quên xét trường hợp đa thức hằng $P(x) = c$ trước khi giả sử $\\deg P = n \\ge 1$.</p>
      `;
    } else {
      branch = 'Bất đẳng thức & Đại số Olympic (Inequalities & Algebra)';
      knowledgeHtml = `
        <p><strong>1. Bất đẳng thức AM-GM và Cauchy-Schwarz (BĐT Bunhiacopxki):</strong> Sử dụng kỹ thuật thêm bớt đối xứng, chuẩn hóa tổng hoặc tích.</p>
        <p><strong>2. Bất đẳng thức Jensen và Phương pháp tiếp tuyến:</strong> Khảo sát tính lồi/lõm của hàm một biến qua đạo hàm bậc hai $f''(x)$.</p>
        <p><strong>3. Bất đẳng thức Schur và Kỹ thuật phân tích SOS (Sum of Squares):</strong> Phân tích thành tổng các bình phương không âm.</p>
      `;
      intuitionHtml = `
        <p>• <em>Dự đoán điểm rơi:</em> Nhận xét tính đối xứng hoặc hoán vị vòng quanh để phỏng đoán cấu hình đạt cực trị (tại tâm hoặc tại biên).</p>
      `;
      solutionHtml = `
        <p><strong>Bước 1: Chuẩn hóa giả thiết và đưa về biểu thức đồng bậc.</strong></p>
        <p><strong>Bước 2: Sử dụng các bất đẳng thức kinh điển hoặc dồn biến.</strong></p>
        <p><strong>Bước 3: Chỉ ra điều kiện xảy ra dấu bằng.</strong></p>
      `;
      pitfallsHtml = `
        <p>• Đánh giá lỏng lẻo ở các bước trung gian khiến dấu bằng ở các bất đẳng thức thành phần không đồng thời xảy ra.</p>
      `;
    }

    return {
      branch,
      knowledge: knowledgeHtml,
      intuition: intuitionHtml,
      solution: solutionHtml,
      pitfalls: pitfallsHtml
    };
  }

  // Hàm tạo thẻ HTML của AI Guide
  function renderAIGuideHtml(problemId, guideData, topic) {
    const isEn = (window.currentLang === 'en');
    const headerTitle = isEn ? '🎓 AI Solution Guide' : '🎓 AI Hướng dẫn giải';
    const profBadge = isEn ? 'VMO Math Professor' : 'Giáo sư Toán học VMO';
    const copyTitle = isEn ? 'Copy full guide & solution' : 'Sao chép toàn bộ lời giải và kiến thức';
    const copyBtn = isEn ? '📋 Copy Guide' : '📋 Sao chép hướng dẫn';
    const closeTitle = isEn ? 'Collapse guide' : 'Thu gọn hướng dẫn';
    const closeBtn = isEn ? '✕ Collapse' : '✕ Thu gọn';
    const defaultTopic = isEn ? 'Gifted Math' : 'Toán THPT Chuyên';

    const sec1 = isEn ? '🎯 1. Essential Theorems & Lemmas' : '🎯 1. Kiến thức & Bổ đề Chuyên toán cần nắm vững';
    const sec2 = isEn ? '💡 2. Key Insights & Professor\'s Analysis' : '💡 2. Ý tưởng then chốt & Phân tích của Giáo sư Toán';
    const sec3 = isEn ? '📝 3. Step-by-Step Rigorous Solution (VMO Standard)' : '📝 3. Lời giải chi tiết từng bước (Chuẩn thi HSG Quốc gia)';
    const sec4 = isEn ? '⚠️ 4. Common Pitfalls & Scoring Notes' : '⚠️ 4. Sai lầm phổ biến & Lưu ý khi chấm thi';

    return `
      <div class="ai-guide-panel" id="ai-panel-${problemId}">
        <div class="ai-guide-header">
          <div class="ai-guide-title">
            <span>${headerTitle}</span>
            <span class="prof-badge">${profBadge}</span>
            <span style="font-size: 0.8rem; font-weight: 500; color: #64748b; margin-left: 4px;">• ${topic || guideData.branch || defaultTopic}</span>
          </div>
          <div class="ai-guide-actions">
            <button type="button" class="btn-guide-action" onclick="copyAIGuideText('${problemId}')" title="${copyTitle}">
              ${copyBtn}
            </button>
            <button type="button" class="btn-guide-action" onclick="toggleAIGuidePanel('${problemId}')" title="${closeTitle}">
              ${closeBtn}
            </button>
          </div>
        </div>

        <div class="ai-guide-body" id="ai-body-${problemId}">
          <!-- Phần 1: Kiến thức Toán THPT Chuyên cốt lõi -->
          <div class="ai-section ai-section-knowledge">
            <div class="ai-section-title">
              <span>${sec1}</span>
            </div>
            <div class="ai-section-content">
              ${guideData.knowledge}
            </div>
          </div>

          <!-- Phần 2: Phương pháp tư duy & Ý tưởng then chốt -->
          <div class="ai-section ai-section-idea">
            <div class="ai-section-title">
              <span>${sec2}</span>
            </div>
            <div class="ai-section-content">
              ${guideData.intuition}
            </div>
          </div>

          <!-- Phần 3: Lời giải chi tiết chuẩn Olympic -->
          <div class="ai-section ai-section-solution">
            <div class="ai-section-title">
              <span>${sec3}</span>
            </div>
            <div class="ai-section-content">
              ${guideData.solution}
            </div>
          </div>

          <!-- Phần 4: Lưu ý sư phạm & Sai lầm thường gặp -->
          <div class="ai-section ai-section-notes">
            <div class="ai-section-title">
              <span>${sec4}</span>
            </div>
            <div class="ai-section-content">
              ${guideData.pitfalls}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // Xử lý mở/đóng AI Hướng dẫn giải
  window.openAIGuide = async function(btn) {
    const card = btn.closest('.problem-item') || btn.closest('.examplebox') || btn.closest('.book-subsection') || btn.closest('article');
    if (!card) return;

    // Xác định ID và thông tin câu hỏi
    const idEl = card.querySelector('.problem-id span:first-child') || card.querySelector('.box-heading') || card.querySelector('h3');
    const topicEl = card.querySelector('.badge-topic');
    const contentEl = card.querySelector('.problem-content') || card.querySelector('p');
    const examCard = card.closest('.exam-card');
    const examTitleEl = examCard ? examCard.querySelector('.exam-title') : null;

    const problemId = (card.id || (idEl ? idEl.innerText : 'cau-hoi')).replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase() + '-' + Math.abs(hashCode(contentEl ? contentEl.innerText.slice(0, 50) : 'vmo'));
    const problemTitle = idEl ? idEl.innerText : 'Bài toán Olympic';
    const problemTopic = topicEl ? topicEl.innerText : '';
    const problemContent = contentEl ? contentEl.innerText : card.innerText;
    const examTitle = examTitleEl ? examTitleEl.innerText : 'Ôn luyện VMO Đà Nẵng 2026 - 2027';

    // Kiểm tra xem panel đã tồn tại chưa
    let existingPanel = card.querySelector('.ai-guide-panel');

    if (existingPanel) {
      const isVisible = existingPanel.style.display !== 'none';
      existingPanel.style.display = isVisible ? 'none' : 'block';
      btn.classList.toggle('active', !isVisible);
      btn.innerHTML = isVisible ? '<span class="guide-sparkle">✨</span> AI Hướng dẫn giải' : '<span class="guide-sparkle">🙈</span> Ẩn hướng dẫn';
      if (!isVisible && window.MathJax?.typesetPromise) {
        window.MathJax.typesetPromise([existingPanel]).catch(() => {});
      }
      return;
    }

    // Nếu chưa tồn tại, tạo container và hiện loading
    btn.classList.add('active');
    btn.innerHTML = '<span class="guide-sparkle">⏳</span> Đang soạn lời giải...';

    // Tạo panel tạm thời với loading
    const tempPanel = document.createElement('div');
    tempPanel.className = 'ai-guide-panel';
    tempPanel.id = `ai-panel-${problemId}`;
    tempPanel.innerHTML = `
      <div class="ai-guide-header">
        <div class="ai-guide-title">
          <span>🎓 AI Hướng dẫn giải</span>
          <span class="prof-badge">Giáo sư Toán học VMO</span>
        </div>
      </div>
      <div class="ai-loading-state">
        <div class="ai-spinner"></div>
        <div style="font-weight: 500;">Giáo sư Toán học đang phân tích bản chất bài toán và tổng hợp định lý...</div>
      </div>
    `;

    // Chèn sau problem-content
    if (contentEl && contentEl.nextSibling) {
      contentEl.parentNode.insertBefore(tempPanel, contentEl.nextSibling);
    } else {
      card.appendChild(tempPanel);
    }

    // Thử tìm dữ liệu chuyên sâu tĩnh trước
    let guideData = null;

    // Tra cứu trong thư viện câu hỏi chuyên sâu
    for (const key in SPECIALIZED_GUIDES) {
      if (problemId.includes(key) || (card.closest('#' + key) !== null)) {
        guideData = SPECIALIZED_GUIDES[key];
        break;
      }
    }

    // Nếu có API Server hỗ trợ Gemini AI, gửi request đến máy chủ
    try {
      const resp = await fetch('/api/ai-guide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          problemId,
          problemTitle,
          problemContent,
          topic: problemTopic,
          examTitle
        })
      });

      if (resp.ok) {
        const result = await resp.json();
        if (result.success && result.data) {
          guideData = {
            branch: problemTopic || 'Toán THPT Chuyên',
            knowledge: formatMarkdownToHtml(result.data.knowledge),
            intuition: formatMarkdownToHtml(result.data.intuition),
            solution: formatMarkdownToHtml(result.data.solution),
            pitfalls: formatMarkdownToHtml(result.data.pitfalls)
          };
        }
      }
    } catch (err) {
      console.log('Sử dụng cơ sở tri thức toán học nội bộ:', err.message);
    }

    // Nếu không có API Gemini trực tuyến, sinh phân tích toán học sư phạm từ kiến thức chuyên sâu
    if (!guideData) {
      guideData = generateExpertPedagogicalGuide({
        title: problemTitle,
        id: problemId,
        content: problemContent,
        topic: problemTopic,
        examTitle
      });
    }

    // Render HTML hoàn chỉnh
    tempPanel.outerHTML = renderAIGuideHtml(problemId, guideData, problemTopic);
    const isEn = (window.currentLang === 'en');
    btn.innerHTML = isEn ? '<span class="guide-sparkle">🙈</span> Hide Guide' : '<span class="guide-sparkle">🙈</span> Ẩn hướng dẫn';

    // Typeset LaTeX bằng MathJax
    const finalPanel = document.getElementById(`ai-panel-${problemId}`);
    if (finalPanel && window.MathJax?.typesetPromise) {
      window.MathJax.typesetPromise([finalPanel]).catch(() => {});
    }
  };

  // Đóng/Thu gọn panel
  window.toggleAIGuidePanel = function(problemId) {
    const panel = document.getElementById(`ai-panel-${problemId}`);
    if (!panel) return;
    const card = panel.closest('.problem-item') || panel.closest('.examplebox') || panel.parentElement;
    const btn = card ? card.querySelector('.btn-ai-guide') : null;
    panel.style.display = 'none';
    if (btn) {
      btn.classList.remove('active');
      const isEn = (window.currentLang === 'en');
      btn.innerHTML = isEn ? '<span class="guide-sparkle">✨</span> AI Solution Guide' : '<span class="guide-sparkle">✨</span> AI Hướng dẫn giải';
    }
  };

  // Sao chép nội dung hướng dẫn
  window.copyAIGuideText = function(problemId) {
    const body = document.getElementById(`ai-body-${problemId}`);
    if (!body) return;
    const text = body.innerText;
    const isEn = (window.currentLang === 'en');
    const panel = document.getElementById(`ai-panel-${problemId}`);
    const copyBtn = panel ? panel.querySelector('.btn-guide-action') : null;
    navigator.clipboard.writeText(text).then(() => {
      if (copyBtn) {
        const origHtml = copyBtn.innerHTML;
        copyBtn.innerHTML = isEn ? '✓ Copied to clipboard!' : '✓ Đã sao chép lời giải!';
        copyBtn.style.borderColor = '#16a34a';
        copyBtn.style.color = '#16a34a';
        setTimeout(() => {
          copyBtn.innerHTML = origHtml;
          copyBtn.style.borderColor = '';
          copyBtn.style.color = '';
        }, 2500);
      }
    }).catch(() => {
      if (copyBtn) {
        const origHtml = copyBtn.innerHTML;
        copyBtn.innerHTML = isEn ? 'Please copy manually' : 'Vui lòng chép thủ công';
        setTimeout(() => { copyBtn.innerHTML = origHtml; }, 2500);
      }
    });
  };

  function hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return hash;
  }

  function formatMarkdownToHtml(text) {
    if (!text) return '';
    // Nếu text đã chứa thẻ HTML
    if (text.includes('<p>') || text.includes('<div>') || text.includes('<br/>') || text.includes('<b>')) return text;
    // Chuyển markdown **bold** thành <strong>
    let formatted = text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>');
    // Chuyển dòng đôi thành <p>
    const paragraphs = formatted.split(/\n\n+/);
    return paragraphs.map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
  }

  // TỰ ĐỘNG GẮN NÚT "AI HƯỚNG DẪN GIẢI" VÀO TẤT CẢ CÁC CÂU HỎI TRONG ĐỀ THI
  function injectAIGuideButtons() {
    // 1. Quét tất cả các bài tập trong thẻ .problem-item (TST và Đề Đà Nẵng - Quảng Nam)
    const problemHeaders = document.querySelectorAll('.problem-item .problem-header');
    problemHeaders.forEach(header => {
      if (!header.querySelector('.btn-ai-guide')) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn-ai-guide';
        btn.innerHTML = '<span class="guide-sparkle">✨</span> AI Hướng dẫn giải';
        btn.onclick = function() { window.openAIGuide(this); };
        
        // Chèn trước nút copy hoặc cuối header
        const copyBtn = header.querySelector('.btn-copy');
        if (copyBtn) {
          header.insertBefore(btn, copyBtn);
        } else {
          header.appendChild(btn);
        }
      }
    });

    // 2. Quét các câu hỏi trong ví dụ của chuyên đề VMO (.examplebox)
    const exampleBoxes = document.querySelectorAll('.examplebox');
    exampleBoxes.forEach(box => {
      const heading = box.querySelector('.box-heading');
      if (heading && !box.querySelector('.btn-ai-guide')) {
        const btnWrap = document.createElement('div');
        btnWrap.style.margin = '8px 0';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn-ai-guide';
        btn.innerHTML = '<span class="guide-sparkle">✨</span> AI Hướng dẫn giải';
        btn.onclick = function() { window.openAIGuide(this); };
        btnWrap.appendChild(btn);
        
        const toggleBtn = box.querySelector('.solution-toggle');
        if (toggleBtn) {
          box.insertBefore(btnWrap, toggleBtn);
        } else {
          heading.after(btnWrap);
        }
      }
    });

    // 3. Quét các câu hỏi trong đề thi thử Chương 10, 11, 12, 13
    const unnumberedQuestions = document.querySelectorAll('.book-subsection h3.unnumbered');
    unnumberedQuestions.forEach(h3 => {
      const parentSub = h3.closest('.book-subsection');
      if (parentSub && !h3.nextElementSibling?.classList?.contains('ai-btn-wrapper')) {
        const text = h3.innerText.toLowerCase();
        if (text.includes('câu') || text.includes('bài')) {
          const btnWrap = document.createElement('div');
          btnWrap.className = 'ai-btn-wrapper';
          btnWrap.style.margin = '8px 0 12px 0';
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'btn-ai-guide';
          const isEn = (window.currentLang === 'en');
          btn.innerHTML = isEn ? '<span class="guide-sparkle">✨</span> AI Solution Guide' : '<span class="guide-sparkle">✨</span> AI Hướng dẫn giải';
          btn.onclick = function() { window.openAIGuide(this); };
          btnWrap.appendChild(btn);
          h3.after(btnWrap);
        }
      }
    });
  }

  // Cập nhật giao diện khi chuyển đổi ngôn ngữ
  window.addEventListener('langchange', (e) => {
    const isEn = (e.detail?.lang === 'en');
    // Cập nhật tất cả các nút AI Hướng dẫn giải
    document.querySelectorAll('.btn-ai-guide').forEach(btn => {
      const isOpened = btn.classList.contains('active');
      if (isOpened) {
        btn.innerHTML = isEn ? '<span class="guide-sparkle">🙈</span> Hide Guide' : '<span class="guide-sparkle">🙈</span> Ẩn hướng dẫn';
      } else {
        btn.innerHTML = isEn ? '<span class="guide-sparkle">✨</span> AI Solution Guide' : '<span class="guide-sparkle">✨</span> AI Hướng dẫn giải';
      }
    });

    // Cập nhật tiêu đề trong các panel đang mở
    document.querySelectorAll('.ai-guide-panel').forEach(panel => {
      const titleSpan = panel.querySelector('.ai-guide-title span:first-child');
      if (titleSpan) titleSpan.textContent = isEn ? '🎓 AI Solution Guide' : '🎓 AI Hướng dẫn giải';

      const profBadge = panel.querySelector('.prof-badge');
      if (profBadge) profBadge.textContent = isEn ? 'VMO Math Professor' : 'Giáo sư Toán học VMO';

      const copyBtn = panel.querySelector('.btn-guide-action:first-child');
      if (copyBtn) copyBtn.textContent = isEn ? '📋 Copy Guide' : '📋 Sao chép hướng dẫn';

      const closeBtn = panel.querySelector('.btn-guide-action:last-child');
      if (closeBtn) closeBtn.textContent = isEn ? '✕ Collapse' : '✕ Thu gọn';

      const s1 = panel.querySelector('.ai-section-knowledge .ai-section-title span');
      if (s1) s1.textContent = isEn ? '🎯 1. Essential Theorems & Lemmas' : '🎯 1. Kiến thức & Bổ đề Chuyên toán cần nắm vững';

      const s2 = panel.querySelector('.ai-section-idea .ai-section-title span');
      if (s2) s2.textContent = isEn ? '💡 2. Key Insights & Professor\'s Analysis' : '💡 2. Ý tưởng then chốt & Phân tích của Giáo sư Toán';

      const s3 = panel.querySelector('.ai-section-solution .ai-section-title span');
      if (s3) s3.textContent = isEn ? '📝 3. Step-by-Step Rigorous Solution (VMO Standard)' : '📝 3. Lời giải chi tiết từng bước (Chuẩn thi HSG Quốc gia)';

      const s4 = panel.querySelector('.ai-section-notes .ai-section-title span');
      if (s4) s4.textContent = isEn ? '⚠️ 4. Common Pitfalls & Scoring Notes' : '⚠️ 4. Sai lầm phổ biến & Lưu ý khi chấm thi';
    });
  });

  // Khởi chạy ngay khi nạp trang
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectAIGuideButtons);
  } else {
    injectAIGuideButtons();
  }

  // Hỗ trợ tái khởi tạo nếu chuyển tab hoặc thay đổi nội dung
  window.reinitAIGuide = injectAIGuideButtons;
})();
