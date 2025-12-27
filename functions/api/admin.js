// 验证管理员身份
async function verifyAdmin(request, env) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) return null;
  
  try {
    const token = authHeader.split(' ')[1];
    const userId = atob(token).split(':')[0];
    
    // 查询数据库
    const user = await env.BNBD.prepare("SELECT id, username, role FROM users WHERE id = ?").bind(userId).first();
    if (!user) return null;

    // ★ 验证通过条件：数据库里是 admin，或者 环境变量里指定了他是 super user
    if (user.role === 'admin' || (env.SUPER_USER && user.username === env.SUPER_USER)) {
      return userId;
    }
    return null;
  } catch (e) { return null; }
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const adminId = await verifyAdmin(request, env);
  if (!adminId) return Response.json({ error: "无权访问" }, { status: 403 });

  // 获取列表 (关联 notes 表统计数量)
  const { results } = await env.BNBD.prepare(`
    SELECT users.id, users.username, users.role, users.created_at, COUNT(notes.id) as note_count 
    FROM users LEFT JOIN notes ON users.id = notes.user_id 
    GROUP BY users.id ORDER BY users.created_at DESC
  `).all();

  return Response.json(results);
}

export async function onRequestDelete(context) {
  const { request, env } = context;
  const adminId = await verifyAdmin(request, env);
  if (!adminId) return Response.json({ error: "无权访问" }, { status: 403 });

  const url = new URL(request.url);
  const targetUserId = url.searchParams.get('id');

  if (!targetUserId) return Response.json({ error: "缺少参数" }, { status: 400 });
  if (targetUserId === adminId) return Response.json({ error: "不能删除自己" }, { status: 400 });

  // 级联删除：先删笔记，再删人
  await env.BNBD.prepare("DELETE FROM notes WHERE user_id = ?").bind(targetUserId).run();
  await env.BNBD.prepare("DELETE FROM users WHERE id = ?").bind(targetUserId).run();

  return Response.json({ success: true });
}