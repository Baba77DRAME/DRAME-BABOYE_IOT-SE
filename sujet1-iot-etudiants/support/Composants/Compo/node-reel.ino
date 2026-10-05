#include <OneWire.h>
#include <DallasTemperature.h>
#include <Wire.h>
#include <BH1750.h>

#define ONE_WIRE_BUS 4
#define DOOR_PIN     2
#define INTERVAL_MS  30000

OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature sensors(&oneWire);
BH1750 lightMeter;

volatile bool doorChanged = false;
volatile bool doorOpen    = false;
unsigned long lastPublish = 0;

void IRAM_ATTR onDoor() {
  doorOpen    = (digitalRead(DOOR_PIN) == LOW);
  doorChanged = true;
}

void setup() {
  Serial.begin(115200);
  Wire.begin(21, 22);
  sensors.begin();
  lightMeter.begin();
  pinMode(DOOR_PIN, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(DOOR_PIN), onDoor, CHANGE);
}

void loop() {
  if (doorChanged) {
    doorChanged = false;
    Serial.printf("{\"type\":\"door\",\"state\":\"%s\"}\n",
      doorOpen ? "open" : "closed");
  }

  if (millis() - lastPublish >= INTERVAL_MS) {
    lastPublish = millis();
    sensors.requestTemperatures();
    float hot  = sensors.getTempCByIndex(0);
    float cold = sensors.getTempCByIndex(1);
    float lux  = lightMeter.readLightLevel();
    Serial.printf("{\"type\":\"reading\",\"temp_hot\":%.1f,\"temp_cold\":%.1f,\"lux\":%.0f}\n",
      hot, cold, lux);
  }
}
