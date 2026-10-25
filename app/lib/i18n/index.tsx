import type React from "react";
import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type LanguageCode = "zh-CN" | "zh-TW" | "en" | "es" | "ja" | "ko";

export interface LanguageOption {
  code: LanguageCode;
  label: string;
  nativeLabel: string;
}

export const SUPPORTED_LANGUAGES: LanguageOption[] = [
  { code: "zh-CN", label: "Simplified Chinese", nativeLabel: "简体中文" },
  { code: "zh-TW", label: "Traditional Chinese", nativeLabel: "繁體中文" },
  { code: "en", label: "English", nativeLabel: "English" },
  { code: "es", label: "Spanish", nativeLabel: "Español" },
  { code: "ja", label: "Japanese", nativeLabel: "日本語" },
  { code: "ko", label: "Korean", nativeLabel: "한국어" },
];

const LOCAL_STORAGE_LANG_KEY = "emby_language";

export const translations: Record<LanguageCode, Record<string, string>> = {
  "zh-CN": {
    // Navigation & Common
    back: "返回",
    home: "首页",
    search: "搜索",
    settings: "设置",
    servers: "服务器",
    continueWatching: "继续观看",
    favorites: "我的收藏",
    systemInfo: "系统信息",
    loading: "加载中...",
    noItems: "暂无内容",
    refresh: "刷新",
    save: "保存",
    cancel: "取消",
    delete: "删除",
    confirm: "确认",
    enabled: "已启用",
    disabled: "已禁用",

    // Home Modules
    heroBanner: "精选焦点大图",
    categoriesNav: "分类快捷导航",
    myFavorites: "我的收藏",
    libraryShelves: "媒体库内容栏目",
    play: "播放",
    resume: "继续播放",
    details: "详情",
    season: "季",
    episode: "集",
    episodes: "剧集",

    // Detail Page
    audio: "音频",
    subtitle: "字幕",
    subtitlesOff: "关 (关闭字幕)",
    selected: "已选",
    externalSubtitle: "外挂字幕",
    embeddedSubtitle: "内嵌字幕",
    cast: "演职人员",
    overview: "剧情简介",
    mediaInfo: "媒体规格",
    videoStream: "视频流",
    audioStream: "音频流",
    subtitleStream: "字幕流",

    // Settings
    settingsTitle: "设置",
    generalSection: "常规与界面",
    interfaceLanguage: "界面语言",
    interfaceLanguageDesc: "切换应用显示语言，无需重启立即生效",
    homeModulesSection: "首页模块设置",
    homeModulesDesc: "自由定制首页显示的内容模块",
    moduleHero: "精选推荐大图 (Hero)",
    moduleHeroDesc: "首页顶部的大图轮播与快速播放入口",
    moduleCategories: "分类导航栏 (Categories)",
    moduleCategoriesDesc: "电影、电视剧、动漫等快速分类入口",
    moduleContinueWatching: "继续观看 (Continue Watching)",
    moduleContinueWatchingDesc: "最近未看完的内容与快捷断点续播",
    moduleFavorites: "我的收藏 (Favorites)",
    moduleFavoritesDesc: "个人标记为收藏的电影和剧集",
    moduleLibrarySections: "媒体库分类 (Libraries)",
    moduleLibrarySectionsDesc: "各大媒体库的最新入库与热门内容行",

    // Startup & Playback
    playbackSection: "启动与播放",
    autoOpenOnLaunch: "打开 IINA 时自动启动 Emby 浏览器",
    autoOpenOnLaunchDesc: "在 IINA 启动时立即自动打开 Emby 独立浏览窗口",
    openInNewWindow: "在新播放窗口中打开",
    openInNewWindowDesc: "每次播放都新建一个独立的播放器窗口",
    syncPlaybackProgress: "同步播放进度至 Emby",
    syncPlaybackProgressDesc: "实时将观看进度同步回 Emby 服务器，保持断点一致",
    reopenBrowserOnEnd: "播放结束时重新打开浏览器",
    reopenBrowserOnEndDesc: "播放完毕或关闭播放器时自动唤出 Emby 浏览窗口",
    autoplayNextEpisode: "自动播放下一集",
    autoplayNextEpisodeDesc: "电视剧播放结束时自动缓冲并播放下一集",
    autoDownloadSubtitles: "自动下载外挂字幕",
    autoDownloadSubtitlesDesc: "检测到外挂字幕时自动下载并关联到播放器",
    debugLogging: "详细调试日志",
    debugLoggingDesc: "在控制台中输出详细的调试日志排查问题",

    // Server & Diagnostics
    serverSection: "服务器与诊断",
    systemInfoTitle: "系统信息",
    systemInfoDesc: "查看 Emby 服务器版本、网络端点和用户权限",
    libraryScanTitle: "媒体库扫描",
    libraryScanDesc: "触发 Emby 服务器刷新元数据和扫描新媒体",
    connectedServers: "已连接服务器",
    addServer: "添加新服务器",
    versionInfo: "版本信息",
    appVersion: "插件版本",
  },

  "zh-TW": {
    // Navigation & Common
    back: "返回",
    home: "首頁",
    search: "搜尋",
    settings: "設定",
    servers: "伺服器",
    continueWatching: "繼續觀看",
    favorites: "我的最愛",
    systemInfo: "系統資訊",
    loading: "載入中...",
    noItems: "暫無內容",
    refresh: "重新整理",
    save: "儲存",
    cancel: "取消",
    delete: "刪除",
    confirm: "確認",
    enabled: "已啟用",
    disabled: "已停用",

    // Home Modules
    heroBanner: "精選推薦大圖",
    categoriesNav: "分類快捷導航",
    myFavorites: "我的最愛",
    libraryShelves: "媒體庫內容欄目",
    play: "播放",
    resume: "繼續播放",
    details: "詳細資訊",
    season: "季",
    episode: "集",
    episodes: "劇集",

    // Detail Page
    audio: "音訊",
    subtitle: "字幕",
    subtitlesOff: "關 (關閉字幕)",
    selected: "已選",
    externalSubtitle: "外掛字幕",
    embeddedSubtitle: "內嵌字幕",
    cast: "演職員名單",
    overview: "簡介",
    mediaInfo: "媒體規格",
    videoStream: "視訊軌",
    audioStream: "音訊軌",
    subtitleStream: "字幕軌",

    // Settings
    settingsTitle: "設定",
    generalSection: "一般與介面",
    interfaceLanguage: "介面語言",
    interfaceLanguageDesc: "切換應用程式顯示語言，即時生效無需重啟",
    homeModulesSection: "首頁模組設定",
    homeModulesDesc: "自訂首頁顯示的內容區塊",
    moduleHero: "精選推薦大圖 (Hero)",
    moduleHeroDesc: "首頁頂部的大圖輪播與快速播放入口",
    moduleCategories: "分類導航欄 (Categories)",
    moduleCategoriesDesc: "電影、電視劇、動漫等快速分類入口",
    moduleContinueWatching: "繼續觀看 (Continue Watching)",
    moduleContinueWatchingDesc: "最近未看完的內容與接續播放",
    moduleFavorites: "我的最愛 (Favorites)",
    moduleFavoritesDesc: "個人標記為最愛的電影與影集",
    moduleLibrarySections: "媒體庫分類 (Libraries)",
    moduleLibrarySectionsDesc: "各大媒體庫最新入庫與熱門內容行",

    // Startup & Playback
    playbackSection: "啟動與播放",
    autoOpenOnLaunch: "啟動 IINA 時自動開啟 Emby 瀏覽器",
    autoOpenOnLaunchDesc: "在 IINA 啟動時自動開啟 Emby 獨立瀏覽視窗",
    openInNewWindow: "在新播放視窗中開啟",
    openInNewWindowDesc: "每次播放皆建立獨立播放器視窗",
    syncPlaybackProgress: "同步播放進度至 Emby",
    syncPlaybackProgressDesc: "即時將觀看進度回報至 Emby 伺服器",
    reopenBrowserOnEnd: "播放結束時重新開啟瀏覽器",
    reopenBrowserOnEndDesc: "播放完畢或關閉播放器時自動喚出 Emby 視窗",
    autoplayNextEpisode: "自動播放下一集",
    autoplayNextEpisodeDesc: "影集播放結束時自動載入並播放下一集",
    autoDownloadSubtitles: "自動下載外掛字幕",
    autoDownloadSubtitlesDesc: "偵測到外掛字幕時自動下載並載入至播放器",
    debugLogging: "詳細除錯記錄",
    debugLoggingDesc: "在主控台輸出詳細除錯訊息以供分析",

    // Server & Diagnostics
    serverSection: "伺服器與診斷",
    systemInfoTitle: "系統資訊",
    systemInfoDesc: "查看 Emby 伺服器版本、網路端點與使用者權限",
    libraryScanTitle: "媒體庫掃描",
    libraryScanDesc: "觸發 Emby 伺服器重新整理中繼資料與掃描新媒體",
    connectedServers: "已連線伺服器",
    addServer: "新增伺服器",
    versionInfo: "版本資訊",
    appVersion: "外掛版本",
  },

  en: {
    // Navigation & Common
    back: "Back",
    home: "Home",
    search: "Search",
    settings: "Settings",
    servers: "Servers",
    continueWatching: "Continue Watching",
    favorites: "Favorites",
    systemInfo: "System Information",
    loading: "Loading...",
    noItems: "No items available",
    refresh: "Refresh",
    save: "Save",
    cancel: "Cancel",
    delete: "Delete",
    confirm: "Confirm",
    enabled: "Enabled",
    disabled: "Disabled",

    // Home Modules
    heroBanner: "Hero Banner",
    categoriesNav: "Categories Navigation",
    myFavorites: "My Favorites",
    libraryShelves: "Library Shelves",
    play: "Play",
    resume: "Resume",
    details: "Details",
    season: "Season",
    episode: "Episode",
    episodes: "Episodes",

    // Detail Page
    audio: "Audio",
    subtitle: "Subtitle",
    subtitlesOff: "Off (Disable Subtitles)",
    selected: "Selected",
    externalSubtitle: "External Subtitle",
    embeddedSubtitle: "Embedded Subtitle",
    cast: "Cast & Crew",
    overview: "Overview",
    mediaInfo: "Media Info",
    videoStream: "Video Stream",
    audioStream: "Audio Stream",
    subtitleStream: "Subtitle Stream",

    // Settings
    settingsTitle: "Settings",
    generalSection: "General & Interface",
    interfaceLanguage: "Interface Language",
    interfaceLanguageDesc: "Change application language with instant live update",
    homeModulesSection: "Home Page Modules",
    homeModulesDesc: "Customize which sections appear on your home screen",
    moduleHero: "Featured Hero Banner",
    moduleHeroDesc: "Top carousel spotlight with quick play action",
    moduleCategories: "Categories Quick Shelf",
    moduleCategoriesDesc: "Quick navigation for Movies, TV Shows, Anime, etc.",
    moduleContinueWatching: "Continue Watching Shelf",
    moduleContinueWatchingDesc: "In-progress titles with instant resume points",
    moduleFavorites: "Favorites Shelf",
    moduleFavoritesDesc: "Media items marked as your personal favorites",
    moduleLibrarySections: "Library Sections Shelves",
    moduleLibrarySectionsDesc: "Latest additions and popular items from all libraries",

    // Startup & Playback
    playbackSection: "Startup & Playback",
    autoOpenOnLaunch: "Open Emby Browser on IINA launch",
    autoOpenOnLaunchDesc: "Automatically open the Emby standalone browser window when IINA starts",
    openInNewWindow: "Open playback in a new window",
    openInNewWindowDesc: "Create a separate player instance whenever media is played",
    syncPlaybackProgress: "Sync playback progress to Emby",
    syncPlaybackProgressDesc: "Report playback position in real time to keep resume states synchronized",
    reopenBrowserOnEnd: "Reopen browser on playback finish",
    reopenBrowserOnEndDesc: "Bring back the Emby browser window when video finishes or closes",
    autoplayNextEpisode: "Autoplay next episode",
    autoplayNextEpisodeDesc: "Automatically buffer and start the next episode when current one ends",
    autoDownloadSubtitles: "Auto-download external subtitles",
    autoDownloadSubtitlesDesc: "Automatically fetch and load external subtitle streams",
    debugLogging: "Verbose debug logging",
    debugLoggingDesc: "Output detailed diagnostic logs for troubleshooting",

    // Server & Diagnostics
    serverSection: "Server & Diagnostics",
    systemInfoTitle: "System Information",
    systemInfoDesc: "View server version, network endpoints, and permissions",
    libraryScanTitle: "Library Scan",
    libraryScanDesc: "Trigger Emby to refresh metadata and scan for new files",
    connectedServers: "Connected Servers",
    addServer: "Add New Server",
    versionInfo: "About & Version",
    appVersion: "Plugin Version",
  },

  es: {
    // Navigation & Common
    back: "Atrás",
    home: "Inicio",
    search: "Buscar",
    settings: "Ajustes",
    servers: "Servidores",
    continueWatching: "Continuar viendo",
    favorites: "Favoritos",
    systemInfo: "Información del sistema",
    loading: "Cargando...",
    noItems: "No hay elementos disponibles",
    refresh: "Actualizar",
    save: "Guardar",
    cancel: "Cancelar",
    delete: "Eliminar",
    confirm: "Confirmar",
    enabled: "Activado",
    disabled: "Desactivado",

    // Home Modules
    heroBanner: "Banner Destacado",
    categoriesNav: "Navegación por categorías",
    myFavorites: "Mis Favoritos",
    libraryShelves: "Estantes de bibliotecas",
    play: "Reproducir",
    resume: "Reanudar",
    details: "Detalles",
    season: "Temporada",
    episode: "Episodio",
    episodes: "Episodios",

    // Detail Page
    audio: "Audio",
    subtitle: "Subtítulo",
    subtitlesOff: "Desactivado",
    selected: "Seleccionado",
    externalSubtitle: "Subtítulo externo",
    embeddedSubtitle: "Subtítulo integrado",
    cast: "Reparto y equipo",
    overview: "Sinopsis",
    mediaInfo: "Información multimedia",
    videoStream: "Pista de vídeo",
    audioStream: "Pista de audio",
    subtitleStream: "Pista de subtítulos",

    // Settings
    settingsTitle: "Ajustes",
    generalSection: "General e Interfaz",
    interfaceLanguage: "Idioma de la interfaz",
    interfaceLanguageDesc: "Cambiar el idioma visual de la aplicación al instante",
    homeModulesSection: "Módulos de la pantalla de inicio",
    homeModulesDesc: "Personaliza las secciones visibles en tu pantalla de inicio",
    moduleHero: "Banner Destacado (Hero)",
    moduleHeroDesc: "Carrusel superior con acceso rápido a reproducción",
    moduleCategories: "Acceso rápido por categorías",
    moduleCategoriesDesc: "Acceso a Películas, Series, Animación, etc.",
    moduleContinueWatching: "Continuar viendo",
    moduleContinueWatchingDesc: "Títulos en curso con punto de reanudación",
    moduleFavorites: "Mis Favoritos",
    moduleFavoritesDesc: "Películas y series guardadas como favoritas",
    moduleLibrarySections: "Secciones de bibliotecas",
    moduleLibrarySectionsDesc: "Novedades y contenido popular de tus bibliotecas",

    // Startup & Playback
    playbackSection: "Inicio y Reproducción",
    autoOpenOnLaunch: "Abrir navegador Emby al iniciar IINA",
    autoOpenOnLaunchDesc: "Abre automáticamente la ventana de Emby al arrancar IINA",
    openInNewWindow: "Abrir en nueva ventana",
    openInNewWindowDesc: "Crea una ventana de reproductor independiente para cada vídeo",
    syncPlaybackProgress: "Sincronizar progreso con Emby",
    syncPlaybackProgressDesc: "Guarda la posición en el servidor para reanudar donde lo dejaste",
    reopenBrowserOnEnd: "Reabrir navegador al finalizar",
    reopenBrowserOnEndDesc: "Vuelve a mostrar la ventana de Emby cuando termine la reproducción",
    autoplayNextEpisode: "Reproducir siguiente episodio",
    autoplayNextEpisodeDesc: "Comienza automáticamente el siguiente episodio de una serie",
    autoDownloadSubtitles: "Descargar subtítulos externos",
    autoDownloadSubtitlesDesc: "Carga automáticamente los subtítulos externos disponibles",
    debugLogging: "Registro de depuración",
    debugLoggingDesc: "Muestra registros detallados en la consola",

    // Server & Diagnostics
    serverSection: "Servidor y Diagnóstico",
    systemInfoTitle: "Información del sistema",
    systemInfoDesc: "Ver versión del servidor, conexiones y permisos",
    libraryScanTitle: "Escanear bibliotecas",
    libraryScanDesc: "Inicia el escaneo de nuevos archivos y metadatos en Emby",
    connectedServers: "Servidores conectados",
    addServer: "Añadir servidor",
    versionInfo: "Acerca de y versión",
    appVersion: "Versión del plugin",
  },

  ja: {
    // Navigation & Common
    back: "戻る",
    home: "ホーム",
    search: "検索",
    settings: "設定",
    servers: "サーバー",
    continueWatching: "続きを観る",
    favorites: "お気に入り",
    systemInfo: "システム情報",
    loading: "読み込み中...",
    noItems: "コンテンツがありません",
    refresh: "更新",
    save: "保存",
    cancel: "キャンセル",
    delete: "削除",
    confirm: "確認",
    enabled: "有効",
    disabled: "無効",

    // Home Modules
    heroBanner: "おすすめヒーローバナー",
    categoriesNav: "カテゴリーナビ",
    myFavorites: "お気に入り",
    libraryShelves: "ライブラリ別コンテンツ",
    play: "再生",
    resume: "再開",
    details: "詳細",
    season: "シーズン",
    episode: "エピソード",
    episodes: "エピソード一覧",

    // Detail Page
    audio: "音声",
    subtitle: "字幕",
    subtitlesOff: "オフ (字幕なし)",
    selected: "選択中",
    externalSubtitle: "外部字幕",
    embeddedSubtitle: "内蔵字幕",
    cast: "キャスト・スタッフ",
    overview: "あらすじ",
    mediaInfo: "メディア情報",
    videoStream: "映像ストリーム",
    audioStream: "音声ストリーム",
    subtitleStream: "字幕ストリーム",

    // Settings
    settingsTitle: "設定",
    generalSection: "一般・インターフェース",
    interfaceLanguage: "表示言語",
    interfaceLanguageDesc: "アプリケーションの表示言語を切り替えます（即時反映）",
    homeModulesSection: "ホーム画面モジュール設定",
    homeModulesDesc: "ホーム画面に表示するモジュールをカスタマイズします",
    moduleHero: "注目の大画面バナー (Hero)",
    moduleHeroDesc: "ホーム上部のおすすめカルーセルと即時再生",
    moduleCategories: "カテゴリーナビゲーション",
    moduleCategoriesDesc: "映画、ドラマ、アニメなどのクイックアクセス",
    moduleContinueWatching: "続きを観る (Continue Watching)",
    moduleContinueWatchingDesc: "視聴途中のコンテンツとレジューム再生",
    moduleFavorites: "お気に入り (Favorites)",
    moduleFavoritesDesc: "お気に入り登録したメディア一覧",
    moduleLibrarySections: "ライブラリ別セクション (Libraries)",
    moduleLibrarySectionsDesc: "各メディアライブラリの最新・人気作品列",

    // Startup & Playback
    playbackSection: "起動と再生動作",
    autoOpenOnLaunch: "IINA 起動時に Emby ブラウザを自動起動",
    autoOpenOnLaunchDesc: "IINA を開いたときに自動で Emby ウィンドウを立ち上げます",
    openInNewWindow: "新しいウィンドウで再生",
    openInNewWindowDesc: "メディア再生時に新しいプレイヤーウィンドウを開きます",
    syncPlaybackProgress: "再生進捗を Emby に同期",
    syncPlaybackProgressDesc: "視聴位置をリアルタイムで Emby サーバーに反映します",
    reopenBrowserOnEnd: "再生終了時にブラウザを再表示",
    reopenBrowserOnEndDesc: "再生が終了した際、自動で Emby ブラウザ画面を再表示します",
    autoplayNextEpisode: "次のエピソードを自動再生",
    autoplayNextEpisodeDesc: "ドラマ視聴完了時に次の話を自動で再生開始します",
    autoDownloadSubtitles: "外部字幕を自動読み込み",
    autoDownloadSubtitlesDesc: "外部字幕が利用可能な場合に自動でプレイヤーに設定します",
    debugLogging: "詳細デバッグログ",
    debugLoggingDesc: "コンソールに詳細なログを出力して問題を調査します",

    // Server & Diagnostics
    serverSection: "サーバーと診断",
    systemInfoTitle: "システム情報",
    systemInfoDesc: "サーバーバージョン、ネットワーク設定、権限を確認",
    libraryScanTitle: "ライブラリスキャン",
    libraryScanDesc: "Emby サーバーでメタデータ更新と新規メディアをスキャン",
    connectedServers: "接続中サーバー",
    addServer: "サーバーを追加",
    versionInfo: "バージョン情報",
    appVersion: "プラグインバージョン",
  },

  ko: {
    // Navigation & Common
    back: "뒤로",
    home: "홈",
    search: "검색",
    settings: "설정",
    servers: "서버",
    continueWatching: "이어보기",
    favorites: "즐겨찾기",
    systemInfo: "시스템 정보",
    loading: "로딩 중...",
    noItems: "항목이 없습니다",
    refresh: "새로고침",
    save: "저장",
    cancel: "취소",
    delete: "삭제",
    confirm: "확인",
    enabled: "활성화됨",
    disabled: "비활성화됨",

    // Home Modules
    heroBanner: "주요 추천 배너",
    categoriesNav: "카테고리 탐색",
    myFavorites: "즐겨찾기 목록",
    libraryShelves: "라이브러리 콘텐츠",
    play: "재생",
    resume: "이어보기",
    details: "상세정보",
    season: "시즌",
    episode: "화",
    episodes: "에피소드",

    // Detail Page
    audio: "오디오",
    subtitle: "자막",
    subtitlesOff: "끄기 (자막 없음)",
    selected: "선택됨",
    externalSubtitle: "외부 자막",
    embeddedSubtitle: "내장 자막",
    cast: "출연진 및 제작진",
    overview: "줄거리",
    mediaInfo: "미디어 정보",
    videoStream: "비디오 트랙",
    audioStream: "오디오 트랙",
    subtitleStream: "자막 트랙",

    // Settings
    settingsTitle: "설정",
    generalSection: "일반 및 인터페이스",
    interfaceLanguage: "인터페이스 언어",
    interfaceLanguageDesc: "앱 표시 언어를 즉시 전환합니다 (재시작 불필요)",
    homeModulesSection: "홈 화면 모듈 설정",
    homeModulesDesc: "홈 화면에 표시할 섹션을 자유롭게 맞춤 설정하세요",
    moduleHero: "추천 하이라이트 배너 (Hero)",
    moduleHeroDesc: "홈 화면 상단 대형 캐러셀과 빠른 재생",
    moduleCategories: "카테고리 바로가기 (Categories)",
    moduleCategoriesDesc: "영화, TV 프로그램, 애니메이션 등 빠른 분류",
    moduleContinueWatching: "이어보기 목록 (Continue Watching)",
    moduleContinueWatchingDesc: "시청 중인 콘텐츠 및 이전 시점부터 이어보기",
    moduleFavorites: "즐겨찾기 (Favorites)",
    moduleFavoritesDesc: "즐겨찾기에 등록된 미디어 목록",
    moduleLibrarySections: "라이브러리별 섹션 (Libraries)",
    moduleLibrarySectionsDesc: "모든 미디어 라이브러리의 최신 및 인기 콘텐츠",

    // Startup & Playback
    playbackSection: "시작 및 재생 동작",
    autoOpenOnLaunch: "IINA 시작 시 Emby 브라우저 자동 실행",
    autoOpenOnLaunchDesc: "IINA를 시작할 때 독립형 Emby 브라우저 창을 자동으로 엽니다",
    openInNewWindow: "새 창에서 재생",
    openInNewWindowDesc: "미디어를 재생할 때마다 새 플레이어 창을 엽니다",
    syncPlaybackProgress: "Emby에 재생 진도 동기화",
    syncPlaybackProgressDesc: "시청 위치를 Emby 서버에 실시간 동기화하여 언제든 이어봅니다",
    reopenBrowserOnEnd: "재생 종료 시 브라우저 다시 열기",
    reopenBrowserOnEndDesc: "동영상 재생이 끝나거나 창을 닫았을 때 Emby 창을 다시 엽니다",
    autoplayNextEpisode: "다음 화 자동 재생",
    autoplayNextEpisodeDesc: "에피소드가 끝나면 자동으로 다음 에피소드를 재생합니다",
    autoDownloadSubtitles: "외부 자막 자동 로드",
    autoDownloadSubtitlesDesc: "외부 자막이 있을 경우 자동으로 플레이어에 추가합니다",
    debugLogging: "상세 디버그 로그",
    debugLoggingDesc: "문제 해결을 위해 콘솔에 상세 로그를 출력합니다",

    // Server & Diagnostics
    serverSection: "서버 및 진단",
    systemInfoTitle: "시스템 정보",
    systemInfoDesc: "서버 버전, 네트워크 엔드포인트 및 권한 확인",
    libraryScanTitle: "라이브러리 스캔",
    libraryScanDesc: "Emby 서버에 메타데이터 갱신 및 신규 미디어 스캔 요청",
    connectedServers: "연결된 서버",
    addServer: "서버 추가",
    versionInfo: "버전 정보",
    appVersion: "플러그인 버전",
  },
};

function detectInitialLanguage(): LanguageCode {
  try {
    const saved = localStorage.getItem(LOCAL_STORAGE_LANG_KEY);
    if (saved && (saved in translations)) {
      return saved as LanguageCode;
    }
  } catch {
    // Ignore
  }

  if (typeof navigator !== "undefined" && navigator.language) {
    const nav = navigator.language.toLowerCase();
    if (nav.includes("tw") || nav.includes("hk") || nav.includes("hant")) {
      return "zh-TW";
    }
    if (nav.startsWith("zh")) {
      return "zh-CN";
    }
    if (nav.startsWith("ja")) {
      return "ja";
    }
    if (nav.startsWith("ko")) {
      return "ko";
    }
    if (nav.startsWith("es")) {
      return "es";
    }
    if (nav.startsWith("en")) {
      return "en";
    }
  }

  return "zh-CN";
}

interface LanguageContextType {
  language: LanguageCode;
  setLanguage: (lang: LanguageCode) => void;
  t: (key: string, defaultText?: string) => string;
}

const LanguageContext = createContext<LanguageContextType>({
  language: "zh-CN",
  setLanguage: () => {},
  t: (key: string, defaultText?: string) => defaultText || key,
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<LanguageCode>(detectInitialLanguage);

  const setLanguage = useCallback((lang: LanguageCode) => {
    setLanguageState(lang);
    try {
      localStorage.setItem(LOCAL_STORAGE_LANG_KEY, lang);
    } catch {
      // Ignore
    }
  }, []);

  const t = useCallback(
    (key: string, defaultText?: string): string => {
      const dict = translations[language] || translations["zh-CN"];
      if (dict && key in dict) {
        return dict[key];
      }
      const fallback = translations["en"];
      if (fallback && key in fallback) {
        return fallback[key];
      }
      return defaultText || key;
    },
    [language],
  );

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useTranslation() {
  return useContext(LanguageContext);
}
