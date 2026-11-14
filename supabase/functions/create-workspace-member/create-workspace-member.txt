import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function jsonResponse(body: Record<string, unknown>, status: number) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
}

Deno.serve(async request => {
    if (request.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }
    if (request.method !== "POST") {
        return jsonResponse({ error: "Method not allowed." }, 405);
    }

    let createdUserId: string | null = null;
    let createdMemberId: string | null = null;
    let workspaceId: string | null = null;
    let invitationCreated = false;
    let teamMembershipCreated = false;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const authorization = request.headers.get("Authorization");

    if (!serviceKey || !supabaseUrl || !anonKey || !authorization?.startsWith("Bearer ")) {
        return jsonResponse({ error: "Supabase function is not configured correctly." }, 500);
    }

    const adminClient = createClient(supabaseUrl, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false }
    });
    const authClient = createClient(supabaseUrl, anonKey);

    try {
        const { data: authData, error: authError } =
            await authClient.auth.getUser(authorization.slice(7));
        if (authError || !authData.user) {
            return jsonResponse({ error: "Vui lòng đăng nhập lại." }, 401);
        }

        const caller = authData.user;
        const body = await request.json();
        const memberName = String(body.memberName || "").trim();
        const email = String(body.email || "").trim().toLowerCase();
        const initialPassword = String(body.initialPassword || "");
        const accountRole = String(body.accountRole || "");
        workspaceId = String(body.workspaceId || "");

        if (!memberName || memberName.length > 100) {
            return jsonResponse({ error: "Họ tên không hợp lệ." }, 400);
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
            return jsonResponse({ error: "Email không hợp lệ." }, 400);
        }
        if (initialPassword.length < 8 || initialPassword.length > 128) {
            return jsonResponse({ error: "Mật khẩu phải có từ 8 đến 128 ký tự." }, 400);
        }
        if (!["member", "leader"].includes(accountRole)) {
            return jsonResponse({ error: "Vai trò không hợp lệ." }, 400);
        }
        if (email === String(caller.email || "").toLowerCase()) {
            return jsonResponse({ error: "Bạn không thể tạo tài khoản bằng email của chính mình." }, 400);
        }

        const { data: workspace, error: workspaceError } = await adminClient
            .from("workspaces")
            .select("workspace_id, created_by")
            .eq("workspace_id", workspaceId)
            .maybeSingle();
        if (workspaceError) throw workspaceError;
        if (!workspace) {
            return jsonResponse({ error: "Không tìm thấy workspace." }, 404);
        }

        const { data: callerMembership, error: membershipError } = await adminClient
            .from("team_members")
            .select("account_role")
            .eq("user_id", caller.id)
            .maybeSingle();
        if (membershipError) throw membershipError;
        const callerIsLeader = ["leader", "team_leader", "trưởng nhóm"]
            .includes(String(callerMembership?.account_role || "").trim().toLowerCase());
        if (!callerIsLeader) {
            return jsonResponse({ error: "Chỉ trưởng nhóm mới có thể tạo tài khoản thành viên." }, 403);
        }

        const callerOwnsWorkspace = String(workspace.created_by) === String(caller.id);
        if (!callerOwnsWorkspace) {
            const { data: acceptedInvitation, error: invitationAccessError } = await adminClient
                .from("workspace_invitations")
                .select("invitation_id")
                .eq("workspace_id", workspace.workspace_id)
                .ilike("email", caller.email || "")
                .eq("status", "accepted")
                .limit(1)
                .maybeSingle();
            if (invitationAccessError) throw invitationAccessError;
            if (!acceptedInvitation) {
                return jsonResponse({ error: "Bạn không có quyền thêm thành viên vào workspace này." }, 403);
            }
        }

        const memberId = `MEM_${crypto.randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
        const { data: userData, error: createUserError } = await adminClient.auth.admin.createUser({
            email,
            password: initialPassword,
            email_confirm: true,
            user_metadata: { full_name: memberName, member_id: memberId },
            app_metadata: { role: accountRole, member_id: memberId }
        });
        if (createUserError) {
            if (createUserError.message.toLowerCase().includes("already")) {
                return jsonResponse({ error: "Email này đã có tài khoản." }, 409);
            }
            throw createUserError;
        }
        createdUserId = userData.user.id;
        createdMemberId = memberId;

        const { error: memberError } = await adminClient
            .from("members")
            .insert({
                member_id: memberId,
                member_label: memberName,
                email,
                is_active: true
            });
        if (memberError) throw memberError;

        const { error: teamMembershipError } = await adminClient
            .from("team_members")
            .insert({
                user_id: createdUserId,
                member_id: memberId,
                account_role: accountRole
            });
        if (teamMembershipError) throw teamMembershipError;
        teamMembershipCreated = true;

        const { error: invitationError } = await adminClient
            .from("workspace_invitations")
            .insert({
                workspace_id: workspace.workspace_id,
                email,
                member_id: memberId,
                invited_by: caller.id,
                status: "accepted",
                responded_at: new Date().toISOString()
            });
        if (invitationError) throw invitationError;
        invitationCreated = true;

        return jsonResponse({ userId: createdUserId, memberId }, 201);
    } catch (error) {
        console.error("Create workspace member failed:", error);

        if (invitationCreated && workspaceId && createdMemberId) {
            const { error } = await adminClient
                .from("workspace_invitations")
                .delete()
                .eq("workspace_id", workspaceId)
                .eq("member_id", createdMemberId);
            if (error) console.error("Invitation rollback failed:", error);
        }
        if (teamMembershipCreated && createdUserId) {
            const { error } = await adminClient
                .from("team_members")
                .delete()
                .eq("user_id", createdUserId);
            if (error) console.error("Team membership rollback failed:", error);
        }
        if (createdMemberId) {
            const { error } = await adminClient
                .from("members")
                .delete()
                .eq("member_id", createdMemberId);
            if (error) console.error("Member rollback failed:", error);
        }
        if (createdUserId) {
            const { error } = await adminClient.auth.admin.deleteUser(createdUserId);
            if (error) console.error("Auth user rollback failed:", error);
        }

        return jsonResponse({ error: "Không thể tạo tài khoản và thêm vào workspace." }, 500);
    }
});
