Centre de réhabilitation pour reptiles — Système IoT
=====================================================

LANCEMENT COMPLET (Docker)
---------------------------
cd sujet1-iot-etudiants/support/
docker compose up --build

Accès :
  Dashboard web   →  http://localhost:8080
  Broker MQTT TCP →  mqtt://localhost:1883
  Broker MQTT WS  →  ws://localhost:9001


LANCEMENT MANUEL (sans Docker)
-------------------------------
Terminal 1 — broker :
  npm run broker

Terminal 2 — simulateur :
  npm run start:mqtt

Terminal 3 — serveur d'alertes :
  npm run server

Terminal 4 — front web :
  npm run front
  puis ouvrir http://localhost:8080


ARRÊT
-----
Docker :   docker compose down
Manuel :   Ctrl+C dans chaque terminal


STRUCTURE
---------
Composants/     Conception matérielle (composants, BOM, câblage, architecture)
MQTT/           Protocole MQTT (topics, messages, QoS, sécurité)
AdaptMQTT/      Adaptateur MQTT du simulateur (buffer, backoff, configuration)
Infrastructure/ Infrastructure Docker (architecture, lancement)
src/            Code source Node.js
front/          Interface web
mosquitto/      Configuration broker
docker/         Dockerfiles
