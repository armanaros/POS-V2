Netlify deployment notes

This repository contains a React client in the `client/` folder and an Express server at the project root.

Client (Netlify):
- Netlify should build the React app by running `npm run build` in the repository root which will run `cd client && npm run build` (see `package.json`).
- The produced static files are in `client/build` and `netlify.toml` is configured to publish that folder.
- Set the environment variable `REACT_APP_API_URL` in Netlify to point to your backend API (e.g. `https://api.mypos.example.com/api`). If omitted, the app will use relative `/api` calls which are suitable when proxying.

Server (separate):
- The Express server is not served by Netlify. Deploy it separately (Heroku, Render, AWS ECS, DigitalOcean App Platform, or a VPS).
- The server reads `DB_PATH` environment variable to locate the SQLite database. For production, use a persistent file path and mount it appropriately in your hosting environment.
- Start the server with `node server.js` (production) or `node server-firebase.js` if using firebase integrations.

Recommendations for production:
- Use a managed database for larger deployments (Postgres, MySQL) instead of SQLite.
- If you deploy both client and server on the same domain, set `REACT_APP_API_URL` to point to the full API path (e.g. `https://app.example.com/api`).
- Configure backup and migration strategy for the SQLite database file.
