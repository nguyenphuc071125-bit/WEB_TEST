
/* =========================================
   AECPT - DASHBOARD
   FRONTEND - DATABASE READY
========================================= */


/* =========================================
   1. API CONFIGURATION
========================================= */

const API_CONFIG = {
    BASE_URL: "http://localhost:3000/api",

    ENDPOINTS: {
        dashboard: "/dashboard",
        sendMessage: "/assistant/chat",
        conversations: "/assistant/conversations",
        conversationDetail: "/assistant/conversations/"
    }
};


/* =========================================
   2. DOM ELEMENTS
========================================= */

const DOM = {
    sidebarContainer: document.getElementById("sidebar-container"),

    greetingName: document.getElementById("greetingName"),

    chatMessages: document.getElementById("chatMessages"),

    chatForm: document.getElementById("chatForm"),

    messageInput: document.getElementById("messageInput"),

    sendButton: document.getElementById("sendButton"),

    quickActions: document.getElementById("quickActions"),

    attachButton: document.getElementById("attachButton"),

    fileInput: document.getElementById("fileInput")
};


/* =========================================
   3. APPLICATION STATE
========================================= */

const state = {
    currentUser: null,
    conversationId: null,
    messages: [],
    isSending: false
};


/* =========================================
   4. API SERVICE
========================================= */

const API = {

    // Hàm gọi API dùng chung

    async request(endpoint, options = {}) {

        const response = await fetch(
            `${API_CONFIG.BASE_URL}${endpoint}`,
            {
                ...options,

                credentials: "include",

                headers: {
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
    },


    // Lấy dữ liệu tổng quan dashboard

    async getDashboard() {

        return this.request(
            API_CONFIG.ENDPOINTS.dashboard
        );

    },


    // Gửi tin nhắn cho AI

    async sendMessage(message, conversationId = null) {

        return this.request(
            API_CONFIG.ENDPOINTS.sendMessage,
            {
                method: "POST",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify({
                    conversationId,
                    message
                })
            }
        );

    },


    // Lấy danh sách cuộc trò chuyện

    async getConversations() {

        return this.request(
            API_CONFIG.ENDPOINTS.conversations
        );

    },


    // Lấy nội dung một cuộc trò chuyện

    async getConversationDetail(id) {

        return this.request(
            API_CONFIG.ENDPOINTS.conversationDetail
            + encodeURIComponent(id)
        );

    }

};


/* =========================================
   5. LUCIDE ICONS
========================================= */

function initializeIcons() {

    if (typeof lucide === "undefined") {
        console.error("Lucide chưa được tải!");
        return;
    }

    lucide.createIcons();
}

/* =========================================
   6. LOAD USER INFORMATION
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
   8. LOAD CHAT HISTORY
========================================= */

async function loadChatHistory() {

    try {

        const conversations =
            await API.getConversations();

        renderChatHistory(conversations);

    } catch (error) {

        console.error(
            "Không thể tải lịch sử trò chuyện:",
            error
        );

    }

}


function renderChatHistory(conversations) {

    const section =
        document.getElementById("chatHistorySection");

    const list =
        document.getElementById("chatHistoryList");

    if (!section || !list) return;

    list.innerHTML = "";

    section.hidden = !conversations?.length;

    if (!conversations?.length) return;


    conversations.forEach(conversation => {

        const item = document.createElement("div");

        item.className = "chat-history-item";

        item.dataset.id = conversation.id;


        const icon = document.createElement("i");

        icon.setAttribute(
            "data-lucide",
            "message-square"
        );


        const title = document.createElement("span");

        title.textContent = conversation.title;


        item.append(icon, title);


        item.addEventListener("click", () => {

            openConversation(conversation.id);

        });


        list.appendChild(item);

    });

    initializeIcons();

}


/* =========================================
   9. OPEN CONVERSATION
========================================= */

async function openConversation(id) {

    try {

        const conversation =
            await API.getConversationDetail(id);

        state.conversationId = conversation.id;

        state.messages = conversation.messages || [];

        renderAllMessages();

    } catch (error) {

        console.error(
            "Không thể mở cuộc trò chuyện:",
            error
        );

    }

}


/* =========================================
   10. RENDER CHAT MESSAGES
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

    return escapeHTML(content)
        .split("\n")
        .map(line => {

            return line.trim()
                ? `<p>${line}</p>`
                : "";

        })
        .join("");

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

        bubble.innerHTML = formatMessage(message.content);


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
            : "";


        row.append(bubble, avatar);

    }


    DOM.chatMessages.appendChild(row);

    initializeIcons();

    DOM.chatMessages.scrollTop =
        DOM.chatMessages.scrollHeight;

}


function renderAllMessages() {

    DOM.chatMessages.innerHTML = "";

    state.messages.forEach(message => {

        renderMessage(message);

    });

}


/* =========================================
   11. SEND MESSAGE
========================================= */

async function sendMessage(message) {

    const content = message.trim();

    if (!content || state.isSending) return;


    state.isSending = true;

    DOM.sendButton.disabled = true;


    // Hiển thị tin nhắn người dùng

    const userMessage = {

        role: "user",

        content: content

    };

    state.messages.push(userMessage);

    renderMessage(userMessage);


    // Hiệu ứng AI đang trả lời

    showTyping();


    try {

        // Gửi yêu cầu lên Backend

        const result = await API.sendMessage(
            content,
            state.conversationId
        );


        // Xóa hiệu ứng đang nhập

        document.getElementById(
            "typingIndicator"
        )?.remove();


        // Nhận conversation ID từ Backend

        state.conversationId =
            result.conversationId;


        // Nhận phản hồi AI

        const aiMessage = {

            role: "assistant",

            content: result.reply

        };


        state.messages.push(aiMessage);

        renderMessage(aiMessage);


        // Cập nhật lịch sử chat từ Database

        await loadChatHistory();


    } catch (error) {

        document.getElementById(
            "typingIndicator"
        )?.remove();

        console.error("Send message error:", error);

        // Không tạo câu trả lời giả khi API lỗi.

        alert(
            "Không thể gửi tin nhắn. Vui lòng kiểm tra kết nối máy chủ."
        );

    } finally {

        state.isSending = false;

        DOM.sendButton.disabled = false;

        DOM.messageInput.focus();

    }

}


/* =========================================
   12. TYPING INDICATOR
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
   13. CHAT EVENTS
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
   14. QUICK ACTIONS
========================================= */

function initializeQuickActions() {

    DOM.quickActions.addEventListener("click", event => {

        const card = event.target.closest(".quick-card");

        if (!card) return;

        const prompt = card.dataset.prompt;

        if (prompt) {

            sendMessage(prompt);

        }

    });

}


/* =========================================
   15. FILE UPLOAD
========================================= */

function initializeFileUpload() {

    DOM.attachButton.addEventListener("click", () => {

        DOM.fileInput.click();

    });


    DOM.fileInput.addEventListener("change", async () => {

        const file = DOM.fileInput.files[0];

        if (!file) return;


        try {

            const formData = new FormData();

            formData.append("file", file);

            // Endpoint upload sẽ do Backend cung cấp.
            // Chưa tự gửi file khi chưa có API tương ứng.

            // Khi Backend sẵn sàng:
            // await API.uploadFile(formData);

        } catch (error) {

            console.error("Upload error:", error);

        }

        DOM.fileInput.value = "";

    });

}


/* =========================================
   16. LOAD DASHBOARD DATA
========================================= */

async function loadDashboardData() {

    try {

        const data = await API.getDashboard();

        // Dữ liệu trả về sẽ được sử dụng
        // để cập nhật các thành phần dashboard.

        console.log("Dashboard data loaded", data);

    } catch (error) {

        console.error(
            "Không thể tải dữ liệu dashboard:",
            error
        );

    }

}


/* =========================================
   17. INITIALIZE
========================================= */

async function initializeDashboard() {

    // Sidebar component is loaded by sidebar.js.
    await loadUserInfo();

    // Lấy lịch sử trò chuyện từ Backend
    await loadChatHistory();

    // Lấy dữ liệu tổng quan
    await loadDashboardData();

    // Khởi tạo sự kiện
    initializeChatEvents();

    initializeQuickActions();

    initializeFileUpload();

    initializeIcons();

}

document.addEventListener(
    "DOMContentLoaded",
    initializeDashboard
);

document.addEventListener(
    "DOMContentLoaded",
    initializeDashboard
);
