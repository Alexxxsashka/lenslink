import Peer, {
  type DataConnection,
  type MediaConnection,
  type PeerOptions,
} from "peerjs";
import { defaultEffects, sanitizeEffects } from "./protocol.js";

export type Network = {
  host?: string;
  port?: number;
  path?: string;
  secure?: boolean;
  iceServers?: RTCIceServer[];
};
export function readNetwork(): Network {
  let saved: Network = {};
  try {
    saved = JSON.parse(localStorage.getItem("lenslink-network") || "{}");
  } catch {
    /* Use defaults if storage is unavailable. */
  }
  const p = new URLSearchParams(location.hash.slice(1));
  if (p.has("host")) {
    const host = p.get("host")!;
    if (!/^[a-zA-Z0-9.\-]+$/.test(host))
      throw new Error("Некорректный адрес сигналинга.");
    saved = {
      ...saved,
      host,
      port: Number(p.get("port") || 443),
      path: p.get("path") || "/peerjs",
      secure: p.get("secure") !== "false",
    };
  }
  return saved;
}
function options(network: Network): PeerOptions {
  return {
    debug: 0,
    ...(network.host
      ? {
          host: network.host,
          port: network.port || 443,
          path: network.path || "/peerjs",
          secure: network.secure !== false,
        }
      : {}),
    config: {
      iceServers: network.iceServers?.length
        ? network.iceServers
        : [
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "stun:stun.cloudflare.com:3478" },
          ],
    },
  };
}
export class Link {
  peer?: Peer;
  channel?: DataConnection;
  call?: MediaConnection;
  private clients = new Map<
    string,
    { data: DataConnection; call?: MediaConnection; control: boolean }
  >();
  private retry?: ReturnType<typeof setTimeout>;
  private closed = false;
  private stream?: MediaStream;
  effects = { ...defaultEffects };
  onstream = (stream: MediaStream) => {};
  onstate = (state: any) => {};
  onstatus = (text: string, live: boolean) => {};
  onerror = (text: string) => {};
  oncommand = async (command: any) => {};
  constructor(
    private room: string,
    private key: string | null,
    private network: Network,
    private camera = false,
  ) {}
  async open(stream?: MediaStream) {
    this.closed = false;
    this.stream = stream;
    this.peer = this.camera
      ? new Peer(`lenslink-${this.room}`, options(this.network))
      : new Peer(options(this.network));
    this.peer.on("error", (err) => {
      if (this.closed) return;
      if (!this.camera && err.type === "peer-unavailable") {
        this.onstatus("Ожидаем телефон", false);
        this.schedule();
      } else
        this.onerror(
          err.type === "unavailable-id"
            ? "Эта камера уже открыта в другой вкладке. Закройте её и повторите."
            : `Ошибка WebRTC (${err.type}). Проверьте сеть и настройки TURN.`,
        );
    });
    this.peer.on("disconnected", () => {
      if (!this.closed) {
        this.onstatus("Восстанавливаем сигналинг…", false);
        clearTimeout(this.retry);
        this.retry = setTimeout(() => {
          if (!this.closed && !this.peer?.destroyed) this.peer?.reconnect();
        }, 2000);
      }
    });
    this.peer.on("open", () => {
      if (this.camera) this.onstatus("Камера готова · ждём компьютер", false);
      else this.subscribe();
    });
    this.peer.on("call", (call) => {
      if (this.camera || call.peer !== `lenslink-${this.room}`) {
        call.close();
        return;
      }
      this.call?.close();
      this.call = call;
      call.answer();
      call.on("stream", (stream) => {
        this.onstream(stream);
        this.onstatus("Камера подключена", true);
      });
      call.on("close", () => {
        if (this.call === call && !this.closed) {
          this.onstatus("Поток прерван · переподключаемся", false);
          this.schedule();
        }
      });
      call.on("error", () => {
        this.onstatus("Не удалось получить видео. Проверьте TURN.", false);
        this.schedule();
      });
    });
    this.peer.on("connection", (data) => {
      if (
        !this.camera ||
        !this.stream ||
        this.clients.size >= 4 ||
        data.metadata?.room !== this.room
      ) {
        data.close();
        return;
      }
      const control = !!this.key && data.metadata?.key === this.key;
      const client = {
        data,
        control,
        call: undefined as MediaConnection | undefined,
      };
      this.clients.set(data.peer, client);
      data.on("open", () => {
        this.sendState();
        client.call = this.peer!.call(data.peer, this.stream!);
        client.call.on("error", () =>
          this.onerror(
            "Не удалось передать видео. Для другой сети настройте TURN.",
          ),
        );
        this.onstatus(`Передача · ${this.clients.size} получ.`, true);
      });
      data.on("data", async (raw) => {
        const msg = raw as any;
        if (msg?.type === "ping") {
          data.send({ type: "pong", time: msg.time });
          return;
        }
        if (
          !control ||
          !msg ||
          msg.type !== "command" ||
          typeof msg.command !== "object"
        )
          return;
        try {
          const c = msg.command;
          if (c.action === "effects") {
            this.effects = sanitizeEffects(c.effects);
            this.sendState();
          } else if (
            ["capture", "flip", "mic", "torch", "zoom", "stop"].includes(
              c.action,
            )
          )
            await this.oncommand(c);
        } catch (err) {
          data.send({
            type: "error",
            message:
              err instanceof Error
                ? err.message
                : "Не удалось применить настройку.",
          });
        }
      });
      data.on("close", () => {
        if (this.clients.get(data.peer) !== client) return;
        client.call?.close();
        this.clients.delete(data.peer);
        this.onstatus(
          this.clients.size
            ? `Передача · ${this.clients.size} получ.`
            : "Камера готова · ждём компьютер",
          this.clients.size > 0,
        );
      });
      data.on("error", () => data.close());
    });
  }
  private subscribe() {
    if (this.closed || !this.peer?.open || this.camera) return;
    if (this.channel?.open) return;
    this.channel?.close();
    const data = this.peer.connect(`lenslink-${this.room}`, {
      reliable: true,
      serialization: "json",
      metadata: { room: this.room, key: this.key },
    });
    this.channel = data;
    data.on("open", () => this.onstatus("Соединяем видеопоток…", false));
    data.on("data", (raw) => {
      const msg = raw as any;
      if (msg?.type === "state") this.onstate(msg);
      if (msg?.type === "error")
        this.onerror(String(msg.message).slice(0, 300));
    });
    data.on("close", () => {
      if (this.channel === data && !this.closed) {
        this.onstatus("Ожидаем телефон", false);
        this.schedule();
      }
    });
    data.on("error", () => {
      if (!this.closed) this.schedule();
    });
    clearTimeout(this.retry);
    this.retry = setTimeout(() => {
      if (!data.open) {
        data.close();
        this.subscribe();
      }
    }, 7000);
  }
  private schedule() {
    clearTimeout(this.retry);
    this.retry = setTimeout(() => {
      this.channel?.close();
      this.channel = undefined;
      this.subscribe();
    }, 2500);
  }
  command(command: unknown) {
    if (!this.channel?.open) throw new Error("Сначала подключите телефон.");
    this.channel.send({ type: "command", command });
  }
  sendState(extra: Record<string, unknown> = {}) {
    const track = this.stream?.getVideoTracks()[0];
    for (const client of this.clients.values())
      if (client.data.open)
        client.data.send({
          type: "state",
          effects: this.effects,
          settings: track?.getSettings(),
          capabilities: track?.getCapabilities?.(),
          mic: this.stream?.getAudioTracks().some((t) => t.enabled),
          ...extra,
        });
  }
  async replaceStream(stream: MediaStream) {
    this.stream = stream;
    // Re-offer, including audio m-lines when a mic is enabled after video-only capture.
    for (const client of this.clients.values()) {
      const previous = client.call;
      client.call = this.peer!.call(client.data.peer, stream);
      setTimeout(() => previous?.close(), 1000);
    }
    this.sendState();
  }
  close() {
    this.closed = true;
    clearTimeout(this.retry);
    this.channel?.close();
    this.call?.close();
    this.clients.forEach((c) => {
      c.data.close();
      c.call?.close();
    });
    this.clients.clear();
    this.peer?.destroy();
  }
}
