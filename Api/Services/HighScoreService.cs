using System.Text;
using System.Text.Json;
using ass_di_stroid_frontend.Api.Models;

namespace ass_di_stroid_frontend.Api.Services;

public interface IHighScoreService
{
  Task<bool> SubmitScoreAsync(string teamName, int score);
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
}
