export { downloadTasksTable } from "./downloads";
export {
  mediaTasksTable,
  mediaTaskTracksTable,
  mediaHlsOutputsTable,
  mediaHlsResourcesTable,
  mediaCustomSubtitlesTable,
  QUALITY_PRESETS,
  QUALITY_CONFIGS,
  DEFAULT_OUTPUT_PROFILES,
} from "./queue";
export type { QualityPreset, QualityConfig, AudioTrackConfig, SubtitleTrackConfig, OutputProfile } from "./queue";
export { filesTable, userQuotasTable } from "./files";

import { downloadTasksTable } from "./downloads";
import {
  mediaTasksTable, mediaTaskTracksTable, mediaHlsOutputsTable,
  mediaHlsResourcesTable, mediaCustomSubtitlesTable,
} from "./queue";
import { filesTable, userQuotasTable } from "./files";

export const ALL_TABLES = [
  downloadTasksTable,
  mediaTasksTable,
  mediaTaskTracksTable,
  mediaHlsOutputsTable,
  mediaHlsResourcesTable,
  mediaCustomSubtitlesTable,
  filesTable,
  userQuotasTable,
];
