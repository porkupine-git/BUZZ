---
title: Aniko Server Backend
emoji: 🎬
colorFrom: purple
colorTo: indigo
sdk: docker
app_port: 7860
---

# Aniko Backend Server

This backend handles the proxying and scraping logic for Anime streams.

## Features
- AniList API fallback caching
- Scraping logic for direct stream links
- HLS CORS Proxy bypassing (`/api/proxy`)
- Optimized for Hugging Face Spaces Docker execution

## Local Development
```bash
npm install
npm start
```
