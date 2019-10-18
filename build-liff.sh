#!/bin/sh

# This file replaces liff/index.html's endpoint to staging & production LINE bot servers

sed 's/rumor-line-bot.ngrok.io/line-bot-staging.cofact.org/g' <liff/index.html >liff/staging.build.html
sed 's/rumor-line-bot.ngrok.io/line-bot.cofact.org/g' <liff/index.html >liff/production.build.html
