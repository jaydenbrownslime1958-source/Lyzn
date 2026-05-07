# Lyzn — Backend (FastAPI)

The Lyzn key-delivery API. Deployed to Render free tier with MongoDB Atlas for persistence.

## Deploy on Render
1. Push this folder to GitHub (already done)
2. In Render: **New → Web Service → Connect this repo**
3. Set **Root Directory** to `backend`
4. Render auto-detects the Dockerfile and `render.yaml`
5. Add the environment variables shown in `render.yaml` (Render will prompt you for the `sync: false` ones during setup)

## Environment variables required
- `MONGO_URL` — your MongoDB Atlas connection string
- `ADMIN_PASSWORD` — admin panel password
- `GMAIL_USER` — gmail address used to send keys
- `GMAIL_APP_PASSWORD` — gmail app password (16 chars)
- `DISCORD_WEBHOOK_URL` — optional, for new-submission alerts
- `ADMIN_PANEL_URL` — optional, link in Discord embeds
- `DB_NAME` — defaults to `lyzn`
- `CORS_ORIGINS` — defaults to `*`

## Key inventory
The 93 product keys live in `keys_seed.json`. On first MongoDB connection (when the database is empty), the backend auto-seeds the keys into the `available_keys` collection. Consumed keys move to `consumed_keys`.

## Local dev
```bash
pip install -r requirements.txt
cp .env.example .env  # fill in your values
uvicorn server:app --reload --port 8001
```
