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
  const body = await request.json();
  const { action, username, password, inviteCode } = body;

  if (!username || !password) return Response.json({ error: "账号密码不能为空" }, { status: 400 });

  // === 注册逻辑 ===
  if (action === 'register') {
    // 1. 验证邀请码 (必填)
    const correctCode = env.INVITE_CODE; 
    if (!correctCode) return Response.json({ error: "系统未配置邀请码，禁止注册" }, { status: 500 });
    if (inviteCode !== correctCode) return Response.json({ error: "邀请码错误" }, { status: 403 });

    // 2. 检查重名
    const existing = await env.BNBD.prepare("SELECT id FROM users WHERE username = ?").bind(username).first();
    if (existing) return Response.json({ error: "用户名已存在" }, { status: 409 });

    // 3. ★核心逻辑：决定用户角色
    // 如果注册的用户名 == 后台配置的 SUPER_USER，直接写入 admin
    let role = 'user';
    if (env.SUPER_USER && username === env.SUPER_USER) {
        role = 'admin';
    }

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
    if (!user) return Response.json({ error: "用户不存在或密码错误" }, { status: 401 });

    const hash = await hashPassword(password, user.salt);
    if (hash !== user.password_hash) return Response.json({ error: "用户不存在或密码错误" }, { status: 401 });

    const token = btoa(`${user.id}:${uuidv4()}`);
    
    // 双重保险：即使数据库里存的是 user，如果名字对上了 SUPER_USER，也临时给 admin
    // 这样方便你在不修改数据库的情况下也能通过修改环境变量来提权
    let finalRole = user.role;
    if (env.SUPER_USER && username === env.SUPER_USER) {
        finalRole = 'admin'; 
    }

    return Response.json({ 
      success: true, 
      token, 
      user: { id: user.id, username: user.username, role: finalRole } 
    });
  }

  return Response.json({ error: "无效操作" }, { status: 400 });
}