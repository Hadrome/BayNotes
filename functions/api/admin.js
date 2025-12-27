// functions/api/admin.js

// 验证管理员身份辅助函数
async function verifyAdmin(request, env) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) return null;
  try {
    const token = authHeader.split(' ')[1];
    const userId = atob(token).split(':')[0];
    const user = await env.BNBD.prepare("SELECT id, username, role FROM users WHERE id = ?").bind(userId).first();
    if (!user) return null;
    // 允许 role='admin' 或 环境变量设置的超级用户
    if (user.role === 'admin' || (env.SUPER_USER && user.username === env.SUPER_USER)) return userId;
    return null;
  } catch (e) { return null; }
}

// 密码哈希辅助函数
async function hashPassword(password, salt) {
    const enc = new TextEncoder();
    const msgBuffer = enc.encode(password + salt);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function onRequestGet(context) {
  const adminId = await verifyAdmin(context.request, context.env);
  if (!adminId) return Response.json({ error: "无权访问" }, { status: 403 });

  // 获取所有用户列表
  const { results } = await context.env.BNBD.prepare("SELECT id, username, role, permissions, created_at FROM users ORDER BY created_at DESC").all();
  return Response.json(results);
}

export async function onRequestPost(context) {
    const adminId = await verifyAdmin(context.request, context.env);
    if (!adminId) return Response.json({ error: "无权访问" }, { status: 403 });

    const body = await context.request.json();
    const { targetUserId, action, newPermissions, newPassword } = body;

    // ★★★ 实现权限更新逻辑 ★★★
    if (action === 'update_permissions') {
        // newPermissions 格式如 "edit,delete,share"
        await context.env.BNBD.prepare("UPDATE users SET permissions = ? WHERE id = ?")
            .bind(newPermissions, targetUserId).run();
    } 
    // ★★★ 实现密码重置逻辑 ★★★
    else if (action === 'reset_password') {
        const salt = crypto.randomUUID();
        const hash = await hashPassword(newPassword, salt);
        await context.env.BNBD.prepare("UPDATE users SET password_hash = ?, salt = ? WHERE id = ?")
            .bind(hash, salt, targetUserId).run();
    }
    else {
        return Response.json({ error: "无效的操作类型" }, { status: 400 });
    }

    return Response.json({ success: true });
}

export async function onRequestDelete(context) {
    const adminId = await verifyAdmin(context.request, context.env);
    if (!adminId) return Response.json({ error: "无权访问" }, { status: 403 });

    const url = new URL(context.request.url);
    const targetUserId = url.searchParams.get('id');

    if (targetUserId === adminId) return Response.json({ error: "不能删除自己" }, { status: 400 });

    // 删除用户
    await context.env.BNBD.prepare("DELETE FROM users WHERE id = ?").bind(targetUserId).run();
    // 级联删除该用户的数据 (可选，建议清理干净)
    await context.env.BNBD.prepare("DELETE FROM notes WHERE user_id = ?").bind(targetUserId).run();
    await context.env.BNBD.prepare("DELETE FROM folders WHERE user_id = ?").bind(targetUserId).run();

    return Response.json({ success: true });
}
