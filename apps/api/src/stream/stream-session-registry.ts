import { TTSError, type TTSStreamSession } from "@tts-platform/core";
import type { TTSPreparedStreamSession } from "../facade/tts-facade";

export interface StoredStreamSession extends TTSPreparedStreamSession {
  session: TTSStreamSession & {
    url: string;
  };
  createdAt: string;
  consumedAt?: string;
}

// StreamSessionRegistry: 负责保存已 plan 但尚未通过下游 WebSocket 消费的 stream session。
export class StreamSessionRegistry {
  private readonly sessions = new Map<string, StoredStreamSession>();

  // save: 入参为已准备好的 stream session 和下游 URL；输出可返回给客户端的 session 记录。
  save(prepared: TTSPreparedStreamSession, url: string): StoredStreamSession {
    const record: StoredStreamSession = {
      ...prepared,
      session: {
        ...prepared.session,
        url
      },
      createdAt: new Date().toISOString()
    };
    this.sessions.set(record.session.sessionId, record);
    return record;
  }

  // consume: 入参为 sessionId；输出并标记一次性消费的 stream session。
  consume(sessionId: string): StoredStreamSession {
    const record = this.sessions.get(sessionId);
    if (record === undefined) {
      throw new TTSError(`Stream session '${sessionId}' was not found.`, "invalid_request", 404);
    }
    if (record.consumedAt !== undefined) {
      throw new TTSError(`Stream session '${sessionId}' was already consumed.`, "invalid_request", 409);
    }
    record.consumedAt = new Date().toISOString();
    return record;
  }

  // delete: 入参为 sessionId；功能是移除已完成或失败的 stream session。
  delete(sessionId: string): void {
    this.sessions.delete(sessionId);
  }
}
