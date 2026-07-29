# Graph Report - . (2026-07-29)

## Corpus Check

- 356 files · ~292,004 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary

- 1914 nodes · 4211 edges · 107 communities (102 shown, 5 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 114 edges (avg confidence: 0.8)
- Token cost: 829,637 input · 0 output

## Community Hubs (Navigation)

- Metrics Upload Server Action
- Shell UI Primitives
- DCLogic Prototype Runtime
- Client Comparison Tables
- Report Link Access Gate
- Data Quality Screen
- Customers Reference Feature
- Outreach Ingest Action
- Form and Filter Controls
- Client Report Page
- Password Reset Flow
- Dashboard Analytics Charts
- Dashboard Page and Range
- Asset Type Interactions Chart
- Route Loading Skeletons
- Dialogs and Form Primitives
- Prototype Interaction Model
- Outreach Service Seam
- Follower and Connection Trends
- Client Detail and Uploads
- Login Screen
- Dashboard Analytics Engine
- Report Link Staff Actions
- Cadence and Median Helpers
- Date Range Picker
- Client Report Builder
- Resources Feature
- Print Report Cover
- Client Posts Service
- Clients List and Readers
- Error Boundaries and Sign-In
- Dashboard Screenshot (dash)
- Dropdown and Mode Toggle
- Posting Cadence Section
- Public Report View
- CSP and Route Access
- Analytics Ownership ADR Arc
- Dashboard Screenshot (dash2)
- Outreach Status Pills
- Paged Reads and Uploads
- Content Composition Handoffs
- Outreach Honesty Rules
- Client Create Action
- Status Badge and Result Summary
- Outreach Analytics Engine
- Client Detail Screenshot
- Env, Robots and Sitemap
- BI Posts Period Selection
- Ingestion Screenshot (JSON)
- Ingestion Result Screenshot
- Report Link Card
- Navigation Config
- Auth, Seam and Tenancy ADRs
- Client Outreach Page
- Date Picker Tests
- Outreach Movement Panel
- Logging
- Core Domain Vocabulary
- Outreach Decisions and Boundaries
- Design System and Fonts
- App and Print Layouts
- App Config and Metadata
- Client List Screenshot
- Auth Layout and Client Tabs
- Outreach Disclosure and KPIs
- Key Performance Section
- Outreach Vocabulary
- Report Links Workstream
- Posts and Print Pages
- Prospect Table
- Public Report Tests
- Dashboard Filter Bar
- Client Report Tests
- Stack and Access ADRs
- Connection Count Workstream
- Template Rebuild Plan
- Upload Page and Tabs
- Root Layout and Theme
- Outreach Upload Form
- Tabs Primitives
- Content Composition Section
- Outreach Summary
- Analytics Tests
- Post Attributes Service
- Client-Facing Read Boundary
- Prospect Columns
- Outreach Data Model
- Client Comparison Table
- KPI Cards
- Outreach Funnel
- Print Report Tests
- Clients Service Tests
- Report Link Security Model
- Viewer Parity Defects
- Outreach Breakdown Chart
- Interactions Comparison
- Outreach SQL Parity Tests
- SRS Brief and Invariants
- Outreach Sent Chart
- Clients Table Tests
- Upload Form Tests
- Report Links Plan and Migrations
- Print Token Tests
- Apple Icon Route
- Icon Route

## God Nodes (most connected - your core abstractions)

1. `cn()` - 157 edges
2. `paths` - 40 edges
3. `Button()` - 35 edges
4. `buildClientReport()` - 24 edges
5. `createClient()` - 21 edges
6. `BiPostRow` - 21 edges
7. `ReportPeriod` - 21 edges
8. `buildDashboardAnalytics()` - 19 edges
9. `readAllPages()` - 17 edges
10. `Input()` - 15 edges

## Surprising Connections (you probably didn't know these)

- `Read the source, do not render or screenshot` --semantically_similar_to--> `Self-hosted fonts (hermetic build)` [INFERRED] [semantically similar]
  docs/arcbase-dashboard-design-brief/README.md → src/app/fonts/README.md
- `BiPostRow — the frozen 18-field read firewall` --semantically_similar_to--> `Service Seam (src/services/*)` [INFERRED] [semantically similar]
  docs/specs/2026-07-25-full-analytics-ownership.md → docs/adr/0003-mock-first-service-seam.md
- `Aggregate-only client exposure (privacy boundary enforced in SQL)` --semantically_similar_to--> `Isolation via RLS, not app code` [INFERRED] [semantically similar]
  docs/adr/0012-outreach-system-per-client-snapshots.md → docs/adr/0005-multi-tenancy.md
- `App-owned public.posts (typed, client_id FK, unique linkedin_post_id)` --semantically_similar_to--> `SUPABASE_STAGING_TABLE configurable identifier` [INFERRED] [semantically similar]
  docs/adr/0010-arcbase-owns-analytics-end-to-end.md → docs/adr/0006-app-owned-posts-table.md
- `Known limitation: prospect deletions vanish with no tombstone` --semantically_similar_to--> `Four-state discipline (unparseable → NULL, never 0)` [INFERRED] [semantically similar]
  docs/decisions/2026-07-27-outreach-workstream-close-out.md → docs/specs/2026-07-25-full-analytics-ownership.md

## Import Cycles

- None detected.

## Hyperedges (group relationships)

- **The analytics-schema ownership arc (0006 → 0008 withdrawn → 0009 → 0010)** — docs_adr_0006_app_owned_posts_table_adr_0006, docs_adr_0008_arcbase_owns_analytics_schema_adr_0008, docs_adr_0009_arcbase_conforms_to_external_bi_schema_adr_0009, docs_adr_0010_arcbase_owns_analytics_end_to_end_adr_0010, docs_specs_2026_07_25_full_analytics_ownership_plan [EXTRACTED 1.00]
- **Report Link public access flow (URL token + Access Code → definer resolve → read grant → public report)** — docs_adr_0011_client_report_links_report_link, docs_adr_0011_client_report_links_access_code, docs_adr_0011_client_report_links_resolve_report_link, docs_specs_2026_07_25_client_report_links_read_grant, docs_adr_0011_client_report_links_report_status, docs_adr_0012_outreach_system_per_client_snapshots_aggregate_only_client_exposure [EXTRACTED 1.00]
- **ArcBase data-honesty discipline (four states, raw storage, read-time canonicalisation, no scores)** — docs_specs_2026_07_25_full_analytics_ownership_four_state_discipline, docs_adr_0009_arcbase_conforms_to_external_bi_schema_store_raw_canonicalise_at_read, docs_specs_2026_07_27_outreach_system_dashboard_outreach_vocab, docs_adr_0011_client_report_links_report_status, docs_decisions_2026_07_29_dashboard_date_picker_prior_window_baseline [INFERRED 0.85]
- **Client Report Links workstream (S1–S5 + the combined client-side pass)** — docs_handoffs_2026_07_25_report_links_s1_data_model_handoff, docs_handoffs_2026_07_25_report_links_s2_staff_management_handoff, docs_handoffs_2026_07_25_report_links_s3_public_gate_handoff, docs_handoffs_2026_07_25_report_links_s4_client_view_handoff, docs_handoffs_2026_07_25_report_links_s5_public_read_handoff, docs_handoffs_2026_07_25_report_links_client_side_handoff [EXTRACTED 1.00]
- **Outreach System workstream (S1 → S6, plus the S4a triage pass)** — docs_handoffs_2026_07_27_outreach_s1_data_model_handoff, docs_handoffs_2026_07_27_outreach_s2_add_data_tabs_handoff, docs_handoffs_2026_07_27_outreach_s3_client_tab_handoff, docs_handoffs_2026_07_27_outreach_s4_prospect_table_handoff, docs_handoffs_2026_07_27_outreach_s4a_column_triage_handoff, docs_handoffs_2026_07_27_outreach_s5_trends_handoff, docs_handoffs_2026_07_27_outreach_s6_report_link_aggregate_handoff [EXTRACTED 1.00]
- **ArcBase honesty discipline — describe, never grade; absence never coerced** — docs_handoffs_2026_07_25_posting_cadence_four_state_discipline, docs_handoffs_2026_07_25_posting_cadence_no_consistency_score, docs_handoffs_2026_07_25_content_composition_compositional_only, docs_handoffs_2026_07_25_dashboard_posts_kpi_and_weekday_measurement_not_recommendation, docs_handoffs_2026_07_27_outreach_s3_client_tab_terminal_stage_counts, docs_handoffs_2026_07_27_outreach_s5_trends_negative_delta_not_regression, docs_handoffs_2026_07_25_report_links_s4_client_view_non_graded_status [INFERRED 0.85]
- **ArcBase ingestion flow — select client, payload, followers, format-type review, write** — docs_arcbase_dashboard_design_brief_project_arcbase_dashboard_dc_ingestion_four_step_flow, docs_arcbase_dashboard_design_brief_project_arcbase_dashboard_dc_uploadmetrics, docs_arcbase_dashboard_design_brief_project_arcbase_dashboard_dc_format_type_review_step, docs_arcbase_dashboard_design_brief_project_arcbase_dashboard_dc_confirmwrite, docs_arcbase_dashboard_design_brief_project_arcbase_dashboard_dc_skipreview, docs_arcbase_dashboard_design_brief_project_srs_notes_schema_and_updates_scrape_file_schema [INFERRED 0.85]
- **SRS decisions raised by the confirmed scrape schema** — docs_arcbase_dashboard_design_brief_project_srs_notes_schema_and_updates_oi_02_post_format_type, docs_arcbase_dashboard_design_brief_project_srs_notes_schema_and_updates_post_date_normalization, docs_arcbase_dashboard_design_brief_project_srs_notes_schema_and_updates_engagement_rate_decision, docs_arcbase_dashboard_design_brief_project_srs_notes_schema_and_updates_saves_null_handling, docs_arcbase_dashboard_design_brief_project_srs_notes_schema_and_updates_dedup_key_linkedin_post_id, docs_arcbase_dashboard_design_brief_project_srs_notes_schema_and_updates_csv_rfc4180_robustness [EXTRACTED 1.00]
- **ArcBase self-hosted type system (families, variable subsets, licences)** — docs_arcbase_dashboard_design_brief_project_arcbase_dashboard_dc_arcbase_type_system, src_app_fonts_readme_self_hosted_fonts, src_app_fonts_readme_variable_font_subset, src_app_fonts_readme_sil_open_font_license, src_app_fonts_license_geist_ofl, src_app_fonts_license_intertight_ofl [INFERRED 0.85]
- **ArcBase Client List page composition (shell + table + create affordance + immutability disclosure)** — docs_arcbase_dashboard_design_brief_project_screenshots_client_detail_app_shell, docs_arcbase_dashboard_design_brief_project_screenshots_client_detail_client_list_table, docs_arcbase_dashboard_design_brief_project_screenshots_client_detail_add_new_client_cta, docs_arcbase_dashboard_design_brief_project_screenshots_client_detail_immutable_records_disclosure [EXTRACTED 1.00]
- **Internal staff-only trust signals (staging badge, sign-out session control, immutability notice, version footer)** — docs_arcbase_dashboard_design_brief_project_screenshots_client_detail_staging_env_badge, docs_arcbase_dashboard_design_brief_project_screenshots_client_detail_auth_gated_session_controls, docs_arcbase_dashboard_design_brief_project_screenshots_client_detail_immutable_records_disclosure, docs_arcbase_dashboard_design_brief_project_screenshots_client_detail_arcbase_brand_lockup [INFERRED 0.75]
- **Filter-Driven Analytics Flow (client + date range scope the KPIs and charts)** — docs_arcbase_dashboard_design_brief_project_screenshots_dash_client_filter, docs_arcbase_dashboard_design_brief_project_screenshots_dash_date_range_filter, docs_arcbase_dashboard_design_brief_project_screenshots_dash_kpi_card_grid, docs_arcbase_dashboard_design_brief_project_screenshots_dash_impressions_over_time_chart, docs_arcbase_dashboard_design_brief_project_screenshots_dash_engagement_rate_chart [INFERRED 0.85]
- **Persistent App Chrome (branding, nav, environment, theme, session)** — docs_arcbase_dashboard_design_brief_project_screenshots_dash_arcbase_wordmark, docs_arcbase_dashboard_design_brief_project_screenshots_dash_sidebar_nav, docs_arcbase_dashboard_design_brief_project_screenshots_dash_staging_badge, docs_arcbase_dashboard_design_brief_project_screenshots_dash_theme_toggle, docs_arcbase_dashboard_design_brief_project_screenshots_dash_session_controls [EXTRACTED 1.00]
- **Editorial Design Language Expressed Across the UI** — docs_arcbase_dashboard_design_brief_project_screenshots_dash_editorial_visual_language, docs_arcbase_dashboard_design_brief_project_screenshots_dash_uppercase_mono_labels, docs_arcbase_dashboard_design_brief_project_screenshots_dash_hero_impressions_card, docs_arcbase_dashboard_design_brief_project_screenshots_dash_delta_indicator [INFERRED 0.85]
- **Overview scoping flow: filters + freshness bound every metric surface** — docs_arcbase_dashboard_design_brief_project_screenshots_dash2_global_filter_bar, docs_arcbase_dashboard_design_brief_project_screenshots_dash2_last_sync_indicator, docs_arcbase_dashboard_design_brief_project_screenshots_dash2_kpi_card_grid, docs_arcbase_dashboard_design_brief_project_screenshots_dash2_impressions_over_time_chart, docs_arcbase_dashboard_design_brief_project_screenshots_dash2_engagement_rate_chart [INFERRED 0.85]
- **ArcBase editorial design system (monochrome + red accent, uppercase eyebrows, mixed sans/serif-italic titles, hero-weighted card hierarchy)** — docs_arcbase_dashboard_design_brief_project_screenshots_dash2_editorial_monochrome_visual_language, docs_arcbase_dashboard_design_brief_project_screenshots_dash2_uppercase_eyebrow_label_system, docs_arcbase_dashboard_design_brief_project_screenshots_dash2_mixed_sans_serif_italic_title, docs_arcbase_dashboard_design_brief_project_screenshots_dash2_hero_impressions_card, docs_arcbase_dashboard_design_brief_project_screenshots_dash2_arcbase_brand_lockup [INFERRED 0.85]
- **Auth-gated app shell chrome (sidebar nav, environment badge, theme toggle, session controls)** — docs_arcbase_dashboard_design_brief_project_screenshots_dash2_sidebar_navigation, docs_arcbase_dashboard_design_brief_project_screenshots_dash2_staging_environment_badge, docs_arcbase_dashboard_design_brief_project_screenshots_dash2_theme_toggle, docs_arcbase_dashboard_design_brief_project_screenshots_dash2_auth_session_controls [INFERRED 0.85]
- **Per-client upload provenance view: identity, counts, and the per-upload ledger** — docs_arcbase_dashboard_design_brief_project_screenshots_detail2_client_identity_header, docs_arcbase_dashboard_design_brief_project_screenshots_detail2_client_kpi_cards, docs_arcbase_dashboard_design_brief_project_screenshots_detail2_upload_history_table, docs_arcbase_dashboard_design_brief_project_screenshots_detail2_ingestion_delta_columns, docs_arcbase_dashboard_design_brief_project_screenshots_detail2_follower_snapshot_column, docs_arcbase_dashboard_design_brief_project_screenshots_detail2_upload_attribution_column [INFERRED 0.85]
- **ArcBase editorial visual language: mono uppercase labels, zero-padded counters, single red accent** — docs_arcbase_dashboard_design_brief_project_screenshots_detail2_monospace_label_language, docs_arcbase_dashboard_design_brief_project_screenshots_detail2_zero_padded_counter, docs_arcbase_dashboard_design_brief_project_screenshots_detail2_red_accent_system, docs_arcbase_dashboard_design_brief_project_screenshots_detail2_client_detail_screen [INFERRED 0.80]
- **ArcBase Manual Post-Metrics Ingestion Flow** — docs_arcbase_dashboard_design_brief_project_screenshots_ingest_json_select_client_step, docs_arcbase_dashboard_design_brief_project_screenshots_ingest_json_choose_input_step, docs_arcbase_dashboard_design_brief_project_screenshots_ingest_json_paste_json_mode, docs_arcbase_dashboard_design_brief_project_screenshots_ingest_json_csv_upload_mode, docs_arcbase_dashboard_design_brief_project_screenshots_ingest_json_post_metrics_payload_schema [EXTRACTED 1.00]
- **ArcBase Auth-Gated App Shell Chrome** — docs_arcbase_dashboard_design_brief_project_screenshots_ingest_json_sidebar_nav_shell, docs_arcbase_dashboard_design_brief_project_screenshots_ingest_json_staging_environment_badge, docs_arcbase_dashboard_design_brief_project_screenshots_ingest_json_theme_toggle_control, docs_arcbase_dashboard_design_brief_project_screenshots_ingest_json_auth_gated_session_header, docs_arcbase_dashboard_design_brief_project_screenshots_ingest_json_editorial_mono_design_language [INFERRED 0.85]
- **Post-upload ingestion result flow (section label to counters to next action)** — docs_arcbase_dashboard_design_brief_project_screenshots_result_add_li_post_metrics_route, docs_arcbase_dashboard_design_brief_project_screenshots_result_upload_result_summary, docs_arcbase_dashboard_design_brief_project_screenshots_result_inserted_updated_unchanged_counters, docs_arcbase_dashboard_design_brief_project_screenshots_result_next_action_pair, docs_arcbase_dashboard_design_brief_project_screenshots_result_idempotent_upsert_ingestion [INFERRED 0.85]
- **ArcBase auth-gated app shell chrome (sidebar, header, wordmark, provenance footer)** — docs_arcbase_dashboard_design_brief_project_screenshots_result_sidebar_navigation, docs_arcbase_dashboard_design_brief_project_screenshots_result_app_shell_header, docs_arcbase_dashboard_design_brief_project_screenshots_result_arcbase_by_arcbound_wordmark, docs_arcbase_dashboard_design_brief_project_screenshots_result_version_provenance_footer, docs_arcbase_dashboard_design_brief_project_screenshots_result_staging_environment_badge [INFERRED 0.85]
- **ArcBase visual language: dark canvas, single red accent, uppercase mono labels, two-tone italic headings** — docs_arcbase_dashboard_design_brief_project_screenshots_result_dark_theme_red_accent, docs_arcbase_dashboard_design_brief_project_screenshots_result_uppercase_mono_label_system, docs_arcbase_dashboard_design_brief_project_screenshots_result_mixed_weight_italic_heading, docs_arcbase_dashboard_design_brief_project_screenshots_result_active_route_accent_marker [INFERRED 0.85]

## Communities (107 total, 5 thin omitted)

### Community 0 - "Metrics Upload Server Action"

Cohesion: 0.05
Nodes (46): envelopeSchema, ingestMetricsAction(), parseResolved(), { ingestMock, getClientMock, parseJsonMock, parseCsvMock }, ROWS, ADR-0009, posts, IngestFlow() (+38 more)

### Community 1 - "Shell UI Primitives"

Cohesion: 0.06
Nodes (55): Wordmark(), MobileNav(), Avatar(), AvatarBadge(), AvatarFallback(), AvatarGroup(), AvatarGroupCount(), AvatarImage() (+47 more)

### Community 2 - "DCLogic Prototype Runtime"

Cohesion: 0.07
Nodes (46): boot(), cdnScriptFor(), collectProps(), compileAttr(), compileTemplate(), contentKey(), createComponentFactory(), createExternalModules() (+38 more)

### Community 3 - "Client Comparison Tables"

Cohesion: 0.09
Nodes (25): columns, ComparisonColumnMeta, DEFAULT_SORTING, ClientsTable(), DataQualityTable(), formatDate(), nothingCameBack(), ADR-0012 (+17 more)

### Community 4 - "Report Link Access Gate"

Cohesion: 0.09
Nodes (35): GateState, submitAccessCode(), { grantMock, clearMock, bumpMock, currentMock }, IDLE, { redirectMock }, { resolveMock }, MESSAGES, ReportLinkGate() (+27 more)

### Community 5 - "Data Quality Screen"

Cohesion: 0.08
Nodes (24): DataQualityPage(), metadata, DataQualitySummary(), HEALTHY, NO_RATE_FINDINGS, RateReconciliationPanel(), scaleSentence(), DataQualityOptions (+16 more)

### Community 6 - "Customers Reference Feature"

Cohesion: 0.10
Nodes (25): createCustomerAction(), CustomerFormState, customerSchema, deleteCustomerAction(), updateCustomerAction(), metadata, CustomerDetailPage(), metadata (+17 more)

### Community 7 - "Outreach Ingest Action"

Cohesion: 0.08
Nodes (24): envelopeSchema, ingestOutreachAction(), OutreachIngestResult, { ingestMock, parseMock }, ROWS, ADR-0012, ADR-0012, unknownColumnWarning() (+16 more)

### Community 8 - "Form and Filter Controls"

Cohesion: 0.11
Nodes (19): DASHBOARD_PRESETS, Action, INITIAL, FormatReview(), ClientOption, EXPECTED_COLUMNS, ClientOption, ToggleButton() (+11 more)

### Community 9 - "Client Report Page"

Cohesion: 0.09
Nodes (15): ClientReportPage(), metadata, ImpressionsByMonthChart(), ImpressionsByWeekdayChart(), DATA, JULY, PrintReport(), ReportPeriodPicker() (+7 more)

### Community 10 - "Password Reset Flow"

Cohesion: 0.11
Nodes (23): metadata, metadata, ResetPasswordForm(), schema, Values, schema, UpdatePasswordForm(), Values (+15 more)

### Community 11 - "Dashboard Analytics Charts"

Cohesion: 0.13
Nodes (17): DATA, WeekdayImpressionsChart(), ChartScope(), ALL_TIME, JULY, ChartConfig, ChartContainer(), ChartContext (+9 more)

### Community 12 - "Dashboard Page and Range"

Cohesion: 0.11
Nodes (26): DashboardPage(), DEFAULT_SELECTION, metadata, normalizeRange(), EMPTY, { state }, windowFor(), EngagementChart() (+18 more)

### Community 13 - "Asset Type Interactions Chart"

Cohesion: 0.12
Nodes (12): AssetLegend(), InteractionsByAssetChart(), DATA, JULY, PostTypeDistributionChart(), DATA, JULY, InteractionsByAsset() (+4 more)

### Community 14 - "Route Loading Skeletons"

Cohesion: 0.09
Nodes (12): kpiKeys, kpiKeys, panelKeys, rowKeys, rowKeys, cardKeys, rowKeys, kpiKeys (+4 more)

### Community 15 - "Dialogs and Form Primitives"

Cohesion: 0.18
Nodes (19): INITIAL, INITIAL, schema, Values, Button(), buttonVariants, Calendar(), CalendarDayButton() (+11 more)

### Community 16 - "Prototype Interaction Model"

Cohesion: 0.08
Nodes (28): addClient, addResource, buildChart, Client detail with upload-history table, confirmWrite, doLogin, Post format-type review step, Immutable records (no edit, no delete) (+20 more)

### Community 17 - "Outreach Service Seam"

Cohesion: 0.12
Nodes (20): GET(), createClient(), ingestSummarySchema, latestSnapshot(), listOutreachUploads(), PROSPECT_COLUMNS, prospectPageReader(), ProspectRow (+12 more)

### Community 18 - "Follower and Connection Trends"

Cohesion: 0.12
Nodes (16): CONNECTION_LABELS, ConnectionsTrendPanel(), CountChartPoint, CountTrendLabels, CountTrendPanel(), FOLLOWER_LABELS, FollowerTrendPanel(), formatDate() (+8 more)

### Community 19 - "Client Detail and Uploads"

Cohesion: 0.15
Nodes (15): ClientDetailPage(), metadata, formatDate(), uploads, UploadHistory(), connectionsTrend(), followerTrend(), connectionsDelta() (+7 more)

### Community 20 - "Login Screen"

Cohesion: 0.10
Nodes (18): LoginPage(), metadata, contrast(), INK, linear(), luminance(), media, { mocks } (+10 more)

### Community 21 - "Dashboard Analytics Engine"

Cohesion: 0.18
Nodes (24): resolveWindow(), buildClientComparison(), buildDashboardAnalytics(), COMPARISON_UNAVAILABLE, currentWindow(), effectiveMs(), formatShortDate(), formatSync() (+16 more)

### Community 22 - "Report Link Staff Actions"

Cohesion: 0.16
Nodes (18): createReportLinkAction(), errorState(), revokeReportLinkAction(), rotateReportLinkAction(), IDLE, { issueMock, rotateMock, revokeMock, revalidateMock }, getReportLink(), issueReportLink() (+10 more)

### Community 23 - "Cadence and Median Helpers"

Cohesion: 0.14
Nodes (15): median(), BiPostRow, estMs(), DatedRow, buildCadence(), postsByMonth(), postsByWeek(), round1() (+7 more)

### Community 24 - "Date Range Picker"

Cohesion: 0.12
Nodes (16): Calendar, DateRangePicker(), DateRangePickerProps, DateRangePreset, PresetButton(), startOfLocalDay(), Popover(), PopoverContent() (+8 more)

### Community 25 - "Client Report Builder"

Cohesion: 0.19
Nodes (22): bucketLabel(), bucketPlan, periodRange(), buildClientReport(), BuildOptions, ClientReportOptions, customPeriodLabel(), groupByFormat() (+14 more)

### Community 26 - "Resources Feature"

Cohesion: 0.15
Nodes (15): createResourceAction(), ResourceFormState, resourceSchema, metadata, ResourcesPage(), AddResourceDialog(), AddResourceForm(), ResourcesList() (+7 more)

### Community 27 - "Print Report Cover"

Cohesion: 0.13
Nodes (17): displayUrl(), formatLongDate(), MONTH_NAMES, periodInWords(), ReportCover(), FIGURES, JULY, NOW (+9 more)

### Community 28 - "Client Posts Service"

Cohesion: 0.16
Nodes (19): buildReportFromSource(), latestCount(), readClientPostRows(), ClientPostsOptions, getClientPosts(), nullableNum(), num(), publishDate() (+11 more)

### Community 29 - "Clients List and Readers"

Cohesion: 0.13
Nodes (18): ClientsPage(), metadata, AddClientDialog(), asPage(), dashboardPageReader(), postPageReader(), readAllPostRows(), clientPageReader() (+10 more)

### Community 30 - "Error Boundaries and Sign-In"

Cohesion: 0.17
Nodes (11): schema, Values, ErrorState(), ErrorStateProps, Card(), CardAction(), CardContent(), CardDescription() (+3 more)

### Community 31 - "Dashboard Screenshot (dash)"

Cohesion: 0.13
Nodes (20): Add LI Post Metrics Ingestion Entry Point, Auth-Gated App Shell (sidebar + top bar), ArcBase Wordmark 'BY ARCBOUND', All Clients Selector, ArcBase Post Analytics Dashboard Screenshot, Date Range Selector (Last 7 Days), Period-over-Period Delta Indicator (vs prior 30 days), Editorial Monochrome + Red Accent Visual Language (+12 more)

### Community 32 - "Dropdown and Mode Toggle"

Cohesion: 0.15
Nodes (13): columns, StatusBadge(), DropdownMenu(), DropdownMenuCheckboxItem(), DropdownMenuContent(), DropdownMenuItem(), DropdownMenuLabel(), DropdownMenuRadioItem() (+5 more)

### Community 33 - "Posting Cadence Section"

Cohesion: 0.13
Nodes (13): AxisLabel, axisLabels(), CadenceView, CAPTION, formatDate(), MarksChart(), PostingCadence(), SHORT_MONTHS (+5 more)

### Community 34 - "Public Report View"

Cohesion: 0.17
Nodes (12): DIRECTION_COPY, formatIsoDate(), formatUtcDate(), impressionsDirection(), ReportFreshness, ReportStatus(), SHORT_MONTHS, cadence() (+4 more)

### Community 35 - "CSP and Route Access"

Cohesion: 0.18
Nodes (13): ADR-0011, buildCsp(), CspOptions, isPublicRoute(), PUBLIC_ASSET_ROUTES, PUBLIC_ROUTES, routeAccess(), RouteDecision (+5 more)

### Community 36 - "Analytics Ownership ADR Arc"

Cohesion: 0.16
Nodes (19): ADR 0008 — ArcBase owns the analytics schema (Withdrawn), ADR 0009 — ArcBase conforms to the external BI schema, bi.linkedin_post_latest view (Shay's BI layer), public.linkedin_posts_staging (raw all-text landing table), Downstream name-match attribution (clients.name = cleaned post_name), ADR 0010 — ArcBase owns analytics end-to-end (Power BI retired), Attribution by client_id FK stamped at ingest, Relative-age post-date resolver (src/lib/post-date.ts) (+11 more)

### Community 37 - "Dashboard Screenshot (dash2)"

Cohesion: 0.16
Nodes (19): dash2.png — ArcBase Post Analytics dashboard screenshot, ADD LI POST METRICS nav entry (ingestion entry point), ArcBase / BY ARCBOUND brand lockup, Auth session controls (SK avatar + SIGN OUT), CLIENT LIST nav entry, Directional delta indicator (red triangle up/down with percent, vs. prior 30 days), Editorial monochrome visual language with single red accent, Engagement rate chart (black line) (+11 more)

### Community 38 - "Outreach Status Pills"

Cohesion: 0.16
Nodes (10): ConnectionStatusPill(), IcpSegPill(), is(), Pill(), ReplyStatusPill(), Tone, TONE_CLASS, ADR-0009 (+2 more)

### Community 39 - "Paged Reads and Uploads"

Cohesion: 0.20
Nodes (13): PageReader, PageResult, readAllPages(), calls, Row, latestUploadByClient(), listAllUploads(), listUploads() (+5 more)

### Community 40 - "Content Composition Handoffs"

Cohesion: 0.14
Nodes (18): buildContentComposition — pure composition function over report rows, Compositional-only discipline, Handoff — Content Composition Report Section (feature B), Hashtag case-folding canonicalisation, In-text URL vs post_url distinction, 1,300-character 'see more' fold — the sole permitted constant, estimated_post_date-only dating rule, Handoff — Dashboard Posts KPI + weekday chart + has-data gate (A/B/C) (+10 more)

### Community 41 - "Outreach Honesty Rules"

Cohesion: 0.14
Nodes (18): No consistency score, A genuine measured zero is not an empty state, weekdayUndatedPosts — excluded-and-counted undated posts, latestSnapshot paging past PostgREST's silent 1000-row cap, buildOutreachAnalytics — pure funnel + breakdowns over prospect rows, Connections-accepted defect — funnel step derived from Stage index, not Connection Status, Handoff — Outreach System S3: the Outreach client tab, outreach-vocab — canonicalReply / canonicalStage / parseCount (+10 more)

### Community 42 - "Client Create Action"

Cohesion: 0.14
Nodes (12): ClientFormState, clientSchema, createClientAction(), ADR-0007, ADR-0009, AddClientForm(), columns, displayLinkedInUrl() (+4 more)

### Community 43 - "Status Badge and Result Summary"

Cohesion: 0.14
Nodes (10): STATUS, ResultSummary(), FluidSceneProps, parseHexColor(), RubberFluid(), RubberFluidProps, Badge(), badgeVariants (+2 more)

### Community 44 - "Outreach Analytics Engine"

Cohesion: 0.19
Nodes (17): canonicalStage(), isKnownStage(), matchKey(), parseCount(), buildOutreachAnalytics(), distinct(), fillSentMonths(), isBlank() (+9 more)

### Community 45 - "Client Detail Screenshot"

Cohesion: 0.18
Nodes (17): Breadcrumb Back-Link (← CLIENT LIST), Client Detail Screen (scrolled, upload history visible), Client Identity Header (name + linkedin.com/in/ handle), Client KPI Cards (Uploads / Posts / Followers), Environment Disclosure Pattern (STAGING shown in chrome and footer), Per-Upload Follower Snapshot Column, Horizontally Scrollable Wide Table (clipped BY column + scrollbars), Ingestion Delta Columns (Ins. / Upd. / Unch.) (+9 more)

### Community 46 - "Env, Robots and Sitemap"

Cohesion: 0.20
Nodes (9): robots(), sitemap(), Env, envSchema, parseEnv(), getSiteURL(), buildRobots(), buildSitemap() (+1 more)

### Community 47 - "BI Posts Period Selection"

Cohesion: 0.15
Nodes (13): PagedRead, PlacedRow, selectPeriodPlaceable(), selectPeriodRows(), ALL, CUSTOM, JULY, Q3 (+5 more)

### Community 48 - "Ingestion Screenshot (JSON)"

Cohesion: 0.17
Nodes (16): ADD LI POST METRICS Nav Item, Auth-Gated Session Header (avatar + SIGN OUT), Step 02 - Choose Input, Client Attribution At Ingest, CSV Upload Input Mode, Editorial Mono-Label Design Language, Numbered Step Wizard Pattern, Paste JSON Input Mode (+8 more)

### Community 49 - "Ingestion Result Screenshot"

Cohesion: 0.20
Nodes (16): ArcBase Ingestion Result Screen (design reference screenshot), Active Route Accent Marker (red label + left edge bar), Add LI Post Metrics Ingestion Route, App Shell Header (title, environment badge, theme toggle, avatar, sign out), ArcBase by Arcbound Wordmark, Dark Terminal Theme with Single Red Accent, Idempotent Upsert Ingestion Outcome, Inserted / Updated / Unchanged Counter Triplet (+8 more)

### Community 50 - "Report Link Card"

Cohesion: 0.15
Nodes (10): ReportLinkActionState, CardViewProps, formatDate(), IDLE, ReportLinkCard(), ReportLinkCardView(), ACTIVE, baseProps (+2 more)

### Community 51 - "Navigation Config"

Cohesion: 0.20
Nodes (11): isNavItemActive(), NavItem, navItems, PageTitle, resolvePageTitle(), ADR-0012, ADR-0012, SideNav() (+3 more)

### Community 52 - "Auth, Seam and Tenancy ADRs"

Cohesion: 0.23
Nodes (15): ADR 0002 — Supabase as the sole auth strategy, AuthStrategy single-entry enum, ADR 0003 — Mock-first typed Service Seam, Active Organization (HTTP-only cookie selector, never the boundary), ADR 0005 — Multi-tenancy: organizations, memberships, and RLS, Isolation via RLS, not app code, Two-tier roles: Org Role (owner/admin/member) + Platform Role (superadmin), ADR 0006 — App-owned posts table with a configurable identifier (+7 more)

### Community 53 - "Client Outreach Page"

Cohesion: 0.22
Nodes (12): ClientOutreachPage(), metadata, readMovement(), replyNote(), ADR-0009, ADR-0012, OutreachNoSnapshot(), OutreachTruncated() (+4 more)

### Community 54 - "Date Picker Tests"

Cohesion: 0.14
Nodes (7): DASHBOARD_PRESETS, open(), push, replace, REPORT_PRESETS, TODAY, trigger()

### Community 55 - "Outreach Movement Panel"

Cohesion: 0.20
Nodes (10): formatDate(), n(), OutreachMovementPanel(), signed(), Step(), MOVEMENT, OK, OutreachMovement (+2 more)

### Community 56 - "Logging"

Cohesion: 0.20
Nodes (7): logger, createLogger(), Logger, LoggerOptions, LogLevel, LogLevelNumber, NOTE: A tracking system such as Sentry should replace the console

### Community 57 - "Core Domain Vocabulary"

Cohesion: 0.16
Nodes (14): Client = tracked LinkedIn subject, not a tenant, ingest_metrics RPC (SECURITY DEFINER, all-or-nothing transaction), Outreach Snapshot (immutable whole-file upload, never upserted), Prospect (24-column CRM row: identity, qualification, pipeline), Connection Count (optional per-scrape field, full parity with Follower Count), Service → Dataset north-star model (deferred), Known limitation: prospect deletions vanish with no tombstone, Confirmed 15-column scrape schema (RFC-4180 quoted CSV) (+6 more)

### Community 58 - "Outreach Decisions and Boundaries"

Cohesion: 0.23
Nodes (14): Store raw exactly as received; canonicalise only at read, Report Link (revocable capability bound to one Client, not a user), ADR 0012 — The Outreach System: per-Client prospect snapshots, Aggregate-only client exposure (privacy boundary enforced in SQL), Decision — Multi-service dashboard (north star) + LinkedIn Connection Count, Outreach System — workstream close-out (S1–S6 landed), Funnel rule duplicated in TypeScript and SQL (price of the privacy boundary), Process lesson: never run two executers in one worktree (+6 more)

### Community 59 - "Design System and Fonts"

Cohesion: 0.18
Nodes (14): ArcBase type system (Inter Tight display, Geist body, Geist Mono labels), ArcBase Dashboard prototype Component (DCLogic), Light/dark CSS custom-property theme tokens, toggleTheme, Claude Design handoff bundle, Read the source, do not render or screenshot, Pixel-perfect recreation, not code transplant, Geist font licence — OFL 1.1 (c) 2023 Vercel / basement.studio (+6 more)

### Community 60 - "App and Print Layouts"

Cohesion: 0.23
Nodes (8): AppLayout(), metadata, SettingsPage(), PrintLayout(), SettingsTabs(), authDisabled, getSession, { state }

### Community 61 - "App Config and Metadata"

Cohesion: 0.21
Nodes (6): size, computeAuthDisabled(), Config, isSupabaseConfigured, signOut(), AuthStrategy

### Community 62 - "Client List Screenshot"

Cohesion: 0.22
Nodes (13): Add New Client Primary CTA, ArcBase App Shell (persistent sidebar + header), ArcBase "by Arcbound" Brand Lockup, Auth-Gated Session Controls (user avatar + Sign Out), Client List Table (Client / LinkedIn URL / Posts), Dark Monospace Visual Language (near-black surfaces, red accent, uppercase mono labels), Filename/Content Mismatch: client-detail.png shows the Client List page, Immutable Records Disclosure ("006 clients · records are immutable") (+5 more)

### Community 63 - "Auth Layout and Client Tabs"

Cohesion: 0.23
Nodes (4): ClientTabs(), pathname, paths, ADR-0012

### Community 64 - "Outreach Disclosure and KPIs"

Cohesion: 0.21
Nodes (6): OutreachDisclosure(), CLEAN, OutreachKpis(), ANALYTICS, ADR-0012, OutreachAnalytics

### Community 65 - "Key Performance Section"

Cohesion: 0.21
Nodes (8): Cell(), COLUMNS, FooterLine(), format(), KeyPerformance(), GRID, NO_FOLLOWERS, MatrixRow

### Community 66 - "Outreach Vocabulary"

Cohesion: 0.21
Nodes (11): OUTREACH_STAGES, REPLY_BUCKET_LABELS, REPLY_BY_KEY, ReplyBucket, replyDate(), STAGE_BY_KEY, OBSERVED_REPLY, ADR-0009 (+3 more)

### Community 67 - "Report Links Workstream"

Cohesion: 0.23
Nodes (12): Handoff — Report Links client-side public experience (S3 + S4 combined), Report Status strip — freshness + non-graded activity, Handoff — Report Links S1: data model + functions + service seam, public.report_links capability table, resolve_report_link — SECURITY DEFINER verify-with-lockout, Handoff — Report Links S2: staff management UI (Create / Rotate / Revoke), One-time Access Code surfacing (unrecoverable after display), ReportLinkCard — staff Create / Rotate / Revoke panel (+4 more)

### Community 68 - "Posts and Print Pages"

Cohesion: 0.29
Nodes (8): ClientPostsPage(), metadata, ClientReportPrintPage(), metadata, ADR-0007, AnalyticsTruncated(), AnalyticsUnavailable(), getClient

### Community 69 - "Prospect Table"

Cohesion: 0.18
Nodes (5): presentValues(), ProspectTable(), bodyRows(), names(), ROWS

### Community 70 - "Public Report Tests"

Cohesion: 0.20
Nodes (6): cadence(), FRESH, { grantMock, sourceMock }, makeReport(), openPicker(), SOURCE

### Community 71 - "Dashboard Filter Bar"

Cohesion: 0.18
Nodes (5): DashboardFilters(), PRESET_DAYS, CLIENTS, replace, TODAY

### Community 72 - "Client Report Tests"

Cohesion: 0.20
Nodes (10): ALL_TIME, HISTORY, JULY, NOW, pagesOf(), Q3, row(), { state } (+2 more)

### Community 73 - "Stack and Access ADRs"

Cohesion: 0.20
Nodes (10): ADR 0001 — Replace MUI Joy with Tailwind + shadcn/ui, Owned component source (no runtime design-system dependency), Service Seam (src/services/*), ADR 0004 — RSC + Server Actions as the default data pattern, RSC reads, Server Action writes (zod-validated), Access Code (bcrypt-hashed out-of-band second factor), resolve_report_link SECURITY DEFINER function (token+code, lockout), Spec: Multi-tenant foundation (organizations, memberships, RLS) (+2 more)

### Community 74 - "Connection Count Workstream"

Cohesion: 0.22
Nodes (10): Four-state discipline (could-not-read / truncated / genuine zero / not applicable), SQL pair convention — paste script ⇄ migration twin registered in PAIRS, AverageLine trap — a point-in-time count must not read '· all time' or approximate, Handoff — Connection Count: trim derived per-1K figures to a raw count, Connections is a raw count everywhere; no per-1K derived figure, uploads.connections_count — nullable per-Upload count, countTrend / CountTrendPanel generalisation of follower-trend, Handoff — LinkedIn Connection Count (full parity with Follower Count) (+2 more)

### Community 75 - "Template Rebuild Plan"

Cohesion: 0.22
Nodes (10): PUBLIC_ROUTES allowlist extended with the /r base, serverActions.bodySizeLimit raised above the measured 1.42 MB export, Handoff — Outreach System S2: 'Add Data' reshape + Outreach upload tab, UploadTabs — shadcn Tabs host for LinkedIn + Outreach forms, RBAC primitives — Role, hasRole, requireRole, RoleGuard, Customers Reference Feature — RSC + TanStack Table + Server Actions, Dashboard Shell — side nav, top bar, user menu, nav-config, Web App Template Rebuild — Implementation Plan (+2 more)

### Community 76 - "Upload Page and Tabs"

Cohesion: 0.24
Nodes (6): metadata, UploadPage(), UploadEmptyState(), clients, { metricsActionMock, outreachActionMock }, UploadTabs()

### Community 77 - "Root Layout and Theme"

Cohesion: 0.24
Nodes (6): geist, geistMono, interTight, metadata, ThemeProvider(), Toaster()

### Community 78 - "Outreach Upload Form"

Cohesion: 0.20
Nodes (4): OutreachUploadForm(), { actionMock }, clients, ADR-0012

### Community 79 - "Tabs Primitives"

Cohesion: 0.40
Nodes (7): ClientOption, ProfileForm(), Tabs(), TabsContent(), TabsList(), tabsListVariants, TabsTrigger()

### Community 80 - "Content Composition Section"

Cohesion: 0.27
Nodes (4): ContentComposition(), FULL, textlessDisclosure(), ContentComposition

### Community 81 - "Outreach Summary"

Cohesion: 0.27
Nodes (5): formatIsoDate(), OutreachSummary(), SHORT_MONTHS, ADR-0012, ReportLinkOutreach

### Community 82 - "Analytics Tests"

Cohesion: 0.20
Nodes (8): ALL, { biState }, NOW, R30, R7, R90, ROWS, ADR-0009

### Community 83 - "Post Attributes Service"

Cohesion: 0.27
Nodes (7): chunk(), listPostAttributes(), { state }, ADR-0009, ADR-0009, ReportLinkSource, PostAttributes

### Community 84 - "Client-Facing Read Boundary"

Cohesion: 0.22
Nodes (9): PublicReport wrapper — report sections stripped of staff chrome, Staff chrome omission on the client-facing view, Handoff — Report Links S5: token-scoped public report read (read-grant), report_link_read(token, grant) — SECURITY DEFINER single-client read, Staff-only PII boundary for prospect rows, Concurrent executers in one worktree — a named process hazard, Handoff — Outreach System S6: Report Link aggregate exposure, Omitted-line hazard of create-or-replace on a live definer function (+1 more)

### Community 85 - "Prospect Columns"

Cohesion: 0.22
Nodes (5): ProspectColumnMeta, prospectColumns, SOURCE_ORDER, ADR-0009, ADR-0012

### Community 86 - "Outreach Data Model"

Cohesion: 0.32
Nodes (8): Handoff — Outreach System S1: data model + ingest, ingest_outreach — all-or-nothing SECURITY DEFINER snapshot ingest, No unique key on any prospect source column, public.outreach_prospects — 24 raw text source columns, public.outreach_uploads — immutable snapshot header, parse-outreach — pure papaparse + Zod parser over 24 exact headers, 25th-column warning — unknown headers reported, never silently dropped, Unmapped vocabulary values disclosed verbatim, never guessed or bucketed

### Community 87 - "Client Comparison Table"

Cohesion: 0.29
Nodes (6): ClientComparisonTable(), comparison(), row(), ADR-0009, ClientComparison, ClientComparisonRow

### Community 88 - "KPI Cards"

Cohesion: 0.32
Nodes (4): KpiCards(), HERO, KPIS, Kpi

### Community 89 - "Outreach Funnel"

Cohesion: 0.32
Nodes (5): OutreachFunnel(), FUNNEL, ADR-0012, ADR-0012, OutreachFunnelStep

### Community 91 - "Clients Service Tests"

Cohesion: 0.29
Nodes (4): chainable(), mockSupabase(), orderCalls, { supabase, probe }

### Community 92 - "Report Link Security Model"

Cohesion: 0.29
Nodes (7): Anon read-path gap — RLS blocks the anonymous public route, Signed httpOnly gate cookie (report-link-session), No auth oracle — fail closed with one generic error, Access Code stored only as a bcrypt hash; token stored as-is, Read grant — short-lived sha256-hashed bearer secret minted on success only, public.report_link_grants table (per-viewer-session grants), URL + Access Code two-factor preserved all the way to the data

### Community 93 - "Viewer Parity Defects"

Cohesion: 0.33
Nodes (7): Aggregates never rescope to the table's filters, Handoff — Outreach System S4: the prospect table (viewer parity), OutreachPill — status pill coloured from canonicalReply, labelled with raw text, ProspectTable — TanStack table over all 24 source columns, TanStack default substring filter defect — 'Connected' also matched 'Not Connected', Reference viewer's pill regex bug — 'Not Interested' matches 'Interested' and reads green, Hiding a column must not narrow the search

### Community 94 - "Outreach Breakdown Chart"

Cohesion: 0.29
Nodes (3): OutreachBreakdownChart(), STAGE, ADR-0012

### Community 95 - "Interactions Comparison"

Cohesion: 0.33
Nodes (5): InteractionsComparison(), ALL_TIME_ROWS, ROWS, visibleInteractionRows(), InteractionsRow

### Community 96 - "Outreach SQL Parity Tests"

Cohesion: 0.29
Nodes (3): OUTREACH_SQL, ADR-0012, OutreachProspect

### Community 97 - "SRS Brief and Invariants"

Cohesion: 0.40
Nodes (6): Client identity = normalized linkedin_url (resolves OI-01), ArcBase Dashboard — SRS working brief, Non-negotiable rules (server-side secrets, immutability, auth gate, all-or-nothing), ArcBase Dashboard — Build Spec (SRS v0.2 translation), Four hard invariants (secrets, immutability, auth-gate, no partial writes), Open decisions OI-01…OI-06 (do not guess)

### Community 99 - "Clients Table Tests"

Cohesion: 0.50
Nodes (3): client(), replace, rows

### Community 100 - "Upload Form Tests"

Cohesion: 0.40
Nodes (3): { actionMock }, clients, UploadForm()

### Community 101 - "Report Links Plan and Migrations"

Cohesion: 0.50
Nodes (4): ADR 0011 — Client-facing report access via passcode-gated Report Links, Migration gotchas (DROP FUNCTION on signature change, fresh timestamp, SQL editor), Client Report Links Implementation Plan (S1–S5), SQL pair convention (paste script + migration, pinned by sql-sync.test.ts)

## Ambiguous Edges - Review These

- `ArcBase Client List Screenshot (client-detail.png)` → `Filename/Content Mismatch: client-detail.png shows the Client List page` [AMBIGUOUS]
  docs/arcbase-dashboard-design-brief/project/screenshots/client-detail.png · relation: references
- `Date Range Selector (Last 7 Days)` → `Impressions Over Time Chart (30 days)` [AMBIGUOUS]
  docs/arcbase-dashboard-design-brief/project/screenshots/dash.png · relation: shares_data_with
- `Date Range Selector (Last 7 Days)` → `Period-over-Period Delta Indicator (vs prior 30 days)` [AMBIGUOUS]
  docs/arcbase-dashboard-design-brief/project/screenshots/dash.png · relation: conceptually_related_to

## Knowledge Gaps

- **383 isolated node(s):** `kpiKeys`, `kpiKeys`, `panelKeys`, `metadata`, `ADR-0012` (+378 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions

_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `ArcBase Client List Screenshot (client-detail.png)` and `Filename/Content Mismatch: client-detail.png shows the Client List page`?**
  _Edge tagged AMBIGUOUS (relation: references) - confidence is low._
- **What is the exact relationship between `Date Range Selector (Last 7 Days)` and `Impressions Over Time Chart (30 days)`?**
  _Edge tagged AMBIGUOUS (relation: shares_data_with) - confidence is low._
- **What is the exact relationship between `Date Range Selector (Last 7 Days)` and `Period-over-Period Delta Indicator (vs prior 30 days)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `cn()` connect `Shell UI Primitives` to `Dropdown and Mode Toggle`, `Client Comparison Tables`, `Prospect Table`, `Outreach Status Pills`, `Form and Filter Controls`, `Password Reset Flow`, `Status Badge and Result Summary`, `Dashboard Analytics Charts`, `Route Loading Skeletons`, `Dialogs and Form Primitives`, `Tabs Primitives`, `Navigation Config`, `Client Comparison Table`, `Date Range Picker`, `Error Boundaries and Sign-In`, `Auth Layout and Client Tabs`?**
  _High betweenness centrality (0.090) - this node is a cross-community bridge._
- **Why does `paths` connect `Auth Layout and Client Tabs` to `Client Comparison Tables`, `Report Link Access Gate`, `Customers Reference Feature`, `Client Report Page`, `Password Reset Flow`, `Dashboard Page and Range`, `Outreach Service Seam`, `Client Detail and Uploads`, `Report Link Staff Actions`, `Resources Feature`, `Error Boundaries and Sign-In`, `Dropdown and Mode Toggle`, `CSP and Route Access`, `Client Create Action`, `Status Badge and Result Summary`, `Navigation Config`, `Client Outreach Page`, `App and Print Layouts`, `App Config and Metadata`, `Posts and Print Pages`, `Upload Page and Tabs`?**
  _High betweenness centrality (0.049) - this node is a cross-community bridge._
- **Why does `Button()` connect `Dialogs and Form Primitives` to `Dropdown and Mode Toggle`, `Shell UI Primitives`, `Client Comparison Tables`, `Customers Reference Feature`, `Form and Filter Controls`, `Password Reset Flow`, `Status Badge and Result Summary`, `Dashboard Page and Range`, `Upload Page and Tabs`, `Report Link Card`, `Client Outreach Page`, `Date Range Picker`, `Error Boundaries and Sign-In`, `Auth Layout and Client Tabs`?**
  _High betweenness centrality (0.027) - this node is a cross-community bridge._
- **What connects `kpiKeys`, `kpiKeys`, `panelKeys` to the rest of the system?**
  _383 weakly-connected nodes found - possible documentation gaps or missing edges._
