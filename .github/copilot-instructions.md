# AI Coding Instructions for Teaching LLM Agent

## Project Overview
This is a Next.js research application studying how different AI agent configurations affect mathematical problem-solving. Users progress through a controlled experiment flow: pre-test → lesson (with AI agents) → post-test → final test, with data saved to Firebase for analysis.

## Experiment Flow Architecture
The entire experiment is controlled by `src/context/FlowContext.tsx`, which maintains state across 8 sequential stages:
- **terms** → **intro** → **pre-test** → **lesson** → **tetris-break** → **post-test** → **final-test** → **completed**

Each user is deterministically assigned to one of four lesson scenarios based on their `userId`:
- `group`: User + Bob (tutor) + Charlie (concept errors) + Alice (arithmetic errors)  
- `multi`: User + Bob (tutor) + one error-prone agent
- `single`: User + Bob (tutor) only
- `solo`: User works alone

## Key Components & Data Flow

### Lesson Pages (`src/app/{group,multi,single,solo}/page.tsx`)
All lesson pages follow identical structure but load different agent configurations:
- Load agents from `public/agents.json` using `src/lib/agents.ts`
- Manage 5-minute timer with auto-submission
- Capture chat messages, scratchboard content, and final answers
- Save session data via `FlowContext.saveSessionData()`

### AI Agent System
- **Agent definitions**: `public/agents.json` contains 3 agents with distinct error patterns
- **Bob (tutor)**: Mathematically accurate, encouraging feedback
- **Charlie (concept gap)**: Correct arithmetic but wrong conceptual approaches
- **Alice (arithmetic gap)**: Right concepts but calculation errors
- **All agents**: Use single `$` math formatting, never acknowledge their own errors

### Data Persistence Flow
1. Session data collected in lesson pages
2. `FlowContext.submitAllDataToDatabase()` calls `src/lib/storage-service.ts`
3. Storage service posts to `/api/submit` → `/api/firebase-submit`
4. Firebase saves with automatic sanitization (Dates → ISO strings, undefined → null)

## Development Patterns

### State Management
- **Global state**: `FlowContext` for experiment progression and data collection
- **Local state**: Individual pages manage UI state, timers, and temporary data
- **Data validation**: All API routes validate `userId` and required fields before processing

### API Route Structure
- `/api/submit`: Main data submission endpoint with comprehensive error handling
- `/api/openai`: GPT-4o integration for agent responses (temp: 0.3)
- `/api/firebase-submit` & `/api/mongodb-submit`: Dual persistence options

### Math Rendering
- Use `react-katex` for LaTeX math expressions
- **Agent constraint**: All agents must use single `$` delimiters, never `$$` or `\[ \]`
- Questions stored in `public/questions.json` with LaTeX formatting

## Development Commands
```bash
npm run dev          # Start development server
npm run build        # Production build
npm run lint         # ESLint check
node scripts/wipe-firebase-db.js  # Clear Firebase data (development)
```

## Critical Implementation Notes
- **Timer management**: All lesson pages implement identical 5-minute countdown with auto-submission
- **Agent loading**: Use `loadAgents(agentIds)` to preserve specific ordering for multi-agent scenarios
- **Data integrity**: Session data must include `messages`, `scratchboardContent`, and timing information
- **Error boundaries**: Agent responses are wrapped in try-catch with fallback behaviors
- **Deterministic assignment**: User scenarios determined by `userId` hash, not random selection

When modifying lesson flows or agent behaviors, ensure consistency across all four lesson page implementations and maintain the deterministic user assignment system.
