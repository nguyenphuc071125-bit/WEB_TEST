function getUserInitials(name = "") {
    return name.trim()
        .split(/\s+/)
        .filter(Boolean)
        .slice(-2)
        .map(part => part[0])
        .join("")
        .toUpperCase();
}

window.renderAppUser = function (user) {
    if (!user) return;

    const name = user.name || user.email?.split("@")[0] || "Thành viên";
    const role = user.role || "Thành viên";
    const nameElement = document.querySelector("#userName");
    const roleElement = document.querySelector("#userRole");
    const avatarElement = document.querySelector("#userAvatar");
    const settingsName = document.querySelector("#notificationAccountName");
    const settingsRole = document.querySelector("#notificationAccountRole");
    const settingsAvatar = document.querySelector("#notificationAccountAvatar");

    if (nameElement) nameElement.textContent = name;
    if (roleElement) roleElement.textContent = role;
    if (avatarElement) avatarElement.textContent = getUserInitials(name) || "?";
    if (settingsName) settingsName.textContent = name;
    if (settingsRole) settingsRole.textContent = role;
    if (settingsAvatar) settingsAvatar.textContent = getUserInitials(name) || "?";
};

window.loadAppUser = async function () {
    const client = window.supabaseClient;
    if (!client) {
        throw new Error("Không tìm thấy kết nối Supabase.");
    }

    const { data: sessionData, error: sessionError } = await client.auth.getSession();
    if (sessionError) throw sessionError;
    if (!sessionData.session) {
        window.location.replace("login.html");
        return null;
    }

    const { data: { user }, error: authError } = await client.auth.getUser();
    if (authError) throw authError;
    if (!user) {
        window.location.replace("login.html");
        return null;
    }

    let membership = null;
    const { data, error: membershipError } = await client
        .from("team_members")
        .select("account_role, members(member_label)")
        .eq("user_id", user.id)
        .maybeSingle();

    if (membershipError) {
        console.error("Không thể tải thông tin thành viên:", membershipError);
    } else {
        membership = data;
    }

    const name = user.user_metadata?.full_name ||
        user.user_metadata?.name ||
        membership?.members?.member_label ||
        user.email?.split("@")[0] ||
        "Thành viên";
    const accountRole = membership?.account_role || user.app_metadata?.role || "";
    const normalizedRole = String(accountRole).trim().toLowerCase();
    const roleLabels = {
        leader: "Trưởng nhóm",
        member: "Thành viên"
    };
    const userInfo = {
        id: user.id,
        email: user.email || "",
        name,
        role: roleLabels[normalizedRole] ||
            (accountRole ? String(accountRole) : membershipError ? "Không tải được vai trò" : "Chưa gán vai trò")
    };

    window.appUser = userInfo;
    window.renderAppUser(userInfo);
    return userInfo;
};

document.addEventListener("DOMContentLoaded", async () => {
    const container = document.getElementById("sidebar-container");
    if (!container) return;

    try {
        const response = await fetch("../components/sidebar.html");
        if (!response.ok) {
            throw new Error(`Không thể tải sidebar: HTTP ${response.status}`);
        }

        container.innerHTML = await response.text();

        const currentPage = location.pathname
            .split("/")
            .pop()
            .replace(".html", "");
        container.querySelectorAll(".menu-item").forEach(item => {
            item.classList.toggle("active", item.dataset.page === currentPage);
        });

        if (window.lucide) window.lucide.createIcons();
        const user = await window.loadAppUser();
        if (user) window.renderAppUser(user);

        container.querySelector(".setting-button")?.addEventListener("click", () => {
            location.href = "setting.html";
        });
    } catch (error) {
        console.error("Không thể khởi tạo sidebar:", error);
        container.innerHTML = "<p>Không thể tải thanh điều hướng.</p>";
    }
});
