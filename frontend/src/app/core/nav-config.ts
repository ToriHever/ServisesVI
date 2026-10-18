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

/** One PrimeIcon per script, chosen to hint at what it actually does. */
export const SCRIPT_ICONS: Record<string, string> = {
  multi_search_parser: 'pi pi-search',
  google_ddosguard: 'pi pi-shield',
  tf_analysis: 'pi pi-chart-bar',
  clarity: 'pi pi-eye',
  parser_alisa: 'pi pi-comments',
  parser_meta: 'pi pi-tags',
  serch_links: 'pi pi-link',
  parser_wordstat_api: 'pi pi-chart-line',
  parser_domen: 'pi pi-globe',
  images_parser: 'pi pi-image'
};

export const DEFAULT_SCRIPT_ICON = 'pi pi-code';
