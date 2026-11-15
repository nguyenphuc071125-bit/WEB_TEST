import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
}

class HttpError extends Error {
    status: number;

    constructor(status: number, message: string) {
        super(message);
        this.status = status;
    }
}

function escapeLike(value: string) {
    return value.replace(/[\\%_]/g, "\\$&");
}

Deno.serve(async request => {
    if (request.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }
    if (request.method !== "POST") {
        return jsonResponse({ error: "Method not allowed." }, 405);
    }

    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const authorization = request.headers.get("Authorization");
    if (!serviceKey || !supabaseUrl || !anonKey || !authorization?.startsWith("Bearer ")) {
        return jsonResponse({ error: "Supabase function is not configured correctly." }, 500);
    }

    const clientOptions = { auth: { autoRefreshToken: false, persistSession: false } };
    const adminClient = createClient(supabaseUrl, serviceKey, clientOptions);
    const authClient = createClient(supabaseUrl, anonKey, clientOptions);
    let restoredProfile: {
        memberId: string;
        workspaceId: string;
        removedAt: string;
    } | null = null;

    try {
        const body = await request.json().catch(() => null);
        const email = String(body?.email || "").trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
            throw new HttpError(400, "Email không hợp lệ.");
        }

        const { data: authData, error: authError } =
            await authClient.auth.getUser(authorization.slice(7));
        if (authError || !authData.user) {
            throw new HttpError(401, "Vui lòng đăng nhập lại.");
        }

        const { data: callerMembership, error: callerError } = await adminClient
            .from("team_members")
            .select("workspace_id, account_role")
            .eq("user_id", authData.user.id)
            .maybeSingle();
        if (callerError) throw callerError;
        if (!callerMembership || callerMembership.account_role !== "leader") {
            throw new HttpError(403, "Chỉ trưởng nhóm mới có thể khôi phục thành viên.");
        }

        const workspaceId = String(callerMembership.workspace_id);
        const { data: profiles, error: profileError } = await adminClient
            .from("members")
            .select("member_id, workspace_id, email, member_label, removed_from_workspace_at")
            .eq("workspace_id", workspaceId)
            .ilike("email", escapeLike(email))
            .limit(2);
        if (profileError) throw profileError;
        if (!profiles?.length) {
            throw new HttpError(404, "Không tìm thấy hồ sơ của email này trong workspace.");
        }
        if (profiles.length !== 1) {
            throw new HttpError(409, "Có nhiều hồ sơ trùng email; cần kiểm tra trước khi khôi phục.");
        }

        const profile = profiles[0];
        if (!profile.removed_from_workspace_at) {
            throw new HttpError(409, "Thành viên này chưa bị gỡ khỏi workspace.");
        }

        let authUser: { id: string; email?: string } | null = null;
        const perPage = 1000;
        const maxPages = 100;
        for (let page = 1; page <= maxPages; page += 1) {
            const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage });
            if (error) throw error;
            authUser = data.users.find(user =>
                String(user.email || "").trim().toLowerCase() === email
            ) || null;
            if (authUser) break;
            if (data.users.length < perPage) break;
            if (page === maxPages) {
                throw new HttpError(503, "Không thể tìm tài khoản trong giới hạn tra cứu. Vui lòng thử lại.");
            }
        }
        if (!authUser) {
            throw new HttpError(404, "Không tìm thấy tài khoản đăng nhập với email này.");
        }

        const [memberLinkResult, userLinkResult] = await Promise.all([
            adminClient
                .from("team_members")
                .select("user_id, workspace_id")
                .eq("member_id", profile.member_id)
                .maybeSingle(),
            adminClient
                .from("team_members")
                .select("member_id, workspace_id")
                .eq("user_id", authUser.id)
                .maybeSingle()
        ]);
        if (memberLinkResult.error) throw memberLinkResult.error;
        if (userLinkResult.error) throw userLinkResult.error;
        if (memberLinkResult.data || userLinkResult.data) {
            throw new HttpError(409, "Tài khoản hoặc hồ sơ đã được liên kết; không thể khôi phục tự động.");
        }

        const { data: updatedProfile, error: updateError } = await adminClient
            .from("members")
            .update({ is_active: true, removed_from_workspace_at: null })
            .eq("member_id", profile.member_id)
            .eq("workspace_id", workspaceId)
            .not("removed_from_workspace_at", "is", null)
            .select("member_id")
            .maybeSingle();
        if (updateError) throw updateError;
        if (!updatedProfile) {
            throw new HttpError(409, "Hồ sơ đã thay đổi; hãy tải lại trang rồi thử lại.");
        }

        restoredProfile = {
            memberId: String(profile.member_id),
            workspaceId,
            removedAt: String(profile.removed_from_workspace_at)
        };

        const { error: linkError } = await adminClient
            .from("team_members")
            .insert({
                user_id: authUser.id,
                member_id: profile.member_id,
                workspace_id: workspaceId,
                account_role: "member"
            });
        if (linkError) throw linkError;

        return jsonResponse({
            memberId: profile.member_id,
            workspaceId,
            memberName: profile.member_label || ""
        });
    } catch (error) {
        console.error("Restore workspace member failed:", error);
        if (restoredProfile) {
            const { error: rollbackError } = await adminClient
                .from("members")
                .update({
                    is_active: false,
                    removed_from_workspace_at: restoredProfile.removedAt
                })
                .eq("member_id", restoredProfile.memberId)
                .eq("workspace_id", restoredProfile.workspaceId);
            if (rollbackError) {
                console.error("Restore profile rollback failed:", rollbackError);
            }
        }
        if (error instanceof HttpError) {
            return jsonResponse({ error: error.message }, error.status);
        }
        return jsonResponse({ error: "Không thể khôi phục thành viên." }, 500);
    }
});
