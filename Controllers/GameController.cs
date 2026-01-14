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
  public IActionResult JoinQueuePost([FromBody] DeviceIdBody request)
  {
    if (request == null || string.IsNullOrWhiteSpace(request.DeviceId))
    {
      return BadRequest(new { success = false, message = "Device ID is required" });
    }

    var (success, direction, _) = _queueService.JoinQueue(request.DeviceId);

    return Ok(new
    {
      success,
      direction = direction?.ToString().ToLower(),
      state = "inQueue"
    });
  }

  [HttpPost("heartbeat")]
  public IActionResult Heartbeat([FromBody] DeviceIdBody request)
  {
    if (request == null || string.IsNullOrWhiteSpace(request.DeviceId))
    {
      return BadRequest(new { success = false, message = "Device ID is required" });
    }

    var (success, _) = _queueService.Heartbeat(request.DeviceId);

    return Ok(new
    {
      success,
      state = "inQueue",
      score = 0,
      multiplier = 1.3
    });
  }

  [HttpPost("move")]
  public IActionResult Move([FromBody] DeviceIdBody request)
  {
    if (request == null || string.IsNullOrWhiteSpace(request.DeviceId))
    {
      return BadRequest(new { success = false, message = "Device ID is required" });
    }

    return Ok(new
    {
      success = true,
      deviceId = request.DeviceId
    });
  }
}

public class DeviceIdBody
{
  public string DeviceId { get; set; } = string.Empty;
}

