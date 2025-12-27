// functions/api/notes.js

function getUser(request) {
  const auth = request.headers.get('Authorization');
  try { return atob(auth.split(' ')[1]).split(':')[0]; } catch { return null; }
}

// 检查权限辅助函数
async function checkPermission(env, userId, action) {
  const user = await env.BNBD.prepare("SELECT role, permissions FROM users WHERE id = ?").bind(userId).first();
  if (user.role === 'admin') return true;
  if (!user.permissions || user.permissions === 'all') return true;
  return user.permissions.includes(action);
}

export async function onRequestGet(context) {
  const userId = getUser(context.request);
  if (!userId) return Response.json({ error: "未授权" }, { status: 401 });

  const url = new URL(context.request.url);
  const type = url.searchParams.get('type') || 'all'; // all, trash, shared, folder, search
  const folderId = url.searchParams.get('folderId');
  const query = url.searchParams.get('q');

  let sql = "SELECT * FROM notes WHERE user_id = ?";
  let params = [userId];

  // 1. 懒惰清理：每次访问回收站时，删除超过48小时的笔记
  if (type === 'trash') {
    const expireTime = Math.floor(Date.now() / 1000) - (48 * 3600);
    await context.env.BNBD.prepare("DELETE FROM notes WHERE user_id = ? AND deleted_at IS NOT NULL AND deleted_at < ?").bind(userId, expireTime).run();
  }

  // 2. 构建查询
  if (type === 'trash') {
    sql += " AND deleted_at IS NOT NULL";
  } else {
    // 正常笔记：未删除
    sql += " AND deleted_at IS NULL"; 

    if (type === 'shared') {
      sql += " AND share_id IS NOT NULL";
    } else if (type === 'folder' && folderId) {
      sql += " AND folder_id = ?";
      params.push(folderId);
    } else if (type === 'search' && query) {
      // 搜索：排除加密笔记
      sql += " AND is_encrypted = 0 AND (title LIKE ? OR content LIKE ?)";
      params.push(`%${query}%`, `%${query}%`);
    } else if (type === 'root') {
        // 仅显示根目录笔记
        sql += " AND folder_id IS NULL";
    }
  }
  
  sql += " ORDER BY created_at DESC";
  const { results } = await context.env.BNBD.prepare(sql).bind(...params).all();
  return Response.json(results);
}

export async function onRequestPost(context) {
  const userId = getUser(context.request);
  if (!userId) return Response.json({ error: "未授权" }, { status: 401 });

  // 权限检查：编辑/创建
  const canEdit = await checkPermission(context.env, userId, 'edit');
  if (!canEdit) return Response.json({ error: "无编辑权限" }, { status: 403 });

  const body = await context.request.json();
  const { id, title, content, is_encrypted, folderId } = body;

  if (id) {
    // 更新
    await context.env.BNBD.prepare(
      "UPDATE notes SET title=?, content=?, is_encrypted=?, folder_id=? WHERE id=? AND user_id=?"
    ).bind(title, content, is_encrypted?1:0, folderId||null, id, userId).run();
    return Response.json({ success: true });
  } else {
    // 新建
    const newId = crypto.randomUUID();
    await context.env.BNBD.prepare(
      "INSERT INTO notes (id, user_id, title, content, is_encrypted, folder_id) VALUES (?, ?, ?, ?, ?, ?)"
    ).bind(newId, userId, title, content, is_encrypted?1:0, folderId||null).run();
    return Response.json({ success: true, id: newId });
  }
}

export async function onRequestPatch(context) {
    // 分享配置
    const userId = getUser(context.request);
    if (!userId) return Response.json({ error: "未授权" }, { status: 401 });

    const canShare = await checkPermission(context.env, userId, 'share');
    if (!canShare) return Response.json({ error: "无分享权限" }, { status: 403 });

    // ... (保持原有的分享逻辑不变) ...
    const body = await context.request.json();
    const { noteId, days, burn, pwd } = body;
    const shareId = Math.random().toString(36).substring(2, 10);
    const expireAt = days > 0 ? Math.floor(Date.now() / 1000) + (days * 86400) : null;
    await context.env.BNBD.prepare("UPDATE notes SET share_id = ?, share_pwd = ?, share_expire_at = ?, share_burn_after_read = ? WHERE id = ? AND user_id = ?").bind(shareId, pwd, expireAt, burn?1:0, noteId, userId).run();
    return Response.json({ success: true, shareId });
}

export async function onRequestDelete(context) {
  const userId = getUser(context.request);
  if (!userId) return Response.json({ error: "未授权" }, { status: 401 });

  const canDelete = await checkPermission(context.env, userId, 'delete');
  if (!canDelete) return Response.json({ error: "无删除权限" }, { status: 403 });

  const url = new URL(context.request.url);
  const id = url.searchParams.get('id');
  const type = url.searchParams.get('type'); // 'hard' 或者是普通删除

  // 如果是彻底删除（在回收站中删除）
  if (type === 'hard') {
      await context.env.BNBD.prepare("DELETE FROM notes WHERE id = ? AND user_id = ?").bind(id, userId).run();
  } else {
      // 软删除：移入回收站，记录时间
      const now = Math.floor(Date.now() / 1000);
      await context.env.BNBD.prepare("UPDATE notes SET deleted_at = ? WHERE id = ? AND user_id = ?").bind(now, id, userId).run();
  }
  
  return Response.json({ success: true });
}
