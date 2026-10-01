/* ============================================================
   ping.js —— 探活接口（GET /api/ping）
   ------------------------------------------------------------
   设置页的"测试服务器连接"按钮会请求这里，确认服务器活着。
   返回 needKey 告诉前端：服务器有没有要求同步密钥。
   ============================================================ */

import { json, VERSION } from '../_shared.js';

export async function onRequest(context) {
  /* 不回密钥校验（谁都能 ping），只报告服务器状态 */
  return json({
    ok: true,
    version: VERSION,                                        // 服务器版本号
    serverTime: Date.now(),                                  // 服务器当前时间（前端用来对齐水位）
    needKey: !!context.env.SYNC_KEY                          // 服务器设了密钥就是 true
  });
}