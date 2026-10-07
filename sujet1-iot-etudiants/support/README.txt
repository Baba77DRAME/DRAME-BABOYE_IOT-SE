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


================================================================
CONCEPTION MATÉRIELLE — Composants/
================================================================

Composants.html         Matrices de décision — choix des composants
Nomenclature.html       Nomenclature et coûts par type de node
Node-exterieur.html     Node extérieur TTGO LoRa32, calcul d'autonomie
Architecture.html       Architecture réseau du site (WiFi / LoRaWAN)

Composants/Compo/
  Node-interieur.html   Câblage GPIO ESP32 (DS18B20, BH1750, Reed switch)
  sketch.ino            Code simulation Wokwi
  node-reel.ino         Code production
  diagram.json          Schéma Wokwi (importable sur wokwi.com)


================================================================
PROTOCOLE MQTT — MQTT/
================================================================

Topics.html         Arborescence des topics (reptiles/v1/...)
Messages.html       Format JSON des messages
QoS-Retain.html     Choix QoS et retain par type de message
LastWill.html       Last Will Testament
ClientId.html       Format des identifiants clients
Commandes.html      Format des commandes et accusés de réception
Horodatage.html     Gestion des horodatages (device vs serveur)
Securite.html       Comptes, mots de passe, ACL


================================================================
ADAPTATEUR MQTT — AdaptMQTT/
================================================================

Architecture.html       Vue d'ensemble, arborescence, flux de données
Strategie-Buffer.html   Tampon hors-ligne, backoff, gestion des doublons
Configuration.html      Variables d'environnement (.env)
Tests.html              Scénarios de test

Code source → src/outputs/mqtt.js et src/outputs/buffer.js


================================================================
INFRASTRUCTURE DOCKER — Infrastructure/
================================================================

Architecture.html   Services, réseau, volumes, flux de connexion
Lancement.html      Démarrage, accès, logs, tests

Fichiers Docker → docker-compose.yml, docker/, mosquitto/
