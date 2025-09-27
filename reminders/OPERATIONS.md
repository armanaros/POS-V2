Operations page

This file documents the Operations feature added to the POS.

Files added/modified:
- client/src/pages/Operations.js  : Interactive UI for investments/expenses/income, goals, suggestions, chart
- client/src/services/operationsAPI.js : Client-side API wrapper with server fallback to localStorage
- routes/operations.js : Server route to persist operations to local SQLite and provide AI suggestions proxy
- server.js : Registered the operations route

How it works
- By default the Operations page stores transactions locally in browser localStorage.
- If the server is running, the client will attempt to read/write via `/api/operations` and keep a local copy as a fallback.
- The server stores entries in the `operations` SQLite table (created automatically).

AI suggestions
- The server exposes `/api/operations/ai-suggest` which will proxy to OpenAI if `OPENAI_API_KEY` is set in the server environment.
- If no API key is present, the server returns simple heuristic suggestions based on the provided context.

How to test locally
1. Start the server and client (from repository root):

```powershell
npm run dev
```

2. Open the web app at http://localhost:3000 and sign in.
3. Open the sidebar and click `Operations`.
4. Add transactions (Investments, Expenses, Income). Observe the Summary and chart update.
5. Click `Get Suggestions` (or the refresh button) to request AI suggestions. If no OPENAI_API_KEY is set, you'll get heuristics.

Enable AI (optional)
- Set `OPENAI_API_KEY` in your server environment (e.g., in `.env`) to enable OpenAI proxying.
- Restart the server after setting the variable.

Notes & next steps
- The current AI proxy is a minimal safe wrapper; for production, secure the endpoint and rate-limit requests.
- I can extend Operations to include charts by month, CSV export/import, and tie income to order records in Firestore/SQLite.
