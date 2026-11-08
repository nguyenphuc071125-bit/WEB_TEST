/* =========================================
   AECPT - DASHBOARD
   AI ASSISTANT (Gemini 3.8 Flash)
========================================= */


/* =========================================
   1. DOM ELEMENTS
========================================= */

const DOM = {
    sidebarContainer: document.getElementById("sidebar-container"),
    greetingName: document.getElementById("greetingName"),
    chatMessages: document.getElementById("chatMessages"),
    chatForm: document.getElementById("chatForm"),
    messageInput: document.getElementById("messageInput"),
    sendButton: document.getElementById("sendButton"),
    quickActions: document.getElementById("quickActions"),
    noEventCard: document.querySelector(".no-event-card"),
    createEventModal: document.getElementById("createEventModal"),
    createEventForm: document.getElementById("createEventForm"),
    newEventName: document.getElementById("newEventName"),
    newEventDescription: document.getElementById("newEventDescription"),
    createEventFeedback: document.getElementById("createEventFeedback"),
    submitCreateEvent: document.getElementById("submitCreateEvent"),
    closeCreateEventModal: document.getElementById("closeCreateEventModal"),
    cancelCreateEvent: document.getElementById("cancelCreateEvent"),
    attachButton: document.getElementById("attachButton"),
    fileInput: document.getElementById("fileInput"),
    activeEventSelect: document.getElementById("activeEventSelect"),
    activeEventCard: document.getElementById("activeEventCard"),
    activeEventName: document.getElementById("activeEventName"),
    activeEventDates: document.getElementById("activeEventDates"),
    activeEventDesc: document.getElementById("activeEventDesc"),
    activeEventTasksCount: document.getElementById("activeEventTasksCount"),
    activeEventStatus: document.getElementById("activeEventStatus"),
    completeEventButton: document.getElementById("completeEventButton")
};


/* =========================================
   2. APPLICATION STATE
========================================= */

const state = {
    currentUser: null,
    conversationId: null,
    messages: [],
    isSending: false,
    activeEvent: null,
    pendingTimelinePlan: null
};


/* =========================================
   3. LUCIDE ICONS
========================================= */

function initializeIcons() {
    if (typeof lucide === "undefined") {
        console.error("Lucide chưa được tải!");
        return;
    }
    lucide.createIcons();
}


/* =========================================
   4. LOAD USER INFORMATION
========================================= */

async function loadUserInfo() {
    try {
        const user = await window.loadAppUser();
        if (!user) return;
        state.currentUser = user;
        if (DOM.greetingName) DOM.greetingName.textContent = user.name;
    } catch (error) {
        console.error("Không thể tải thông tin người dùng:", error);
    }
}


/* =========================================
   5. LOAD CHAT HISTORY
========================================= */

async function loadChatHistory() {
    try {
        const conversations = window.GeminiService?.getSavedConversations() || [];
        window.renderChatHistory?.(conversations);
    } catch (error) {
        console.error("Không thể tải lịch sử trò chuyện:", error);
    }
}

/* =========================================
   6. OPEN CONVERSATION
========================================= */

function openConversation(id) {
    try {
        const conversations = window.GeminiService?.getSavedConversations() || [];
        const conversation = conversations.find(c => c.id === id);
        if (!conversation) return;

        state.conversationId = conversation.id;
        state.messages = conversation.messages || [];
        renderAllMessages();
    } catch (error) {
        console.error("Không thể mở cuộc trò chuyện:", error);
    }
}

window.openChatConversation = openConversation;


/* =========================================
   7. RENDER CHAT MESSAGES
========================================= */

function escapeHTML(text) {
    return String(text).replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[char]);
}

function formatMessage(content) {
    if (!content) return "";
    let safe = escapeHTML(content);

    // Hỗ trợ định dạng Markdown cơ bản của Gemini
    safe = safe.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
    safe = safe.replace(/\*(.*?)\*/g, "<em>$1</em>");
    safe = safe.replace(/`([^`]+)`/g, "<code style='background:rgba(0,0,0,0.06); padding:2px 5px; border-radius:4px; font-family:monospace;'>$1</code>");

    return safe
        .split("\n")
        .map(line => {
            const trimmed = line.trim();
            if (!trimmed) return "";
            if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
                return `<li style="margin-left: 18px; margin-bottom: 4px;">${trimmed.substring(2)}</li>`;
            }
            return `<p style="margin-bottom: 6px;">${line}</p>`;
        })
        .join("");
}

function renderTimelinePlanCard(plan) {
    const { event, tasks, cpm } = plan;
    const card = document.createElement("div");
    card.className = "timeline-preview-card";

    let rowsHtml = tasks.map((t, idx) => {
        const isCrit = cpm.criticalPath.includes(t.id);
        const locale = window.AppI18n?.locale || "vi-VN";
        const onAirStr = t.on_air ? new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(t.on_air)) : "—";
        const draftStr = t.deadline ? new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(t.deadline)) : "—";
        const fbStr = t.feedback_due ? new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(t.feedback_due)) : "—";
        const badge = isCrit ? `<span class="critical-badge">Đường găng</span>` : `<span class="normal-badge">Dư ${cpm.schedule[t.id]?.slack || 0}h</span>`;
        const primary = t.assignee_name || "Chưa phân công";
        const backup = t.backup_name ? `<br><small style="color:#64748b;">(Dự phòng: ${t.backup_name})</small>` : "";

        return `<tr>
            <td><strong>${t.id}</strong></td>
            <td><strong>${escapeHTML(t.name)}</strong></td>
            <td>${t.duration}h</td>
            <td>${primary}${backup}</td>
            <td>${onAirStr}</td>
            <td>${draftStr}</td>
            <td>${fbStr}</td>
            <td>${badge}</td>
        </tr>`;
    }).join("");

    card.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; flex-wrap: wrap; gap: 8px;">
            <strong style="color: var(--primary-dark); font-size: 14px;">📊 KẾ HOẠCH & TIMELINE: ${escapeHTML(event.event_label || "Sự kiện mới")}</strong>
            <span style="font-size: 11.5px; color: #475569; background: #e0e7ff; padding: 2px 8px; border-radius: 4px; font-weight: 600;">
                Tổng thời lượng tối thiểu: ${cpm.totalHours} giờ
            </span>
        </div>
        <p style="font-size: 12px; color: #475569; margin: 0 0 8px;">
            📌 Đường găng (Critical Path): <strong style="color: #b91c1c;">${cpm.criticalPath.join(" → ") || "Không có"}</strong>
        </p>
        <div style="overflow-x: auto;">
            <table class="timeline-table">
                <thead>
                    <tr>
                        <th>Mã</th>
                        <th>Công việc</th>
                        <th>Thời lượng</th>
                        <th>Phân công</th>
                        <th>Ngày On-air</th>
                        <th>Hạn nộp nháp</th>
                        <th>Hạn Feedback</th>
                        <th>Trạng thái CPM</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHtml}
                </tbody>
            </table>
        </div>
        <div style="margin-top: 12px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
            <button type="button" class="btn-confirm-save">
                <i data-lucide="database" style="width: 14px; height: 14px;"></i>
                Xác nhận & Lưu vào Supabase
            </button>
            <span class="save-status-msg" style="font-size: 12px; color: #64748b;"></span>
        </div>
    `;

    const saveBtn = card.querySelector(".btn-confirm-save");
    const statusMsg = card.querySelector(".save-status-msg");

    saveBtn.addEventListener("click", async () => {
        saveBtn.disabled = true;
        saveBtn.innerHTML = `<i data-lucide="loader" style="width: 14px; height: 14px;"></i> Đang lưu vào Supabase...`;
        initializeIcons();

        try {
            const result = await window.TimelineEngine.savePlanToSupabase(plan);
            saveBtn.style.background = "#10b981";
            saveBtn.innerHTML = `<i data-lucide="check" style="width: 14px; height: 14px;"></i> Đã lưu thành công!`;
            statusMsg.textContent = `Đã lưu vào sự kiện ${result.event_id} với ${result.task_count} công việc.`;
            initializeIcons();

            state.pendingTimelinePlan = null;

            // Làm mới bộ chọn sự kiện trên Dashboard
            if (typeof initializeEventSelector === "function") {
                window.GeminiService.eventsCache = null;
                await initializeEventSelector();
            }

            // Gửi thông báo xác nhận vào khung chat
            const confirmMsg = {
                role: "assistant",
                content: `🎉 **Đã lưu thành công sự kiện:** **${result.event_label}** (Mã: \`${result.event_id}\`) vào cơ sở dữ liệu Supabase!\n\n` +
                         `✅ **Số công việc đã lưu:** ${result.task_count} công việc\n` +
                         `📌 **Truy xuất dữ liệu:** Các công việc này hiện đã hiển thị đồng bộ trên [Danh sách công việc](task-list.html) và [Lịch & Deadline](task-calendar.html).\n` +
                         `🎯 Dashboard hiện đã tự động chuyển theo dõi sang sự kiện này.`
            };
            state.messages.push(confirmMsg);
            renderMessage(confirmMsg);

        } catch (err) {
            console.error("Lỗi lưu Supabase:", err);
            saveBtn.disabled = false;
            saveBtn.innerHTML = `<i data-lucide="refresh-cw" style="width: 14px; height: 14px;"></i> Thử lưu lại`;
            statusMsg.style.color = "#dc2626";
            statusMsg.textContent = `Lỗi: ${err.message}`;
            initializeIcons();
        }
    });

    return card;
}

function renderMessage(message) {
    const row = document.createElement("div");
    row.className = `message-row ${message.role}`;

    if (message.role === "assistant") {
        const avatar = document.createElement("div");
        avatar.className = "message-avatar";

        const icon = document.createElement("i");
        icon.setAttribute("data-lucide", "sparkles");

        const bubble = document.createElement("div");
        bubble.className = "message-bubble";

        // Tách bỏ khối timeline_data khỏi văn bản hiển thị nếu có
        let cleanContent = (message.content || "").replace(/```timeline_data\s*[\s\S]*?\s*```/g, "").trim();
        bubble.innerHTML = formatMessage(cleanContent);

        // Nếu tin nhắn có chứa dữ liệu kế hoạch timeline, đính kèm thẻ Timeline Preview
        if (message.planData) {
            bubble.appendChild(renderTimelinePlanCard(message.planData));
        }

        avatar.appendChild(icon);
        row.append(avatar, bubble);
    } else {
        const bubble = document.createElement("div");
        bubble.className = "message-bubble";
        bubble.innerHTML = formatMessage(message.content);

        const avatar = document.createElement("div");
        avatar.className = "message-avatar user-avatar-small";

        const userName = state.currentUser?.name || "";
        const words = userName.trim().split(/\s+/);
        avatar.textContent = userName
            ? words.map(word => word[0]).slice(-2).join("").toUpperCase()
            : "ME";

        row.append(bubble, avatar);
    }

    DOM.chatMessages.appendChild(row);
    initializeIcons();

    DOM.chatMessages.scrollTop = DOM.chatMessages.scrollHeight;
}

function renderAllMessages() {
    DOM.chatMessages.innerHTML = "";
    state.messages.forEach(message => {
        renderMessage(message);
    });
}


/* =========================================
   8. SEND MESSAGE (Gemini 3.8 Flash & Timeline Planning)
========================================= */

async function sendMessage(message) {
    const content = message.trim();
    if (!content || state.isSending) return;

    // Kiểm tra nếu người dùng chat "Đồng ý lưu" / "Lưu vào Supabase" khi đang có kế hoạch chờ lưu
    const lower = content.toLowerCase();
    if (state.pendingTimelinePlan && (lower.includes("đồng ý lưu") || lower.includes("lưu vào supabase") || lower.includes("xác nhận lưu"))) {
        const saveBtn = document.querySelector(".btn-confirm-save:not([disabled])");
        if (saveBtn) {
            saveBtn.click();
            return;
        }
    }

    state.isSending = true;
    DOM.sendButton.disabled = true;

    // Hiển thị tin nhắn người dùng
    const userMessage = {
        role: "user",
        content: content
    };

    state.messages.push(userMessage);
    renderMessage(userMessage);

    // Hiệu ứng AI đang suy nghĩ
    showTyping();

    try {
        if (!state.conversationId) {
            state.conversationId = "conv_" + Date.now();
        }

        if (!window.GeminiService) {
            throw new Error("Dịch vụ Gemini AI chưa sẵn sàng. Vui lòng kiểm tra file js/gemini.js");
        }

        // Gọi Gemini Flash với sự kiện đang được chọn
        const targetEventId = state.activeEvent?.event_id || null;
        const result = await window.GeminiService.sendMessage(content, state.messages, targetEventId);

        // Xóa hiệu ứng đang nhập
        document.getElementById("typingIndicator")?.remove();

        if (result.event) {
            state.activeEvent = result.event;
            updateEventCardUI(result.event);
        }

        // Kiểm tra xem phản hồi có chứa khối dữ liệu timeline_data không
        let detectedPlan = null;
        const timelineMatch = result.reply.match(/```timeline_data\s*([\s\S]*?)\s*```/);
        if (timelineMatch && window.TimelineEngine) {
            try {
                const parsed = JSON.parse(timelineMatch[1]);
                if (state.activeEvent?.event_id) {
                    parsed.event_id = state.activeEvent.event_id;
                }
                if (parsed.tasks && parsed.tasks.length >= 1) {
                    const planResult = await window.TimelineEngine.planTimeline(parsed, parsed.tasks);
                    if (planResult.ok) {
                        detectedPlan = planResult;
                        state.pendingTimelinePlan = planResult;
                    } else {
                        console.warn("[TimelineEngine] Thuật toán báo lỗi:", planResult.error);
                    }
                }
            } catch (err) {
                console.warn("[TimelineEngine] Lỗi phân tích timeline_data:", err);
            }
        }

        // Nhận phản hồi AI
        const aiMessage = {
            role: "assistant",
            content: result.reply,
            planData: detectedPlan
        };

        state.messages.push(aiMessage);
        renderMessage(aiMessage);

        // Lưu cuộc trò chuyện vào bộ nhớ
        const firstUserMsg = state.messages.find(m => m.role === "user")?.content || "Cuộc trò chuyện";
        const title = firstUserMsg.length > 28 ? firstUserMsg.slice(0, 28) + "…" : firstUserMsg;
        window.GeminiService.saveConversation({
            id: state.conversationId,
            title: title,
            updatedAt: new Date().toISOString(),
            messages: state.messages.map(m => ({
                role: m.role,
                content: m.content
            }))
        });

        // Cập nhật danh sách lịch sử chat trên Sidebar
        await loadChatHistory();

    } catch (error) {
        document.getElementById("typingIndicator")?.remove();
        console.error("Gemini Flash error:", error);

        const errorMessage = {
            role: "assistant",
            content: `⚠️ ${error.message || "Không thể kết nối đến Gemini Flash. Vui lòng kiểm tra lại API Key hoặc mạng."}`
        };

        state.messages.push(errorMessage);
        renderMessage(errorMessage);
    } finally {
        state.isSending = false;
        DOM.sendButton.disabled = false;
        DOM.messageInput.focus();
    }
}


/* =========================================
   9. TYPING INDICATOR
========================================= */

function showTyping() {
    const row = document.createElement("div");
    row.className = "message-row assistant";
    row.id = "typingIndicator";

    row.innerHTML = `
        <div class="message-avatar">
            <i data-lucide="sparkles"></i>
        </div>
        <div class="message-bubble">
            <div class="typing-indicator">
                <span></span>
                <span></span>
                <span></span>
            </div>
        </div>
    `;

    DOM.chatMessages.appendChild(row);
    initializeIcons();
}


/* =========================================
   10. CHAT EVENTS
========================================= */

function initializeChatEvents() {
    DOM.chatForm.addEventListener("submit", event => {
        event.preventDefault();
        sendMessage(DOM.messageInput.value);
        DOM.messageInput.value = "";
    });

    DOM.messageInput.addEventListener("keydown", event => {
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            DOM.chatForm.requestSubmit();
        }
    });
}


/* =========================================
   11. QUICK ACTIONS
========================================= */

function initializeQuickActions() {
    DOM.quickActions?.addEventListener("click", event => {
        const card = event.target.closest(".quick-card");
        if (!card) return;

        if (card.classList.contains("no-event-card")) {
            openCreateEventModal();
            return;
        }

        const prompt = card.dataset.prompt;
        if (prompt) {
            sendMessage(prompt);
        }
    });
}

function openCreateEventModal() {
    if (!DOM.createEventModal) return;
    DOM.createEventFeedback.textContent = "";
    DOM.createEventFeedback.classList.remove("is-error");
    DOM.createEventModal.hidden = false;
    DOM.newEventName?.focus();
}

function closeCreateEventModal() {
    if (!DOM.createEventModal || DOM.submitCreateEvent?.disabled) return;
    DOM.createEventModal.hidden = true;
    DOM.createEventForm?.reset();
    DOM.createEventFeedback.textContent = "";
    DOM.createEventFeedback.classList.remove("is-error");
    DOM.noEventCard?.focus();
}

function initializeCreateEventModal() {
    DOM.createEventForm?.addEventListener("submit", async event => {
        event.preventDefault();
        const eventName = DOM.newEventName.value.trim();
        const description = DOM.newEventDescription.value.trim();
        if (!eventName) {
            DOM.newEventName.focus();
            return;
        }

        const client = window.supabaseClient;
        if (!client) {
            DOM.createEventFeedback.textContent = "Chưa kết nối được Supabase. Vui lòng tải lại trang và thử lại.";
            DOM.createEventFeedback.classList.add("is-error");
            return;
        }
        if (!window.GeminiService) {
            DOM.createEventFeedback.textContent = "Trợ lý sự kiện chưa sẵn sàng. Vui lòng tải lại trang và thử lại.";
            DOM.createEventFeedback.classList.add("is-error");
            return;
        }

        DOM.submitCreateEvent.disabled = true;
        DOM.submitCreateEvent.textContent = "Đang tạo...";
        DOM.createEventFeedback.textContent = "";
        DOM.createEventFeedback.classList.remove("is-error");

        try {
            const { data: existingEvents, error: listError } = await client
                .from("events")
                .select("event_id");
            if (listError) throw listError;

            const highestEventNumber = (existingEvents || []).reduce((highest, item) => {
                const match = String(item.event_id || "").match(/(\d+)$/);
                return match ? Math.max(highest, Number(match[1])) : highest;
            }, 0);
            const eventId = `EVT_${String(highestEventNumber + 1).padStart(2, "0")}`;
            const eventPayload = {
                event_id: eventId,
                event_label: eventName,
                event_category: null,
                category_note: description || null,
                n_tasks: 0,
                first_on_air_date: null,
                last_on_air_date: null,
                is_completed: false
            };
            const { data: createdEvent, error: insertError } = await client
                .from("events")
                .insert(eventPayload)
                .select("event_id, event_label, event_category, category_note, n_tasks, first_on_air_date, last_on_air_date, is_completed")
                .single();
            if (insertError) throw insertError;

            window.GeminiService.eventsCache = null;
            window.GeminiService.setActiveEventId(createdEvent.event_id);
            state.activeEvent = createdEvent;
            state.conversationId = null;
            state.messages = [];
            DOM.chatMessages.innerHTML = `
                <div class="assistant-intro">
                    <span>Trợ lý AI</span>
                    <p>Đã tạo sự kiện <strong>${escapeHTML(createdEvent.event_label)}</strong>. Hãy cho AI biết thời gian và các công việc cần thực hiện để lập timeline.</p>
                </div>
            `;

            DOM.createEventModal.hidden = true;
            DOM.createEventForm.reset();
            await initializeEventSelector();
            DOM.messageInput?.focus();
        } catch (error) {
            console.error("Không thể tạo sự kiện:", error);
            DOM.createEventFeedback.textContent = `Không thể tạo sự kiện: ${error.message}`;
            DOM.createEventFeedback.classList.add("is-error");
        } finally {
            DOM.submitCreateEvent.disabled = false;
            DOM.submitCreateEvent.textContent = "Tạo sự kiện";
        }
    });

    DOM.closeCreateEventModal?.addEventListener("click", closeCreateEventModal);
    DOM.cancelCreateEvent?.addEventListener("click", closeCreateEventModal);
    DOM.createEventModal?.addEventListener("click", event => {
        if (event.target === DOM.createEventModal) closeCreateEventModal();
    });
    document.addEventListener("keydown", event => {
        if (event.key === "Escape" && DOM.createEventModal && !DOM.createEventModal.hidden) {
            closeCreateEventModal();
        }
    });
}


/* =========================================
   12. FILE UPLOAD
========================================= */

function initializeFileUpload() {
    DOM.attachButton.addEventListener("click", () => {
        DOM.fileInput.click();
    });

    DOM.fileInput.addEventListener("change", async () => {
        const file = DOM.fileInput.files[0];
        if (!file) return;

        alert(`Đã chọn tệp: ${file.name}. Tính năng gửi kèm tệp cho Gemini Flash sẽ được tích hợp trong bản cập nhật tới.`);
        DOM.fileInput.value = "";
    });
}


/* =========================================
   13. GEMINI KEY CONFIGURATION BUTTON
========================================= */

function initializeKeyConfigButton() {
    const btn = DOM.keyConfigBtn;
    if (!btn) return;
    const statusText = DOM.keyStatusText;

    function updateLabel() {
        if (!statusText) return;
        const hasKey = window.GeminiService?.hasApiKey();
        statusText.textContent = hasKey ? "Đổi Gemini Key" : "Nhập Gemini Key";
    }

    updateLabel();

    btn?.addEventListener("click", async () => {
        const key = await window.GeminiService?.requestApiKey();
        if (key) {
            alert("Đã cập nhật Gemini API Key thành công!");
        }
        updateLabel();
    });
}


/* =========================================
   14. ACTIVE EVENT SELECTOR (ANTI-HALLUCINATION)
========================================= */

function updateEventCardUI(event) {
    if (!event || !DOM.activeEventCard) return;
    const isCompleted = event.is_completed === true;
    const userRole = String(state.currentUser?.role || "").toLowerCase();
    const isLeader = userRole === "leader" || userRole.includes("trưởng nhóm");

    if (DOM.activeEventName) {
        DOM.activeEventName.textContent = `${event.event_label} (${event.event_id})`;
    }

    if (DOM.activeEventDates) {
        const from = event.first_on_air_date ? event.first_on_air_date.split("-").reverse().join("/") : "Chưa rõ";
        const to = event.last_on_air_date ? event.last_on_air_date.split("-").reverse().join("/") : "Chưa rõ";
        DOM.activeEventDates.textContent = `${from} - ${to}`;
    }

    if (DOM.activeEventDesc) {
        DOM.activeEventDesc.textContent = event.category_note || event.event_category || "Không có ghi chú mô tả sự kiện.";
    }

    if (DOM.activeEventTasksCount) {
        const count = event.n_tasks || 0;
        DOM.activeEventTasksCount.innerHTML = `<i data-lucide="check-square" style="width: 13px; height: 13px;"></i> ${count} công việc`;
    }

    if (DOM.activeEventStatus) {
        DOM.activeEventStatus.textContent = isCompleted ? "Đã hoàn tất" : "Đang diễn ra";
        DOM.activeEventStatus.classList.toggle("is-completed", isCompleted);
    }

    if (DOM.completeEventButton) {
        DOM.completeEventButton.hidden = isCompleted || !isLeader;
        DOM.completeEventButton.disabled = false;
        DOM.completeEventButton.textContent = "Hoàn tất sự kiện";
    }

    DOM.activeEventCard.style.display = "flex";
    initializeIcons();
}

async function completeActiveEvent() {
    const event = state.activeEvent;
    const button = DOM.completeEventButton;
    if (!event || !button || event.is_completed || button.disabled) return;

    if (!window.confirm(`Xác nhận hoàn tất sự kiện "${event.event_label}"?`)) return;

    button.disabled = true;
    button.textContent = "Đang cập nhật...";

    try {
        const { data, error } = await window.supabaseClient
            .from("events")
            .update({ is_completed: true })
            .eq("event_id", event.event_id)
            .select("event_id, is_completed")
            .maybeSingle();

        if (error) throw error;
        if (!data) {
            throw new Error("Không cập nhật được sự kiện. Hãy kiểm tra quyền RLS hoặc trạng thái hiện tại.");
        }

        event.is_completed = true;
        const cachedEvents = await window.GeminiService.getEventsList();
        const cachedEvent = cachedEvents.find(item => item.event_id === event.event_id);
        if (cachedEvent) cachedEvent.is_completed = true;

        window.GeminiService.setActiveEventId(null);
        await initializeEventSelector();
    } catch (error) {
        console.error("Không thể hoàn tất sự kiện:", error);
        button.disabled = false;
        button.textContent = "Hoàn tất sự kiện";
        window.alert(`Không thể hoàn tất sự kiện: ${error.message}`);
    }
}

async function initializeEventSelector() {
    if (!window.GeminiService) return;

    try {
        const activeEvent = await window.GeminiService.getOrDetectOngoingEvent();
        state.activeEvent = activeEvent;

        if (activeEvent) {
            updateEventCardUI(activeEvent);
        } else {
            if (DOM.activeEventCard) DOM.activeEventCard.style.display = "none";
            if (DOM.noEventCard) DOM.noEventCard.style.display = "";
        }

        if (DOM.activeEventSelect) {
            const events = (await window.GeminiService.getEventsList())
                .filter(event => event.is_completed !== true);
            if (!events.length) {
                DOM.activeEventSelect.innerHTML = '<option value="">Không có sự kiện nào</option>';
                return;
            }

            DOM.activeEventSelect.innerHTML = "";
            events.forEach(ev => {
                const opt = document.createElement("option");
                opt.value = ev.event_id;
                opt.textContent = `${ev.event_label} - ${ev.category_note ? ev.category_note.slice(0, 35) + "…" : (ev.event_category || ev.event_id)}`;
                if (activeEvent && ev.event_id === activeEvent.event_id) {
                    opt.selected = true;
                }
                DOM.activeEventSelect.appendChild(opt);
            });

            DOM.activeEventSelect.onchange = async (e) => {
                const chosenId = e.target.value;
                const chosenEvent = events.find(ev => ev.event_id === chosenId);
                if (!chosenEvent) return;

                state.activeEvent = chosenEvent;
                window.GeminiService.setActiveEventId(chosenId);
                updateEventCardUI(chosenEvent);

                // Thông báo trong khung chat về sự thay đổi sự kiện
                const notifyMessage = {
                    role: "assistant",
                    content: `🔄 **Đã chuyển sang sự kiện:** **${chosenEvent.event_label}** (*${chosenEvent.category_note || chosenEvent.event_category}*).\n\n` +
                             `📌 **Phạm vi bảo mật:** Gemini AI hiện **chỉ có quyền truy cập vào các công việc thuộc sự kiện này**.\n` +
                             `🛡️ **Chống bịa đặt (Anti-Hallucination):** Mọi câu hỏi ngoài phạm vi sự kiện này sẽ bị từ chối trả lời chính xác theo nguyên tắc.`
                };
                state.messages.push(notifyMessage);
                renderMessage(notifyMessage);
            };
        }
    } catch (err) {
        console.error("Lỗi khởi tạo sự kiện:", err);
    }
}


/* =========================================
   15. INITIALIZE
========================================= */

async function initializeDashboard() {
    // Nạp thông tin người dùng
    await loadUserInfo();

    // Khởi tạo sự kiện đang diễn ra cho AI (Khóa dữ liệu 1 sự kiện)
    await initializeEventSelector();

    // Nạp lịch sử trò chuyện đã lưu
    await loadChatHistory();
    const conversationId = new URLSearchParams(location.search).get("conversation");
    if (conversationId) openConversation(conversationId);

    // Khởi tạo các sự kiện giao diện
    initializeChatEvents();
    initializeQuickActions();
    initializeCreateEventModal();
    initializeFileUpload();
    initializeKeyConfigButton();
    DOM.completeEventButton?.addEventListener("click", completeActiveEvent);
    initializeIcons();
}

document.addEventListener(
    "DOMContentLoaded",
    initializeDashboard
);
