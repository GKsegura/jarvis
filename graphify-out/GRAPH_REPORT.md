# Graph Report - jarvis-hud  (2026-10-22)

## Corpus Check
- 100 files · ~76,628 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 5 file(s) not represented in the graph (top: (none) 2, .example 1, .bat 1)

## Summary
- 1034 nodes · 2703 edges · 49 communities (47 shown, 2 thin omitted)
- Extraction: 93% EXTRACTED · 7% INFERRED · 0% AMBIGUOUS · INFERRED: 197 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- hud module
- main module
- dashboard module
- actions module
- face module
- voice module
- intents module
- routines module
- main module 2
- news module
- panels module
- main module 3
- alerts module
- main module 4
- handcontrol module
- http module
- poses module
- README module
- spotify module
- gestures module
- claude-bridge module
- filters module
- info module
- main module 5
- panels module 2
- handcontrol module 2
- package module
- face-store module
- jarvis module
- input module
- tsconfig module
- objects module
- weather module
- screens module
- handcontrol module 3
- gestures module 2
- system module
- gestures.test module
- janus module
- reminders module
- finance module
- main module 6
- mic-device module
- package module 2
- package module 3
- terminal module
- hands module
- package module 4
- package module 5

## God Nodes (most connected - your core abstractions)
1. `L()` - 45 edges
2. `vitest` - 37 edges
3. `runCommand()` - 37 edges
4. `Pt` - 31 edges
5. `handleUtterance()` - 30 edges
6. `sendJson()` - 29 edges
7. `isLocalRequest()` - 29 edges
8. `handleControl()` - 28 edges
9. `Panels` - 25 edges
10. `frame()` - 24 edges

## Surprising Connections (you probably didn't know these)
- `ContextParts` --references--> `Reminder`  [EXTRACTED]
  server/claude-bridge.ts → src/info.ts
- `buildContext()` --calls--> `weatherLabel()`  [EXTRACTED]
  server/claude-bridge.ts → src/info.ts
- `ActionsConfig` --references--> `Shortcut`  [EXTRACTED]
  server/actions.ts → src/handactions.ts
- `ActionsConfig` --references--> `ShortcutPose`  [EXTRACTED]
  server/actions.ts → src/handactions.ts
- `parseConfig()` --calls--> `parseShortcuts()`  [EXTRACTED]
  server/actions.ts → src/handactions.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **External integrations configured via .env / jarvis.config.json** — readme_spotify, readme_janus, readme_fish_audio, readme_noticias, readme_claude_integration [INFERRED 0.75]

## Communities (49 total, 2 thin omitted)

### Community 0 - "hud module"
Cohesion: 0.06
Nodes (41): VoiceCore, COLOR, CONFIRM_ANIMATION_MS, CONTOURS, drawFaceScan(), ease(), FaceScanFrame, FaceScanMode (+33 more)

### Community 1 - "main module"
Cohesion: 0.04
Nodes (50): CameraError, startCamera(), alertEngine, announced, askedRoutines, beepShort(), catalog, ClaudeAction (+42 more)

### Community 2 - "dashboard module"
Cohesion: 0.07
Nodes (43): view, Activity, canvasScale(), frameInterval(), handInterval(), base, COLOR, CORE_LABEL (+35 more)

### Community 3 - "actions module"
Cohesion: 0.07
Nodes (46): ActionKind, actions(), ActionsConfig, AFTER_FOCUS, allProcessTitles(), AppEntry, checkProject(), encoded() (+38 more)

### Community 4 - "face module"
Cohesion: 0.06
Nodes (24): @vladmandic/face-api, FACE_IDLE_EVERY_MS, FACE_STATE_LABEL, FaceApi, FaceBox, FaceGuard, FaceState, toScreen() (+16 more)

### Community 5 - "voice module"
Cohesion: 0.07
Nodes (19): greeting(), LINES, VoiceStyle, claudeCommand(), Command, COMMAND_LABEL, JarvisVoice, normalize() (+11 more)

### Community 6 - "intents module"
Cohesion: 0.10
Nodes (33): Catalog, CatalogItem, confirmation(), FINANCE_WORDS, findAlias(), Intent, matchWindow(), MusicIntent (+25 more)

### Community 7 - "routines module"
Cohesion: 0.10
Nodes (23): isEvent(), usageStore, AUTO_COMMANDS, Candidate, COMMAND_LABELS, detectCandidates(), dueRoutines(), isRoutine() (+15 more)

### Community 8 - "main module 2"
Cohesion: 0.23
Nodes (30): askClaude(), callAction(), enterStandby(), forgetFace(), forgetGesture(), handleAnyWindow(), handleConfirmation(), handleControl() (+22 more)

### Community 9 - "news module"
Cohesion: 0.15
Nodes (21): cleanText(), DEFAULT_FEEDS, ENTITIES, fetchFeed(), filterTopic(), getNews(), isHttp(), linkOf() (+13 more)

### Community 10 - "panels module"
Cohesion: 0.19
Nodes (6): clamp(), checkAlerts(), panelsData(), ellipsize(), mono(), Panels

### Community 11 - "main module 3"
Cohesion: 0.12
Nodes (13): connectSpotify(), mic, refreshSpotify(), setClaude(), setSpeech(), showNotice(), spotifySetupHelp(), startBoot() (+5 more)

### Community 12 - "alerts module"
Cohesion: 0.14
Nodes (16): ContextParts, Alert, AlertEngine, AlertInput, BATTERY_CRITICAL, BATTERY_LOW, COOLDOWN, CPU_HIGH (+8 more)

### Community 13 - "main module 4"
Cohesion: 0.11
Nodes (21): broadcast(), cancelReminder(), cover(), cycleFocus(), finishLearning(), frame(), interact(), musicView() (+13 more)

### Community 14 - "handcontrol module"
Cohesion: 0.09
Nodes (22): BOTH_PALMS_MS, COOLDOWN, EAR_MS, MENU_TIMEOUT_MS, MOUSE_EXIT_FIST_MS, MOUSE_LOST_MS, MOUSE_MARGIN, PALM_HOLD_MS (+14 more)

### Community 15 - "http module"
Cohesion: 0.27
Nodes (13): vite, BodyTooLargeError, isLocalRequest(), MAX_BODY_BYTES, readBody(), sendJson(), news(), reminders() (+5 more)

### Community 16 - "poses module"
Cohesion: 0.15
Nodes (17): dist(), Size, fingerCurl(), gestureMetrics, pinchRatio(), debugLines(), averageFeatures(), FEATURE_COUNT (+9 more)

### Community 17 - "README module"
Cohesion: 0.13
Nodes (18): Release history (CHANGELOG), semantic-release versioning, AlertEngine (src/alerts.ts), Routines engine (src/routines.ts), configurar-jarvis skill, Alertas proativos (proactive alerts), Claude Code conversation integration, fish.audio voice (Jarvis dubbed) (+10 more)

### Community 18 - "spotify module"
Cohesion: 0.19
Nodes (17): artistsOf(), clampVolume(), nowPlaying, parseApiBody(), pkcePair(), PlayerState, REDIRECT_URI, spotify() (+9 more)

### Community 19 - "gestures module"
Cohesion: 0.10
Nodes (19): mid(), bendDeg(), classify(), CURLED_MIN_DEG, EXTENDED_MAX_DEG, FINGERS, FOLDED_MIN_DEG, GestureTracker (+11 more)

### Community 20 - "claude-bridge module"
Cohesion: 0.19
Nodes (14): catalogIds(), CLAUDE_ACTIONS, ClaudeAction, claudeBridge(), ClaudeReply, ClientContext, clip(), FINANCE_QUESTION (+6 more)

### Community 21 - "filters module"
Cohesion: 0.17
Nodes (9): OneEuroFilter, Point3, PointsFilter, TrackedHand, HandStabilizer, LOST_GRACE_MS, PALM, palmCenter() (+1 more)

### Community 22 - "info module"
Cohesion: 0.16
Nodes (17): dateSpeech(), daySummarySpeech(), durationSpeech(), formatCountdown(), formatRate(), formatUptime(), inSpeech(), joinList() (+9 more)

### Community 23 - "main module 5"
Cohesion: 0.16
Nodes (19): beep(), cancelNext(), checkDue(), enrollFace(), getJson(), handleDaySummary(), handleStatus(), handleWeather() (+11 more)

### Community 24 - "panels module 2"
Cohesion: 0.13
Nodes (16): buildContext(), diskPercent(), formatGb(), memPercent(), systemSpeech(), COLUMNS, dueLabel(), formatTime() (+8 more)

### Community 25 - "handcontrol module 2"
Cohesion: 0.15
Nodes (13): Pt, Gesture, ControlContext, ControlEvent, ControlHand, Hold, menuIndexAt(), mouseTarget() (+5 more)

### Community 26 - "package module"
Cohesion: 0.11
Nodes (17): author, bugs, url, description, engines, node, homepage, keywords (+9 more)

### Community 27 - "face-store module"
Cohesion: 0.24
Nodes (10): bestDistance(), euclidean(), faceStore(), faceTokens, hasFaceToken(), isDescriptor(), MATCH_THRESHOLD, TOKEN_TTL_MS (+2 more)

### Community 28 - "jarvis module"
Cohesion: 0.17
Nodes (6): chrome, CHROME_PATHS, root, cache, readConfigText(), dirs

### Community 29 - "input module"
Cohesion: 0.26
Nodes (8): POWERSHELL, input(), INPUT_SCRIPT, InputCommand, InputHelper, KEYS, toLines(), unit()

### Community 30 - "tsconfig module"
Cohesion: 0.14
Nodes (13): compilerOptions, isolatedModules, lib, module, moduleResolution, noEmit, noUnusedLocals, noUnusedParameters (+5 more)

### Community 31 - "objects module"
Cohesion: 0.28
Nodes (9): @mediapipe/tasks-vision, WASM_URL, mergeDetections(), OBJECT_LABEL_PT, objectLabel(), ObjectSpotter, pickShown(), SeenObject (+1 more)

### Community 32 - "weather module"
Cohesion: 0.24
Nodes (8): vitest, buildWeather(), DEFAULT_PLACE, forecastUrl(), getWeather(), OpenMeteo, readPlace(), WeatherPlace

### Community 33 - "screens module"
Cohesion: 0.28
Nodes (11): CHROME_PATHS, otherScreens(), parseScreens(), placeScript(), RELEASE_SCRIPT, runPowerShell(), Screen, SCREEN_TITLE (+3 more)

### Community 34 - "handcontrol module 3"
Cohesion: 0.32
Nodes (3): countReversals(), HandControl, inRect()

### Community 35 - "gestures module 2"
Cohesion: 0.29
Nodes (6): gestures(), GestureStore, isFeatures(), isGesture(), features, LearnedGesture

### Community 36 - "system module"
Cohesion: 0.35
Nodes (10): cpuPercent(), CpuTimes, Extras, extrasLoopScript(), lastCpu, parseExtras(), refreshExtras(), stopExtras() (+2 more)

### Community 37 - "gestures.test module"
Cohesion: 0.18
Nodes (10): PINCH_RELEASE_MS, ALMOST_PINCH, FINGER_X, FIST, hand(), OPEN, PINCH, POINTING (+2 more)

### Community 38 - "janus module"
Cohesion: 0.33
Nodes (8): buildSummary(), currentMonth(), DEFAULT_JANUS_URL, fetchJanusSummary(), FinanceSummary, janus(), JanusOfflineError, janusUrl()

### Community 39 - "reminders module"
Cohesion: 0.36
Nodes (3): isReminder(), reminderStore, Reminder

### Community 40 - "finance module"
Cohesion: 0.36
Nodes (7): falarReais(), financeSpeech(), FinanceSummary, joinNames(), MONTHS_EN, MONTHS_PT, base

### Community 41 - "main module 6"
Cohesion: 0.36
Nodes (9): answerRoutine(), describeRoutine(), handleRoutines(), logUsage(), routineTick(), runRoutine(), usageHeaders(), clock() (+1 more)

### Community 42 - "mic-device module"
Cohesion: 0.33
Nodes (7): DeviceInfo, findCameraMic(), normalizeLabel(), openCameraMic(), OpenedMic, mics, VIRTUAL

### Community 43 - "package module 2"
Cohesion: 0.29
Nodes (7): devDependencies, semantic-release, @semantic-release/changelog, @semantic-release/git, typescript, vite, vitest

### Community 44 - "package module 3"
Cohesion: 0.29
Nodes (7): scripts, build, dev, jarvis, preview, test, type-check

### Community 47 - "package module 4"
Cohesion: 0.67
Nodes (3): dependencies, @mediapipe/tasks-vision, @vladmandic/face-api

### Community 48 - "package module 5"
Cohesion: 0.67
Nodes (3): repository, type, url

## Knowledge Gaps
- **10 isolated node(s):** `typescript`, `@semantic-release/changelog`, `@semantic-release/git`, `semantic-release`, `Nucleo de voz (voice core)` (+5 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 309 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `vitest` connect `weather module` to `main module`, `dashboard module`, `actions module`, `face module`, `voice module`, `intents module`, `routines module`, `news module`, `alerts module`, `http module`, `poses module`, `spotify module`, `claude-bridge module`, `filters module`, `info module`, `panels module 2`, `handcontrol module 2`, `package module`, `face-store module`, `jarvis module`, `input module`, `objects module`, `screens module`, `gestures module 2`, `system module`, `gestures.test module`, `janus module`, `reminders module`, `finance module`, `mic-device module`?**
  _High betweenness centrality (0.124) - this node is a cross-community bridge._
- **Are the 6 inferred relationships involving `runCommand()` (e.g. with `.absentFor()` and `.recent()`) actually correct?**
  _`runCommand()` has 6 INFERRED edges - model-reasoned connections that need verification._
- **What connects `typescript`, `@semantic-release/changelog`, `@semantic-release/git` to the rest of the system?**
  _10 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `hud module` be split into smaller, more focused modules?**
  _Cohesion score 0.06291591046581972 - nodes in this community are weakly interconnected._
- **Why does `FaceGuard` connect `face module` to `main module`, `main module 3`, `main module 4`?**
  _High betweenness centrality (0.039) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `handleUtterance()` (e.g. with `.log()` and `.say()`) actually correct?**
  _`handleUtterance()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Should `main module` be split into smaller, more focused modules?**
  _Cohesion score 0.04242424242424243 - nodes in this community are weakly interconnected._