
document.addEventListener("DOMContentLoaded", async () => {

    // 1. Tải sidebar component
    const container = document.getElementById("sidebar-container");

    if (!container) return;

    try {
        const response = await fetch("../components/sidebar.html");

        if (!response.ok) {
            throw new Error("Không tìm thấy sidebar.html");
        }

        container.innerHTML = await response.text();

        // 2. Khởi tạo icon
        function initializeIcons() {
            if (window.lucide) {
                window.lucide.createIcons();
            }
        }

        initializeIcons();

        // 3. Xác định trang hiện tại
        const currentPage = location.pathname
            .split("/")
            .pop()
            .replace(".html", "");

        container.querySelectorAll(".menu-item").forEach(item => {
            item.classList.toggle(
                "active",
                item.dataset.page === currentPage
            );
        });

        // 4. Cập nhật thông tin người dùng
        // Sau này thay bằng dữ liệu từ API đăng nhập
        const user = {
            name: "Hoàng Nam",
            role: "Thành viên"
        };

        const userName = container.querySelector("#userName");
        const userRole = container.querySelector("#userRole");
        const userAvatar = container.querySelector("#userAvatar");

        if (userName) userName.textContent = user.name;
        if (userRole) userRole.textContent = user.role;

        if (userAvatar) {
            userAvatar.textContent = user.name
                .trim()
                .split(/\s+/)
                .slice(-2)
                .map(word => word[0])
                .join("")
                .toUpperCase();
        }

        // 5. Nút cài đặt
        const settingButton =
            container.querySelector(".setting-button");

        settingButton?.addEventListener("click", () => {
            location.href = "setting.html";
        });

    } catch (error) {
        console.error("Lỗi tải sidebar:", error);
        container.innerHTML =
            "<p>Không thể tải thanh điều hướng.</p>";
    }

});
