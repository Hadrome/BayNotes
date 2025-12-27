function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

async function hashPassword(password, salt) {
  const enc = new TextEncoder();
  const msgBuffer = enc.encode(password + salt);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function onRequest(context) {
  const { request, env } = context;
  
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  try {
    // 1. 检查数据库绑定
    if (!env.BNBD) {
      return Response.json({ error: "Configuration Error: Database 'BNBD' not found." }, { status: 500 });
    }

    const body = await request.json();
    const { action, username, password, inviteCode } = body;

    if (!username || !password) return Response.json({ error: "账号密码不能为空" }, { status: 400 });

    // === 注册逻辑 ===
    if (action === 'register') {
      const correctCode = env.INVITE_CODE; 
      if (!correctCode) return Response.json({ error: "系统未配置邀请码，禁止注册" }, { status: 500 });
      if (inviteCode !== correctCode) return Response.json({ error: "邀请码错误" }, { status: 403 });

      const existing = await env.BNBD.prepare("SELECT id FROM users WHERE username = ?").bind(username).first();
      if (existing) return Response.json({ error: "用户名已存在" }, { status: 409 });

      let role = 'user';
      if (env.SUPER_USER && username === env.SUPER_USER) { role = 'admin'; }

      const salt = uuidv4();
      const hash = await hashPassword(password, salt);
      const userId = uuidv4();

      await env.BNBD.prepare("INSERT INTO users (id, username, password_hash, salt, role) VALUES (?, ?, ?, ?, ?)")
        .bind(userId, username, hash, salt, role).run();

      return Response.json({ success: true });
    }

    // === 登录逻辑 ===
    if (action === 'login') {
      const user = await env.BNBD.prepare("SELECT * FROM users WHERE username = ?").bind(username).first();
      
      // ★修复：严格检查 user 是否存在
      if (!user) {
         return Response.json({ error: "用户不存在或密码错误" }, { status: 401 });
      }

      // ★修复：防御性检查，防止数据库字段异常导致 reading 'id' 错误
      if (!user.id || !user.salt || !user.password_hash) {
         return Response.json({ error: "用户数据异常，请联系管理员" }, { status: 500 });
      }

      const hash = await hashPassword(password, user.salt);
      if (hash !== user.password_hash) return Response.json({ error: "用户不存在或密码错误" }, { status: 401 });

      const token = btoa(`${user.id}:${uuidv4()}`);
      
      let finalRole = user.role;
      if (env.SUPER_USER && username === env.SUPER_USER) { finalRole = 'admin'; }

      return Response.json({ 
        success: true, 
        token, 
        user: { id: user.id, username: user.username, role: finalRole } 
      });
    }

    return Response.json({ error: "无效操作" }, { status: 400 });

  } catch (err) {
    // 捕获所有后端 JS 错误，返回给前端以便 Alert 显示
    return Response.json({ error: `Server Error: ${err.message}` }, { status: 500 });
  }
}
