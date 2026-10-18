/** Scripts pinned directly in the sidebar, shown first, one click away. */
export const FAVORITE_SCRIPT_IDS = ['multi_search_parser', 'google_ddosguard', 'tf_analysis'];

export interface ScriptGroupConfig {
  title: string;
  scriptIds: string[];
}

/** Everything else, grouped by how the script actually works (not by topic). */
export const SCRIPT_GROUPS: ScriptGroupConfig[] = [
  { title: 'Браузерные парсеры', scriptIds: ['clarity', 'parser_alisa', 'parser_meta', 'serch_links'] },
  { title: 'Автоматические / API', scriptIds: ['parser_wordstat_api', 'parser_domen', 'images_parser'] }
];

/** Fallback group for a script that appears in the manifest registry but isn't categorized above. */
export const OTHER_GROUP_TITLE = 'Другое';
