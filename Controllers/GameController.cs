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

    var (success, stateInfo) = _queueService.Heartbeat(request.DeviceId);

    return Ok(new
    {
      success,
      state = stateInfo.State,
      score = stateInfo.Score,
      multiplier = stateInfo.Multiplier,
      phase = stateInfo.Phase,
      teamName = stateInfo.TeamName
    });
  }

  [HttpPost("move")]
  public IActionResult Move([FromBody] MoveRequest request)
  {
    if (request == null || string.IsNullOrWhiteSpace(request.DeviceId))
    {
      return BadRequest(new { success = false, message = "Device ID is required" });
    }

    var (success, message) = _queueService.Move(request.DeviceId, request.IsMoving);

    return Ok(new
    {
      success,
      message,
      deviceId = request.DeviceId
    });
  }
}

public class DeviceIdBody
{
  public string DeviceId { get; set; } = string.Empty;
}

public class MoveRequest
{
  public string DeviceId { get; set; } = string.Empty;
  public bool IsMoving { get; set; }
}

