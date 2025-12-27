// 生成 UUID
function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// 密码加密工具 (PBKDF2 简易实现或加盐 SHA-256)
async function hashPassword(password, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw", enc.encode(password + salt), { name: "PBKDF2" }, false, ["deriveBits", "deriveKey"]
  );
  // 这里为了演示代码简洁性，使用 SHA-256 加盐哈希 (生产环境建议用更复杂的 PBKDF2)
  const msgBuffer = enc.encode(password + salt);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// 处理请求
export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  
  // 仅支持 POST
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  const body = await request.json();
  const { action, username, password } = body;

  if (!username || !password) return Response.json({ error: "请输入账号和密码" }, { status: 400 });

  // === 注册逻辑 ===
  if (action === 'register') {
    // 检查用户是否存在
    const existing = await env.BNBD.prepare("SELECT id FROM users WHERE username = ?").bind(username).first();
    if (existing) return Response.json({ error: "用户名已存在" }, { status: 409 });

    const salt = uuidv4(); // 生成随机盐
    const hash = await hashPassword(password, salt);
    const userId = uuidv4();

    await env.BNBD.prepare("INSERT INTO users (id, username, password_hash, salt) VALUES (?, ?, ?, ?)")
      .bind(userId, username, hash, salt).run();

    return Response.json({ success: true, message: "注册成功，请登录" });
  }

  // === 登录逻辑 ===
  if (action === 'login') {
    const user = await env.BNBD.prepare("SELECT * FROM users WHERE username = ?").bind(username).first();
    if (!user) return Response.json({ error: "用户不存在或密码错误" }, { status: 401 });

    const hash = await hashPassword(password, user.salt);
    if (hash !== user.password_hash) {
      return Response.json({ error: "用户不存在或密码错误" }, { status: 401 });
    }

    // 生成简易 Token (实际生产建议使用 JWT 库，这里为了零依赖，生成一个包含 user_id 的 Base64 字符串)
    // 格式: user_id:random_string (简单做法)
    const token = btoa(`${user.id}:${uuidv4()}`); 
    
    // 注意：真实生产环境应该把 Session 存入 KV 或数据库，这里为了简化，
    // 前端传回这个 Token 时，我们只解析前面的 ID。
    // *为了更安全，你可以结合 Cloudflare KV 存储 Session*，但在本方案中，
    // 我们信任前端传来的 ID (前提是 HTTPS)，或者你可以加上签名逻辑。
    // 为了代码能直接运行且比明文安全，我们暂时只返回 ID 和 用户名。
    
    return Response.json({ 
      success: true, 
      token: token, // 这里的 Token 只是个标识
      user: { id: user.id, username: user.username } 
    });
  }

  return Response.json({ error: "未知操作" }, { status: 400 });
}