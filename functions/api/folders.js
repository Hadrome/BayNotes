// functions/api/folders.js

// 密码哈希辅助函数
async function hashPassword(password, salt) {
  const enc = new TextEncoder();
  const msgBuffer = enc.encode(password + salt);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function getUser(request) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) return null;
  try { return atob(authHeader.split(' ')[1]).split(':')[0]; } catch { return null; }
}

export async function onRequest(context) {
  const { request, env } = context;
  const userId = getUser(request);
  if (!userId) return Response.json({ error: "未授权" }, { status: 401 });

  const url = new URL(request.url);

  // GET: 获取文件夹列表 (不返回密码hash，只返回是否加密)
  if (request.method === "GET") {
    const { results } = await env.BNBD.prepare("SELECT id, user_id, name, parent_id, is_encrypted, created_at FROM folders WHERE user_id = ? ORDER BY created_at ASC").bind(userId).all();
    return Response.json(results);
  }

  // POST: 新建文件夹 或 验证文件夹密码
  if (request.method === "POST") {
    const body = await request.json();

    // ★ 动作：验证文件夹密码 (前端在解锁时调用)
    if (body.action === 'verify') {
        const folder = await env.BNBD.prepare("SELECT password_hash, salt FROM folders WHERE id = ?").bind(body.folderId).first();
        if(!folder) return Response.json({ error: "文件夹不存在" }, { status: 404 });
        
        const hash = await hashPassword(body.password, folder.salt);
        if(hash === folder.password_hash) {
            return Response.json({ success: true });
        } else {
            return Response.json({ error: "密码错误" }, { status: 403 });
        }
    }

    // ★ 动作：新建/更新文件夹
    const id = body.id || crypto.randomUUID();
    let isEncrypted = 0;
    let hash = null;
    let salt = null;

    if (body.password) {
        isEncrypted = 1;
        salt = crypto.randomUUID();
        hash = await hashPassword(body.password, salt);
    }

    // 如果是新建
    if (!body.id) {
        if (body.parentId) {
            const parent = await env.BNBD.prepare("SELECT parent_id FROM folders WHERE id = ?").bind(body.parentId).first();
            if (parent && parent.parent_id) return Response.json({ error: "最多支持2级目录" }, { status: 400 });
        }
        await env.BNBD.prepare("INSERT INTO folders (id, user_id, name, parent_id, is_encrypted, password_hash, salt) VALUES (?, ?, ?, ?, ?, ?, ?)")
            .bind(id, userId, body.name, body.parentId || null, isEncrypted, hash, salt).run();
    } else {
        // TODO: 这里简化处理，如果需要修改密码需额外逻辑，目前仅支持创建时设置
    }
    
    return Response.json({ success: true, id });
  }

  // DELETE: 删除文件夹
  if (request.method === "DELETE") {
    const id = url.searchParams.get('id');
    // 移动笔记到根目录
    await env.BNBD.prepare("UPDATE notes SET folder_id = NULL WHERE folder_id = ? AND user_id = ?").bind(id, userId).run();
    await env.BNBD.prepare("DELETE FROM folders WHERE id = ? AND user_id = ?").bind(id, userId).run();
    return Response.json({ success: true });
  }
  
  // PATCH: 锁定/解锁文件夹 (简化版：只用来切换锁定状态)
  if (request.method === "PATCH") {
      const body = await request.json();
      // 如果要移除密码
      if (body.action === 'unlock') {
          await env.BNBD.prepare("UPDATE folders SET is_encrypted=0, password_hash=NULL, salt=NULL WHERE id=? AND user_id=?").bind(body.folderId, userId).run();
          return Response.json({ success: true });
      }
  }

  return Response.json({ error: "Method not allowed" }, { status: 405 });
}
