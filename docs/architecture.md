# Architecture

Luồng chính:

Robot Chami / ESP32
↓
Firebase Firestore
↓
TsunagariCare Web Dashboard
↓
Family / Caregiver

Smart home command flow:

Web Dashboard
↓
commands collection
↓
ESP32 Smart Home Module
↓
Light / Fan / Air Conditioner

Alert flow:

Fall Detection / Robot / Health Module
↓
alerts collection
↓
Web Dashboard
↓
Family / Caregiver
