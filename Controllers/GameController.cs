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

  [HttpPost("joinqueue")]
  public IActionResult JoinQueuePost([FromBody] JoinQueueRequest request)
  {
    if (request == null || string.IsNullOrWhiteSpace(request.DeviceId))
    {
      return BadRequest(new { success = false, message = "Device ID is required" });
    }

    var (success, direction, _) = _queueService.JoinQueue(request.DeviceId, request.DeviceName);

    return Ok(new
    {
      success,
      direction = direction?.ToString().ToLower(),
      state = "inQueue"
    });
  }

  [HttpPost("heartbeat/{deviceId}")]
  public IActionResult Heartbeat(string deviceId)
  {
    if (string.IsNullOrWhiteSpace(deviceId))
    {
      return BadRequest(new { success = false, message = "Device ID is required" });
    }

    var (success, _) = _queueService.Heartbeat(deviceId);

    return Ok(new
    {
      success,
      state = "inQueue",
      score = 0,
      multiplier = 1.3
    });
  }

  [HttpPost("move/{deviceId}")]
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
}

public class JoinQueueRequest
{
  public string DeviceId { get; set; } = string.Empty;
}
