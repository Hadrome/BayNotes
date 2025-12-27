// functions/api/admin.js

async function verifyAdmin(request, env) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) return null;
  try {
    const token = authHeader.split(' ')[1];
    const userId = atob(token).split(':')[0];
    const user = await env.BNBD.prepare("SELECT id, username, role FROM users WHERE id = ?").bind(userId).first();
    // 允许 role='admin' 或 环境变量设置的超级用户
    if (user && (user.role === 'admin' || (env.SUPER_USER && user.username === env.SUPER_USER))) return userId;
    return null;
  } catch (e) { return null; }
}

async function hashPassword(password, salt) {
    const enc = new TextEncoder();
    const msgBuffer = enc.encode(password + salt);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function onRequestGet(context) {
  const adminId = await verifyAdmin(context.request, context.env);
  if (!adminId) return Response.json({ error: "无权访问" }, { status: 403 });

  // 修复：确保查询所有字段，避免 role/permissions 缺失报错
  const { results } = await context.env.BNBD.prepare("SELECT id, username, role, permissions, created_at FROM users ORDER BY created_at DESC").all();
  return Response.json(results);
}

export async function onRequestPost(context) {
    const adminId = await verifyAdmin(context.request, context.env);
    if (!adminId) return Response.json({ error: "无权访问" }, { status: 403 });

    const body = await context.request.json();
    const { targetUserId, action, newPermissions, newPassword } = body;

    if (action === 'update_permissions') {
        await context.env.BNBD.prepare("UPDATE users SET permissions = ? WHERE id = ?")
            .bind(newPermissions, targetUserId).run();
    } 
    else if (action === 'reset_password') {
        const salt = crypto.randomUUID();
        const hash = await hashPassword(newPassword, salt);
        await context.env.BNBD.prepare("UPDATE users SET password_hash = ?, salt = ? WHERE id = ?")
            .bind(hash, salt, targetUserId).run();
    }
    else {
        return Response.json({ error: "无效的操作" }, { status: 400 });
    }

    return Response.json({ success: true });
}

export async function onRequestDelete(context) {
    const adminId = await verifyAdmin(context.request, context.env);
    if (!adminId) return Response.json({ error: "无权访问" }, { status: 403 });

    const url = new URL(context.request.url);
    const targetUserId = url.searchParams.get('id');

    if (targetUserId === adminId) return Response.json({ error: "不能删除自己" }, { status: 400 });

    await context.env.BNBD.prepare("DELETE FROM users WHERE id = ?").bind(targetUserId).run();
    await context.env.BNBD.prepare("DELETE FROM notes WHERE user_id = ?").bind(targetUserId).run();
    await context.env.BNBD.prepare("DELETE FROM folders WHERE user_id = ?").bind(targetUserId).run();

    return Response.json({ success: true });
}
