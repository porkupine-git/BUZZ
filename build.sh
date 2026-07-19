#!/bin/bash
echo "/api/* $EMBED_URL/api/:splat 200" > public/_redirects
echo "/embed/ani/* /embed/player.html 200" >> public/_redirects
echo "/embed/url/* /embed/player.html 200" >> public/_redirects
