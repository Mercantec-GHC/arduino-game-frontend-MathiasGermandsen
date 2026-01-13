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


  [HttpPost("heartbeat/{deviceId}")]
  [HttpGet("heartbeat/{deviceId}")]
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

  [HttpGet("gamestate")]
  public IActionResult GetGameState()
  {
    var state = _queueService.GetGameStateInfo();
    return Ok(state);
  }

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

public class JoinQueueRequest
{
  public string DeviceId { get; set; } = string.Empty;
  public string? DeviceName { get; set; }
}
