import type { SafeLogger } from './protocol.js';

/** 心跳文本，手机端收到后刷新存活时间。 */
export const KEEPALIVE_TEXT = JSON.stringify({ t: "ka" });
export const KEEPALIVE_INTERVAL_MS = 2000;

/** 一条已配对会话里与媒体通道相关的标识。 */
export interface MediaSession {
  sessionId: string;
  pcId: string;
  deviceId: string;
}

/** 解码进程方向的写出口；测试与生产共用同一接口。 */
export interface MediaSink {
  write(chunk: Buffer): void;
  end(): void;
}

/** 媒体连接需要的最小 socket 能力，便于单测替换。 */
export interface MediaSocket {
  on(event: string, handler: (...args: any[]) => void): unknown;
  close(code: number, reason: string): void;
  send?(payload: string): void;
}

export interface MediaRelayOptions {
  findSession: (sessionId: string) => MediaSession | null;
  openSink: (session: MediaSession, onDead: () => void) => MediaSink;
  log?: SafeLogger;
}

/**
 * 校验媒体连接的首条 JSON 绑定消息，对应 writer/plan.html §5.3。
 * 只有 pcId、deviceId、sessionId 与会话完全一致才放行。
 */
export function authorizeMediaHello(
  raw: string,
  findSession: (sessionId: string) => MediaSession | null,
): MediaSession | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const candidate = parsed as Record<string, unknown>;
  const { pcId, deviceId, sessionId } = candidate;
  if (typeof pcId !== 'string' || typeof deviceId !== 'string' || typeof sessionId !== 'string') return null;

  const session = findSession(sessionId);
  if (session === null) return null;
  if (session.pcId !== pcId || session.deviceId !== deviceId) return null;
  return session;
}

/**
 * 媒体连接处理器：首条文本消息做绑定，之后只接受二进制并原样转发。
 * 未绑定时收到二进制会被拒绝并关闭连接，保持控制通道原有的输入校验强度。
 */
export function createMediaRelay(options: MediaRelayOptions): { handle(socket: MediaSocket): void } {
  const { findSession, openSink, log } = options;

  return {
    handle(socket: MediaSocket): void {
      let sink: MediaSink | null = null;
      let closed = false;
      let keepalive: ReturnType<typeof setInterval> | null = null;
      const stopKeepalive = () => { if (keepalive !== null) { clearInterval(keepalive); keepalive = null; } };

      const closeSink = () => {
        stopKeepalive();
        if (sink !== null && !closed) {
          closed = true;
          sink.end();
        }
      };

      socket.on('message', (data: Buffer, isBinary: boolean) => {
        if (closed) return;

        if (sink === null) {
          if (isBinary) {
            log?.({ name: 'media_binary_before_bind', requestId: '', code: 'E_INPUT' });
            closed = true;
            socket.close(1008, 'media binding required');
            return;
          }
          const session = authorizeMediaHello(data.toString('utf8'), findSession);
          if (session === null) {
            log?.({ name: 'media_bind_rejected', requestId: '', code: 'E_INPUT' });
            closed = true;
            socket.close(1008, 'media binding rejected');
            return;
          }
          // 心跳：手机侧靠它判断链路是否还活着（debugger/debug-004-fix.html）
          keepalive = setInterval(() => {
            if (!closed) socket.send?.(KEEPALIVE_TEXT);
          }, KEEPALIVE_INTERVAL_MS);
          // 保活定时器不该单独把进程钉住：生产的进程由服务器 socket 保活，
          // 而单测里没有其它句柄时，未 unref 的定时器会让测试进程永不退出。
          keepalive.unref();
          sink = openSink(session, () => {
            // 出口（解码进程）断开：关闭手机侧连接，让手机按重连策略重建
            if (!closed) {
              closed = true;
              stopKeepalive();
              log?.({ name: "media_upstream_lost", requestId: session.sessionId, code: null });
              socket.close(1011, "upstream lost");
            }
          });
          log?.({ name: 'media_bound', requestId: session.sessionId, code: null });
          return;
        }

        if (isBinary) sink.write(Buffer.from(data));
      });

      socket.on('close', () => closeSink());
      socket.on('error', () => closeSink());
    },
  };
}
