/**
 * What a person's work recommends: the skills of Hanzo's catalogue that suit it,
 * so a new person starts with the ones that matter to them switched on rather
 * than a list of hundreds.
 *
 * The work is the account's own (Settings › Account, `Prefs.work`), one list for
 * both. Each work names the catalogue skills that read the part of the business
 * it lives in; `recommend` keeps the ones the catalogue serves today, in the
 * order given, so a skill the platform renames is left out and never offered.
 */
import { phrase } from '@hanzo/i18n'

import type { Catalogue, Entry } from './api/skills.ts'

/** What a person may say they work on, each label English and marked (`phrase`), drawn through `t`. */
export const WORK = [
  { id: 'director', label: phrase('Director or executive') },
  { id: 'engineering', label: phrase('Software engineering') },
  { id: 'data', label: phrase('Data science') },
  { id: 'design', label: phrase('Design') },
  { id: 'product', label: phrase('Product management') },
  { id: 'research', label: phrase('Research') },
  { id: 'writing', label: phrase('Writing') },
  { id: 'education', label: phrase('Education') },
  { id: 'operations', label: phrase('Operations') },
  { id: 'marketing', label: phrase('Marketing and sales') },
  { id: 'other', label: phrase('Something else') },
]

/** The most skills one work recommends: a set small enough to read before it is added. */
export const MOST = 8

/** The catalogue skills each work is recommended, best first. 'other' has none: it is a way to skip. */
export const RECOMMENDED: Record<string, readonly string[]> = {
  director: ['books_metrics', 'books_pnl', 'books_position', 'captable_summary', 'dataroom_documents', 'guide_suggest', 'team_members', 'billing_usage'],
  engineering: ['git_repos', 'git_runs', 'code_ask', 'code_search', 'deploy_applications', 'ci_runs', 'project_deployments', 'sandbox_sandbox'],
  data: ['dataset_dataset', 'dataset_lineage', 'eval_runs', 'eval_scores', 'knowledge_graph', 'metrics_query', 'experiment_experiment', 'research_runs'],
  design: ['studio_documents', 'studio_templates', 'studio_brands', 'studio_flows', 'studio_runs', 'content_board', 'videos_content', 'library_library'],
  product: ['project_project', 'task_board', 'task_issues', 'experiment_experiment', 'flag_defs', 'form_forms', 'guide_strategies', 'research_studies'],
  research: ['research_papers', 'research_studies', 'research_evidence', 'research_experiments', 'research_compare', 'benchmark_compare', 'knowledge_files', 'websearch_search'],
  writing: ['content_board', 'content_channels', 'content_lifecycle', 'translate_memory', 'library_library', 'team_docs', 'seo_rates', 'websearch_search'],
  education: ['knowledge_files', 'knowledge_graph', 'library_library', 'meet_session', 'form_forms', 'content_board', 'translate_memory', 'team_docs'],
  operations: ['task_board', 'team_members', 'books_inbox', 'tax_filings', 'compliance_status', 'billing_invoices', 'treasury_accounts', 'team_inbox'],
  marketing: ['marketing_summary', 'marketing_campaigns', 'marketing_audiences', 'marketing_broadcasts', 'marketing_sequences', 'campaign_metrics', 'social_posts', 'ad_summary'],
}

/** The catalogue's skills that `work` recommends, in the order the list gives them, at most `MOST`. */
export function recommend(work: string | undefined, catalogue: Catalogue | null): Entry[] {
  if (!work || !catalogue) return []
  const served = new Map(catalogue.skills.map((e) => [e.name, e]))
  return (RECOMMENDED[work] ?? []).flatMap((name) => served.get(name) ?? []).slice(0, MOST)
}
