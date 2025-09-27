Reminder: Continue POS work — 2025-09-11

Planned reminder time (assumption): 2025-09-11 09:00 AM (local)

Checklist for next session (keep this as our working plan):

- [ ] Profitability calculation: implement profit = sales - cost_of_goods - expenses
  - Inputs: sales (per order/day/month), cost_of_goods (per menu item or SKU), expenses (fixed + variable)
  - Outputs: per-order profit, daily sum, monthly sum, report view
  - Error modes: missing cost data, currency/formatting

- [ ] Daily and monthly predictions
  - Short contract: inputs = historical daily sales; outputs = predicted sales for next day / month; error modes: sparse history
  - Start with simple moving average / exponential smoothing; consider adding seasonality later

- [ ] Smart organization (data & UI)
  - Group reports, predictions, and inventory in a clear UI
  - Provide filtering by date range, category, employee

- [ ] Smart Stocking
  - On order placement/completion: decrement stock for each SKU
  - If stock falls below threshold, create low-stock alert (in-app + optional email/notification)
  - Edge cases: negative stock prevented, concurrent orders

- [ ] Continuation notes
  - We'll resume by reviewing current inventory data model and where to attach "cost_of_goods" and "stock_level" (likely in menu item documents)
  - Verify where orders write item unitPrice/quantity/total so we can compute profit

Quick ways to get an actual reminder on Windows (instructions, do not run here):

1) Create a one-time scheduled task that pops a MessageBox at 09:00 on 2025-09-11 (uses schtasks; date format MM/DD/YYYY):

```powershell
# Run in an elevated PowerShell or regular PowerShell (task will run when user is logged in)
$schtime = "09:00"
$schdate = "09/11/2025"
schtasks /Create /SC ONCE /TN "POS-Reminder-Continue" /TR "powershell -NoProfile -WindowStyle Hidden -Command \"Add-Type -AssemblyName PresentationFramework; [System.Windows.MessageBox]::Show('Reminder: Continue POS tasks — profitability, predictions, smart stocking')\"" /ST $schtime /SD $schdate /F
```

2) If you use Outlook or Google Calendar, create an event for 2025-09-11 09:00 and set a notification.

3) I can create a GitHub issue or a repo TODO if you prefer an in-repo reminder — say which and I will create it.

Assumptions I made:
- You want a reminder tomorrow; I picked 09:00 AM local time (2025-09-11). If you want a different time, tell me and I'll update the scheduled-command snippet or create the scheduled task for you.
- You want the planning checklist saved in the repo and accessible to the team.

Next steps I can take now (choose one):
- Create a GitHub issue titled "Reminder: Continue profitability & inventory work (2025-09-11)" in this repo.
- Create a scheduled task on your machine now (I will need permission to run the PowerShell command).
- Flesh out the first implementation step: add cost_of_goods and stock fields to menu items and draft code to decrement stock on order.

I'll wait for your choice (or I can proceed with creating the GitHub issue and/or fleshing out the first code changes).
