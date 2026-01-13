namespace ass_di_stroid_frontend.Services;

public enum GameState
{
  Waiting,    // Waiting for players to join
  Ready,      // Both players joined, ready to start
  Playing,    // Game in progress
  GameOver    // Game ended
}

public enum DeviceDirection
{
  Left,
  Right
}

public class ConnectedDevice
{
  public string DeviceId { get; set; } = string.Empty;
  public string? DeviceName { get; set; }
  public DeviceDirection Direction { get; set; }
  public DateTime LastHeartbeat { get; set; }
  public bool IsConnected => (DateTime.UtcNow - LastHeartbeat).TotalSeconds < 10;
}

public class GameQueueService
{
  private readonly object _lock = new();
  private readonly Dictionary<string, ConnectedDevice> _devices = new();
  private GameState _gameState = GameState.Waiting;
  private int _currentScore = 0;
  private double _currentMultiplier = 1.0;
  private string _currentPhase = "earth";
  private string _teamName = string.Empty;

  // Event for notifying Blazor components of movement
  public event Action<DeviceDirection, bool>? OnMovementChanged;
  public event Action? OnGameStateChanged;

  public GameState CurrentGameState
  {
    get { lock (_lock) return _gameState; }
  }

  public string TeamName
  {
    get { lock (_lock) return _teamName; }
    set { lock (_lock) _teamName = value; }
  }

  public (bool success, DeviceDirection? direction, string message) JoinQueue(string deviceId, string? deviceName = null)
  {
    lock (_lock)
    {
      // Check if device already exists
      if (_devices.ContainsKey(deviceId))
      {
        var existingDevice = _devices[deviceId];
        existingDevice.LastHeartbeat = DateTime.UtcNow;
        // Update device name if provided
        if (!string.IsNullOrWhiteSpace(deviceName))
        {
          existingDevice.DeviceName = deviceName;
        }
        return (true, existingDevice.Direction, $"Already joined as {existingDevice.Direction}");
      }

      // Clean up disconnected devices
      CleanupDisconnectedDevices();

      // Determine which direction to assign
      var leftTaken = _devices.Values.Any(d => d.Direction == DeviceDirection.Left && d.IsConnected);
      var rightTaken = _devices.Values.Any(d => d.Direction == DeviceDirection.Right && d.IsConnected);

      if (leftTaken && rightTaken)
      {
        return (false, null, "Game is full. Both positions are taken.");
      }

      var direction = !leftTaken ? DeviceDirection.Left : DeviceDirection.Right;

      var newDevice = new ConnectedDevice
      {
        DeviceId = deviceId,
        DeviceName = deviceName ?? deviceId, // Use deviceId as fallback name
        Direction = direction,
        LastHeartbeat = DateTime.UtcNow
      };

      _devices[deviceId] = newDevice;

      // Check if we now have both players
      UpdateGameReadyState();

      return (true, direction, $"Joined as {direction}");
    }
  }

  public (bool success, GameStateInfo state) Heartbeat(string deviceId)
  {
    lock (_lock)
    {
      if (!_devices.ContainsKey(deviceId))
      {
        return (false, GetGameStateInfo());
      }

      _devices[deviceId].LastHeartbeat = DateTime.UtcNow;
      return (true, GetGameStateInfo());
    }
  }

  public GameStateInfo GetGameStateInfo()
  {
    lock (_lock)
    {
      CleanupDisconnectedDevices();

      var connectedDevices = _devices.Values.Where(d => d.IsConnected).ToList();

      return new GameStateInfo
      {
        State = _gameState.ToString().ToLower(),
        PlayerCount = connectedDevices.Count,
        LeftPlayerConnected = connectedDevices.Any(d => d.Direction == DeviceDirection.Left),
        RightPlayerConnected = connectedDevices.Any(d => d.Direction == DeviceDirection.Right),
        Score = _currentScore,
        Multiplier = _currentMultiplier,
        Phase = _currentPhase,
        TeamName = _teamName
      };
    }
  }

  public (bool success, string message) Move(string deviceId, bool isMoving)
  {
    lock (_lock)
    {
      if (!_devices.ContainsKey(deviceId))
      {
        return (false, "Device not registered. Call /joinqueue first.");
      }

      var device = _devices[deviceId];
      device.LastHeartbeat = DateTime.UtcNow;

      if (_gameState != GameState.Playing)
      {
        return (false, $"Game is not in playing state. Current state: {_gameState}");
      }

      // Trigger movement event
      OnMovementChanged?.Invoke(device.Direction, isMoving);

      return (true, $"Movement {(isMoving ? "started" : "stopped")} for {device.Direction}");
    }
  }

  public void UpdateGameState(GameState state)
  {
    lock (_lock)
    {
      _gameState = state;
      OnGameStateChanged?.Invoke();
    }
  }

  public void UpdateScore(int score, double multiplier, string phase)
  {
    lock (_lock)
    {
      _currentScore = score;
      _currentMultiplier = multiplier;
      _currentPhase = phase;
    }
  }

  public void ResetQueue()
  {
    lock (_lock)
    {
      _devices.Clear();
      _gameState = GameState.Waiting;
      _currentScore = 0;
      _currentMultiplier = 1.0;
      _currentPhase = "earth";
    }
  }

  public List<ConnectedDevice> GetConnectedDevices()
  {
    lock (_lock)
    {
      CleanupDisconnectedDevices();
      return _devices.Values.Where(d => d.IsConnected).ToList();
    }
  }

  private void CleanupDisconnectedDevices()
  {
    var disconnected = _devices.Where(kvp => !kvp.Value.IsConnected).Select(kvp => kvp.Key).ToList();
    foreach (var id in disconnected)
    {
      _devices.Remove(id);
    }

    if (disconnected.Count > 0)
    {
      UpdateGameReadyState();
    }
  }

  private void UpdateGameReadyState()
  {
    var connectedDevices = _devices.Values.Where(d => d.IsConnected).ToList();
    var hasLeft = connectedDevices.Any(d => d.Direction == DeviceDirection.Left);
    var hasRight = connectedDevices.Any(d => d.Direction == DeviceDirection.Right);

    if (hasLeft && hasRight && _gameState == GameState.Waiting)
    {
      _gameState = GameState.Ready;
      OnGameStateChanged?.Invoke();
    }
    else if ((!hasLeft || !hasRight) && _gameState == GameState.Ready)
    {
      _gameState = GameState.Waiting;
      OnGameStateChanged?.Invoke();
    }
  }
}

public class GameStateInfo
{
  public string State { get; set; } = "waiting";
  public int PlayerCount { get; set; }
  public bool LeftPlayerConnected { get; set; }
  public bool RightPlayerConnected { get; set; }
  public int Score { get; set; }
  public double Multiplier { get; set; }
  public string Phase { get; set; } = "earth";
  public string TeamName { get; set; } = string.Empty;
}
