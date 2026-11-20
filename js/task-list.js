/* =========================================================
   MULTIMEDIATASK - TASK LIST
   Supabase tables: tasks, task_assignments
   Note: priority, task creator, progress %, notes and files are
   not present in the supplied schema; they are not fabricated.
========================================================= */
(() => {
  "use strict";

  const CONFIG = window.TASK_LIST_CONFIG || {};
  const PAGE_SIZE = Number(CONFIG.pageSize) || 8;
  const $ = (s, root = document) => root.querySelector(s);

  const dom = {
    search: $("#taskSearch"), toggleFilters: $("#toggleTaskFilters"),
    advancedFilters: $("#advancedTaskFilters"), groupFilter: $("#groupFilter"),
    resetFilters: $("#resetTaskFilters"),
    sort: $("#taskSort"), groupTabs: [...document.querySelectorAll(".group-filter")],
    statusTabs: [...document.querySelectorAll(".status-tab")],
    total: $("#totalTasksCount"), notStarted: $("#notStartedCount"),
    inProgress: $("#inProgressCount"), completed: $("#completedCount"),
    overdue: $("#overdueTasksCount"), overdueTabCount: $("#overdueTasksTabCount"),
    overdueCard: $("#overdueTasksCard"), overdueTab: $("#overdueTasksTab"),
    teamDeadlineAlert: $("#teamDeadlineAlert"), teamDeadlineCount: $("#teamDeadlineCount"),
    teamDeadlineList: $("#teamDeadlineList"), teamDeadlineDays: $("#teamDeadlineDays"),
    teamDeadlineDaysLabel: $("#teamDeadlineDaysLabel"),
    selectAllTeamDeadlineTasks: $("#selectAllTeamDeadlineTasks"),
    remindSelectedTeamTasks: $("#remindSelectedTeamTasks"),
    teamDeadlineFeedback: $("#teamDeadlineFeedback"),
    resultInfo: $("#taskResultInfo"), tbody: $("#taskTableBody"),
    tableInfo: $("#taskTableInfo"), previous: $("#previousPage"),
    next: $("#nextPage"), pageLabel: $("#currentPageLabel"),
    detailModal: $("#taskDetailModal"), detailTitle: $("#detailDrawerTitle"),
    detail: $("#taskDetailContent"),
    updateButton: $("#openUpdateProgress"), progressModal: $("#updateProgressModal"),
    progressTitle: $("#progressTaskTitle"), progressGroup: $("#progressTaskGroup"),
    form: $("#updateProgressForm"), status: $("#taskStatusInput")
  };

  const state = {
    db: null, memberId: null, tasks: [], filtered: [], memberNames: new Map(), memberEmails: new Map(),
    group: "", status: "all", overdueOnly: false, isTeamLeader: false,
    currentUser: null, currentUserId: null, membershipWorkspaceId: null,
    accountRole: "",
    page: 1, selected: null, detailHistory: [], selectedDeadlineTaskIds: new Set(),
    deadlineWindowDays: 3, commentRequestId: 0, commentRows: [],
    replyParentId: null
  };

  const STATUS = {
    not_started: "Chưa bắt đầu",
    in_progress: "Đang thực hiện",
    pending_review: "Chờ duyệt",
    completed: "Đã hoàn thành",
    cancelled: "Đã hủy"
  };

  function client() {
    if (window.supabaseClient?.from) return window.supabaseClient;
    try { if (typeof supabase !== "undefined" && supabase?.from) return supabase; } catch (_) {}
    return null;
  }

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[c]);
  }

  function text(node, value) { if (node) node.textContent = value ?? "—"; }

  function dateTime(date, time) {
    if (!date) return "—";
    const d = new Date(`${date}T${time || "00:00:00"}`);
    return Number.isNaN(d.getTime()) ? esc(date) :
      new Intl.DateTimeFormat(window.AppI18n?.locale || "vi-VN", {
        day: "2-digit", month: "2-digit", year: "numeric",
        ...(time ? { hour: "2-digit", minute: "2-digit" } : {})
      }).format(d);
  }

  function deadline(task) {
    if (task.package_deadline_at) {
      const d = new Date(task.package_deadline_at);
      return Number.isNaN(d.getTime()) ? "—" :
        new Intl.DateTimeFormat(window.AppI18n?.locale || "vi-VN", {
          day: "2-digit", month: "2-digit", year: "numeric",
          hour: "2-digit", minute: "2-digit"
        }).format(d);
    }
    return dateTime(task.package_deadline_date, task.package_deadline_time);
  }

  function overdueDays(task, now = new Date()) {
    if (task.is_cancelled === true || taskStatus(task) === "completed") return 0;

    if (task.package_deadline_at) {
      const deadlineAt = new Date(task.package_deadline_at);
      if (Number.isNaN(deadlineAt.getTime()) || deadlineAt >= now) return 0;
      return Math.max(1, Math.ceil((now - deadlineAt) / 86400000));
    }

    const date = task.package_deadline_date;
    if (!date) return 0;
    const match = String(date).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return 0;
    const [, yearText, monthText, dayText] = match;
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    const dueDate = new Date(Date.UTC(year, month - 1, day));
    if (dueDate.getUTCFullYear() !== year ||
        dueDate.getUTCMonth() !== month - 1 ||
        dueDate.getUTCDate() !== day) return 0;

    if (task.package_deadline_time) {
      const deadlineAt = new Date(`${date}T${task.package_deadline_time}`);
      if (Number.isNaN(deadlineAt.getTime()) || deadlineAt >= now) return 0;
      return Math.max(1, Math.ceil((now - deadlineAt) / 86400000));
    }

    const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.max(0, Math.floor((today - dueDate.getTime()) / 86400000));
  }

  function onAir(task) {
    if (task.on_air_at) {
      const d = new Date(task.on_air_at);
      return Number.isNaN(d.getTime()) ? "—" :
        new Intl.DateTimeFormat(window.AppI18n?.locale || "vi-VN", {
          day: "2-digit", month: "2-digit", year: "numeric",
          hour: "2-digit", minute: "2-digit"
        }).format(d);
    }
    return dateTime(task.on_air_date, task.on_air_time);
  }

  function memberLabel(id) {
    return state.memberNames.get(String(id)) || id || "Chưa phân công";
  }

  function dependencyReferences(description = "") {
    const match = String(description).match(/Phụ thuộc:\s*([^.\n]*)/i);
    if (!match || !match[1].trim() || /^không$/i.test(match[1].trim())) return [];
    return match[1].split(/[;,|]/).map(value => value.trim()).filter(Boolean);
  }

  function normalizedTaskReference(value) {
    const reference = String(value).trim().toLocaleLowerCase("vi");
    const numbered = reference.match(/^([a-z_-]*)0*(\d+)$/i);
    return numbered ? `${numbered[1]}${Number(numbered[2])}` : reference;
  }

  function taskDependencies(task) {
    const byReference = new Map();
    state.tasks.filter(candidate => String(candidate.event_id) === String(task.event_id))
      .forEach(candidate => {
        const ordinal = String(candidate.submission_label || "").match(/^(\d+)\./)?.[1];
        [candidate.task_id, candidate.task_no,
          candidate.task_no != null ? `T${candidate.task_no}` : "",
          ordinal ? `T${ordinal}` : ""]
        .filter(Boolean)
        .forEach(reference => byReference.set(normalizedTaskReference(reference), candidate));
      });
    return dependencyReferences(task.description).map(reference => ({
      reference,
      task: byReference.get(normalizedTaskReference(reference)) || null
    }));
  }

  function normalizeFunctionGroup(value) {
    const normalized = String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, "_");
    const groups = {
      edit: "edit",
      editor: "edit",
      video_editor: "edit",
      design: "design",
      designer: "design",
      content: "content",
      content_writer: "content",
      content_creator: "content",
      tech: "tech",
      technician: "tech",
      technical: "tech",
      photo: "photo",
      photographer: "photo",
      photography: "photo"
    };
    return groups[normalized] || normalized;
  }

  function publicationStatus(task) {
    const posted = task.post_done === true ? "Đã đăng" :
      task.post_done === false ? "Chưa đăng" : "Chưa rõ trạng thái";
    const page = task.posted_on_main_page === true ? "Trang chính" :
      task.posted_on_main_page === false ? "Không lên trang chính" : "Chưa rõ trang đăng";
    return [posted, page, task.post_method].filter(Boolean).join(" · ");
  }

  function assignmentStatus(a) {
    if (a.is_done === true) return "completed";
    const value = String(a.assignment_state || "").toLowerCase().trim();
    if (["in_progress", "in progress", "doing", "processing"].includes(value)) return "in_progress";
    if (["pending_review", "pending review", "review", "waiting_review"].includes(value)) return "pending_review";
    if (["completed", "complete", "done"].includes(value)) return "completed";
    return "not_started";
  }

  function taskStatus(task) {
    const list = (task.assignments || []).filter(a => a.member_id);
    if (!list.length) return task.status || "not_started";
    if (list.every(a => assignmentStatus(a) === "completed")) return "completed";
    if (list.some(a => assignmentStatus(a) === "in_progress")) return "in_progress";
    if (list.some(a => assignmentStatus(a) === "pending_review")) return "pending_review";
    return "not_started";
  }

  function daysUntilDeadline(task, now = new Date(), windowDays = state.deadlineWindowDays) {
    if (task.is_cancelled === true || taskStatus(task) === "completed") return null;

    const timestamp = String(task.package_deadline_at || "");
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(timestamp)
      ? timestamp
      : String(task.package_deadline_date || "");
    if ((!timestamp || /^\d{4}-\d{2}-\d{2}$/.test(timestamp)) &&
        /^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) {
      const [year, month, day] = dateOnly.split("-").map(Number);
      const dueDate = new Date(Date.UTC(year, month - 1, day));
      if (dueDate.getUTCFullYear() !== year ||
          dueDate.getUTCMonth() !== month - 1 ||
          dueDate.getUTCDate() !== day) return null;

      if (task.package_deadline_time) {
        const dueAt = new Date(`${dateOnly}T${task.package_deadline_time}`);
        if (Number.isNaN(dueAt.getTime()) || dueAt <= now) return null;
      }

      const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
      const daysUntil = Math.floor((dueDate.getTime() - today) / 86400000);
      return daysUntil >= 0 && daysUntil <= windowDays ? daysUntil : null;
    }

    const value = timestamp ||
      (task.package_deadline_date
        ? `${task.package_deadline_date}T${task.package_deadline_time || "00:00:00"}`
        : "");
    const dueAt = new Date(value);
    if (!value || Number.isNaN(dueAt.getTime()) || dueAt <= now) return null;

    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dueDay = new Date(dueAt.getFullYear(), dueAt.getMonth(), dueAt.getDate());
    const daysUntil = Math.floor((dueDay.getTime() - today.getTime()) / 86400000);
    return daysUntil >= 0 && daysUntil <= windowDays ? daysUntil : null;
  }

  function renderTeamDeadlines() {
    if (!dom.teamDeadlineAlert) return;
    dom.teamDeadlineAlert.hidden = !state.isTeamLeader;
    if (!state.isTeamLeader) return;

    const upcoming = state.tasks
      .map(task => ({ task, daysUntil: daysUntilDeadline(task) }))
      .filter(item => item.daysUntil !== null)
      .sort((a, b) => a.daysUntil - b.daysUntil ||
        String(a.task.package_deadline_at || a.task.package_deadline_date || "")
          .localeCompare(String(b.task.package_deadline_at || b.task.package_deadline_date || "")));

    text(dom.teamDeadlineCount, upcoming.length);
    text(dom.teamDeadlineDaysLabel, state.deadlineWindowDays);
    const visibleTaskIds = new Set(upcoming.map(({ task }) => String(task.task_id)));
    state.selectedDeadlineTaskIds = new Set(
      [...state.selectedDeadlineTaskIds].filter(taskId => visibleTaskIds.has(taskId))
    );
    if (dom.selectAllTeamDeadlineTasks) {
      const selectedCount = upcoming.filter(({ task }) =>
        state.selectedDeadlineTaskIds.has(String(task.task_id))
      ).length;
      dom.selectAllTeamDeadlineTasks.checked = upcoming.length > 0 && selectedCount === upcoming.length;
      dom.selectAllTeamDeadlineTasks.indeterminate = selectedCount > 0 && selectedCount < upcoming.length;
      dom.selectAllTeamDeadlineTasks.disabled = upcoming.length === 0;
    }
    if (dom.remindSelectedTeamTasks) {
      dom.remindSelectedTeamTasks.disabled = state.selectedDeadlineTaskIds.size === 0;
    }
    if (!upcoming.length) {
      dom.teamDeadlineList.innerHTML =
        '<p class="team-deadline-empty">Chưa có công việc nhóm sắp đến hạn.</p>';
      return;
    }

    dom.teamDeadlineList.innerHTML = upcoming.map(({ task }) => {
      const groups = [...new Set(task.assignments.map(assignment => assignment.role).filter(Boolean))];
      const members = [...new Set(task.assignments
        .filter(assignment => assignment.member_id)
        .map(assignment => memberLabel(assignment.member_id)))];
      const taskId = String(task.task_id);
      return `<div class="team-deadline-item">
        <input type="checkbox" class="team-deadline-checkbox" data-select-deadline-task="${esc(taskId)}"
          aria-label="Chọn ${esc(task.task_title || task.submission_label || task.task_id)}"
          ${state.selectedDeadlineTaskIds.has(taskId) ? "checked" : ""}>
        <button type="button" class="team-deadline-task-button" data-team-deadline-task="${esc(taskId)}">
          <span class="team-deadline-task-info">
            <strong>${esc(task.task_title || task.submission_label || task.task_id)}</strong>
            <small>${esc(groups.join(", ") || "Chưa phân nhóm")} · ${esc(members.join(", ") || "Chưa phân công")}</small>
          </span>
          <span class="team-deadline-task-due">
            <strong>${esc(deadline(task))}</strong>
            <small>${esc(STATUS[taskStatus(task)])}</small>
          </span>
        </button>
      </div>`;
    }).join("");
  }

  function setDeadlineFeedback(message, isError = false) {
    if (!dom.teamDeadlineFeedback) return;
    dom.teamDeadlineFeedback.textContent = message;
    dom.teamDeadlineFeedback.hidden = !message;
    dom.teamDeadlineFeedback.classList.toggle("is-error", isError);
  }

  async function remindSelectedTasks() {
    const selectedIds = [...state.selectedDeadlineTaskIds];
    if (!state.isTeamLeader || !selectedIds.length) return;

    dom.remindSelectedTeamTasks.disabled = true;
    setDeadlineFeedback("Đang gửi nhắc nhở...");
    try {
      const selectedTasks = state.tasks.filter(task =>
        selectedIds.includes(String(task.task_id))
      );
      const memberIds = [...new Set(selectedTasks.flatMap(task =>
        task.assignments.map(assignment => String(assignment.member_id || "")).filter(Boolean)
      ))];
      if (!memberIds.length) {
        throw new Error("Các task đã chọn chưa có thành viên được phân công.");
      }

      const { data: memberships, error: membershipsError } = await state.db
        .from("team_members")
        .select("user_id, member_id")
        .in("member_id", memberIds)
        .not("user_id", "is", null);
      if (membershipsError) throw membershipsError;

      const usersByMember = new Map();
      (memberships || []).forEach(membership => {
        if (!membership.user_id || !membership.member_id) return;
        const memberId = String(membership.member_id);
        const users = usersByMember.get(memberId) || new Set();
        users.add(String(membership.user_id));
        usersByMember.set(memberId, users);
      });

      const batchId = window.crypto?.randomUUID?.() ||
        `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const notifications = [];
      selectedTasks.forEach(task => {
        const title = task.task_title || task.submission_label || task.task_id;
        const assignedMemberIds = [...new Set(task.assignments
          .map(assignment => String(assignment.member_id || ""))
          .filter(Boolean))];
        assignedMemberIds.forEach(memberId => {
          (usersByMember.get(memberId) || []).forEach(userId => {
            notifications.push({
              user_id: userId,
              member_id: memberId,
              task_id: String(task.task_id),
              title: "Trưởng nhóm nhắc công việc",
              message: `${title} sắp đến hạn (${deadline(task)}).`,
              type: "deadline_reminder",
              priority: "normal",
              dedupe_key: `leader_reminder:${batchId}:${task.task_id}:${userId}`
            });
          });
        });
      });

      if (!notifications.length) {
        throw new Error("Không tìm thấy tài khoản liên kết với thành viên được giao các task đã chọn.");
      }
      const { error: insertError } = await state.db
        .from("notifications")
        .insert(notifications);
      if (insertError) throw insertError;

      state.selectedDeadlineTaskIds.clear();
      renderTeamDeadlines();
      setDeadlineFeedback(`Đã gửi ${notifications.length} thông báo nhắc task đến thành viên được giao.`);
    } catch (error) {
      console.error("[task-list] Không thể gửi nhắc task:", error);
      setDeadlineFeedback(`Không thể gửi nhắc task: ${error.message || "Lỗi không xác định."}`, true);
    } finally {
      if (dom.remindSelectedTeamTasks) {
        dom.remindSelectedTeamTasks.disabled = state.selectedDeadlineTaskIds.size === 0;
      }
    }
  }

  function statusHTML(status, label = STATUS[status] || STATUS.not_started) {
    return `<span class="status-chip status-${status}">${label}</span>`;
  }

  function safeProductUrl(value) {
    try {
      const url = new URL(value);
      return ["http:", "https:"].includes(url.protocol) ? url.href : "";
    } catch {
      return "";
    }
  }

  function showMessage(message) {
    if (dom.tbody) dom.tbody.innerHTML =
      `<tr><td colspan="8" class="table-message">${esc(message)}</td></tr>`;
  }

  async function loadData() {
    showMessage("Đang tải danh sách công việc...");
    const [tasksResult, assignmentsResult, membersResult, eventsResult] = await Promise.all([
      state.db.from("tasks").select(`
        task_id, task_no, event_id, task_title, task_type, submission_label, status,
        description, on_air_date, on_air_time, on_air_at,
        package_deadline_date, package_deadline_time, package_deadline_at,
        posted_on_main_page, post_method, is_cancelled, post_done, data_quality_flag
      `),
      state.db.from("task_assignments").select("task_id, role, assignment_state, member_id, is_done"),
      state.db.from("members").select("member_id, member_label, email"),
      state.db.from("events").select("event_id, is_completed, workspace_id")
    ]);

    if (tasksResult.error) throw tasksResult.error;
    if (assignmentsResult.error) throw assignmentsResult.error;
    if (membersResult.error) throw membersResult.error;
    if (eventsResult.error) throw eventsResult.error;
    const eventsById = new Map((eventsResult.data || []).map(event =>
      [String(event.event_id), event]
    ));
    const activeEventIds = new Set((eventsResult.data || [])
      .filter(event => event.is_completed !== true)
      .map(event => String(event.event_id)));
    const activeEventTasks = (tasksResult.data || []).filter(task =>
      task.event_id != null && activeEventIds.has(String(task.event_id))
    );
    const activeTaskIds = activeEventTasks.map(task => task.task_id);
    const attachmentsResult = activeTaskIds.length
      ? await state.db.from("task_attachments").select(
        "attachment_id, task_id, file_name, file_url, file_type, file_size, uploaded_by, created_at"
      ).in("task_id", activeTaskIds).order("created_at", { ascending: false })
      : { data: [], error: null };
    if (attachmentsResult.error) throw attachmentsResult.error;

    state.memberNames = new Map((membersResult.data || []).map(member =>
      [String(member.member_id), member.member_label || member.member_id]
    ));
    state.memberEmails = new Map((membersResult.data || []).map(member =>
      [String(member.member_id), member.email || ""]
    ));

    const byTask = new Map();
    (assignmentsResult.data || []).forEach(a => {
      if (!byTask.has(a.task_id)) byTask.set(a.task_id, []);
      byTask.get(a.task_id).push(a);
    });
    const attachmentsByTask = new Map();
    (attachmentsResult.data || []).forEach(attachment => {
      if (!attachmentsByTask.has(attachment.task_id)) attachmentsByTask.set(attachment.task_id, []);
      attachmentsByTask.get(attachment.task_id).push(attachment);
    });

    state.tasks = activeEventTasks.map(task => ({
      ...task,
      workspace_id: eventsById.get(String(task.event_id))?.workspace_id,
      assignments: byTask.get(task.task_id) || [],
      attachments: attachmentsByTask.get(task.task_id) || []
    }));
    applyFilters();

    const taskId = new URLSearchParams(window.location.search).get("taskId");
    if (taskId) {
      const task = state.tasks.find(item => String(item.task_id) === taskId);
      const currentUrl = new URL(window.location.href);
      currentUrl.searchParams.delete("taskId");
      window.history.replaceState(null, "", currentUrl.href);

      if (task) openDetail(task.task_id);
      else alert("Không tìm thấy công việc hoặc công việc không còn thuộc sự kiện đang hoạt động.");
    }
  }

  function applyFilters() {
    const query = dom.search?.value.trim().toLocaleLowerCase("vi") || "";
    const role = dom.groupFilter?.value || "";

    state.filtered = state.tasks.filter(task => {
      const roles = task.assignments.map(a => a.role);
      const status = taskStatus(task);
      const haystack = [
        task.task_id, task.task_no, task.task_title, task.submission_label,
        task.description, task.task_type, ...roles
      ].join(" ").toLocaleLowerCase("vi");

      return task.is_cancelled !== true &&
        (!query || haystack.includes(query)) &&
        (!state.group || roles.some(r =>
          normalizeFunctionGroup(r) === normalizeFunctionGroup(state.group)
        )) &&
        (!role || roles.some(r =>
          normalizeFunctionGroup(r) === normalizeFunctionGroup(role)
        )) &&
        (state.status === "all" || status === state.status) &&
        (!state.overdueOnly || overdueDays(task) > 0);
    });

    const sort = dom.sort?.value || "deadline_asc";
    state.filtered.sort((a, b) => {
      if (sort === "deadline_asc" || sort === "deadline_desc") {
        const av = a.package_deadline_at || a.package_deadline_date || "9999-12-31";
        const bv = b.package_deadline_at || b.package_deadline_date || "9999-12-31";
        return sort === "deadline_asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      const av = a.on_air_at || a.on_air_date || "";
      const bv = b.on_air_at || b.on_air_date || "";
      return bv.localeCompare(av);
    });

    state.page = 1;
    render();
  }

  function render() {
    renderTeamDeadlines();
    const counts = { total: state.tasks.length, not_started: 0, in_progress: 0, completed: 0, overdue: 0 };
    state.tasks.forEach(task => {
      const s = taskStatus(task);
      if (s === "not_started") counts.not_started++;
      if (s === "in_progress" || s === "pending_review") counts.in_progress++;
      if (s === "completed") counts.completed++;
      if (overdueDays(task) > 0) counts.overdue++;
    });

    text(dom.total, counts.total);
    text(dom.notStarted, counts.not_started);
    text(dom.inProgress, counts.in_progress);
    text(dom.completed, counts.completed);
    text(dom.overdue, counts.overdue);
    text(dom.overdueTabCount, counts.overdue);
    syncFilterControls();
    text(dom.resultInfo, `Có ${state.filtered.length} công việc phù hợp`);

    const start = (state.page - 1) * PAGE_SIZE;
    const rows = state.filtered.slice(start, start + PAGE_SIZE);

    if (!state.tasks.length) {
      showMessage(
        "Hiện chưa có công việc nào thuộc các sự kiện đang hoạt động. Công việc của sự kiện đã hoàn tất có thể xem trong mục Lịch sử."
      );
    } else if (!rows.length) {
      showMessage("Không tìm thấy công việc phù hợp.");
    }
    else {
      dom.tbody.innerHTML = rows.map(task => {
        const roles = [...new Set(task.assignments.map(a => a.role).filter(Boolean))];
        const members = [...new Set(task.assignments.map(a => a.member_id).filter(Boolean))];
        const lateBy = overdueDays(task);
        return `
          <tr class="task-row${lateBy ? " task-row-overdue" : ""}" data-task-id="${esc(task.task_id)}" tabindex="0">
            <td class="task-name-cell">${esc(task.task_title || task.submission_label || task.task_id)}<small class="task-row-meta">${esc(task.task_no ? `#${task.task_no} · ` : "")}${esc(task.submission_label || task.task_id)}</small></td>
            <td>${esc([task.event_id, task.task_type].filter(Boolean).join(" · ") || "—")}</td>
            <td>${roles.length ? roles.map(r => `<span class="group-chip">${esc(r)}</span>`).join(" ") : "—"}</td>
            <td>${members.length ? members.map(id => esc(memberLabel(id))).join(", ") : "Chưa phân công"}</td>
            <td>${esc(onAir(task))}</td>
            <td><span class="deadline-cell"><span>${esc(deadline(task))}</span>${lateBy ? `<span class="overdue-badge">Trễ hạn · ${lateBy} ngày</span>` : ""}</span></td>
            <td>${esc(publicationStatus(task))}</td>
            <td>${task.is_cancelled === true ? '<span class="status-chip status-cancelled">Đã hủy</span>' : statusHTML(taskStatus(task))}</td>
          </tr>`;
      }).join("");
    }

    const pages = Math.max(1, Math.ceil(state.filtered.length / PAGE_SIZE));
    text(dom.tableInfo, `Hiển thị ${state.filtered.length ? start + 1 : 0}–${Math.min(start + PAGE_SIZE, state.filtered.length)} / ${state.filtered.length} công việc`);
    text(dom.pageLabel, `${state.page} / ${pages}`);
    if (dom.previous) dom.previous.disabled = state.page <= 1;
    if (dom.next) dom.next.disabled = state.page >= pages;
    if (window.lucide) window.lucide.createIcons();
  }

  function openModal(modal) {
    if (!modal) return;
    modal.hidden = false;
    document.body.classList.add("modal-open");
  }

  function closeModal(modal) {
    if (!modal) return;
    modal.hidden = true;
    if (![dom.detailModal, dom.progressModal].some(m => m && !m.hidden)) {
      document.body.classList.remove("modal-open");
    }
  }

  function canCommentOnTask(task) {
    return Boolean(
      state.currentUserId &&
      state.membershipWorkspaceId &&
      task?.workspace_id &&
      String(state.membershipWorkspaceId) === String(task.workspace_id)
    );
  }

  function canDeleteTaskComment(comment, task) {
    return Boolean(comment && !comment.is_deleted && (
      String(comment.user_id) === String(state.currentUserId) ||
      (state.isTeamLeader && canCommentOnTask(task))
    ));
  }

  function commentStatus(message, isError = false) {
    const status = dom.detail?.querySelector("#taskCommentStatus");
    if (!status) return;
    status.textContent = message;
    status.hidden = !message;
    status.classList.toggle("is-error", isError);
  }

  function renderTaskComments(comments) {
    const list = dom.detail?.querySelector("#taskCommentList");
    const count = dom.detail?.querySelector("#taskCommentCount");
    if (!list) return;

    const visibleComments = comments || [];
    state.commentRows = visibleComments;
    if (count) text(count, `${visibleComments.filter(comment => !comment.is_deleted).length}`);
    if (!visibleComments.length) {
      list.innerHTML = '<p class="comment-empty">Chưa có bình luận nào.</p>';
      return;
    }

    const commentsById = new Map(visibleComments.map(comment =>
      [String(comment.comment_id), comment]
    ));
    const repliesByParent = new Map();
    visibleComments.forEach(comment => {
      if (!comment.parent_id || !commentsById.has(String(comment.parent_id))) return;
      const parentId = String(comment.parent_id);
      const replies = repliesByParent.get(parentId) || [];
      replies.push(comment);
      repliesByParent.set(parentId, replies);
    });

    function renderComment(comment) {
      const authorName = comment.author_name || "Thành viên";
      const initials = authorName.trim().slice(0, 1).toLocaleUpperCase("vi") || "T";
      const createdAt = new Date(comment.created_at);
      const timestamp = Number.isNaN(createdAt.getTime())
        ? ""
        : new Intl.DateTimeFormat(window.AppI18n?.locale || "vi-VN", {
          dateStyle: "medium", timeStyle: "short"
        }).format(createdAt);
      const canDelete = canDeleteTaskComment(comment, state.selected);
      const replies = repliesByParent.get(String(comment.comment_id)) || [];
      return `
        <article class="comment-item${comment.is_deleted ? " is-deleted" : ""}">
          <span class="comment-avatar" aria-hidden="true">${esc(initials)}</span>
          <div class="comment-main">
            <div class="comment-heading">
              <strong>${esc(authorName)}</strong>
              <span class="comment-actions">
                <time datetime="${esc(comment.created_at || "")}">${esc(timestamp)}</time>
                ${!comment.is_deleted ? `
                  <button type="button" class="comment-action-button comment-reply-button"
                    data-reply-to-comment="${esc(comment.comment_id)}"
                    aria-label="Trả lời bình luận">
                    <i data-lucide="reply"></i><span>Trả lời</span>
                  </button>` : ""}
                ${canDelete ? `
                  <button type="button" class="comment-delete-button"
                    data-delete-task-comment="${esc(comment.comment_id)}"
                    aria-label="Xóa bình luận" title="Xóa bình luận">
                    <i data-lucide="trash-2"></i>
                  </button>` : ""}
              </span>
            </div>
            <p>${comment.is_deleted ? "Bình luận đã bị xóa." : esc(comment.content)}</p>
            ${replies.length
              ? `<div class="comment-replies">${replies.map(renderComment).join("")}</div>`
              : ""}
          </div>
        </article>`;
    }

    const rootComments = visibleComments.filter(comment =>
      !comment.parent_id || !commentsById.has(String(comment.parent_id))
    );
    list.innerHTML = rootComments.map(renderComment).join("");
    if (window.lucide) window.lucide.createIcons();
  }

  async function loadTaskComments(task) {
    const requestId = ++state.commentRequestId;
    if (!canCommentOnTask(task)) return;

    const list = dom.detail?.querySelector("#taskCommentList");
    if (list) list.innerHTML = '<p class="comment-empty">Đang tải bình luận...</p>';
    commentStatus("");

    const { data, error } = await state.db.from("task_comments")
      .select("comment_id, parent_id, user_id, author_name, author_role, content, is_deleted, created_at")
      .eq("task_id", task.task_id)
      .eq("workspace_id", task.workspace_id)
      .order("created_at", { ascending: true });

    if (requestId !== state.commentRequestId || state.selected !== task) return;
    if (error) {
      console.error("[task-list] Không thể tải bình luận:", error);
      commentStatus(`Không thể tải bình luận: ${error.message}`, true);
      return;
    }

    renderTaskComments(data || []);
    const count = dom.detail?.querySelector("#taskCommentCount");
    if (count) text(count, `${(data || []).filter(comment => !comment.is_deleted).length}`);
  }

  async function submitTaskComment(event) {
    event.preventDefault();
    const task = state.selected;
    if (!canCommentOnTask(task)) {
      commentStatus("Bạn không có quyền bình luận trong workspace này.", true);
      return;
    }

    const form = event.target;
    const input = form.querySelector("#taskCommentInput");
    const submitButton = form.querySelector("button[type='submit']");
    const content = input?.value.trim();
    if (!content) return;

    submitButton.disabled = true;
    commentStatus("Đang gửi bình luận...");
    const metadata = state.currentUser?.user_metadata || {};
    const emailName = state.currentUser?.email?.split("@")[0];
    const authorName = metadata.full_name || metadata.name ||
      state.memberNames.get(String(state.memberId)) || emailName || "Thành viên";
    const { error } = await state.db.from("task_comments").insert({
      task_id: task.task_id,
      workspace_id: task.workspace_id,
      user_id: state.currentUserId,
      author_name: authorName,
      author_avatar: metadata.avatar_url || metadata.picture || null,
      author_role: state.accountRole || null,
      content,
      parent_id: state.replyParentId
    });

    if (error) {
      console.error("[task-list] Không thể gửi bình luận:", error);
      commentStatus(`Không thể gửi bình luận: ${error.message}`, true);
      submitButton.disabled = false;
      return;
    }

    input.value = "";
    cancelTaskCommentReply();
    await loadTaskComments(task);
    if (state.selected === task) submitButton.disabled = false;
  }

  function startTaskCommentReply(commentId) {
    const comment = state.commentRows.find(row =>
      String(row.comment_id) === String(commentId)
    );
    if (!comment || comment.is_deleted) return;

    state.replyParentId = comment.comment_id;
    const target = dom.detail?.querySelector("#taskCommentReplyTarget");
    const input = dom.detail?.querySelector("#taskCommentInput");
    if (!target || !input) return;
    target.querySelector("span").textContent = `Đang trả lời ${comment.author_name || "Thành viên"}`;
    target.hidden = false;
    input.placeholder = `Trả lời ${comment.author_name || "thành viên"}...`;
    input.focus();
  }

  function cancelTaskCommentReply() {
    state.replyParentId = null;
    const target = dom.detail?.querySelector("#taskCommentReplyTarget");
    const input = dom.detail?.querySelector("#taskCommentInput");
    if (target) {
      target.hidden = true;
      target.querySelector("span").textContent = "";
    }
    if (input) input.placeholder = "Viết bình luận...";
  }

  async function deleteTaskComment(commentId) {
    const task = state.selected;
    const comment = state.commentRows.find(row =>
      String(row.comment_id) === String(commentId)
    );
    if (!task || !canDeleteTaskComment(comment, task)) return;
    if (!window.confirm("Bạn có chắc muốn xóa bình luận này không?")) return;

    let deleteQuery = state.db.from("task_comments")
      .delete()
      .eq("comment_id", commentId)
      .eq("task_id", task.task_id)
      .eq("workspace_id", task.workspace_id);
    if (!state.isTeamLeader) {
      deleteQuery = deleteQuery.eq("user_id", state.currentUserId);
    }

    const { data, error } = await deleteQuery.select("comment_id");

    if (error) {
      console.error("[task-list] Không thể xóa bình luận:", error);
      commentStatus(`Không thể xóa bình luận: ${error.message}`, true);
      return;
    }
    if (!data?.length) {
      commentStatus("Không thể xóa bình luận này. Kiểm tra quyền truy cập.", true);
      return;
    }

    await loadTaskComments(task);
    if (state.selected === task) commentStatus("Đã xóa bình luận.");
  }

  function renderDetail(task) {
    const assignments = task.assignments || [];
    const roles = [...new Set(assignments.map(a => a.role).filter(Boolean))];
    const members = [...new Set(assignments.map(a => a.member_id).filter(Boolean))];
    const dependencies = taskDependencies(task);
    const dependenciesHTML = dependencies.length
      ? `<ul class="dependency-list">${dependencies.map(dependency => {
        const prerequisite = dependency.task;
        const prerequisiteStatus = prerequisite ? taskStatus(prerequisite) : "";
        const status = prerequisite?.is_cancelled ? "cancelled" : prerequisiteStatus;
        const statusLabelText = prerequisite?.is_cancelled
          ? "Đã hủy"
          : STATUS[prerequisiteStatus];
        return `<li class="dependency-item">
          <button type="button" class="dependency-task" data-open-dependency="${esc(prerequisite?.task_id || "")}" ${prerequisite ? "" : "disabled"}>
            <strong>${esc(prerequisite?.task_title || prerequisite?.submission_label || dependency.reference)}</strong>
            <small>${esc(prerequisite?.task_id || "Không tìm thấy công việc")}</small>
            <span class="dependency-open-label">Xem chi tiết</span>
          </button>
          ${prerequisite
            ? statusHTML(status, statusLabelText)
            : '<span class="status-chip status-cancelled">Không tìm thấy</span>'}
        </li>`;
      }).join("")}</ul>`
      : '<p class="attachment-empty">Công việc này không phụ thuộc công việc nào khác.</p>';
    const assignmentsHTML = assignments.length
      ? `<ul class="assignee-contact-list">${assignments.map(assignment => {
        const email = state.memberEmails.get(String(assignment.member_id));
        const status = assignmentStatus(assignment);
        const contact = email
          ? `<a href="mailto:${esc(email)}">${esc(email)}</a>`
          : '<span class="contact-unavailable">Chưa có email</span>';
        return `<li class="assignee-contact">
          <span class="assignee-contact-info">
            <strong>${esc(memberLabel(assignment.member_id))}</strong>
            <small>${esc(assignment.role || "Thành viên")}</small>
          </span>
          ${statusHTML(status)}
          ${contact}
        </li>`;
      }).join("")}</ul>`
      : '<p class="attachment-empty">Công việc chưa có phân công.</p>';
    const products = renderTaskProducts(task.attachments);
    text(dom.detailTitle, "Chi tiết công việc");

    dom.detail.innerHTML = `
      <button type="button" class="detail-back-button" data-back-task ${state.detailHistory.length ? "" : "hidden"}>
        <i data-lucide="arrow-left"></i><span>Quay lại công việc trước</span>
      </button>
      <section class="detail-section">
        <h2 class="detail-task-title">${esc(task.task_title || task.submission_label || task.task_id)}</h2>
        <div class="task-status-priority">${statusHTML(taskStatus(task))}${overdueDays(task) ? `<span class="overdue-badge detail-overdue-badge">Trễ hạn · ${overdueDays(task)} ngày</span>` : ""}</div>
      </section>
      <section class="detail-section">
        <h3>Mô tả công việc</h3>
        <p class="detail-description">${esc(task.description || "Chưa có mô tả.")}</p>
      </section>
      <section class="detail-section">
        <h3>Công việc cần hoàn thành trước</h3>
        ${dependenciesHTML}
      </section>
      <section class="detail-section">
        <h3>Người phụ trách và liên hệ</h3>
        ${assignmentsHTML}
      </section>
      <section class="detail-section">
        <h3>Sản phẩm của công việc</h3>
        <div id="taskProductList">${products}</div>
      </section>
      <div class="task-meta-grid">
        <div class="meta-item"><span>Mã công việc</span><strong>${esc(task.task_id)}</strong></div>
        <div class="meta-item"><span>Số thứ tự</span><strong>${esc(task.task_no ?? "—")}</strong></div>
        <div class="meta-item"><span>Mã sự kiện</span><strong>${esc(task.event_id || "—")}</strong></div>
        <div class="meta-item"><span>Nhãn nộp bài</span><strong>${esc(task.submission_label || "—")}</strong></div>
        <div class="meta-item"><span>Loại công việc</span><strong>${esc(task.task_type || "—")}</strong></div>
        <div class="meta-item"><span>Vai trò</span><strong>${roles.length ? roles.map(esc).join(", ") : "—"}</strong></div>
        <div class="meta-item"><span>Người thực hiện</span><strong>${members.length ? members.map(id => esc(memberLabel(id))).join(", ") : "Chưa phân công"}</strong></div>
        <div class="meta-item"><span>Deadline</span><strong>${esc(deadline(task))}</strong></div>
        <div class="meta-item"><span>Ngày lên sóng</span><strong>${esc(onAir(task))}</strong></div>
        <div class="meta-item"><span>Đăng trên trang chính</span><strong>${task.posted_on_main_page == null ? "Chưa rõ" : task.posted_on_main_page ? "Có" : "Không"}</strong></div>
        <div class="meta-item"><span>Phương thức đăng</span><strong>${esc(task.post_method || "—")}</strong></div>
        <div class="meta-item"><span>Đã đăng bài</span><strong>${task.post_done == null ? "Chưa rõ" : task.post_done ? "Đã đăng" : "Chưa đăng"}</strong></div>
        <div class="meta-item"><span>Đã hủy</span><strong>${task.is_cancelled == null ? "Chưa rõ" : task.is_cancelled ? "Có" : "Không"}</strong></div>
        <div class="meta-item"><span>Cờ chất lượng dữ liệu</span><strong>${esc(task.data_quality_flag || "—")}</strong></div>
      </div>
      <section class="detail-section" style="margin-top:20px">
        <h4>Phân công theo vai trò</h4>
        ${assignments.length ? `<div class="assignment-list">${assignments.map(a => `
          <div class="attachment-item assignment-item">
            <span><strong>${esc(a.role)}</strong><small>${esc(memberLabel(a.member_id))} · ${STATUS[assignmentStatus(a)]}${a.assignment_state ? ` · ${esc(a.assignment_state)}` : ""}</small></span>
          </div>`).join("")}</div>` : `<p class="attachment-empty">Công việc chưa có phân công.</p>`}
      </section>
      <section class="detail-section">
        <h4>Thông tin chưa có trong database</h4>
        <p class="personal-note note-empty">Mức độ ưu tiên, người giao việc, phần trăm tiến độ, ghi chú và tệp đính kèm chưa có cột/bảng tương ứng trong schema hiện tại.</p>
      </section>
      ${canCommentOnTask(task) ? `
        <section class="task-comments-section" id="taskCommentsSection" aria-labelledby="taskCommentsHeading">
          <div class="section-heading">
            <h4 id="taskCommentsHeading">Bình luận</h4>
            <span id="taskCommentCount">0</span>
          </div>
          <p class="comment-status" id="taskCommentStatus" role="status" hidden></p>
          <div class="comment-list" id="taskCommentList"></div>
          <div class="comment-reply-target" id="taskCommentReplyTarget" hidden>
            <span></span>
            <button type="button" data-cancel-comment-reply>Hủy trả lời</button>
          </div>
          <form class="comment-form" id="taskCommentForm">
            <textarea id="taskCommentInput" rows="2" maxlength="5000"
              placeholder="Viết bình luận..." aria-label="Viết bình luận" required></textarea>
            <button type="submit" aria-label="Gửi bình luận">
              <i data-lucide="send"></i>
            </button>
          </form>
        </section>` : ""}`;
    if (dom.updateButton) {
      dom.updateButton.hidden = !state.isTeamLeader;
      dom.updateButton.disabled = !state.isTeamLeader;
    }
    if (window.lucide) window.lucide.createIcons();
    if (canCommentOnTask(task)) loadTaskComments(task);
  }

  function renderTaskProducts(attachments = []) {
    return attachments.length
      ? `<div class="task-attachment-list">${attachments.map(attachment => {
        const url = safeProductUrl(attachment.file_url);
        const label = attachment.file_name || "Sản phẩm công việc";
        const createdAt = attachment.created_at ? new Date(attachment.created_at) : null;
        const timestamp = attachment.created_at
          && createdAt && !Number.isNaN(createdAt.getTime())
          ? new Intl.DateTimeFormat(window.AppI18n?.locale || "vi-VN", {
            dateStyle: "medium", timeStyle: "short"
          }).format(createdAt)
          : "Chưa rõ ngày cập nhật";
        return `<div class="task-attachment-row">
          ${url
            ? `<a class="attachment-item task-submission-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer"><i data-lucide="external-link"></i><span><strong>${esc(label)}</strong><small>${esc(timestamp)}</small></span></a>`
            : `<div class="attachment-item task-submission-link is-invalid"><i data-lucide="file-warning"></i><span><strong>${esc(label)}</strong><small>Liên kết không hợp lệ</small></span></div>`}
        </div>`;
      }).join("")}</div>`
      : '<p class="attachment-empty">Chưa có sản phẩm hoặc link nào được lưu cho công việc.</p>';
  }

  async function refreshTaskProducts(task) {
    const { data, error } = await state.db.from("task_attachments").select(
      "attachment_id, task_id, file_name, file_url, file_type, file_size, uploaded_by, created_at"
    ).eq("task_id", task.task_id).order("created_at", { ascending: false });
    if (error) throw error;

    task.attachments = data || [];
    if (state.selected !== task) return;
    const productList = dom.detail.querySelector("#taskProductList");
    if (productList) productList.innerHTML = renderTaskProducts(task.attachments);
    if (window.lucide) window.lucide.createIcons();
  }

  function openDetail(taskId, navigation = "root") {
    const task = state.tasks.find(t => String(t.task_id) === String(taskId));
    if (!task) return;
    if (navigation === "dependency" && state.selected) {
      state.detailHistory.push(state.selected.task_id);
    } else if (navigation === "root") {
      state.detailHistory = [];
    }
    state.replyParentId = null;
    state.selected = task;
    renderDetail(task);
    openModal(dom.detailModal);
    refreshTaskProducts(task).catch(error => {
      console.error("Không thể tải sản phẩm của công việc:", error);
      if (state.selected !== task) return;
      const productList = dom.detail.querySelector("#taskProductList");
      if (productList) {
        productList.innerHTML = '<p class="attachment-empty">Không thể tải sản phẩm. Vui lòng thử lại.</p>';
      }
    });
  }

  function goBackToPreviousTask() {
    const previousTaskId = state.detailHistory.pop();
    if (previousTaskId) openDetail(previousTaskId, "back");
  }

  async function saveProgress(event) {
    event.preventDefault();
    const task = state.selected;
    if (!state.isTeamLeader) {
      alert("Chỉ trưởng nhóm mới có thể cập nhật trạng thái trong Danh sách công việc.");
      return;
    }
    if (!task) return;

    const status = dom.status.value;
    const isDone = status === "completed";
    const { data: taskData, error: taskError } = await state.db.from("tasks")
      .update({ status })
      .eq("task_id", task.task_id)
      .select("task_id");
    if (taskError) {
      console.error("[task-list] Không thể cập nhật trạng thái công việc:", taskError);
      alert(`Không thể cập nhật trạng thái công việc: ${taskError.message}`);
      return;
    }
    if (!taskData?.length) {
      alert("Không có công việc nào được cập nhật. Kiểm tra quyền truy cập của trưởng nhóm.");
      return;
    }

    if (task.assignments?.length) {
      const { data: assignmentData, error: assignmentError } = await state.db.from("task_assignments")
        .update({
          assignment_state: status,
          is_done: isDone
        })
        .eq("task_id", task.task_id)
        .select("task_id");
      if (assignmentError || !assignmentData?.length) {
        console.error("[task-list] Không thể đồng bộ trạng thái phân công:", assignmentError);
        closeModal(dom.progressModal);
        closeModal(dom.detailModal);
        await loadData();
        alert(
          `Đã cập nhật trạng thái công việc, nhưng không thể đồng bộ trạng thái phân công${assignmentError ? `: ${assignmentError.message}` : "."}`
        );
        return;
      }
    }

    closeModal(dom.progressModal);
    closeModal(dom.detailModal);
    await loadData();
  }

  function openProgress() {
    const task = state.selected;
    if (!state.isTeamLeader || !task) return;

    text(dom.progressTitle, task.task_title || task.task_id);
    text(dom.progressGroup, task.assignments?.length
      ? `Tất cả ${task.assignments.length} phân công`
      : "Công việc chưa có phân công");
    dom.status.value = taskStatus(task);
    openModal(dom.progressModal);
  }

  function bind() {
    let searchTimer;
    dom.search?.addEventListener("input", () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(applyFilters, 200);
    });
    dom.sort?.addEventListener("change", applyFilters);
    dom.groupFilter?.addEventListener("change", applyFilters);

    dom.toggleFilters?.addEventListener("click", () => {
      dom.advancedFilters.hidden = !dom.advancedFilters.hidden;
      dom.toggleFilters.setAttribute("aria-expanded", String(!dom.advancedFilters.hidden));
    });
    dom.resetFilters?.addEventListener("click", () => {
      dom.search.value = "";
      if (dom.groupFilter) dom.groupFilter.value = "";
      state.group = "";
      state.status = "all";
      state.overdueOnly = false;
      dom.groupTabs.forEach(b => b.classList.toggle("active", !b.dataset.group));
      syncFilterControls();
      applyFilters();
    });

    document.addEventListener("click", event => {
      if (!event.target.closest(".filter-menu-container") && !dom.advancedFilters.hidden) {
        dom.advancedFilters.hidden = true;
        dom.toggleFilters.setAttribute("aria-expanded", "false");
      }
    });
    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && !dom.advancedFilters.hidden) {
        dom.advancedFilters.hidden = true;
        dom.toggleFilters.setAttribute("aria-expanded", "false");
        dom.toggleFilters.focus();
      }
    });

    dom.groupTabs.forEach(button => button.addEventListener("click", () => {
      state.group = button.dataset.group || "";
      dom.groupTabs.forEach(b => b.classList.toggle("active", b === button));
      applyFilters();
    }));
    dom.statusTabs.forEach(button => button.addEventListener("click", () => {
      if (button.hasAttribute("data-overdue-filter")) {
        state.overdueOnly = !state.overdueOnly;
      } else {
        state.status = button.dataset.status || "all";
      }
      syncFilterControls();
      applyFilters();
    }));
    dom.overdueCard?.addEventListener("click", () => {
      state.overdueOnly = !state.overdueOnly;
      syncFilterControls();
      applyFilters();
    });

    dom.tbody?.addEventListener("click", event => {
      const row = event.target.closest("[data-task-id]");
      if (row) openDetail(row.dataset.taskId);
    });
    dom.tbody?.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        const row = event.target.closest("[data-task-id]");
        if (row) { event.preventDefault(); openDetail(row.dataset.taskId); }
      }
    });
    dom.teamDeadlineList?.addEventListener("click", event => {
      const button = event.target.closest("[data-team-deadline-task]");
      if (button) openDetail(button.dataset.teamDeadlineTask);
    });
    dom.teamDeadlineList?.addEventListener("change", event => {
      const checkbox = event.target.closest("[data-select-deadline-task]");
      if (!checkbox) return;
      const taskId = checkbox.dataset.selectDeadlineTask;
      if (checkbox.checked) state.selectedDeadlineTaskIds.add(taskId);
      else state.selectedDeadlineTaskIds.delete(taskId);
      setDeadlineFeedback("");
      renderTeamDeadlines();
    });
    dom.teamDeadlineDays?.addEventListener("change", () => {
      const inputValue = dom.teamDeadlineDays.value.trim();
      const days = Number(inputValue);
      if (!inputValue || !Number.isSafeInteger(days) || days < 0) {
        dom.teamDeadlineDays.value = String(state.deadlineWindowDays);
        return;
      }
      state.deadlineWindowDays = days;
      state.selectedDeadlineTaskIds.clear();
      setDeadlineFeedback("");
      renderTeamDeadlines();
    });
    dom.selectAllTeamDeadlineTasks?.addEventListener("change", () => {
      const upcomingIds = state.tasks
        .filter(task => daysUntilDeadline(task) !== null)
        .map(task => String(task.task_id));
      state.selectedDeadlineTaskIds = dom.selectAllTeamDeadlineTasks.checked
        ? new Set(upcomingIds)
        : new Set();
      setDeadlineFeedback("");
      renderTeamDeadlines();
    });
    dom.remindSelectedTeamTasks?.addEventListener("click", remindSelectedTasks);
    dom.detail?.addEventListener("click", event => {
      const replyButton = event.target.closest("[data-reply-to-comment]");
      if (replyButton) {
        startTaskCommentReply(replyButton.dataset.replyToComment);
        return;
      }
      if (event.target.closest("[data-cancel-comment-reply]")) {
        cancelTaskCommentReply();
        return;
      }
      const deleteCommentButton = event.target.closest("[data-delete-task-comment]");
      if (deleteCommentButton) {
        deleteTaskComment(deleteCommentButton.dataset.deleteTaskComment);
        return;
      }
      if (event.target.closest("[data-back-task]")) {
        goBackToPreviousTask();
        return;
      }
      const dependencyButton = event.target.closest("[data-open-dependency]");
      if (dependencyButton?.dataset.openDependency) {
        openDetail(dependencyButton.dataset.openDependency, "dependency");
      }
    });
    dom.detail?.addEventListener("submit", event => {
      if (event.target.matches("#taskCommentForm")) submitTaskComment(event);
    });

    dom.previous?.addEventListener("click", () => {
      if (state.page > 1) { state.page--; render(); }
    });
    dom.next?.addEventListener("click", () => {
      if (state.page < Math.ceil(state.filtered.length / PAGE_SIZE)) { state.page++; render(); }
    });

    document.querySelectorAll("[data-close-modal]").forEach(button => {
      button.addEventListener("click", () => closeModal(document.getElementById(button.dataset.closeModal)));
    });
    [dom.detailModal, dom.progressModal].forEach(modal => modal?.addEventListener("click", e => {
      if (e.target === modal) closeModal(modal);
    }));
    dom.updateButton?.addEventListener("click", openProgress);
    dom.form?.addEventListener("submit", saveProgress);
    document.addEventListener("keydown", e => {
      if (e.key === "Escape") {
        closeModal(dom.progressModal);
        closeModal(dom.detailModal);
      }
    });
  }

  function syncFilterControls() {
    dom.statusTabs.forEach(button => {
      const isOverdueTab = button.hasAttribute("data-overdue-filter");
      const active = isOverdueTab
        ? state.overdueOnly
        : button.dataset.status === state.status;
      button.classList.toggle("active", active);
      if (isOverdueTab) button.setAttribute("aria-pressed", String(state.overdueOnly));
    });
    dom.overdueCard?.classList.toggle("is-active", state.overdueOnly);
    dom.overdueCard?.setAttribute("aria-pressed", String(state.overdueOnly));
  }

  async function init() {
    bind();
    state.db = client();
    if (!state.db) {
      showMessage("Không tìm thấy Supabase client. Hãy nạp Supabase SDK và supabase.js trước task-list.js.");
      return;
    }

    try {
      const { data, error } = await state.db.auth.getSession();
      if (error) throw error;
      const user = data.session?.user;
      state.currentUser = user || null;
      state.currentUserId = user?.id || null;
      if (CONFIG.memberId) state.memberId = String(CONFIG.memberId);

      if (user) {
        const { data: membership, error: membershipError } = await state.db
          .from("team_members")
          .select("member_id, account_role, workspace_id")
          .eq("user_id", user.id)
          .maybeSingle();
        if (membershipError) console.error("[task-list] Không thể tải vai trò tài khoản:", membershipError);
        const accountRole = String(membership?.account_role || user.app_metadata?.role || "")
          .trim().toLocaleLowerCase("vi");
        state.accountRole = accountRole;
        state.membershipWorkspaceId = membership?.workspace_id || null;
        state.isTeamLeader = ["leader", "team_leader", "trưởng nhóm"].includes(accountRole);
        state.memberId = state.memberId || membership?.member_id ||
          user?.user_metadata?.member_id || user?.app_metadata?.member_id || null;
      }
      await loadData();
    } catch (error) {
      console.error("[task-list]", error);
      showMessage(error.message || "Không thể tải danh sách công việc. Kiểm tra quyền truy cập Supabase/RLS.");
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else init();
})();
