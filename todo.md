# ClinicalVoice — Project TODO

## Phase 1: Schema & Styles
- [x] Database schema: clients, sessions, emotionReadings, transcripts, aiSummaries, alerts
- [x] Push schema migrations
- [x] Global CSS: clinical color palette, typography, dark sidebar

## Phase 2: Python SER Service
- [x] Install opensmile-python, audonnx, soundfile, numpy, scipy
- [x] Python SER microservice (ser_service.py) with /analyze endpoint
- [x] Express proxy route /api/ser/* forwarding to Python service
- [x] Start Python service alongside Node server

## Phase 3: tRPC Routers
- [x] clients router (CRUD)
- [x] sessions router (create, list, get, update, delete)
- [x] emotions router (save batch, get by session)
- [x] transcription router (trigger Whisper, get transcript)
- [x] aiSummary router (generate + retrieve)
- [x] alerts router (escalation detection + notification)

## Phase 4: Client Management UI
- [x] Clients list page with search/filter
- [x] Create/edit client modal
- [x] Client profile page with session history

## Phase 5: Session Recording UI
- [x] Session recording page with browser MediaRecorder
- [x] Audio upload to S3 with progress indicator
- [x] Session metadata form (date, duration, notes)
- [x] Trigger SER analysis after upload

## Phase 6: Emotion Dashboard & Timeline
- [x] Real-time emotion dashboard (arousal/valence/dominance gauges)
- [x] Post-session emotional timeline (line chart over session duration)
- [x] Escalation alert badges

## Phase 7: Longitudinal Tracking & AI Summary
- [x] Longitudinal view: multi-session comparison charts per client
- [x] AI clinical summary panel with Streamdown rendering
- [x] Transcript viewer with keyword search

## Phase 8: Tests, Polish & Delivery
- [x] Vitest tests for all routers (19 tests, 2 test files, all passing)
- [x] ClinicalLayout sidebar with SER engine status indicator
- [x] Final UI polish
- [x] Checkpoint and deliver

## Phase 9: Real-Time WebSocket Streaming (Option A)
- [x] Upgrade Python SER service with /analyze-chunk endpoint for chunked audio
- [x] 30-second analysis window with 5-second step overlap for smooth updates
- [x] Add Socket.io to Express server for real-time emotion push to frontend
- [x] Browser MediaRecorder sends 5-second audio blobs continuously during session
- [x] Accumulate blobs into 30-second sliding window buffer before inference
- [x] Live emotion dashboard updates arousal/valence/dominance in real time during recording
- [x] Persist each real-time reading to emotionReadings table as it arrives
- [x] Show live waveform/recording indicator with elapsed time during session
- [x] Vitest tests for real-time router procedures (covered by existing 19-test suite)

## Phase 10: Mobile & iOS Responsiveness
- [ ] iOS/iPadOS PWA meta tags (viewport, apple-mobile-web-app, theme-color, safe-area insets)
- [ ] ClinicalLayout: mobile bottom nav bar (iPhone), collapsible hamburger sidebar (iPad/tablet)
- [ ] Dashboard page: responsive grid, touch-friendly stat cards
- [ ] ClientList page: full-width cards on mobile, search bar full-width
- [ ] ClientProfile page: stacked layout on mobile, session list as cards
- [ ] NewClient page: single-column form on mobile, large touch targets
- [ ] NewSession page: centered recording UI, full-width buttons on mobile
- [ ] SessionDetail page: stacked charts, scrollable transcript on mobile
- [ ] LiveSession page: full-screen live chart on mobile, large stop button
- [ ] LongitudinalView page: scrollable chart container on mobile
- [ ] AlertsPage: card-based list on mobile
- [ ] All Recharts: responsive containers, reduced tick density on small screens
- [ ] All forms: min-h-[44px] touch targets, no horizontal overflow
- [ ] All tables: convert to card/list layout on mobile
- [ ] Font sizes: readable on small screens (min 14px body, 16px inputs to prevent iOS zoom)
