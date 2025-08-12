# AI Coding Instructions for Teaching LLM Agent

## Project Overview
This is a Next.js research application studying how different AI agent configurations affect mathematical problem-solving. Users progress through a controlled experiment flow: **terms** → **intro** → **pre-test-survey** → **pre-test** → **lesson** → **tetris-break** → **post-test** → **final-test** → **completed**, with data saved to Firebase for analysis.

## Experiment Flow Architecture
The entire experiment is controlled by `src/context/FlowContext.tsx`, which maintains state across 9 sequential stages. The flow includes both survey collection and mathematical testing phases.

Each user is deterministically assigned to one of four lesson scenarios based on their `userId` hash:
- `group`: User + Bob (tutor) + Charlie (concept errors) + Alice (arithmetic errors)  
- `multi`: User + Bob (tutor) + one error-prone agent (Charlie or Alice)
- `single`: User + Bob (tutor) only
- `solo`: User works alone (no agents)

## Key Components & Data Flow

### Lesson Pages (`src/app/{group,multi,single,solo}/page.tsx`)
All lesson pages follow identical structure but load different agent configurations:
- Load agents from `public/agents.json` using `loadAgents(agentIds)` from `src/lib/agents.ts`
- Implement dual-phase timer: 10 seconds minimum work time, then 5-minute AI chat phase
- Capture chat messages via `allMessages` state, scratchboard content, and final answers
- Save session data via `FlowContext.saveSessionData()` with comprehensive error handling

### AI Agent System
- **Agent definitions**: `public/agents.json` contains 3 agents with distinct, systematic error patterns
- **Bob (tutor)**: Mathematically accurate, encouraging feedback, always asks follow-up questions
- **Charlie (concept gap)**: Correct arithmetic but fundamentally wrong mathematical approaches (confident)
- **Alice (arithmetic gap)**: Correct concepts but systematic calculation errors (confident)
- **Critical constraint**: All agents use single `$` math formatting, never `$$` or `\[ \]`, and never acknowledge their own errors

### Data Persistence Flow
1. Session data collected in lesson pages with message storage via `prepareMessagesForStorage()`
2. `FlowContext.submitAllDataToDatabase()` calls `src/lib/storage-service.ts` with retry logic
3. Storage service posts to `/api/submit` → `/api/firebase-submit` with atomic data validation
4. Firebase saves with automatic sanitization (Dates → ISO strings, undefined → null)
5. Emergency localStorage backups created on failures

## Development Patterns

### State Management
- **Global state**: `FlowContext` for experiment progression and data collection with localStorage persistence
- **Local state**: Individual pages manage UI state, dual timers (work phase + chat phase), and temporary data
- **Data validation**: All API routes validate `userId` and required fields before processing
- **Message tracking**: Components maintain both `messages` (current chat) and `allMessages` (complete history)

### API Route Structure
- `/api/submit`: Main data submission endpoint with comprehensive error handling and validation
- `/api/openai`: GPT-4o integration for agent responses (temp: 0.3, max_tokens: 1000)
- `/api/firebase-submit`: Firebase Admin SDK integration with automatic data sanitization
- `/api/tests`: Test question delivery and answer validation
- `/api/submit-survey`: Survey data collection with validation

### Math Rendering & Agent Constraints
- Use `react-katex` for LaTeX math expressions in `RenderMathExpression` component
- **Critical agent constraint**: All agents must use single `$` delimiters only, never `$$` or `\[ \]`
- Questions stored in `public/questions.json` and `public/test-questions.json` with LaTeX formatting
- Agent responses processed through `formatMessageForDisplay()` with math parsing

### Component Architecture
- **Chat components**: `GroupScenarioChat`, `MultiScenarioChat`, `SingleScenarioChat` handle agent interactions
- **Shared UI**: `ProblemDisplay`, `AnswerInput`, `Scratchpad` used across all lesson types
- **Message utilities**: `prepareMessagesForStorage()` in `messageUtils.ts` sanitizes data for persistence
- **Agent loading**: `loadAgents(agentIds)` preserves specific ordering for multi-agent scenarios

## Development Commands
```bash
npm run dev          # Start development server on localhost:3000
npm run build        # Production build with Next.js optimization
npm run lint         # ESLint check for code quality
node scripts/wipe-firebase-db.js  # Clear Firebase data (development only)
```

## Critical Implementation Notes
- **Timer management**: All lesson pages implement identical dual-phase timing: 10s minimum work → 5min chat with auto-submission
- **Agent loading**: Use `loadAgents(agentIds)` to preserve specific ordering for multi-agent scenarios
- **Data integrity**: Session data must include `messages`, `scratchboardContent`, timing, and `allMessages` for complete tracking
- **Error boundaries**: Agent responses wrapped in try-catch with fallback behaviors and typing indicators
- **Deterministic assignment**: User scenarios determined by `userId` hash modulo 4, ensuring consistent assignment across sessions
- **Message ID management**: Use `nextMessageIdRef` to avoid conflicts between user and agent messages
- **Development vs Production**: Skip buttons enabled immediately in development, after 2-minute delay in production

## Firebase Data Structure
- **Collections**: `experiments` with documents keyed by `userId`
- **Required fields**: `userId`, `lessonType`, `sessionData` (array), `testData` (array), `surveyData` (object)
- **Automatic sanitization**: Dates converted to ISO strings, `undefined` values become `null`
- **Emergency backups**: localStorage used as fallback when Firebase fails, with dedicated backup keys

When modifying lesson flows or agent behaviors, ensure consistency across all four lesson page implementations and maintain the deterministic user assignment system.
