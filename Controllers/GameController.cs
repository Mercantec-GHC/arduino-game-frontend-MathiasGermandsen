using ass_di_stroid_frontend.Services;
using Microsoft.AspNetCore.Mvc;

namespace ass_di_stroid_frontend.Controllers;

[ApiController]
[Route("api")]
public class GameController : ControllerBase
{
  private readonly GameQueueService _queueService;

  public GameController(GameQueueService queueService)
  {
    _queueService = queueService;
  }

  /// <summary>
  /// Join the game queue with a device. Device will be assigned left or right control.
  /// </summary>
  /// <param name="deviceId">Unique identifier for the Arduino device</param>
  /// <returns>Assignment result with direction (left/right)</returns>
  [HttpGet("joinqueue/{deviceId}")]
  public IActionResult JoinQueue(string deviceId)
  {
    if (string.IsNullOrWhiteSpace(deviceId))
    {
      return BadRequest(new { success = false, message = "Device ID is required" });
    }

    var (success, direction, message) = _queueService.JoinQueue(deviceId);

    return Ok(new
    {
      success,
      deviceId,
      direction = direction?.ToString().ToLower(),
      message,
      gameState = _queueService.GetGameStateInfo()
    });
  }

  /// <summary>
  /// Join the game queue with a device via POST. Device will be assigned left or right control.
  /// </summary>
  /// <param name="request">Request body containing deviceId and optional deviceName</param>
  /// <returns>Assignment result with direction (left/right)</returns>
  [HttpPost("joinqueue")]
  public IActionResult JoinQueuePost([FromBody] JoinQueueRequest request)
  {
    if (request == null || string.IsNullOrWhiteSpace(request.DeviceId))
    {
      return BadRequest(new { success = false, message = "Device ID is required" });
    }

    var (success, direction, message) = _queueService.JoinQueue(request.DeviceId, request.DeviceName);

    return Ok(new
    {
      success,
      deviceId = request.DeviceId,
      deviceName = request.DeviceName,
      direction = direction?.ToString().ToLower(),
      message,
      gameState = _queueService.GetGameStateInfo()
    });
  }

  /// <summary>
  /// Send heartbeat to keep device connected and get current game state.
  /// Devices must send heartbeat every 5-10 seconds to stay connected.
  /// </summary>
  /// <param name="deviceId">Unique identifier for the Arduino device</param>
  /// <returns>Current game state information</returns>
  [HttpPost("heartbeat/{deviceId}")]
  [HttpGet("heartbeat/{deviceId}")] // Allow GET for simpler Arduino implementation
  public IActionResult Heartbeat(string deviceId)
  {
    if (string.IsNullOrWhiteSpace(deviceId))
    {
      return BadRequest(new { success = false, message = "Device ID is required" });
    }

    var (success, state) = _queueService.Heartbeat(deviceId);

    if (!success)
    {
      return Ok(new
      {
        success = false,
        message = "Device not registered. Call /joinqueue first.",
        gameState = state
      });
    }

    return Ok(new
    {
      success = true,
      deviceId,
      gameState = state
    });
  }

  /// <summary>
  /// Get current game state without requiring a device ID.
  /// </summary>
  /// <returns>Current game state information</returns>
  [HttpGet("gamestate")]
  public IActionResult GetGameState()
  {
    var state = _queueService.GetGameStateInfo();
    return Ok(state);
  }

  /// <summary>
  /// Trigger movement for the device's assigned direction.
  /// </summary>
  /// <param name="deviceId">Unique identifier for the Arduino device</param>
  /// <param name="action">Optional: "start" to begin moving, "stop" to stop. Default is "start".</param>
  /// <returns>Result of movement command</returns>
  [HttpPost("move/{deviceId}")]
  [HttpGet("move/{deviceId}")] // Allow GET for simpler Arduino implementation
  public IActionResult Move(string deviceId, [FromQuery] string action = "start")
  {
    if (string.IsNullOrWhiteSpace(deviceId))
    {
      return BadRequest(new { success = false, message = "Device ID is required" });
    }

    var isMoving = action.ToLower() != "stop";
    var (success, message) = _queueService.Move(deviceId, isMoving);

    return Ok(new
    {
      success,
      deviceId,
      action = isMoving ? "start" : "stop",
      message
    });
  }

  /// <summary>
  /// Stop movement for the device's assigned direction.
  /// </summary>
  /// <param name="deviceId">Unique identifier for the Arduino device</param>
  /// <returns>Result of stop command</returns>
  [HttpPost("stop/{deviceId}")]
  [HttpGet("stop/{deviceId}")] // Allow GET for simpler Arduino implementation
  public IActionResult Stop(string deviceId)
  {
    if (string.IsNullOrWhiteSpace(deviceId))
    {
      return BadRequest(new { success = false, message = "Device ID is required" });
    }

    var (success, message) = _queueService.Move(deviceId, false);

    return Ok(new
    {
      success,
      deviceId,
      action = "stop",
      message
    });
  }

  /// <summary>
  /// Get list of connected devices (for debugging).
  /// </summary>
  /// <returns>List of connected devices with their assignments</returns>
  [HttpGet("devices")]
  public IActionResult GetDevices()
  {
    var devices = _queueService.GetConnectedDevices();
    return Ok(new
    {
      count = devices.Count,
      devices = devices.Select(d => new
      {
        deviceId = d.DeviceId,
        deviceName = d.DeviceName,
        direction = d.Direction.ToString().ToLower(),
        lastHeartbeat = d.LastHeartbeat,
        isConnected = d.IsConnected
      })
    });
  }
}

/// <summary>
/// Request body for POST /api/joinqueue
/// </summary>
public class JoinQueueRequest
{
  /// <summary>
  /// Unique identifier for the Arduino device (required)
  /// </summary>
  public string DeviceId { get; set; } = string.Empty;

  /// <summary>
  /// Optional friendly name for the device (e.g., "Arduino Left", "Player 1 Controller")
  /// </summary>
  public string? DeviceName { get; set; }
}
