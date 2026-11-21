import "./style.css";
import QRCode from "qrcode";
import {
  createIcons,
  Camera,
  Monitor,
  Radio,
  Settings,
  CircleHelp,
  Github,
  Link2,
  Copy,
  RefreshCw,
  Maximize,
  Mic,
  Video,
  Square,
  ScanLine,
  SwitchCamera,
  Download,
  ArrowUpRight,
  SlidersHorizontal,
  X,
  ShieldCheck,
  Wifi,
  Aperture,
} from "lucide";
import { Link, readNetwork, type Network } from "./connection";
import { VideoPipeline, Recorder } from "./media";
import {
  defaultEffects,
  makeLink,
  parseLink,
  randomToken,
  sanitizeEffects,
} from "./protocol.js";

const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const icons = () =>
  createIcons({
    icons: {
      Camera,
      Monitor,
      Radio,
      Settings,
      CircleHelp,
      Github,
      Link2,
      Copy,
      RefreshCw,
      Maximize,
      Mic,
      Video,
      Square,
      ScanLine,
      SwitchCamera,
      Download,
      ArrowUpRight,
      SlidersHorizontal,
      X,
      ShieldCheck,
      Wifi,
      Aperture,
    },
  });
const icon = (name: string) =>
  `<i data-lucide="${name}" aria-hidden="true"></i>`;
let toastTimer: ReturnType<typeof setTimeout>;
function toast(message: string) {
  $("toast").textContent = message;
  $("toast").classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("toast").classList.remove("visible"), 6500);
}
function error(e: unknown) {
  toast(e instanceof Error ? e.message : String(e));
}
function on(id: string, fn: (event: Event) => unknown, event = "click") {
  $(id)?.addEventListener(event, (e) => {
    try {
      Promise.resolve(fn(e)).catch(error);
    } catch (err) {
      error(err);
    }
  });
}
const escape = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
async function bootstrap() {
  let config: ReturnType<typeof parseLink>;
  try {
    config = parseLink(location.hash);
  } catch (e) {
    $("app").innerHTML =
      `<main class="fatal"><h1>Не удалось открыть комнату</h1><p>${escape((e as Error).message)}</p><a href="/">Открыть новую студию</a></main>`;
    return;
  }
  const mode = config.mode;
  const camera = mode === "camera",
    clean = mode === "view",
    dock = mode === "dock";
  let room = config.room || randomToken(),
    key = config.key || (mode === "studio" ? randomToken() : null);
  let network: Network;
  try {
    network = readNetwork();
  } catch (e) {
    network = {};
    toast((e as Error).message);
  }
  let link: Link;
  let stream: MediaStream | undefined;
  let sourceVideo = document.createElement("video");
  sourceVideo.muted = true;
  sourceVideo.playsInline = true;
  sourceVideo.autoplay = true;
  let pipeline = new VideoPipeline(sourceVideo, toast);
  const recorder = new Recorder();
  let effects = { ...defaultEffects };
  let facing = "environment",
    requestedHeight = 1080,
    requestedFps = 30,
    mic = true,
    busy = false,
    live = false;
  let wakeLock: WakeLockSentinel | undefined;
  let recordingStart = 0,
    statsTimer: ReturnType<typeof setInterval>,
    recordingUrl: string | undefined;
  let statsBytes = 0,
    statsTime = 0;
  const studioTabs = [
    ["studio", "monitor", "Студия"],
    ["outputs", "radio", "Выходы"],
    ["network", "settings", "Соединение"],
    ["help", "circle-help", "Руководство"],
  ];

  function render() {
    document.body.classList.toggle("clean", clean);
    document.body.classList.toggle("phone", camera);
    document.body.classList.toggle("dock", dock);
    $("app").innerHTML = `
 ${!clean && !camera && !dock ? `<aside class="sidebar"><a class="brand" href="/" aria-label="Lenslink — новая студия"><span class="brandmark" aria-hidden="true"></span>lenslink<span class="version">beta</span></a><div class="workspace">Личная студия<span>Камера из вашего кармана</span></div><nav aria-label="Основная навигация">${studioTabs.map(([id, i, label]) => `<button id="nav-${id}" class="nav ${id === "studio" ? "active" : ""}" ${id === "studio" ? 'aria-current="page"' : ""}>${icon(i)}${label}</button>`).join("")}</nav><div class="sidebar-bottom"><a href="https://github.com/Alexxxsashka/lenslink" target="_blank" rel="noopener noreferrer">${icon("github")}Исходный код${icon("arrow-up-right")}</a><div class="opensource">MIT · Open source<br><span>Без установки на телефон</span></div></div></aside>` : ""}
 <div class="shell">
 ${!clean ? `<header class="topbar"><div class="breadcrumb">${camera ? icon("camera") : '<span class="crumb-dot"></span>'}<span>${camera ? "Lenslink / Камера телефона" : dock ? "Lenslink / OBS Dock" : "Lenslink / Веб-студия"}</span></div><div class="top-actions"><span id="connection-status" class="status" role="status">${camera ? "Камера выключена" : "Ожидаем телефон"}</span>${!camera && !dock ? '<button id="new-session" class="small">Новая сессия</button>' : ""}</div></header>` : ""}
 <main id="main">
 <section id="page-studio" class="page">
 ${!clean ? `<div class="title-row"><div><h1>${camera ? "Ваша камера. В эфире." : dock ? "Управление камерой" : "Камера телефона — в студии"}</h1><p>${camera ? "Разрешите камеру и оставьте эту страницу открытой." : dock ? "Параметры передаются на подключённый телефон." : "Подключите телефон. Настройте кадр. Начните запись."}</p></div>${!camera && !dock ? `<button id="open-outputs" class="secondary">${icon("radio")}Подключить к OBS${icon("arrow-up-right")}</button>` : ""}</div>` : ""}
 <div class="studio-grid">
 <div class="main-column">
 <section class="preview-panel" aria-label="Предпросмотр камеры">
 ${!clean ? `<div class="preview-heading"><span>${icon("video")}<span id="source-name">${camera ? "Камера телефона" : "Видеопредпросмотр"}</span></span><span id="preview-badge">${camera ? "Не передаёт" : "Нет сигнала"}</span></div>` : ""}
 <div id="stage" class="stage">
 <div id="video-mount"></div>
 <div id="empty" class="empty">
 ${camera ? `<div class="empty-icon">${icon("aperture")}</div><h2>Готовы к крупному плану?</h2><p>Камера и микрофон включаются только<br>после вашего разрешения.</p><button id="start-camera" class="primary">${icon("camera")}Включить камеру</button><span class="fine">Safari на iPhone · Chrome на Android</span>` : clean ? '<p>Ожидаем камеру телефона…</p><button id="retry-view" class="secondary">Переподключить</button>' : `<div class="qr-frame"><canvas id="pair-qr" aria-label="QR-код для подключения камеры телефона"></canvas></div><h2>Начните с телефона</h2><p>Отсканируйте QR-код камерой телефона.<br>Откройте ссылку и разрешите доступ к камере.</p><button id="copy-phone" class="text-button">${icon("copy")}Скопировать ссылку телефона</button><span class="fine">Ссылка даёт доступ к этой сессии. Делитесь только со своими устройствами.</span>`}
 </div>
 ${!clean ? '<div class="stage-corner top-left"></div><div class="stage-corner top-right"></div><div class="stage-corner bottom-left"></div><div class="stage-corner bottom-right"></div>' : ""}
 </div>
 ${!clean ? `<div class="preview-toolbar"><div class="toolbar-left"><button id="monitor-audio" class="icon-button" aria-label="Включить прослушивание звука" aria-pressed="false">${icon("mic")}</button><span id="audio-state">${camera ? "Микрофон включён" : "Прослушивание выключено"}</span></div><div><button id="fullscreen" class="icon-button" aria-label="На весь экран">${icon("maximize")}</button></div></div>` : '<button id="clean-audio" class="clean-audio" hidden>Включить звук</button>'}
 </section>
 ${
   !clean
     ? `<div class="transport"><div class="transport-state"><span class="signal-dot" id="signal-dot"></span><div><strong id="transport-title">${camera ? "Камера выключена" : "Готово к подключению"}</strong><span id="transport-note">${camera ? "Начните передачу с этого телефона" : "Видео появится здесь после подключения телефона"}</span></div></div><div class="transport-buttons">${camera ? `<button id="flip-camera" class="secondary" disabled>${icon("switch-camera")}Сменить</button><button id="stop-camera" class="secondary danger" disabled>${icon("square")}Стоп</button>` : `<span id="record-time" class="time">00:00:00</span><button id="record" class="primary" disabled><span class="record-dot"></span>Записать</button>`}</div></div>
 <dl class="telemetry"><div><dt>Разрешение</dt><dd id="stat-resolution">—</dd></div><div><dt>Кадров / с</dt><dd id="stat-fps">—</dd></div><div><dt>Видеокодек</dt><dd id="stat-codec">—</dd></div><div><dt>Битрейт</dt><dd id="stat-bitrate">—</dd></div></dl>
 ${!camera ? `<section class="bottom-note"><div>${icon("shield-check")}<strong>Ваш кадр остаётся вашим</strong></div><p>WebRTC шифрует видео и звук между устройствами. Lenslink не загружает и не хранит записи на сервере.</p><a href="#" id="privacy-help">Как устроено соединение ${icon("arrow-up-right")}</a></section>` : `<div class="phone-note"><strong>Не блокируйте экран</strong><p>На iOS передача приостанавливается при сворачивании Safari. Для долгого эфира подключите питание.</p></div>`}`
     : ""
 }
 </div>
 ${
   !clean
     ? `<aside class="controls" aria-label="Настройки камеры">
 <section class="control-panel"><h2>${icon("sliders-horizontal")}Камера</h2><div class="field"><label for="resolution">Разрешение <span>Запрос</span></label><select id="resolution"><option value="720">HD · 1280 × 720</option><option value="1080" selected>Full HD · 1920 × 1080</option><option value="2160">4K · 3840 × 2160</option></select></div><div class="field"><label for="framerate">Частота кадров</label><select id="framerate"><option value="24">24 FPS</option><option value="30" selected>30 FPS</option><option value="60">60 FPS</option></select></div><div class="field"><label for="lens">Объектив</label><select id="lens"><option value="environment">Основная камера</option><option value="user">Фронтальная камера</option></select></div><label class="switch-row" for="mic-enabled"><span>Микрофон телефона</span><input type="checkbox" id="mic-enabled" checked></label><label class="switch-row" for="torch"><span>Фонарик</span><input type="checkbox" id="torch" disabled></label><div class="field zoom-field"><label for="zoom">Зум <output id="zoom-value">1×</output></label><input id="zoom" type="range" min="1" max="1" step="0.1" value="1" disabled></div><p class="field-note">4K / 60 FPS и фонарик доступны только при поддержке устройства. Фактические параметры — под видео.</p></section>
 ${
   !camera
     ? `<section class="control-panel"><h2>${icon("aperture")}Кадр и цвет</h2><div class="field"><label for="preset">Образ</label><select id="preset"><option value="natural">Естественный</option><option value="cinema">Кино</option><option value="mono">Монохром</option><option value="warm">Тёплый</option></select></div>${[
         ["brightness", "Экспозиция", 50, 150, 100],
         ["contrast", "Контраст", 50, 150, 100],
         ["saturation", "Насыщенность", 0, 200, 100],
       ]
         .map(
           ([id, label, min, max, value]) =>
             `<div class="field range-field"><label for="${id}">${label}<output id="${id}-value">${value}%</output></label><input type="range" id="${id}" min="${min}" max="${max}" value="${value}"></div>`,
         )
         .join(
           "",
         )}<label class="switch-row" for="mirror"><span>Отразить по горизонтали</span><input id="mirror" type="checkbox"></label><label class="switch-row" for="tracking"><span>Следить за лицом</span><input id="tracking" type="checkbox"></label><div class="field"><label for="background">Фон</label><select id="background"><option value="none">Без обработки</option><option value="blur">Размыть фон</option><option value="color">Заменить цветом</option></select></div><div class="field" id="color-field" hidden><label for="background-color">Цвет фона</label><input type="color" id="background-color" value="#292929"></div><details class="lut-details"><summary>Свой LUT-фильтр (.cube)</summary><p>Локально для этого получателя. С LUT выход ограничен 720p.</p><label class="file-label" for="lut-file">Загрузить .cube<input id="lut-file" type="file" accept=".cube"></label><button id="reset-lut" class="text-button">Убрать LUT</button></details><button id="reset-effects" class="text-button">Сбросить обработку</button><p class="field-note">Фон и отслеживание лица обрабатываются на компьютере, до 720p. Эффекты могут снижать FPS.</p></section>`
     : ""
 }
 </aside>`
     : ""
 }
 </div>
 </section>
 ${!camera && !clean && !dock ? outputsPage() + networkPage() + helpPage() : ""}
 </main>
 ${!clean ? `<footer><span>Lenslink · Open source camera studio</span><span>WebRTC · ${camera ? "Камера телефона" : "Без аккаунта и подписки"}</span></footer>` : ""}
 </div>
 <dialog id="new-dialog" aria-labelledby="new-title"><form method="dialog"><h2 id="new-title">Создать новую сессию?</h2><p>Текущая передача остановится, ссылки и QR-код будут заменены. Запись будет сохранена.</p><div class="dialog-actions"><button value="cancel" class="secondary">Отмена</button><button value="confirm" class="primary">Новая сессия</button></div></form></dialog>`;
    $("video-mount").append(pipeline.canvas, sourceVideo);
    sourceVideo.className = "source-video";
    icons();
    bind();
    if (!camera && !clean) drawQR();
  }

  function outputsPage() {
    return `<section id="page-outputs" class="page narrow" hidden><div class="title-row"><div><h1>Выходы</h1><p>Одна камера. Ваш привычный рабочий процесс.</p></div></div><section class="output-row"><div><h2>OBS Browser Source</h2><p>Чистое видео без интерфейса. Дополнительный получатель камеры телефона.</p></div><div class="output-body"><ol><li>В OBS: «Источники» → «+» → «Браузер».</li><li>Вставьте ссылку ниже. Установите 1920 × 1080 и 30 FPS (или размер вашего эфира).</li><li>Включите «Управлять аудио через OBS». Уберите «Отключать источник, когда он не виден».</li></ol><label for="obs-link">Ссылка источника (даёт доступ к видео)</label><div class="copy-field"><input id="obs-link" readonly><button id="copy-obs" class="icon-button" aria-label="Копировать ссылку OBS">${icon("copy")}</button></div><a id="open-view" target="_blank" rel="noopener noreferrer">Открыть чистый выход ${icon("arrow-up-right")}</a><p class="field-note">Звук включается автоматически, если OBS разрешает autoplay. При блокировке откройте «Взаимодействовать» и нажмите «Включить звук».</p></div></section><section class="output-row"><div><h2>Камера для видеозвонков</h2><p>Windows 11, macOS и Linux — через установленный OBS Studio.</p></div><div class="output-body"><ol><li>Добавьте Browser Source по инструкции выше.</li><li>В OBS нажмите «Запустить виртуальную камеру».</li><li>Выберите <strong>OBS Virtual Camera</strong> в Discord, Zoom, Telegram или браузере.</li></ol><p>Виртуальная камера OBS передаёт видео. Для звука выберите микрофон компьютера или настройте отдельный виртуальный аудиокабель.</p><a href="https://obsproject.com/kb/virtual-camera-guide" target="_blank" rel="noopener noreferrer">Инструкция OBS ${icon("arrow-up-right")}</a></div></section><section class="output-row"><div><h2>Управление внутри OBS</h2><p>Веб-панель, которую можно закрепить рядом со сценами.</p></div><div class="output-body"><p>OBS → «Док-панели» → «Пользовательские док-панели браузера». Назовите панель Lenslink и вставьте ссылку. Это веб-док, а не нативный плагин.</p><label for="dock-link">Ссылка управления (держите в секрете)</label><div class="copy-field"><input id="dock-link" readonly><button id="copy-dock" class="icon-button" aria-label="Копировать ссылку док-панели">${icon("copy")}</button></div><p class="field-note">Максимум 4 получателя одновременно, включая студию, источник и док. Каждый видеополучатель увеличивает исходящий трафик телефона.</p></div></section><section class="output-row"><div><h2>Запись на компьютер</h2><p>Видео с обработкой и звук телефона.</p></div><div class="output-body"><p>Нажмите «Записать» в студии. После остановки скачайте файл в формате, поддерживаемом браузером (WebM или MP4). Лимит одной записи: 30 минут или 512 МБ. Для длительной записи используйте OBS.</p><div id="downloads" class="downloads">Пока нет записей в этой вкладке.</div></div></section></section>`;
  }
  function networkPage() {
    return `<section id="page-network" class="page narrow" hidden><div class="title-row"><div><h1>Соединение</h1><p>Wi-Fi для быстрого старта. Свой сервер — для полного контроля.</p></div></div><section class="output-row"><div><h2>Сеть и сопряжение</h2><p>Откройте студию на компьютере и QR-код на телефоне. Страницы должны оставаться открытыми.</p></div><div class="output-body"><p>В одной Wi-Fi сети видео обычно передаётся напрямую. Интернет нужен для загрузки сайта и сигналинга PeerJS. Публичный сигналинг не гарантирует доступность.</p><p>USB работает как сетевое соединение через режим модема, если его поддерживают телефон и компьютер. Прямого доступа браузера к USB-камере iPhone нет.</p><p class="notice">Для разных сетей, VPN и строгих NAT нужен ваш TURN-сервер. Его адрес и временные учётные данные нужно указать отдельно на каждом устройстве.</p></div></section><form id="network-form"><section class="output-row"><div><h2>Собственная инфраструктура</h2><p>Необязательно. По умолчанию используется публичный сигналинг PeerJS и STUN Google / Cloudflare.</p></div><div class="output-body"><label for="peer-host">PeerServer hostname</label><input id="peer-host" placeholder="signal.example.com" autocomplete="off"><div class="two-fields"><div><label for="peer-port">Порт</label><input id="peer-port" type="number" min="1" max="65535" value="443"></div><div><label for="peer-path">Путь</label><input id="peer-path" value="/peerjs"></div></div><label for="ice-servers">ICE-серверы (JSON)</label><textarea id="ice-servers" rows="6" spellcheck="false" placeholder='[{"urls":"turn:turn.example.com:3478","username":"temporary-user","credential":"temporary-password"}]'></textarea><label class="switch-row" for="remember-network"><span>Запомнить настройки на этом устройстве</span><input id="remember-network" type="checkbox"></label><p class="field-note">Без этой опции настройки живут только до перезагрузки. При сохранении TURN-пароли хранятся в localStorage этого браузера. Используйте временные данные.</p><div class="inline-actions"><button class="primary" type="submit">Применить соединение</button><button class="text-button" id="reset-network" type="button">По умолчанию</button></div><p class="field-note">Перезапускает соединение текущей сессии. При смене сигналинга заново откройте QR-код на телефоне и обновите ссылку OBS. TURN-пароли в ссылки не включаются.</p></div></section></form></section>`;
  }
  function helpPage() {
    return `<section id="page-help" class="page narrow" hidden><div class="title-row"><div><h1>От телефона до эфира</h1><p>Как подключиться и что действительно умеет браузер.</p></div></div><div class="connection-path"><span>${icon("camera")}Телефон</span><span>→</span><span>${icon("wifi")}WebRTC</span><span>→</span><span>${icon("monitor")}Студия / OBS</span></div><section class="help-section"><h2>Первое подключение</h2><ol><li>Откройте эту страницу на компьютере. В студии появится QR-код.</li><li>Отсканируйте его на телефоне и откройте в Safari (iOS) или Chrome (Android).</li><li>Нажмите «Включить камеру» и разрешите доступ к камере и микрофону.</li><li>Оставьте телефон разблокированным. На компьютере появятся видео и фактические параметры потока.</li><li>Для OBS скопируйте ссылку во вкладке «Выходы».</li></ol></section><section class="help-section"><h2>Возможности и ограничения</h2><dl class="feature-list"><div><dt>Видео и микрофон</dt><dd>Передаются через WebRTC. Одновременно до 4 получателей.</dd></div><div><dt>До 4K / 60 FPS</dt><dd>Это запрос к камере, а не гарантия. Реальные параметры зависят от браузера, устройства, света и сети. С AI-эффектами или LUT выход ограничен 720p.</dd></div><div><dt>H.264 / H.265</dt><dd>Кодек согласуют браузеры. Аппаратное кодирование выбирает браузер. Lenslink не обещает H.265 или принудительное аппаратное ускорение; согласованный кодек показан под видео.</dd></div><div><dt>Фон и лицо</dt><dd>Локальные модели MediaPipe: размытие, замена фона цветом и плавное кадрирование лица. Скорость зависит от компьютера. Модели загружаются с этого сайта.</dd></div><div><dt>Цвет и LUT</dt><dd>Экспозиция, контраст, насыщенность, образы и 3D LUT .cube (размер 2–64). Пользовательский LUT применяется только в текущем получателе.</dd></div><div><dt>Системная камера</dt><dd>Через OBS Virtual Camera. Сайт не устанавливает устройство Windows и не подменяет список камер других сайтов.</dd></div><div><dt>OBS</dt><dd>Browser Source для видео и пользовательская веб-док-панель для управления. Собственного нативного плагина в этой версии нет.</dd></div><div><dt>USB</dt><dd>Только сеть через USB-модем. Не прямой USB-видеодрайвер.</dd></div></dl></section><section class="help-section"><h2>Если видео не появилось</h2><details><summary>Нет доступа к камере</summary><p>Откройте ссылку в Safari или Chrome, а не во встроенном браузере мессенджера. Проверьте разрешения сайта и закройте другие приложения камеры. Нужен HTTPS или localhost.</p></details><details><summary>Соединение есть, а видео нет</summary><p>Проверьте общую Wi-Fi сеть, отключите VPN для проверки. Если сеть блокирует WebRTC, настройте TURN на телефоне и компьютере. В публичной сети клиентская изоляция может мешать прямому соединению.</p></details><details><summary>Видео останавливается на iPhone</summary><p>Safari приостанавливает камеру в фоне и при блокировке. Держите вкладку активной и телефон на зарядке. Lenslink запрашивает удержание экрана, когда это поддерживается.</p></details><details><summary>Как настроить TURN на телефоне?</summary><p>На экране камеры откройте «Настроить сеть», вставьте JSON ICE-серверов. Изменения применяются при следующем включении камеры. Учётные данные не передаются через QR-код.</p></details><details><summary>Приватность</summary><p>Комната защищена случайной 192-битной ссылкой. Ссылка просмотра даёт доступ к видео и звуку, а QR-код и ссылка дока — также к управлению. Храните их в секрете. Сигналинг видит сетевые метаданные, но медиа передаётся с шифрованием WebRTC. TURN при настройке ретранслирует зашифрованный трафик. Записи остаются в памяти браузера до скачивания; обновление страницы удалит их. Сайт использует Google Fonts. Телеметрии и аккаунтов нет.</p></details></section></section>`;
  }

  function showPage(id: string) {
    for (const [name] of studioTabs) {
      $("page-" + name).hidden = name !== id;
      $("nav-" + name).classList.toggle("active", name === id);
      if (name === id) $("nav-" + name).setAttribute("aria-current", "page");
      else $("nav-" + name).removeAttribute("aria-current");
    }
    if (id === "outputs") updateLinks();
    window.scrollTo({ top: 0 });
    $("page-" + id)
      .querySelector("h1")
      ?.setAttribute("tabindex", "-1");
    ($("page-" + id).querySelector("h1") as HTMLElement)?.focus();
  }
  function url(type: string) {
    return makeLink(location.origin, type, room, key, network);
  }
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast("Ссылка скопирована");
    } catch {
      const d = document.createElement("dialog");
      d.innerHTML =
        '<form method="dialog"><h2>Скопируйте ссылку</h2><textarea readonly></textarea><button class="primary">Закрыть</button></form>';
      d.querySelector("textarea")!.value = value;
      document.body.append(d);
      d.showModal();
      d.querySelector("textarea")!.select();
      d.addEventListener("close", () => d.remove());
    }
  }
  function drawQR() {
    const canvas = $<HTMLCanvasElement>("pair-qr");
    if (canvas)
      QRCode.toCanvas(canvas, url("camera"), {
        width: 196,
        margin: 1,
        color: { dark: "#000000", light: "#ffffff" },
        errorCorrectionLevel: "M",
      }).catch(error);
    updateLinks();
  }
  function updateLinks() {
    if ($("obs-link")) {
      $<HTMLInputElement>("obs-link").value = url("view");
      $<HTMLInputElement>("dock-link").value = url("dock");
      $<HTMLAnchorElement>("open-view").href = url("view");
    }
  }
  function bind() {
    if (!camera && !clean && !dock) {
      for (const [id] of studioTabs) on("nav-" + id, () => showPage(id));
      on("open-outputs", () => showPage("outputs"));
      on("privacy-help", (e) => {
        e.preventDefault();
        showPage("help");
      });
      on("copy-obs", () => copy(url("view")));
      on("copy-dock", () => copy(url("dock")));
      on("new-session", () => $<HTMLDialogElement>("new-dialog").showModal());
      on(
        "new-dialog",
        () => {
          if ($<HTMLDialogElement>("new-dialog").returnValue === "confirm")
            resetSession();
        },
        "close",
      );
      bindNetwork();
    }
    on("copy-phone", () => copy(url("camera")));
    on("start-camera", () => startCamera());
    on("stop-camera", () => stopCamera());
    on("flip-camera", () => sendCapture("flip"));
    on("retry-view", () => connect());
    on("fullscreen", () => {
      if (document.fullscreenElement) return document.exitFullscreen();
      if ($("stage").requestFullscreen) return $("stage").requestFullscreen();
      toast(
        "Полноэкранный режим не поддерживается. Поверните телефон горизонтально.",
      );
    });
    on("monitor-audio", async () => {
      if (camera) {
        mic = !mic;
        $<HTMLInputElement>("mic-enabled").checked = mic;
        await command({ action: "mic", enabled: mic });
        return;
      }
      if (!stream) throw new Error("Сначала подключите телефон.");
      sourceVideo.muted = !sourceVideo.muted;
      await sourceVideo.play();
      $("monitor-audio").setAttribute(
        "aria-pressed",
        String(!sourceVideo.muted),
      );
      $("audio-state").textContent = sourceVideo.muted
        ? "Прослушивание выключено"
        : "Прослушивание включено";
    });
    on("clean-audio", async () => {
      sourceVideo.muted = false;
      await sourceVideo.play();
      $("clean-audio").hidden = true;
    });
    on("record", () => toggleRecord());
    for (const id of ["resolution", "framerate", "lens"])
      on(id, () => sendCapture("capture"), "change");
    on(
      "mic-enabled",
      () =>
        command({
          action: "mic",
          enabled: $<HTMLInputElement>("mic-enabled").checked,
        }),
      "change",
    );
    on(
      "torch",
      () =>
        command({
          action: "torch",
          enabled: $<HTMLInputElement>("torch").checked,
        }),
      "change",
    );
    on(
      "zoom",
      () => {
        const value = Number($<HTMLInputElement>("zoom").value);
        $("zoom-value").textContent = value.toFixed(1) + "×";
        return command({ action: "zoom", value });
      },
      "change",
    );
    if (!camera && !clean) {
      for (const id of [
        "brightness",
        "contrast",
        "saturation",
        "preset",
        "mirror",
        "tracking",
        "background",
        "background-color",
      ])
        on(
          id,
          () => changeEffects(),
          ["brightness", "contrast", "saturation"].includes(id)
            ? "input"
            : "change",
        );
      on("reset-effects", () => {
        effects = { ...defaultEffects };
        syncEffects();
        changeEffects();
      });
      on(
        "lut-file",
        async () => {
          const file = $<HTMLInputElement>("lut-file").files?.[0];
          if (!file) return;
          if (file.size > 8 * 1024 * 1024)
            throw new Error("LUT-файл слишком большой (максимум 8 МБ).");
          pipeline.setLut(await file.text());
          toast(
            "LUT применён в этой вкладке. Для OBS загрузите LUT в самом OBS.",
          );
        },
        "change",
      );
      on("reset-lut", () => {
        pipeline.setLut();
        $<HTMLInputElement>("lut-file").value = "";
        toast("LUT отключён");
      });
    }
    if (camera) {
      const settings = document.createElement("details");
      settings.className = "phone-network";
      settings.innerHTML =
        '<summary>Настроить сеть</summary><label for="phone-ice">ICE-серверы (JSON, для TURN)</label><textarea id="phone-ice" rows="5" placeholder=\'[{"urls":"turn:server:3478","username":"user","credential":"password"}]\'></textarea><button id="phone-ice-save" class="secondary">Применить для следующего подключения</button><p>Настройки живут в этой вкладке, не сохраняются и не передаются в QR.</p>';
      $("main").append(settings);
      $<HTMLTextAreaElement>("phone-ice").value = network.iceServers
        ? JSON.stringify(network.iceServers, null, 2)
        : "";
      on("phone-ice-save", () => {
        network.iceServers = validateIce(
          $<HTMLTextAreaElement>("phone-ice").value,
        );
        toast("ICE обновлены. Остановите и снова включите камеру.");
      });
    }
  }
  function bindNetwork() {
    $<HTMLInputElement>("peer-host").value = network.host || "";
    $<HTMLInputElement>("peer-port").value = String(network.port || 443);
    $<HTMLInputElement>("peer-path").value = network.path || "/peerjs";
    $<HTMLTextAreaElement>("ice-servers").value = network.iceServers
      ? JSON.stringify(network.iceServers, null, 2)
      : "";
    on(
      "network-form",
      (e) => {
        e.preventDefault();
        const host = $<HTMLInputElement>("peer-host").value.trim();
        const path = $<HTMLInputElement>("peer-path").value.trim();
        if (host && !/^[a-zA-Z0-9.\-]+$/.test(host))
          throw new Error("Укажите hostname без https:// и пути.");
        if (!path.startsWith("/") || path.includes("#") || path.includes("?"))
          throw new Error("Путь должен начинаться с / и не содержать ? или #.");
        network = {
          host: host || undefined,
          port: Number($<HTMLInputElement>("peer-port").value),
          path,
          secure: true,
          iceServers: validateIce($<HTMLTextAreaElement>("ice-servers").value),
        };
        if ($<HTMLInputElement>("remember-network").checked)
          localStorage.setItem("lenslink-network", JSON.stringify(network));
        else localStorage.removeItem("lenslink-network");
        drawQR();
        connect();
        toast("Соединение обновлено. Заново откройте QR-код на телефоне.");
      },
      "submit",
    );
    on("reset-network", () => {
      localStorage.removeItem("lenslink-network");
      network = {};
      bindNetworkFields();
      drawQR();
      connect();
      toast("Настройки сети сброшены. Обновите ссылку на телефоне.");
    });
  }
  function bindNetworkFields() {
    $<HTMLInputElement>("peer-host").value = "";
    $<HTMLInputElement>("peer-port").value = "443";
    $<HTMLInputElement>("peer-path").value = "/peerjs";
    $<HTMLTextAreaElement>("ice-servers").value = "";
  }
  function validateIce(text: string): RTCIceServer[] {
    if (!text.trim()) return [];
    const data = JSON.parse(text);
    if (
      !Array.isArray(data) ||
      data.length > 8 ||
      data.some(
        (s) =>
          !s ||
          typeof s !== "object" ||
          ![s.urls]
            .flat()
            .every(
              (u: unknown) =>
                typeof u === "string" && /^(stun:|stuns:|turn:|turns:)/.test(u),
            ) ||
          !s.urls ||
          (s.username !== undefined && typeof s.username !== "string") ||
          (s.credential !== undefined && typeof s.credential !== "string"),
      )
    )
      throw new Error(
        "Нужен массив ICE-серверов с urls (stun: или turn:), необязательными username и credential.",
      );
    return data;
  }
  function status(text: string, connected: boolean) {
    live = connected;
    if ($("connection-status")) {
      $("connection-status").textContent = text;
      $("connection-status").classList.toggle("connected", connected);
    }
    if ($("signal-dot")) $("signal-dot").classList.toggle("live", connected);
    if ($("preview-badge"))
      $("preview-badge").textContent = connected
        ? "В эфире"
        : camera && stream
          ? "Камера включена"
          : "Нет сигнала";
    if ($("transport-title")) $("transport-title").textContent = text;
    if ($("transport-note"))
      $("transport-note").textContent = connected
        ? "Зашифрованное соединение WebRTC"
        : camera
          ? "Не закрывайте эту страницу"
          : "Оставьте камеру телефона включённой";
    if (!camera && !connected) {
      $("empty").hidden = false;
      if ($("record"))
        $<HTMLButtonElement>("record").disabled = !recorder.active;
    }
  }
  function connect() {
    link?.close();
    if (!camera) {
      stopStats();
      if (recorder.active) recorder.stop();
      pipeline.stop();
      sourceVideo.srcObject = null;
      stream = undefined;
      statsBytes = 0;
      statsTime = 0;
    }
    link = new Link(room, key, network, camera);
    link.onstatus = status;
    link.onerror = toast;
    link.onstream = receive;
    link.onstate = (state) => {
      if (state.effects) {
        effects = sanitizeEffects(state.effects);
        pipeline.update(effects);
        syncEffects();
      }
      updateCapabilities(state);
    };
    link.oncommand = handleCommand;
    if (!camera) link.open().catch(error);
  }
  async function receive(incoming: MediaStream) {
    stream = incoming;
    sourceVideo.srcObject = incoming;
    sourceVideo.muted = !clean;
    try {
      await sourceVideo.play();
    } catch {
      sourceVideo.muted = true;
      await sourceVideo.play();
      if (clean) $("clean-audio").hidden = false;
    }
    $("empty").hidden = true;
    pipeline.start();
    if ($("record")) $<HTMLButtonElement>("record").disabled = false;
    incoming.getVideoTracks()[0]?.addEventListener("ended", () => {
      status("Камера остановлена", false);
      if (recorder.active) recorder.stop();
    });
    startStats();
  }
  async function startCamera() {
    if (busy) return;
    busy = true;
    const btn = $<HTMLButtonElement>("start-camera");
    btn.disabled = true;
    btn.textContent = "Подключаем камеру…";
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error("Камера доступна только по HTTPS в Safari / Chrome.");
      await acquire();
      connect();
      await link.open(stream);
      sourceVideo.srcObject = stream!;
      await sourceVideo.play();
      $("empty").hidden = true;
      pipeline.start();
      $<HTMLButtonElement>("flip-camera").disabled = false;
      $<HTMLButtonElement>("stop-camera").disabled = false;
      if ("wakeLock" in navigator)
        try {
          wakeLock = await navigator.wakeLock.request("screen");
        } catch {
          /* Optional on iOS. */
        }
      updateCapabilities({
        settings: stream!.getVideoTracks()[0].getSettings(),
        capabilities: stream!.getVideoTracks()[0].getCapabilities?.(),
        mic,
      });
      startStats();
    } catch (e) {
      stopCamera();
      error(e);
    } finally {
      busy = false;
      btn.disabled = false;
      btn.innerHTML = icon("camera") + "Включить камеру";
      icons();
    }
  }
  async function acquire() {
    const video: MediaTrackConstraints = {
      facingMode: { ideal: facing },
      width: { ideal: Math.round((requestedHeight * 16) / 9) },
      height: { ideal: requestedHeight },
      frameRate: { ideal: requestedFps, max: requestedFps },
    };
    let next: MediaStream;
    try {
      next = await navigator.mediaDevices.getUserMedia({
        video,
        audio: mic
          ? {
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false,
            }
          : false,
      });
    } catch (e) {
      if (!mic) throw e;
      next = await navigator.mediaDevices.getUserMedia({ video, audio: false });
      mic = false;
      $<HTMLInputElement>("mic-enabled").checked = false;
      toast(
        "Микрофон недоступен. Передаём только видео. Проверьте разрешения и включите его повторно.",
      );
    }
    stream?.getTracks().forEach((t) => t.stop());
    stream = next;
    sourceVideo.srcObject = next;
    await sourceVideo.play();
  }
  function stopCamera() {
    recorder.stop();
    link?.close();
    stream?.getTracks().forEach((t) => t.stop());
    stream = undefined;
    sourceVideo.srcObject = null;
    pipeline.stop();
    wakeLock?.release();
    wakeLock = undefined;
    stopStats();
    $("empty").hidden = false;
    $<HTMLButtonElement>("flip-camera").disabled = true;
    $<HTMLButtonElement>("stop-camera").disabled = true;
    status("Камера выключена", false);
    for (const id of ["resolution", "fps", "codec", "bitrate"])
      $("stat-" + id).textContent = "—";
  }
  async function command(value: any) {
    if (camera) await handleCommand(value);
    else link.command(value);
  }
  async function sendCapture(action: string) {
    return command({
      action,
      height: Number($<HTMLSelectElement>("resolution").value),
      fps: Number($<HTMLSelectElement>("framerate").value),
      facing: $<HTMLSelectElement>("lens").value,
    });
  }
  async function handleCommand(c: any) {
    if (c.action === "stop") {
      stopCamera();
      return;
    }
    if (busy)
      throw new Error("Камера меняет настройки. Повторите через секунду.");
    const track = stream?.getVideoTracks()[0];
    if (c.action === "capture" || c.action === "flip") {
      const oldFacing = facing;
      if (c.action === "flip")
        facing = facing === "environment" ? "user" : "environment";
      else if (["user", "environment"].includes(c.facing)) facing = c.facing;
      if ([720, 1080, 2160].includes(c.height)) requestedHeight = c.height;
      if ([24, 30, 60].includes(c.fps)) requestedFps = c.fps;
      if (stream) {
        busy = true;
        try {
          if (facing !== oldFacing) stream.getTracks().forEach((t) => t.stop());
          await acquire();
          await link.replaceStream(stream!);
          pipeline.start();
        } catch (e) {
          stopCamera();
          throw e;
        } finally {
          busy = false;
        }
      }
      $<HTMLSelectElement>("lens").value = facing;
      $<HTMLSelectElement>("resolution").value = String(requestedHeight);
      $<HTMLSelectElement>("framerate").value = String(requestedFps);
    } else if (c.action === "mic") {
      mic = c.enabled === true;
      $<HTMLInputElement>("mic-enabled").checked = mic;
      if (stream) {
        const audio = stream.getAudioTracks()[0];
        if (audio) audio.enabled = mic;
        else if (mic) {
          const extra = await navigator.mediaDevices.getUserMedia({
            audio: true,
          });
          extra.getAudioTracks().forEach((t) => stream!.addTrack(t));
          await link.replaceStream(stream);
        }
      }
    } else if (c.action === "torch" || c.action === "zoom") {
      if (!track) throw new Error("Камера ещё не включена.");
      const caps = track.getCapabilities() as any;
      if (c.action === "torch") {
        if (!caps.torch)
          throw new Error("Фонарик недоступен на этом устройстве.");
        await track.applyConstraints({
          advanced: [{ torch: c.enabled === true } as any],
        });
      } else {
        if (!caps.zoom || !Number.isFinite(c.value))
          throw new Error("Зум недоступен.");
        await track.applyConstraints({
          advanced: [
            {
              zoom: Math.max(caps.zoom.min, Math.min(caps.zoom.max, c.value)),
            } as any,
          ],
        });
      }
    }
    if (stream) {
      link.sendState();
      updateCapabilities({
        settings: stream.getVideoTracks()[0].getSettings(),
        capabilities: stream.getVideoTracks()[0].getCapabilities?.(),
        mic,
      });
    }
  }
  function updateCapabilities(state: any) {
    const caps = state.capabilities || {},
      s = state.settings || {};
    if ($("torch")) $<HTMLInputElement>("torch").disabled = !caps.torch;
    if ($("zoom")) {
      const z = $<HTMLInputElement>("zoom");
      z.disabled = !caps.zoom;
      if (caps.zoom) {
        z.min = String(caps.zoom.min);
        z.max = String(caps.zoom.max);
        z.step = String(caps.zoom.step || 0.1);
        z.value = String(s.zoom || 1);
        $("zoom-value").textContent = Number(z.value).toFixed(1) + "×";
      }
    }
    if ($("mic-enabled") && typeof state.mic === "boolean") {
      $<HTMLInputElement>("mic-enabled").checked = state.mic;
      if (camera)
        $("audio-state").textContent = state.mic
          ? "Микрофон включён"
          : "Микрофон выключен";
    }
  }
  function syncEffects() {
    if (camera || clean) return;
    for (const id of [
      "brightness",
      "contrast",
      "saturation",
      "preset",
      "background",
    ]) {
      $<HTMLInputElement>(id).value = String((effects as any)[id]);
      if ($(`${id}-value`))
        $(`${id}-value`).textContent = (effects as any)[id] + "%";
    }
    for (const id of ["mirror", "tracking"])
      $<HTMLInputElement>(id).checked = (effects as any)[id];
    $<HTMLInputElement>("background-color").value = effects.color;
    $("color-field").hidden = effects.background !== "color";
  }
  async function changeEffects() {
    effects = sanitizeEffects({
      brightness: Number($<HTMLInputElement>("brightness").value),
      contrast: Number($<HTMLInputElement>("contrast").value),
      saturation: Number($<HTMLInputElement>("saturation").value),
      preset: $<HTMLSelectElement>("preset").value,
      mirror: $<HTMLInputElement>("mirror").checked,
      tracking: $<HTMLInputElement>("tracking").checked,
      background: $<HTMLSelectElement>("background").value,
      color: $<HTMLInputElement>("background-color").value,
    });
    syncEffects();
    await pipeline.update(effects);
    if (link.channel?.open) link.command({ action: "effects", effects });
  }
  function startStats() {
    stopStats();
    statsTimer = setInterval(async () => {
      if (!stream) return;
      const s = stream.getVideoTracks()[0]?.getSettings();
      if ($("stat-resolution"))
        $("stat-resolution").textContent = sourceVideo.videoWidth
          ? `${sourceVideo.videoWidth} × ${sourceVideo.videoHeight}`
          : "—";
      if ($("stat-fps"))
        $("stat-fps").textContent = s?.frameRate
          ? String(Math.round(s.frameRate))
          : "—";
      if (!camera && link.call?.peerConnection) {
        try {
          const stats = await link.call.peerConnection.getStats();
          stats.forEach((r) => {
            if (r.type === "inbound-rtp" && r.kind === "video") {
              $("stat-fps").textContent = Number.isFinite(r.framesPerSecond)
                ? String(Math.round(r.framesPerSecond))
                : "—";
              pipeline.fps = Math.min(60, Math.max(1, r.framesPerSecond || 30));
              const codec = stats.get(r.codecId);
              $("stat-codec").textContent =
                codec?.mimeType?.replace("video/", "") || "—";
              if (statsTime && r.timestamp > statsTime)
                $("stat-bitrate").textContent =
                  (
                    ((r.bytesReceived - statsBytes) * 8) /
                    (r.timestamp - statsTime) /
                    1000
                  ).toFixed(1) + " Мбит/с";
              statsBytes = r.bytesReceived;
              statsTime = r.timestamp;
            }
          });
        } catch {
          /* Connection is closing. */
        }
      }
      if (camera) {
        $("stat-codec").textContent = "WebRTC";
        $("stat-bitrate").textContent = "—";
      }
      if (recorder.active) {
        const sec = Math.floor((Date.now() - recordingStart) / 1000);
        $("record-time").textContent = [
          Math.floor(sec / 3600),
          Math.floor(sec / 60) % 60,
          sec % 60,
        ]
          .map((v) => String(v).padStart(2, "0"))
          .join(":");
      }
    }, 1000);
  }
  function stopStats() {
    clearInterval(statsTimer);
  }
  function toggleRecord() {
    if (recorder.active) {
      recorder.stop();
      return;
    }
    if (!stream || !live) throw new Error("Сначала подключите камеру.");
    recorder.start(
      pipeline,
      stream,
      (blob) => {
        const extension = blob.type.includes("mp4") ? "mp4" : "webm";
        if (recordingUrl) URL.revokeObjectURL(recordingUrl);
        recordingUrl = URL.createObjectURL(blob);
        if ($("downloads")) {
          $("downloads").textContent = "";
          const a = document.createElement("a");
          a.href = recordingUrl;
          a.download = `lenslink-${new Date().toISOString().replace(/[:.]/g, "-")}.${extension}`;
          a.className = "download";
          a.textContent = `Скачать запись · ${(blob.size / 1024 / 1024).toFixed(1)} МБ · ${extension.toUpperCase()}`;
          $("downloads").append(a);
        }
        $("record").innerHTML = '<span class="record-dot"></span>Записать';
        $("record").classList.remove("recording");
        $<HTMLButtonElement>("record").disabled = !live;
        toast(
          "Запись готова. Скачайте её во вкладке «Выходы» до закрытия страницы.",
        );
      },
      toast,
    );
    recordingStart = Date.now();
    $("record").innerHTML = icon("square") + "Остановить";
    $("record").classList.add("recording");
    icons();
  }
  async function resetSession() {
    recorder.stop();
    if (link.channel?.open) {
      link.command({ action: "stop" });
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    room = randomToken();
    key = randomToken();
    history.replaceState(null, "", location.pathname);
    connect();
    drawQR();
    status("Ожидаем телефон", false);
    toast("Создана новая сессия. Подключите телефон новым QR-кодом.");
  }
  render();
  connect();
  document.addEventListener("visibilitychange", async () => {
    if (
      camera &&
      stream &&
      document.visibilityState === "visible" &&
      "wakeLock" in navigator
    ) {
      try {
        wakeLock = await navigator.wakeLock.request("screen");
      } catch {
        /* Optional. */
      }
    }
  });
  window.addEventListener("beforeunload", (e) => {
    if (recorder.active) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
  window.addEventListener("pagehide", () => {
    link?.close();
    stream?.getTracks().forEach((t) => t.stop());
    pipeline.destroy();
    stopStats();
    wakeLock?.release();
    if (recordingUrl) URL.revokeObjectURL(recordingUrl);
  });
  window.addEventListener("pageshow", (e) => {
    if (e.persisted) location.reload();
  });
  window.addEventListener("hashchange", () => location.reload());
}
bootstrap().catch(error);
