using System.Text;
using System.Text.Json;
using ass_di_stroid_frontend.Api.Models;

namespace ass_di_stroid_frontend.Api.Services;

public class NextTeamInfo
{
  public string TeamName { get; set; } = string.Empty;
  public int Score { get; set; }
}

public interface IHighScoreService
{
  Task<bool> SubmitScoreAsync(string teamName, int score);
  Task<NextTeamInfo?> GetNextTeamAsync(int currentScore);
}

public class HighScoreService : IHighScoreService
{
  private readonly HttpClient _httpClient;
  private readonly ILogger<HighScoreService> _logger;
  private readonly string _apiBaseUrl;

  public HighScoreService(HttpClient httpClient, ILogger<HighScoreService> logger, IConfiguration configuration)
  {
    _httpClient = httpClient;
    _logger = logger;
    _apiBaseUrl = configuration["HighScoreApi:BaseUrl"] ?? "localhost:8080";
  }

  public async Task<bool> SubmitScoreAsync(string teamName, int score)
  {
    try
    {
      // API expects snake_case parameter names
      var url = $"{_apiBaseUrl}/api/TeamScore/set-teamscore?team_name={Uri.EscapeDataString(teamName)}&score={score}";
      var response = await _httpClient.PostAsync(url, null);

      if (response.IsSuccessStatusCode)
      {
        _logger.LogInformation("Successfully submitted score {Score} for team {TeamName}", score, teamName);
        return true;
      }
      else
      {
        var responseBody = await response.Content.ReadAsStringAsync();
        _logger.LogWarning("Failed to submit score. Status code: {StatusCode}, Team: {TeamName}, Score: {Score}, Response: {Response}",
            response.StatusCode, teamName, score, responseBody);
        return false;
      }
    }
    catch (Exception ex)
    {
      _logger.LogError(ex, "Error submitting score for team {TeamName} with score {Score}", teamName, score);
      return false;
    }
  }

  public async Task<NextTeamInfo?> GetNextTeamAsync(int currentScore)
  {
    try
    {
      var url = $"{_apiBaseUrl}/api/TeamScore/get-next-team?current_score={currentScore}";
      var response = await _httpClient.GetAsync(url);

      if (response.IsSuccessStatusCode)
      {
        var json = await response.Content.ReadAsStringAsync();
        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;

        return new NextTeamInfo
        {
          TeamName = root.GetProperty("team_name").GetString() ?? "Unknown",
          Score = root.GetProperty("score").GetInt32()
        };
      }
      else
      {
        _logger.LogWarning("Failed to get next team. Status code: {StatusCode}", response.StatusCode);
        return null;
      }
    }
    catch (Exception ex)
    {
      _logger.LogError(ex, "Error getting next team for score {Score}", currentScore);
      return null;
    }
  }
}
