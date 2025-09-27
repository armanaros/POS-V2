Quick test steps

1. Install dependencies

```powershell
npm install
cd client
npm install
```

2. Start dev servers

```powershell
npm run dev
```

3. Visit http://localhost:3000, login as admin (admin/admin123), open the sidebar and select "Operations".

4. Add a few transactions (Investment, Expense, Income). Verify the Summary chips and chart update.

5. To test server persistence, ensure server is running (npm run server) and then refresh the Operations page; entries should be loaded from server DB.

6. To test AI suggestions, set `OPENAI_API_KEY` in server env, restart server, then in Operations request suggestions.
