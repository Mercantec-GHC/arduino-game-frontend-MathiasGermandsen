# Ass-Di-Stroid 🚀

A co-op asteroid escape game built with Blazor Server, featuring both keyboard controls and Arduino MKR WiFi 1010 controller support.

## 🎮 Game Overview

Navigate your spaceship through an asteroid field! Two players control the ship - one for left movement, one for right. Survive as long as possible while your score increases over time.

### Scoring System
- **Base Score**: 100 points per second
- **Multiplier**: Increases by 0.3x every 10,000 points
- Example: At 30,000 points, your multiplier will be 1.9x

### Visual Progression
The game features a sky-to-space transition:
1. **Earth Phase** - Blue sky with clouds
2. **Transition Phase** - Sky darkens as you ascend
3. **Space Phase** - Dark space with stars

---

## 🚀 Getting Started

### Prerequisites
- .NET 8.0 SDK
- (Optional) Arduino MKR WiFi 1010 for controller mode

### Running the Application

```bash
cd ass-di-stroid-frontend
dotnet run
```

The application will start on `http://localhost:5000` (or configured port).

---

## 🎯 Game Modes

### Test Mode (Keyboard)
Use your keyboard to control the spaceship:
- **A** - Move left
- **D** - Move right

### Controller Mode (Arduino)
Connect two Arduino MKR WiFi 1010 devices - one controls left, one controls right.

---

## 📡 REST API Documentation

All endpoints are prefixed with `/api`.

### Join Queue

Register a device to the game queue.

#### POST `/api/joinqueue`
**Request Body:**
```json
{
  "deviceId": "arduino-001",
  "deviceName": "Left Controller"
}
```

**Response:**
```json
{
  "success": true,
  "deviceId": "arduino-001",
  "deviceName": "Left Controller",
  "direction": "left",
  "message": "Joined as Left",
  "gameState": {
    "state": "waiting",
    "leftConnected": true,
    "rightConnected": false,
    "playersReady": 1,
    "score": 0,
    "multiplier": 1.0
  }
}
```

#### GET `/api/joinqueue/{deviceId}`
Simple join without a custom name. The device ID will be used as the display name.

---

### Heartbeat

Keep your device connection alive. Must be called at least every 10 seconds.

#### GET/POST `/api/heartbeat/{deviceId}`

**Response:**
```json
{
  "success": true,
  "deviceId": "arduino-001",
  "gameState": {
    "state": "playing",
    "leftConnected": true,
    "rightConnected": true,
    "playersReady": 2,
    "score": 15000,
    "multiplier": 1.3
  }
}
```

---

### Movement

Control your side of the spaceship.

#### GET/POST `/api/move/{deviceId}?action=start`
Start moving in your assigned direction.

#### GET/POST `/api/move/{deviceId}?action=stop`
Stop moving.

#### GET/POST `/api/stop/{deviceId}`
Shorthand to stop moving.

**Response:**
```json
{
  "success": true,
  "deviceId": "arduino-001",
  "action": "start",
  "message": "Moving left"
}
```

---

### Game State

Get the current game state.

#### GET `/api/gamestate`

**Response:**
```json
{
  "state": "playing",
  "leftConnected": true,
  "rightConnected": true,
  "playersReady": 2,
  "score": 25000,
  "multiplier": 1.6,
  "phase": "space",
  "teamName": "Team Alpha"
}
```

**Game States:**
- `waiting` - Waiting for players to join
- `ready` - Both players connected, ready to start
- `playing` - Game in progress
- `gameover` - Game ended

---

### Connected Devices

List all connected devices.

#### GET `/api/devices`

**Response:**
```json
{
  "count": 2,
  "devices": [
    {
      "deviceId": "arduino-001",
      "deviceName": "Left Controller",
      "direction": "left",
      "lastHeartbeat": "2026-01-13T10:30:00Z",
      "isConnected": true
    },
    {
      "deviceId": "arduino-002",
      "deviceName": "Right Controller",
      "direction": "right",
      "lastHeartbeat": "2026-01-13T10:30:00Z",
      "isConnected": true
    }
  ]
}
```

---

## 🔌 Arduino MKR WiFi 1010 Setup

### Hardware Requirements
- 2x Arduino MKR WiFi 1010
- Button or sensor for input (optional - can use built-in button)

### Wiring (Example with Button)
```
Button Pin 1 → Digital Pin 2
Button Pin 2 → GND
```

### Arduino Code Example

```cpp
#include <WiFiNINA.h>
#include <ArduinoHttpClient.h>

// WiFi credentials
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

// Server configuration
const char* serverAddress = "192.168.1.100";  // Your computer's IP
const int serverPort = 5000;

// Device configuration
const char* deviceId = "arduino-left";  // Unique ID for this controller
const char* deviceName = "Left Controller";

// Pin configuration
const int BUTTON_PIN = 2;

WiFiClient wifi;
HttpClient client = HttpClient(wifi, serverAddress, serverPort);

bool lastButtonState = HIGH;
bool isMoving = false;
unsigned long lastHeartbeat = 0;
const unsigned long HEARTBEAT_INTERVAL = 5000;  // 5 seconds

void setup() {
  Serial.begin(9600);
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  
  // Connect to WiFi
  Serial.print("Connecting to WiFi...");
  while (WiFi.begin(ssid, password) != WL_CONNECTED) {
    Serial.print(".");
    delay(1000);
  }
  Serial.println(" Connected!");
  Serial.print("IP: ");
  Serial.println(WiFi.localIP());
  
  // Join the game queue
  joinQueue();
}

void loop() {
  // Send heartbeat periodically
  if (millis() - lastHeartbeat > HEARTBEAT_INTERVAL) {
    sendHeartbeat();
    lastHeartbeat = millis();
  }
  
  // Read button state
  bool buttonState = digitalRead(BUTTON_PIN);
  
  // Button pressed (LOW because of INPUT_PULLUP)
  if (buttonState == LOW && lastButtonState == HIGH) {
    startMoving();
  }
  // Button released
  else if (buttonState == HIGH && lastButtonState == LOW) {
    stopMoving();
  }
  
  lastButtonState = buttonState;
  delay(10);
}

void joinQueue() {
  Serial.println("Joining queue...");
  
  String jsonBody = "{\"deviceId\":\"" + String(deviceId) + "\",\"deviceName\":\"" + String(deviceName) + "\"}";
  
  client.beginRequest();
  client.post("/api/joinqueue");
  client.sendHeader("Content-Type", "application/json");
  client.sendHeader("Content-Length", jsonBody.length());
  client.beginBody();
  client.print(jsonBody);
  client.endRequest();
  
  int statusCode = client.responseStatusCode();
  String response = client.responseBody();
  
  Serial.print("Join Queue Status: ");
  Serial.println(statusCode);
  Serial.println(response);
}

void sendHeartbeat() {
  String url = "/api/heartbeat/" + String(deviceId);
  client.get(url);
  
  int statusCode = client.responseStatusCode();
  client.responseBody();  // Clear response buffer
  
  if (statusCode != 200) {
    Serial.println("Heartbeat failed, rejoining...");
    joinQueue();
  }
}

void startMoving() {
  if (isMoving) return;
  isMoving = true;
  
  String url = "/api/move/" + String(deviceId) + "?action=start";
  client.get(url);
  client.responseBody();
  
  Serial.println("Started moving");
}

void stopMoving() {
  if (!isMoving) return;
  isMoving = false;
  
  String url = "/api/stop/" + String(deviceId);
  client.get(url);
  client.responseBody();
  
  Serial.println("Stopped moving");
}
```

### Required Arduino Libraries
Install these via Arduino Library Manager:
- **WiFiNINA** - For WiFi connectivity
- **ArduinoHttpClient** - For HTTP requests

### Setup Steps

1. **Install Libraries**
   - Open Arduino IDE
   - Go to Tools → Manage Libraries
   - Search and install "WiFiNINA" and "ArduinoHttpClient"

2. **Configure the Code**
   - Set your WiFi credentials (`ssid` and `password`)
   - Set the server IP address (your computer running the game)
   - Set a unique `deviceId` for each Arduino
   - Set a friendly `deviceName` to display in the UI

3. **Upload to Arduino**
   - Connect your Arduino MKR WiFi 1010 via USB
   - Select the correct board and port in Arduino IDE
   - Upload the sketch

4. **Repeat for Second Controller**
   - Change `deviceId` to something unique (e.g., "arduino-right")
   - Change `deviceName` (e.g., "Right Controller")
   - Upload to the second Arduino

### Testing Connection

1. Start the game server (`dotnet run`)
2. Power on both Arduinos
3. Open the game in browser, select "Controller Mode"
4. Both controllers should appear in the queue as "Connected"
5. Enter a team name and click "LAUNCH"

### Troubleshooting

| Problem                  | Solution                                  |
| ------------------------ | ----------------------------------------- |
| Won't connect to WiFi    | Check credentials, ensure 2.4GHz network  |
| "Device not registered"  | Call `/api/joinqueue` first               |
| Controller disconnects   | Ensure heartbeat is sent every 5 seconds  |
| Wrong direction assigned | First device gets Left, second gets Right |
| Can't find server        | Check server IP, ensure same network      |

---

## 🏗️ Project Structure

```
ass-di-stroid-frontend/
├── Components/
│   ├── Layout/
│   │   ├── MainLayout.razor      # Main app layout
│   │   └── NavMenu.razor         # Navigation menu
│   └── Pages/
│       ├── Home.razor            # Start screen with mode selection
│       └── Game.razor            # Main game page
├── Controllers/
│   └── GameController.cs         # REST API endpoints
├── Services/
│   └── GameQueueService.cs       # Device queue management
├── wwwroot/
│   ├── js/
│   │   └── game.js               # Canvas game engine
│   └── app.css                   # Global styles
├── Program.cs                    # App configuration
└── appsettings.json              # Configuration
```

---

## 🛠️ Development

### Adding New Endpoints

1. Add method to `GameQueueService.cs`
2. Add endpoint to `GameController.cs`
3. Update this README

### Modifying Game Mechanics

Edit `wwwroot/js/game.js`:
- `SCORE_PER_SECOND` - Base score rate
- `MULTIPLIER_INCREMENT` - Multiplier increase amount
- `MULTIPLIER_THRESHOLD` - Points needed for multiplier increase
- `asteroidSpeed` - How fast asteroids fall

---

## 📝 License

MIT License - Feel free to use and modify!
