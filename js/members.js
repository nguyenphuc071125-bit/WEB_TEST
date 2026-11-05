
/* =====================================================
   MULTIMEDIA TASK - MEMBERS PAGE
   Member Management
   API-ready: Không sử dụng dữ liệu test
===================================================== */


/* =====================================================
   1. API CONFIGURATION
===================================================== */

// Khi có backend, cấu hình API tại đây.
// Ví dụ: http://localhost:3000/api

const API_CONFIG = {
    baseURL: "",

    endpoints: {
        members: "/api/members",
        detail: (id) => `/api/members/${id}`,
        update: (id) => `/api/members/${id}`,
        skills: (id) => `/api/members/${id}/skills`,
        availability: (id) => `/api/members/${id}/availability`
    }
};


// Dữ liệu lấy từ API, không khởi tạo dữ liệu mẫu.
let members = [];

let currentFilter = "all";
let currentMemberId = null;
let searchKeyword = "";
let isLoading = false;
let activeAvailabilityDay = null;
let availabilityByDay = {};


/* =====================================================
   2. DOM ELEMENTS
===================================================== */

const DOM = {
    search: document.getElementById("memberSearch"),

    tableBody: document.getElementById("memberTableBody"),

    emptyState: document.getElementById("memberEmptyState"),

    totalCount: document.getElementById("totalMemberCount"),

    filteredCount: document.getElementById("filteredMemberCount"),

    tableTitle: document.getElementById("tableTitle"),

    footerInfo: document.getElementById("tableFooterInfo"),

    filters: document.querySelectorAll(".filter-btn"),

    clearFilter: document.getElementById("clearFilter"),

    openAddButton: document.getElementById("openAddMember"),

    addModal: document.getElementById("addMemberModal"),

    updateModal: document.getElementById("updateMemberModal"),

    addForm: document.getElementById("addMemberForm"),

    updateForm: document.getElementById("updateMemberForm"),

    detailPanel: document.getElementById("memberDetailPanel"),

    detailContent: document.getElementById("memberDetailContent"),

    closeDetail: document.getElementById("closeDetailPanel")
};


/* =====================================================
   3. API SERVICE
===================================================== */

async function apiRequest(endpoint, options = {}) {

    const response = await fetch(
        API_CONFIG.baseURL + endpoint,
        {
            ...options,

            headers: {
                "Content-Type": "application/json",
                ...options.headers
            }
        }
    );

    if (!response.ok) {
        throw new Error(
            `API Error: ${response.status}`
        );
    }

    if (response.status === 204) {
        return null;
    }

    return response.json();
}


/* =====================================================
   4. LOAD MEMBERS FROM DATABASE
===================================================== */

async function loadMembers() {
    showLoading();

    try {
        const { data, error } = await window.supabaseClient
            .from("members")
            .select(`
                member_id,
                member_label,
                n_roles_in_roster,
                n_tasks_assigned,
                member_roles (
                    role,
                    in_roster,
                    n_tasks_assigned
                )
            `);

        if (error) {
            throw error;
        }

        members = (data || []).map(member => {
            const roles = Array.isArray(member.member_roles)
                ? member.member_roles
                : [];
            const groups = roles
                .map(memberRole => memberRole.role)
                .filter(Boolean);

            return {
                id: member.member_id,
                name: member.member_label || "",
                email: member.email || "",
                groups,
                group: groups.join(", "),
                role: groups.join(", ") || "Thành viên",
                status: Number(member.n_roles_in_roster) > 0
                    ? "active"
                    : "inactive",
                assignedTasks: Number(member.n_tasks_assigned) || 0,
                member_roles: roles
            };
        });

        renderMembers();
        updateMemberCounts();
    } catch (error) {
        console.error("Không thể tải danh sách thành viên:", error);
        showError("Không thể tải danh sách thành viên.");
    }
}


/* =====================================================
   5. FILTER MEMBERS
===================================================== */

function getFilteredMembers() {

    return members.filter(member => {

        const keyword = searchKeyword.toLowerCase();

        const name = (member.name || "").toLowerCase();

        const email = (member.email || "").toLowerCase();

        const groups = getMemberGroups(member);

        const matchesSearch =
            name.includes(keyword) ||
            email.includes(keyword);

        const matchesGroup =
            currentFilter === "all" ||
            groups.some(group =>
                group.toLowerCase() === currentFilter.toLowerCase()
            );

        return matchesSearch && matchesGroup;

    });

}


function getMemberGroups(member) {
    if (Array.isArray(member.groups)) {
        return member.groups;
    }

    const roles = Array.isArray(member.member_roles)
        ? member.member_roles
            .map(memberRole => memberRole.role)
            .filter(Boolean)
        : [];
    const group = member.group || member.department;

    return group
        ? [...new Set([...roles, group])]
        : roles;
}


/* =====================================================
   6. RENDER MEMBER TABLE
===================================================== */

function renderMembers() {

    if (!DOM.tableBody) return;

    const filteredMembers = getFilteredMembers();

    DOM.tableBody.innerHTML = "";

    if (filteredMembers.length === 0) {

        DOM.emptyState.hidden = false;

        DOM.tableBody.innerHTML = "";

        updateTableInfo(0);

        return;

    }

    DOM.emptyState.hidden = true;

    filteredMembers.forEach(member => {

        const row = document.createElement("tr");

        const group = getMemberGroups(member).join(", ");

        const role = member.role || "Thành viên";

        const status = member.status || "active";

        const isActive =
            status === "active" ||
            status === "Đang hoạt động";

        row.dataset.memberId = member.id;

        row.innerHTML = `

            <td>
                <div class="member-name-cell">

                    <div class="member-avatar">
                        ${escapeHTML(getInitials(member.name))}
                    </div>

                    <span>
                        ${escapeHTML(member.name || "Chưa có tên")}
                    </span>

                </div>
            </td>

            <td>
                <span class="group-badge">
                    ${escapeHTML(group || "Chưa phân nhóm")}
                </span>
            </td>

            <td>
                <span class="member-role">
                    ${escapeHTML(role)}
                </span>
            </td>

            <td class="member-email">
                ${escapeHTML(member.email || "Chưa cập nhật")}
            </td>

            <td>
                <span class="member-status ${isActive ? "" : "inactive"}">
                    ${isActive ? "Đang hoạt động" : "Không hoạt động"}
                </span>
            </td>

            <td>
                <button
                    type="button"
                    class="member-action-btn"
                    data-action="detail"
                    data-id="${escapeHTML(member.id)}"
                    title="Xem chi tiết"
                >
                    <i data-lucide="ellipsis"></i>
                </button>
            </td>

        `;

        DOM.tableBody.appendChild(row);

    });

    updateTableInfo(filteredMembers.length);

    refreshIcons();

}


/* =====================================================
   7. UPDATE MEMBER COUNTS
===================================================== */

function updateMemberCounts() {

    if (DOM.totalCount) {
        DOM.totalCount.textContent = members.length;
    }

    document.querySelectorAll("[data-count]").forEach(element => {

        const group = element.dataset.count;

        const count = members.filter(member => {

            return getMemberGroups(member).some(memberGroup =>
                memberGroup.toLowerCase() === group.toLowerCase()
            );

        }).length;

        element.textContent = count;

    });

}


function updateTableInfo(count) {

    if (DOM.filteredCount) {
        DOM.filteredCount.textContent =
            `${count} thành viên`;
    }

    if (DOM.footerInfo) {

        DOM.footerInfo.textContent =
            `Hiển thị ${count} trong ${members.length} thành viên`;

    }

    if (DOM.clearFilter) {

        DOM.clearFilter.hidden =
            currentFilter === "all" && searchKeyword === "";

    }

}


/* =====================================================
   8. SEARCH MEMBERS
===================================================== */

if (DOM.search) {

    DOM.search.addEventListener("input", event => {

        searchKeyword = event.target.value.trim();

        renderMembers();

    });

}


/* =====================================================
   9. FILTER BY GROUP
===================================================== */

DOM.filters.forEach(button => {

    button.addEventListener("click", () => {
        setMemberFilter(button.dataset.group);
    });

});


function setMemberFilter(group) {
    if (!group) return;

    currentFilter = group;

    DOM.filters.forEach(button => {
        button.classList.toggle("active", button.dataset.group === group);
    });

    updateTableTitle();
    renderMembers();
}


function updateTableTitle() {

    if (!DOM.tableTitle) return;

    DOM.tableTitle.textContent =
        currentFilter === "all"
            ? "Danh sách thành viên"
            : `Thành viên nhóm ${currentFilter}`;

}


/* CLEAR FILTER */

if (DOM.clearFilter) {

    DOM.clearFilter.addEventListener("click", () => {

        currentFilter = "all";

        searchKeyword = "";

        if (DOM.search) {
            DOM.search.value = "";
        }

        DOM.filters.forEach(button => {

            button.classList.toggle(
                "active",
                button.dataset.group === "all"
            );

        });

        updateTableTitle();

        renderMembers();

    });

}


/* =====================================================
   10. VIEW MEMBER DETAIL
===================================================== */

async function openMemberDetail(memberId) {

    try {

        const member = members.find(
            item => String(item.id) === String(memberId)
        );

        if (!member) return;

        currentMemberId = memberId;

        renderMemberDetail(member);

        DOM.detailPanel.hidden = false;

        refreshIcons();

    } catch (error) {

        console.error("Không thể tải chi tiết thành viên:", error);

    }

}


/* RENDER DETAIL */

function renderMemberDetail(member) {

    if (!DOM.detailContent) return;

    const tasks = Array.isArray(member.tasks)
        ? member.tasks
        : [];

    const assignedTasks =
        member.assignedTasks ?? tasks.length;

    const completedTasks =
        member.completedTasks ??
        tasks.filter(task => task.status === "completed").length;

    const activeTasks = tasks.filter(task =>
        task.status !== "completed"
    );

    DOM.detailContent.innerHTML = `

        <div class="detail-profile">

            <div class="detail-avatar">
                ${escapeHTML(getInitials(member.name))}
            </div>

            <div class="detail-profile-info">

                <h2>${escapeHTML(member.name || "")}</h2>

                <p>${escapeHTML(member.email || "")}</p>

            </div>

        </div>


        <div class="detail-section">

            <h4>Thông tin thành viên</h4>

            <div class="detail-info-row">
                <span>Nhóm chức năng</span>
                <strong>
                    ${escapeHTML(getMemberGroups(member).join(", ") || "Chưa cập nhật")}
                </strong>
            </div>

            <div class="detail-info-row">
                <span>Vai trò</span>
                <strong>
                    ${escapeHTML(member.role || "Thành viên")}
                </strong>
            </div>

            <div class="detail-info-row">
                <span>Trạng thái tài khoản</span>
                <strong>
                    ${member.status === "inactive"
                        ? "Không hoạt động"
                        : "Đang hoạt động"}
                </strong>
            </div>

        </div>


        <div class="detail-divider"></div>


        <div class="detail-stats">

            <div class="detail-stat-card">

                <span>Công việc được giao</span>

                <strong>${Number(assignedTasks) || 0}</strong>

            </div>

            <div class="detail-stat-card">

                <span>Công việc đã hoàn thành</span>

                <strong>${Number(completedTasks) || 0}</strong>

            </div>

        </div>


        <div class="detail-section">

            <h4>
                Công việc đang thực hiện
                (${activeTasks.length})
            </h4>

            <div class="detail-task-list">

                ${activeTasks.length
                    ? activeTasks.map(task => `

                        <div class="detail-task-item">

                            <div class="detail-task-icon">
                                <i data-lucide="file-text"></i>
                            </div>

                            <div class="detail-task-info">

                                <strong>
                                    ${escapeHTML(task.title || task.name || "")}
                                </strong>

                                <span>
                                    ${task.deadline
                                        ? `Hạn ${escapeHTML(task.deadline)}`
                                        : "Chưa có deadline"}
                                </span>

                            </div>

                        </div>

                    `).join("")
                    : `
                        <p class="field-description">
                            Không có công việc đang thực hiện.
                        </p>
                    `
                }

            </div>

        </div>


        <button
            type="button"
            class="save-btn"
            id="openUpdateMember"
            data-id="${escapeHTML(member.id)}"
        >
            Cập nhật thông tin
        </button>

    `;

    refreshIcons();

}


/* CLOSE DETAIL */

if (DOM.closeDetail) {

    DOM.closeDetail.addEventListener("click", () => {

        DOM.detailPanel.hidden = true;

        currentMemberId = null;

    });

}


/* =====================================================
   11. ADD MEMBER MODAL
===================================================== */

function openAddMemberModal() {

    if (!DOM.addModal) return;

    DOM.addModal.hidden = false;

    refreshIcons();

}


function closeAddMemberModal() {

    if (!DOM.addModal) return;

    DOM.addModal.hidden = true;

}


if (DOM.openAddButton) {

    DOM.openAddButton.addEventListener(
        "click",
        openAddMemberModal
    );

}


/* =====================================================
   12. UPDATE MEMBER MODAL
===================================================== */

function openUpdateMemberModal(memberId) {

    const member = members.find(
        item => String(item.id) === String(memberId)
    );

    if (!member || !DOM.updateModal) return;

    currentMemberId = memberId;

    DOM.updateModal.hidden = false;

    // Xóa lựa chọn cũ trước khi điền nhóm chức năng của thành viên hiện tại.
    DOM.updateForm.reset();

    // Điền thông tin vào form dựa trên name của input.
    fillForm(DOM.updateForm, member);
    initializeAvailability(member.availability || {});

    refreshIcons();

}


function closeUpdateMemberModal() {

    if (!DOM.updateModal) return;

    DOM.updateModal.hidden = true;

}


// Hiển thị các nhóm đã chọn dưới dạng thẻ trong ô chọn.
function updateSelectedGroupsUI() {
    const selectedContainer = document.getElementById("selectedGroups");
    const optionsContainer = document.getElementById("groupOptions");

    if (!selectedContainer || !optionsContainer) return;

    const selectedValues = Array.from(
        optionsContainer.querySelectorAll('input[name="groups"]:checked')
    ).map(input => input.value);

    selectedContainer.innerHTML = `
        <span class="selected-group-tags">
            ${selectedValues.length
                ? selectedValues.map(group => `
                    <span class="selected-skill-tag">
                        ${escapeHTML(group)}
                        <span aria-hidden="true">×</span>
                    </span>
                `).join("")
                : '<span class="skill-placeholder">Chọn nhóm chức năng</span>'
            }
        </span>
        <span class="dropdown-arrow">⌄</span>
    `;
    selectedContainer.setAttribute("aria-expanded", String(!optionsContainer.hidden));
}

const AVAILABILITY_DAY_NAMES = {
    "2": "Thứ 2", "3": "Thứ 3", "4": "Thứ 4", "5": "Thứ 5",
    "6": "Thứ 6", "7": "Thứ 7", "8": "Chủ nhật"
};

function initializeAvailability(value = {}) {
    availabilityByDay = {};
    activeAvailabilityDay = null;

    if (typeof value === "string") {
        try { value = JSON.parse(value); } catch (_) { value = {}; }
    }

    if (value && typeof value === "object" && !Array.isArray(value)) {
        Object.entries(value).forEach(([day, hours]) => {
            const validDay = Object.hasOwn(AVAILABILITY_DAY_NAMES, String(day));
            if (!validDay || !Array.isArray(hours)) return;
            availabilityByDay[day] = [...new Set(hours.map(Number))]
                .filter(hour => Number.isInteger(hour) && hour >= 6 && hour < 22)
                .sort((a, b) => a - b);
        });
    }

    activeAvailabilityDay = Object.keys(availabilityByDay)[0] || null;
    renderAvailabilitySlots();
}

function selectedHourRanges(hours = []) {
    const sorted = [...hours].sort((a, b) => a - b);
    const ranges = [];
    sorted.forEach(hour => {
        const last = ranges[ranges.length - 1];
        if (last && hour === last.end) last.end++;
        else ranges.push({ start: hour, end: hour + 1 });
    });
    return ranges.map(({ start, end }) =>
        `${String(start).padStart(2, "0")}:00–${String(end).padStart(2, "0")}:00`
    );
}

function renderAvailabilitySlots() {
    const container = document.getElementById("availabilitySlots");
    const hidden = document.getElementById("availabilityValue");
    if (!container) return;

    const selectedDays = Object.keys(availabilityByDay)
        .filter(day => Object.hasOwn(AVAILABILITY_DAY_NAMES, day))
        .sort((a, b) => Number(a) - Number(b));
    document.querySelectorAll(".weekday-list [data-availability-day]").forEach(button => {
        const day = button.dataset.availabilityDay;
        button.classList.toggle("is-active", selectedDays.includes(day));
        button.classList.toggle("has-hours", Boolean(availabilityByDay[day]?.length));
        button.setAttribute("aria-pressed", String(selectedDays.includes(day)));
    });

    const normalized = Object.fromEntries(
        selectedDays.map(day => [day, availabilityByDay[day] || []])
    );
    if (hidden) hidden.value = JSON.stringify(normalized);

    if (!selectedDays.length) {
        container.innerHTML = '<p class="availability-prompt">Chọn một thứ ở trên để thiết lập khung giờ rảnh.</p>';
        return;
    }

    container.innerHTML = selectedDays.map(day => {
        const chosen = availabilityByDay[day] || [];
        const ranges = selectedHourRanges(chosen);
        return `
            <section class="availability-day-row">
                <div class="availability-day-heading">
                    <strong>${AVAILABILITY_DAY_NAMES[day]}</strong>
                    <span>${ranges.length ? ranges.join(", ") : "Chưa chọn giờ"}</span>
                </div>
                <div class="availability-hour-grid" role="group" aria-label="Khung giờ rảnh ${AVAILABILITY_DAY_NAMES[day]}">
                    ${Array.from({ length: 16 }, (_, index) => {
                        const hour = index + 6;
                        const active = chosen.includes(hour);
                        return `
                            <button type="button" class="availability-hour ${active ? "is-selected" : ""}"
                                    data-availability-day="${day}" data-availability-hour="${hour}"
                                    aria-pressed="${active}" aria-label="${String(hour).padStart(2, "0")}:00 đến ${String(hour + 1).padStart(2, "0")}:00">
                                <span>${String(hour).padStart(2, "0")}:00</span>
                                <small>${String(hour + 1).padStart(2, "0")}:00</small>
                            </button>
                        `;
                    }).join("")}
                </div>
            </section>
        `;
    }).join("") + '<small class="availability-help">Bấm từng ô để bật/tắt khung giờ 1 tiếng.</small>';
}

document.addEventListener("click", event => {
    const dayButton = event.target.closest("[data-availability-day]");
    if (dayButton && !dayButton.hasAttribute("data-availability-hour")) {
        activeAvailabilityDay = dayButton.dataset.availabilityDay;
        if (Object.hasOwn(availabilityByDay, activeAvailabilityDay)) {
            delete availabilityByDay[activeAvailabilityDay];
        } else {
            availabilityByDay[activeAvailabilityDay] = [];
        }
        renderAvailabilitySlots();
        return;
    }

    const slot = event.target.closest("[data-availability-hour]");
    if (!slot) return;

    const day = slot.dataset.availabilityDay;
    const hour = Number(slot.dataset.availabilityHour);
    const selected = new Set(availabilityByDay[day] || []);
    if (selected.has(hour)) selected.delete(hour);
    else selected.add(hour);
    availabilityByDay[day] = [...selected].sort((a, b) => a - b);
    renderAvailabilitySlots();
});


// Mở/đóng danh sách nhóm và cập nhật thẻ khi checkbox thay đổi.
document.addEventListener("click", event => {
    const selectedContainer = event.target.closest("#selectedGroups");
    const optionsContainer = document.getElementById("groupOptions");

    if (selectedContainer && optionsContainer) {
        optionsContainer.hidden = !optionsContainer.hidden;
        selectedContainer.setAttribute("aria-expanded", String(!optionsContainer.hidden));
        return;
    }

    if (!event.target.closest("#groupSelect") && optionsContainer) {
        optionsContainer.hidden = true;
        const selected = document.getElementById("selectedGroups");
        if (selected) selected.setAttribute("aria-expanded", "false");
    }
});

document.addEventListener("change", event => {
    if (event.target.matches('#groupOptions input[name="groups"]')) {
        updateSelectedGroupsUI();
    }
});


/* =====================================================
   13. MODAL EVENTS
===================================================== */

document.addEventListener("click", event => {

    // Mở chi tiết thành viên
    const detailButton = event.target.closest(
        '[data-action="detail"]'
    );

    if (detailButton) {

        openMemberDetail(detailButton.dataset.id);

    }


    // Mở modal cập nhật
    const updateButton = event.target.closest(
        "#openUpdateMember"
    );

    if (updateButton) {

        openUpdateMemberModal(updateButton.dataset.id);

    }


    // Đóng modal
    const closeButton = event.target.closest(
        "[data-close-modal], .close-modal, .cancel-btn"
    );

    if (closeButton) {

        const modal = closeButton.closest(".modal-overlay");

        if (modal) {
            modal.hidden = true;
        }

    }


    // Nhấn ra ngoài modal để đóng
    if (event.target.classList.contains("modal-overlay")) {

        event.target.hidden = true;

    }

});


/* =====================================================
   14. ADD MEMBER TO API
===================================================== */

if (DOM.addForm) {

    DOM.addForm.addEventListener("submit", async event => {

        event.preventDefault();

        const formData = new FormData(DOM.addForm);

        const payload = Object.fromEntries(formData.entries());

        try {

            await apiRequest(
                API_CONFIG.endpoints.members,
                {
                    method: "POST",
                    body: JSON.stringify(payload)
                }
            );

            closeAddMemberModal();

            DOM.addForm.reset();

            await loadMembers();

        } catch (error) {

            console.error("Không thể thêm thành viên:", error);

            alert("Không thể thêm thành viên. Vui lòng thử lại.");

        }

    });

}


/* =====================================================
   15. UPDATE MEMBER INFORMATION
===================================================== */

if (DOM.updateForm) {

    DOM.updateForm.addEventListener("submit", async event => {

        event.preventDefault();

        if (!currentMemberId) return;

        const formData = new FormData(DOM.updateForm);

        const payload = Object.fromEntries(formData.entries());
        // FormData.entries() chỉ lấy một giá trị khi có nhiều checkbox cùng tên.
        // Dùng getAll() để gửi đầy đủ các nhóm chức năng đã chọn.
        payload.groups = formData.getAll("groups");
        payload.days = Object.keys(availabilityByDay)
            .filter(day => availabilityByDay[day]?.length);
        try {
            payload.availability = JSON.parse(formData.get("availability") || "{}");
        } catch (_) {
            payload.availability = {};
        }

        try {

            await apiRequest(
                API_CONFIG.endpoints.update(currentMemberId),
                {
                    method: "PATCH",
                    body: JSON.stringify(payload)
                }
            );

            closeUpdateMemberModal();

            await loadMembers();

            await openMemberDetail(currentMemberId);

        } catch (error) {

            console.error("Không thể cập nhật thành viên:", error);

            alert("Không thể cập nhật thông tin. Vui lòng thử lại.");

        }

    });

}


/* =====================================================
   16. FORM HELPER
===================================================== */

function fillForm(form, data) {

    if (!form || !data) return;

    // Chuẩn hóa dữ liệu nhóm để hỗ trợ cả API trả về groups hoặc group.
    const formData = {
        ...data,
        groups: Array.isArray(data.groups)
            ? data.groups
            : (data.group ? String(data.group).split(",").map(item => item.trim()).filter(Boolean) : [])
    };

    Object.entries(formData).forEach(([key, value]) => {

        const field = form.elements.namedItem(key);

        if (!field) return;

        if (field instanceof RadioNodeList) {

            Array.from(field).forEach(input => {

                if (input.type === "checkbox") {
                    input.checked = Array.isArray(value)
                        ? value.includes(input.value)
                        : false;
                }

                if (input.type === "radio") {
                    input.checked = input.value === String(value);
                }

            });

        } else if (field.type === "checkbox") {

            field.checked = Boolean(value);

        } else if (field.type !== "file") {

            field.value = value ?? "";

        }

    });

    if (form.id === "updateMemberForm") {
        updateSelectedGroupsUI();
    }

}


/* =====================================================
   17. LOADING & ERROR STATES
===================================================== */

function showLoading() {

    if (!DOM.tableBody) return;

    DOM.tableBody.innerHTML = `
        <tr>
            <td colspan="6" style="text-align:center; padding:35px;">
                Đang tải danh sách thành viên...
            </td>
        </tr>
    `;

    if (DOM.emptyState) {
        DOM.emptyState.hidden = true;
    }

}


function showError(message) {

    if (!DOM.tableBody) return;

    DOM.tableBody.innerHTML = "";

    if (DOM.emptyState) {

        DOM.emptyState.hidden = false;

        const heading = DOM.emptyState.querySelector("h3");

        const description = DOM.emptyState.querySelector("p");

        if (heading) heading.textContent = "Không thể tải dữ liệu";

        if (description) description.textContent = message;

    }

    if (DOM.filteredCount) {
        DOM.filteredCount.textContent = "Lỗi tải dữ liệu";
    }

    if (DOM.footerInfo) {
        DOM.footerInfo.textContent = "Vui lòng thử tải lại trang";
    }

}


/* =====================================================
   18. UTILITY FUNCTIONS
===================================================== */

function getInitials(name = "") {

    return name
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .slice(-2)
        .map(word => word.charAt(0).toUpperCase())
        .join("");

}


function escapeHTML(value = "") {

    return String(value).replace(/[&<>"']/g, character => {

        const entities = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        };

        return entities[character];

    });

}


function refreshIcons() {

    if (window.lucide) {
        window.lucide.createIcons();
    }

}


/* =====================================================
   19. INITIALIZE
===================================================== */

document.addEventListener("DOMContentLoaded", () => {

    // Mặc định đóng toàn bộ modal
    document.querySelectorAll(".modal-overlay").forEach(modal => {
        modal.hidden = true;
    });

    // Đóng panel chi tiết
    if (DOM.detailPanel) {
        DOM.detailPanel.hidden = true;
    }

    // Khởi tạo icon
    refreshIcons();

    // Chọn và áp dụng bộ lọc mặc định ngay khi mở trang.
    setMemberFilter("all");

    // Tải dữ liệu thành viên từ API
    loadMembers();

});
