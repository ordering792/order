# syntax=docker/dockerfile:1

FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-alpine AS build
WORKDIR /app

# NEXT_PUBLIC_* တန်ဖိုးတွေ `next build` မှာ inline ဖြစ်သွားတယ် — runtime မှာ မပြောင်းနိုင်တော့ဘူး
ARG NEXT_PUBLIC_API_URL
RUN if [ -z "$NEXT_PUBLIC_API_URL" ]; then \
      echo "ERROR: build arg NEXT_PUBLIC_API_URL is required (e.g. https://<backend>.up.railway.app/api)"; \
      exit 1; \
    fi
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup -S nodejs && adduser -S nextjs -G nodejs

COPY --chown=nextjs:nodejs --from=build /app/.next/standalone ./
COPY --chown=nextjs:nodejs --from=build /app/.next/static ./.next/static
COPY --chown=nextjs:nodejs --from=build /app/public ./public

USER nextjs

ENV PORT=3000
ENV HOSTNAME=0.0.0.0
EXPOSE 3000

CMD ["node", "server.js"]
