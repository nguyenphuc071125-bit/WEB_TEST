function getUserInitials(name = "") {
    return name.trim()
        .split(/\s+/)
        .filter(Boolean)
        .slice(-2)
        .map(part => part[0])
        .join("")
        .toUpperCase();
}

function appNotificationStorageKey(userId) {
    return `mediatask_notifications_v1:${userId}`;
}

function readAppNotifications(userId) {
    const saved = localStorage.getItem(appNotificationStorageKey(userId));
    if (!saved) return [];
    const notifications = JSON.parse(saved);
    if (!Array.isArray(notifications)) {
        throw new Error("Dữ liệu thông báo trong trình duyệt không hợp lệ.");
    }
    return notifications;
}

function writeAppNotifications(userId, notifications) {
    localStorage.setItem(
        appNotificationStorageKey(userId),
        JSON.stringify(notifications.slice(0, 100))
    );
}

function isAssignmentComplete(assignment) {
    if (assignment.is_done === true) return true;
    return ["complete", "completed", "done"].includes(
        String(assignment.assignment_state || "").trim().toLowerCase().replace(/[\s-]+/g, "_")
    );
}

function getTaskDeadlineState(task, now = new Date()) {
    const timestamp = String(task.package_deadline_at || "");
    const timestampDate = /^\d{4}-\d{2}-\d{2}/.test(timestamp)
        ? timestamp.slice(0, 10)
        : "";
    const date = timestampDate || String(task.package_deadline_date || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;

    const [year, month, day] = date.split("-").map(Number);
    const dueDate = new Date(Date.UTC(year, month - 1, day));
    if (dueDate.getUTCFullYear() !== year ||
        dueDate.getUTCMonth() !== month - 1 ||
        dueDate.getUTCDate() !== day) return null;

    const timestampHasTime = Boolean(timestamp && !/^\d{4}-\d{2}-\d{2}$/.test(timestamp));
    const hasExactTime = Boolean(timestampHasTime || task.package_deadline_time);
    const dueAt = timestampHasTime
        ? new Date(timestamp)
        : hasExactTime
            ? new Date(`${date}T${task.package_deadline_time}`)
            : null;
    if (hasExactTime && (!dueAt || Number.isNaN(dueAt.getTime()))) return null;

    const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    const daysUntil = Math.floor((dueDate.getTime() - today) / 86400000);
    if ((hasExactTime && dueAt <= now) || (!hasExactTime && daysUntil < 0)) {
        return { type: "overdue", daysUntil };
    }
    if (daysUntil >= 0 && daysUntil <= 3) {
        return { type: "deadline", daysUntil };
    }
    return null;
}

function formatNotificationDeadline(task) {
    const timestamp = String(task.package_deadline_at || "");
    const timestampHasTime = Boolean(timestamp && !/^\d{4}-\d{2}-\d{2}$/.test(timestamp));
    const hasExactTime = Boolean(timestampHasTime || task.package_deadline_time);
    const dateOnly = !hasExactTime;
    const dateValue = /^\d{4}-\d{2}-\d{2}/.test(timestamp)
        ? timestamp.slice(0, 10)
        : String(task.package_deadline_date || "");
    const value = timestamp && !/^\d{4}-\d{2}-\d{2}$/.test(timestamp)
        ? timestamp
        : dateValue
            ? `${dateValue}T${task.package_deadline_time || "00:00:00"}`
            : "";
    let date;
    if (dateOnly && /^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
        const [year, month, day] = dateValue.split("-").map(Number);
        date = new Date(year, month - 1, day);
    } else {
        date = new Date(value);
    }
    if (!value || Number.isNaN(date.getTime())) return "Chưa có deadline";
    return new Intl.DateTimeFormat(window.AppI18n?.locale || "vi-VN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        ...(!dateOnly && (task.package_deadline_time || timestamp.includes("T"))
            ? { hour: "2-digit", minute: "2-digit" }
            : {})
    }).format(date);
}

function renderAppNotificationCenter(userId, container, loadError = "") {
    const bell = container.querySelector("#notificationBellButton");
    const badge = container.querySelector("#notificationUnreadCount");
    const panel = container.querySelector("#notificationPanel");
    const list = container.querySelector("#notificationList");
    if (!bell || !badge || !panel || !list) return [];

    let notifications = [];
    try {
        notifications = readAppNotifications(userId)
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    } catch (error) {
        console.error("Không thể hiển thị thông báo đã lưu:", error);
        loadError = "Không thể đọc thông báo trong trình duyệt.";
    }
    const unreadCount = notifications.filter(notification => !notification.read).length;
    badge.textContent = unreadCount > 99 ? "99+" : String(unreadCount);
    badge.hidden = unreadCount === 0;
    bell.setAttribute("aria-label", unreadCount
        ? `Thông báo, ${unreadCount} chưa đọc`
        : "Thông báo");

    list.replaceChildren();
    if (!notifications.length) {
        const empty = document.createElement("p");
        empty.className = "notification-list-empty";
        empty.textContent = loadError || "Chưa có thông báo.";
        list.appendChild(empty);
        return notifications;
    }

    notifications.forEach(notification => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `notification-item${notification.read ? "" : " is-unread"}`;
        button.dataset.notificationId = notification.id;
        if (notification.taskId) button.dataset.taskId = notification.taskId;

        const icon = document.createElement("span");
        icon.className = "notification-item-icon";
        const iconElement = document.createElement("i");
        iconElement.setAttribute("data-lucide", notification.type === "overdue"
            ? "triangle-alert"
            : notification.type === "new_task"
                ? "clipboard-check"
                : "calendar-clock");
        icon.appendChild(iconElement);

        const content = document.createElement("span");
        content.className = "notification-item-content";
        const title = document.createElement("strong");
        title.textContent = notification.title;
        const message = document.createElement("span");
        message.textContent = notification.message;
        const date = document.createElement("small");
        date.textContent = new Intl.DateTimeFormat(window.AppI18n?.locale || "vi-VN", {
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit"
        }).format(new Date(notification.createdAt));
        content.append(title, message, date);
        button.appendChild(icon);
        button.appendChild(content);

        if (!notification.read) {
            const dot = document.createElement("span");
            dot.className = "notification-item-unread-dot";
            dot.setAttribute("aria-label", "Chưa đọc");
            button.appendChild(dot);
        }
        list.appendChild(button);
    });

    if (loadError) {
        const error = document.createElement("p");
        error.className = "notification-list-empty";
        error.textContent = loadError;
        list.appendChild(error);
    }
    if (window.lucide) window.lucide.createIcons();
    return notifications;
}

function showAppNotificationToast(notification, unreadCount, openPanel) {
    const toast = document.createElement("div");
    toast.className = "notification-toast";
    toast.setAttribute("role", "status");

    const icon = document.createElement("span");
    icon.className = "notification-toast-icon";
    const iconElement = document.createElement("i");
    iconElement.setAttribute("data-lucide", "bell-ring");
    icon.appendChild(iconElement);

    const content = document.createElement("span");
    content.className = "notification-toast-content";
    const title = document.createElement("strong");
    title.textContent = unreadCount > 1
        ? `Bạn có ${unreadCount} thông báo chưa đọc`
        : notification.title;
    const message = document.createElement("span");
    message.textContent = notification.message;
    content.append(title, message);

    const close = document.createElement("button");
    close.type = "button";
    close.className = "notification-toast-close";
    close.setAttribute("aria-label", "Đóng thông báo");
    const closeIcon = document.createElement("i");
    closeIcon.setAttribute("data-lucide", "x");
    close.appendChild(closeIcon);
    close.addEventListener("click", event => {
        event.stopPropagation();
        toast.remove();
    });

    toast.append(icon, content, close);
    toast.addEventListener("click", openPanel);
    document.body.appendChild(toast);
    if (window.lucide) window.lucide.createIcons();
    window.setTimeout(() => toast.remove(), 7000);
}

async function initializeAppNotificationCenter(user, container) {
    const bell = container.querySelector("#notificationBellButton");
    const panel = container.querySelector("#notificationPanel");
    const list = container.querySelector("#notificationList");
    const markAllButton = container.querySelector("#markAllNotificationsRead");
    if (!bell || !panel || !list || !markAllButton) return;

    const userId = user.id;
    const openPanel = () => {
        panel.hidden = false;
        bell.setAttribute("aria-expanded", "true");
        renderAppNotificationCenter(userId, container);
    };
    const closePanel = () => {
        panel.hidden = true;
        bell.setAttribute("aria-expanded", "false");
    };

    bell.addEventListener("click", () => {
        if (panel.hidden) openPanel();
        else closePanel();
    });
    markAllButton.addEventListener("click", () => {
        try {
            const notifications = readAppNotifications(userId);
            notifications.forEach(notification => { notification.read = true; });
            writeAppNotifications(userId, notifications);
            renderAppNotificationCenter(userId, container);
        } catch (error) {
            console.error("Không thể cập nhật trạng thái thông báo:", error);
        }
    });
    list.addEventListener("click", event => {
        const item = event.target.closest("[data-notification-id]");
        if (!item) return;
        try {
            const notifications = readAppNotifications(userId);
            const notification = notifications.find(value => value.id === item.dataset.notificationId);
            if (notification) {
                notification.read = true;
                writeAppNotifications(userId, notifications);
            }
            renderAppNotificationCenter(userId, container);
            if (item.dataset.taskId) {
                const target = new URL("my-tasks.html", window.location.href);
                target.searchParams.set("taskId", item.dataset.taskId);
                window.location.href = target.href;
            }
        } catch (error) {
            console.error("Không thể mở thông báo:", error);
        }
    });
    document.addEventListener("click", event => {
        if (!container.contains(event.target) && !panel.contains(event.target)) closePanel();
    });
    document.addEventListener("keydown", event => {
        if (event.key === "Escape") closePanel();
    });

    let storedNotifications = [];
    let loadError = "";
    try {
        storedNotifications = readAppNotifications(userId);
    } catch (error) {
        console.error("Không thể đọc thông báo đã lưu:", error);
        loadError = "Không thể đọc thông báo trong trình duyệt.";
    }

    if (!window.supabaseClient?.from || !user.memberId) {
        loadError = user.memberId
            ? "Không tìm thấy kết nối Supabase."
            : "Tài khoản chưa được liên kết với thành viên.";
        renderAppNotificationCenter(userId, container, loadError);
        return;
    }

    try {
        const { data: assignments, error: assignmentError } = await window.supabaseClient
            .from("task_assignments")
            .select("task_id, member_id, assignment_state, is_done")
            .eq("member_id", user.memberId);
        if (assignmentError) throw assignmentError;

        const taskIds = [...new Set((assignments || []).map(item => String(item.task_id)))];
        let tasks = [];
        let activeEventIds = new Set();
        if (taskIds.length) {
            const tasksResult = await window.supabaseClient.from("tasks").select(`
                    task_id, event_id, task_title, package_deadline_date,
                    package_deadline_time, package_deadline_at, is_cancelled, submission_label
                `).in("task_id", taskIds);
            if (tasksResult.error) throw tasksResult.error;
            const eventIds = [...new Set((tasksResult.data || [])
                .map(task => task.event_id)
                .filter(eventId => eventId != null)
                .map(String))];
            const eventsResult = eventIds.length
                ? await window.supabaseClient.from("events")
                    .select("event_id, is_completed")
                    .in("event_id", eventIds)
                : { data: [], error: null };
            if (eventsResult.error) throw eventsResult.error;
            activeEventIds = new Set((eventsResult.data || [])
                .filter(event => event.is_completed !== true)
                .map(event => String(event.event_id)));
            tasks = (tasksResult.data || []).filter(task =>
                task.event_id != null &&
                activeEventIds.has(String(task.event_id)) &&
                task.is_cancelled !== true
            );
        }

        const assignmentsByTask = new Map();
        (assignments || []).forEach(assignment => {
            const taskKey = String(assignment.task_id);
            const taskAssignments = assignmentsByTask.get(taskKey) || [];
            taskAssignments.push(assignment);
            assignmentsByTask.set(taskKey, taskAssignments);
        });

        const snapshotKey = `mediatask_assignment_snapshot_v1:${userId}`;
        const previousSnapshot = localStorage.getItem(snapshotKey);
        const previousTaskIds = previousSnapshot === null
            ? null
            : new Set(JSON.parse(previousSnapshot).map(String));
        const activeTaskIds = tasks.map(task => String(task.task_id));
        const notifications = readAppNotifications(userId);
        const notificationIds = new Set(notifications.map(notification => notification.id));
        const generated = [];

        tasks.forEach(task => {
            const taskId = String(task.task_id);
            const ownAssignments = assignmentsByTask.get(taskId) || [];
            const isIncomplete = ownAssignments.some(assignment => !isAssignmentComplete(assignment));
            const title = task.task_title || task.submission_label || task.task_id;
            const deadlineKey = task.package_deadline_at ||
                `${task.package_deadline_date || ""}T${task.package_deadline_time || ""}`;

            if (previousTaskIds && !previousTaskIds.has(taskId) && isIncomplete) {
                generated.push({
                    id: `new_task:${taskId}`,
                    type: "new_task",
                    taskId,
                    title: "Bạn vừa được giao công việc",
                    message: title,
                    createdAt: new Date().toISOString(),
                    read: false
                });
            }

            if (!isIncomplete) return;
            const deadlineState = getTaskDeadlineState(task);
            if (!deadlineState) return;

            const type = deadlineState.type;
            const message = type === "overdue"
                ? `${title} đã quá hạn (${formatNotificationDeadline(task)}).`
                : `${title} sắp đến hạn (${formatNotificationDeadline(task)}).`;
            generated.push({
                id: `${type}:${taskId}:${deadlineKey}`,
                type,
                taskId,
                title: type === "overdue" ? "Công việc quá hạn" : "Deadline sắp đến",
                message,
                createdAt: new Date().toISOString(),
                read: false
            });
        });

        localStorage.setItem(snapshotKey, JSON.stringify(activeTaskIds));
        generated.forEach(notification => {
            if (!notificationIds.has(notification.id)) {
                notifications.unshift(notification);
                notificationIds.add(notification.id);
            }
        });
        writeAppNotifications(userId, notifications);
        const currentNotifications = renderAppNotificationCenter(userId, container);
        const newlyCreated = generated.filter(notification =>
            notificationIds.has(notification.id) &&
            !storedNotifications.some(stored => stored.id === notification.id)
        );
        const popupSessionKey = `mediatask_notification_popup_v1:${userId}`;
        let popupShown = false;
        try {
            popupShown = sessionStorage.getItem(popupSessionKey) === "shown";
        } catch (error) {
            console.error("Không thể đọc trạng thái popup thông báo:", error);
        }
        const unreadNotifications = currentNotifications.filter(notification => !notification.read);
        if (unreadNotifications.length && (newlyCreated.length || !popupShown)) {
            try {
                sessionStorage.setItem(popupSessionKey, "shown");
            } catch (error) {
                console.error("Không thể lưu trạng thái popup thông báo:", error);
            }
            showAppNotificationToast(
                newlyCreated[0] || unreadNotifications[0],
                unreadNotifications.length,
                openPanel
            );
        }
    } catch (error) {
        console.error("Không thể tải thông báo:", error);
        loadError = "Không thể tải thông báo. Hãy thử tải lại trang.";
        renderAppNotificationCenter(userId, container, loadError);
    }
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

window.renderChatHistory = function (conversations) {
    const section = document.getElementById("chatHistorySection");
    const list = document.getElementById("chatHistoryList");
    if (!section || !list) return;

    const savedConversations = Array.isArray(conversations) ? conversations : [];
    list.innerHTML = "";
    section.hidden = !savedConversations.length;
    if (!savedConversations.length) return;

    const currentPage = location.pathname.split("/").pop().replace(".html", "");
    savedConversations.forEach(conversation => {
        if (!conversation?.id || !conversation.title) return;

        const item = document.createElement("a");
        item.className = "chat-history-item";
        item.href = `dashboard.html?conversation=${encodeURIComponent(conversation.id)}`;

        const icon = document.createElement("i");
        icon.setAttribute("data-lucide", "message-square");

        const title = document.createElement("span");
        title.textContent = conversation.title;

        item.append(icon, title);
        item.addEventListener("click", event => {
            if (currentPage !== "dashboard") return;
            if (typeof window.openChatConversation !== "function") return;

            event.preventDefault();
            window.openChatConversation(conversation.id);
        });
        list.appendChild(item);
    });

    if (window.lucide) window.lucide.createIcons();
};

window.loadChatHistory = function () {
    try {
        const conversations = JSON.parse(localStorage.getItem("mediatask_conversations") || "[]");
        window.renderChatHistory(conversations);
    } catch (error) {
        console.error("Không thể tải lịch sử trò chuyện:", error);
    }
};

function initializeAceChatbot(container, user) {
    const widget = container.querySelector("#aceChatbotWidget");
    const launcher = container.querySelector("#aceChatbotLauncher");
    const panel = container.querySelector("#aceChatbotPanel");
    const historyToggle = container.querySelector("#aceChatbotHistoryToggle");
    const historyView = container.querySelector("#aceChatbotHistory");
    const historyEmpty = container.querySelector("#aceChatbotHistoryEmpty");
    const minimizeButton = container.querySelector("#aceChatbotMinimize");
    const resetButton = container.querySelector("#aceChatbotReset");
    const messages = container.querySelector("#aceChatbotMessages");
    const form = container.querySelector("#aceChatbotForm");
    const input = container.querySelector("#aceChatbotInput");
    const sendButton = container.querySelector("#aceChatbotSendButton");
    const status = container.querySelector("#aceChatbotStatus");
    if (!widget || !launcher || !panel || !historyToggle || !historyView ||
        !historyEmpty || !minimizeButton || !resetButton ||
        !messages || !form || !input || !sendButton || !status || !user?.id) return;

    const client = window.supabaseClient;
    const initialMessages = messages.innerHTML;
    let isFirstChat = true;
    let widgetStateLoaded = false;

    const setStatus = message => {
        status.textContent = message;
        status.hidden = !message;
    };
    const setComposerEnabled = enabled => {
        input.disabled = !enabled;
        sendButton.disabled = !enabled;
        resetButton.disabled = !enabled;
    };
    const renderWelcome = () => {
        const welcomeText = messages.querySelector(".ace-chatbot-welcome p");
        if (!welcomeText || isFirstChat) return;
        welcomeText.textContent = "Chào mừng bạn quay lại với ACE — AI Companion for Events.";
    };
    const setHistoryView = isOpen => {
        historyView.hidden = !isOpen;
        messages.hidden = isOpen;
        form.hidden = isOpen;
        historyToggle.setAttribute("aria-expanded", String(isOpen));
        historyToggle.setAttribute("aria-label", isOpen ? "Quay lại khung chat" : "Lịch sử trò chuyện");
        historyToggle.title = isOpen ? "Quay lại khung chat" : "Lịch sử trò chuyện";
    };
    const setOpen = isOpen => {
        panel.hidden = !isOpen;
        panel.setAttribute("aria-hidden", String(!isOpen));
        launcher.setAttribute("aria-expanded", String(isOpen));
    };
    const persistWidgetState = async (nextIsFirstChat) => {
        const { error } = await client
            .from("user_widget_state")
            .upsert({
                user_id: user.id,
                is_first_chat: nextIsFirstChat,
                last_visit: new Date().toISOString()
            }, { onConflict: "user_id" });
        if (error) throw error;

        isFirstChat = nextIsFirstChat;
        renderWelcome();
    };
    const loadWidgetState = async () => {
        setComposerEnabled(false);
        setStatus("Đang tải trạng thái chatbot...");
        try {
            if (!client?.from) {
                throw new Error("Không tìm thấy kết nối Supabase.");
            }
            const { data, error } = await client
                .from("user_widget_state")
                .select("is_first_chat")
                .eq("user_id", user.id)
                .maybeSingle();
            if (error) throw error;

            isFirstChat = data ? data.is_first_chat === true : true;
            if (data) {
                const { error: visitError } = await client
                    .from("user_widget_state")
                    .update({ last_visit: new Date().toISOString() })
                    .eq("user_id", user.id);
                if (visitError) throw visitError;
            } else {
                await persistWidgetState(true);
            }
            renderWelcome();
            widgetStateLoaded = true;
            setComposerEnabled(true);
            setStatus("");
        } catch (error) {
            console.error("Không thể tải trạng thái chatbot ACE:", error);
            setStatus(`Không tải được trạng thái ACE: ${error.message}`);
        }
    };

    launcher.addEventListener("click", () => setOpen(panel.hidden));
    minimizeButton.addEventListener("click", () => setOpen(false));
    historyToggle.addEventListener("click", () => setHistoryView(historyView.hidden));
    resetButton.addEventListener("click", async () => {
        if (!widgetStateLoaded) return;
        setComposerEnabled(false);
        setStatus("Đang đặt lại trạng thái chatbot...");
        try {
            await persistWidgetState(true);
            input.value = "";
            messages.innerHTML = initialMessages;
            setHistoryView(false);
            setStatus("");
        } catch (error) {
            console.error("Không thể đặt lại trạng thái chatbot ACE:", error);
            setStatus(`Không đặt lại được trạng thái ACE: ${error.message}`);
        } finally {
            setComposerEnabled(true);
        }
    });
    widget.addEventListener("click", event => {
        if (!(event.target instanceof Element)) return;
        const promptButton = event.target.closest("[data-prompt]");
        if (!promptButton || !widget.contains(promptButton)) return;
        input.value = promptButton.dataset.prompt || "";
        setStatus("");
        input.focus();
    });
    input.addEventListener("input", () => setStatus(""));
    form.addEventListener("submit", async event => {
        event.preventDefault();
        if (!widgetStateLoaded || !input.value.trim()) return;
        setStatus("ACE chưa kết nối AI nên tin nhắn chưa được gửi hoặc lưu.");
    });
    document.addEventListener("keydown", event => {
        if (event.key === "Escape" && !panel.hidden) setOpen(false);
    });
    historyEmpty.hidden = false;
    loadWidgetState();
}

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
        .select("member_id, account_role, members(member_label)")
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
        memberId: membership?.member_id || null,
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

        window.loadChatHistory();

        const currentPage = location.pathname
            .split("/")
            .pop()
            .replace(".html", "");
        container.querySelectorAll(".menu-item").forEach(item => {
            item.classList.toggle("active", item.dataset.page === currentPage);
        });

        if (window.lucide) window.lucide.createIcons();
        const user = await window.loadAppUser();
        if (user) {
            initializeAceChatbot(container, user);
            window.renderAppUser(user);
            await initializeAppNotificationCenter(user, container);
        }

        container.querySelector(".setting-button")?.addEventListener("click", () => {
            location.href = "setting.html";
        });
    } catch (error) {
        console.error("Không thể khởi tạo sidebar:", error);
        container.innerHTML = "<p>Không thể tải thanh điều hướng.</p>";
    }
});
