/* ============================================================
   _middleware.js —— 所有同步接口的统一"门卫"
   ------------------------------------------------------------
   这个文件会在 /api/ping、/api/pull、/api/push 每个请求到达前
   先跑一遍，负责两件事：
   1. 拦截浏览器发来的"预检请求"（OPTIONS），直接应答；
   2. 给响应补上跨域许可头（CORS）——但只放行白名单里的来源。
   白名单在 Cloudflare 后台用环境变量 ALLOWED_ORIGINS 配置，
   多个来源用英文逗号隔开，例如：
     ALLOWED_ORIGINS="https://你的项目.pages.dev,http://localhost:8080"
   说明：前端页面和 /api 接口通常部署在同一个域名下（同源），
   同源请求本来就不需要 CORS 头，不受本文件影响；
   没配置白名单时不发放任何跨域许可，陌生网站无法借
   访客的浏览器来读写同步数据 —— 这是更安全的默认值。
   下划线开头的文件不会被当成网页页面，是 Cloudflare 的固定写法。
   ============================================================ */

export async function onRequest(context) {
  /* 请求来源（浏览器跨域请求会带 Origin 头；同源请求一般没有）
     统一去掉结尾斜杠、转小写，方便和白名单比对 */
  var origin = (context.request.headers.get('origin') || '').trim().replace(/\/+$/, '').toLowerCase();

  /* 把环境变量里的白名单拆成数组（同样去斜杠、转小写） */
  var allowList = [];
  if (context.env && context.env.ALLOWED_ORIGINS) {
    var parts = context.env.ALLOWED_ORIGINS.split(',');
    for (var i = 0; i < parts.length; i++) {
      var one = parts[i].trim().replace(/\/+$/, '').toLowerCase();
      if (one) allowList.push(one);
    }
  }

  /* 来源命中白名单才发放 CORS 头（回显具体来源，不用通配符 *） */
  var isAllowed = origin && allowList.indexOf(origin) >= 0;
  var cors = isAllowed ? {
    'Access-Control-Allow-Origin': origin,                     // 只许可命中的那一个来源
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',      // 允许的方法
    'Access-Control-Allow-Headers': 'Content-Type'              // 允许的自定义头
  } : {};

  /* 浏览器发的预检请求（OPTIONS）：白名单内的放行，白名单外的直接拒绝 */
  if (context.request.method === 'OPTIONS') {
    return new Response(null, { status: isAllowed ? 204 : 403, headers: cors });
  }

  /* 正常请求：先交给后面的接口处理，再把 CORS 头补到结果上 */
  var res = await context.next();
  if (!isAllowed) return res;                                  // 陌生来源：原样返回（不带跨域许可，浏览器会拦下跨域读取）
  var headers = new Headers(res.headers);                      // 复制原来的响应头
  for (var k in cors) headers.set(k, cors[k]);                 // 逐条补 CORS 头
  return new Response(res.body, { status: res.status, headers: headers });
}
