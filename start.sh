#!/bin/bash

# Script pour lancer les serveurs backend et frontend

# Couleurs pour les logs
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}🛑 Arrêt des processus existants...${NC}"

# Tuer le processus sur le port 8787 (backend)
PID_BACKEND=$(lsof -nP -iTCP:8787 -sTCP:LISTEN | tail -n +2 | awk '{print $2}' | head -n 1)
if [ ! -z "$PID_BACKEND" ]; then
  echo -e "${RED}Arrêt du backend (PID: $PID_BACKEND)${NC}"
  kill $PID_BACKEND 2>/dev/null
  sleep 0.5
fi

# Tuer le processus sur le port 5173 (frontend)
PID_FRONTEND=$(lsof -nP -iTCP:5173 -sTCP:LISTEN | tail -n +2 | awk '{print $2}' | head -n 1)
if [ ! -z "$PID_FRONTEND" ]; then
  echo -e "${RED}Arrêt du frontend (PID: $PID_FRONTEND)${NC}"
  kill $PID_FRONTEND 2>/dev/null
  sleep 0.5
fi

echo -e "${GREEN}✅ Processus arrêtés${NC}"
echo ""
echo -e "${BLUE}🚀 Lancement des serveurs...${NC}"

# Lancer le backend en arrière-plan
echo -e "${GREEN}📡 Backend sur http://localhost:8787${NC}"
npm run dev:api > /tmp/lsdts-backend.log 2>&1 &
BACKEND_PID=$!

# Attendre que le backend démarre et vérifier qu'il répond
echo -e "${BLUE}⏳ Attente du démarrage du backend...${NC}"
MAX_RETRIES=30
RETRY_COUNT=0
BACKEND_READY=false

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
  sleep 0.5
  if curl -s -f http://localhost:8787/api/ping > /dev/null 2>&1; then
    BACKEND_READY=true
    break
  fi
  RETRY_COUNT=$((RETRY_COUNT + 1))
done

if [ "$BACKEND_READY" = true ]; then
  echo -e "${GREEN}✅ Backend répond correctement${NC}"
else
  echo -e "${RED}❌ Backend ne répond pas après $MAX_RETRIES tentatives${NC}"
  echo -e "${RED}   Vérifiez les logs: tail -f /tmp/lsdts-backend.log${NC}"
fi

# Lancer le frontend en arrière-plan
echo -e "${GREEN}🌐 Frontend sur http://localhost:5173${NC}"
npm run dev > /tmp/lsdts-frontend.log 2>&1 &
FRONTEND_PID=$!

echo ""
echo -e "${GREEN}✅ Serveurs lancés !${NC}"
echo -e "${BLUE}Backend PID: $BACKEND_PID${NC}"
echo -e "${BLUE}Frontend PID: $FRONTEND_PID${NC}"
echo ""
echo -e "${BLUE}📋 Logs:${NC}"
echo -e "  Backend:  tail -f /tmp/lsdts-backend.log"
echo -e "  Frontend: tail -f /tmp/lsdts-frontend.log"
echo ""
echo -e "${BLUE}🛑 Pour arrêter: kill $BACKEND_PID $FRONTEND_PID${NC}"

