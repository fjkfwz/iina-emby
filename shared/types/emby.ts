/**
 * Shared Emby Types & Data Models
 */

export interface EmbyUserConfiguration {
  PlayDefaultAudioTrack?: boolean;
  DisplayMissingEpisodes?: boolean;
  SubtitleMode?: "Smart" | "Default" | "Always" | "None" | string;
  OrderedViews?: string[];
  LatestItemsExcludes?: string[];
  MyMediaExcludes?: string[];
  HidePlayedInLatest?: boolean;
  HidePlayedInMoreLikeThis?: boolean;
  HidePlayedInSuggestions?: boolean;
  RememberAudioSelections?: boolean;
  RememberSubtitleSelections?: boolean;
  EnableNextEpisodeAutoPlay?: boolean;
  ResumeRewindSeconds?: number;
  IntroSkipMode?: "ShowButton" | "None" | string;
  EnableLocalPassword?: boolean;
  [key: string]: unknown;
}

export interface EmbyUserPolicy {
  IsAdministrator?: boolean;
  IsHidden?: boolean;
  IsHiddenRemotely?: boolean;
  IsHiddenFromUnusedDevices?: boolean;
  IsDisabled?: boolean;
  EnableContentDeletion?: boolean;
  EnableContentDownloading?: boolean;
  EnableMediaPlayback?: boolean;
  EnableAudioPlaybackTranscoding?: boolean;
  EnableVideoPlaybackTranscoding?: boolean;
  EnablePlaybackRemuxing?: boolean;
  EnableAllFolders?: boolean;
  EnableAllDevices?: boolean;
  EnableAllChannels?: boolean;
  EnableRemoteAccess?: boolean;
  EnableLiveTvManagement?: boolean;
  EnableLiveTvAccess?: boolean;
  EnableSubtitleDownloading?: boolean;
  EnableSubtitleManagement?: boolean;
  EnableSyncTranscoding?: boolean;
  EnableMediaConversion?: boolean;
  EnablePublicSharing?: boolean;
  EnableUserPreferenceAccess?: boolean;
  [key: string]: unknown;
}

export interface EmbyUser {
  Id: string;
  Name: string;
  ServerId?: string;
  Prefix?: string;
  DateCreated?: string;
  HasPassword?: boolean;
  HasConfiguredPassword?: boolean;
  LastLoginDate?: string;
  LastActivityDate?: string;
  Configuration?: EmbyUserConfiguration;
  Policy?: EmbyUserPolicy;
  [key: string]: unknown;
}

export interface EmbyServer {
  id: string;
  serverUrl: string;
  serverName: string;
  accessToken: string;
  userId: string;
  username: string;
  user?: EmbyUser;
  addedAt?: number;
  updatedAt?: number;
}

export interface EmbySystemInfo {
  ServerName?: string;
  Version?: string;
  Id?: string;
  OperatingSystem?: string;
  OperatingSystemDisplayName?: string;
  HasUpdateAvailable?: boolean;
  CanSelfUpdate?: boolean;
  CanSelfRestart?: boolean;
  SystemUpdateLevel?: string;
  PackageName?: string;
  ProgramDataPath?: string;
  ItemsByNamePath?: string;
  CachePath?: string;
  LogPath?: string;
  InternalMetadataPath?: string;
  TranscodingTempPath?: string;
  HttpServerPortNumber?: number;
  WebSocketPortNumber?: number;
  HttpsPortNumber?: number;
  SupportsHttps?: boolean;
  SupportsLibraryMonitor?: boolean;
  LocalAddress?: string;
  LocalAddresses?: string[];
  WanAddress?: string;
  RemoteAddresses?: string[];
}

export interface ClientIdentity {
  clientName: string;
  deviceName: string;
  deviceId: string;
  version: string;
}

export interface ParsedEmbyUrl {
  serverBase: string;
  itemId: string;
  apiKey: string;
}

export interface EmbyUserData {
  PlaybackPositionTicks?: number;
  PlayCount?: number;
  IsFavorite?: boolean;
  Played?: boolean;
  UnplayedItemCount?: number;
  Key?: string;
  [key: string]: unknown;
}

export interface EmbyMediaStream {
  Type?: "Audio" | "Video" | "Subtitle" | string;
  Codec?: string;
  Language?: string;
  DisplayTitle?: string;
  Title?: string;
  DisplayLanguage?: string;
  IsTextSubtitleStream?: boolean;
  IsExternal?: boolean;
  DeliveryUrl?: string;
  Index?: number;
  Path?: string;
  Width?: number;
  Height?: number;
  RealFrameRate?: number;
  AverageFrameRate?: number;
  VideoRange?: string;
  ExtendedVideoType?: string;
  ExtendedVideoSubType?: string;
  [key: string]: unknown;
}

export interface EmbyMediaSource {
  Id?: string;
  Name?: string;
  Path?: string;
  Protocol?: string;
  Size?: number;
  MediaStreams?: EmbyMediaStream[];
  RunTimeTicks?: number;
  DefaultAudioStreamIndex?: number;
  DefaultSubtitleStreamIndex?: number;
  [key: string]: unknown;
}

export interface EmbyPerson {
  Id?: string;
  Name?: string;
  Role?: string;
  Type?: "Actor" | "Director" | "Writer" | "Producer" | string;
  PrimaryImageTag?: string;
  [key: string]: unknown;
}

export interface EmbyChapterInfo {
  StartPositionTicks: number;
  Name?: string;
  ImageTag?: string;
  MarkerType?: "Chapter" | "IntroStart" | "IntroEnd" | "CreditsStart" | "OutroStart" | "OutroEnd" | string;
  ChapterType?: string;
  ChapterIndex?: number;
  [key: string]: unknown;
}

export interface EmbyItemMetadata {
  Id: string;
  Name?: string;
  OriginalTitle?: string;
  Type?: "Movie" | "Episode" | "Series" | "Season" | string;
  SeriesId?: string;
  SeasonId?: string;
  SeriesName?: string;
  ParentIndexNumber?: number;
  IndexNumber?: number;
  ProductionYear?: number;
  RunTimeTicks?: number;
  CommunityRating?: number;
  PremiereDate?: string;
  DateCreated?: string;
  Overview?: string;
  RecursiveItemCount?: number;
  ChildCount?: number;
  OfficialRating?: string;
  Genres?: string[];
  GenreItems?: Array<{ Name: string; Id?: string | number }>;
  People?: EmbyPerson[];
  MediaStreams?: EmbyMediaStream[];
  UserData?: EmbyUserData;
  MediaSources?: EmbyMediaSource[];
  Chapters?: EmbyChapterInfo[];
  ImageTags?: Record<string, string>;
  BackdropImageTags?: string[];
  ParentThumbItemId?: string;
  ParentThumbImageTag?: string;
  ParentBackdropItemId?: string;
  ParentBackdropImageTags?: string[];
  SeriesPrimaryImageTag?: string;
  ProviderIds?: Record<string, string>;
  [key: string]: unknown;
}

export interface RemoteSearchResult {
  Name?: string;
  ProviderIds?: Record<string, string>;
  ProductionYear?: number;
  IndexNumber?: number;
  IndexNumberEnd?: number;
  ParentIndexNumber?: number;
  PremiereDate?: string;
  ImageUrl?: string;
  SearchProviderName?: string;
  Overview?: string;
  AlbumArtist?: unknown;
  Artists?: unknown[];
  [key: string]: unknown;
}

export interface RemoteSearchQuery {
  SearchInfo: {
    Name?: string;
    OriginalTitle?: string;
    Year?: number;
    IndexNumber?: number;
    ParentIndexNumber?: number;
    PremiereDate?: string;
    ProviderIds?: Record<string, string>;
    [key: string]: unknown;
  };
  ItemId?: string;
  SearchProviderName?: string;
  IncludeDisabledProviders?: boolean;
}

export interface EmbyView {
  Id: string;
  Name: string;
  CollectionType?: "movies" | "tvshows" | "music" | "homevideos" | string;
  Type?: string;
  ImageTags?: Record<string, string>;
  [key: string]: unknown;
}

export interface EmbyPlaybackInfo {
  PlaySessionId?: string;
  MediaSources?: EmbyMediaSource[];
  [key: string]: unknown;
}

export interface EmbySeasonItem {
  Id: string;
  Name?: string;
  IndexNumber?: number;
  [key: string]: unknown;
}

export interface EmbyItemsResponse<T> {
  Items?: T[];
  TotalRecordCount?: number;
}
