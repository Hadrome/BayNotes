// functions/api/notes.js

// 辅助函数：哈希验证
async function hashPassword(password, salt) {
    const enc = new TextEncoder();
    const msgBuffer = enc.encode(password + salt);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function getUser(request) {
  const auth = request.headers.get('Authorization');
  if (!auth) return null;
  try { return atob(auth.split(' ')[1]).split(':')[0]; } catch { return null; }
}

export async function onRequestGet(context) {
  const userId = getUser(context.request);
  if (!userId) return Response.json({ error: "未授权" }, { status: 401 });

  const url = new URL(context.request.url);
  const type = url.searchParams.get('type') || 'all'; 
  const folderId = url.searchParams.get('folderId');
  const query = url.searchParams.get('q');
  
  // ★ 安全检查：如果请求特定文件夹，且文件夹加密，验证密码
  if (type === 'folder' && folderId) {
      const folder = await context.env.BNBD.prepare("SELECT is_encrypted, password_hash, salt FROM folders WHERE id = ?").bind(folderId).first();
      
      if (folder && folder.is_encrypted) {
          const pwdHeader = context.request.headers.get('X-Folder-Pwd');
          // 如果没有提供密码头，或者密码验证失败
          if (!pwdHeader) {
              return Response.json({ error: "Locked", isLocked: true }, { status: 403 });
          }
          const hash = await hashPassword(pwdHeader, folder.salt);
          if (hash !== folder.password_hash) {
               return Response.json({ error: "Password Incorrect", isLocked: true }, { status: 403 });
          }
      }
  }

  let sql = "SELECT * FROM notes WHERE user_id = ?";
  let params = [userId];

  // 回收站清理 (48h)
  if (type === 'trash') {
    const expireTime = Math.floor(Date.now() / 1000) - (48 * 3600);
    await context.env.BNBD.prepare("DELETE FROM notes WHERE user_id = ? AND deleted_at IS NOT NULL AND deleted_at < ?").bind(userId, expireTime).run();
  }

  if (type === 'trash') {
    sql += " AND deleted_at IS NOT NULL";
  } else {
    sql += " AND deleted_at IS NULL"; 
    if (type === 'shared') {
      sql += " AND share_id IS NOT NULL";
    } else if (type === 'folder' && folderId) {
      sql += " AND folder_id = ?";
      params.push(folderId);
    } else if (type === 'search' && query) {
      sql += " AND (title LIKE ? OR content LIKE ?)";
      params.push(`%${query}%`, `%${query}%`);
    } else if (type === 'root') {
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

  const body = await context.request.json();
  // 移除 is_encrypted 处理，只保留基础字段
  const { id, title, content, folderId } = body;

  if (id) {
    // 更新
    await context.env.BNBD.prepare(
      "UPDATE notes SET title=?, content=?, folder_id=? WHERE id=? AND user_id=?"
    ).bind(title, content, folderId||null, id, userId).run();
    return Response.json({ success: true });
  } else {
    // 新建
    const newId = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);
    await context.env.BNBD.prepare(
      "INSERT INTO notes (id, user_id, title, content, folder_id, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).bind(newId, userId, title, content, folderId||null, now).run();
    return Response.json({ success: true, id: newId });
  }
}

export async function onRequestPatch(context) {
    const userId = getUser(context.request);
    if (!userId) return Response.json({ error: "未授权" }, { status: 401 });

    const body = await context.request.json();

    if (body.action === 'restore') {
        await context.env.BNBD.prepare("UPDATE notes SET deleted_at = NULL WHERE id = ? AND user_id = ?")
            .bind(body.noteId, userId).run();
        return Response.json({ success: true });
    }

    // 分享逻辑
    const { noteId, days, burn, pwd } = body;
    const shareId = Math.random().toString(36).substring(2, 10);
    const expireAt = days > 0 ? Math.floor(Date.now() / 1000) + (days * 86400) : null;
    
    await context.env.BNBD.prepare("UPDATE notes SET share_id = ?, share_pwd = ?, share_expire_at = ?, share_burn_after_read = ? WHERE id = ? AND user_id = ?").bind(shareId, pwd, expireAt, burn?1:0, noteId, userId).run();
    
    return Response.json({ success: true, shareId });
}

export async function onRequestDelete(context) {
  const userId = getUser(context.request);
  if (!userId) return Response.json({ error: "未授权" }, { status: 401 });
  
  const url = new URL(context.request.url);
  const id = url.searchParams.get('id');
  const type = url.searchParams.get('type');
  
  if (type === 'hard') {
      await context.env.BNBD.prepare("DELETE FROM notes WHERE id = ? AND user_id = ?").bind(id, userId).run();
  } else {
      const now = Math.floor(Date.now() / 1000);
      await context.env.BNBD.prepare("UPDATE notes SET deleted_at = ? WHERE id = ? AND user_id = ?").bind(now, id, userId).run();
  }
  return Response.json({ success: true });
}
