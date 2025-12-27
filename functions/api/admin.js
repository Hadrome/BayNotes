// functions/api/admin.js

// 复用 verifyAdmin 逻辑...
async function verifyAdmin(request, env) {
  // ... (保持原有的验证逻辑) ...
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) return null;
  try {
    const token = authHeader.split(' ')[1];
    const userId = atob(token).split(':')[0];
    const user = await env.BNBD.prepare("SELECT id, username, role FROM users WHERE id = ?").bind(userId).first();
    if (!user) return null;
    if (user.role === 'admin' || (env.SUPER_USER && user.username === env.SUPER_USER)) return userId;
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

  const { results } = await context.env.BNBD.prepare(`
    SELECT users.id, users.username, users.role, users.permissions, users.created_at, COUNT(notes.id) as note_count 
    FROM users LEFT JOIN notes ON users.id = notes.user_id 
    GROUP BY users.id ORDER BY users.created_at DESC
  `).all();
  return Response.json(results);
}

// POST: 修改用户配置 (权限、重置密码)
export async function onRequestPost(context) {
    const adminId = await verifyAdmin(context.request, context.env);
    if (!adminId) return Response.json({ error: "无权访问" }, { status: 403 });

    const body = await context.request.json();
    const { targetUserId, action, newPermissions, newPassword } = body;

    if (action === 'update_permissions') {
        // newPermissions 应该是逗号分隔的字符串 "edit,delete"
        await context.env.BNBD.prepare("UPDATE users SET permissions = ? WHERE id = ?").bind(newPermissions, targetUserId).run();
    } 
    else if (action === 'reset_password') {
        // 重置密码逻辑
        const salt = crypto.randomUUID(); // 这里需要简单的uuid生成，如果没有uuid库，可以用 random string
        const hash = await hashPassword(newPassword, salt);
        await context.env.BNBD.prepare("UPDATE users SET password_hash = ?, salt = ? WHERE id = ?").bind(hash, salt, targetUserId).run();
    }

    return Response.json({ success: true });
}

export async function onRequestDelete(context) {
    // ... (保持原有的删除用户逻辑) ...
    const adminId = await verifyAdmin(context.request, context.env);
    if (!adminId) return Response.json({ error: "无权访问" }, { status: 403 });
    const url = new URL(context.request.url);
    const targetUserId = url.searchParams.get('id');
    if (targetUserId === adminId) return Response.json({ error: "不能删除自己" }, { status: 400 });
    await context.env.BNBD.prepare("DELETE FROM notes WHERE user_id = ?").bind(targetUserId).run();
    await context.env.BNBD.prepare("DELETE FROM users WHERE id = ?").bind(targetUserId).run();
    return Response.json({ success: true });
}
