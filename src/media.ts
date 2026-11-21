import {
  defaultEffects,
  sanitizeEffects,
  applyCube,
  parseCube,
} from "./protocol.js";

export class VideoPipeline {
  canvas = document.createElement("canvas");
  private ctx = this.canvas.getContext("2d", { willReadFrequently: true })!;
  private layer = document.createElement("canvas");
  private maskCanvas = document.createElement("canvas");
  private segmenter: any;
  private detector: any;
  private initializing?: Promise<void>;
  private mask?: ImageData;
  private crop = { x: 0.5, y: 0.5 };
  private frame = 0;
  private last = -1;
  private raf = 0;
  private running = false;
  private lut?: ReturnType<typeof parseCube>;
  effects = { ...defaultEffects };
  fps = 30;
  constructor(
    private video: HTMLVideoElement,
    private notice: (s: string) => void,
  ) {
    this.canvas.setAttribute("aria-label", "Видеопоток камеры");
    this.canvas.width = 1920;
    this.canvas.height = 1080;
  }
  async update(value: unknown) {
    this.effects = sanitizeEffects(value);
    if (
      (this.effects.background !== "none" || this.effects.tracking) &&
      !this.initializing
    ) {
      this.initializing = this.initAI().finally(() => {
        this.initializing = undefined;
      });
    }
    await this.initializing;
  }
  private async initAI() {
    try {
      this.notice("Загружаем локальную обработку видео…");
      const { FilesetResolver, ImageSegmenter, FaceDetector } = await import(
        "@mediapipe/tasks-vision"
      );
      const wasm = await FilesetResolver.forVisionTasks("/wasm");
      if (this.effects.background !== "none" && !this.segmenter)
        this.segmenter = await ImageSegmenter.createFromOptions(wasm, {
          baseOptions: {
            modelAssetPath: "/models/selfie_segmenter.tflite",
            delegate: "CPU",
          },
          runningMode: "VIDEO",
          outputCategoryMask: true,
          outputConfidenceMasks: false,
        });
      if (this.effects.tracking && !this.detector)
        this.detector = await FaceDetector.createFromOptions(wasm, {
          baseOptions: {
            modelAssetPath: "/models/blaze_face_short_range.tflite",
            delegate: "CPU",
          },
          runningMode: "VIDEO",
          minDetectionConfidence: 0.6,
        });
      this.notice(
        "Обработка выполняется на этом устройстве. С эффектами выход ограничен 720p.",
      );
    } catch {
      this.effects.background = "none";
      this.effects.tracking = false;
      this.notice(
        "Не удалось загрузить модель. Эффекты фона и лица отключены; видео продолжает работать.",
      );
    }
  }
  setLut(text?: string) {
    this.lut = text ? parseCube(text) : undefined;
  }
  start() {
    if (!this.running) {
      this.running = true;
      this.draw(performance.now());
    }
  }
  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }
  destroy() {
    this.stop();
    this.segmenter?.close();
    this.detector?.close();
  }
  private draw = (now: number) => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.draw);
    if (this.video.readyState < 2 || this.video.currentTime === this.last)
      return;
    this.last = this.video.currentTime;
    try {
      const v = this.video,
        e = this.effects;
      const ai = e.background !== "none" || e.tracking;
      const scale = Math.min(1, (ai || this.lut ? 1280 : 3840) / v.videoWidth);
      const w = Math.round(v.videoWidth * scale),
        h = Math.round(v.videoHeight * scale);
      if (this.canvas.width !== w || this.canvas.height !== h) {
        this.canvas.width = w;
        this.canvas.height = h;
        this.layer.width = w;
        this.layer.height = h;
      }
      const ctx = this.ctx;
      let sx = 0,
        sy = 0,
        sw = v.videoWidth,
        sh = v.videoHeight;
      if (e.tracking && this.detector) {
        if (this.frame % 4 === 0) {
          const box = this.detector.detectForVideo(v, now).detections[0]
            ?.boundingBox;
          if (box) {
            this.crop.x +=
              ((box.originX + box.width / 2) / sw - this.crop.x) * 0.25;
            this.crop.y +=
              ((box.originY + box.height / 2) / sh - this.crop.y) * 0.25;
          }
        }
        sw /= 1.35;
        sh /= 1.35;
        sx = Math.max(
          0,
          Math.min(v.videoWidth - sw, this.crop.x * v.videoWidth - sw / 2),
        );
        sy = Math.max(
          0,
          Math.min(v.videoHeight - sh, this.crop.y * v.videoHeight - sh / 2),
        );
      }
      ctx.save();
      ctx.clearRect(0, 0, w, h);
      if (e.mirror) {
        ctx.translate(w, 0);
        ctx.scale(-1, 1);
      }
      const preset =
        e.preset === "mono"
          ? " grayscale(1)"
          : e.preset === "cinema"
            ? " contrast(1.12) saturate(.8)"
            : e.preset === "warm"
              ? " sepia(.22)"
              : "";
      ctx.filter = `brightness(${e.brightness}%) contrast(${e.contrast}%) saturate(${e.saturation}%) sepia(${e.warmth}%)${preset}`;
      ctx.drawImage(v, sx, sy, sw, sh, 0, 0, w, h);
      ctx.restore();
      if (e.background !== "none" && this.segmenter) {
        if (this.frame % 3 === 0 || !this.mask)
          this.segmenter.segmentForVideo(v, now, (result: any) => {
            const m = result.categoryMask;
            if (!m) return;
            const raw = m.getAsUint8Array();
            this.mask = new ImageData(m.width, m.height);
            for (let i = 0; i < raw.length; i++) {
              this.mask.data[i * 4] = 255;
              this.mask.data[i * 4 + 1] = 255;
              this.mask.data[i * 4 + 2] = 255;
              this.mask.data[i * 4 + 3] = raw[i] === 0 ? 0 : 255;
            }
          });
        if (this.mask) {
          const layer = this.layer.getContext("2d")!;
          layer.clearRect(0, 0, w, h);
          layer.drawImage(this.canvas, 0, 0);
          this.maskCanvas.width = this.mask.width;
          this.maskCanvas.height = this.mask.height;
          this.maskCanvas.getContext("2d")!.putImageData(this.mask, 0, 0);
          layer.globalCompositeOperation = "destination-in";
          layer.save();
          if (e.mirror) {
            layer.translate(w, 0);
            layer.scale(-1, 1);
          }
          layer.drawImage(
            this.maskCanvas,
            (sx / v.videoWidth) * this.mask.width,
            (sy / v.videoHeight) * this.mask.height,
            (sw / v.videoWidth) * this.mask.width,
            (sh / v.videoHeight) * this.mask.height,
            0,
            0,
            w,
            h,
          );
          layer.restore();
          layer.globalCompositeOperation = "source-over";
          ctx.clearRect(0, 0, w, h);
          if (e.background === "blur") {
            ctx.save();
            ctx.filter = "blur(18px)";
            ctx.drawImage(v, sx, sy, sw, sh, -24, -24, w + 48, h + 48);
            ctx.restore();
          } else {
            ctx.fillStyle = e.color;
            ctx.fillRect(0, 0, w, h);
          }
          ctx.drawImage(this.layer, 0, 0);
        }
      }
      if (this.lut) {
        const pixels = ctx.getImageData(0, 0, w, h);
        applyCube(pixels.data, this.lut);
        ctx.putImageData(pixels, 0, 0);
      }
      this.frame++;
    } catch {
      this.notice("Обработка кадра прервана. Сложные эффекты отключены.");
      this.effects.background = "none";
      this.effects.tracking = false;
      this.lut = undefined;
    }
  };
}

export class Recorder {
  private recorder?: MediaRecorder;
  private chunks: Blob[] = [];
  private bytes = 0;
  private timeout?: ReturnType<typeof setTimeout>;
  private output?: MediaStream;
  start(
    pipeline: VideoPipeline,
    source: MediaStream,
    done: (blob: Blob) => void,
    error: (s: string) => void,
  ) {
    if (!("MediaRecorder" in window) || !pipeline.canvas.captureStream)
      throw new Error(
        "Запись не поддерживается этим браузером. Используйте OBS.",
      );
    const mime = [
      "video/mp4;codecs=avc1,mp4a.40.2",
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/mp4",
      "video/webm",
    ].find((t) => MediaRecorder.isTypeSupported(t));
    const output = pipeline.canvas.captureStream(pipeline.fps);
    this.output = output;
    source.getAudioTracks().forEach((t) => output.addTrack(t.clone()));
    this.recorder = new MediaRecorder(output, {
      ...(mime ? { mimeType: mime } : {}),
      videoBitsPerSecond: 12_000_000,
    });
    this.chunks = [];
    this.bytes = 0;
    this.recorder.ondataavailable = (e) => {
      if (e.data.size) {
        this.chunks.push(e.data);
        this.bytes += e.data.size;
      }
      if (this.bytes > 512 * 1024 * 1024) {
        error("Достигнут лимит 512 МБ. Запись сохранена.");
        this.stop();
      }
    };
    this.recorder.onerror = () => {
      error("Ошибка записи. Доступные данные будут сохранены.");
      this.stop();
    };
    this.recorder.onstop = () => {
      const blob = new Blob(this.chunks, { type: this.recorder!.mimeType });
      this.chunks = [];
      output.getTracks().forEach((t) => t.stop());
      this.output = undefined;
      clearTimeout(this.timeout);
      done(blob);
    };
    this.recorder.start(1000);
    this.timeout = setTimeout(
      () => {
        error("Достигнут лимит записи 30 минут.");
        this.stop();
      },
      30 * 60 * 1000,
    );
  }
  stop() {
    if (this.recorder?.state === "recording") this.recorder.stop();
  }
  get active() {
    return this.recorder?.state === "recording";
  }
  destroy() {
    this.stop();
    this.output?.getTracks().forEach((t) => t.stop());
  }
}
